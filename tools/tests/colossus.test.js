// node --test tools/tests/colossus.test.js
// The Colossus (the final boss of the Colossus level) on the real server (no Supabase): its two-fisted slam (colossus-swing, then colossus-hit one wind-up later, with a shock that
// reaches what is built round the impact), its footsteps (colossus-step, alternating feet), and that it walks in at wave 20 of the level it belongs to (and nowhere else).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const T = { brood: 12, colossus: 15 };

async function withServer(fn, extraEnv) {
    const port = 4100 + Math.floor(Math.random() * 30);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0', PERF: '', ...extraEnv }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

// opts.sandbox (default true); opts.vote: the level to vote for when the vote comes up (a normal PvE match)
async function client(base, nick, opts = {}) {
    const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise(r => s.on('connect', r));
    s.emit('authenticate', { nickname: nick, token: lj.token });
    const c = { s, ev: {}, at: {}, zombies: [], me: null, hp: null };
    for (const name of ['colossus-swing', 'colossus-hit', 'colossus-step', 'struct-add', 'struct-hp', 'countdown-start', 'pve-diff']) s.on(name, (d) => { (c.ev[name] = c.ev[name] || []).push(d); (c.at[name] = c.at[name] || []).push(Date.now()); });
    if (opts.vote) s.on('pve-vote-start', () => s.emit('pve-vote', { id: opts.vote }));
    s.on('gs2', (d) => {
        const z = d[3], out = [];
        for (let i = 0; i + 5 < z.length; i += 6) out.push([z[i], z[i + 5]]);
        c.zombies = out;
        if (d[1].length >= 6) { c.me = { x: d[1][1] / 4, y: d[1][2] / 4 }; c.hp = d[1][4]; }
        s.emit('input', { seq: 1, dx: 0, dy: 0, angle: 0, shooting: false });
    });
    s.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, weapon: 'smg', mode: 'pve', sandbox: opts.sandbox !== false, xp: 0, proto: ARNet.PROTO });
    await new Promise(r => s.once('room-created', r));
    s.emit('start-game');
    for (let i = 0; i < 80 && !c.ev['countdown-start']; i++) await sleep(100);
    await sleep(3900);   // the 3-2-1
    return c;
}
const countOf = (c, idx) => c.zombies.filter(z => z[1] === idx).length;

test('the Colossus swings: the blow lands at the END of the wind-up (0.9 s), on the first barricade (id 0) and with a shock that says how far it reaches', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'col_a');
        const px = c.me.x, py = c.me.y;
        let wy = py;
        for (const dy of [0, -130, 130, -260, 260]) {   // (a tree may stand where the first try goes: take the first free place)
            c.s.emit('place-struct', { x: px + 130, y: py + dy, o: 1 });
            await sleep(300);
            if (c.ev['struct-add']) { wy = py + dy; break; }
        }
        assert.equal(c.ev['struct-add'] && c.ev['struct-add'][0].id, 0, 'the first barricade has id 0');
        c.s.emit('sandbox-spawn', { type: 'colossus', x: px + 130 + 17 + 60 + 6, y: wy });   // right up against the wall
        for (let i = 0; i < 80 && !(c.ev['colossus-hit'] && c.ev['colossus-hit'].length >= 1); i++) await sleep(100);
        const sw = c.ev['colossus-swing'] || [], ht = c.ev['colossus-hit'] || [];
        assert.ok(sw.length >= 1 && ht.length >= 1, 'it swings and the blow lands: ' + sw.length + ' swings, ' + ht.length + ' hits');
        assert.equal(sw[0].ms, 900, 'the client is told the length of the wind-up');
        const gap = c.at['colossus-hit'][0] - c.at['colossus-swing'][0];
        assert.ok(gap >= 840 && gap <= 1050, 'the hit comes about one wind-up (900 ms) after the swing began: ' + gap + ' ms');
        assert.equal(ht[0].miss, false);
        assert.equal(ht[0].r, 120, 'and the shock reaches 120');
        const rows = (c.ev['struct-hp'] || []).flat().filter(r => r[0] === 0);
        assert.ok(rows.some(r => r[1] <= 300 - 140), 'barricade 0 took the blow (140): ' + JSON.stringify(rows));
        c.s.close();
    });
});

test('the Colossus walks on with heavy steps: colossus-step comes every ~58 units, alternating feet', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'col_b');
        c.s.emit('sandbox-spawn', { type: 'colossus', x: c.me.x + 500, y: c.me.y });
        for (let i = 0; i < 160 && !(c.ev['colossus-step'] && c.ev['colossus-step'].length >= 3); i++) await sleep(100);
        const st = c.ev['colossus-step'] || [];
        assert.ok(st.length >= 3, 'three footsteps: ' + st.length);
        assert.notEqual(st[0].s, st[1].s, 'left, then right');
        assert.equal(st[0].s, st[2].s);
        const gap = c.at['colossus-step'][1] - c.at['colossus-step'][0];
        assert.ok(gap >= 1800 && gap <= 3600, 'a step about every 2.6 s (58 units at 22 a second): ' + gap + ' ms');
        c.s.close();
    });
});

test('wave 20 of the Colossus level: the Colossus walks in with the first batch (and not the Brood Mother)', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'col_w20', { sandbox: false });   // nobody votes: the level is Colossus
        for (let i = 0; i < 200 && !countOf(c, T.colossus); i++) await sleep(100);   // the first batch comes after the 8 s of grace
        assert.equal(countOf(c, T.colossus), 1, 'one Colossus');
        assert.equal(countOf(c, T.brood), 0);
        c.s.close();
    }, { PVE_VOTE_MS: '0', PVE_FIRST_WAVE: '20' });
});

test('wave 20 of the Brood Mother level has the Brood Mother and no Colossus; the Reaper level has neither', async () => {
    for (const [level, want] of [['brood', T.brood], ['reaper', null]]) {
        await withServer(async (base) => {
            const c = await client(base, 'col_' + level, { sandbox: false, vote: level });
            for (let i = 0; i < 200 && c.zombies.length < 3; i++) await sleep(100);
            assert.ok(c.zombies.length >= 3, 'the wave came: ' + c.zombies.length);
            assert.equal(countOf(c, T.colossus), 0, 'no Colossus on the ' + level + ' level');
            assert.equal(countOf(c, T.brood), want === T.brood ? 1 : 0);
            c.s.close();
        }, { PVE_FIRST_WAVE: '20' });
    }
});

test('client: the art row, the definition, the card of the sandbox and the three events of the Colossus', () => {
    const art = fs.readFileSync(path.join(__dirname, '../../public/arena-art.js'), 'utf8');
    assert.match(art, /\{ id: 'boss_colossus', view: \[-104, -104, 208, 232\], disc: 61\.5[^\n]*\/\/ 15 /);
    assert.match(art, /typeKey === 15 && drawColossusSprite/);
    assert.match(art, /zdefs\[15\]\) missing \+= warmColossus/);
    const game = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
    assert.match(game, /\{ r: 60, maxHp: 18000, noScale: true, heavy: true, bigBar: true, warn: 'COLOSSUS'[^\n]*\/\/ 15 the Colossus/);
    assert.match(game, /\['colossus', 'Colossus', 'boss_colossus', 1\]/);
    for (const ev of ['colossus-swing', 'colossus-hit', 'colossus-step']) assert.match(game, new RegExp("socket\\.on\\('" + ev + "'"));
    const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    assert.match(server, /colossus: \{ hp: 18000, armor: 6, noScale: true/);
    assert.match(server, /colossus: 15 \};/);
});

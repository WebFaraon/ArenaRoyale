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
const T = { brood: 12, colossus: 15, mini: 16 };

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
    for (const name of ['colossus-swing', 'colossus-hit', 'colossus-step', 'colossus-quake', 'struct-add', 'struct-hp', 'turret-add', 'countdown-start', 'pve-diff', 'pve-subwave']) s.on(name, (d) => { (c.ev[name] = c.ev[name] || []).push(d); (c.at[name] = c.at[name] || []).push(Date.now()); });
    if (opts.vote) s.on('pve-vote-start', () => s.emit('pve-vote', { id: opts.vote }));
    s.on('gs2', (d) => {
        const z = d[3], out = [];
        for (let i = 0; i + 5 < z.length; i += 6) out.push([z[i], z[i + 5], z[i + 1] / 4, z[i + 2] / 4]);   // id, type, x, y
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

test('under half its health the Colossus shakes the ground: a 1.4 s wind-up, then a shock of 420 that hurts the players and what is built, and SLOWS (not stuns) every turret in it for 10 s', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'col_q');
        const px = c.me.x, py = c.me.y;
        for (const dy of [90, -90, 150, -150]) {   // a turret near the player (a tree may stand where the first try goes)
            c.s.emit('place-turret', { x: px + 100, y: py + dy });
            await sleep(300);
            if (c.ev['turret-add']) break;
        }
        assert.ok(c.ev['turret-add'], 'a turret stands');
        const hp0 = c.hp;
        c.s.emit('sandbox-spawn', { type: 'colossus', x: px + 330, y: py, hp: 0.45 });   // under half
        for (let i = 0; i < 40 && !(c.ev['colossus-quake'] && c.ev['colossus-quake'].length); i++) await sleep(100);
        const sw = c.ev['colossus-swing'] || [], ht = c.ev['colossus-hit'] || [], qk = c.ev['colossus-quake'] || [];
        assert.ok(sw.length >= 1 && ht.length >= 1 && qk.length === 1, 'swing, hit and quake: ' + sw.length + ', ' + ht.length + ', ' + qk.length);
        assert.equal(sw[0].ms, 1400, 'the wind-up of the quake is 1.4 s');
        const gap = c.at['colossus-hit'][0] - c.at['colossus-swing'][0];
        assert.ok(gap >= 1340 && gap <= 1600, 'the quake lands at the end of it: ' + gap + ' ms');
        assert.equal(ht[0].r, 420);
        assert.equal(qk[0].ms, 10000, 'slowed for ten seconds');
        assert.ok(qk[0].ids.includes(c.ev['turret-add'][0].id), 'the turret is in the list of the slowed');
        assert.ok(c.hp < hp0, 'the player in the shock lost health: ' + hp0 + ' -> ' + c.hp);
        await sleep(6000);
        assert.equal(c.ev['colossus-quake'].length, 1, 'it does it once');
        c.s.close();
    });
});

test('under a quarter of its health the Colossus calls eight small colossi: from the edge of the map, from different sides, not beside it', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'col_call');
        c.s.emit('sandbox-spawn', { type: 'colossus', x: c.me.x + 400, y: c.me.y, hp: 0.2 });   // under a quarter: the quake first, then the call
        for (let i = 0; i < 80 && countOf(c, T.mini) < 8; i++) await sleep(100);
        const minis = c.zombies.filter(z => z[1] === T.mini), boss = c.zombies.find(z => z[1] === T.colossus);
        assert.equal(minis.length, 8, 'eight small colossi');
        assert.ok(boss, 'and the Colossus');
        assert.ok((c.ev['colossus-quake'] || []).length === 1, 'the quake came first, once');
        // the base is at (1300, 1300): they stand far from it (the edge), far from the Colossus, and on every side of it (an angle round the base for each, no two in the same slice of 45 degrees)
        const slices = new Set();
        for (const m of minis) {
            assert.ok(Math.hypot(m[2] - 1300, m[3] - 1300) > 800, 'from the edge, not beside the boss: ' + Math.round(Math.hypot(m[2] - 1300, m[3] - 1300)));
            slices.add(Math.floor(((Math.atan2(m[3] - 1300, m[2] - 1300) + Math.PI) / (Math.PI * 2)) * 8));
        }
        assert.ok(slices.size >= 6, 'from different sides of the map: ' + slices.size + ' of 8 slices');
        c.s.close();
    });
});

test('wave 20 of the Colossus level: the Colossus is the LAST sub-wave (alone, after all the others), not in the first batch', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'col_w20', { sandbox: false });   // nobody votes: the level is Colossus
        for (let i = 0; i < 200 && !c.zombies.length; i++) await sleep(100);   // the first batch comes after the 8 s of grace
        assert.ok(c.zombies.length > 0, 'the first batch is there');
        assert.equal(countOf(c, T.colossus), 0, 'and the Colossus is not in it');
        for (let i = 0; i < 400 && !countOf(c, T.colossus); i++) await sleep(100);
        assert.equal(countOf(c, T.colossus), 1, 'one Colossus, later');
        assert.equal(countOf(c, T.brood), 0);
        const subs = c.ev['pve-subwave'] || [];
        assert.ok(subs.length >= 5, 'it came after several sub-waves: ' + subs.length);
        c.s.close();
    }, { PVE_VOTE_MS: '0', PVE_FIRST_WAVE: '20', PVE_BATCH_DELAY: '1' });
});

test('wave 20 of the Brood Mother level: the Brood Mother comes last too, no Colossus; the Reaper level has neither', async () => {
    for (const [level, want] of [['brood', T.brood], ['reaper', null]]) {
        await withServer(async (base) => {
            const c = await client(base, 'col_' + level, { sandbox: false, vote: level });
            for (let i = 0; i < 200 && c.zombies.length < 3; i++) await sleep(100);
            assert.ok(c.zombies.length >= 3, 'the wave came: ' + c.zombies.length);
            assert.equal(countOf(c, T.brood), 0, 'not in the first batch');
            for (let i = 0; i < 300 && want && !countOf(c, want); i++) await sleep(100);
            if (!want) await sleep(22000);   // the Reaper level: the last sub-wave has come by now and there is no boss in it
            assert.equal(countOf(c, T.colossus), 0, 'no Colossus on the ' + level + ' level');
            assert.equal(countOf(c, T.brood), want === T.brood ? 1 : 0);
            c.s.close();
        }, { PVE_FIRST_WAVE: '20', PVE_BATCH_DELAY: '1' });
    }
});

test('client: the art row, the definition, the card of the sandbox and the three events of the Colossus', () => {
    const art = fs.readFileSync(path.join(__dirname, '../../public/arena-art.js'), 'utf8');
    assert.match(art, /\{ id: 'boss_colossus', view: \[-104, -104, 208, 232\], disc: 61\.5[^\n]*\/\/ 15 /);
    assert.match(art, /typeKey === 15 && drawColossusSprite/);
    assert.match(art, /zdefs\[15\]\) missing \+= warmColossus/);
    const game = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
    assert.match(game, /\{ r: 60, maxHp: 30000, noScale: true, heavy: true, bigBar: true, warn: 'COLOSSUS'[^\n]*\/\/ 15 the Colossus/);
    assert.match(game, /\{ r: 27, maxHp: 500, noScale: true, heavy: true[^\n]*\/\/ 16 a small colossus/);
    assert.match(game, /_drawGroundFx\(ctx, performance\.now\(\)\);\s*\n\s*\n\s*\/\/ --- OBSTACOLE ---/, 'the cracks and rings of a blow are drawn on the ground, before the obstacles');
    assert.match(art, /typeKey === 16 && drawMiniColossusSprite/);
    assert.match(game, /\['colossus', 'Colossus', 'boss_colossus', 1\]/);
    for (const ev of ['colossus-swing', 'colossus-hit', 'colossus-step']) assert.match(game, new RegExp("socket\\.on\\('" + ev + "'"));
    const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    assert.match(server, /colossus: \{ hp: 30000, armor: 6, noScale: true/);
    assert.match(server, /splash: \{ r: 120, sdmg: 45, pdmg: 50 \}/);
    assert.match(server, /minicolossus: \{ hp: 500, noScale: true[^\n]*baseDmg: 20/);
    assert.match(server, /t\.cd = Math\.min\(0, t\.cd\) \+ tier\.cd \* \(t\.slowUntil > now \? t\.slowMul \|\| 1 : 1\)/);
    assert.match(server, /minicolossus: 16 \};/);
});

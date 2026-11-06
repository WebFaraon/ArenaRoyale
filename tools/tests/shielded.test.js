// node --test tools/tests/shielded.test.js
// The shielded zombie, animated in pieces: its bash with the shield on the real server (no Supabase): shielded-swing (a 0.45 s wind-up), then shielded-hit one wind-up later with the damage,
// a cycle of 1.2 s; it never hurts a player; and its pieces (public/images/zombies/shielded) are up to date and stack into the whole picture.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const T = { shielded: 8 };

async function withServer(fn, extraEnv) {
    const port = 4150 + Math.floor(Math.random() * 30);
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
    for (const name of ['shielded-swing', 'shielded-hit', 'struct-add', 'struct-hp', 'countdown-start']) s.on(name, (d) => { (c.ev[name] = c.ev[name] || []).push(d); (c.at[name] = c.at[name] || []).push(Date.now()); });
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

test('the shielded bashes: the swing is announced (450 ms of wind-up), the blow lands at the END of it on the first barricade (50), and the next swing comes 1.2 s after the first', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'shd_a');
        const px = c.me.x, py = c.me.y;
        let wy = py;
        for (const dy of [0, -130, 130, -260, 260]) {   // (a tree may stand where the first try goes: take the first free place)
            c.s.emit('place-struct', { x: px + 130, y: py + dy, o: 1 });
            await sleep(300);
            if (c.ev['struct-add']) { wy = py + dy; break; }
        }
        assert.equal(c.ev['struct-add'] && c.ev['struct-add'][0].id, 0, 'the first barricade has id 0');
        c.s.emit('sandbox-spawn', { type: 'shielded', x: px + 130 + 17 + 24 + 6, y: wy });   // right up against the wall
        for (let i = 0; i < 80 && !(c.ev['shielded-hit'] && c.ev['shielded-hit'].length >= 2); i++) await sleep(100);
        const sw = c.ev['shielded-swing'] || [], ht = c.ev['shielded-hit'] || [];
        assert.ok(sw.length >= 2 && ht.length >= 2, 'it swings and the blows land: ' + sw.length + ' swings, ' + ht.length + ' hits');
        assert.equal(sw[0].ms, 450, 'the client is told the length of the wind-up');
        const gap = c.at['shielded-hit'][0] - c.at['shielded-swing'][0];
        assert.ok(gap >= 400 && gap <= 620, 'the hit comes about one wind-up (450 ms) after the swing began: ' + gap + ' ms');
        assert.equal(ht[0].miss, false);
        const cycle = c.at['shielded-swing'][1] - c.at['shielded-swing'][0];
        assert.ok(cycle >= 1100 && cycle <= 1400, 'a swing about every 1.2 s: ' + cycle + ' ms');
        const rows = (c.ev['struct-hp'] || []).flat().filter(r => r[0] === 0);
        assert.ok(rows.some(r => r[1] <= 300 - 50), 'barricade 0 took the blow (50): ' + JSON.stringify(rows));
        c.s.close();
    });
});

test('the shielded never hurts a player, even one standing against it', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'shd_b');
        const hp0 = c.hp;
        c.s.emit('sandbox-spawn', { type: 'shielded', x: c.me.x + 60, y: c.me.y });
        await sleep(3000);
        assert.ok(c.zombies.some(z => z[1] === T.shielded), 'it is there');
        assert.equal(c.hp, hp0, 'the player was not hurt');
        assert.ok(!(c.ev['shielded-hit'] && c.ev['shielded-hit'].length), 'and it never bashed anything (there is nothing built)');
        c.s.close();
    });
});

test('the shielded exists as separate pieces (both arms, head, shield) in public/images/zombies/shielded: up to date, same viewBox, and stacked they are exactly the whole sprite', () => {
    const B = require('../../tools/catalog/sprites-shielded.js');
    const dir = path.join(__dirname, '../../public/images/zombies/shielded');
    const files = B.shieldedPartFiles();
    for (const n of Object.keys(files)) assert.equal(fs.readFileSync(path.join(dir, n), 'utf8'), files[n], n + ' is up to date: run node tools/catalog/sprites-shielded.js');
    const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const whole = fs.readFileSync(path.join(__dirname, '../../public/images/zombies/zombi_shielded.svg'), 'utf8');
    assert.equal(whole, B.shielded(), 'the whole sprite is up to date');
    const stacked = B.SHIELDED_ORDER.map(k => { const s = fs.readFileSync(path.join(dir, k + '.svg'), 'utf8'); assert.ok(s.includes('viewBox="' + B.SHIELDED_VIEW + '"'), k + ' shares the viewBox'); return inner(s); }).join('');
    assert.equal(stacked, inner(whole), 'the pieces stacked in order give the whole sprite');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'));
    assert.deepEqual(m.order, B.SHIELDED_ORDER);
    for (const k of m.order) assert.ok(Number.isFinite(m.pivots[k].x) && Number.isFinite(m.pivots[k].y), k + ' has a pivot');
    // the pivots the client uses (SHD_SET in arena-art.js) are the ones of parts.json
    const art = fs.readFileSync(path.join(__dirname, '../../public/arena-art.js'), 'utf8');
    const mm = art.match(/SHD_SET\s*=\s*makePieceSet\('shielded', \[([^\]]*)\], (\{[^}]*\})/);
    assert.ok(mm, 'SHD_SET is in arena-art.js');
    assert.deepEqual(mm[1].split(',').map(x => x.trim().replace(/'/g, '')), m.order, 'the same parts in the same order');
    const piv = eval('(' + mm[2] + ')');
    for (const k of m.order) assert.deepEqual(piv[k], [m.pivots[k].x, m.pivots[k].y], 'the pivot of ' + k);
});

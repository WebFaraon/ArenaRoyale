// node --test tools/tests/structures-server.test.js
// The PvE barricades on the real server (no Supabase): what it refuses, and the wave totals the HUD shows. What it accepts needs coins
// from a finished wave, which the unit tests of public/structures.js and the browser runs cover.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withServer(fn) {
    const port = 3980 + Math.floor(Math.random() * 20);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0' }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

// A client in a started PvE room; ev = the events it got, by name
async function pveClient(base, nick) {
    const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise(r => s.on('connect', r));
    s.emit('authenticate', { nickname: nick, token: lj.token });
    const c = { s, ev: {} };
    for (const name of ['pve-wave-start', 'pve-inv', 'struct-result', 'struct-add', 'upgrade-result']) s.on(name, (d) => { (c.ev[name] = c.ev[name] || []).push(d); });
    s.on('gs2', () => s.emit('input', { seq: 1, dx: 0, dy: 0, angle: 0, shooting: false }));
    s.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, weapon: 'smg', mode: 'pve', xp: 0, proto: ARNet.PROTO });
    await new Promise(r => s.once('room-created', r));
    s.emit('start-game');
    for (let i = 0; i < 80 && !c.ev['pve-wave-start']; i++) await sleep(100);   // the countdown (3.7 s), then wave 1
    return c;
}

test('the wave tells the HUD how many zombies it brings: all of them and the ones still to come', async () => {
    await withServer(async (base) => {
        const c = await pveClient(base, 'st_wave');
        const w = c.ev['pve-wave-start'] && c.ev['pve-wave-start'][0];
        assert.ok(w, 'wave 1 started');
        assert.equal(w.wave, 1);
        assert.equal(w.zombies, 8, 'wave 1 = 8 zombies');
        assert.equal(w.queued, 0, 'all 8 come at once');
        c.s.close();
    });
});

test('no barricade in the inventory: placing is refused; nothing to use is refused; buying outside the wave break does nothing', async () => {
    await withServer(async (base) => {
        const c = await pveClient(base, 'st_refuse');
        c.s.emit('place-struct', { x: 1500, y: 1500, o: 0 });
        await sleep(300);
        assert.deepEqual(c.ev['struct-result'].pop(), { ok: false, action: 'place', reason: 'none' });
        c.s.emit('use-struct', { id: 99 });
        await sleep(300);
        assert.deepEqual(c.ev['struct-result'].pop(), { ok: false, action: 'use', reason: 'gone' });
        c.s.emit('buy-upgrade', { type: 'barricade' });
        await sleep(300);
        assert.equal(c.ev['pve-inv'], undefined, 'no purchase during a wave');
        assert.equal(c.ev['struct-add'], undefined);
        c.s.close();
    });
});

test('rubbish in place-struct / use-struct does not hurt the server', async () => {
    await withServer(async (base) => {
        const c = await pveClient(base, 'st_junk');
        for (const d of [null, 5, 'x', {}, { x: 'a', y: {} }, { x: NaN, y: Infinity, o: 7 }, { id: {} }]) { c.s.emit('place-struct', d); c.s.emit('use-struct', d); }
        await sleep(500);
        const r = await fetch(`${base}/api/build`);
        assert.ok(r.ok, 'the server still answers');
        c.s.close();
    });
});

// node --test tools/tests/ammo-server.test.js
// The classic magazine on the real server: a client in a Battle Royale room fires, reloads (R and automatic), and the own row of
// the state packet tells it the rounds in the magazine, the reload and the reserve. Spawns server.js on a spare port (no Supabase).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');
const WEAPONS = require('../../public/data/weapons.json').weapons;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withServer(fn) {
    const port = 3960 + Math.floor(Math.random() * 20);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0' }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

// A client in a started Battle Royale room with `weapon`. own = the latest own row [ammo, max, reload, ack, coins, reserve].
async function player(base, weapon, nick) {
    const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise(r => s.on('connect', r));
    s.emit('authenticate', { nickname: nick, token: lj.token });
    const c = { s, own: null, rows: [], seq: 0, aim: 0 };
    s.on('gs2', (pk) => { c.own = pk[7]; c.rows.push({ t: Date.now(), row: pk[7].slice(), bullets: pk[2].length / 6 }); c.send(); });
    c.hold = false; c.reload = false;
    c.send = () => { const m = { seq: ++c.seq, dx: 0, dy: 0, angle: 0, shooting: c.hold, sdx: c.hold ? 0 : 0, sdy: c.hold ? 1 : 0 }; if (c.reload) { m.reload = true; c.reload = false; } s.emit('input', m); };
    s.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, weapon, mode: 'br', xp: 0, proto: ARNet.PROTO });
    await new Promise(r => s.once('room-created', r));
    s.emit('start-game');
    for (let i = 0; i < 80 && !(c.own && Date.now() > 0); i++) await sleep(100);
    await sleep(4200);   // the countdown (3.7 s)
    return c;
}
const reloadOf = (row) => row[2] > 0;

test('a new match starts with a full magazine and a full reserve (weapons.json)', async () => {
    await withServer(async (base) => {
        const c = await player(base, 'smg', 'am_start');
        const w = WEAPONS.smg;
        assert.deepEqual([c.own[0], c.own[1], c.own[2], c.own[5]], [w.ammoMax, w.ammoMax, 0, w.reserveStart]);
        c.s.close();
    });
});

test('holding the trigger empties the magazine, reloads by itself, and fires again with the reserve smaller by the magazine', async () => {
    await withServer(async (base) => {
        const w = WEAPONS.smg;
        const c = await player(base, 'smg', 'am_auto');
        c.hold = true;
        // until the magazine is empty and the reload runs
        let t0 = Date.now();
        while (Date.now() - t0 < 6000 && !(c.own[0] === 0 && reloadOf(c.own))) await sleep(20);
        assert.equal(c.own[0], 0, 'the magazine emptied');
        assert.ok(reloadOf(c.own), 'the reload started by itself');
        const startedAt = Date.now();
        while (Date.now() - startedAt < 4000 && !(c.own[0] > 0)) await sleep(20);
        const took = (Date.now() - startedAt) / 1000;
        assert.ok(c.own[0] > 0, 'the reload ended');
        assert.ok(Math.abs(took - w.reload.seconds) < 0.5, 'reload took ' + took + ' s, expected ' + w.reload.seconds);
        // no shot left while it reloaded: the magazine stayed at 0 although the trigger was held
        const during = c.rows.filter(r => r.t > startedAt + 100 && r.t < startedAt + w.reload.seconds * 1000 - 300);
        assert.ok(during.length > 10, 'rows during the reload: ' + during.length);
        assert.ok(during.every(r => r.row[0] === 0 && reloadOf(r.row)), 'nothing fired during the reload');
        // the trigger is still held: it fires again at once, so the magazine starts to go down; the reserve paid for the reload
        await sleep(200);
        assert.ok(c.own[0] < w.ammoMax, 'it fires again');
        assert.equal(c.own[5], w.reserveStart - w.ammoMax, 'the reserve gave one magazine');
        c.s.close();
    });
});

test('R fills only what is missing, from the reserve, and does nothing with a full magazine', async () => {
    await withServer(async (base) => {
        const w = WEAPONS.assault;   // Vanguard: 24 rounds, 96 in the reserve, 2.2 s
        const c = await player(base, 'assault', 'am_r');
        c.reload = true; await sleep(300);
        assert.equal(c.own[2], 0, 'R with a full magazine does nothing');
        c.hold = true; await sleep(900); c.hold = false; await sleep(200);
        const left = c.own[0];
        assert.ok(left < w.ammoMax && left > 0, 'fired a few: ' + left);
        c.reload = true;
        const t0 = Date.now();
        while (Date.now() - t0 < 1000 && !reloadOf(c.own)) await sleep(20);
        assert.ok(reloadOf(c.own), 'R started the reload');
        while (Date.now() - t0 < 5000 && reloadOf(c.own)) await sleep(20);
        assert.equal(c.own[0], w.ammoMax, 'the magazine is full again');
        assert.equal(c.own[5], w.reserveStart - (w.ammoMax - left), 'only the missing rounds left the reserve');
        c.s.close();
    });
});

test('Falcon: one burst of 3 costs 3 rounds of a 30-round magazine', async () => {
    await withServer(async (base) => {
        const w = WEAPONS.burst;
        assert.equal(w.ammoMax, 30);
        const c = await player(base, 'burst', 'am_burst');
        // a short press: one burst (3 bullets, 0.1 s apart), then release before the next (cooldown 0.6 s)
        c.hold = true; await sleep(60); c.hold = false;
        await sleep(700);
        assert.equal(c.own[0], 27, 'one burst = 27 left');
        c.s.close();
    });
});

// node --test tools/tests/netproto.test.js
// The state packet, protocol 2: packing/unpacking, the per-client assembly (byte for byte what the msgpack parser
// would produce), a real socket.io round trip, its size, and the version check of the real server.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { Server } = require('socket.io');
const msgpackParser = require('socket.io-msgpack-parser');
const notepack = require('notepack.io');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const ARNet = require('../../public/netproto');
const { createGsWriter } = require('../../server-gs');

const typeIdx = { normal: 0, runner: 1, tank: 2 };
function world(nPlayers, nBullets, nZombies) {
    const players = [], bullets = [], zombies = [];
    for (let i = 0; i < nPlayers; i++) players.push({ slot: i, x: 100.37 + i * 83.21, y: 2500.9 - i * 61.7, angle: -3.14 + i * 0.2, hp: 470 - i, kills: i % 7, alive: i % 5 !== 0, ammo: 8 - (i % 9), ammoMax: 10, reloading: i % 3 === 0, reloadProgress: (i % 10) / 10, lastAckSeq: 90000 + i, coins: i * 2 });
    for (let i = 0; i < nBullets; i++) bullets.push({ id: 5000 + i, x: 40.6 + i * 100.33, y: 1300.1 + i * 7.9, dx: -934.4 + i * 91, dy: 357.2 - i * 33, os: i % Math.max(1, nPlayers) });
    for (let i = 0; i < nZombies; i++) zombies.push({ id: i, x: 500.26 + i * 40.1, y: 800.74, angle: 2.5 - i * 0.7, hp: 100 - i * 3, type: ['normal', 'runner', 'tank'][i % 3], alive: i % 4 !== 3 });
    return { players, bullets, zombies, kits: [{ id: 3, x: 640.4, y: 210.6, spawnTime: 1000 }], zone: { r: 1234.6, waitTimer: 17.83 }, room: { mode: 'br', base: null } };
}
function sharedOf(w) {
    const P = [], B = [], Z = [], K = [];
    ARNet.packPlayers(P, w.players); ARNet.packBullets(B, w.bullets, false); ARNet.packZombies(Z, w.zombies, typeIdx); ARNet.packKits(K, w.kits, 11000);
    return [4242, P, B, Z, K, ARNet.packZone(w.zone), ARNet.packPve(w.room)];
}

test('players, bullets, zombies, zone and own row survive the trip with quarter-pixel precision', () => {
    const w = world(12, 9, 8), sh = sharedOf(w), seen = [];
    ARNet.eachPlayer(sh[1], (slot, x, y, angle, hp, alive, kills) => seen.push({ slot, x, y, angle, hp, alive, kills }));
    assert.equal(seen.length, 12);
    w.players.forEach((p, i) => {
        assert.equal(seen[i].slot, p.slot);
        assert.ok(Math.abs(seen[i].x - p.x) <= 0.125 + 1e-9 && Math.abs(seen[i].y - p.y) <= 0.125 + 1e-9, 'position within 1/8 px');
        assert.ok(Math.abs(seen[i].angle - p.angle) <= 0.0005 + 1e-9);
        assert.equal(seen[i].hp, Math.round(p.hp)); assert.equal(seen[i].alive, p.alive ? 1 : 0); assert.equal(seen[i].kills, p.kills);
    });
    const slotToId = w.players.map(p => 'sock' + p.slot), bl = ARNet.bullets(sh[2], slotToId, 6);
    assert.equal(bl.length, 9);
    bl.forEach((b, i) => { assert.equal(b.id, w.bullets[i].id); assert.equal(b.ownerId, 'sock' + w.bullets[i].os); assert.ok(Math.abs(b.x - w.bullets[i].x) <= 0.125 + 1e-9); assert.equal(b.dx, Math.round(w.bullets[i].dx)); });
    const live = w.zombies.filter(z => z.alive);
    assert.equal(sh[3].length, live.length * 6, 'only live zombies');
    assert.equal(sh[3][1] / ARNet.PQ, Math.round(live[0].x * 4) / 4);
    assert.deepEqual(sh[5], [1235, 178]); assert.equal(sh[6], null);
    const o = ARNet.own(ARNet.packOwn(w.players[3]), {});   // slot 3: reloading, progress 0.3
    assert.equal(o.ammo, w.players[3].ammo); assert.equal(o.max, 10); assert.equal(o.reloading, true); assert.ok(Math.abs(o.reloadProgress - 0.3) < 0.011); assert.equal(o.ack, 90003); assert.equal(o.coins, 6);
    const o2 = ARNet.own(ARNet.packOwn(w.players[1]), {}); assert.equal(o2.reloading, false); assert.equal(o2.reloadProgress, 1);
    assert.deepEqual(ARNet.packPve({ mode: 'pve', base: { hp: 912.4, maxHp: 1000 }, pveWave: 3, pveWaveBreak: true, pveBreakTimer: 12.34 }), [912, 1000, 3, 1, 123]);
});

test('the per-client assembly is byte for byte what the msgpack parser produces', () => {
    const wr = createGsWriter(notepack, 7);
    assert.equal(wr.fast, true, 'the fast path is on for this socket.io / notepack');
    const fakeSock = { client: { conn: { readyState: 'open' }, writeToEngine(buf) { this.out = buf; } } };
    for (const [np, nb, nz] of [[1, 0, 0], [10, 8, 8], [30, 21, 38], [80, 200, 60]]) {
        const w = world(np, nb, nz), sh = sharedOf(w), own = ARNet.packOwn(w.players[0]);
        const shared = wr.begin(sh);
        wr.send(fakeSock, shared, own);
        const want = notepack.encode({ type: 2, data: [ARNet.EVENT, sh.concat([own])], nsp: '/' });
        assert.ok(want.equals(fakeSock.client.out), `${np} players, ${nb} bullets, ${nz} zombies`);
    }
});

test('a real socket.io client receives the assembled packet as a normal gs2 event', async () => {
    const srv = http.createServer(), ioS = new Server(srv, { parser: msgpackParser, transports: ['websocket'] });
    await new Promise(r => srv.listen(0, r));
    const wr = createGsWriter(notepack, 7), w = world(10, 8, 8), sh = sharedOf(w), own = ARNet.packOwn(w.players[2]);
    const cl = Client('http://127.0.0.1:' + srv.address().port, { parser: msgpackParser, transports: ['websocket'], forceNew: true });
    const got = new Promise(r => cl.on(ARNet.EVENT, (...args) => r(args)));
    ioS.on('connection', s => { wr.send(s, wr.begin(sh), own); });
    const args = await got;
    assert.equal(args.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(args[0])), JSON.parse(JSON.stringify(sh.concat([own]))));
    cl.close(); ioS.close(); srv.close();
});

test('the fallback (a layout the fast path does not know) still delivers the same event', async () => {
    const odd = { encode: v => notepack.encode(v) , decode: notepack.decode };
    const realEncode = notepack.encode; let first = true;
    const lying = { encode(v) { const b = realEncode(v); if (first && v && v.type === 2) { first = false; return Buffer.concat([b, Buffer.from([0])]); } return b; } };
    const wr = createGsWriter(lying, 7);
    assert.equal(wr.fast, false);
    const emitted = []; const sock = { emit: (ev, arg) => emitted.push([ev, arg]) };
    const w = world(3, 2, 1), sh = sharedOf(w), own = ARNet.packOwn(w.players[0]);
    wr.send(sock, wr.begin(sh), own);
    assert.equal(emitted[0][0], ARNet.EVENT); assert.equal(emitted[0][1].length, 8);
});

test('size of the packet one client receives (protocol 1 was 1071 / 2879 bytes at these sizes)', () => {
    const wr = createGsWriter(notepack, 7), fakeSock = { client: { conn: { readyState: 'open' }, writeToEngine(b) { this.out = b; } } };
    const sizeOf = (np, nb, nz) => { const w = world(np, nb, nz), sh = sharedOf(w); wr.send(fakeSock, wr.begin(sh), ARNet.packOwn(w.players[0])); return fakeSock.client.out.length; };
    const s10 = sizeOf(10, 8, 8), s30 = sizeOf(30, 21, 8);
    assert.ok(s10 < 450, '10 players, 8 bullets: ' + s10 + ' B');
    assert.ok(s30 < 1000, '30 players, 21 bullets: ' + s30 + ' B');
    console.log(`  gs2 sizes: 10 players / 8 bullets / 8 zombies ${s10} B, 30 / 21 / 8 ${s30} B`);
});

test('the real server refuses a client on another protocol and accepts the right one', async () => {
    const port = 3990 + Math.floor(Math.random() * 9);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0' }, stdio: 'ignore' });
    try {
        let up = false; for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
        assert.ok(up, 'server started');
        const lj = await (await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'proto_t', password: 'x' }) })).json();
        const s = Client(`http://127.0.0.1:${port}`, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
        await new Promise(r => s.on('connect', r));
        s.emit('authenticate', { nickname: 'proto_t', token: lj.token });
        const events = []; s.on('proto-mismatch', v => events.push(['mismatch', v])); s.on('room-error', m => events.push(['error', m])); s.on('room-created', () => events.push(['created']));
        const data = { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, mode: 'br', xp: 0 };
        s.emit('create-room', data);                                  // no proto: an old page
        s.emit('create-room', { ...data, proto: 1 });
        await new Promise(r => setTimeout(r, 400));
        assert.deepEqual(events.map(e => e[0]), ['mismatch', 'error', 'mismatch', 'error'], JSON.stringify(events));
        assert.equal(events[0][1], ARNet.PROTO);
        events.length = 0;
        s.emit('create-room', { ...data, proto: ARNet.PROTO });
        await new Promise(r => setTimeout(r, 400));
        assert.deepEqual(events.map(e => e[0]), ['created']);
        s.close();
    } finally { child.kill(); }
});

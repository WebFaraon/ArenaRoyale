// node --test tools/tests/match-end.test.js
// The end of a match, on the real server (no Supabase) and in the sources of the client:
//  - every finished match tells the end board about its chest (match-chest: a chest, "none", or "this match earns none"),
//  - the room of a finished match is NOT closed 60 s after the end while somebody can still be on the board (it used to send game-reset, and the page reloaded to the login),
//  - the client ignores game-reset once the match is over, and its "CONNECTION LOST" watchdog stays quiet then.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const game = fs.readFileSync(path.join(ROOT, 'public', 'game.js'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

test('client: game-reset after the end of the match does not reload the page; the connection watchdog is off then', () => {
    const h = game.slice(game.indexOf("socket.on('game-reset'"));
    assert.match(h.slice(0, 200), /_arMatchOver\) return;/);
    for (const ev of ["socket.on('winner'", "socket.on('pve-end'", "socket.on('game-ended'"]) {
        const i = game.indexOf(ev); assert.ok(i > 0, ev);
        assert.match(game.slice(i, i + 160), /window\._arMatchOver = true/, ev);
    }
    assert.match(game, /lastGameStateTime > 0 && !window\._arMatchOver && /);
    assert.match(game.slice(game.indexOf("socket.on('game-start'"), game.indexOf("socket.on('game-start'") + 120), /_arMatchOver = false/);
});
test('server: a finished room stays long enough for the end board (not 60 s)', () => {
    assert.ok(!/closeRoom\(code, room\); \}, 60000\)/.test(server), 'no 60 s close any more');
    assert.match(server, /ENDED_ROOM_MS = .*30 \* 60 \* 1000/);
});
test('the end board says why there is no chest, and the lobby brings a won chest in with a flight', () => {
    const ui = fs.readFileSync(path.join(ROOT, 'public', 'lobby-ui.js'), 'utf8');
    assert.match(ui, /NO CHEST/); assert.match(ui, /d\.notEligible/); assert.match(ui, /function onLobbyShown/);
    assert.match(game, /LobbyUI\.onLobbyShown\(\)/);
});

async function withServer(fn) {
    const port = 4200 + Math.floor(Math.random() * 30);
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0', PVE_VOTE_MS: '0', PVE_FIRST_WAVE: '20', PVE_BATCH_DELAY: '0.1', ENDED_ROOM_MS: '2500' }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

test('a PvE match that ends in defeat: the board gets its match-chest, and the room closing later does not cut the player off', { timeout: 150000 }, async () => {
    await withServer(async (base) => {
        const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'end_a', password: 'x' }) })).json();
        const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
        await new Promise(r => s.on('connect', r));
        s.emit('authenticate', { nickname: 'end_a', token: lj.token });
        const got = {}; let disconnected = false;
        for (const n of ['pve-end', 'match-chest', 'game-reset']) s.on(n, d => { got[n] = { at: Date.now(), d }; });
        s.on('disconnect', () => { disconnected = true; });
        s.on('gs2', () => s.emit('input', { seq: 1, dx: 0, dy: 0, angle: 0, shooting: false }));
        s.emit('create-room', { skin: 'rookie', weapon: 'smg', mode: 'pve', sandbox: false, xp: 0, proto: ARNet.PROTO });
        await new Promise(r => s.once('room-created', r));
        s.emit('start-game');
        for (let i = 0; i < 1400 && !got['pve-end']; i++) await sleep(100);
        assert.ok(got['pve-end'], 'the match ended');
        for (let i = 0; i < 40 && !got['match-chest']; i++) await sleep(100);
        assert.ok(got['match-chest'], 'the board is told about the chest (a chest, or none)');
        const m = got['match-chest'].d;
        assert.equal(m.mode, 'pve');
        assert.ok(m.chest || m.none, 'a chest or an honest "none": ' + JSON.stringify(m));
        if (m.chest) assert.ok(m.chest.type && m.slot >= 0);
        for (let i = 0; i < 60 && !got['game-reset']; i++) await sleep(100);   // the (shortened) timer closes the empty-handed room
        assert.ok(!disconnected, 'the socket is still connected: the client keeps the board');
        s.close();
    });
});

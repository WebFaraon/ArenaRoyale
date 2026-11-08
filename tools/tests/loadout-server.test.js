// node --test tools/tests/loadout-server.test.js
// No points to spend: on the real server every player starts a match with 450 HP, whatever the gun, character or what the page sends, and walks at the speed
// of the gun in hand (weapons.json: loadout.spd, 3.1 is the standard; units a tick, x60 a second). Damage is the gun's loadout.dmg. Spawns server.js (no Supabase).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');
const DATA = require('../../public/data/weapons.json');
const WEAPONS = DATA.weapons;

const sleep = ms => new Promise(r => setTimeout(r, ms));
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
async function meta(base, weapon, nick, mode, extra = {}) {
    const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise(r => s.on('connect', r));
    s.emit('authenticate', { nickname: nick, token: lj.token });
    s.emit('create-room', { skin: 'rookie', weapon, mode, xp: 0, proto: ARNet.PROTO, ...extra });
    await new Promise(r => s.once('room-created', r));
    const started = new Promise(r => s.once('game-start', r));
    s.emit('start-game');
    const gs = await started;
    s.close();
    return Object.values(gs.playersMeta)[0];
}

test('weapons.json: 450 HP for everybody, the standard speed is 3.1 and no gun is faster than that; every gun has its damage and speed, no points', () => {
    assert.equal(DATA.rules.playerHp, 450); assert.equal(DATA.rules.baseSpeed, 3.1);
    for (const [id, w] of Object.entries(WEAPONS)) {
        assert.deepEqual(Object.keys(w.loadout).sort(), ['dmg', 'spd'], id + ': nothing about points or per-point growth is left');
        assert.ok(w.loadout.dmg > 0 && w.loadout.spd > 0 && w.loadout.spd <= 3.1, id);
    }
    // the speeds the player asked for: smg and pistol 2.9 (a little slower), the sniper 2.3
    assert.equal(WEAPONS.smg.loadout.spd, 2.9); assert.equal(WEAPONS.pistol.loadout.spd, 2.9); assert.equal(WEAPONS.sniper.loadout.spd, 2.3);
    assert.ok(WEAPONS.sniper.loadout.spd < WEAPONS.assault.loadout.spd && WEAPONS.assault.loadout.spd < WEAPONS.smg.loadout.spd, 'the heavier the gun, the slower');
});

test('on the real server: 450 HP and the speed of the gun in hand, in Battle Royale and in PvE, whatever stats the page sends', async () => {
    await withServer(async base => {
        let i = 0;
        for (const id of Object.keys(WEAPONS)) {
            const m = await meta(base, id, 'ld_' + (i++), 'br', { stats: { hp: 10, dmg: 0, spd: 0 } });   // an old page sending points: ignored
            assert.equal(m.maxHp, 450, id + ' HP'); assert.ok(Math.abs(m.speed - WEAPONS[id].loadout.spd * 60) < 1e-9, id + ' speed ' + m.speed);
        }
        const p = await meta(base, 'sniper', 'ld_pve', 'pve', { stats: { hp: 0, dmg: 10, spd: 10 } });
        assert.equal(p.maxHp, 450); assert.ok(Math.abs(p.speed - 2.3 * 60) < 1e-9);
    });
});

// node --test tools/tests/sandbox.test.js
// The PvE sandbox (a room made with create-room { mode: 'pve', sandbox: true }) and the Brood Mother, on the real server (no Supabase):
// no waves, the stock of buildings, a zombie of any type where it is asked for, the controls, and the Brood Mother throwing her eggs and the eggs hatching.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TYPE_IDX = { normal: 0, brood: 12, egg: 13, hatchling: 14 };

async function withServer(fn, extraEnv) {
    const port = 4020 + Math.floor(Math.random() * 20);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0', PERF: '', ...extraEnv }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

// A client in a started sandbox room: c.zombies = the zombies of the last state packet as [id, typeIndex]; c.ev = the events by name
async function sandboxClient(base, nick, opts = {}) {
    const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise(r => s.on('connect', r));
    s.emit('authenticate', { nickname: nick, token: lj.token });
    const c = { s, ev: {}, at: {}, baseAt: {}, baseHp: null, zombies: [], start: null };
    for (const name of ['pve-wave-start', 'pve-inv', 'sandbox-state', 'egg-throw', 'egg-hatch', 'countdown-start', 'pve-vote-start', 'brood-swing', 'brood-hit', 'struct-add', 'struct-hp']) s.on(name, (d) => { (c.ev[name] = c.ev[name] || []).push(d); (c.at[name] = c.at[name] || []).push(Date.now()); if ((name === 'brood-swing' || name === 'brood-hit') && c.baseAt[name] === undefined) c.baseAt[name] = c.baseHp; });
    s.on('game-start', (d) => { c.start = d; });
    s.on('gs2', (d) => {
        const z = d[3], out = [];
        for (let i = 0; i + 5 < z.length; i += 6) out.push([z[i], z[i + 5]]);
        c.zombies = out;
        if (d[6]) c.baseHp = d[6][0];
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

test('a sandbox room: no vote, no waves, the match tells the client it is a sandbox, and every building is in stock', async () => {
    await withServer(async (base) => {
        const c = await sandboxClient(base, 'sbx_a');
        assert.ok(c.start && c.start.sandbox === true && c.start.mode === 'pve', 'game-start says: sandbox');
        assert.ok(!c.ev['pve-vote-start'], 'no vote of the level');
        await sleep(1500);
        assert.ok(!c.ev['pve-wave-start'], 'no wave ever starts');
        const inv = c.ev['pve-inv'] && c.ev['pve-inv'][c.ev['pve-inv'].length - 1];
        assert.ok(inv, 'the stock was sent');
        for (const k of ['barricade', 'turret', 'tesla', 'bomb', 'flame', 'heal', 'support']) assert.ok(inv[k] >= 50, k + ' is in stock');
        c.s.close();
    });
});

test('a normal PvE room is not a sandbox, and sandbox-spawn does nothing there', async () => {
    await withServer(async (base) => {
        const c = await sandboxClient(base, 'sbx_n', { sandbox: false });
        assert.equal(c.start.sandbox, false);
        c.s.emit('sandbox-spawn', { type: 'normal', x: 1500, y: 1500, n: 3 });
        await sleep(500);
        assert.ok(c.ev['pve-wave-start'], 'a real wave started');
        assert.equal(c.zombies.length, 0, 'and the request put nothing on the map (the first batch of the wave is still waiting)');
        c.s.close();
    }, { PVE_VOTE_MS: '0' });
});

test('sandbox-spawn puts the zombies where asked, every type exists, and CLEAR / FREEZE work', async () => {
    await withServer(async (base) => {
        const c = await sandboxClient(base, 'sbx_b');
        c.s.emit('sandbox-spawn', { type: 'normal', x: 1400, y: 1200, n: 3 });
        c.s.emit('sandbox-spawn', { type: 'nope', x: 1400, y: 1200 });   // an unknown type is refused
        await sleep(400);
        assert.equal(c.zombies.length, 3, 'three normal zombies, nothing for the unknown type');
        assert.ok(c.zombies.every(z => z[1] === TYPE_IDX.normal));
        for (const t of ['runner', 'tank', 'spitter', 'exploder', 'brute', 'summoner', 'minion', 'shielded', 'screamer', 'ghoul', 'stalker', 'hatchling']) c.s.emit('sandbox-spawn', { type: t, x: 1600, y: 1400 });
        await sleep(400);
        assert.equal(c.zombies.length, 3 + 12, 'one of each of the other types');
        c.s.emit('sandbox-ctl', { action: 'freeze' });
        await sleep(300);
        assert.deepEqual(c.ev['sandbox-state'][0], { freeze: true });
        c.s.emit('sandbox-ctl', { action: 'clear' });
        await sleep(400);
        assert.equal(c.zombies.length, 0, 'CLEAR ZOMBIES took them all');
        c.s.close();
    });
});

test('the Brood Mother: she walks on throwing eggs round her, and an egg left alone hatches into hatchlings', async () => {
    await withServer(async (base) => {
        const c = await sandboxClient(base, 'sbx_c');
        c.s.emit('sandbox-spawn', { type: 'brood', x: 2600, y: 1500 });
        await sleep(400);
        assert.equal(countOf(c, TYPE_IDX.brood), 1, 'she is there');
        for (let i = 0; i < 70 && !(c.ev['egg-throw'] && c.ev['egg-throw'].length >= 4); i++) await sleep(100);   // the first throw at ~4 s: four eggs
        assert.ok(c.ev['egg-throw'] && c.ev['egg-throw'].length >= 4, 'four eggs thrown');
        const t = c.ev['egg-throw'][0];
        assert.ok(Math.hypot(t.x1 - t.x0, t.y1 - t.y0) <= 200, 'they land near her (within ~160 of where she stands)');
        await sleep(1000);
        assert.ok(countOf(c, TYPE_IDX.egg) >= 1, 'eggs lie on the ground (zombies of the egg type)');
        c.s.emit('sandbox-ctl', { action: 'clear' });
        await sleep(300);
        c.s.emit('sandbox-spawn', { type: 'egg', x: 1500, y: 1500 });
        await sleep(400);
        assert.equal(countOf(c, TYPE_IDX.egg), 1);
        for (let i = 0; i < 110 && !c.ev['egg-hatch']; i++) await sleep(100);   // 8 s
        assert.ok(c.ev['egg-hatch'], 'the egg hatched');
        await sleep(300);
        assert.equal(countOf(c, TYPE_IDX.egg), 0, 'the egg is gone');
        assert.equal(countOf(c, TYPE_IDX.hatchling), 2, 'two hatchlings came out');
        c.s.close();
    });
});

test('client: the sandbox cards are rebuilt for every match (built once per page they talked to the first match: pick a zombie, click, nothing), and no ammo is spent', () => {
    const fs = require('node:fs');
    const client = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
    assert.match(client, /let _sbxBuilt = false/);
    assert.match(client, /if \(!_sbxBuilt\) \{\s*_sbxBuilt = true; list\.textContent = '';/);
    assert.match(client, /if \(!_sandbox\) ARAmmo\.spend\(ammoState, 1\)/);
    const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    assert.match(server, /if \(room\.sandbox\) for \(const p of room\._playerArr\) \{ if \(p\.coins < SANDBOX_COINS\)[^\n]*p\.ammo = p\.ammoMax/);
    assert.match(server, /brood: \{ hp: 12000,/);
});

test('the Brood Mother\'s blow is a swing: the damage lands at the END of the wind-up (brood-hit), not when she starts to raise her arms (brood-swing)', async () => {
    await withServer(async (base) => {
        const c = await sandboxClient(base, 'sbx_sw');
        // right next to the base (its radius 85 + hers 56): she is in reach at once
        c.s.emit('sandbox-spawn', { type: 'brood', x: 1300 + 150, y: 1300 });
        for (let i = 0; i < 60 && !(c.ev['brood-hit'] && c.ev['brood-hit'].length >= 2); i++) await sleep(100);
        const sw = c.ev['brood-swing'] || [], ht = c.ev['brood-hit'] || [];
        assert.ok(sw.length >= 1 && ht.length >= 2, 'she swings and the blows land: ' + sw.length + ' swings, ' + ht.length + ' hits');
        assert.equal(sw[0].ms, 700, 'the client is told the length of the wind-up');
        const gap = c.at['brood-hit'][0] - c.at['brood-swing'][0];
        assert.ok(gap >= 640 && gap <= 850, 'the hit comes about one wind-up (700 ms) after the swing began: ' + gap + ' ms');
        assert.equal(c.baseAt['brood-swing'], 1500, 'at the start of the swing the base is whole');
        await sleep(300);
        assert.ok(c.baseHp <= 1500 - 110, 'after the hit the base lost her blow (110): ' + c.baseHp);
        const gap2 = c.at['brood-swing'][1] - c.at['brood-swing'][0];
        assert.ok(gap2 >= 1500 && gap2 <= 1800, 'a swing every attackCd (1.6 s): ' + gap2 + ' ms');
        c.s.close();
    });
});

test('the Brood Mother hits the FIRST barricade built (id 0) too, and a hatchling pressed against a player does hurt them', async () => {
    await withServer(async (base) => {
        const c = await sandboxClient(base, 'sbx_id0');
        const px = c.me.x, py = c.me.y;
        let wy = py;
        for (const dy of [0, -130, 130, -260, 260]) {   // (a tree may stand where the first try goes: take the first free place)
            c.s.emit('place-struct', { x: px + 130, y: py + dy, o: 1 });
            await sleep(300);
            if (c.ev['struct-add']) { wy = py + dy; break; }
        }
        assert.equal(c.ev['struct-add'] && c.ev['struct-add'][0].id, 0, 'the first barricade has id 0');
        c.s.emit('sandbox-spawn', { type: 'brood', x: px + 130 + 17 + 56 + 6, y: wy });   // right up against the wall (she would otherwise be free to walk round it)
        for (let i = 0; i < 80 && !(c.ev['struct-hp'] && c.ev['struct-hp'].length); i++) await sleep(100);
        assert.ok(c.ev['struct-hp'] && c.ev['struct-hp'].some(rows => rows.some(r => r[0] === 0 && r[1] < 300)), 'barricade 0 lost health to her blow');
        c.s.emit('sandbox-ctl', { action: 'clear' });
        await sleep(300);
        const hp0 = c.hp;
        for (let k = 0; k < 3; k++) c.s.emit('sandbox-spawn', { type: 'hatchling', x: px + 80 + k * 10, y: py });
        for (let i = 0; i < 40 && !(c.hp < hp0); i++) await sleep(100);
        assert.ok(c.hp < hp0, 'hatchlings against the player take health from them: ' + hp0 + ' -> ' + c.hp);
        c.s.close();
    });
});

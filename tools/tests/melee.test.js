// node --test tools/tests/melee.test.js
// The blows of the first three zombies (normal, runner, tank) on the real server (no Supabase, the Sandbox): a blow is a swing. The `melee` event (once a tick) says a wind-up began (sw) and,
// one wind-up later, that the damage landed (hit: 0 a miss, 1 a player, 2 something built, 3 the base). The damage comes WITH the hit, not with the start of the swing; the zombies still
// hit as often as before (attackCd is the whole cycle); the tank never hits a player. And the client and the server agree on how long each wind-up is.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withServer(fn) {
    const port = 4300 + Math.floor(Math.random() * 30);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0', PERF: '' }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

async function client(base, nick) {
    const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise(r => s.on('connect', r));
    s.emit('authenticate', { nickname: nick, token: lj.token });
    const c = { s, ev: {}, melee: [], zombies: [], me: null, hpLog: [], hpRows: [] };
    for (const name of ['struct-add', 'struct-hp', 'countdown-start']) s.on(name, (d) => { (c.ev[name] = c.ev[name] || []).push(d); if (name === 'struct-hp') for (const r of d) c.hpRows.push({ at: Date.now(), id: r[0], hp: r[1] }); });
    s.on('melee', (d) => { c.melee.push({ at: Date.now(), sw: d.sw, hit: d.hit }); });
    s.on('gs2', (d) => {
        const z = d[3], out = [];
        for (let i = 0; i + 5 < z.length; i += 6) out.push([z[i], z[i + 5], z[i + 1] / 4, z[i + 2] / 4]);   // id, type, x, y
        c.zombies = out;
        if (d[1].length >= 6) { c.me = { x: d[1][1] / 4, y: d[1][2] / 4 }; c.hpLog.push({ at: Date.now(), hp: d[1][4] }); }
        s.emit('input', { seq: 1, dx: 0, dy: 0, angle: 0, shooting: false });
    });
    s.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, weapon: 'smg', mode: 'pve', sandbox: true, xp: 0, proto: ARNet.PROTO });
    await new Promise(r => s.once('room-created', r));
    s.emit('start-game');
    for (let i = 0; i < 80 && !c.ev['countdown-start']; i++) await sleep(100);
    await sleep(3900);   // the 3-2-1
    return c;
}
const swings = (c, id) => c.melee.flatMap(m => m.sw.filter(z => z === id).map(() => m.at));
const hits = (c, id) => c.melee.flatMap(m => { const out = []; for (let i = 0; i < m.hit.length; i += 2) if (m.hit[i] === id) out.push({ at: m.at, kind: m.hit[i + 1] }); return out; });

async function playerBlow(typeIdx, typeName, windupMs, dmg) {
    await withServer(async (base) => {
        const c = await client(base, 'melee_' + typeName);
        const px = c.me.x, py = c.me.y;
        c.s.emit('sandbox-spawn', { type: typeName, x: px + 38, y: py });   // right up against the player
        let zid = null;
        for (let i = 0; i < 30 && zid === null; i++) { await sleep(100); const z = c.zombies.find(q => q[1] === typeIdx); if (z) zid = z[0]; }
        assert.notEqual(zid, null, 'the zombie is in the packet');
        for (let i = 0; i < 70 && hits(c, zid).length < 2; i++) await sleep(100);
        const sw = swings(c, zid), ht = hits(c, zid);
        assert.ok(sw.length >= 2 && ht.length >= 2, `${typeName} swings and hits twice: ${sw.length} swings, ${ht.length} hits`);
        assert.equal(ht[0].kind, 1, 'the first blow lands on the player');
        const gap = ht[0].at - sw[0];
        assert.ok(gap >= windupMs - 60 && gap <= windupMs + 110, `${typeName}: the hit comes one wind-up (${windupMs} ms) after the swing began: ${gap} ms`);
        // the health: it does not drop when the swing starts, it drops (by the zombie's damage) when the blow lands
        const full = c.hpLog.filter(h => h.at < sw[0] - 150).map(h => h.hp).pop();
        const before = c.hpLog.filter(h => h.at > sw[0] + 20 && h.at < ht[0].at - 40).map(h => h.hp);
        assert.ok(before.length > 0 && before.every(h => h === full), `${typeName}: the player is untouched during the wind-up (${full} -> ${JSON.stringify(before.slice(0, 5))})`);
        const after = c.hpLog.filter(h => h.at >= ht[0].at - 40 && h.at < ht[0].at + 120).map(h => h.hp);
        assert.ok(after.some(h => h <= full - dmg + 0.01), `${typeName}: the damage (${dmg}) lands with the hit: ${full} -> ${JSON.stringify(after.slice(0, 6))}`);
        c.s.close();
    });
}

test('the normal zombie: a swing of 280 ms, the damage (20) lands with the hit on the player', async () => { await playerBlow(0, 'normal', 280, 20); });
test('the runner: a swing of 200 ms, the damage (10) lands with the hit on the player', async () => { await playerBlow(1, 'runner', 200, 10); });

test('the tank: a swing of 550 ms on a barricade, 35 only when it lands, and it never hits the player next to it', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'melee_tank');
        const px = c.me.x, py = c.me.y;
        let wy = py;
        for (const dy of [0, -130, 130, -260, 260]) {
            c.s.emit('place-struct', { x: px + 130, y: py + dy, o: 1 });
            await sleep(300);
            if (c.ev['struct-add']) { wy = py + dy; break; }
        }
        const sid = c.ev['struct-add'] && c.ev['struct-add'][0].id;
        assert.equal(sid, 0, 'a barricade stands');
        c.s.emit('sandbox-spawn', { type: 'tank', x: px + 130 + 17 + 28 + 4, y: wy });   // up against the wall
        let zid = null;
        for (let i = 0; i < 30 && zid === null; i++) { await sleep(100); const z = c.zombies.find(q => q[1] === 2); if (z) zid = z[0]; }
        for (let i = 0; i < 80 && hits(c, zid).length < 1; i++) await sleep(100);
        const sw = swings(c, zid), ht = hits(c, zid);
        assert.ok(sw.length >= 1 && ht.length >= 1, 'it swings and the blow lands');
        assert.equal(ht[0].kind, 2, 'on something built');
        const gap = ht[0].at - sw[0];
        assert.ok(gap >= 490 && gap <= 660, `one wind-up (550 ms) after the swing began: ${gap} ms`);
        const rows = c.hpRows.filter(r => r.id === sid);
        assert.ok(!rows.some(r => r.at < sw[0] + 450 && r.hp < 300), 'the barricade is whole during the wind-up: ' + JSON.stringify(rows));
        assert.ok(rows.some(r => r.hp <= 300 - 35), 'it took the blow (35): ' + JSON.stringify(rows));
        await sleep(2200);
        assert.ok(c.hpLog.every(h => h.hp >= c.hpLog[0].hp - 0.01), 'the tank does not hit a player');
        c.s.close();
    });
});

test('the client knows the same wind-ups as the server (so the arms come down when the damage lands)', () => {
    const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
    const game = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'game.js'), 'utf8');
    const want = { normal: 0.28, runner: 0.2, tank: 0.55 }, idx = { normal: 0, runner: 1, tank: 2 };
    const defs = game.slice(game.indexOf('const _ZB_DEFS = ['), game.indexOf('const FOOT_STEPS'));
    const rows = defs.split('\n').filter(l => /^\s*\{ r: /.test(l));
    for (const t of Object.keys(want)) {
        const m = new RegExp(t + ':\\s*\\{[^\\n]*(?:\\n[^\\n]*)?swing: \\{ ev: \'melee\', batch: true, windup: ([0-9.]+)').exec(server);
        assert.ok(m && +m[1] === want[t], `server: ${t} windup ${m && m[1]}`);
        const row = rows[idx[t]];
        const c = /swing: \{ windup: ([0-9]+), recover: ([0-9]+) \}/.exec(row);
        assert.ok(c && +c[1] === Math.round(want[t] * 1000), `client: ${t} windup ${c && c[1]}`);
    }
});

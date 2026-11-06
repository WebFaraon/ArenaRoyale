// node --test tools/tests/spawn-warn.test.js
// spawn-warn on the real server (no Supabase): about 0.9 s before a batch of PvE zombies comes in, the clients are told where (the ground ripples there). The zombies come
// at the same moment as ever, exactly in the places that were announced, with the types that were announced, and every batch (the first after the grace, the later
// ones after PVE_BATCH_DELAY) has its warning.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withServer(fn, extraEnv) {
    const port = 4200 + Math.floor(Math.random() * 30);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0', PERF: '', ...extraEnv }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

test('every batch is announced ~0.9 s ahead, and arrives on time in the announced places', async () => {
    await withServer(async (base) => {
        const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'warn_a', password: 'x' }) })).json();
        const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
        await new Promise(r => s.on('connect', r));
        s.emit('authenticate', { nickname: 'warn_a', token: lj.token });
        const warns = [], seen = new Set(), arrivals = [];
        s.on('spawn-warn', (d) => warns.push({ at: Date.now(), ms: d.ms, rows: d.rows }));
        s.on('gs2', (d) => {
            const z = d[3], fresh = [];
            for (let i = 0; i + 5 < z.length; i += 6) { if (!seen.has(z[i])) { seen.add(z[i]); fresh.push({ id: z[i], x: z[i + 1] / 4, y: z[i + 2] / 4, type: z[i + 5] }); } }
            if (fresh.length) arrivals.push({ at: Date.now(), fresh });
            s.emit('input', { seq: 1, dx: 0, dy: 0, angle: 0, shooting: false });
        });
        s.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, weapon: 'smg', mode: 'pve', xp: 0, proto: ARNet.PROTO });
        await new Promise(r => s.once('room-created', r));
        s.emit('start-game');
        for (let i = 0; i < 400 && arrivals.length < 3; i++) await sleep(100);   // grace 8 s + the 3-2-1, then a batch every 2 s
        assert.ok(arrivals.length >= 3 && warns.length >= 3, `three batches came and were announced: ${arrivals.length} arrivals, ${warns.length} warnings`);
        for (let b = 0; b < 3; b++) {
            const w = warns[b], a = arrivals[b];
            assert.equal(w.rows.length % 3, 0);
            assert.equal(w.rows.length / 3, a.fresh.length, `batch ${b}: as many places as zombies`);
            const lead = a.at - w.at;
            assert.ok(lead >= 600 && lead <= 1150, `batch ${b}: the warning leads by about 0.9 s: ${lead} ms (the event said ${w.ms})`);
            assert.ok(w.ms <= 900 && w.ms >= 0, 'it says how long is left');
            // each zombie that came is in one of the announced places, of the announced type (it has had a moment to walk, ~10 units)
            const left = [];
            for (let i = 0; i < w.rows.length; i += 3) left.push({ x: w.rows[i], y: w.rows[i + 1], type: w.rows[i + 2] });
            for (const z of a.fresh) {
                const k = left.findIndex(r => r.type === z.type && Math.hypot(r.x - z.x, r.y - z.y) < 60);
                assert.ok(k >= 0, `batch ${b}: zombie ${z.id} (type ${z.type}) at ${z.x},${z.y} was announced`);
                left.splice(k, 1);
            }
        }
        s.close();
    }, { PVE_VOTE_MS: '0', PVE_FIRST_WAVE: '5', PVE_BATCH_DELAY: '2' });
});

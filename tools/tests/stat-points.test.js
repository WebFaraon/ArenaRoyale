// node --test tools/tests/stat-points.test.js
// POST /api/profile/stats against the real server.js, with a fake Supabase (PostgREST) on a local port, so nothing
// touches the real database. Covers: a failed update is logged and answered ok:false (it used to answer ok:true),
// a good update is sent with the clamped values, and the validation (range, total, types, password).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');

const HASH = bcrypt.hashSync('secret', 4);

function fakeSupabase(state) {
    return http.createServer((req, res) => {
        let body = ''; req.on('data', d => body += d);
        req.on('end', () => {
            const url = new URL(req.url, 'http://x');
            if (req.method === 'GET' && url.pathname === '/rest/v1/players') {          // select password_hash ... single()
                res.writeHead(200, { 'content-type': 'application/json' });
                return res.end(JSON.stringify({ password_hash: HASH }));
            }
            if (req.method === 'PATCH' && url.pathname === '/rest/v1/players') {         // the stat points update
                state.patches.push(JSON.parse(body || '{}'));
                if (state.columnMissing) {
                    res.writeHead(400, { 'content-type': 'application/json' });
                    return res.end(JSON.stringify({ code: 'PGRST204', details: null, hint: null, message: "Could not find the 'stat_hp' column of 'players' in the schema cache" }));
                }
                res.writeHead(204); return res.end();
            }
            res.writeHead(404); res.end('{}');
        });
    });
}

async function post(port, body) {
    const r = await fetch(`http://127.0.0.1:${port}/api/profile/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
}

test('the stat points route: failure is logged and answered ok:false, success sends clamped values, bad input never reaches the database', async () => {
    const state = { columnMissing: true, patches: [] };
    const fake = fakeSupabase(state); await new Promise(r => fake.listen(0, r));
    const port = 3980 + Math.floor(Math.random() * 9);
    let log = '';
    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port), SUPABASE_URL: 'http://127.0.0.1:' + fake.address().port, SUPABASE_SERVICE_KEY: 'test-key', LAG_LOG: '0' },
    });
    child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
    try {
        let up = false; for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
        assert.ok(up, 'server started');
        const ok = { nickname: 'stat_t', password: 'secret', stat_hp: 3, stat_dmg: 4, stat_spd: 3 };

        // 1. the column is missing in the database: not ok, logged (once, with the migration to run)
        let r = await post(port, ok);
        assert.equal(r.ok, false, 'a failed update must not answer ok:true');
        await post(port, ok);
        assert.equal((log.match(/supabase-migration-stat-points\.sql/g) || []).length, 1, 'the missing-column message is logged once, not on every match');
        assert.equal(state.patches.length, 2);

        // 2. the column exists: ok, and the values are the ones sent
        state.columnMissing = false; state.patches.length = 0;
        r = await post(port, ok);
        assert.equal(r.ok, true);
        assert.equal(state.patches.length, 1);
        assert.deepEqual([state.patches[0].stat_hp, state.patches[0].stat_dmg, state.patches[0].stat_spd], [3, 4, 3]);

        // 3. clamping and types: negative -> 0, above 10 -> 10, text -> 0, decimals are cut
        state.patches.length = 0;
        r = await post(port, { ...ok, stat_hp: 99, stat_dmg: -5, stat_spd: 'abc' });
        assert.equal(r.ok, true); assert.deepEqual([state.patches[0].stat_hp, state.patches[0].stat_dmg, state.patches[0].stat_spd], [10, 0, 0]);
        state.patches.length = 0;
        r = await post(port, { ...ok, stat_hp: 2.9, stat_dmg: '4', stat_spd: null });
        assert.equal(r.ok, true); assert.deepEqual([state.patches[0].stat_hp, state.patches[0].stat_dmg, state.patches[0].stat_spd], [2, 4, 0]);

        // 4. a total over 10, a wrong password and missing fields are refused before the database is written
        state.patches.length = 0;
        r = await post(port, { ...ok, stat_hp: 5, stat_dmg: 5, stat_spd: 1 }); assert.equal(r.ok, false); assert.equal(r.error, 'Total depasit');
        r = await post(port, { ...ok, password: 'wrong' }); assert.equal(r.ok, false);
        r = await post(port, { nickname: 'stat_t' }); assert.equal(r.ok, false);
        assert.equal(state.patches.length, 0, 'nothing written');
    } finally { child.kill(); fake.close(); }
});

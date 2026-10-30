// A fake Supabase (PostgREST) on a local port + a helper that starts the real server.js against it, for the tests.
// Nothing here touches the real database.
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');

// one account, nickname "stat_t", password "secret", with a $2a$10$ hash made by bcryptjs (like every real account)
function makeRow() {
    return {
        id: 'u1', nickname: 'stat_t', password_hash: bcrypt.hashSync('secret', 10), avatar: 'rookie', kills_total: 0, wins_total: 0, games_played: 0, xp: 0, coins: 1000, diamonds: 0,
        unlocked_characters: '["rookie"]', missions_state: null, weapon_stats: {}, owned_weapon_skins: [], equipped_weapon_skins: {}, stat_hp: 0, stat_dmg: 0, stat_spd: 0,
    };
}

function fakeSupabase(state) {
    state.row = state.row || makeRow(); state.patches = state.patches || []; state.passwordReads = 0;
    return http.createServer((req, res) => {
        let body = ''; req.on('data', d => body += d);
        req.on('end', () => {
            const url = new URL(req.url, 'http://x');
            if (req.method === 'GET' && url.pathname === '/rest/v1/players') {
                if (url.searchParams.get('select') === 'id,nickname') state.diagReads = (state.diagReads || 0) + 1;
                if (url.searchParams.get('select') === 'id,nickname' && state.failDiagRead) {
                    res.writeHead(503, { 'content-type': 'application/json' });
                    return res.end(JSON.stringify({ code: 'PGRST000', message: 'unavailable' }));
                }
                if (url.searchParams.get('select') === 'password_hash') state.passwordReads++;
                res.writeHead(200, { 'content-type': 'application/json' });
                return res.end(/object/.test(req.headers.accept || '') ? JSON.stringify(state.row) : JSON.stringify([state.row]));
            }
            if (req.method === 'PATCH' && url.pathname === '/rest/v1/players') {
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

// starts server.js with SUPABASE_URL on the fake; returns { port, log(), stop() }
async function startServer(state, extraEnv = {}, nodeArgs = []) {
    const fake = fakeSupabase(state); await new Promise(r => fake.listen(0, r));
    const port = 3960 + Math.floor(Math.random() * 30);
    let log = '';
    const child = spawn(process.execPath, [...nodeArgs, 'server.js'], {
        cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(port), SUPABASE_URL: 'http://127.0.0.1:' + fake.address().port, SUPABASE_SERVICE_KEY: 'test-key', LAG_LOG: '0', ...extraEnv },
    });
    child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
    let up = false; for (let i = 0; i < 80 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
    if (!up) { child.kill(); fake.close(); throw new Error('server did not start: ' + log); }
    return { port, log: () => log, stop() { child.kill(); fake.close(); } };
}

const post = (port, p, body) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

module.exports = { fakeSupabase, startServer, post, makeRow };

// node --test tools/tests/auth-hash.test.js
// auth-hash.js: native bcrypt, bcryptjs forced, and the real fallback (require('bcrypt') failing) all verify the accounts'
// existing $2a$10$ hashes (made by bcryptjs) and make cost-10 hashes that bcryptjs also verifies; and a login through the
// real server works in each mode.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const bcryptjs = require('bcryptjs');
const { startServer, post } = require('./fake-supabase');

const ROOT = path.join(__dirname, '..', '..');
// a preload that makes require('bcrypt') fail, as on a platform with no prebuilt binary
const BLOCK = path.join(os.tmpdir(), 'block-native-bcrypt.js');
fs.writeFileSync(BLOCK, "const M = require('module'), o = M._load; M._load = function (r) { if (r === 'bcrypt') { const e = new Error(\"Cannot find module 'bcrypt'\"); e.code = 'MODULE_NOT_FOUND'; throw e; } return o.apply(this, arguments); };");

// runs auth-hash.js in a fresh process; prints its log lines and the results of a few checks as JSON on the last line
function run(env = {}, args = []) {
    const code = `
        const A = require('./auth-hash'); const js = require('bcryptjs');
        (async () => {
            const old = js.hashSync('secret', 10);                       // an existing account: $2a$10$
            const fresh = await A.hash('another one');
            console.log(JSON.stringify({ native: A.native, oldOk: await A.compare('secret', old), oldWrong: await A.compare('nope', old),
                freshPrefix: fresh.slice(0, 7), freshVerifiedByJs: js.compareSync('another one', fresh), freshOk: await A.compare('another one', fresh) }));
        })();`;
    const r = spawnSync(process.execPath, [...args, '-e', code], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });
    const so = r.stdout.trim().split('\n');   // the JSON result is the last stdout line; the [Auth] lines are the log
    return { out: (r.stderr + '\n' + so.slice(0, -1).join('\n')).trim(), result: JSON.parse(so[so.length - 1]), status: r.status };
}

test('native bcrypt: existing $2a$10$ hashes verify, new ones are cost 10 and bcryptjs reads them', () => {
    const r = run();
    assert.equal(r.status, 0, r.out);
    assert.equal(r.result.native, true); assert.match(r.out, /\[Auth\] bcrypt nativ activ/);
    assert.equal(r.result.oldOk, true); assert.equal(r.result.oldWrong, false);
    assert.match(r.result.freshPrefix, /^\$2[ab]\$10\$$/); assert.equal(r.result.freshVerifiedByJs, true); assert.equal(r.result.freshOk, true);
});

test('AUTH_BCRYPT=js forces bcryptjs with a log line, same results', () => {
    const r = run({ AUTH_BCRYPT: 'js' });
    assert.equal(r.result.native, false); assert.match(r.out, /\[Auth\] bcrypt nativ dezactivat/);
    assert.equal(r.result.oldOk, true); assert.equal(r.result.oldWrong, false); assert.equal(r.result.freshPrefix, '$2a$10$'); assert.equal(r.result.freshVerifiedByJs, true);
});

test('when require("bcrypt") fails, it falls back to bcryptjs and says so in the log', () => {
    const r = run({}, ['-r', BLOCK]);
    assert.equal(r.status, 0, r.out);
    assert.equal(r.result.native, false);
    assert.match(r.out, /\[Auth\] bcrypt nativ indisponibil, folosesc bcryptjs/);
    assert.equal(r.result.oldOk, true); assert.equal(r.result.oldWrong, false); assert.equal(r.result.freshVerifiedByJs, true);
});

for (const [name, env, args, expectLog] of [
    ['native', {}, [], /bcrypt nativ activ/],
    ['forced bcryptjs', { AUTH_BCRYPT: 'js' }, [], /bcrypt nativ dezactivat/],
    ['fallback (bcrypt cannot be loaded)', {}, ['-r', BLOCK], /bcrypt nativ indisponibil, folosesc bcryptjs/],
]) {
    test(`the real server logs in with a $2a$10$ hash: ${name}; a wrong password is refused`, async () => {
        const srv = await startServer({}, env, args);
        try {
            const good = await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' });
            assert.equal(good.ok, true); assert.ok(good.token);
            const bad = await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'not-it' });
            assert.equal(bad.ok, false);
            assert.match(srv.log(), expectLog);
            assert.ok(!/\bsecret\b/.test(srv.log()) && !srv.log().includes(good.token), 'no password or token in the log');
        } finally { srv.stop(); }
    });
}

const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('socket.io-msgpack-parser');
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('[SLOW]: the bcryptjs fallback is named (route + op), rate limited, and never carries a password or a token', async () => {
    const srv = await startServer({}, { AUTH_BCRYPT: 'js', SLOW_LOG_MS: '5', SLOW_LOG_EVERY_S: '30' });
    try {
        const a = await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' });
        await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' });
        await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'wrong-one' });
        await sleep(200);
        const slow = srv.log().split('\n').filter(l => l.startsWith('[SLOW]'));
        assert.equal(slow.length, 1, 'one line per label per window: ' + JSON.stringify(slow));
        assert.match(slow[0], /^\[SLOW\] POST \/api\/auth\/login bcrypt\.compare \d+ ms \(bcryptjs: blocheaza bucla\)$/);
        assert.ok(!/\bsecret\b|wrong-one/.test(srv.log()) && !srv.log().includes(a.token));
    } finally { srv.stop(); }
});

test('[SLOW]: with native bcrypt a login is not logged (it does not hold the loop); a socket handler over the limit is', async () => {
    const srv = await startServer({}, { SLOW_LOG_MS: '25' });
    try {
        await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' });
        await sleep(200);
        assert.ok(!srv.log().includes('[SLOW] POST /api/auth/login'), 'native login is not a [SLOW] line');
    } finally { srv.stop(); }
    const srv2 = await startServer({}, { SLOW_LOG_MS: '0.0001', SLOW_LOG_EVERY_S: '0.1' });   // every handler is "slow": checks the wrapper
    try {
        const s = Client('http://127.0.0.1:' + srv2.port, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
        await new Promise(r => s.on('connect', r));
        s.emit('c-ping', 1); await sleep(300);
        assert.match(srv2.log(), /\[SLOW\] socket c-ping \d+ ms \(handler\)/);
        s.close();
    } finally { srv2.stop(); }
});

test('[LAG] names the requests around a stall', async () => {
    const srv = await startServer({}, { AUTH_BCRYPT: 'js', LAG_LOG: '1', LAG_LOG_MS: '15', LAG_LOG_EVERY_S: '0.05', SLOW_LOG: '0' });
    try {
        await sleep(1500);                                                     // let the start-up stall pass
        for (let i = 0; i < 4; i++) { await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' }); await sleep(150); }
        await sleep(300);
        assert.match(srv.log(), /\[LAG\] .*near: .*POST \/api\/auth\/login/, srv.log().split('\n').filter(l => l.includes('[LAG]')).join('\n'));
        assert.ok(!/\bsecret\b/.test(srv.log().split('\n').filter(l => l.includes('[LAG]')).join('\n')));
    } finally { srv.stop(); }
});

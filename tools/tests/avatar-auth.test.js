// node --test tools/tests/avatar-auth.test.js
// POST /api/profile/avatar against the real server.js, with a fake Supabase on a local port: the authentication of the route (the session token, no
// password hashing; a wrong or missing token; the password as the safety net for old pages), and the old stat points route is gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, post } = require('./fake-supabase');

test('the HP / DMG / SPD points route is gone: nothing about them is saved any more', async () => {
    const state = {};
    const srv = await startServer(state);
    try {
        const r = await fetch(`http://127.0.0.1:${srv.port}/api/profile/stats`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'stat_t', password: 'secret', stat_hp: 3, stat_dmg: 4, stat_spd: 3 }) });
        assert.notEqual(r.status, 200, 'the route does not exist');
        assert.equal(state.patches.length, 0, 'nothing written');
        const login = await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' });
        assert.equal(login.ok, true);
        assert.ok(!('stat_hp' in login.player) && !('stat_dmg' in login.player) && !('stat_spd' in login.player), 'the login does not carry the points any more');
    } finally { srv.stop(); }
});

test('the avatar route authenticates with the session token (no password hashing); the password still works as the safety net', async () => {
    const state = {};
    const srv = await startServer(state);
    try {
        const login = await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' });
        assert.equal(login.ok, true, 'login with a $2a$10$ hash made by bcryptjs works');
        const token = login.token; assert.ok(typeof token === 'string' && token.length >= 32);
        const body = { nickname: 'stat_t', avatar: 'rookie' };
        const reads = () => state.passwordReads, patches = () => state.patches.length;
        state.patches.length = 0;

        // valid token: saved, and the password hash was never read or compared
        let before = reads();
        let r = await post(srv.port, '/api/profile/avatar', { ...body, token });
        assert.equal(r.ok, true); assert.equal(patches(), 1); assert.equal(reads(), before, 'no password_hash read on the token path');

        // wrong token, a token that is not a string, another account's nickname: refused, nothing written, no hashing
        state.patches.length = 0; before = reads();
        for (const bad of ['0'.repeat(64), 12345, { a: 1 }, ['x'], true]) {
            r = await post(srv.port, '/api/profile/avatar', { ...body, token: bad }); assert.equal(r.ok, false, 'bad token ' + JSON.stringify(bad));
        }
        r = await post(srv.port, '/api/profile/avatar', { ...body, nickname: 'someone_else', token }); assert.equal(r.ok, false, 'a token belongs to one nickname');
        r = await post(srv.port, '/api/profile/avatar', { nickname: 'stat_t', token: 'nope', avatar: 'rookie' }); assert.equal(r.ok, false);
        assert.equal(patches(), 0, 'nothing written'); assert.equal(reads(), before, 'a wrong token never falls through to the password path');

        // no token, valid password: the safety net for old pages (the hash is read and compared)
        r = await post(srv.port, '/api/profile/avatar', { ...body, password: 'secret' });
        assert.equal(r.ok, true); assert.equal(patches(), 1); assert.equal(reads(), before + 1);
        // no token, wrong password / no password at all: refused
        state.patches.length = 0;
        r = await post(srv.port, '/api/profile/avatar', { ...body, password: 'wrong' }); assert.equal(r.ok, false);
        r = await post(srv.port, '/api/profile/avatar', { ...body }); assert.equal(r.ok, false);
        assert.equal(patches(), 0);

        // nothing sensitive reaches the log
        assert.ok(!srv.log().includes(token) && !/\bsecret\b/.test(srv.log()), 'no token or password in the log');
    } finally { srv.stop(); }
});

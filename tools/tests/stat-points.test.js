// node --test tools/tests/stat-points.test.js
// POST /api/profile/stats and /api/profile/avatar against the real server.js, with a fake Supabase on a local port.
// Covers: a failed update is logged and answered ok:false; the clamping/validation; and the authentication of both
// routes: the session token (no password hashing), a wrong or missing token, and the password as the safety net for old pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, post } = require('./fake-supabase');

test('the stat points route: failure is logged and answered ok:false, success sends clamped values, bad input never reaches the database', async () => {
    const state = { columnMissing: true };
    const srv = await startServer(state);
    try {
        const ok = { nickname: 'stat_t', password: 'secret', stat_hp: 3, stat_dmg: 4, stat_spd: 3 };

        // 1. the column is missing in the database: not ok, logged (once, with the migration to run)
        let r = await post(srv.port, '/api/profile/stats', ok);
        assert.equal(r.ok, false, 'a failed update must not answer ok:true');
        await post(srv.port, '/api/profile/stats', ok);
        assert.equal((srv.log().match(/supabase-migration-stat-points\.sql/g) || []).length, 1, 'the missing-column message is logged once, not on every match');
        assert.equal(state.patches.length, 2);

        // 2. the column exists: ok, and the values are the ones sent
        state.columnMissing = false; state.patches.length = 0;
        r = await post(srv.port, '/api/profile/stats', ok);
        assert.equal(r.ok, true);
        assert.deepEqual([state.patches[0].stat_hp, state.patches[0].stat_dmg, state.patches[0].stat_spd], [3, 4, 3]);

        // 3. clamping and types: negative -> 0, above 10 -> 10, text -> 0, decimals are cut
        state.patches.length = 0;
        r = await post(srv.port, '/api/profile/stats', { ...ok, stat_hp: 99, stat_dmg: -5, stat_spd: 'abc' });
        assert.equal(r.ok, true); assert.deepEqual([state.patches[0].stat_hp, state.patches[0].stat_dmg, state.patches[0].stat_spd], [10, 0, 0]);
        state.patches.length = 0;
        r = await post(srv.port, '/api/profile/stats', { ...ok, stat_hp: 2.9, stat_dmg: '4', stat_spd: null });
        assert.equal(r.ok, true); assert.deepEqual([state.patches[0].stat_hp, state.patches[0].stat_dmg, state.patches[0].stat_spd], [2, 4, 0]);

        // 4. a total over 10, a wrong password and missing fields are refused before the database is written
        state.patches.length = 0;
        r = await post(srv.port, '/api/profile/stats', { ...ok, stat_hp: 5, stat_dmg: 5, stat_spd: 1 }); assert.equal(r.ok, false); assert.equal(r.error, 'Total depasit');
        r = await post(srv.port, '/api/profile/stats', { ...ok, password: 'wrong' }); assert.equal(r.ok, false);
        r = await post(srv.port, '/api/profile/stats', { nickname: 'stat_t' }); assert.equal(r.ok, false);
        assert.equal(state.patches.length, 0, 'nothing written');
    } finally { srv.stop(); }
});

test('stats and avatar authenticate with the session token (no password hashing); the password still works as the safety net', async () => {
    const state = {};
    const srv = await startServer(state);
    try {
        const login = await post(srv.port, '/api/auth/login', { nickname: 'stat_t', password: 'secret' });
        assert.equal(login.ok, true, 'login with a $2a$10$ hash made by bcryptjs works');
        const token = login.token; assert.ok(typeof token === 'string' && token.length >= 32);
        const body = { nickname: 'stat_t', stat_hp: 3, stat_dmg: 4, stat_spd: 3 };
        const reads = () => state.passwordReads, patches = () => state.patches.length;
        state.patches.length = 0;

        // valid token: saved, and the password hash was never read or compared
        let before = reads();
        let r = await post(srv.port, '/api/profile/stats', { ...body, token });
        assert.equal(r.ok, true); assert.equal(patches(), 1); assert.equal(reads(), before, 'no password_hash read on the token path');
        before = reads(); state.patches.length = 0;
        r = await post(srv.port, '/api/profile/avatar', { nickname: 'stat_t', token, avatar: 'rookie' });
        assert.equal(r.ok, true); assert.equal(patches(), 1); assert.equal(reads(), before);

        // wrong token, a token that is not a string, another account's nickname: refused, nothing written, no hashing
        state.patches.length = 0; before = reads();
        for (const bad of ['0'.repeat(64), 12345, { a: 1 }, ['x'], true]) {
            r = await post(srv.port, '/api/profile/stats', { ...body, token: bad }); assert.equal(r.ok, false, 'bad token ' + JSON.stringify(bad));
        }
        r = await post(srv.port, '/api/profile/stats', { ...body, nickname: 'someone_else', token }); assert.equal(r.ok, false, 'a token belongs to one nickname');
        r = await post(srv.port, '/api/profile/avatar', { nickname: 'stat_t', token: 'nope', avatar: 'rookie' }); assert.equal(r.ok, false);
        assert.equal(patches(), 0, 'nothing written'); assert.equal(reads(), before, 'a wrong token never falls through to the password path');

        // no token, valid password: the safety net for old pages (the hash is read and compared)
        r = await post(srv.port, '/api/profile/stats', { ...body, password: 'secret' });
        assert.equal(r.ok, true); assert.equal(patches(), 1); assert.equal(reads(), before + 1);
        // no token, wrong password / no password at all: refused
        state.patches.length = 0;
        r = await post(srv.port, '/api/profile/stats', { ...body, password: 'wrong' }); assert.equal(r.ok, false);
        r = await post(srv.port, '/api/profile/stats', { ...body }); assert.equal(r.ok, false);
        r = await post(srv.port, '/api/profile/avatar', { nickname: 'stat_t', avatar: 'rookie' }); assert.equal(r.ok, false);
        assert.equal(patches(), 0);

        // nothing sensitive reaches the log
        assert.ok(!srv.log().includes(token) && !/\bsecret\b/.test(srv.log()), 'no token or password in the log');
    } finally { srv.stop(); }
});

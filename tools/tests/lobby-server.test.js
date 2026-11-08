// node --test --test-concurrency=1 tools/tests/lobby-server.test.js
// Chests, Battle Pass and inbox on the real server.js with a fake Supabase that applies the patches: the session token is needed, a chest and what comes out of it are
// written in ONE update, the time is the real clock (a chest that finished while the player was away opens free), a refusal writes nothing, Battle Pass XP comes
// with a claimed mission, Blast Tier is not sold without the test switch, the inbox gives a reward once.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, post } = require('./fake-supabase');
const Missions = require('../../missions.js');

const HOUR = 3600000;
const lobby = o => JSON.stringify({ slots: [null, null, null, null], nextChest: 10, bp: { xp: 0, blast: false, claimed: { free: [], blast: [] } }, inbox: [], nextMsg: 5, ...o });
const NICK = 'stat_t';

async function setup(state, extraEnv = {}) {
    state.apply = true;
    const srv = await startServer(state, { CHEST_RNG_FIXED: '0', ...extraEnv });
    const login = await post(srv.port, '/api/auth/login', { nickname: NICK, password: 'secret' });
    assert.equal(login.ok, true);
    state.patches.length = 0;   // the login saves today's missions: not what is tested here
    return { srv, token: login.token, login, call: (p, b = {}) => post(srv.port, p, { nickname: NICK, token: login.token, ...b }) };
}

test('login carries the lobby: chests, Battle Pass, inbox, coins and gems', async () => {
    const now = Date.now();
    const state = { row: { ...require('./fake-supabase').makeRow(), lobby_state: lobby({ slots: [{ id: 1, type: 'wooden', got: now, startedAt: null, readyAt: null }, null, null, null] }) } };
    const { srv, login } = await setup(state);
    try {
        const l = login.player.lobby;
        assert.equal(l.slots.length, 4); assert.equal(l.slots[0].type, 'wooden'); assert.equal(l.slots[1], null);
        assert.deepEqual(l.bp, { xp: 0, blast: false, claimed: { free: [], blast: [] } });
        assert.equal(l.coins, 1000); assert.equal(l.diamonds, 0); assert.ok(Math.abs(l.now - now) < 60000, 'the server clock goes with it');
        assert.equal(state.patches.length, 0, 'reading the lobby at login writes nothing');
    } finally { srv.stop(); }
});

test('every route needs the session token', async () => {
    const state = {};
    const { srv, token } = await setup(state);
    try {
        for (const p of ['/api/lobby/state', '/api/chests/start', '/api/chests/open', '/api/battlepass/claim', '/api/battlepass/buy-blast', '/api/inbox/claim', '/api/inbox/read', '/api/inbox/delete']) {
            assert.equal((await post(srv.port, p, { nickname: NICK, slot: 0, instant: true, track: 'free', tier: 1, id: 1 })).ok, false, p + ' without a token');
            assert.equal((await post(srv.port, p, { nickname: NICK, token: 'x'.repeat(64), slot: 0 })).ok, false, p + ' with a wrong token');
            assert.equal((await post(srv.port, p, { nickname: 'someone_else', token })).ok, false, p + ' for another account');
        }
        assert.equal(state.patches.length, 0);
    } finally { srv.stop(); }
});

test('start a chest: the time is real and saved; a second one cannot start; a chest that finished while away opens free, all in one update', async () => {
    const now = Date.now();
    const state = { row: { ...require('./fake-supabase').makeRow(), lobby_state: lobby({ slots: [
        { id: 1, type: 'silver', got: now, startedAt: null, readyAt: null },
        { id: 2, type: 'wooden', got: now, startedAt: now - 3 * HOUR, readyAt: now - 2 * HOUR },   // it finished two hours ago, nobody was connected
        { id: 3, type: 'golden', got: now, startedAt: null, readyAt: null }, null] }) } };
    const { srv, call } = await setup(state);
    try {
        let r = await call('/api/chests/start', { slot: 0 });
        assert.equal(r.ok, true); assert.ok(Math.abs(r.lobby.slots[0].readyAt - (Date.now() + 3 * HOUR)) < 5000);
        assert.equal(state.patches.length, 1); assert.deepEqual(Object.keys(state.patches[0]).sort(), ['lobby_state', 'updated_at'], 'only the lobby state changed');
        r = await call('/api/chests/start', { slot: 2 });
        assert.equal(r.ok, false); assert.match(r.error, /already opening/);
        // the wooden chest is ready (its time ran out): free, coins in, and ONE update with the money and the lobby together
        state.patches.length = 0;
        r = await call('/api/chests/open', { slot: 1 });
        assert.equal(r.ok, true); assert.equal(r.paid, 0); assert.equal(r.type, 'wooden');
        assert.deepEqual(r.cards.map(c => c.kind), ['coins', 'coins']);
        assert.equal(r.lobby.coins, 1000 + r.cards[0].amount + r.cards[1].amount); assert.equal(r.lobby.slots[1], null);
        assert.equal(state.patches.length, 1, 'one update'); assert.ok('coins' in state.patches[0] && 'lobby_state' in state.patches[0]);
        assert.equal(state.row.coins, r.lobby.coins);
        // the one still opening cannot be opened without gems, and nothing is written
        state.patches.length = 0;
        r = await call('/api/chests/open', { slot: 0 }); assert.equal(r.ok, false);
        r = await call('/api/chests/open', { slot: 0, instant: true }); assert.equal(r.ok, false); assert.equal(r.error, 'Not enough gems');
        r = await call('/api/chests/open', { slot: 3 }); assert.equal(r.ok, false);
        r = await call('/api/chests/open', { slot: 'x' }); assert.equal(r.ok, false);
        assert.equal(state.patches.length, 0);
    } finally { srv.stop(); }
});

test('gems skip the wait: the price is taken, the cards are given, a new skin is owned (saved with the rest), and the chest is gone', async () => {
    const now = Date.now();
    const state = { row: { ...require('./fake-supabase').makeRow(), diamonds: 50, lobby_state: lobby({ slots: [{ id: 1, type: 'silver', got: now, startedAt: null, readyAt: null }, null, null, null] }) } };
    const { srv, call } = await setup(state);
    try {
        const r = await call('/api/chests/open', { slot: 0, instant: true });
        assert.equal(r.ok, true); assert.equal(r.paid, 18, '3 h = 18 gems');
        assert.equal(r.lobby.diamonds, 32); assert.equal(r.cards.length, 3);
        const skin = r.cards.find(c => c.kind === 'skin');
        assert.equal(skin.rarity, 'common'); assert.equal(skin.duplicate, 0);
        assert.equal(state.patches.length, 1);
        const list = JSON.parse(state.patches[0].unlocked_characters);
        assert.ok(list.includes('rookie') && list.includes(skin.id), 'the skin is on the account: ' + list);
        assert.ok(r.unlocked_characters.includes(skin.id));
        // the second one is a duplicate now: it turns into coins
        state.row.lobby_state = lobby({ slots: [{ id: 2, type: 'silver', got: now, startedAt: null, readyAt: null }, null, null, null] });
        const again = await call('/api/chests/open', { slot: 0, instant: true });
        const dup = again.cards.find(c => c.kind === 'skin');
        assert.equal(dup.id, skin.id); assert.ok(dup.duplicate > 0, 'a skin that is owned gives coins');
    } finally { srv.stop(); }
});

test('Battle Pass: the XP of a claimed mission is added in one update with its coins; tiers are claimed once; Blast Tier is not sold without the test switch', async () => {
    const state = { row: { ...require('./fake-supabase').makeRow() } };
    const ms = Missions.freshState(NICK); ms.list.forEach(e => { e.prog = 9999; });
    state.row.missions_state = JSON.stringify(ms);
    const { srv, call, login } = await setup(state);
    try {
        const hard = ms.list[5];   // the 'hard' slot: it pays 100 coins or more -> 350 XP
        const r = await call('/api/missions/claim', { missionId: hard.id });
        assert.equal(r.ok, true); assert.equal(r.rewardXp, 350); assert.equal(r.bp.xp, 350);
        const claimPatch = state.patches.find(p => 'lobby_state' in p);
        assert.ok(claimPatch && 'coins' in claimPatch, 'the coins and the XP are written together');
        // three simple missions and the rest: up to tier 2 (1000 XP) -> the free reward of tier 3 is not reachable yet
        let c = await call('/api/battlepass/claim', { track: 'free', tier: 3 }); assert.equal(c.ok, false); assert.equal(c.error, 'Tier not reached yet');
        for (const e of ms.list) if (e.id !== hard.id) await call('/api/missions/claim', { missionId: e.id });
        const st = await call('/api/lobby/state');
        assert.ok(st.lobby.bp.xp >= 900, 'six missions of a day = ' + st.lobby.bp.xp + ' XP');
        // Blast Tier is real money: refused here
        const b = await call('/api/battlepass/buy-blast'); assert.equal(b.ok, false); assert.match(b.error, /not available/);
        c = await call('/api/battlepass/claim', { track: 'blast', tier: 1 }); assert.equal(c.ok, false); assert.equal(c.error, 'Blast Tier is locked');
        assert.equal(JSON.parse(state.row.lobby_state).bp.blast, false);
        // the free tier 1 has no reward; tier 3 needs 2000 XP: put the XP there and claim it once
        const l = JSON.parse(state.row.lobby_state); l.bp.xp = 2500; state.row.lobby_state = JSON.stringify(l);
        const coins0 = (await call('/api/lobby/state')).lobby.coins;
        c = await call('/api/battlepass/claim', { track: 'free', tier: 3 });
        assert.equal(c.ok, true); assert.equal(c.lobby.coins, coins0 + 100);
        c = await call('/api/battlepass/claim', { track: 'free', tier: 3 }); assert.equal(c.ok, false); assert.equal(c.error, 'Already claimed');
        assert.ok(login.player.lobby);
    } finally { srv.stop(); }
});

test('with BLAST_TIER_TEST=1 Blast Tier can be taken, and then its tier 1 gives the exclusive Season skin', async () => {
    const state = { row: { ...require('./fake-supabase').makeRow() } };
    const { srv, call } = await setup(state, { BLAST_TIER_TEST: '1' });
    try {
        const b = await call('/api/battlepass/buy-blast'); assert.equal(b.ok, true); assert.equal(b.lobby.bp.blast, true);
        assert.equal((await call('/api/battlepass/buy-blast')).ok, false, 'not twice');
        const c = await call('/api/battlepass/claim', { track: 'blast', tier: 1 });
        assert.equal(c.ok, true); assert.equal(c.cards[0].id, 'goalkeeper');
        assert.ok(c.unlocked_characters.includes('goalkeeper')); assert.ok(JSON.parse(state.row.unlocked_characters).includes('goalkeeper'));
    } finally { srv.stop(); }
});

test('inbox: a reward is given once, a message is read and deleted, a reward cannot be deleted before it is claimed', async () => {
    const msg = (id, reward) => ({ id, ts: 1, title: 'Gift ' + id, text: 't', reward, claimed: false, read: false });
    const state = { row: { ...require('./fake-supabase').makeRow(), lobby_state: lobby({ inbox: [msg(1, { coins: 300, diamonds: 2 }), msg(2, null)], nextMsg: 3 }) } };
    const { srv, call } = await setup(state);
    try {
        let r = await call('/api/inbox/delete', { id: 1 }); assert.equal(r.ok, false);
        r = await call('/api/inbox/claim', { id: 1 }); assert.equal(r.ok, true); assert.equal(r.lobby.coins, 1300); assert.equal(r.lobby.diamonds, 2);
        r = await call('/api/inbox/claim', { id: 1 }); assert.equal(r.ok, false);
        assert.equal(state.row.coins, 1300);
        r = await call('/api/inbox/read', { id: 2 }); assert.equal(r.ok, true);
        r = await call('/api/inbox/delete', { id: 1 }); assert.equal(r.ok, true);
        r = await call('/api/inbox/delete', { id: 2 }); assert.equal(r.ok, true); assert.deepEqual(r.lobby.inbox, []);
        r = await call('/api/inbox/claim', { id: 2 }); assert.equal(r.ok, false);
        r = await call('/api/inbox/claim', { id: 'x' }); assert.equal(r.ok, false);
    } finally { srv.stop(); }
});

test('without the lobby_state column the chests live in memory and the server says so once; money and everything else still work', async () => {
    const now = Date.now();
    const state = { noLobbyColumn: true, row: { ...require('./fake-supabase').makeRow(), diamonds: 50 } };
    const { srv, call, login } = await setup(state);
    try {
        assert.equal(login.player.lobby.slots.length, 4, 'the lobby is there, empty, from memory');
        assert.equal((srv.log().match(/supabase-migration-lobby-state\.sql/g) || []).length, 1, 'logged once, with the migration to run');
        // the money still goes to the database: 50 gems -> an inbox reward written in memory, claimed: coins reach the row
        const r = await call('/api/lobby/state'); assert.equal(r.ok, true); assert.equal(r.lobby.coins, 1000);
        assert.equal((srv.log().match(/supabase-migration-lobby-state\.sql/g) || []).length, 1, 'still once');
        assert.equal(state.patches.filter(p => 'lobby_state' in p).length, 0, 'nothing is sent to a column that does not exist');
    } finally { srv.stop(); }
});

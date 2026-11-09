// node --test --test-concurrency=1 tools/tests/missions-ext.test.js
// Weekly and season missions (missions.js, /api/missions/*): the rules, and the real server with a fake Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../missions.js');
const Chests = require('../../public/chests.js');
const { startServer, post, makeRow } = require('./fake-supabase');

const lobby = o => JSON.stringify({ slots: [null, null, null, null], nextChest: 10, bp: { xp: 0, blast: false, claimed: { free: [], blast: [] } }, inbox: [], nextMsg: 5, ...o });
const NICK = 'stat_t';
const round = (o = {}) => ({ mode: 'br', rs: { brKills: 0, zKills: 0, pveKills: 0, dmg: 0, kits: 0, wk: {}, pwk: {}, bwk: {} }, isWinner: false, placement: 9, ...o });

test('the week starts on Monday (UTC) and ends seven days later; the day ends at midnight', () => {
    assert.equal(M.weekId('2026-11-09'), '2026-11-09'); assert.equal(M.weekId('2026-11-15'), '2026-11-09'); assert.equal(M.weekId('2026-11-16'), '2026-11-16'); assert.equal(M.weekId('2026-11-01'), '2026-10-26');
    assert.equal(M.weekEndsAt('2026-11-09'), Date.parse('2026-11-16T00:00:00Z')); assert.equal(M.dayEndsAt('2026-11-09'), Date.parse('2026-11-10T00:00:00Z'));
});

test('a week: six missions (two general, two Battle Royale, two PvE), the same for everybody, none that needs a teammate', () => {
    for (const id of ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']) {
        const a = M.pickWeekly(id), b = M.pickWeekly(id);
        assert.deepEqual(a, b, 'deterministic');
        assert.equal(new Set(a.map(e => e.id)).size, 6, 'no mission twice');
        const defs = a.map(e => M.WEEK_POOL.find(m => m.id === e.id));
        assert.deepEqual(defs.map(d => d.slot), ['general', 'general', 'br', 'br', 'pve', 'pve']);
    }
    for (const m of [...M.WEEK_POOL, ...M.SEASON_POOL]) assert.ok(!/revive|teammate/i.test(m.title), m.id + ' must be doable alone');
});

test('every kind of mission pays Battle Pass XP; the chests of the prizes are real chests', () => {
    for (const m of M.WEEK_POOL) assert.ok(m.xp > 0 && m.coins > 0, m.id);
    for (const r of M.WEEK_REWARDS) assert.ok(r.xp > 0 && (r.coins || r.diamonds || r.chest));
    for (const ph of M.SEASON_PHASES) assert.ok(ph.reward.xp > 0 && (ph.reward.coins || ph.reward.diamonds || ph.reward.chest), ph.id);
    for (const r of [...M.WEEK_REWARDS, ...M.SEASON_PHASES.map(p => p.reward)]) if (r.chest) assert.ok(Chests.isType(r.chest), r.chest);
    assert.ok(M.SEASON_PHASES.filter(p => p.reward.chest).length >= 3, 'the hard ones give chests');
    const c = M.toClient(M.freshState('x'));
    assert.ok(c.every(m => m.xp > 0), 'the daily ones carry their XP too');
});

test('an old state (only the day) gets a week and a season; a new week or a new day starts fresh where it must', () => {
    const old = JSON.stringify({ date: M.today(), list: M.pickDaily('bob', M.today()).map(e => ({ ...e, prog: 1 })) });
    const s = M.normalize(old, 'bob');
    assert.equal(s.week.id, M.weekId()); assert.equal(s.week.list.length, 6); assert.equal(s.season.list.length, 12); assert.ok(s.list.every(e => e.prog === 1), 'today progress kept');
    // last week's list is dropped, the season stays
    const s2 = M.normalize(JSON.stringify({ ...s, week: { ...s.week, id: '2020-01-06' } }), 'bob');
    assert.equal(s2.week.id, M.weekId()); assert.ok(s2.week.list.every(e => e.prog === 0));
    // junk is repaired
    const s3 = M.normalize(JSON.stringify({ date: M.today(), list: s.list, week: { id: M.weekId(), list: [{ id: 'nope' }], got: 'x' }, season: 5 }), 'bob');
    assert.equal(s3.week.list.length, 6); assert.equal(s3.season.list.length, 12);
});

test('the rounds count in the week: wins, top places, waves held; a "max" mission keeps the best round', () => {
    const st = M.freshState('bob');
    st.week.list = [{ id: 'wk_wins3', prog: 0 }, { id: 'wk_top5x3', prog: 0 }, { id: 'wk_waves20', prog: 0 }, { id: 'wk_wave15', prog: 0 }, { id: 'wk_kills50', prog: 0 }, { id: 'wk_brwins3', prog: 0 }];
    M.applyRound(st, round({ placement: 1, isWinner: true, rs: { brKills: 4, zKills: 0, dmg: 0, wk: {} } }));
    M.applyRound(st, round({ placement: 4 }));
    M.applyRound(st, round({ placement: 6 }));
    M.applyRound(st, round({ mode: 'pve', isWinner: false, wave: 9, wavesCleared: 8, rs: { pveKills: 30, zKills: 30, wk: {} } }));
    M.applyRound(st, round({ mode: 'pve', isWinner: false, wave: 12, wavesCleared: 11, rs: { pveKills: 10, zKills: 10, wk: {} } }));
    const p = id => st.week.list.find(e => e.id === id).prog;
    assert.equal(p('wk_wins3'), 1); assert.equal(p('wk_brwins3'), 1); assert.equal(p('wk_top5x3'), 2, 'places 1 and 4 count, 6 does not');
    assert.equal(p('wk_waves20'), 19, '8 + 11 waves held'); assert.equal(p('wk_wave15'), 12, 'the best single match');
    assert.equal(p('wk_kills50'), 44, '4 players + 30 + 10 zombies');
});

test('the season: a phase counts progress only when it is open, and opens when the one before is done (not in the round that finished it)', () => {
    const st = M.freshState('bob');
    const phase = i => M.toClientEx(st).season.phases[i];
    assert.equal(phase(0).unlocked, true); assert.equal(phase(1).unlocked, false);
    M.applyRound(st, round({ mode: 'pve', wave: 11, wavesCleared: 10, rs: { pveKills: 25, zKills: 25, wk: { sniper: 0 } } }));   // 25 kills, 10 waves: phase 1 has "20 enemies" done; phase 2 is closed
    assert.equal(st.season.list.find(e => e.id === 's_waves10').prog, 0, 'phase 2 does not count while it is closed');
    assert.equal(phase(0).missions[0].prog, 20); assert.equal(phase(1).unlocked, false);
    // finish the other two missions of phase 1
    M.applyRound(st, round({ placement: 3, rs: { wk: {} } }));   // plays: 2 so far, a top 10
    for (let i = 0; i < 3; i++) M.applyRound(st, round({ placement: 12 }));   // 5 matches
    assert.ok(phase(0).missions.every(m => m.prog >= m.goal), JSON.stringify(phase(0).missions));
    assert.equal(phase(1).unlocked, true);
    M.applyRound(st, round({ isWinner: true, placement: 1 }));
    assert.equal(st.season.list.find(e => e.id === 's_wins2').prog, 1, 'phase 2 counts now');
});

test('claims: the info half changes nothing, the mark half marks once; a prize needs its missions', () => {
    const st = M.freshState('bob');
    assert.equal(M.weekRewardInfo(st, 0).ok, false);
    assert.equal(M.weekMissionInfo(st, st.week.list[0].id).ok, false);
    for (const e of st.week.list.slice(0, 2)) e.prog = 9999999;
    st.week.list.slice(0, 2).forEach(e => { e.prog = Math.min(e.prog, M.WEEK_POOL.find(m => m.id === e.id).goal); });
    const a = M.weekMissionInfo(st, st.week.list[0].id); assert.equal(a.ok, true); assert.ok(a.reward.xp > 0);
    assert.equal(st.week.list[0].claimed, false, 'asking does not claim');
    M.weekMissionMark(st, st.week.list[0].id); assert.equal(M.weekMissionInfo(st, st.week.list[0].id).error, 'Already claimed');
    const r = M.weekRewardInfo(st, 0); assert.equal(r.ok, true); M.weekRewardMark(st, 0); assert.equal(M.weekRewardInfo(st, 0).error, 'Already claimed');
    assert.equal(M.weekRewardInfo(st, 1).ok, false, '4 missions are not done');
    assert.equal(M.seasonRewardInfo(st, 0).ok, false);
    for (const id of M.SEASON_PHASES[0].missions) st.season.list.find(e => e.id === id).prog = 9999;
    st.season.list.forEach(e => { const d = M.SEASON_POOL.find(m => m.id === e.id); e.prog = Math.min(e.prog, d.goal); });
    assert.equal(M.seasonRewardInfo(st, 0).ok, true); assert.equal(M.seasonRewardInfo(st, 0).reward.chest, 'silver');
});

// ---------- on the real server ----------
async function setup(state) {
    state.apply = true;
    const srv = await startServer(state, { CHEST_RNG_FIXED: '0' });
    const login = await post(srv.port, '/api/auth/login', { nickname: NICK, password: 'secret' });
    assert.equal(login.ok, true);
    state.patches.length = 0;
    return { srv, call: (p, b = {}) => post(srv.port, p, { nickname: NICK, token: login.token, ...b }) };
}
const finishWeek = (ms, n) => { ms.week.list.slice(0, n).forEach(e => { e.prog = M.WEEK_POOL.find(m => m.id === e.id).goal; }); };

test('server: the state of all three kinds; a weekly mission pays coins, gems and its XP in one update; the week prize gives a chest, and with the slots full nothing is paid or marked', async () => {
    const ms = M.freshState(NICK); finishWeek(ms, 4);
    const state = { row: { ...makeRow(), missions_state: JSON.stringify(ms), lobby_state: lobby({ slots: [
        { id: 1, type: 'wooden', got: 0, startedAt: null, readyAt: null }, { id: 2, type: 'wooden', got: 0, startedAt: null, readyAt: null },
        { id: 3, type: 'wooden', got: 0, startedAt: null, readyAt: null }, { id: 4, type: 'wooden', got: 0, startedAt: null, readyAt: null }] }) } };
    const { srv, call } = await setup(state);
    try {
        const st = await call('/api/missions/state');
        assert.equal(st.ok, true); assert.equal(st.missions.length, 6); assert.equal(st.ex.week.list.length, 6); assert.equal(st.ex.week.done, 4); assert.equal(st.ex.season.total, 12);
        assert.equal(st.ex.season.phases.length, 4); assert.ok(st.ex.week.endsAt > st.ex.now && st.ex.dailyEndsAt > st.ex.now);
        // a weekly mission: coins + gems + XP together
        const id = ms.week.list[0].id, def = M.WEEK_POOL.find(m => m.id === id);
        let r = await call('/api/missions/claim', { missionId: id, kind: 'week' });
        assert.equal(r.ok, true); assert.equal(r.rewardCoins, def.coins); assert.equal(r.rewardXp, def.xp); assert.equal(r.bp.xp, def.xp);
        const patch = state.patches.find(p => 'lobby_state' in p); assert.ok(patch && 'coins' in patch, 'the coins and the XP are written together');
        r = await call('/api/missions/claim', { missionId: id, kind: 'week' }); assert.equal(r.ok, false); assert.equal(r.error, 'Already claimed');
        // the prize of 4 missions is a chest: the four slots are full, so nothing is paid and it stays claimable
        state.patches.length = 0;
        r = await call('/api/missions/claim-reward', { kind: 'week', index: 1 });
        assert.equal(r.ok, false); assert.equal(r.full, true); assert.equal(state.patches.length, 0, 'nothing written (neither the account nor the missions)');
        assert.equal((await call('/api/missions/state')).ex.week.rewards[1].claimed, false);
        // make room: the chest comes, the XP too, and it cannot be claimed twice
        const l = JSON.parse(state.row.lobby_state); l.slots[3] = null; state.row.lobby_state = JSON.stringify(l);
        r = await call('/api/missions/claim-reward', { kind: 'week', index: 1 });
        assert.equal(r.ok, true); assert.equal(r.chest.type, 'silver'); assert.equal(r.rewardXp, M.WEEK_REWARDS[1].xp); assert.equal(r.lobby.slots[3].type, 'silver');
        assert.equal(state.patches.filter(p => 'lobby_state' in p).length, 1, 'one update of the account for the chest and the XP');
        r = await call('/api/missions/claim-reward', { kind: 'week', index: 1 }); assert.equal(r.ok, false);
        r = await call('/api/missions/claim-reward', { kind: 'week', index: 2 }); assert.equal(r.ok, false, '6 missions are not done'); assert.match(r.error, /Finish 6/);
        r = await call('/api/missions/claim-reward', { kind: 'nope', index: 0 }); assert.equal(r.ok, false);
    } finally { srv.stop(); }
});

test('server: a season phase pays its prize once, and a daily mission still works as before', async () => {
    const ms = M.freshState(NICK);
    for (const id of M.SEASON_PHASES[0].missions) ms.season.list.find(e => e.id === id).prog = M.SEASON_POOL.find(m => m.id === id).goal;
    ms.list.forEach(e => { e.prog = 9999; });
    const state = { row: { ...makeRow(), missions_state: JSON.stringify(ms), lobby_state: lobby({}) } };
    const { srv, call } = await setup(state);
    try {
        let r = await call('/api/missions/claim-reward', { kind: 'season', index: 1 }); assert.equal(r.ok, false, 'phase 2 is not done');
        r = await call('/api/missions/claim-reward', { kind: 'season', index: 0 });
        assert.equal(r.ok, true); assert.equal(r.rewardCoins, 200); assert.equal(r.chest.type, 'silver'); assert.equal(r.rewardXp, 1000); assert.equal(r.coins, 1200);
        assert.equal(r.ex.season.phases[0].claimed, true);
        r = await call('/api/missions/claim-reward', { kind: 'season', index: 0 }); assert.equal(r.ok, false); assert.equal(r.error, 'Already claimed');
        const d = await call('/api/missions/claim', { missionId: ms.list[0].id });
        assert.equal(d.ok, true); assert.ok(d.rewardXp > 0); assert.ok(d.ex && d.ex.week, 'the answer carries the weekly and season state too');
        for (const p of ['/api/missions/state', '/api/missions/claim-reward', '/api/missions/claim']) {
            assert.equal((await post(srv.port, p, { nickname: NICK, kind: 'week', index: 0, missionId: 'x' })).ok, false, p + ' needs the token');
        }
    } finally { srv.stop(); }
});

test('the missions screen is wired: the tabs, the claim buttons, the dot, the old modal is gone', () => {
    const root = path.join(__dirname, '..', '..', 'public');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), ui = fs.readFileSync(path.join(root, 'missions-ui.js'), 'utf8'), game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
    for (const id of ['screen-missions', 'ms-tabs', 'ms-pane', 'ms-coins', 'missions-nav-badge']) assert.ok(html.includes('id="' + id + '"'), id);
    assert.ok(html.includes('src="missions-ui.js"')); assert.ok(!html.includes('missions-overlay'), 'the modal is gone');
    for (const f of ['/api/missions/state', '/api/missions/claim-reward', "kind: row.dataset.kind", 'spawnCoinFly', 'paneSeason', 'paneWeek']) assert.ok(ui.includes(f), f);
    assert.ok(game.includes('MissionsUI.setDaily') && game.includes('MissionsUI.init'));
});

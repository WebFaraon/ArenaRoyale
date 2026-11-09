// Daily missions: a pool of varied missions, six picked per player per day.
//
// Each mission counts one stat from the rounds a player finishes:
//   kind 'sum' adds the round's value, kind 'max' keeps the best single round.
// Round stats come from server.js (p.rs) and are passed in by applyRound().
//
// State per player: { date, list: [{ id, prog, claimed }],                      <- the six of the day
//                     week:   { id (the Monday), list: [{ id, prog, claimed }], got: [claimed reward indexes] },
//                     season: { id, list: [{ id, prog }], got: [claimed phase indexes] } },
// stored as JSON in the players.missions_state column (see supabase-migration-missions.sql); the weekly and season parts live in the same JSON,
// so no new column is needed. Weekly missions are picked per week (the same for everybody), the season ones are fixed (SEASON_PHASES).
// Every kind gives Battle Pass XP: a daily mission by what it pays (ARBattlePass.xpForMission), a weekly one its own `xp`, a season phase the `xp` of its reward.
const BP = require('./public/battlepass.js');

// Weapons: ids (stats, saved missions) and the names players see, from public/data/weapons.json
const WEAPON_DATA = require('./public/data/weapons.json').weapons;
const WEAPONS = Object.keys(WEAPON_DATA);
const WNAME = Object.fromEntries(WEAPONS.map(id => [id, WEAPON_DATA[id].name.toUpperCase()]));
// e.g. wtitle(3, 'burst') -> 'Get 3 kills with FALCON'
const wtitle = (n, id, where = '') => 'Get ' + n + ' kills with ' + WNAME[id] + where;

// stat: which round value counts. tag: what the lobby shows next to it (mode or weapon).
const POOL = [
    // general
    { id: 'games3',    slot: 'general', title: 'Play 3 matches',                      stat: 'games',    kind: 'sum', goal: 3,    coins: 30,  diamonds: 0 },
    { id: 'kills8',    slot: 'general', title: 'Eliminate 8 enemies',                 stat: 'anyKills', kind: 'sum', goal: 8,    coins: 45,  diamonds: 0 },
    { id: 'dmg2500',   slot: 'general', title: 'Deal 2,500 damage',                   stat: 'dmg',      kind: 'sum', goal: 2500, coins: 40,  diamonds: 0 },
    // battle royale
    { id: 'brwin',     slot: 'br',      title: 'Win a Battle Royale match',           stat: 'brWins',   kind: 'sum', goal: 1,    coins: 100, diamonds: 1, tag: 'br' },
    { id: 'brkills3',  slot: 'br',      title: 'Eliminate 3 players in Battle Royale', stat: 'brKills', kind: 'sum', goal: 3,    coins: 50,  diamonds: 0, tag: 'br' },
    { id: 'brgames2',  slot: 'br',      title: 'Play 2 Battle Royale matches',        stat: 'brGames',  kind: 'sum', goal: 2,    coins: 25,  diamonds: 0, tag: 'br' },
    { id: 'brkits3',   slot: 'br',      title: 'Collect 3 medkits',                   stat: 'kits',     kind: 'sum', goal: 3,    coins: 30,  diamonds: 0, tag: 'br' },
    { id: 'brmulti2',  slot: 'br',      title: 'Eliminate 2 players in a single match', stat: 'brKills', kind: 'max', goal: 2, coins: 60, diamonds: 0, tag: 'br' },
    // PvE
    { id: 'pvewave5',  slot: 'pve',     title: 'Reach wave 5 in PvE',                 stat: 'pveWave',  kind: 'max', goal: 5,    coins: 60,  diamonds: 0, tag: 'pve' },
    { id: 'pvekills20', slot: 'pve',    title: 'Eliminate 20 zombies in PvE',         stat: 'pveKills', kind: 'sum', goal: 20,   coins: 50,  diamonds: 0, tag: 'pve' },
    { id: 'pvegames2', slot: 'pve',     title: 'Play 2 PvE matches',                  stat: 'pveGames', kind: 'sum', goal: 2,    coins: 25,  diamonds: 0, tag: 'pve' },
    // weapon, any mode
    { id: 'w_burst3',   slot: 'weapon', title: wtitle(3, 'burst'),   stat: 'wk_burst',   kind: 'sum', goal: 3, coins: 40, diamonds: 0, weapon: 'burst' },
    { id: 'w_smg5',     slot: 'weapon', title: wtitle(5, 'smg'),     stat: 'wk_smg',     kind: 'sum', goal: 5, coins: 40, diamonds: 0, weapon: 'smg' },
    { id: 'w_sniper3',  slot: 'weapon', title: wtitle(3, 'sniper'),  stat: 'wk_sniper',  kind: 'sum', goal: 3, coins: 50, diamonds: 0, weapon: 'sniper' },
    { id: 'w_pistol5',  slot: 'weapon', title: wtitle(5, 'pistol'),  stat: 'wk_pistol',  kind: 'sum', goal: 5, coins: 40, diamonds: 0, weapon: 'pistol' },
    { id: 'w_assault4', slot: 'weapon', title: wtitle(4, 'assault'), stat: 'wk_assault', kind: 'sum', goal: 4, coins: 40, diamonds: 0, weapon: 'assault' },
    { id: 'w_shotgun4', slot: 'weapon', title: wtitle(4, 'shotgun'), stat: 'wk_shotgun', kind: 'sum', goal: 4, coins: 40, diamonds: 0, weapon: 'shotgun' },
    // weapon in a specific mode
    { id: 'pw_shotgun15', slot: 'modeweapon', title: wtitle(15, 'shotgun', ' in PvE'), stat: 'pwk_shotgun', kind: 'sum', goal: 15, coins: 70, diamonds: 0, weapon: 'shotgun', tag: 'pve' },
    { id: 'pw_smg10',     slot: 'modeweapon', title: wtitle(10, 'smg', ' in PvE'),     stat: 'pwk_smg',     kind: 'sum', goal: 10, coins: 60, diamonds: 0, weapon: 'smg',     tag: 'pve' },
    { id: 'pw_burst8',    slot: 'modeweapon', title: wtitle(8, 'burst', ' in PvE'),    stat: 'pwk_burst',   kind: 'sum', goal: 8,  coins: 60, diamonds: 0, weapon: 'burst',   tag: 'pve' },
    { id: 'pw_sniper6',   slot: 'modeweapon', title: wtitle(6, 'sniper', ' in PvE'),   stat: 'pwk_sniper',  kind: 'sum', goal: 6,  coins: 60, diamonds: 0, weapon: 'sniper',  tag: 'pve' },
    { id: 'bw_shotgun2',  slot: 'modeweapon', title: wtitle(2, 'shotgun', ' in Battle Royale'), stat: 'bwk_shotgun', kind: 'sum', goal: 2, coins: 60, diamonds: 0, weapon: 'shotgun', tag: 'br' },
    { id: 'bw_sniper2',   slot: 'modeweapon', title: wtitle(2, 'sniper', ' in Battle Royale'),  stat: 'bwk_sniper',  kind: 'sum', goal: 2, coins: 60, diamonds: 0, weapon: 'sniper',  tag: 'br' },
    // hard
    { id: 'pvewave10',  slot: 'hard', title: 'Reach wave 10 in PvE',          stat: 'pveWave',  kind: 'max', goal: 10, coins: 150, diamonds: 2, tag: 'pve' },
    { id: 'pvekills50', slot: 'hard', title: 'Eliminate 50 zombies in PvE',  stat: 'pveKills', kind: 'sum', goal: 50, coins: 120, diamonds: 1, tag: 'pve' },
    { id: 'brwins2',    slot: 'hard', title: 'Win 2 Battle Royale matches',  stat: 'brWins', kind: 'sum', goal: 2, coins: 180, diamonds: 2, tag: 'br' },
    { id: 'kills25',    slot: 'hard', title: 'Eliminate 25 enemies',          stat: 'anyKills', kind: 'sum', goal: 25, coins: 110, diamonds: 1 },
];
const BY_ID = Object.fromEntries(POOL.map(m => [m.id, m]));
const SLOTS = ['general', 'br', 'pve', 'weapon', 'modeweapon', 'hard'];

function today() { return new Date().toISOString().slice(0, 10); }

// small deterministic PRNG so a player's six missions stay the same all day
function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

function pickDaily(nickname, date) {
    const rnd = seeded(String(nickname).toLowerCase() + '|' + date);
    const usedWeapons = new Set();
    const list = [];
    for (const slot of SLOTS) {
        const options = POOL.filter(m => m.slot === slot && !(m.weapon && usedWeapons.has(m.weapon)));
        const m = options[Math.floor(rnd() * options.length)];
        if (m.weapon) usedWeapons.add(m.weapon);
        list.push({ id: m.id, prog: 0, claimed: false });
    }
    return list;
}

function freshState(nickname, date = today()) { return { date, list: pickDaily(nickname, date), week: freshWeek(weekId(date)), season: freshSeason() }; }

// Parse a stored value; a missing, broken or old-day state becomes today's fresh selection
function normalize(raw, nickname) {
    let s = raw;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = null; } }
    const d = today();
    const dailyOk = s && s.date === d && Array.isArray(s.list) && s.list.every(e => e && BY_ID[e.id]);
    const out = dailyOk ? s : { date: d, list: pickDaily(nickname, d) };
    out.week = normWeek(s && s.week, d);
    out.season = normSeason(s && s.season);
    return out;
}

// Flat stat values for one finished round
function roundValues(info) {
    const rs = info.rs || {};
    const v = {
        games: 1,
        brGames: info.mode === 'br' ? 1 : 0,
        pveGames: info.mode === 'pve' ? 1 : 0,
        brWins: info.mode === 'br' && info.isWinner ? 1 : 0,
        brKills: rs.brKills || 0,
        pveKills: rs.pveKills || 0,
        anyKills: (rs.brKills || 0) + (rs.zKills || 0),
        kits: rs.kits || 0,
        dmg: Math.round(rs.dmg || 0),
        pveWave: info.mode === 'pve' ? (info.wave || 0) : 0,
        // waves held in a PvE match (the wave the base fell in does not count; a victory is all of them)
        pveWaves: info.mode === 'pve' ? Math.max(0, info.wavesCleared | 0) : 0,
        wins: info.isWinner ? 1 : 0,
        // the place in a Battle Royale match (1 = the winner)
        brTop3: info.mode === 'br' && info.placement >= 1 && info.placement <= 3 ? 1 : 0,
        brTop5: info.mode === 'br' && info.placement >= 1 && info.placement <= 5 ? 1 : 0,
        brTop10: info.mode === 'br' && info.placement >= 1 && info.placement <= 10 ? 1 : 0,
    };
    for (const w of WEAPONS) {
        v['wk_' + w]  = (rs.wk && rs.wk[w]) || 0;
        v['pwk_' + w] = (rs.pwk && rs.pwk[w]) || 0;
        v['bwk_' + w] = (rs.bwk && rs.bwk[w]) || 0;
    }
    return v;
}

function _add(e, def, v) {
    const val = v[def.stat] || 0;
    e.prog = def.kind === 'max' ? Math.max(e.prog, val) : e.prog + val;
    e.prog = Math.min(e.prog, def.goal);
}
function applyRound(state, info) {
    const v = roundValues(info);
    for (const e of state.list) {
        const def = BY_ID[e.id];
        if (!def || e.claimed) continue;
        _add(e, def, v);
    }
    if (state.week) for (const e of state.week.list) {
        const def = WEEK_BY_ID[e.id];
        if (def && !e.claimed) _add(e, def, v);
    }
    if (state.season) {
        const open = SEASON_PHASES.map((_, i) => phaseUnlocked(state.season, i));   // which phases are open before this round (a phase opened by it starts counting with the next)
        SEASON_PHASES.forEach((ph, i) => {
            if (!open[i]) return;
            for (const id of ph.missions) { const e = state.season.list.find(x => x.id === id), def = SEASON_BY_ID[id]; if (e && def) _add(e, def, v); }
        });
    }
    return state;
}

// What the lobby needs to draw a mission
function toClient(state) {
    return state.list.map(e => {
        const d = BY_ID[e.id];
        return { id: d.id, title: d.title, goal: d.goal, prog: Math.min(e.prog, d.goal), claimed: !!e.claimed,
                 coins: d.coins, diamonds: d.diamonds, xp: BP.xpForMission(d.coins), tag: d.tag || null, weapon: d.weapon || null, slot: d.slot };
    });
}

// Returns { ok, coins, diamonds, error } and marks the mission claimed
function claim(state, missionId) {
    const e = state.list.find(x => x.id === missionId);
    const d = BY_ID[missionId];
    if (!e || !d) return { ok: false, error: 'Mission not found' };
    if (e.claimed) return { ok: false, error: 'Already claimed' };
    if (e.prog < d.goal) return { ok: false, error: 'Mission not complete' };
    e.claimed = true;
    return { ok: true, coins: d.coins, diamonds: d.diamonds };
}

// ---------- weekly missions ----------
// Six a week (two general, two Battle Royale, two PvE), picked from this pool by the week, the same for everybody; progress adds up over the week.
// No mission asks for a teammate (reviving ...): a player alone must be able to finish all six.
const WEEK_POOL = [
    { id: 'wk_kills50',    slot: 'general', title: 'Eliminate 50 enemies',            sub: 'Any mode',                       stat: 'anyKills', kind: 'sum', goal: 50,   coins: 200, diamonds: 0, xp: 400 },
    { id: 'wk_dmg5000',    slot: 'general', title: 'Deal 5,000 damage',               sub: 'Any mode',                       stat: 'dmg',      kind: 'sum', goal: 5000, coins: 150, diamonds: 0, xp: 350 },
    { id: 'wk_games10',    slot: 'general', title: 'Play 10 matches',                 sub: 'Battle Royale or Survival PvE',  stat: 'games',    kind: 'sum', goal: 10,   coins: 150, diamonds: 0, xp: 350 },
    { id: 'wk_wins3',      slot: 'general', title: 'Win 3 matches',                   sub: 'Any mode',                       stat: 'wins',     kind: 'sum', goal: 3,    coins: 250, diamonds: 2, xp: 500 },
    { id: 'wk_brwins3',    slot: 'br',      title: 'Win 3 Battle Royale matches',     sub: 'Battle Royale',                  stat: 'brWins',   kind: 'sum', goal: 3,    coins: 150, diamonds: 1, xp: 450, tag: 'br' },
    { id: 'wk_top5x3',     slot: 'br',      title: 'Finish in the Top 5 three times', sub: 'Battle Royale',                  stat: 'brTop5',   kind: 'sum', goal: 3,    coins: 100, diamonds: 1, xp: 350, tag: 'br' },
    { id: 'wk_brkills20',  slot: 'br',      title: 'Eliminate 20 players',            sub: 'Battle Royale',                  stat: 'brKills',  kind: 'sum', goal: 20,   coins: 200, diamonds: 1, xp: 450, tag: 'br' },
    { id: 'wk_waves20',    slot: 'pve',     title: 'Survive 20 waves',                sub: 'Survival PvE · adds up across matches', stat: 'pveWaves', kind: 'sum', goal: 20, coins: 200, diamonds: 0, xp: 400, tag: 'pve' },
    { id: 'wk_pvekills150', slot: 'pve',    title: 'Eliminate 150 zombies',           sub: 'Survival PvE',                   stat: 'pveKills', kind: 'sum', goal: 150,  coins: 200, diamonds: 1, xp: 450, tag: 'pve' },
    { id: 'wk_wave15',     slot: 'pve',     title: 'Reach wave 15 in one match',      sub: 'Survival PvE',                   stat: 'pveWave',  kind: 'max', goal: 15,   coins: 250, diamonds: 2, xp: 550, tag: 'pve' },
];
const WEEK_BY_ID = Object.fromEntries(WEEK_POOL.map(m => [m.id, m]));
const WEEK_SLOTS = ['general', 'general', 'br', 'br', 'pve', 'pve'];
// what finishing 2, 4 and 6 of the week's missions gives (the last one is the big prize); `chest` is a chest type of public/chests.js
const WEEK_REWARDS = [
    { need: 2, coins: 100, diamonds: 0, chest: null,     xp: 150 },
    { need: 4, coins: 0,   diamonds: 0, chest: 'silver', xp: 300 },
    { need: 6, coins: 0,   diamonds: 3, chest: 'golden', xp: 600 },
];
const DAY_MS = 24 * 3600 * 1000;
// the Monday (UTC) of a date, as 'YYYY-MM-DD': the id of the week
function weekId(date = today()) {
    const t = Date.parse(date + 'T00:00:00Z');
    const back = (new Date(t).getUTCDay() + 6) % 7;   // Monday = 0
    return new Date(t - back * DAY_MS).toISOString().slice(0, 10);
}
const weekEndsAt = id => Date.parse(id + 'T00:00:00Z') + 7 * DAY_MS;
const dayEndsAt = (date = today()) => Date.parse(date + 'T00:00:00Z') + DAY_MS;
function pickWeekly(id) {
    const rnd = seeded('week|' + id), used = new Set(), list = [];
    for (const slot of WEEK_SLOTS) {
        const options = WEEK_POOL.filter(m => m.slot === slot && !used.has(m.id));
        const m = options[Math.floor(rnd() * options.length)];
        used.add(m.id); list.push({ id: m.id, prog: 0, claimed: false });
    }
    return list;
}
function freshWeek(id) { return { id, list: pickWeekly(id), got: [] }; }
function normWeek(w, date = today()) {
    const id = weekId(date);
    if (!w || w.id !== id || !Array.isArray(w.list) || w.list.length !== WEEK_SLOTS.length || !w.list.every(e => e && WEEK_BY_ID[e.id]) || !Array.isArray(w.got)) return freshWeek(id);
    for (const e of w.list) { e.prog = Math.max(0, Math.min(Math.floor(+e.prog) || 0, WEEK_BY_ID[e.id].goal)); e.claimed = e.claimed === true; }
    w.got = [...new Set(w.got.filter(i => Number.isInteger(i) && WEEK_REWARDS[i]))];
    return w;
}
const weekDone = w => w.list.filter(e => e.prog >= WEEK_BY_ID[e.id].goal).length;

// ---------- season missions ----------
// Twelve, in four phases (a football match: two halves, extra time, penalties), the same for every player for the whole season. A phase opens when every mission of the one
// before it is done; only an open phase counts progress. A finished phase pays its reward (claimed once); the last one is the big prize.
const SEASON_POOL = [
    { id: 's_kills20',  title: 'Eliminate 20 enemies',               stat: 'anyKills', kind: 'sum', goal: 20 },
    { id: 's_games5',   title: 'Play 5 matches',                     stat: 'games',    kind: 'sum', goal: 5 },
    { id: 's_top10',    title: 'Finish in the Top 10 in a match',    stat: 'brTop10',  kind: 'sum', goal: 1, tag: 'br' },
    { id: 's_sniper15', title: 'Get 15 kills with ' + WNAME.sniper,  stat: 'wk_sniper', kind: 'sum', goal: 15, weapon: 'sniper' },
    { id: 's_waves10',  title: 'Survive 10 waves',                   stat: 'pveWaves', kind: 'sum', goal: 10, tag: 'pve' },
    { id: 's_wins2',    title: 'Win 2 matches',                      stat: 'wins',     kind: 'sum', goal: 2 },
    { id: 's_multi5',   title: 'Eliminate 5 enemies in one match',   stat: 'anyKills', kind: 'max', goal: 5 },
    { id: 's_dmg3000',  title: 'Deal 3,000 damage',                  stat: 'dmg',      kind: 'sum', goal: 3000 },
    { id: 's_wave10',   title: 'Reach wave 10 in one match',         stat: 'pveWave',  kind: 'max', goal: 10, tag: 'pve' },
    { id: 's_wins5',    title: 'Win 5 matches',                      stat: 'wins',     kind: 'sum', goal: 5 },
    { id: 's_kills100', title: 'Eliminate 100 enemies',              stat: 'anyKills', kind: 'sum', goal: 100 },
    { id: 's_top3x3',   title: 'Finish in the Top 3 three times',    stat: 'brTop3',   kind: 'sum', goal: 3, tag: 'br' },
];
const SEASON_BY_ID = Object.fromEntries(SEASON_POOL.map(m => [m.id, m]));
const SEASON_PHASES = [
    { id: 'half1', name: 'FIRST HALF',  missions: ['s_kills20', 's_games5', 's_top10'],      reward: { coins: 200, diamonds: 0, chest: 'silver',   xp: 1000 } },
    { id: 'half2', name: 'SECOND HALF', missions: ['s_sniper15', 's_waves10', 's_wins2'],    reward: { coins: 0,   diamonds: 2, chest: 'golden',   xp: 1200 } },
    { id: 'extra', name: 'EXTRA TIME',  missions: ['s_multi5', 's_dmg3000', 's_wave10'],     reward: { coins: 0,   diamonds: 3, chest: 'golden',   xp: 1500 } },
    { id: 'pens',  name: 'PENALTIES',   missions: ['s_wins5', 's_kills100', 's_top3x3'],     reward: { coins: 0,   diamonds: 5, chest: 'mythical', xp: 2500 }, final: true },
];
function freshSeason() { return { id: BP.SEASON.id, list: SEASON_POOL.map(m => ({ id: m.id, prog: 0 })), got: [] }; }
function normSeason(s) {
    if (!s || s.id !== BP.SEASON.id || !Array.isArray(s.list) || s.list.length !== SEASON_POOL.length || !SEASON_POOL.every(m => s.list.some(e => e && e.id === m.id)) || !Array.isArray(s.got)) return freshSeason();
    for (const e of s.list) e.prog = Math.max(0, Math.min(Math.floor(+e.prog) || 0, SEASON_BY_ID[e.id].goal));
    s.got = [...new Set(s.got.filter(i => Number.isInteger(i) && SEASON_PHASES[i]))];
    return s;
}
const seasonDone = (s, id) => { const e = s.list.find(x => x.id === id); return !!e && e.prog >= SEASON_BY_ID[id].goal; };
function phaseUnlocked(s, i) { return i === 0 || SEASON_PHASES[i - 1].missions.every(id => seasonDone(s, id)); }

// ---------- what the lobby draws, and the claims ----------
function toClientEx(state, now = Date.now()) {
    const w = state.week, s = state.season;
    return {
        now, dailyEndsAt: dayEndsAt(state.date),
        week: {
            id: w.id, endsAt: weekEndsAt(w.id), done: weekDone(w),
            list: w.list.map(e => { const d = WEEK_BY_ID[e.id]; return { id: d.id, title: d.title, sub: d.sub, goal: d.goal, prog: e.prog, claimed: !!e.claimed, coins: d.coins, diamonds: d.diamonds, xp: d.xp, tag: d.tag || null, slot: d.slot }; }),
            rewards: WEEK_REWARDS.map((r, i) => ({ ...r, claimed: w.got.includes(i) })),
        },
        season: {
            id: s.id, name: BP.SEASON.name, endsAt: BP.SEASON.endsAt || 0,
            done: SEASON_POOL.filter(m => seasonDone(s, m.id)).length, total: SEASON_POOL.length,
            phases: SEASON_PHASES.map((ph, i) => ({
                id: ph.id, name: ph.name, unlocked: phaseUnlocked(s, i), final: !!ph.final, claimed: s.got.includes(i), reward: { ...ph.reward },
                missions: ph.missions.map(id => { const d = SEASON_BY_ID[id], e = s.list.find(x => x.id === id); return { id, title: d.title, goal: d.goal, prog: e.prog, tag: d.tag || null, weapon: d.weapon || null }; }),
            })),
        },
    };
}
// Each claim has two halves so a payment that fails (the chest slots are full) leaves the state as it was: *Info looks and changes nothing, *Mark then marks.
function weekMissionInfo(state, id) {
    const e = state.week.list.find(x => x.id === id), d = WEEK_BY_ID[id];
    if (!e || !d) return { ok: false, error: 'Mission not found' };
    if (e.claimed) return { ok: false, error: 'Already claimed' };
    if (e.prog < d.goal) return { ok: false, error: 'Mission not complete' };
    return { ok: true, reward: { coins: d.coins, diamonds: d.diamonds, xp: d.xp, chest: null } };
}
function weekMissionMark(state, id) { const e = state.week.list.find(x => x.id === id); if (e) e.claimed = true; }
function weekRewardInfo(state, i) {
    const r = WEEK_REWARDS[i];
    if (!r) return { ok: false, error: 'No such reward' };
    if (state.week.got.includes(i)) return { ok: false, error: 'Already claimed' };
    if (weekDone(state.week) < r.need) return { ok: false, error: 'Finish ' + r.need + ' missions first' };
    return { ok: true, reward: { coins: r.coins, diamonds: r.diamonds, xp: r.xp, chest: r.chest } };
}
function weekRewardMark(state, i) { if (!state.week.got.includes(i)) state.week.got.push(i); }
function seasonRewardInfo(state, i) {
    const ph = SEASON_PHASES[i];
    if (!ph) return { ok: false, error: 'No such phase' };
    if (state.season.got.includes(i)) return { ok: false, error: 'Already claimed' };
    if (!ph.missions.every(id => seasonDone(state.season, id))) return { ok: false, error: 'Finish the three missions first' };
    return { ok: true, reward: { ...ph.reward } };
}
function seasonRewardMark(state, i) { if (!state.season.got.includes(i)) state.season.got.push(i); }

// The one mission the end board of a PvE match shows: a mission this round finished (the richest first), else the one that moved furthest
// toward its goal. before: Map mission id -> progress before the round; state: after applyRound. null when no mission moved.
function roundNote(before, state) {
    let best = null, bestScore = -1;
    for (const e of state.list) {
        const d = BY_ID[e.id];
        if (!d || e.claimed) continue;
        const was = before.get(e.id) || 0;
        if (e.prog <= was) continue;
        const done = e.prog >= d.goal && was < d.goal;
        const score = done ? 1000 + d.coins + d.diamonds * 100 : e.prog / d.goal;
        if (score > bestScore) { bestScore = score; best = { id: d.id, title: d.title, goal: d.goal, prog: Math.min(e.prog, d.goal), coins: d.coins, diamonds: d.diamonds, done }; }
    }
    return best;
}

function newRoundStats() { return { brKills: 0, pveKills: 0, zKills: 0, kits: 0, dmg: 0, wk: {}, pwk: {}, bwk: {} }; }

module.exports = {
    POOL, WEAPONS, WNAME, today, freshState, normalize, applyRound, toClient, claim, newRoundStats, pickDaily, roundNote,
    WEEK_POOL, WEEK_REWARDS, SEASON_POOL, SEASON_PHASES, weekId, weekEndsAt, dayEndsAt, pickWeekly, phaseUnlocked, toClientEx,
    weekMissionInfo, weekMissionMark, weekRewardInfo, weekRewardMark, seasonRewardInfo, seasonRewardMark,
};

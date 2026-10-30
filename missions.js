// Daily missions: a pool of varied missions, six picked per player per day.
//
// Each mission counts one stat from the rounds a player finishes:
//   kind 'sum' adds the round's value, kind 'max' keeps the best single round.
// Round stats come from server.js (p.rs) and are passed in by applyRound().
//
// State per player and day: { date, list: [{ id, prog, claimed }] }, stored as JSON in the
// players.missions_state column (see supabase-migration-missions.sql).

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

function freshState(nickname, date = today()) { return { date, list: pickDaily(nickname, date) }; }

// Parse a stored value; a missing, broken or old-day state becomes today's fresh selection
function normalize(raw, nickname) {
    let s = raw;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = null; } }
    const d = today();
    if (!s || s.date !== d || !Array.isArray(s.list) || s.list.some(e => !BY_ID[e.id])) return freshState(nickname, d);
    return s;
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
    };
    for (const w of WEAPONS) {
        v['wk_' + w]  = (rs.wk && rs.wk[w]) || 0;
        v['pwk_' + w] = (rs.pwk && rs.pwk[w]) || 0;
        v['bwk_' + w] = (rs.bwk && rs.bwk[w]) || 0;
    }
    return v;
}

function applyRound(state, info) {
    const v = roundValues(info);
    for (const e of state.list) {
        const def = BY_ID[e.id];
        if (!def || e.claimed) continue;
        const val = v[def.stat] || 0;
        e.prog = def.kind === 'max' ? Math.max(e.prog, val) : e.prog + val;
        e.prog = Math.min(e.prog, def.goal);
    }
    return state;
}

// What the lobby needs to draw a mission
function toClient(state) {
    return state.list.map(e => {
        const d = BY_ID[e.id];
        return { id: d.id, title: d.title, goal: d.goal, prog: Math.min(e.prog, d.goal), claimed: !!e.claimed,
                 coins: d.coins, diamonds: d.diamonds, tag: d.tag || null, weapon: d.weapon || null, slot: d.slot };
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

module.exports = { POOL, WEAPONS, WNAME, today, freshState, normalize, applyRound, toClient, claim, newRoundStats, pickDaily, roundNote };

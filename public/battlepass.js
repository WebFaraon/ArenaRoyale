// Battle Pass (ARBattlePass): pure, no DOM, no server: the server and the client load the same file (UMD), tools/tests/battlepass.test.js tests it.
//
// 30 tiers, every one the same XP. Two tracks: FREE (a reward every third tier) and BLAST TIER (the paid one, something at every tier). Buying Blast Tier gives
// the rewards of the tiers already passed too (they are claimed like the others). XP comes from the daily missions (xpForMission).
// A reward is { coins, diamonds, charSkin: id, weaponSkin: id } (any of them). Provisional: all the numbers are here.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARBattlePass = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const TIERS = 30;
    const XP_PER_TIER = 1000;
    // endsAt: only what the screen counts down to ("Ends in 60 days"); nothing expires yet, what happens to unclaimed rewards at the end is not decided. Provisional.
    const SEASON = { id: 1, kicker: 'SEASON 1', name: 'STADIUM SHOWDOWN', endsAt: Date.UTC(2027, 0, 8) };
    const BLAST_PRICE_USD = 4.99;   // real money: there is no payment system yet (the server only sells it when BLAST_TIER_TEST=1)

    // XP a mission gives when it is claimed, by what it pays in coins: the simple ones 100, the ones that ask for a weapon in a mode 200, the hard ones 350
    // (so the six missions of a day add up to about one tier)
    function xpForMission(coins) { return coins >= 100 ? 350 : coins > 50 ? 200 : 100; }

    // Free track: tier -> reward
    const FREE = {};
    [[3, 100], [6, 100], [9, 150], [12, 150], [15, 200], [18, 200], [21, 250], [24, 250], [27, 300]].forEach(([t, c]) => { FREE[t] = { coins: c }; });
    FREE[12].diamonds = 1; FREE[24].diamonds = 1;
    FREE[30] = { charSkin: 'referee' };   // the end of the free track: one Season skin, the simplest one

    // Blast Tier: a reward at every tier. The first and the last are exclusive skins; the other two Season skins are at 10 and 20
    const BLAST = {};
    for (let t = 1; t <= TIERS; t++) BLAST[t] = { coins: 100 + (t - 1) * 10 };
    [5, 15, 25].forEach(t => { BLAST[t].diamonds = 2; });
    BLAST[1]  = { charSkin: 'goalkeeper' };
    BLAST[10] = { charSkin: 'captain' };
    BLAST[20] = { charSkin: 'football_star' };
    BLAST[30] = { weaponSkin: 'sg_golazo' };   // Boomer "Golazo"
    const TRACKS = { free: FREE, blast: BLAST };

    // the tier you are on: tier 1 is open from the start (a new tier every XP_PER_TIER)
    const tierOf = xp => Math.min(TIERS, 1 + Math.floor(Math.max(0, +xp || 0) / XP_PER_TIER));
    const intoTier = xp => tierOf(xp) >= TIERS ? XP_PER_TIER : Math.max(0, +xp || 0) % XP_PER_TIER;   // XP towards the next tier (full on the last)

    function normalize(raw) {
        const s = raw && typeof raw === 'object' ? raw : {};
        const list = (a, track) => Array.isArray(a) ? [...new Set(a.map(Number).filter(t => Number.isInteger(t) && TRACKS[track][t]))].sort((x, y) => x - y) : [];
        return {
            xp: Math.max(0, Math.floor(+s.xp) || 0), blast: s.blast === true,
            claimed: { free: list(s.claimed && s.claimed.free, 'free'), blast: list(s.claimed && s.claimed.blast, 'blast') },
        };
    }
    // { ok } or { ok: false, error }: can this reward be claimed now
    function canClaim(bp, track, tier) {
        if (!TRACKS[track] || !Number.isInteger(tier) || !TRACKS[track][tier]) return { ok: false, error: 'No such reward' };
        if (tier > tierOf(bp.xp)) return { ok: false, error: 'Tier not reached yet' };
        if (track === 'blast' && !bp.blast) return { ok: false, error: 'Blast Tier is locked' };
        if (bp.claimed[track].includes(tier)) return { ok: false, error: 'Already claimed' };
        return { ok: true };
    }
    // the rewards you can take now: [{ track, tier }]
    function claimable(bp) {
        const out = [];
        for (const track of ['free', 'blast']) for (let t = 1; t <= tierOf(bp.xp); t++) if (TRACKS[track][t] && canClaim(bp, track, t).ok) out.push({ track, tier: t });
        return out;
    }
    return { TIERS, XP_PER_TIER, SEASON, BLAST_PRICE_USD, FREE, BLAST, TRACKS, xpForMission, tierOf, intoTier, normalize, canClaim, claimable };
});

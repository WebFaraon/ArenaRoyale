// Blastridge - pve-difficulty.js
// The three levels of a Survival PvE match, named after the final boss of each (the bosses themselves come later). Shared by the server
// (what a wave brings, how tough it is, what the match pays) and the client (the three cards at the start of a match). Pure, UMD, tested in
// tools/tests/pve-difficulty.test.js. All the numbers are provisional.
//
// The level is the only thing that sets how hard a match is: how many players there are does NOT change the waves any more.
//   count    how many zombies a wave brings, against the PVE_WAVES table of server.js (1 = the table as it is)
//   hp       how much health every zombie has, on top of the growth per wave (pveHpMul)
//   rewards  what the match pays (pve-rewards.js): coins and xp per wave cleared, per kills, a bonus for the win, and the diamonds by wave
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARPveDiff = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VOTE_MS = 10000;   // the time the players have to choose
    const DEFAULT_ID = 'colossus';   // nobody voted: the middle one

    const DIFFS = [
        {   // easy: a short, gentle run, no diamonds
            id: 'brood', name: 'Brood Mother', level: 1, count: 0.6, hp: 0.75, art: 'boss_brood',
            rewards: { coinsPerWave: 7, killsPerCoin: 10, winCoins: 40, xpPerWave: 3, killsPerXp: 25, winXp: 20, gems: [] },
        },
        {   // the match as it was for one player before the levels
            id: 'colossus', name: 'Colossus', level: 2, count: 1, hp: 1, art: 'boss_colossus',
            rewards: { coinsPerWave: 15, killsPerCoin: 4, winCoins: 100, xpPerWave: 10, killsPerXp: 10, winXp: 100,
                gems: [{ wave: 5, gems: 1 }, { wave: 10, gems: 1 }, { wave: 15, gems: 2 }, { wave: 20, gems: 3 }] },
        },
        {   // hard: half as many zombies again, much tougher, pays the most
            id: 'reaper', name: 'Reaper', level: 3, count: 1.5, hp: 1.4, art: 'boss_reaper',
            rewards: { coinsPerWave: 22, killsPerCoin: 5, winCoins: 200, xpPerWave: 16, killsPerXp: 8, winXp: 200,
                gems: [{ wave: 5, gems: 2 }, { wave: 10, gems: 2 }, { wave: 15, gems: 4 }, { wave: 20, gems: 6 }] },
        },
    ];
    const BY_ID = {};
    for (const d of DIFFS) BY_ID[d.id] = d;
    const ids = () => DIFFS.map(d => d.id);
    const isId = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);
    const get = id => (isId(id) ? BY_ID[id] : BY_ID[DEFAULT_ID]);

    // votes: { playerId: difficultyId } (what is not a level is ignored). The level with the most votes wins; a tie is settled by chance among the
    // levels that tie (rand: () => [0, 1)); nobody voting at all is the default. -> { id, counts: {id: n}, tie: [ids that tied] }
    function resolveVote(votes, rand) {
        const counts = {};
        for (const d of DIFFS) counts[d.id] = 0;
        let any = false;
        for (const k of Object.keys(votes || {})) { const v = votes[k]; if (isId(v)) { counts[v]++; any = true; } }
        if (!any) return { id: DEFAULT_ID, counts, tie: [] };
        const best = Math.max(...Object.values(counts));
        const top = DIFFS.filter(d => counts[d.id] === best).map(d => d.id);
        const pick = top.length === 1 ? top[0] : top[Math.min(top.length - 1, Math.floor((rand || Math.random)() * top.length))];
        return { id: pick, counts, tie: top.length > 1 ? top : [] };
    }

    return { VOTE_MS, DEFAULT_ID, DIFFS, ids, isId, get, resolveVote };
}));

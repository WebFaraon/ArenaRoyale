// What a finished PvE match pays (the end board of the game shows exactly these numbers), and the families the end board counts the zombies in.
// Pure: server.js calls it once per player when the base falls or the last wave is cleared. The numbers are provisional.
// The rates come from the level the players chose (public/pve-difficulty.js: `rewards`); the default level (Colossus) pays:
//
//   coins    15 for every wave cleared + 1 for every 4 zombies of the player + 100 when the last wave is cleared
//   xp       10 per wave cleared + 1 per 10 zombies of the player + 100 for a win
//   diamonds a threshold every 5 waves: 5 -> 1, 10 -> 1, 15 -> 2, 20 -> 3 (7 for a full run); a loss keeps the thresholds it reached
// The easy level pays about a third of that and no diamonds, the hard one about twice.

const PveDiff = require('./public/pve-difficulty.js');
const TOTAL_WAVES = 20;
const GEM_THRESHOLDS = PveDiff.get(PveDiff.DEFAULT_ID).rewards.gems;   // (the default level's)

const _int = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };

// wavesCleared: waves the base held through (all 20 on a win; on a loss the wave it fell in does not count). kills: zombies of this player.
// diff: the id of the level (public/pve-difficulty.js); an unknown one is the default.
function compute({ wavesCleared, victory, kills, diff }) {
    const waves = _int(wavesCleared, TOTAL_WAVES), k = _int(kills, 1e7), win = !!victory;
    const d = PveDiff.get(diff), r = d.rewards;
    const lines = [
        { id: 'waves', n: waves, coins: waves * r.coinsPerWave },
        { id: 'kills', n: k, coins: Math.floor(k / r.killsPerCoin) },
        { id: 'victory', n: win ? 1 : 0, coins: win ? r.winCoins : 0 },
    ];
    const milestones = r.gems.map(t => ({ wave: t.wave, gems: t.gems, got: waves >= t.wave }));
    return {
        wavesCleared: waves, victory: win, diff: d.id,
        coins: lines.reduce((s, l) => s + l.coins, 0),
        gems: milestones.reduce((s, m) => s + (m.got ? m.gems : 0), 0),
        xp: waves * r.xpPerWave + Math.floor(k / r.killsPerXp) + (win ? r.winXp : 0),
        lines, milestones,
    };
}

// The most one player can take from a full run of a level when they alone kill every zombie of it (zombies: how many the 20 waves bring on that level):
// what the cards of the vote say ("up to"). A team shares the zombies, so nobody gets more than this.
function maxReward(diff, zombies) {
    const r = compute({ wavesCleared: TOTAL_WAVES, victory: true, kills: zombies, diff });
    return { coins: r.coins, xp: r.xp, gems: r.gems };
}

// The four families of the end board: normal (normal, ghoul), runner (runner, stalker), heavy (tank, brute, summoner, shielded),
// special (spitter, exploder, screamer, minion). An unknown type counts as normal.
const KINDS = ['normal', 'runner', 'heavy', 'special'];
const KIND_OF = {
    normal: 'normal', ghoul: 'normal',
    runner: 'runner', stalker: 'runner',
    tank: 'heavy', brute: 'heavy', summoner: 'heavy', shielded: 'heavy',
    spitter: 'special', exploder: 'special', screamer: 'special', minion: 'special',
    brood: 'heavy', colossus: 'heavy', minicolossus: 'heavy', egg: 'special', hatchling: 'special',
};
const kindOf = type => KIND_OF[type] || 'normal';
const newKinds = () => ({ normal: 0, runner: 0, heavy: 0, special: 0 });

module.exports = { TOTAL_WAVES, GEM_THRESHOLDS, compute, maxReward, KINDS, KIND_OF, kindOf, newKinds };

// What a finished PvE match pays (the end board of the game shows exactly these numbers), and the families the end board counts the zombies in.
// Pure: server.js calls it once per player when the base falls or the last wave is cleared. The numbers are provisional.
//
//   coins    15 for every wave cleared + 1 for every 4 zombies of the player + 100 when the last wave is cleared
//   xp       10 per wave cleared + 1 per 10 zombies of the player + 100 for a win
//   diamonds a threshold every 5 waves: 5 -> 1, 10 -> 1, 15 -> 2, 20 -> 3 (7 for a full run); a loss keeps the thresholds it reached

const TOTAL_WAVES = 20;
const COINS_PER_WAVE = 15, KILLS_PER_COIN = 4, WIN_BONUS_COINS = 100;
const XP_PER_WAVE = 10, KILLS_PER_XP = 10, WIN_BONUS_XP = 100;
const GEM_THRESHOLDS = [{ wave: 5, gems: 1 }, { wave: 10, gems: 1 }, { wave: 15, gems: 2 }, { wave: 20, gems: 3 }];

const _int = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };

// wavesCleared: waves the base held through (all 20 on a win; on a loss the wave it fell in does not count). kills: zombies of this player.
function compute({ wavesCleared, victory, kills }) {
    const waves = _int(wavesCleared, TOTAL_WAVES), k = _int(kills, 1e7), win = !!victory;
    const lines = [
        { id: 'waves', n: waves, coins: waves * COINS_PER_WAVE },
        { id: 'kills', n: k, coins: Math.floor(k / KILLS_PER_COIN) },
        { id: 'victory', n: win ? 1 : 0, coins: win ? WIN_BONUS_COINS : 0 },
    ];
    const milestones = GEM_THRESHOLDS.map(t => ({ wave: t.wave, gems: t.gems, got: waves >= t.wave }));
    return {
        wavesCleared: waves, victory: win,
        coins: lines.reduce((s, l) => s + l.coins, 0),
        gems: milestones.reduce((s, m) => s + (m.got ? m.gems : 0), 0),
        xp: waves * XP_PER_WAVE + Math.floor(k / KILLS_PER_XP) + (win ? WIN_BONUS_XP : 0),
        lines, milestones,
    };
}

// The four families of the end board: normal (normal, ghoul), runner (runner, stalker), heavy (tank, brute, summoner, shielded),
// special (spitter, exploder, screamer, minion). An unknown type counts as normal.
const KINDS = ['normal', 'runner', 'heavy', 'special'];
const KIND_OF = {
    normal: 'normal', ghoul: 'normal',
    runner: 'runner', stalker: 'runner',
    tank: 'heavy', brute: 'heavy', summoner: 'heavy', shielded: 'heavy',
    spitter: 'special', exploder: 'special', screamer: 'special', minion: 'special',
};
const kindOf = type => KIND_OF[type] || 'normal';
const newKinds = () => ({ normal: 0, runner: 0, heavy: 0, special: 0 });

module.exports = { TOTAL_WAVES, GEM_THRESHOLDS, compute, KINDS, KIND_OF, kindOf, newKinds };

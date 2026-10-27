// node --test tools/tests/pve-waves.test.js
// The PvE wave table of server.js (read as text: the server is not a module): one row per wave, growing a little each time.
// A row is [normal, runner, tank, spitter, exploder, brute, summoner, shielded] (PVE_TYPES).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const total = +/const PVE_TOTAL_WAVES\s*=\s*(\d+)/.exec(src)[1];
const block = /const PVE_WAVES = \[([\s\S]*?)\n\];/.exec(src)[1];
const waves = [...block.matchAll(/\[([\d,\s]+)\]/g)].map(m => m[1].split(',').map(n => +n.trim()));
const types = /const PVE_TYPES = \[([^\]]*)\]/.exec(src)[1].split(',').map(t => t.trim().replace(/'/g, ''));
const defs = /const PVE_ZOMBIE_DEFS = \{([\s\S]*?)\n\};/.exec(src)[1];
const hp = (t) => +new RegExp('\\b' + t + ':\\s*\\{[^}]*?hp:\\s*(\\d+)').exec(defs)[1];
const sum = (w) => w.reduce((a, b) => a + b, 0);

test('there is one row for each of the waves, and 20 waves; every row has a count for each type, and each type has a definition', () => {
    assert.equal(total, 20);
    assert.equal(waves.length, total);
    assert.deepEqual(types, ['normal', 'runner', 'tank', 'spitter', 'exploder', 'brute', 'summoner', 'shielded', 'screamer', 'ghoul', 'stalker']);
    for (const w of waves) assert.equal(w.length, types.length);
    for (const t of types.concat('minion')) assert.ok(hp(t) > 0, t + ' has health');
});

const idx = (t) => types.indexOf(t);
const walkers = (w) => w[idx('normal')] + w[idx('runner')] + w[idx('ghoul')] + w[idx('stalker')];
const health = (w) => w.reduce((a, n, k) => a + n * hp(types[k]), 0);
const SWITCH = waves.findIndex(w => w[idx('ghoul')] > 0);   // the first wave of the dark ones

test('from wave 13 the ghoul and the stalker take the place of the normal and the runner altogether (and only then)', () => {
    assert.equal(SWITCH + 1, 13);
    for (let i = 0; i < waves.length; i++) {
        const w = waves[i], late = i >= SWITCH;
        assert.equal(w[idx('normal')] + w[idx('runner')] > 0, !late, 'wave ' + (i + 1) + (late ? ' has no normal or runner' : ' still has them'));
        assert.equal(w[idx('ghoul')] + w[idx('stalker')] > 0, late, 'wave ' + (i + 1));
    }
    assert.ok(hp('ghoul') >= 3 * hp('normal') && hp('stalker') >= 3 * hp('runner'), 'much tougher than the ones they replace');
    assert.match(defs, /ghoul:[^}]*dmg: 34/); assert.match(defs, /stalker:[^}]*dmg: 20/);
});

test('the waves grow gradually: never fewer of any of the old kinds, the health never goes down, no jump of more than 10 at once (the switch aside)', () => {
    for (let i = 1; i < waves.length; i++) {
        const a = waves[i - 1], b = waves[i], sw = i === SWITCH;
        assert.ok(health(b) >= health(a), 'wave ' + (i + 1) + ' has at least the health of the one before');
        if (!sw) { assert.ok(sum(b) >= sum(a), 'wave ' + (i + 1) + ' is not smaller'); assert.ok(sum(b) - sum(a) <= 10, 'wave ' + (i + 1) + ' does not jump'); }
        for (let k = 2; k < types.length; k++) assert.ok(b[k] >= a[k], 'wave ' + (i + 1) + ' does not lose ' + types[k]);
        if (i >= 7) assert.ok(health(b) <= health(a) * 1.4, 'wave ' + (i + 1) + ' is not more than 40% more health than the one before');
    }
    assert.ok(health(waves[SWITCH]) <= health(waves[SWITCH - 1]) * 1.4, 'the switch is a step, not a cliff');
    assert.ok(sum(waves[19]) > sum(waves[9]), 'the last is harder than the tenth');
});

test('the new kinds come in one at a time: tanks from wave 4, spitters 5, exploders 6, shielded 7, brutes 8, screamers 9, the first summoner at 10', () => {
    const first = (t) => waves.findIndex(w => w[idx(t)] > 0) + 1;
    assert.deepEqual(['tank', 'spitter', 'exploder', 'shielded', 'brute', 'screamer', 'summoner'].map(first), [4, 5, 6, 7, 8, 9, 10]);
    assert.equal(first('normal'), 1);
});

test('the shielded: 520 health, a wider shield, a harder hit on what it bashes, in numbers that grow to 13; they do not outnumber half of the walkers', () => {
    const k = idx('shielded');
    assert.equal(waves.findIndex(w => w[k] > 0) + 1, 7);
    for (const w of waves) assert.ok(w[k] <= walkers(w) / 2 && w[k] <= 13);
    assert.equal(waves[19][k], 13, 'the last wave has 13 of them');
    assert.equal(hp('shielded'), 520);
    assert.match(defs, /shielded:[^}]*shield: \{ half: 1\.25 \}/);
    assert.match(defs, /shielded:[^}]*baseDmg: 65/);
    assert.match(defs, /shielded:[^}]*coinsMin: 10, coinsMax: 16/);
    assert.match(defs, /shielded:[^}]*hunts: false/);
});

test('the screamer: 450 health, fast, hits hard, goes for players, screams once near the base and stuns every turret in range for 2 s', () => {
    assert.equal(hp('screamer'), 450);
    assert.match(defs, /screamer:[^}]*chaseSpd: 100/);
    assert.match(defs, /screamer:[^}]*dmg: 45/);
    assert.match(defs, /screamer:[^}]*hunts: true/);
    assert.match(defs, /scream: \{ at: 240, range: 300, windup: 0\.9, fire: 0\.45, stun: 2 \}/);
    assert.ok(waves[19][idx('screamer')] >= 5);
    assert.match(src, /if \(t\.stunUntil > now\) continue;/, 'a stunned turret skips its turn (fire, flame, heal)');
});

test('the heavy ones do not outnumber the rest: tanks at most half of the walkers, brutes and summoners fewer than the tanks', () => {
    for (const w of waves) { assert.ok(w[2] <= walkers(w) / 2); assert.ok(w[5] + w[6] <= w[2] + 3); }
});

test('the total health of a wave (without the growth of the waves) goes up a lot from the tenth wave to the last', () => {
    assert.ok(health(waves[19]) > health(waves[9]) * 1.6, 'wave 20 is much more health than wave 10');
    assert.ok(health(waves[19]) > 30000, 'wave 20 has over 30000 health before the growth (x1.84)');
});

test('more players, more zombies: +40% for each player after the first (up to 4), and a big wave is split into at most 10 batches', () => {
    const mul = new Function('return ' + /const pveCountMul = (\([^\n]*\) => [^\n]*);/.exec(src)[1])();
    assert.deepEqual([1, 2, 3, 4, 6].map(n => Math.round(mul(n) * 10) / 10), [1, 1.4, 1.8, 2.2, 2.2]);
    assert.match(src, /bsize = Math\.max\(PVE_BATCH_SIZE, Math\.ceil\(types\.length \/ 10\)\)/);
    assert.match(src, /next: pveWaveRow\(room\.pveWave, room\._playerArr\.length\)/);
});

// node --test tools/tests/pve-waves.test.js
// The PvE wave table of server.js (read as text: the server is not a module): one row per wave, growing a little each time.
// A row is [normal, runner, tank, spitter, exploder, brute, summoner] (PVE_TYPES).
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
    assert.deepEqual(types, ['normal', 'runner', 'tank', 'spitter', 'exploder', 'brute', 'summoner']);
    for (const w of waves) assert.equal(w.length, types.length);
    for (const t of types.concat('minion')) assert.ok(hp(t) > 0, t + ' has health');
});

test('the waves grow gradually: never fewer zombies, never fewer of any kind, no jump of more than 10 at once', () => {
    for (let i = 1; i < waves.length; i++) {
        const a = waves[i - 1], b = waves[i];
        assert.ok(sum(b) >= sum(a), 'wave ' + (i + 1) + ' is not smaller than the one before');
        assert.ok(sum(b) - sum(a) <= 10, 'wave ' + (i + 1) + ' does not jump');
        for (let k = 1; k < types.length; k++) assert.ok(b[k] >= a[k], 'wave ' + (i + 1) + ' does not lose ' + types[k]);
    }
    assert.ok(sum(waves[19]) > sum(waves[9]), 'the last is harder than the tenth');
});

test('the new kinds come in one at a time: tanks from wave 4, spitters 5, exploders 6, brutes 8, the first summoner at 10', () => {
    const first = (k) => waves.findIndex(w => w[k] > 0) + 1;
    assert.deepEqual([2, 3, 4, 5, 6].map(k => first(k)).slice(0, 5), [4, 5, 6, 8, 10]);
    assert.equal(first(0), 1);
});

test('the heavy ones do not outnumber the rest: tanks at most half of the walkers, brutes and summoners fewer than the tanks', () => {
    for (const w of waves) { assert.ok(w[2] <= (w[0] + w[1]) / 2); assert.ok(w[5] + w[6] <= w[2] + 3); }
});

test('the total health of a wave (without the growth of the waves) goes up a lot from the tenth wave to the last', () => {
    const health = (w) => w.reduce((a, n, k) => a + n * hp(types[k]), 0);
    assert.ok(health(waves[19]) > health(waves[9]) * 1.6, 'wave 20 is much more health than wave 10');
    assert.ok(health(waves[19]) > 17000, 'wave 20 has over 17000 health before the growth (x1.84)');
});

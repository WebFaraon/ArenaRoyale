// node --test tools/tests/pve-waves.test.js
// The PvE wave table of server.js (read as text: the server is not a module): one row per wave, growing a little each time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const total = +/const PVE_TOTAL_WAVES\s*=\s*(\d+)/.exec(src)[1];
const block = /const PVE_WAVES = \[([\s\S]*?)\n\];/.exec(src)[1];
const waves = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map(m => [+m[1], +m[2], +m[3]]);

test('there is one row for each of the waves, and 20 waves', () => {
    assert.equal(total, 20);
    assert.equal(waves.length, total);
});

test('the waves grow gradually: never fewer zombies, never fewer of any kind, no jump of more than 8 at once', () => {
    const sum = (w) => w[0] + w[1] + w[2];
    for (let i = 1; i < waves.length; i++) {
        const a = waves[i - 1], b = waves[i];
        assert.ok(sum(b) >= sum(a), 'wave ' + (i + 1) + ' is not smaller than the one before');
        assert.ok(sum(b) - sum(a) <= 8, 'wave ' + (i + 1) + ' does not jump');
        for (let k = 0; k < 3; k++) assert.ok(b[k] >= a[k] - 0 || k === 0, 'wave ' + (i + 1) + ' does not lose runners or tanks');
    }
    assert.ok(sum(waves[19]) > sum(waves[9]), 'the last is harder than the tenth');
});

test('the tanks (the heavy ones) come in from wave 4 and do not outnumber the rest', () => {
    assert.equal(waves[2][2], 0);
    assert.ok(waves[3][2] > 0);
    for (const w of waves) assert.ok(w[2] <= (w[0] + w[1]) / 2);
});

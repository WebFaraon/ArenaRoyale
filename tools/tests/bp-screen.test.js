// node --test tools/tests/bp-screen.test.js
// The Battle Pass screen (public/lobby-ui.js, index.html #screen-bp, style.css): sizes by value, the line through the tiers, the claim flight, navigation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BP = require('../../public/battlepass.js');
const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(path.join(root, 'public', 'lobby-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('the season has an end the screen can count down to', () => {
    assert.ok(Number.isFinite(BP.SEASON.endsAt) && BP.SEASON.endsAt > Date.UTC(2026, 10, 1));
});
test('every tier of the pass has something in the premium row, so "Unlock N rewards" is the real count', () => {
    assert.equal(Object.keys(BP.BLAST).length, BP.TIERS);
});
test('the screen has what the redesign asks for: a ring with the tier, a timer, a line through the tiers, arrows, a jump, a drag, a help note', () => {
    for (const id of ['bp-ring', 'bp-ends-txt', 'bp-prev', 'bp-next', 'bp-jump', 'bp-help', 'bp-blast-sub', 'bp-claim-all', 'bp-track']) assert.ok(html.includes('id="' + id + '"'), id);
    for (const f of ['function tierSize', 'function claimFx', 'function scrollToCur', 'function bindBpNav', "'pointerdown'", "'wheel'", 'line-l', 'line-r', 'spawnCoinFly']) assert.ok(ui.includes(f), f);
    for (const c of ['.bpx-node', '.bpx-cell.is-locked::before', '.bpx-claimall.is-live', '.bpx-lg', '.bpx-rays', '.bpx-flag']) assert.ok(css.includes(c), c);
});
test('tier sizes: a skin is a big card, gems a medium one, coins a small one', () => {
    const size = t => { const a = BP.FREE[t], b = BP.BLAST[t]; const sk = r => r && (r.charSkin || r.weaponSkin); return sk(a) || sk(b) ? 'lg' : (a && a.diamonds) || (b && b.diamonds) ? 'md' : 'sm'; };
    assert.equal(size(1), 'lg'); assert.equal(size(10), 'lg'); assert.equal(size(30), 'lg');
    assert.equal(size(5), 'md'); assert.equal(size(12), 'md'); assert.equal(size(2), 'sm'); assert.equal(size(3), 'sm');
    // the same rule as the screen's: it is read out of the source, so the two cannot drift apart
    const m = /function tierSize\(t\) \{([\s\S]*?)\n    \}/.exec(ui)[1];
    assert.match(m, /isSkin\(a\) \|\| isSkin\(b\)\) return 'lg'/); assert.match(m, /diamonds\) \|\| \(b && b\.diamonds\) \? 'md' : 'sm'/);
});

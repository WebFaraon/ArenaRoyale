// node --test tools/tests/pve-difficulty.test.js
// The three levels of a PvE match (public/pve-difficulty.js), what each pays (pve-rewards.js) and how the vote at the start of a match runs
// (server.js / game.js read as text: they are not modules).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../../public/pve-difficulty.js');
const R = require('../../pve-rewards.js');
const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

test('three levels, each harder than the one before and paying more; the middle one is the match as it was', () => {
    assert.deepEqual(D.ids(), ['brood', 'colossus', 'reaper']);
    const [a, b, c] = D.DIFFS;
    assert.ok(a.count < b.count && b.count < c.count && a.hp < b.hp && b.hp < c.hp);
    assert.equal(b.count, 1); assert.equal(b.hp, 1);
    for (const [x, y] of [[a, b], [b, c]]) for (const k of ['coinsPerWave', 'winCoins', 'xpPerWave', 'winXp']) assert.ok(y.rewards[k] > x.rewards[k], k);
    assert.deepEqual(a.rewards.gems, [], 'the easy level pays no diamonds');
    assert.equal(D.DEFAULT_ID, 'colossus');
    assert.equal(D.VOTE_MS, 10000);
    assert.equal(D.get('nope').id, 'colossus', 'an unknown level is the default');
});

test('the vote: the most votes wins, a tie is settled by chance among the tied levels, nobody voting is the default', () => {
    assert.equal(D.resolveVote({ a: 'brood', b: 'brood', c: 'reaper' }).id, 'brood');
    assert.deepEqual(D.resolveVote({ a: 'brood', b: 'brood', c: 'reaper' }).tie, []);
    assert.equal(D.resolveVote({ a: 'reaper' }).id, 'reaper', 'a single vote');
    assert.equal(D.resolveVote({}).id, 'colossus');
    assert.equal(D.resolveVote(null).id, 'colossus');
    // two players, two different levels: the pick is one of the two, by chance
    const seen = new Set();
    for (const r of [0, 0.49, 0.5, 0.99]) { const res = D.resolveVote({ a: 'brood', b: 'reaper' }, () => r); seen.add(res.id); assert.deepEqual(res.tie, ['brood', 'reaper']); }
    assert.deepEqual([...seen].sort(), ['brood', 'reaper']);
    assert.equal(D.resolveVote({ a: 'brood', b: 'reaper' }, () => 0).id, 'brood');
    assert.equal(D.resolveVote({ a: 'brood', b: 'reaper' }, () => 0.99).id, 'reaper');
    // a level nobody voted for is never picked in a tie of the others; junk votes do not count
    for (const r of [0, 0.3, 0.6, 0.99]) assert.notEqual(D.resolveVote({ a: 'brood', b: 'reaper' }, () => r).id, 'colossus');
    assert.equal(D.resolveVote({ a: 'x', b: 7, c: 'reaper' }).id, 'reaper');
    // three players, three levels: all three can come out
    const all = new Set([0, 0.4, 0.9].map(r => D.resolveVote({ a: 'brood', b: 'colossus', c: 'reaper' }, () => r).id));
    assert.equal(all.size, 3);
});

test('what each level pays: the easy one about 250 coins and 100 xp at most and no diamonds, the middle one as before, the hard one the most', () => {
    const wc = server.match(/const PVE_WAVES = \[([\s\S]*?)\n\];/)[1];
    const rows = [...wc.matchAll(/\[([^\]]*)\]/g)].map(m => m[1].split(',').map(Number));
    const total = diff => { const m = D.get(diff).count; return rows.reduce((n, r) => n + r.reduce((s, c) => s + Math.round(c * m), 0), 0); };
    const mx = Object.fromEntries(D.ids().map(id => [id, R.maxReward(id, total(id))]));
    assert.ok(mx.brood.coins >= 220 && mx.brood.coins <= 280, 'easy coins ' + mx.brood.coins);
    assert.ok(mx.brood.xp >= 90 && mx.brood.xp <= 120, 'easy xp ' + mx.brood.xp);
    assert.equal(mx.brood.gems, 0);
    assert.equal(mx.colossus.gems, 7);
    assert.ok(mx.brood.coins < mx.colossus.coins && mx.colossus.coins < mx.reaper.coins);
    assert.ok(mx.brood.xp < mx.colossus.xp && mx.colossus.xp < mx.reaper.xp);
    assert.ok(mx.colossus.gems < mx.reaper.gems);
});

test('compute takes the level: the same run pays differently; no level is the default', () => {
    const run = { wavesCleared: 20, victory: true, kills: 400 };
    const e = R.compute({ ...run, diff: 'brood' }), m = R.compute({ ...run, diff: 'colossus' }), h = R.compute({ ...run, diff: 'reaper' });
    assert.ok(e.coins < m.coins && m.coins < h.coins);
    assert.equal(e.gems, 0); assert.equal(m.gems, 7);
    assert.deepEqual(e.milestones, []);
    assert.deepEqual(R.compute(run), R.compute({ ...run, diff: 'colossus' }));
    assert.equal(R.compute({ ...run, diff: 'reaper' }).diff, 'reaper');
    // a loss on the hard level keeps the thresholds it reached
    assert.equal(R.compute({ wavesCleared: 11, victory: false, kills: 0, diff: 'reaper' }).gems, 4);
});

test('server: the vote opens after the loading screens and before the 3-2-1, alone it ends the moment it is clicked, a leaver does not count', () => {
    assert.match(server, /function beginMatchCountdown[\s\S]{0,400}beginPveVote\(code, room\); else runMatchCountdown\(code, room\)/);
    assert.match(server, /emit\('pve-vote-start'/);
    assert.match(server, /socket\.on\('pve-vote'/);
    assert.match(server, /if \(room\._playerArr\.length <= 1\) resolvePveVote\(code, room\)/);
    assert.match(server, /for \(const p of room\._playerArr\) if \(PveDiff\.isId\(v\.votes\[p\.id\]\)\) votes\[p\.id\]/);
    assert.match(server, /emit\('pve-diff'/);
    assert.match(server, /PVE_VOTE_MS = process\.env\.PVE_VOTE_MS/);
    // the level is reset with the match, rewards and the board use it
    assert.equal((server.match(/room\.pveDiff = PveDiff\.DEFAULT_ID/g) || []).length >= 2, true);
    assert.match(server, /PveRewards\.compute\(\{ wavesCleared: board\.wavesCleared, victory, kills: p\.kills, diff: room\.pveDiff \}\)/);
    assert.match(server, /result: victory \? 'victory' : 'defeat', diff: room\.pveDiff/);
});

test('client: the three cards, keys 1-3, the result, the level on the end board', () => {
    for (const ev of ['pve-vote-start', 'pve-vote-update', 'pve-diff']) assert.match(client, new RegExp("socket\\.on\\('" + ev + "'"));
    assert.match(client, /socket\.emit\('pve-vote', \{ id \}\)/);
    assert.match(client, /socket\.on\('countdown-start', \(\) => \{ _pvClose\(\); showCountdown\(\); \}\)/);
    assert.match(html, /id="pve-vote"/);
    assert.match(html, /<script src="pve-difficulty\.js"><\/script>/);
    assert.match(client, /_peSet\('pe-diff'/);
    assert.match(html, /id="pe-diff"/);
});

test('the art of each level\'s final boss is in the repo (public/images/zombies/boss_*.svg), complete, and is what tools/catalog/sprites-bosses.js draws', () => {
    const B = require('../../tools/catalog/sprites-bosses.js');
    for (const d of D.DIFFS) {
        const f = path.join(__dirname, '../../public/images/zombies', d.art + '.svg');
        assert.ok(fs.existsSync(f), d.art + '.svg exists');
        const svg = fs.readFileSync(f, 'utf8');
        assert.ok(svg.startsWith('<svg') && svg.trimEnd().endsWith('</svg>') && /viewBox="/.test(svg), d.art + ' is a whole svg');
        const key = d.art.replace('boss_', '');
        assert.equal(svg, B[key](), d.art + '.svg is up to date: run node tools/catalog/sprites-bosses.js');
        assert.ok(svg.includes('#0B0F1A'), 'ink outline');
    }
    assert.ok(fs.existsSync(path.join(__dirname, '../../public/images/zombies/boss_egg.svg')), 'the egg the Brood Mother throws');
});

// node --test tools/tests/boss-art.test.js
// The pictures drawn by tools/catalog/sprites-bosses.js are in the repo and are what the generator draws now: the Brood Mother in pieces (to animate) and the hatchling.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the Brood Mother also exists as separate pieces (sac, feelers, both arms, head) in public/images/zombies/brood: up to date, same viewBox, and stacked they are exactly the whole sprite', () => {
    const B = require('../../tools/catalog/sprites-bosses.js');
    const dir = path.join(__dirname, '../../public/images/zombies/brood');
    const files = B.broodPartFiles();
    for (const n of Object.keys(files)) assert.equal(fs.readFileSync(path.join(dir, n), 'utf8'), files[n], n + ' is up to date: run node tools/catalog/sprites-bosses.js');
    const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const whole = fs.readFileSync(path.join(__dirname, '../../public/images/zombies/boss_brood.svg'), 'utf8');
    const stacked = B.BROOD_ORDER.map(k => { const s = fs.readFileSync(path.join(dir, k + '.svg'), 'utf8'); assert.ok(s.includes('viewBox="' + B.BROOD_VIEW + '"'), k + ' shares the viewBox'); return inner(s); }).join('');
    assert.equal(stacked, inner(whole), 'the pieces stacked in order give the whole sprite');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'));
    assert.deepEqual(m.order, B.BROOD_ORDER);
    for (const k of m.order) assert.ok(Number.isFinite(m.pivots[k].x) && Number.isFinite(m.pivots[k].y), k + ' has a pivot');
});

test('the Colossus also exists as separate pieces (crown, both pauldrons, both arms, head) in public/images/zombies/colossus: up to date, same viewBox, and stacked they are exactly the whole sprite', () => {
    const B = require('../../tools/catalog/sprites-bosses.js');
    const dir = path.join(__dirname, '../../public/images/zombies/colossus');
    const files = B.colossusPartFiles();
    for (const n of Object.keys(files)) assert.equal(fs.readFileSync(path.join(dir, n), 'utf8'), files[n], n + ' is up to date: run node tools/catalog/sprites-bosses.js');
    const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const whole = fs.readFileSync(path.join(__dirname, '../../public/images/zombies/boss_colossus.svg'), 'utf8');
    const stacked = B.COLOSSUS_ORDER.map(k => { const s = fs.readFileSync(path.join(dir, k + '.svg'), 'utf8'); assert.ok(s.includes('viewBox="' + B.COLOSSUS_VIEW + '"'), k + ' shares the viewBox'); return inner(s); }).join('');
    assert.equal(stacked, inner(whole), 'the pieces stacked in order give the whole sprite');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'));
    assert.deepEqual(m.order, B.COLOSSUS_ORDER);
    for (const k of m.order) assert.ok(Number.isFinite(m.pivots[k].x) && Number.isFinite(m.pivots[k].y), k + ' has a pivot');
});

test('the small colossus (called by the Colossus) exists as separate pieces (crown, both arms, head) in public/images/zombies/colossus_mini, and as a whole: up to date, stacked they are exactly the whole sprite', () => {
    const B = require('../../tools/catalog/sprites-bosses.js');
    const dir = path.join(__dirname, '../../public/images/zombies/colossus_mini');
    const files = B.colossusMiniPartFiles();
    for (const n of Object.keys(files)) assert.equal(fs.readFileSync(path.join(dir, n), 'utf8'), files[n], n + ' is up to date: run node tools/catalog/sprites-bosses.js');
    const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const whole = fs.readFileSync(path.join(__dirname, '../../public/images/zombies/zombi_colossus_mini.svg'), 'utf8');
    assert.equal(whole, B.colossusMini(), 'the whole sprite is up to date');
    const stacked = B.COLOSSUS_MINI_ORDER.map(k => { const s = fs.readFileSync(path.join(dir, k + '.svg'), 'utf8'); assert.ok(s.includes('viewBox="' + B.COLOSSUS_MINI_VIEW + '"'), k + ' shares the viewBox'); return inner(s); }).join('');
    assert.equal(stacked, inner(whole), 'the pieces stacked in order give the whole sprite');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'));
    assert.deepEqual(m.order, B.COLOSSUS_MINI_ORDER);
    for (const k of m.order) assert.ok(Number.isFinite(m.pivots[k].x) && Number.isFinite(m.pivots[k].y), k + ' has a pivot');
});

test('the hatchling (what comes out of the Brood Mother\'s eggs) has its picture in the repo, up to date', () => {
    const B = require('../../tools/catalog/sprites-bosses.js');
    const svg = fs.readFileSync(path.join(__dirname, '../../public/images/zombies/zombi_hatchling.svg'), 'utf8');
    assert.equal(svg, B.hatchling(), 'run node tools/catalog/sprites-bosses.js');
    assert.ok(svg.includes('#0B0F1A'));
});

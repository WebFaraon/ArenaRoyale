// node --test tools/tests/basezombies.test.js
// The first three zombies (normal, runner, tank), animated in pieces (arms and head): the pieces (public/images/zombies/{normal,runner,tank}) are up to date, share the viewBox of their picture and,
// stacked in order, are exactly the whole picture; the pivots and the sizes the client uses (arena-art.js) are the ones of parts.json; and the client is wired (drawn in pieces, warmed, the blow events).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const B = require('../../tools/catalog/sprites-basezombies.js');
const root = path.join(__dirname, '..', '..', 'public');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const IDX = { normal: 0, runner: 1, tank: 2 };
for (const id of Object.keys(IDX)) {
    test(`${id}: the pieces are up to date, share the viewBox and stack into the whole sprite; the client has the same pivots`, () => {
        const z = B.ZOMBIES[id], dir = path.join(root, 'images', 'zombies', id);
        const files = B.partFiles(id);
        for (const n of Object.keys(files)) assert.equal(fs.readFileSync(path.join(dir, n), 'utf8'), files[n], n + ' is up to date: run node tools/catalog/sprites-basezombies.js');
        const whole = fs.readFileSync(path.join(root, 'images', 'zombies', z.file + '.svg'), 'utf8');
        assert.equal(whole, B.whole(id), 'the whole sprite is up to date');
        const stacked = B.ORDER.map(k => { const s = fs.readFileSync(path.join(dir, k + '.svg'), 'utf8'); assert.ok(s.includes('viewBox="' + z.vb + '"'), k + ' shares the viewBox'); return inner(s); }).join('');
        assert.equal(stacked, inner(whole), 'the pieces stacked in order give the whole sprite');
        const m = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'));
        assert.deepEqual(m.order, B.ORDER);
        const art = read('arena-art.js');
        // the row of ZOMBIE_ART has the viewBox of the pictures
        const row = new RegExp("\\{ id: '" + z.file + "',\\s+view: \\[([^\\]]*)\\]").exec(art);
        assert.ok(row && row[1].split(',').map(Number).join(' ') === z.vb, 'the art row has the viewBox');
        // BASIC_SET in arena-art.js: the pivots of parts.json
        const sets = [...art.matchAll(/makePieceSet\('(normal|runner|tank)', BASIC_PARTS, (\{[^}]*\}), (\d)/g)];
        const mine = sets.find(x => x[1] === id);
        assert.ok(mine, 'the set is in arena-art.js');
        assert.equal(+mine[3], IDX[id], 'with the art index of its type');
        const piv = eval('(' + mine[2] + ')');
        for (const k of m.order) assert.deepEqual(piv[k], [m.pivots[k].x, m.pivots[k].y], 'the pivot of ' + k);
        assert.match(art, /const BASIC_PARTS = \['armL', 'armR', 'head'\];/);
    });
}

test('the client draws the first three in pieces, warms the pieces and has the blow event wired', () => {
    const art = read('arena-art.js'), game = read('game.js');
    assert.match(art, /typeKey <= 2 && drawBasicSprite\(ctx, m, zb, def, typeKey, now, hot, flash, nx, ny\)/);
    assert.match(art, /for \(let bi = 0; bi < 3; bi\+\+\) if \(zdefs\[bi\]\) missing \+= warmBasic\(bi, zdefs\[bi\]\);/);
    assert.match(game, /socket\.on\('melee', \(\{ sw, hit \}\) =>/);
    assert.match(game, /z\.swingT = now; z\.swingMs = d && d\.swing \? d\.swing\.windup : 300; z\._sd = z\._sd === 1 \? 0 : 1;/);
    assert.match(game, /z\.slamT = now;/);
    // the pose tables have one entry for each of the three, and both-arm types are completed with the other-arm fields
    assert.match(art, /BASIC_POSE\.forEach\(function \(P\) \{ if \(P\.both\)/);
    assert.equal((art.match(/\{ both: (true|false), strike: \d+/g) || []).length, 3, 'a pose for each of the three');
    assert.equal((art.match(/\{ arm: [0-9.]+, reach: [0-9.]+, head: [0-9.]+, bob: [0-9.]+, dip: [0-9.]+, lean: [0-9.]+ \}/g) || []).length, 3, 'a walk for each of the three');
});

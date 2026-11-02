// node --test tools/tests/impact-fx.test.js
// Bullet impact effects (public/impact-fx.js): the pool is fixed, a burst is capped, pieces die, they fly back against the bullet, nothing is drawn
// when nothing is alive, and a colour is one path (one stroke and one fill), whatever the number of pieces. Plus that game.js is wired to it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../../public/impact-fx.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', '..', 'public', f), 'utf8');

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const fakeCtx = () => { const c = { calls: {}, }; for (const m of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'arc']) c.calls[m] = 0, c[m] = function () { c.calls[m]++; }; return c; };

test('a burst makes pieces of its kind and a ring; unknown kinds, no quality and no bullet direction are harmless', () => {
    I.reset(); I.beginFrame();
    for (const kind of I.KINDS) { assert.ok(I.spawn(kind, 100, 100, 1, 0, 1, rnd) >= 2, kind); }
    assert.equal(I.spawn('nope', 0, 0, 1, 0, 1, rnd), 0);
    assert.equal(I.spawn('zombie', 0, 0, 1, 0, 0, rnd), 0, 'quality 0 = off');
    assert.ok(I.spawn('zombie', 0, 0, 0, 0, 1, rnd) > 0, 'a zero direction does not break it (NaN-free)');
    I.step(0.016);
    assert.ok(I.count() > 0 && I.ringCount() > 0);
});

test('quality thins the burst out, never below two pieces', () => {
    I.reset(); I.beginFrame(); const full = I.spawn('zombie', 0, 0, 1, 0, 1, rnd);
    I.reset(); I.beginFrame(); const half = I.spawn('zombie', 0, 0, 1, 0, 0.5, rnd);
    I.reset(); I.beginFrame(); const low = I.spawn('zombie', 0, 0, 1, 0, 0.05, rnd);
    assert.ok(half < full && half >= 2 && low === 2, full + ' ' + half + ' ' + low);
});

test('the pool is fixed and a frame is capped: a storm of hits never grows anything, and the oldest pieces make room', () => {
    I.reset(); I.beginFrame();
    let made = 0;
    for (let i = 0; i < 100; i++) made += I.spawn('zombie', i, 0, 1, 0, 1, rnd);
    assert.ok(made <= I.MAX_SPAWN + 9, 'a frame is capped: ' + made);
    for (let f = 0; f < 60; f++) { I.beginFrame(); for (let k = 0; k < 20; k++) I.spawn('tree', k, 0, 1, 0, 1, rnd); I.step(0.016); assert.ok(I.count() <= I.MAX_PIECES); }
    assert.ok(I.ringCount() <= I.MAX_RINGS);
});

test('every piece and ring dies', () => {
    I.reset(); I.beginFrame();
    for (const kind of I.KINDS) I.spawn(kind, 0, 0, 1, 0, 1, rnd);
    for (let f = 0; f < 120; f++) I.step(1 / 60);   // two seconds: longer than the longest piece
    assert.equal(I.count(), 0); assert.equal(I.ringCount(), 0);
});

test('the pieces fly mostly back against the bullet (a spray off the surface), and slow down', () => {
    I.reset(); I.beginFrame();
    for (let i = 0; i < 40; i++) { I.beginFrame(); I.spawn('rock', 0, 0, 1, 0, 1, rnd); }   // the bullet flies along +x
    I.step(0.05);
    // the centre of the pieces is on the -x side: they came back out of the surface
    const ctx = fakeCtx(); let sx = 0, n = 0;
    ctx.moveTo = function (x) { ctx.calls.moveTo++; sx += x; n++; };
    I.draw(ctx, -1e4, -1e4, 1e4, 1e4);
    assert.ok(n > 0 && sx / n < -1, 'mean x ' + (sx / n));
});

test('nothing is drawn when nothing is alive, a colour is one path, and what is off the screen is not drawn', () => {
    I.reset(); I.beginFrame(); I.step(0.016);
    const idle = fakeCtx(); I.draw(idle, 0, 0, 100, 100);
    assert.deepEqual(Object.values(idle.calls).reduce((a, b) => a + b, 0), 0, 'an empty pool costs no canvas call');
    for (let i = 0; i < 6; i++) { I.beginFrame(); I.spawn('zombie', 50, 50, 1, 0, 1, rnd); }
    I.step(0.016);
    const c = fakeCtx(); I.draw(c, -500, -500, 500, 500);
    assert.ok(c.calls.fill <= 3 && c.calls.stroke <= 3 + I.MAX_RINGS, 'zombie goo: 3 colours = 3 fills (' + c.calls.fill + ') and their strokes (' + c.calls.stroke + ')');
    assert.ok(c.calls.moveTo >= 30, 'but many pieces in them: ' + c.calls.moveTo);
    const far = fakeCtx(); I.draw(far, 5000, 5000, 5200, 5200);
    assert.equal(far.calls.moveTo, 0, 'off the screen');
});

test('game.js wires it: predicted hits, bullets the server stopped, other players\' bullets, the setting and a reset', () => {
    const game = read('game.js'), html = read('index.html');
    assert.ok(/<script src="impact-fx\.js"><\/script>/.test(html) && /id="set-impactfx"/.test(html));
    assert.ok(/_IMP_KIND\[_hitK\]/.test(game), 'an own predicted hit');
    assert.ok(/_spawnImpact\(_impactKindAt\(_ix, _iy\), _ix, _iy, c\.dx, c\.dy\)/.test(game), 'an own bullet the server removed');
    assert.ok(/_spawnImpact\(_impactKindAt\(_ix, _iy\), _ix, _iy, _s\.dx, _s\.dy\)/.test(game), 'an enemy bullet that vanished');
    assert.ok(/ARImpact\.step\([\s\S]{0,120}ARImpact\.draw\(/.test(game) && /ARImpact\.reset\(\)/.test(game));
    assert.ok(/ar_impactfx/.test(game) && /_impactQuality\(\)/.test(game), 'a setting and a quality that follows the dynamic resolution');
});

// node --test tools/tests/zombie-nav.test.js
// zombie-nav.js: the distance field the PvE zombies follow. Trees and rocks are solid, a barricade or a turret is a wall that can be crossed
// at a price: a zombie goes round when the way round is short, breaks the weakest wall of a ring when there is no way round.
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../../zombie-nav.js');

const W = 2600, H = 2600;
function world(obstacles, rects, circles, base) {
    const nav = N.create(W, H);
    N.setStatics(nav, obstacles || [], base || null);
    N.setWalls(nav, rects || [], circles || []);
    return nav;
}
const rect = (x, y, hw, hh, hp, ref) => ({ x, y, hw, hh, hp, ref: ref || { id: x + ',' + y } });
// walk the field from (x, y) to the target as a zombie would: a waypoint at a time. Returns { reached, steps, hit } (hit = the walls it had to break)
function walk(nav, field, large, x, y, tx, ty, maxSteps) {
    const out = {}; const hit = new Set(); let steps = 0;
    while (steps++ < (maxSteps || 400)) {
        if (Math.hypot(tx - x, ty - y) < 40) return { reached: true, steps, hit };
        if (!N.steer(nav, field, large, x, y, 3, out)) return { reached: false, steps, hit };
        if (out.owner) { hit.add(out.owner); return { reached: 'wall', steps, hit, owner: out.owner }; }
        const dx = out.x - x, dy = out.y - y, d = Math.hypot(dx, dy) || 1;
        x += dx / d * Math.min(d, 24); y += dy / d * Math.min(d, 24);
    }
    return { reached: false, steps, hit };
}

test('open ground: the way is straight at the target', () => {
    const nav = world();
    const f = N.newField(nav); N.build(nav, false, [{ x: 1300, y: 1300 }], 60, f);
    const out = {};
    assert.ok(N.steer(nav, f, false, 1000, 1300, 3, out));
    assert.ok(out.x > 1000 && Math.abs(out.y - 1300) < 40, 'goes right');
    assert.equal(out.owner, null);
    assert.ok(Math.abs(out.dist - 300 / N.CELL) < 1.5);
});

test('a line of trees with one gap: the zombie goes through the gap, not into the trees', () => {
    const trees = []; for (let y = 700; y <= 1900; y += 90) if (Math.abs(y - 1300) > 60) trees.push({ x: 1300, y, r: 40 });
    const nav = world(trees);
    const f = N.newField(nav); N.build(nav, false, [{ x: 1500, y: 1000 }], 80, f);   // the target is above the gap, on the far side
    const r = walk(nav, f, false, 1000, 1000, 1500, 1000, 600);
    assert.equal(r.reached, true);
    assert.ok(r.steps > 12, 'it had to go to the gap and back (not a straight line through the trees)');
});

test('a ring of barricades round the target: no way round, so it comes at the weakest one', () => {
    const rects = [];
    const weak = { id: 'weak' }, strong = { id: 'strong' };
    for (let k = -2; k <= 2; k++) { rects.push(rect(1300 + k * 100, 1100, 54, 17, 1600, strong)); rects.push(rect(1300 + k * 100, 1500, 54, 17, 1600, strong)); }
    for (let k = -2; k <= 2; k++) { rects.push(rect(1100, 1300 + k * 100, 17, 54, 1600, strong)); rects.push(rect(1500, 1300 + k * 100, 17, 54, k === 0 ? 300 : 1600, k === 0 ? weak : strong)); }
    const nav = world([], rects);
    const f = N.newField(nav); N.build(nav, false, [{ x: 1300, y: 1300 }], 200, f);
    for (const [sx, sy] of [[1900, 1300], [1300, 1900], [700, 1300], [1300, 700]]) {
        const r = walk(nav, f, false, sx, sy, 1300, 1300, 600);
        assert.equal(r.reached, 'wall', 'from ' + sx + ',' + sy + ' it meets a wall');
        assert.ok(r.owner === weak || r.owner === strong);
    }
    const r = walk(nav, f, false, 1900, 1300, 1300, 1300, 600);   // from the east, the weak one is straight ahead
    assert.equal(r.owner, weak);
});

test('a short way round is taken instead of breaking a strong wall; a long one is not', () => {
    const wall = (hp) => [rect(1300, 1300, 17, 54, hp, { id: 'w' })];
    // a single short wall: going round costs ~3 cells, breaking 1600 hp costs ~20
    let nav = world([], wall(1600));
    let f = N.newField(nav); N.build(nav, false, [{ x: 1500, y: 1300 }], 80, f);
    assert.equal(walk(nav, f, false, 1100, 1300, 1500, 1300, 300).reached, true, 'round a short wall');
    // a long wall of weak barricades: going round costs more than breaking one
    const rects = []; for (let k = -12; k <= 12; k++) rects.push(rect(1300, 1300 + k * 100, 17, 54, 300, { id: 'w' + k }));
    nav = world([], rects);
    f = N.newField(nav); N.build(nav, false, [{ x: 1500, y: 1300 }], 120, f);
    assert.equal(walk(nav, f, false, 1100, 1300, 1500, 1300, 300).reached, 'wall', 'breaks the weak one rather than a 1300 unit walk');
});

test('trees and rocks all round the target: no way (a zombie cannot break them): steer says nothing', () => {
    const ring = []; for (let a = 0; a < 12; a++) ring.push({ x: 1300 + Math.cos(a / 12 * 6.2832) * 90, y: 1300 + Math.sin(a / 12 * 6.2832) * 90, r: 40 });
    const nav = world(ring);
    const f = N.newField(nav); N.build(nav, false, [{ x: 1300, y: 1300 }], 80, f);
    assert.equal(N.steer(nav, f, false, 1700, 1300, 3, {}), false);
});

test('the base is solid and the field goes round it; the ring source puts the goal on its edge', () => {
    const base = { x: 1300, y: 1300, r: 85 };
    const nav = world([], [], [], base);
    const f = N.newField(nav); N.build(nav, false, [{ ring: true, x: 1300, y: 1300, r0: 85 + 30, r1: 85 + 70 }], 200, f);
    assert.equal(N.steer(nav, f, false, 1300, 1300, 3, {}), false, 'in the middle of the base: nothing');
    const out = {}; assert.ok(N.steer(nav, f, false, 1700, 1300, 3, out));
    assert.ok(out.x < 1700, 'towards the base');
});

test('the large size keeps further from the trees: a gap a small zombie fits is closed to a large one', () => {
    const trees = []; for (let y = 700; y <= 1900; y += 90) if (Math.abs(y - 1300) > 55) trees.push({ x: 1300, y, r: 40 });
    const nav = world(trees);
    const fs = N.newField(nav), fl = N.newField(nav);
    N.build(nav, false, [{ x: 1500, y: 1300 }], 80, fs); N.build(nav, true, [{ x: 1500, y: 1300 }], 80, fl);
    assert.equal(walk(nav, fs, false, 1100, 1300, 1500, 1300, 300).reached, true);
    assert.ok(fl[N.cellOf(nav, 1100, 1300)] >= fs[N.cellOf(nav, 1100, 1300)]);
});

test('a field is bounded by maxCost: nothing beyond it', () => {
    const nav = world();
    const f = N.newField(nav); N.build(nav, false, [{ x: 1300, y: 1300 }], 10, f);
    assert.equal(f[N.cellOf(nav, 1300 + 200, 1300)] < Infinity, true);
    assert.equal(f[N.cellOf(nav, 1300 + 600, 1300)], Infinity);
    assert.equal(N.steer(nav, f, false, 1300 + 600, 1300, 3, {}), false);
});

test('the field costs under a few milliseconds even when the whole arena is wanted (base field)', () => {
    const trees = []; for (let i = 0; i < 70; i++) trees.push({ x: 150 + (i * 397) % 2300, y: 150 + (i * 811) % 2300, r: 35 });
    const nav = world(trees, [], [], { x: 1300, y: 1300, r: 85 });
    const f = N.newField(nav); const t0 = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) N.build(nav, false, [{ ring: true, x: 1300, y: 1300, r0: 115, r1: 155 }], 1e9, f);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
    assert.ok(ms < 12, 'one full field took ' + ms.toFixed(2) + ' ms');
});

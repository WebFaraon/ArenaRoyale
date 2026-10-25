// node --test tools/tests/structures.test.js
// public/structures.js: the barricade (numbers, shape, collisions with a circle, placement and the cost of repairing / upgrading).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../public/structures.js');

const bar = (o) => Object.assign({ id: 1, x: 500, y: 500, o: 0, t: 0, hp: 300, maxHp: 300 }, o);

test('the approved table: health 300 / 600 / 1000 / 1600, price 5 / 13 / 25 / 43, upgrades +8 / +12 / +18, at most 20', () => {
    assert.deepEqual(S.BARRICADE.tiers.map(t => t.hp), [300, 600, 1000, 1600]);
    assert.deepEqual(S.BARRICADE.tiers.map(t => t.total), [5, 13, 25, 43]);
    assert.deepEqual(S.BARRICADE.tiers.map(t => t.up), [0, 8, 12, 18]);
    // each upgrade costs what the tier is worth more than the one under it, so nobody gains by buying wood and upgrading
    for (let i = 1; i < 4; i++) assert.equal(S.BARRICADE.tiers[i].total - S.BARRICADE.tiers[i - 1].total, S.BARRICADE.tiers[i].up);
    assert.equal(S.BARRICADE.maxPerRoom, 20);
    assert.equal(S.BUY_COST, 5);
});

test('the shape: 108 x 34 lying down, 34 x 108 standing up', () => {
    assert.deepEqual([S.halfW(bar({ o: 0 })), S.halfH(bar({ o: 0 }))], [54, 17]);
    assert.deepEqual([S.halfW(bar({ o: 1 })), S.halfH(bar({ o: 1 }))], [17, 54]);
});

test('a circle is pushed out of the rectangle, along the way it came in, and never pushed when it only touches', () => {
    const s = bar();
    const c = { x: 500, y: 500 - 17 - 10 };            // 10 above the top edge, radius 30: 20 inside
    assert.equal(S.pushOut(c, 30, s), true);
    assert.ok(Math.abs(c.y - (500 - 17 - 30)) < 1e-9 && c.x === 500);
    const t = { x: 500, y: 500 - 17 - 30 };            // exactly touching
    assert.equal(S.pushOut(t, 30, s), false);
    const corner = { x: 500 + 54 + 5, y: 500 + 17 + 5 };   // by the corner: pushed along the diagonal
    assert.equal(S.pushOut(corner, 30, s), true);
    assert.ok(Math.abs(Math.hypot(corner.x - (500 + 54), corner.y - (500 + 17)) - 30) < 1e-9);
});

test('a circle whose centre is inside leaves by the nearest side', () => {
    const s = bar();
    const c = { x: 500 + 40, y: 500 };    // inside, close to the right end
    S.pushOut(c, 30, s);
    assert.ok(Math.abs(c.x - (500 + 54 + 30)) < 1e-9);
    const d = { x: 500, y: 500 - 3 };     // inside, close to the top side
    S.pushOut(d, 30, s);
    assert.ok(Math.abs(d.y - (500 - 17 - 30)) < 1e-9);
});

test('pushOutAll only moves the circle for the barricades it touches', () => {
    const list = [bar({ id: 1, x: 200 }), bar({ id: 2, x: 900 })];
    const far = { x: 600, y: 500 };
    assert.equal(S.pushOutAll(far, 30, list), false);
    assert.deepEqual([far.x, far.y], [600, 500]);
    const near = { x: 900, y: 500 - 17 - 5 };
    assert.equal(S.pushOutAll(near, 30, list), true);
    assert.ok(S.distToRect(near.x, near.y, list[1]) >= 30 - 1e-9);
});

test('distance and the nearest point of the surface', () => {
    const s = bar();
    assert.equal(S.distToRect(500, 500, s), 0);
    assert.equal(S.distToRect(500, 500 - 17 - 10, s), 10);
    const p = S.nearestPoint(700, 480, s, { x: 0, y: 0 });
    assert.deepEqual([p.x, p.y], [554, 483]);   // the corner side: x at the end, y clamped to the top edge
});

test('the zombie picks the barricade nearest to it, within the detection range, and none beyond it', () => {
    const a = bar({ id: 1, x: 500 }), b = bar({ id: 2, x: 700 });
    const out = { d: -1 };
    assert.equal(S.nearestInRange(560, 500, [a, b], 130, out), a);           // 17.. 6 from a's end, far from b
    assert.ok(out.d < 20);
    assert.equal(S.nearestInRange(630, 500, [a, b], 130, out), b);           // closer to b (700 - 54 = 646 start): 16 vs 76
    assert.equal(S.nearestInRange(500, 500 - 17 - 129, [a, b], 130, out), a);
    assert.equal(S.nearestInRange(500, 500 - 17 - 131, [a, b], 130, out), null);   // 131 away: not in range
    assert.equal(out.d, Infinity);
    assert.equal(S.nearestInRange(0, 0, [], 130), null);
    assert.equal(S.BARRICADE.detectRange < 320, true, 'the barricade range is smaller than the player one (320)');
});

test('the state: whole above half the health, damaged at half or less', () => {
    assert.equal(S.state(bar({ hp: 300 })), 0);
    assert.equal(S.state(bar({ hp: 151 })), 0);
    assert.equal(S.state(bar({ hp: 150 })), 1);
    assert.equal(S.state(bar({ hp: 1 })), 1);
});

test('repair costs half the price of the tier, in proportion to what is missing, at least 1; upgrade costs the next tier\'s step', () => {
    assert.equal(S.repairCost(bar({ hp: 300 })), 0);
    assert.equal(S.repairCost(bar({ hp: 0 })), 3);                                 // 5 x 0.5 = 2.5 -> 3
    assert.equal(S.repairCost(bar({ hp: 299 })), 1);
    assert.equal(S.repairCost(bar({ t: 3, hp: 0, maxHp: 1600 })), 22);             // 43 x 0.5 = 21.5 -> 22
    assert.equal(S.repairCost(bar({ t: 1, hp: 300, maxHp: 600 })), 4);             // half of 13 x 0.5 = 3.25 -> 4
    assert.equal(S.upgradeCost(bar({ t: 0 })), 8);
    assert.equal(S.upgradeCost(bar({ t: 2 })), 18);
    assert.equal(S.upgradeCost(bar({ t: 3 })), 0);
});

test('E repairs a hurt barricade, upgrades a whole one, and does nothing at the top tier', () => {
    assert.equal(S.useAction(bar({ hp: 100 })), 'repair');
    assert.equal(S.useAction(bar({ hp: 300 })), 'upgrade');
    assert.equal(S.useAction(bar({ t: 3, hp: 1600, maxHp: 1600 })), null);
    assert.equal(S.useAction(bar({ t: 3, hp: 5, maxHp: 1600 })), 'repair');
});

test('the ghost: 80 in front of the player, lying across the way they look', () => {
    const o = { x: 0, y: 0, o: 0 };
    S.placement(1000, 1000, 1, 0, o);          // looking right: stands up (o = 1), 80 to the right
    assert.deepEqual([o.x, o.y, o.o], [1080, 1000, 1]);
    S.placement(1000, 1000, 0, -1, o);         // looking up: lies down
    assert.deepEqual([o.x, o.y, o.o], [1000, 920, 0]);
    S.placement(1000, 1000, 3, 4, o);          // a slanted look is normalised; mostly down: lies down
    assert.deepEqual([Math.round(o.x), Math.round(o.y), o.o], [1048, 1064, 0]);
});

const ctxOf = (o) => Object.assign({ w: 2600, h: 2600, obstacles: [], base: { x: 1300, y: 1300, r: 85 }, structs: [], players: [], playerR: 30, count: 0 }, o);

test('placement: free ground is fine; the arena edge, a tree, the base, another barricade, a player and the limit are refused', () => {
    assert.equal(S.checkPlace(bar({ x: 600, y: 600 }), ctxOf()), null);
    assert.equal(S.checkPlace(bar({ x: 40, y: 600 }), ctxOf()), 'edge');
    assert.equal(S.checkPlace(bar({ x: 600, y: 600 }), ctxOf({ obstacles: [{ x: 640, y: 600, r: 40 }] })), 'blocked');
    assert.equal(S.checkPlace(bar({ x: 600, y: 600 }), ctxOf({ obstacles: [{ x: 640, y: 900, r: 40 }] })), null);
    assert.equal(S.checkPlace(bar({ x: 1300, y: 1300 - 85 - 10 }), ctxOf()), 'blocked');
    assert.equal(S.checkPlace(bar({ x: 600, y: 600 }), ctxOf({ structs: [bar({ id: 2, x: 650, y: 600 })] })), 'blocked');
    assert.equal(S.checkPlace(bar({ x: 600, y: 600 }), ctxOf({ structs: [bar({ id: 2, x: 600, y: 700 })] })), null);
    assert.equal(S.checkPlace(bar({ x: 600, y: 600 }), ctxOf({ players: [{ x: 600, y: 600 - 17 - 20 }] })), 'player');
    assert.equal(S.checkPlace(bar({ x: 600, y: 600 }), ctxOf({ count: 20 })), 'limit');
});

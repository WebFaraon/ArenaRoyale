// node --test tools/tests/structures.test.js
// public/structures.js: the barricade (numbers, shape, collisions with a circle, placement and the cost of repairing / upgrading).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../public/structures.js');

const bar = (o) => Object.assign({ id: 1, x: 500, y: 500, o: 0, t: 0, hp: 300, maxHp: 300 }, o);

test('the approved table: health 300 / 600 / 1000 / 1600, price 5 / 13 / 25 / 43, upgrades +8 / +12 / +18, at most 20', () => {
    assert.deepEqual(S.BARRICADE.tiers.map(t => t.hp), [300, 600, 1000, 1600]);
    assert.deepEqual(S.BARRICADE.tiers.map(t => t.total), [10, 30, 70, 150]);
    assert.deepEqual(S.BARRICADE.tiers.map(t => t.up), [0, 20, 40, 80]);
    // each upgrade costs what the tier is worth more than the one under it, so nobody gains by buying wood and upgrading
    for (let i = 1; i < 4; i++) assert.equal(S.BARRICADE.tiers[i].total - S.BARRICADE.tiers[i - 1].total, S.BARRICADE.tiers[i].up);
    assert.equal(S.BARRICADE.maxPerRoom, 20);
    assert.equal(S.BUY_COST, 10);
    assert.equal(S.BARRICADE.workMs, 1000, 'a repair takes a second');
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
    assert.equal(S.repairCost(bar({ hp: 0 })), 5);                                 // 10 x 0.5
    assert.equal(S.repairCost(bar({ hp: 299 })), 1);
    assert.equal(S.repairCost(bar({ t: 3, hp: 0, maxHp: 1600 })), 75);             // 150 x 0.5
    assert.equal(S.repairCost(bar({ t: 1, hp: 300, maxHp: 600 })), 8);             // half of 30 x 0.5 = 7.5 -> 8
    assert.equal(S.upgradeCost(bar({ t: 0 })), 20);
    assert.equal(S.upgradeCost(bar({ t: 2 })), 80);
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

test('a barricade as a blocker for coins: its rectangle, centred', () => {
    assert.deepEqual(S.asBlocker(bar({ x: 500, y: 600, o: 0 })), { x: 500, y: 600, hw: 54, hh: 17 });
    assert.deepEqual(S.asBlocker(bar({ x: 500, y: 600, o: 1 })), { x: 500, y: 600, hw: 17, hh: 54 });
});

test('a repair or an upgrade needs the player up against the barricade, not just near it', () => {
    const S2 = require('../../public/structures.js');
    assert.ok(S2.BARRICADE.useRange <= 20, 'the reach is the width of a hand');
    const w = { x: 500, y: 500, o: 0, t: 0, hp: 300, maxHp: 300 };       // lying: 108 x 34, its top at y = 483
    const playerR = 30;
    assert.ok(S2.distToRect(500, 483 - playerR, w) <= playerR + S2.BARRICADE.useRange, 'standing against it');
    assert.ok(S2.distToRect(500, 483 - 80, w) > playerR + S2.BARRICADE.useRange, 'a step away is too far');
});

test('segmentHits / blockerBetween: what stands between a zombie and a player', () => {
    const w = { id: 1, x: 500, y: 500, o: 0, t: 0, hp: 300, maxHp: 300 };    // x 446..554, y 483..517
    assert.equal(S.segmentHits(500, 600, 500, 400, w, 0), true, 'straight through');
    assert.equal(S.segmentHits(300, 600, 300, 400, w, 0), false, 'beside it');
    assert.equal(S.segmentHits(300, 600, 300, 400, w, 20), false, 'beside it, grown by 20, still clear');
    assert.equal(S.segmentHits(430, 600, 430, 400, w, 20), true, 'grazing it: the body of a zombie would catch');
    assert.equal(S.segmentHits(500, 600, 500, 550, w, 0), false, 'a segment that stops short of it');
    assert.equal(S.segmentHits(446, 483, 446, 483, w, 0), true, 'a point on the edge');
    const near = S.blockerBetween(500, 540, 500, 400, [w], 28, 20);
    assert.equal(near && near.id, 1, 'leaning on it, with it in the way');
    assert.equal(S.blockerBetween(500, 540, 700, 700, [w], 28, 20), null, 'leaning on it but the player is the other way');
    assert.equal(S.blockerBetween(500, 700, 500, 400, [w], 28, 20), null, 'in the way but not leaning on it');
});

// ---- the turrets ----
const TU = S.TURRET;
const tur = (x, y, t = 0, hp, maxHp) => ({ id: 1, k: 't', x, y, t, hp: hp === undefined ? TU.tiers[t].hp : hp, maxHp: maxHp === undefined ? TU.tiers[t].hp : maxHp });

test('turret numbers: three levels that cost more and hit harder, six at most, the radius of a player', () => {
    assert.equal(TU.tiers.length, 3);
    assert.equal(TU.maxPerRoom, 6);
    assert.equal(TU.r, 31);
    assert.equal(S.TURRET_BUY_COST, TU.tiers[0].total);
    let dps = 0;
    TU.tiers.forEach((t, i) => {
        const d = t.dmg / t.cd;
        assert.ok(d > dps, 'level ' + (i + 1) + ' has more dps');
        dps = d;
        if (i) { assert.ok(t.hp > TU.tiers[i - 1].hp && t.range >= TU.tiers[i - 1].range); assert.equal(t.total, TU.tiers[i - 1].total + t.up, 'the total is the sum of the upgrades'); }
    });
});

test('a turret is round: distance to the surface, and a circle pushed out of it', () => {
    const t = tur(500, 500);
    assert.equal(S.turretDist(500 + 31 + 20, 500, t), 20);
    assert.equal(S.turretDist(510, 500, t), 0, 'inside');
    const o = { x: 500 + 40, y: 500 };
    assert.equal(S.turretPushOut(o, 30, t), true);
    assert.ok(Math.abs(Math.hypot(o.x - 500, o.y - 500) - 61) < 1e-9, 'out to the sum of the radii');
    const free = { x: 700, y: 500 };
    assert.equal(S.turretPushOut(free, 30, t), false);
    const centre = { x: 500, y: 500 };
    assert.equal(S.turretPushOut(centre, 30, t), true);
    assert.ok(Math.hypot(centre.x - 500, centre.y - 500) >= 61 - 1e-9, 'even from the exact centre');
});

test('E at a turret: repair when hurt, upgrade while there is a level above, nothing at the top; the prices', () => {
    assert.equal(S.turretUseAction(tur(0, 0, 0)), 'upgrade');
    assert.equal(S.turretUseAction(tur(0, 0, 0, 100)), 'repair');
    assert.equal(S.turretUseAction(tur(0, 0, 2)), null);
    assert.equal(S.turretUpgradeCost(tur(0, 0, 0)), TU.tiers[1].up);
    assert.equal(S.turretUpgradeCost(tur(0, 0, 2)), 0);
    assert.equal(S.turretRepairCost(tur(0, 0, 0)), 0, 'nothing missing, nothing to pay');
    const half = S.turretRepairCost(tur(0, 0, 1, 250, 500));
    assert.equal(half, Math.ceil(0.5 * TU.tiers[1].total * TU.repairShare));
    assert.ok(S.turretRepairCost(tur(0, 0, 1, 499, 500)) >= 1, 'at least one coin');
});

const far = (n, kd) => Array.from({ length: n }, (_, i) => ({ ...tur(100 + i * 100, 100), kd }));   // n turrets far from (1000, 1000), of a kind (none: machine gun)

test('where a turret may stand: not on rocks, the base, barricades, turrets or players; the edge; six at most', () => {
    const base = { obstacles: [], base: null, structs: [], turrets: [], players: [], playerR: 30, w: 3000, h: 3000 };
    const t = tur(1000, 1000);
    assert.equal(S.checkPlaceTurret(t, base), null);
    assert.equal(S.checkPlaceTurret(t, { ...base, obstacles: [{ x: 1040, y: 1000, r: 20 }] }), 'blocked');
    assert.equal(S.checkPlaceTurret(t, { ...base, base: { x: 1100, y: 1000, r: 85 } }), 'blocked');
    assert.equal(S.checkPlaceTurret(t, { ...base, structs: [{ x: 1000 + 31 + 17 + 1, y: 1000, o: 1, t: 0, hp: 300, maxHp: 300 }] }), 'blocked', 'a barricade too close');
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: [tur(1050, 1000)] }), 'blocked');
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: [tur(1070, 1000)] }), null, 'one next to the other is fine');
    assert.equal(S.checkPlaceTurret(t, { ...base, players: [{ x: 1040, y: 1000 }] }), 'player');
    assert.equal(S.checkPlaceTurret(tur(30, 1000), base), 'edge');
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: far(6) }), 'limit');
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: far(5) }), null);
});

test('the turret limit grows with the players in the room: 6 for one, 3 more for each other', () => {
    assert.deepEqual([1, 2, 3, 4].map(n => S.turretLimit(n)), [6, 9, 12, 15]);
    assert.equal(S.turretLimit(0), 6, 'never under the first six');
    const base = { obstacles: [], base: null, structs: [], turrets: [], players: [], playerR: 30, w: 3000, h: 3000 };
    const t = tur(1000, 1000);
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: far(6), roomPlayers: 1 }), 'limit');
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: far(6), roomPlayers: 2 }), null);
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: far(9), roomPlayers: 2 }), 'limit');
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: far(14), roomPlayers: 4 }), null);
    assert.equal(S.checkPlaceTurret(t, { ...base, turrets: far(15), roomPlayers: 4 }), 'limit');
});

test('every kind has its own limit: Tesla Towers 2 and 1 more a player, Health Stations 1 and 1 more; the machine guns do not count for them', () => {
    assert.deepEqual([1, 2, 3, 4].map(n => S.turretLimit(n, 'tesla')), [2, 3, 4, 5]);
    assert.deepEqual([1, 2, 3, 4].map(n => S.turretLimit(n, 'heal')), [1, 2, 3, 4]);
    assert.equal(S.turretLimit(2, 'nothing'), 9, 'an unknown kind is a machine gun');
    const base = { obstacles: [], base: null, structs: [], playerR: 30, players: [], w: 3000, h: 3000, roomPlayers: 1 };
    const tesla = { ...tur(1000, 1000), kd: 'tesla' }, heal = { ...tur(1000, 1000), kd: 'heal' };
    assert.equal(S.checkPlaceTurret(tesla, { ...base, turrets: far(6) }), null, 'six machine guns leave room for a Tesla');
    assert.equal(S.checkPlaceTurret(tesla, { ...base, turrets: far(2, 'tesla') }), 'limit');
    assert.equal(S.checkPlaceTurret(tesla, { ...base, turrets: far(1, 'tesla') }), null);
    assert.equal(S.checkPlaceTurret(heal, { ...base, turrets: far(1, 'heal') }), 'limit');
    assert.equal(S.checkPlaceTurret(heal, { ...base, turrets: far(1, 'heal'), roomPlayers: 2 }), null);
    assert.equal(S.turretCountOf([{}, { kd: 'tesla' }, { kd: 'heal' }, { kd: 'tesla' }], 'mg'), 1, 'one without a kind is a machine gun');
});

test('the shop stops selling a kind at its limit: what stands plus what you hold, for a barricade 20 in the room', () => {
    assert.equal(S.buyBlocked('mg', 5, 0, 1), false);
    assert.equal(S.buyBlocked('mg', 5, 1, 1), true, 'five down and one in the inventory is six');
    assert.equal(S.buyBlocked('mg', 6, 0, 2), false, 'a second player: nine');
    assert.equal(S.buyBlocked('tesla', 1, 1, 1), true);
    assert.equal(S.buyBlocked('heal', 0, 0, 1), false);
    assert.equal(S.buyBlocked('b', 19, 0, 1), false);
    assert.equal(S.buyBlocked('b', 18, 2, 4), true);
});

test('the Tesla Tower and the Health Station have three levels each, and repair and upgrade go by their own price tables', () => {
    for (const kd of ['tesla', 'heal']) {
        const k = S.TURRET.kinds[kd];
        assert.equal(k.tiers.length, 3);
        for (let i = 1; i < 3; i++) { assert.ok(k.tiers[i].hp > k.tiers[i - 1].hp && k.tiers[i].total > k.tiers[i - 1].total, kd + ' level ' + (i + 1) + ' is more'); assert.equal(k.tiers[i].total - k.tiers[i - 1].total, k.tiers[i].up, 'the upgrade is the difference in the price'); }
        assert.equal(S.turretBuyCost(kd), k.tiers[0].total);
    }
    const tesla = { kd: 'tesla', t: 0, hp: 130, maxHp: 260 }, heal = { kd: 'heal', t: 2, hp: 700, maxHp: 700 };
    assert.equal(S.turretRepairCost(tesla), Math.ceil(0.5 * 35 * 0.5), 'half of the health: half of half the price');
    assert.equal(S.turretUpgradeCost({ kd: 'tesla', t: 0, hp: 260, maxHp: 260 }), 45);
    assert.equal(S.turretUseAction(heal), null, 'the last level, whole: nothing to do');
    assert.equal(S.turretUseAction({ ...heal, t: 1, hp: 450, maxHp: 450 }), 'upgrade');
    assert.equal(S.turretKind({}).tiers, S.TURRET.tiers, 'the machine gun is the default kind');
});

test('a barricade is not placed on a turret either', () => {
    const w = { x: 1000, y: 1000, o: 0, t: 0, hp: 300, maxHp: 300 };
    const ctx = { obstacles: [], base: null, structs: [], players: [], playerR: 30, w: 3000, h: 3000, count: 0 };
    assert.equal(S.checkPlace(w, { ...ctx, turrets: [tur(1000, 1000 + 17 + 31 + 1)] }), 'blocked');
    assert.equal(S.checkPlace(w, { ...ctx, turrets: [tur(1000, 1000 + 17 + 31 + 5)] }), null);
    assert.equal(S.checkPlace(w, ctx), null, 'the context of the server before turrets (no list) still works');
});

test('the ghost of a turret goes in front of the player', () => {
    const o = { x: 0, y: 0 };
    S.turretPlacement(100, 100, 0, 1, o);
    assert.deepEqual([o.x, o.y], [100, 100 + TU.placeDist]);
});

test('an upgrade takes longer the higher it goes: barricades 1 / 2 / 3 s, machine guns and Tesla Towers 2 / 3 s; a repair is always a second', () => {
    assert.deepEqual([0, 1, 2].map(i => S.workTime(bar({ t: i }), 'upgrade')), [1000, 2000, 3000]);
    assert.deepEqual([0, 1].map(i => S.workTime({ k: 't', kd: 'tesla', t: i }, 'upgrade')), [2000, 3000]);
    assert.deepEqual([0, 1].map(i => S.workTime({ k: 't', t: i }, 'upgrade')), [2000, 3000], 'a machine gun turret has no kd');
    assert.deepEqual([0, 1].map(i => S.workTime({ k: 't', kd: 'heal', t: i }, 'upgrade')), [1000, 1000], 'the Health Station keeps a second');
    assert.equal(S.workTime(bar({ t: 3 }), 'repair'), 1000);
    assert.equal(S.workTime({ k: 't', kd: 'tesla', t: 2 }, 'repair'), 1000);
});

test('the Bomb Tower: three levels, a limit of its own (2, +1 a player), splash that grows with the level, and 2 / 3 s upgrades', () => {
    const k = S.TURRET.kinds.bomb;
    assert.equal(k.tiers.length, 3);
    for (let i = 1; i < 3; i++) {
        assert.ok(k.tiers[i].hp > k.tiers[i - 1].hp && k.tiers[i].dmg > k.tiers[i - 1].dmg && k.tiers[i].splash > k.tiers[i - 1].splash && k.tiers[i].range >= k.tiers[i - 1].range);
        assert.equal(k.tiers[i].total - k.tiers[i - 1].total, k.tiers[i].up, 'the upgrade is the difference in the price');
    }
    assert.deepEqual([1, 2, 3, 4].map(n => S.turretLimit(n, 'bomb')), [2, 3, 4, 5]);
    assert.equal(S.turretBuyCost('bomb'), 45);
    assert.deepEqual([0, 1].map(i => S.workTime({ k: 't', kd: 'bomb', t: i }, 'upgrade')), [2000, 3000]);
    assert.ok(k.speed > 0 && k.inv === 'bomb');
});

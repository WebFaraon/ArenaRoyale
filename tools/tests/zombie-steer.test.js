// node --test tools/tests/zombie-steer.test.js
// A PvE zombie chasing a player on the far side of the base must get round the base instead of
// stopping against it. The loop below is the zombie's movement in server.js (unit direction, steering,
// step, rigid push-out of the base), without the rest of the game.
const test = require('node:test');
const assert = require('node:assert/strict');
const { avoidBase, avoidStructs, pickTarget } = require('../../zombie-steer.js');
const ARStructs = require('../../public/structures.js');

const BASE = { x: 1300, y: 1300, r: 85 };
const TYPES = { normal: { r: 20, spd: 62 }, runner: { r: 16, spd: 130 }, tank: { r: 28, spd: 35 } };

// returns { reached: seconds or null, minWall: closest the zombie came to the wall (0 = touching) }
function chase(type, from, target, steer, secs) {
    const def = TYPES[type], out = { x: 0, y: 0 }, dt = 1 / 60;
    let x = from[0], y = from[1], minWall = Infinity;
    for (let i = 0; i < secs * 60; i++) {
        let dx = target[0] - x, dy = target[1] - y;
        const len = Math.hypot(dx, dy);
        if (len < 55) return { reached: i * dt, minWall };            // in attack range of the player
        dx /= len; dy /= len;
        if (steer) { avoidBase(x, y, dx, dy, BASE, def.r, out); dx = out.x; dy = out.y; }
        const m = Math.hypot(dx, dy);
        if (m > 0) { x += dx / m * def.spd * dt; y += dy / m * def.spd * dt; }
        const bd = Math.hypot(x - BASE.x, y - BASE.y), wall = BASE.r + def.r;
        if (bd < wall) { x = BASE.x + (x - BASE.x) / bd * wall; y = BASE.y + (y - BASE.y) / bd * wall; }
        minWall = Math.min(minWall, Math.hypot(x - BASE.x, y - BASE.y) - wall);
    }
    return { reached: null, minWall };
}

test('without the steering a zombie chasing a player behind the base stops against the wall (the bug)', () => {
    const r = chase('normal', [BASE.x - 130, BASE.y], [BASE.x + 130, BASE.y], false, 30);
    assert.equal(r.reached, null, 'it must be stuck in the control run, or the test proves nothing');
});

for (const type of Object.keys(TYPES)) {
    for (const [name, from, target] of [
        ['straight behind the base', [BASE.x - 130, BASE.y], [BASE.x + 130, BASE.y]],
        ['behind, off to one side', [BASE.x - 120, BASE.y - 40], [BASE.x + 125, BASE.y + 30]],
        ['from above to below', [BASE.x + 20, BASE.y - 140], [BASE.x - 10, BASE.y + 140]],
    ]) {
        test(`${type}: gets round the base to a player ${name}`, () => {
            const r = chase(type, from, target, true, 40);
            assert.notEqual(r.reached, null, 'it must reach the player');
            assert.ok(r.minWall > -0.01, 'it never goes into the wall');
        });
    }
}

test('nothing changes when the target is not behind the base or the zombie is far from it', () => {
    const out = { x: 0, y: 0 };
    // far away
    avoidBase(BASE.x - 500, BASE.y, 1, 0, BASE, 20, out);
    assert.deepEqual([out.x, out.y], [1, 0]);
    // near the wall but the pull points away from the base
    avoidBase(BASE.x - 110, BASE.y, -1, 0, BASE, 20, out);
    assert.deepEqual([out.x, out.y], [-1, 0]);
    // along the wall
    avoidBase(BASE.x - 110, BASE.y, 0, 1, BASE, 20, out);
    assert.deepEqual([out.x, out.y], [0, 1]);
});

test('at the wall a head-on pull becomes a slide along it', () => {
    const out = { x: 0, y: 0 };
    avoidBase(BASE.x - (BASE.r + 20), BASE.y, 1, 0, BASE, 20, out);   // touching the wall, pulled straight in
    assert.ok(Math.abs(out.x) < 1e-9, 'no pull into the base is left');
    assert.ok(Math.abs(out.y) > 0.99, 'it all goes along the wall');
});

// What a zombie goes for: a player in range first (only the types that hunt), then a barricade in its smaller range, then the base
test('a type that hunts goes for a player in range, then a barricade, then the base', () => {
    assert.equal(pickTarget(true, 200, 320, 50, 130), 'player', 'player in range beats a barricade in range');
    assert.equal(pickTarget(true, 400, 320, 50, 130), 'struct', 'no player in range: the barricade');
    assert.equal(pickTarget(true, 400, 320, 200, 130), 'base', 'nothing in range: the base');
    assert.equal(pickTarget(true, Infinity, 320, Infinity, 130), 'base', 'no player and no barricade at all');
});

test('a type that does not hunt never goes for a player, however close: a barricade, then the base', () => {
    assert.equal(pickTarget(false, 10, 320, 50, 130), 'struct');
    assert.equal(pickTarget(false, 10, 320, 200, 130), 'base');
    assert.equal(pickTarget(false, 0, 320, Infinity, 130), 'base');
});

test('the barricade range is smaller than the player range, so a zombie does not turn back for one behind it', () => {
    assert.equal(pickTarget(true, 400, 320, 131, 130), 'base');
    assert.equal(pickTarget(true, 400, 320, 129, 130), 'struct');
});

// A zombie after a player behind barricades: the same loop as the server (direction to the target, steering, step, push out of every
// barricade), with a barricade as a { x, y, o } the way structures.js has it. Returns the steps it took to get within `near` of the target.
function chaseBehind(from, to, structs, r = 20, speed = 62, near = 25, maxSteps = 6000) {
    const z = { x: from.x, y: from.y }, out = { x: 0, y: 0 }, memo = { sense: 0, sid: 0, n: 0 }, dt = 1 / 60;
    for (let i = 0; i < maxSteps; i++) {
        let dx = to.x - z.x, dy = to.y - z.y;
        const l = Math.hypot(dx, dy);
        if (l < near) return i;
        dx /= l; dy /= l;
        avoidStructs(z.x, z.y, dx, dy, to.x, to.y, structs, r, out, memo);
        const m = Math.hypot(out.x, out.y) || 1;
        z.x += out.x / m * speed * dt; z.y += out.y / m * speed * dt;
        ARStructs.pushOutAll(z, r, structs);
    }
    return -1;
}
const bar = (x, y, o = 0) => ({ id: 1, x, y, o, t: 0, hp: 300, maxHp: 300 });

test('a zombie after a player straight behind a barricade goes round it instead of pushing at it', () => {
    assert.ok(chaseBehind({ x: 500, y: 800 }, { x: 500, y: 300 }, [bar(500, 550)]) > 0);
});

test('...whichever way the wall lies, and from any side', () => {
    assert.ok(chaseBehind({ x: 800, y: 500 }, { x: 300, y: 500 }, [bar(550, 500, 1)]) > 0, 'a standing wall, from the right');
    assert.ok(chaseBehind({ x: 500, y: 200 }, { x: 500, y: 700 }, [bar(500, 450)]) > 0, 'from above');
    assert.ok(chaseBehind({ x: 470, y: 800 }, { x: 520, y: 300 }, [bar(500, 550)]) > 0, 'a little off the middle');
});

test('a row of barricades is gone round at its end', () => {
    const row = [bar(380, 550), bar(488, 550), bar(596, 550), bar(704, 550)];
    row.forEach((s, i) => { s.id = i + 1; });
    assert.ok(chaseBehind({ x: 540, y: 800 }, { x: 540, y: 300 }, row) > 0);
});

test('a target walled in on every side cannot be reached: the zombie never gets inside a barricade (the server then makes it break one)', () => {
    const box = [bar(500, 420), bar(500, 580), bar(420, 500, 1), bar(580, 500, 1)];
    box.forEach((s, i) => { s.id = i + 1; });
    assert.equal(chaseBehind({ x: 500, y: 900 }, { x: 500, y: 500 }, box, 20, 62, 25, 3000), -1);
});

test('without a barricade near nothing changes: the pull is left as it is', () => {
    const out = { x: 0, y: 0 };
    avoidStructs(500, 900, 0, -1, 500, 100, [bar(500, 300)], 20, out);
    assert.deepEqual([out.x, out.y], [0, -1]);
    avoidStructs(500, 900, 0, -1, 500, 100, [], 20, out);
    assert.deepEqual([out.x, out.y], [0, -1]);
});

test('round the end of the wall it does not dither at the corner (it used to stop there, flipping between two sides)', () => {
    // a standing wall at x = 1550, the zombie comes from the right at the height of the wall, the player is on the left of it
    assert.ok(chaseBehind({ x: 1730, y: 1475 }, { x: 1470, y: 1470 }, [bar(1550, 1470, 1)]) > 0);
    assert.ok(chaseBehind({ x: 1730, y: 1400 }, { x: 1470, y: 1470 }, [bar(1550, 1470, 1)]) > 0);
    assert.ok(chaseBehind({ x: 1470, y: 1730 }, { x: 1470, y: 1300 }, [bar(1470, 1550, 0)]) > 0);
    assert.ok(chaseBehind({ x: 1400, y: 1730 }, { x: 1500, y: 1300 }, [bar(1470, 1550, 0)]) > 0);
});

// The way round is picked once and kept (the memo): at a head-on tie, with the zombie nudged from side to side, it never turns back
test('the way round a wall is kept: a zombie dead centre in front of a wall does not flip sides when it is nudged', () => {
    const wall = [bar(500, 550)], out = { x: 0, y: 0 }, memo = { sense: 0, sid: 0, n: 0 };
    let sign = 0;
    for (let i = 0; i < 200; i++) {
        const jitter = (i % 2 ? 0.3 : -0.3);
        avoidStructs(500 + jitter, 590, 0, -1, 500, 100, wall, 20, out, memo);
        const s = Math.sign(out.x);
        if (s !== 0) { if (sign === 0) sign = s; assert.equal(s, sign, 'the slide stays on the same side (step ' + i + ')'); }
    }
    assert.notEqual(sign, 0, 'it did slide');
});

test('head-on to the short end of a wall it goes round the end and does not flip from side to side (it used to stand there spinning)', () => {
    // the zombie and the player at almost the same height, the wall lying between them: the pull meets the end face
    assert.ok(chaseBehind({ x: 706, y: 1016 }, { x: 1045, y: 1033 }, [bar(829, 1020, 0)]) > 0);
    assert.ok(chaseBehind({ x: 1400, y: 1016 }, { x: 800, y: 1022 }, [bar(1100, 1020, 0)]) > 0);
    assert.ok(chaseBehind({ x: 1016, y: 706 }, { x: 1033, y: 1045 }, [bar(1020, 829, 1)]) > 0, 'the same, standing');
});

test('while it leans on a wall the pull along the wall the other way does not cancel the slide (it used to stop where the two balanced)', () => {
    // a wall with the target up and to the right, the zombie already near its left end: it goes on to the left end, it does not stand still
    const out = { x: 0, y: 0 }, memo = { sense: 0, sid: 0, n: 0 };
    const w = [bar(1018, 1146, 0)];
    let z = { x: 940, y: 1243 };
    for (let i = 0; i < 600; i++) {
        let dx = 1088 - z.x, dy = 1063 - z.y; const l = Math.hypot(dx, dy); if (l < 25) return;
        dx /= l; dy /= l;
        avoidStructs(z.x, z.y, dx, dy, 1088, 1063, w, 20, out, memo);
        const m = Math.hypot(out.x, out.y) || 1;
        z.x += out.x / m * 62 / 60; z.y += out.y / m * 62 / 60;
        ARStructs.pushOutAll(z, 20, w);
    }
    assert.fail('it never got to the player: ' + JSON.stringify(z));
});

test('two walls it leans on together: it follows the nearer one and does not stand between them with the slides cancelling', () => {
    assert.ok(chaseBehind({ x: 939, y: 1309 }, { x: 1030, y: 972 }, [bar(963, 1040, 0), { ...bar(1101, 1063, 1), id: 2 }]) > 0);
});

test('a pocket that no way leads out of is not a reason to spin: the zombie ends up still, not flipping direction each step', () => {
    // a U open away from the player, the player in it: unreachable by steering; what matters is that it settles
    const box = [bar(500, 580), { ...bar(420, 500, 1), id: 2 }, { ...bar(580, 500, 1), id: 3 }];   // open at the top, the zombie comes from below
    const z = { x: 500, y: 700 }, out = { x: 0, y: 0 }, memo = { sense: 0, sid: 0, n: 0 };
    let flips = 0, last = null;
    for (let i = 0; i < 1800; i++) {
        let dx = 500 - z.x, dy = 480 - z.y; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
        avoidStructs(z.x, z.y, dx, dy, 500, 480, box, 20, out, memo);
        const a = Math.atan2(out.y, out.x);
        if (last !== null && i > 600) { let da = Math.abs(a - last); if (da > Math.PI) da = 2 * Math.PI - da; if (da > 1.0) flips++; }
        last = a;
        const m = Math.hypot(out.x, out.y) || 1;
        z.x += out.x / m * 62 / 60; z.y += out.y / m * 62 / 60;
        ARStructs.pushOutAll(z, 20, box); ARStructs.pushOutAll(z, 20, box);
    }
    assert.ok(flips < 20, 'direction changed sharply ' + flips + ' times in the last 20 s');
});

// ---- turretTarget: who a turret fires at ----
const { turretTarget } = require('../../zombie-steer.js');
const zb = (id, x, y, hp = 100) => ({ id, x, y, hp, alive: true });

test('a turret fires at the nearest zombie in its range', () => {
    const z = [zb(1, 400, 0), zb(2, 200, 0), zb(3, 300, 0)];
    assert.equal(turretTarget(0, 0, 320, z, []).id, 2);
    assert.equal(turretTarget(0, 0, 150, z, []), null, 'none in range');
    assert.equal(turretTarget(0, 0, 200, z, []), null, 'the edge of the range is out');
});

test('a dead zombie is not a target', () => {
    const z = [{ ...zb(1, 100, 0), alive: false }, { ...zb(2, 150, 0), hp: 0 }, zb(3, 250, 0)];
    assert.equal(turretTarget(0, 0, 320, z, []).id, 3);
});

test('a rock or a tree in the way stops the shot: the next one it can see is the target', () => {
    const rock = { x: 100, y: 0, r: 30 };
    const z = [zb(1, 200, 0), zb(2, 250, 120)];
    assert.equal(turretTarget(0, 0, 320, z, [rock]).id, 2, 'the near one is behind the rock');
    assert.equal(turretTarget(0, 0, 320, [zb(1, 200, 0)], [rock]), null, 'nothing else to see');
    assert.equal(turretTarget(0, 0, 320, [zb(1, 200, 0)], [{ x: 100, y: 200, r: 30 }]).id, 1, 'a rock beside the line does not matter');
    assert.equal(turretTarget(0, 0, 320, [zb(1, 200, 0)], [{ x: 300, y: 0, r: 30 }]).id, 1, 'nor one behind the zombie');
});

test('turretTarget does not allocate or change the list', () => {
    const z = [zb(1, 100, 0), zb(2, 200, 0)];
    const copy = JSON.stringify(z);
    turretTarget(0, 0, 320, z, [{ x: 50, y: 50, r: 10 }]);
    assert.equal(JSON.stringify(z), copy);
});

// ---- chainTargets: where a Tesla bolt jumps ----
const { chainTargets } = require('../../zombie-steer.js');
const zc = (id, x, y, hp = 100) => ({ id, x, y, hp, alive: hp > 0 });

test('chainTargets: the bolt jumps to the nearest zombie within reach of the one it is on, at most `jumps` times', () => {
    const a = zc(1, 0, 0), b = zc(2, 100, 0), c = zc(3, 200, 10), d = zc(4, 300, 20), out = [];
    assert.deepEqual(chainTargets(a, [a, b, c, d], 130, 2, out).map(z => z.id), [1, 2, 3], 'a, b, c and not d: three bolts at most');
    assert.deepEqual(chainTargets(a, [a, b, c, d], 130, 3, out).map(z => z.id), [1, 2, 3, 4]);
    assert.deepEqual(chainTargets(a, [a, b, c, d], 130, 0, out).map(z => z.id), [1], 'no jumps: only the first');
});

test('chainTargets: it stops where nobody is within reach, never goes back, and picks the nearest', () => {
    const a = zc(1, 0, 0), far = zc(2, 400, 0), out = [];
    assert.deepEqual(chainTargets(a, [a, far], 130, 2, out).map(z => z.id), [1], 'nobody in reach: it ends there');
    const b = zc(2, 100, 0), c = zc(3, 60, 0), d = zc(4, 0, 90);
    assert.deepEqual(chainTargets(a, [a, b, c, d], 130, 2, out).map(z => z.id), [1, 3, 2], 'the nearest first (c at 60), then b at 40 from c; d at 90 from c is farther than b');
    const e = zc(5, 50, 0);
    const o2 = chainTargets(a, [a, e], 130, 5, []);
    assert.deepEqual(o2.map(z => z.id), [1, 5], 'each zombie once: the bolt does not come back to a');
});

test('chainTargets: dead zombies are skipped, and the array is reused (no allocation per shot)', () => {
    const a = zc(1, 0, 0), dead = zc(2, 50, 0, 0), b = zc(3, 90, 0), out = [9, 9, 9];
    const r = chainTargets(a, [a, dead, b], 130, 2, out);
    assert.equal(r, out, 'the same array');
    assert.deepEqual(r.map(z => z.id), [1, 3]);
});

// ---- inCone: who a Flamethrower's jet burns ----
const { inCone } = require('../../zombie-steer.js');

test('inCone: inside the range and the half angle of the jet, a body counts for the angle it fills', () => {
    assert.equal(inCone(0, 0, 0, 125, 0.42, 80, 0, 16), true, 'on the axis');
    assert.equal(inCone(0, 0, 0, 125, 0.42, 80, 30, 16), true, 'off the axis by 0.36 rad, inside the cone');
    assert.equal(inCone(0, 0, 0, 125, 0.42, 80, 60, 16), false, 'well outside the cone');
    assert.equal(inCone(0, 0, 0, 125, 0.42, 80, 44, 16), true, 'centre outside the cone (0.50 rad) but the body reaches into it');
    assert.equal(inCone(0, 0, 0, 125, 0.42, -80, 0, 16), false, 'behind the tower');
});

test('inCone: range counts from the centre of the tower to the edge of the body; the angle wraps; a zombie on the tower is always burnt', () => {
    assert.equal(inCone(0, 0, 0, 125, 0.42, 140, 0, 16), true, 'body edge at 124');
    assert.equal(inCone(0, 0, 0, 125, 0.42, 150, 0, 16), false, 'body edge at 134');
    assert.equal(inCone(0, 0, Math.PI - 0.1, 125, 0.42, -80, -8, 16), true, 'the axis points at -x: the angle wraps through pi');
    assert.equal(inCone(0, 0, 2, 125, 0.1, 5, 5, 16), true, 'inside the body radius of the centre');
});

// ---- shieldBlocks: the riot shield of a Shielded zombie ----
const { shieldBlocks } = require('../../zombie-steer.js');

test('shieldBlocks: what comes at the front (within the half angle of where the zombie faces) is stopped, from the side or the back it is not', () => {
    const half = 1.05;   // 60 degrees each side
    assert.equal(shieldBlocks(0, half, 100, 0), true, 'dead ahead');
    assert.equal(shieldBlocks(0, half, 100, 100), true, '45 degrees off');
    assert.equal(shieldBlocks(0, half, 100, 200), false, '63 degrees off: the side');
    assert.equal(shieldBlocks(0, half, 0, 100), false, 'from the side');
    assert.equal(shieldBlocks(0, half, -100, 0), false, 'from behind');
    assert.equal(shieldBlocks(0, half, -100, 50), false, 'from behind, a little off');
});

test('shieldBlocks: it goes by where the zombie faces (the angle wraps) and a zero vector blocks nothing', () => {
    const half = 1.05;
    assert.equal(shieldBlocks(Math.PI, half, -100, 10), true, 'faces -x, comes from -x');
    assert.equal(shieldBlocks(Math.PI, half, 100, 0), false, 'faces -x, comes from +x (behind)');
    assert.equal(shieldBlocks(3.0, half, 100, -10), false, 'faces about -x, the hit is from +x');
    assert.equal(shieldBlocks(-3.0, half, -100, 5), true, 'wrap through pi: -3 rad is also about -x');
    assert.equal(shieldBlocks(1.2, half, 0, 0), false);
});

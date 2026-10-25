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
    const z = { x: from.x, y: from.y }, out = { x: 0, y: 0 }, dt = 1 / 60;
    for (let i = 0; i < maxSteps; i++) {
        let dx = to.x - z.x, dy = to.y - z.y;
        const l = Math.hypot(dx, dy);
        if (l < near) return i;
        dx /= l; dy /= l;
        avoidStructs(z.x, z.y, dx, dy, to.x, to.y, structs, r, out);
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

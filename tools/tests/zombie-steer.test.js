// node --test tools/tests/zombie-steer.test.js
// A PvE zombie chasing a player on the far side of the base must get round the base instead of
// stopping against it. The loop below is the zombie's movement in server.js (unit direction, steering,
// step, rigid push-out of the base), without the rest of the game.
const test = require('node:test');
const assert = require('node:assert/strict');
const { avoidBase } = require('../../zombie-steer.js');

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

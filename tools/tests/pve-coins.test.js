// node --test tools/tests/pve-coins.test.js
// public/pve-coins.js: where the coins of a dead zombie land, who gets them, when they time out.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/pve-coins.js');

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const PICK_SQ = (20 + C.PICK_EXTRA) ** 2;

test('scatter gives n coins, 16-52 units from the zombie, inside the arena', () => {
    const r = C.scatter(1300, 1300, 9, [], 2600, 2600, rnd);
    assert.equal(r.length, 9);
    for (const [x, y] of r) { const d = Math.hypot(x - 1300, y - 1300); assert.ok(d >= 15 && d <= 53, 'd ' + d); }
});

test('scatter near the arena edge keeps every coin inside it', () => {
    for (const [ox, oy] of [[5, 5], [2595, 2595], [10, 1300], [1300, 2590]]) {
        for (const [x, y] of C.scatter(ox, oy, 9, [], 2600, 2600, rnd)) assert.ok(x >= 24 && x <= 2576 && y >= 24 && y <= 2576, x + ',' + y);
    }
});

test('no coin lands inside a tree, a rock or the base', () => {
    const blockers = [{ x: 1300, y: 1330, r: 50 }, { x: 1262, y: 1300, r: 30 }, { x: 1300, y: 1300, r: 85 }];
    for (let k = 0; k < 50; k++) {
        for (const [x, y] of C.scatter(1320, 1300, 9, blockers, 2600, 2600, rnd)) {
            for (const o of blockers) assert.ok(Math.hypot(x - o.x, y - o.y) >= o.r + 9.5 || (x === 1320 && y === 1300), 'inside ' + o.r + ' at ' + x + ',' + y);
        }
    }
});

test('a coin that finds no free spot stays by the zombie', () => {
    const wall = [{ x: 1300, y: 1300, r: 400 }];   // everything around is blocked
    const r = C.scatter(1300, 1300, 3, wall, 2600, 2600, rnd);
    assert.deepEqual(r, [[1300, 1300], [1300, 1300], [1300, 1300]]);
});

test('a living player touching a coin takes it, the others stay', () => {
    const coins = [{ id: 1, x: 100, y: 100, t: 0 }, { id: 2, x: 400, y: 400, t: 0 }];
    const p = { id: 'a', x: 110, y: 105 }, out = { taken: [], gone: [] };
    C.step(coins, [p], PICK_SQ, 1000, C.TTL_MS, out);
    assert.deepEqual(out.taken, [1, p]);
    assert.deepEqual(coins.map(c => c.id), [2]);
});

test('the pickup distance is the player radius plus a little: just inside takes, just outside does not', () => {
    const out = { taken: [], gone: [] };
    let coins = [{ id: 1, x: 100, y: 100, t: 0 }];
    C.step(coins, [{ x: 100 + 31, y: 100 }], PICK_SQ, 0, C.TTL_MS, out);
    assert.equal(out.taken.length, 2);
    coins = [{ id: 1, x: 100, y: 100, t: 0 }];
    C.step(coins, [{ x: 100 + 33, y: 100 }], PICK_SQ, 0, C.TTL_MS, out);
    assert.equal(out.taken.length, 0); assert.equal(coins.length, 1);
});

test('two players on one coin: the first in the list gets it, once', () => {
    const coins = [{ id: 7, x: 50, y: 50, t: 0 }], a = { id: 'a', x: 50, y: 50 }, b = { id: 'b', x: 52, y: 50 }, out = { taken: [], gone: [] };
    C.step(coins, [a, b], PICK_SQ, 10, C.TTL_MS, out);
    assert.deepEqual(out.taken, [7, a]);
    assert.equal(coins.length, 0);
});

test('of a pile only the coins within reach are taken; the rest wait for the player to walk on', () => {
    const coins = [120, 130, 160, 190].map((x, i) => ({ id: i + 1, x, y: 100, t: 0 })), out = { taken: [], gone: [] }, p = { x: 100, y: 100 };
    C.step(coins, [p], PICK_SQ, 0, C.TTL_MS, out);
    assert.deepEqual(out.taken.filter((_, i) => i % 2 === 0), [1, 2]);   // 20 and 30 units away are inside 32, 60 and 90 are not
    assert.deepEqual(coins.map(c => c.id), [3, 4]);
    p.x = 170; out.taken.length = 0;
    C.step(coins, [p], PICK_SQ, 0, C.TTL_MS, out);
    assert.deepEqual(out.taken.filter((_, i) => i % 2 === 0), [3, 4]);
});

test('coins older than the life time go, and are reported', () => {
    const coins = [{ id: 1, x: 0, y: 0, t: 0 }, { id: 2, x: 500, y: 500, t: 30000 }], out = { taken: [], gone: [] };
    C.step(coins, [], PICK_SQ, C.TTL_MS + 1, C.TTL_MS, out);
    assert.deepEqual(out.gone, [1]);
    assert.deepEqual(coins.map(c => c.id), [2]);
});

test('with nobody alive nothing is taken', () => {
    const coins = [{ id: 1, x: 0, y: 0, t: 0 }], out = { taken: [], gone: [] };
    C.step(coins, [], PICK_SQ, 100, C.TTL_MS, out);
    assert.equal(out.taken.length, 0); assert.equal(coins.length, 1);
});

test('trim keeps the newest coins and reports the dropped ones', () => {
    const coins = Array.from({ length: 5 }, (_, i) => ({ id: i, x: 0, y: 0, t: i }));
    assert.deepEqual(C.trim(coins, 3), [0, 1]);
    assert.deepEqual(coins.map(c => c.id), [2, 3, 4]);
    assert.deepEqual(C.trim(coins, 10), []);
});

test('sweep hands every coin to the nearest living player and empties the list', () => {
    const coins = [{ id: 1, x: 100, y: 100, t: 0 }, { id: 2, x: 900, y: 900, t: 0 }, { id: 3, x: 120, y: 90, t: 0 }];
    const a = { id: 'a', x: 90, y: 100 }, b = { id: 'b', x: 1000, y: 880 }, out = { taken: [], gone: [] };
    C.sweep(coins, [a, b], out);
    assert.deepEqual(out.taken, [1, a, 2, b, 3, a]);
    assert.equal(coins.length, 0);
});

test('sweep with nobody alive pays nobody and reports the coins gone', () => {
    const coins = [{ id: 1, x: 0, y: 0, t: 0 }, { id: 2, x: 5, y: 5, t: 0 }], out = { taken: [], gone: [] };
    C.sweep(coins, [], out);
    assert.equal(out.taken.length, 0);
    assert.deepEqual(out.gone, [1, 2]);
    assert.equal(coins.length, 0);
});

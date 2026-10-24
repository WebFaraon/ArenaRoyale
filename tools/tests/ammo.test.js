// node --test tools/tests/ammo.test.js
// public/ammo.js: the classic magazine (R, auto reload, reserve, ammo boxes), and the numbers in weapons.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../../public/ammo.js');
const ARShared = require('../../public/combat-shared.js');

const st = (o) => Object.assign({ ammo: 30, ammoMax: 30, reserve: 90, reloading: false, reloadProgress: 0 }, o);
const WEAPONS = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/weapons.json'), 'utf8'));

test('a reload moves only the missing rounds from the reserve into the magazine', () => {
    const s = st({ ammo: 10 });
    assert.equal(A.startReload(s), true);
    assert.equal(s.reloading, true);
    assert.equal(s.ammo, 10, 'the magazine keeps its rounds until the reload ends');
    assert.equal(A.stepReload(s, 1, 2), false);
    assert.equal(A.stepReload(s, 1, 2), true);
    assert.equal(s.ammo, 30); assert.equal(s.reserve, 70); assert.equal(s.reloading, false); assert.equal(s.reloadProgress, 0);
});

test('a reserve smaller than the missing rounds goes in whole, and leaves nothing', () => {
    const s = st({ ammo: 0, reserve: 7 });
    A.startReload(s); A.stepReload(s, 5, 2);
    assert.equal(s.ammo, 7); assert.equal(s.reserve, 0);
});

test('R does nothing with a full magazine, an empty reserve, or a reload already running', () => {
    assert.equal(A.startReload(st()), false);
    assert.equal(A.startReload(st({ ammo: 3, reserve: 0 })), false);
    const s = st({ ammo: 3 });
    assert.equal(A.startReload(s), true);
    s.reloadProgress = 0.5;
    assert.equal(A.startReload(s), false);
    assert.equal(s.reloadProgress, 0.5, 'a second R does not restart it');
});

test('no shot during a reload, and none from an empty magazine', () => {
    assert.equal(A.canFire(st()), true);
    assert.equal(A.canFire(st({ ammo: 0 })), false);
    assert.equal(A.canFire(st({ reloading: true })), false);
});

test('an empty magazine reloads by itself only while the trigger is held', () => {
    const idle = st({ ammo: 0 });
    assert.equal(A.autoReload(idle, false), false); assert.equal(idle.reloading, false);
    assert.equal(A.autoReload(idle, true), true); assert.equal(idle.reloading, true);
    const some = st({ ammo: 1 });
    assert.equal(A.autoReload(some, true), false, 'with a round left it keeps firing');
    const dry = st({ ammo: 0, reserve: 0 });
    assert.equal(A.autoReload(dry, true), false, 'with nothing in the reserve there is nothing to reload');
});

test('spend never goes below zero; a burst that runs out stops short', () => {
    const s = st({ ammo: 2 });
    assert.equal(A.spend(s, 1), 1); assert.equal(s.ammo, 1);
    assert.equal(A.spend(s, 1), 1); assert.equal(s.ammo, 0);
    assert.equal(A.spend(s, 1), 0); assert.equal(s.ammo, 0);
    const b = st({ ammo: 2 });
    assert.equal(A.spend(b, 3), 2);
});

test('Falcon: a 30-round magazine fires 10 bursts of 3, and each bullet costs one round', () => {
    const f = WEAPONS.weapons.burst;
    assert.equal(f.ammoMax, 30); assert.equal(f.burst.count, 3);
    const s = st({ ammo: f.ammoMax, ammoMax: f.ammoMax, reserve: f.reserveStart });
    let bursts = 0;
    while (A.canFire(s)) { let fired = 0; for (let i = 0; i < f.burst.count && s.ammo > 0; i++) fired += A.spend(s, 1); assert.equal(fired, 3); bursts++; }
    assert.equal(bursts, 10); assert.equal(s.ammo, 0);
    // 27 left after the first burst
    const t = st({ ammo: 30 }); for (let i = 0; i < 3; i++) A.spend(t, 1); assert.equal(t.ammo, 27);
});

test('an ammo box or a purchase adds to the reserve with no ceiling, only the magazine has a size', () => {
    const s = st({ reserve: 80 });
    assert.equal(A.addReserve(s, 48), 48); assert.equal(s.reserve, 128);
    assert.equal(A.addReserve(s, 48), 48); assert.equal(s.reserve, 176);
    for (let i = 0; i < 20; i++) A.addReserve(s, 60);
    assert.equal(s.reserve, 176 + 1200, 'hundreds of rounds in the reserve are fine');
    assert.equal(A.addReserve(st({ reserve: 0 }), 48), 48);
    assert.equal(A.addReserve(s, -5), 0, 'nothing negative goes in');
    // a big reserve still reloads only the missing rounds, one magazine at a time
    const t = st({ ammo: 0, reserve: 500 });
    A.startReload(t); A.stepReload(t, 5, 2);
    assert.equal(t.ammo, 30); assert.equal(t.reserve, 470);
});

test('refill: a new match or a revived player gets a full magazine, the starting reserve and no reload', () => {
    const s = st({ ammo: 3, reserve: 4, reloading: true, reloadProgress: 0.6 });
    A.refill(s, 90);
    assert.deepEqual([s.ammo, s.reserve, s.reloading, s.reloadProgress], [30, 90, false, 0]);
});

test('a bigger magazine (PvE upgrade) keeps the rounds you have; the next reload fills it', () => {
    const s = st({ ammo: 20, ammoMax: 30, reserve: 90 });
    A.setMagazine(s, 34);
    assert.equal(s.ammo, 20);
    A.startReload(s); A.stepReload(s, 9, 2);
    assert.equal(s.ammo, 34); assert.equal(s.reserve, 76);
});

test('cancelling a reload (death, a new match) leaves the magazine and the reserve as they were', () => {
    const s = st({ ammo: 5 });
    A.startReload(s); A.stepReload(s, 0.5, 2); A.cancelReload(s);
    assert.deepEqual([s.ammo, s.reserve, s.reloading, s.reloadProgress], [5, 90, false, 0]);
});

test('weapons.json: every gun has a magazine, a reserve of whole magazines, a box and a reload time', () => {
    assert.deepEqual(ARShared.checkWeapons(WEAPONS), []);
    for (const [id, w] of Object.entries(WEAPONS.weapons)) {
        assert.ok(w.reserveStart >= w.ammoMax, id + ' reserve');
        assert.ok(w.ammoBox >= 1 && w.ammoBox <= w.reserveStart, id + ' box');
        assert.ok(w.reload.seconds > 0, id + ' reload');
        const ws = ARShared.weaponStats(w);
        assert.equal(ws.reserveStart, w.reserveStart); assert.equal(ws.ammoBox, w.ammoBox); assert.equal(ws.reloadSeconds, w.reload.seconds);
    }
});

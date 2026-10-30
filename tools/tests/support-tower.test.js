// node --test tools/tests/support-tower.test.js
// The Support Tower (server.js, read as text: the server is not a module): the drone picks the most hurt thing in range, flies there (the time it announces),
// mends it slowly, goes on to the next one and goes home when nothing is hurt. And the numbers of the kind (public/structures.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ARStructs = require('../../public/structures.js');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const i0 = src.indexOf('const _dSpot'), i1 = src.indexOf('function tickTurrets(');
const block = src.slice(i0, i1);
const events = [];
const io = { to: () => ({ emit: (name, d) => events.push([name, d]) }) };
const { droneFind, droneTick } = new Function('ARStructs', 'io', block + '\nreturn { droneFind, droneTick };')(ARStructs, io);

const K = ARStructs.TURRET.kinds.support, T = K.tiers;
const tower = (extra) => Object.assign({ id: 9, k: 't', kd: 'support', x: 1000, y: 1000, t: 0, hp: 320, maxHp: 320 }, extra);
const bar = (id, x, y, hp, maxHp = 300) => ({ id, k: 'b', x, y, o: 0, t: 0, hp, maxHp });
const room = (structs, turrets) => ({ structs, turrets: turrets || [], _structDirty: false, _turretDirty: false });

test('the kind: three levels, the range, the health and the mending speed all go up with each', () => {
    assert.equal(T.length, 3);
    for (let i = 1; i < 3; i++) { assert.ok(T[i].range > T[i - 1].range && T[i].hp > T[i - 1].hp && T[i].rate > T[i - 1].rate && T[i].total > T[i - 1].total); }
    assert.ok(T[0].rate <= 15, 'slow: a barricade does not come back in a second');
    assert.equal(ARStructs.turretLimit(1, 'support'), 2); assert.equal(ARStructs.turretLimit(3, 'support'), 4);
});

test('the drone picks the most hurt (the lowest share of its health) within the range, never one out of range, never the tower itself', () => {
    const t = tower(), a = bar(1, 1100, 1000, 150), b = bar(2, 1000, 1100, 60), far = bar(3, 1000 + T[0].range + 60, 1000, 1), full = bar(4, 1050, 1000, 300);
    const r = room([a, b, far, full], [t]);
    assert.equal(droneFind(r, t, T[0]), b);
    r.structs.length = 0; r.structs.push(far, full);
    assert.equal(droneFind(r, t, T[0]), null, 'nothing hurt in range');
    t.hp = 10;
    assert.equal(droneFind(r, t, T[0]), null, 'it does not mend its own tower');
    const t2 = { id: 8, k: 't', kd: 'mg', x: 1000, y: 1150, t: 0, hp: 50, maxHp: 300 };
    r.turrets.push(t2);
    assert.equal(droneFind(r, t, T[0]), t2, 'it mends other turrets');
    assert.equal(droneFind(r, t, T[2]), far, 'the third level reaches the one that was out of range (the upgrade widens the range)');
});

test('a flight: takeoff + the distance at the drone speed; it mends only after it has got there; slowly; then home when all is mended', () => {
    events.length = 0;
    const t = tower(), s = bar(1, 1100, 1000, 100), r = room([s], [t]), tier = T[0];
    droneTick('X', r, t, tier, 1 / 60, 1000);                       // on the pad, something hurt: off it goes
    assert.equal(events.length, 1); assert.equal(events[0][0], 'drone-go');
    const spot = ARStructs.droneSpot(s, {}), want = K.drone.takeoff + Math.round(Math.hypot(spot.x - t.x, spot.y - t.y) / K.drone.speed * 1000);
    assert.deepEqual(events[0][1], { id: 9, tk: 's', tid: 1, ms: want });
    droneTick('X', r, t, tier, 1 / 60, 1000 + want - 50);            // not there yet: nothing mended
    assert.equal(s.hp, 100);
    droneTick('X', r, t, tier, 1 / 60, 1000 + want);                 // there: the first drop of mending
    droneTick('X', r, t, tier, 1 / 60, 1000 + want + 17);
    assert.ok(s.hp > 100 && s.hp < 101, 'a few hundredths of a health a tick, ' + s.hp);
    assert.ok(r._structDirty, 'the health goes out in the usual batch');
    for (let i = 0; i < 60 * 5; i++) droneTick('X', r, t, tier, 1 / 60, 3000 + i * 16);   // five seconds more
    assert.ok(s.hp > 100 + 4 * tier.rate && s.hp < 100 + 6 * tier.rate, 'about rate a second: ' + s.hp);
    s.hp = 299.99;
    droneTick('X', r, t, tier, 1 / 30, 10000);
    assert.equal(s.hp, 300);
    assert.equal(events.at(-1)[0], 'drone-home', 'nothing else is hurt: home');
    const home = events.at(-1)[1];
    assert.equal(home.id, 9); assert.ok(home.ms >= K.drone.landing);
    droneTick('X', r, t, tier, 1 / 60, 10000 + 100);                 // still on its way home
    assert.equal(events.length >= 2, true);
    const n = events.length;
    droneTick('X', r, t, tier, 1 / 60, 10000 + home.ms + 10);        // landed, and nothing to do
    assert.equal(events.length, n, 'waits on the pad');
});

test('it goes on to the next hurt thing without going home, and drops what is destroyed under it', () => {
    events.length = 0;
    const t = tower(), a = bar(1, 1100, 1000, 290), b = bar(2, 1000, 1100, 200), r = room([a, b], [t]), tier = T[1];
    droneTick('X', r, t, tier, 1 / 60, 0);                           // the most hurt first: b
    assert.equal(events[0][1].tid, 2);
    droneTick('X', r, t, tier, 1 / 60, 5000);                        // arrived, mending b
    b.hp = 299.9; droneTick('X', r, t, tier, 1 / 30, 5100);          // b done: on to a, not home
    assert.equal(events.at(-1)[0], 'drone-go'); assert.equal(events.at(-1)[1].tid, 1);
    r.structs.splice(r.structs.indexOf(a), 1);                       // a is destroyed on the way
    droneTick('X', r, t, tier, 1 / 60, 9000);                        // it arrives at a gone thing: nothing else hurt, so home
    assert.equal(events.at(-1)[0], 'drone-home');
});

test('the server wires it in: the inventory, the shop, a stunned tower does not mend', () => {
    assert.match(src, /newInv = \(\) => \(\{[^}]*support: 0 \}\)/);
    assert.match(src, /\['support', 'support'\]\]\);/);
    assert.match(src, /if \(t\.stunUntil > now\) continue;[^\n]*\n\s*if \(t\.kd === 'support'\) \{ droneTick/, 'the stun check comes before the drone');
});

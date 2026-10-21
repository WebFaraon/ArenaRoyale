// node --test tools/tests/skin-fx.test.js
// public/skin-fx.js: reading a skin's "fx" block, and the particle pool of the mythic weapon skins.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../../public/skin-fx.js');

let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const SKINS = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/images/weapons/skins/weapon-skin-sprites.json'), 'utf8')).skins;

test('parseFx reads the Viespe block of the real file', () => {
    const fx = F.parseFx(SKINS.smg_hornet.fx);
    assert.ok(fx, 'smg_hornet has fx');
    assert.deepEqual(fx.aura.at, [0, 56]);
    assert.equal(fx.aura.radius, 46);
    assert.equal(fx.pollen.rate, 9);
    assert.deepEqual(fx.pollen.life, [0.8, 1.6]);
    assert.equal(fx.bullets.trailPollen, true);
    assert.equal(fx.flash.colors.length, 3);
});

test('parseFx clamps nonsense and drops what is missing', () => {
    assert.equal(F.parseFx(null), null);
    assert.equal(F.parseFx({}), null);
    assert.equal(F.parseFx({ bullets: { style: 'capsule' } }), null);
    const fx = F.parseFx({ pollen: { ratePerSecond: 9999, life: [5, -1], size: ['a', 3], color: 'red' }, aura: { radius: 1e6, alpha: [2, 0.5] } });
    assert.equal(fx.pollen.rate, 20);
    assert.deepEqual(fx.pollen.life, [0.1, 3]);   // clamped, then ordered
    assert.equal(fx.pollen.color, '#FFC21F');
    assert.equal(fx.aura.radius, 120);
    assert.ok(fx.aura.alpha[0] <= fx.aura.alpha[1] && fx.aura.alpha[1] <= 1);
    assert.equal(fx.pulse, null);
});

test('toWorld follows the gun frame: angle 0 aims down, -PI/2 aims right', () => {
    const d = F.toWorld(100, 100, 0, 0, 10);
    assert.ok(Math.abs(d[0] - 100) < 1e-9 && Math.abs(d[1] - 110) < 1e-9);
    const r = F.toWorld(100, 100, -Math.PI / 2, 0, 10);
    assert.ok(Math.abs(r[0] - 110) < 1e-9 && Math.abs(r[1] - 100) < 1e-9);
});

test('step moves, ages and removes particles without holes', () => {
    const pool = F.createPool(8);
    for (let i = 0; i < 6; i++) F.spawn(pool, i, 0, 10, 0, 0.1 + i * 0.1, 1);
    F.step(pool, 0.25);   // the first two (0.1, 0.2) are gone
    assert.equal(pool.n, 4);
    for (let i = 0; i < pool.n; i++) assert.ok(pool.age[i] < pool.life[i]);
    F.step(pool, 5);
    assert.equal(pool.n, 0);
});

test('a full pool skips new particles instead of growing', () => {
    const pool = F.createPool(3);
    assert.ok(F.spawn(pool, 0, 0, 0, 0, 1, 1)); assert.ok(F.spawn(pool, 0, 0, 0, 0, 1, 1)); assert.ok(F.spawn(pool, 0, 0, 0, 0, 1, 1));
    assert.equal(F.spawn(pool, 0, 0, 0, 0, 1, 1), false);
    assert.equal(pool.n, 3);
});

test('emitPollen: about `rate` per second, near the wings, drifting back from the aim', () => {
    const fx = F.parseFx(SKINS.smg_hornet.fx), pool = F.createPool(200), em = { acc: 0 };
    const S = 0.85, angle = -Math.PI / 2;          // aiming right
    let n = 0;
    for (let i = 0; i < 600; i++) n += F.emitPollen(pool, em, fx, 500, 500, angle, S, 1 / 60, rnd);   // 10 s
    assert.ok(n >= 85 && n <= 95, 'emitted ' + n);
    for (let i = 0; i < pool.n; i++) {
        assert.ok(pool.x[i] > 500 - 1, 'x ' + pool.x[i]);   // gun +y is +x: they start ahead of the centre ...
        assert.ok(pool.vx[i] < 30 * S, 'vx ' + pool.vx[i]); // ... and drift back (-x), the random part aside
    }
});

test('emitPollen: a long frame is not a burst', () => {
    const fx = F.parseFx(SKINS.smg_hornet.fx), pool = F.createPool(200);
    assert.ok(F.emitPollen(pool, { acc: 0 }, fx, 0, 0, 0, 0.85, 5, rnd) <= 3);
});

test('bullet pollen only for skins that ask for it', () => {
    const pool = F.createPool(50);
    assert.equal(F.emitBulletPollen(pool, { acc: 0 }, { bullets: { trailPollen: false } }, 0, 0, 0.85, 1, rnd), 0);
    assert.equal(F.emitBulletPollen(pool, { acc: 0 }, null, 0, 0, 0.85, 1, rnd), 0);
    assert.ok(F.emitBulletPollen(pool, { acc: 0 }, F.parseFx(SKINS.smg_hornet.fx), 0, 0, 0.85, 0.2, rnd) >= 1);
    for (let i = 0; i < pool.n; i++) assert.equal(pool.kind[i], 1, 'bullet pollen is a spark, not an outlined hexagon');
});

test('auraAlpha breathes inside its range; pulseAt runs down the gun and ends', () => {
    const fx = F.parseFx(SKINS.smg_hornet.fx);
    for (let t = 0; t < 5000; t += 137) { const a = F.auraAlpha(fx, t); assert.ok(a >= 0.2 - 1e-9 && a <= 0.27 + 1e-9, 'alpha ' + a); }
    assert.equal(F.pulseAt(fx, -1), null);
    assert.equal(F.pulseAt(fx, 160), null);
    const p0 = F.pulseAt(fx, 0), p1 = F.pulseAt(fx, 80);
    assert.ok(p0.y < p1.y && p1.y < 96);
    assert.ok(p1.a < p0.a);
});

// node --test tools/tests/        (Node 20+)
// public/interp.js: zombies and enemy bullets between server snapshots, at 60 / 144 / 240 Hz simulated.
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../../public/interp.js');

const TICK = 1000 / 60, DELAY = 34, EXTRAP = 100;
// small deterministic PRNG for the packet jitter
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// The server's world: a zombie walking in a straight line (62 px/s), another one turning through the +-pi wrap,
// a bullet at 1000 px/s. Snapshots as game.js stores them: { st, arrive, z: flat list, bullets: [{id,x,y,dx,dy}] }
function makeSnapshots(n, seed) {
    const r = rng(seed), snaps = [];
    const V = 62, hd = 0.52;                       // heading of zombie 0
    const bvx = 1000 * Math.cos(0.35), bvy = 1000 * Math.sin(0.35);
    for (let k = 0; k < n; k++) {
        const T = k * TICK / 1000;
        const z0 = [0, Math.round(500 + Math.cos(hd) * V * T), Math.round(500 + Math.sin(hd) * V * T), Math.round(hd * 100), 100, 0];
        let a = 2.9 + 1.2 * T; a = ((a + Math.PI) % (2 * Math.PI)) - Math.PI;          // turns at 1.2 rad/s, wraps to negative past pi
        const z1 = [1, Math.round(900 + 30 * T), Math.round(900), Math.round(a * 100), 100, 0];
        const bullets = [];
        if (k >= 100 && k < 190) { const bt = (k - 100 + 1) * TICK / 1000; bullets.push({ id: 7, x: Math.round(100 + bvx * bt), y: Math.round(100 + bvy * bt), dx: Math.round(bvx), dy: Math.round(bvy) }); }
        snaps.push({ st: k * TICK, arrive: k * TICK + 4 + r() * 12, z: z0.concat(z1), bullets });
    }
    return snaps;
}

// Frames at `hz` for 4 s of steady play; the page draws the world at (frame time - DELAY) from what has arrived.
function simulate(hz, mode) {
    const snaps = makeSnapshots(400, 12345), period = 1000 / hz, frames = [];
    const loc = {}, bb = {}, targets = [{ x: 0, y: 0, angle: 0 }, { x: 0, y: 0, angle: 0 }];
    for (let f = 1500; f < 5500; f += period) {
        let buf = snaps.filter(s => s.arrive <= f); buf = buf.slice(-20);
        const renderTime = f - DELAY;
        I.locate(buf, renderTime, EXTRAP, loc);
        const sOld = buf[loc.a], sNew = buf[loc.b];
        const last = buf[buf.length - 1];
        if (mode === 'legacy') { targets[0].x = last.z[1]; targets[0].y = last.z[2]; targets[1].angle = last.z[9] / 100; }
        else I.zombies(sOld.z, sNew.z, loc.t, targets, 120);
        I.bulletBase(buf, loc, renderTime, EXTRAP, bb);
        let bx = null, by = null;
        if (mode === 'legacy') { const b = last.bullets[0]; const age = Math.min((f - last.arrive) / 1000, 0.05); if (b) { bx = b.x + b.dx * age; by = b.y + b.dy * age; } }
        else { const b = buf[bb.base].bullets[0]; if (b) { bx = b.x + b.dx * bb.age; by = b.y + b.dy * bb.age; } }
        frames.push({ t: f, zx: targets[0].x, zy: targets[0].y, za: targets[1].angle, bx, by, renderTime });
    }
    return frames;
}
// apparent speed per frame along the path
function stats(frames, key) {
    const v = []; let still = 0, back = 0;
    for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1], b = frames[i];
        if (a[key + 'x'] === null || b[key + 'x'] === null) continue;
        const dt = (b.t - a.t) / 1000, dx = b[key + 'x'] - a[key + 'x'], dy = b[key + 'y'] - a[key + 'y'];
        const d = Math.hypot(dx, dy); v.push(d / dt); if (d < 1e-9) still++;
        if (key === 'b' && dx * Math.cos(0.35) + dy * Math.sin(0.35) < -1e-9) back++;
    }
    // mean speed = net distance over time (the mean of per-frame step lengths would count the 1 px rounding noise as extra distance)
    let first = null, last = null; for (const f of frames) { if (f[key + 'x'] === null) continue; if (!first) first = f; last = f; }
    const mean = Math.hypot(last[key + 'x'] - first[key + 'x'], last[key + 'y'] - first[key + 'y']) / ((last.t - first.t) / 1000);
    const m = v.reduce((x, y) => x + y, 0) / v.length, sd = Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length);
    return { mean, cv: sd / m, stillPct: 100 * still / v.length, back, n: v.length };
}

for (const hz of [60, 144, 240]) {
    test(`zombie at ${hz} Hz: right speed, almost no still frames, close to the true path`, () => {
        const fr = simulate(hz, 'interp'), s = stats(fr, 'z');
        assert.ok(Math.abs(s.mean - 62) < 1.5, `mean speed ${s.mean.toFixed(1)} px/s`);
        assert.ok(s.stillPct < 8, `still frames ${s.stillPct.toFixed(1)}%`);          // 1 px rounding on the server: a rare tick without a step
        assert.ok(s.cv < 0.75, `speed CV ${s.cv.toFixed(2)}`);
        // position error against where the zombie really was at render time: the server rounds to whole pixels
        let worst = 0;
        for (const f of fr) { const T = f.renderTime / 1000; worst = Math.max(worst, Math.hypot(f.zx - (500 + Math.cos(0.52) * 62 * T), f.zy - (500 + Math.sin(0.52) * 62 * T))); }
        assert.ok(worst < 1.2, `worst position error ${worst.toFixed(2)} px`);
    });
    test(`enemy bullet at ${hz} Hz: never backwards, steady speed`, () => {
        const fr = simulate(hz, 'interp').filter(f => f.bx !== null), s = stats(fr, 'b');
        assert.equal(s.back, 0, 'frames moving backwards');
        assert.ok(Math.abs(s.mean - 1000) < 25, `mean speed ${s.mean.toFixed(0)} px/s`);
        assert.ok(s.cv < 0.2, `speed CV ${s.cv.toFixed(3)}`);
    });
    test(`turning zombie at ${hz} Hz: the angle crosses +-pi without a spin`, () => {
        const fr = simulate(hz, 'interp'); let worst = 0;
        for (let i = 1; i < fr.length; i++) {
            let d = fr[i].za - fr[i - 1].za; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
            worst = Math.max(worst, Math.abs(d) / ((fr[i].t - fr[i - 1].t) / 1000));
        }
        assert.ok(worst < 2.2, `fastest turn ${worst.toFixed(2)} rad/s (true 1.2)`);
    });
}

test('same instant, same picture: 60, 144 and 240 Hz place the zombie and the bullet identically', () => {
    const runs = [60, 144, 240].map(hz => simulate(hz, 'interp'));
    for (const T of [2000, 2250, 3500, 4750]) {
        const at = runs.map(fr => fr.find(f => Math.abs(f.t - T) < 1e-6));
        assert.ok(at.every(Boolean), 'common frame times exist at ' + T);
        for (const k of ['zx', 'zy', 'bx', 'by']) assert.ok(Math.abs(at[0][k] - at[1][k]) < 1e-6 && Math.abs(at[0][k] - at[2][k]) < 1e-6, `${k} at ${T}`);
    }
});

test('the old drawing (latest packet) fails the same checks: the tests can see the problem', () => {
    const z = stats(simulate(240, 'legacy'), 'z'), b = stats(simulate(144, 'legacy').filter(f => f.bx !== null), 'b');
    assert.ok(z.stillPct > 50, `zombie still frames at 240 Hz were ${z.stillPct.toFixed(0)}%`);
    assert.ok(b.back > 0 || b.cv > 0.3, `bullet backward frames ${b.back}, CV ${b.cv.toFixed(2)}`);
});

test('locate: before the oldest snapshot, between, exactly on one, and the extrapolation cap', () => {
    const buf = [0, 1, 2, 3].map(i => ({ st: i * 16.667 })), o = {};
    I.locate(buf, -5, 100, o); assert.deepEqual([o.a, o.b, o.t, o.extrap], [0, 0, 0, false]);
    I.locate(buf, 25, 100, o); assert.equal(o.a, 1); assert.equal(o.b, 2); assert.ok(Math.abs(o.t - (25 - 16.667) / 16.667) < 1e-9);
    I.locate(buf, 16.667, 100, o); assert.equal(o.a, 1); assert.ok(Math.abs(o.t) < 1e-9);
    I.locate(buf, 50.001 + 40, 100, o); assert.equal(o.b, 3); assert.ok(o.extrap && o.t > 1);
    I.locate(buf, 50.001 + 5000, 100, o); assert.ok(Math.abs(o.t - (1 + 100 / 16.667)) < 1e-9, 'capped at 1 + extrapMs / span');
});

test('zombies: spawn, death, jump and gaps in the id list', () => {
    const old = [0, 100, 100, 0, 100, 0, 2, 300, 300, 0, 100, 0];
    const nw = [0, 110, 100, 0, 100, 0, 1, 50, 60, 157, 100, 1, 2, 900, 900, 0, 100, 0];   // 1 is new, 2 jumped 850 px
    const tg = [{ x: 0, y: 0, angle: 0 }, { x: 0, y: 0, angle: 0 }, { x: 0, y: 0, angle: 0 }];
    I.zombies(old, nw, 0.5, tg, 120);
    assert.equal(tg[0].x, 105); assert.equal(tg[1].x, 50); assert.ok(Math.abs(tg[1].angle - 1.57) < 1e-9); assert.equal(tg[2].x, 900, 'a jump is not blended');
    I.zombies(null, nw, 0, tg, 120); assert.equal(tg[0].x, 110, 'no older snapshot: put at the new place');
    I.zombies(old, [], 0.5, tg, 120); assert.equal(tg[0].x, 110, 'an empty list changes nothing');
    I.zombies(old, null, 0.5, tg, 120);
});

test('lerpAngle takes the short way round', () => {
    assert.ok(Math.abs(I.lerpAngle(3.1, -3.1, 0.5) - (3.1 + (2 * Math.PI - 6.2) / 2)) < 1e-9);
    assert.equal(I.lerpAngle(1, 2, 0), 1); assert.equal(I.lerpAngle(1, 2, 1), 2);
});

test('bulletBase: a bullet only in the newer snapshot is not drawn yet; past the newest the age is capped', () => {
    const buf = [{ st: 0 }, { st: 16.667 }, { st: 33.333 }], o = {}, l = {};
    I.locate(buf, 20, 100, l); I.bulletBase(buf, l, 20, 100, o); assert.equal(o.base, 1); assert.ok(Math.abs(o.age - 0.003333) < 1e-6);
    I.locate(buf, 500, 100, l); I.bulletBase(buf, l, 500, 100, o); assert.equal(o.base, 2); assert.equal(o.age, 0.1);
    I.locate(buf, -10, 100, l); I.bulletBase(buf, l, -10, 100, o); assert.equal(o.age, 0);
});

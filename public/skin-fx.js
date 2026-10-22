// ============================================
// ARENA ROYALE - skin-fx.js
// The effects of the mythic weapon skins (weapon-skin-sprites.json "fx"): a glow under the player, a light that runs
// down the gun at each shot, hexagon pollen drifting off the player and off the bullets, a star at the muzzle, needle
// bullets with a glow. This file is the pure part: reading and checking the "fx" block, and the particles (one fixed pool
// of typed arrays, no allocation per frame). Drawing is game.js (sprites painted once per scale, like every other sprite).
// Visual only: nothing here touches the shot, the hit or the packet. Pure (no DOM): the browser loads it as
// window.ARSkinFx, tools/tests/skin-fx.test.js tests it.
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARSkinFx = api;
})(this, function () {
    'use strict';

    const MAX_PARTICLES = 80;   // alive at once for the whole screen: a full pool just skips the new ones
    const PARTICLE_VIS = 1.6;   // pollen is drawn this much bigger than its raw size: at match zoom the raw size is a dot

    const num = (v, min, max, dflt) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt);
    const pair = (v, min, max, d0, d1) => (Array.isArray(v) && v.length === 2
        ? [num(v[0], min, max, d0), num(v[1], min, max, d1)] : [d0, d1]);
    const color = (v, d) => (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : d);
    const range = (v, min, max, d0, d1) => { const r = pair(v, min, max, d0, d1); return r[0] <= r[1] ? r : [r[1], r[0]]; };

    // The "fx" of a skin in weapon-skin-sprites.json -> the numbers the game uses, each clamped; a part that is missing stays
    // null (it is not drawn). Units: the gun's (the same as hands / muzzle), seconds, 0-1 alphas.
    function parseFx(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const out = { aura: null, pulse: null, pollen: null, flash: null, bullets: null };
        const a = raw.aura;
        if (a && typeof a === 'object') out.aura = {
            at: pair(a.at, -200, 200, 0, 56), radius: num(a.radius, 4, 120, 46), color: color(a.color, '#FFC21F'),
            alpha: range(a.alpha, 0, 1, 0.2, 0.27), period: num(a.pulseSeconds, 0.4, 20, 2.1),
        };
        const p = raw.abdomenPulse;
        if (p && typeof p === 'object') out.pulse = {
            seconds: num(p.seconds, 0.05, 1, 0.16), from: pair(p.from, -200, 200, 0, 57), to: pair(p.to, -200, 200, 0, 96),
            color: color(p.color, '#FFE278'), radius: num(p.radius, 1, 40, 8),
        };
        const q = raw.pollen;
        if (q && typeof q === 'object') out.pollen = {
            rate: num(q.ratePerSecond, 0, 20, 9), spawnX: range(q.spawnX, 0, 120, 14, 36), spawnY: range(q.spawnY, -50, 200, 16, 40),
            speedBack: range(q.speedBack, 0, 200, 10, 30), life: range(q.life, 0.1, 3, 0.8, 1.6), size: range(q.size, 0.2, 8, 1, 2.4),
            color: color(q.color, '#FFC21F'), outline: color(q.outline, '#0B0F1A'),
        };
        const f = raw.muzzleFlash;
        if (f && typeof f === 'object') out.flash = { colors: [color((f.colors || [])[0], '#0B0F1A'), color((f.colors || [])[1], '#FFD84A'), color((f.colors || [])[2], '#FFFFFF')] };
        const b = raw.bullets;
        if (b && typeof b === 'object' && b.style === 'needle') out.bullets = {
            colors: [color((b.colors || [])[0], '#FFC21F'), color((b.colors || [])[1], '#FFF3B0')], outline: color(b.outline, '#0B0F1A'),
            glowRadius: num(b.glowRadius, 0, 60, 22), trailPollen: !!b.trailPollen,
        };
        return out.aura || out.pulse || out.pollen || out.flash || out.bullets ? out : null;
    }

    // Where a point (lx, ly) of the gun's frame lies in the world, for a player at (px, py) drawn with `angle` (what
    // _drawPlayerFigure gets): the same turn as game.js _setRotated, whose +y is the aim (angle 0 = aim down)
    function toWorld(px, py, angle, lx, ly) {
        const cs = Math.cos(angle), sn = Math.sin(angle);
        return [px + lx * cs - ly * sn, py + lx * sn + ly * cs];
    }

    function createPool(max) {
        const n = max || MAX_PARTICLES;
        return { n: 0, max: n, x: new Float32Array(n), y: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n),
                 age: new Float32Array(n), life: new Float32Array(n), size: new Float32Array(n), kind: new Uint8Array(n) };
    }
    function clear(pool) { pool.n = 0; }

    // kind: 0 = pollen (a hexagon with an ink outline), 1 = a spark off a bullet (a small bright dot: at its size an outline would be all there is)
    function spawn(pool, x, y, vx, vy, life, size, kind) {
        if (pool.n >= pool.max) return false;
        const i = pool.n++;
        pool.x[i] = x; pool.y[i] = y; pool.vx[i] = vx; pool.vy[i] = vy; pool.age[i] = 0; pool.life[i] = life; pool.size[i] = size; pool.kind[i] = kind || 0;
        return true;
    }

    // Moves and ages the particles (a little drag, so they hang in the air); the dead ones are swapped out
    function step(pool, dt) {
        const drag = Math.max(0, 1 - dt);
        for (let i = 0; i < pool.n; i++) {
            pool.age[i] += dt;
            if (pool.age[i] >= pool.life[i]) {
                const l = --pool.n;
                if (i !== l) {
                    pool.x[i] = pool.x[l]; pool.y[i] = pool.y[l]; pool.vx[i] = pool.vx[l]; pool.vy[i] = pool.vy[l];
                    pool.age[i] = pool.age[l]; pool.life[i] = pool.life[l]; pool.size[i] = pool.size[l]; pool.kind[i] = pool.kind[l];
                }
                i--;
                continue;
            }
            pool.x[i] += pool.vx[i] * dt; pool.y[i] += pool.vy[i] * dt;
            pool.vx[i] *= drag; pool.vy[i] *= drag;
        }
    }

    // Pollen coming off a player at (px, py): near the wings, drifting back from the aim. em = { acc } is the emitter's own
    // counter (one per player); S = the world scale of the gun units; rnd() in [0, 1)
    function emitPollen(pool, em, fx, px, py, angle, S, dt, rnd) {
        const p = fx && fx.pollen;
        if (!p || p.rate <= 0) return 0;
        em.acc = Math.min(3, (em.acc || 0) + p.rate * dt);   // a long frame never makes a burst
        const sn = Math.sin(angle), cs = Math.cos(angle);
        let n = 0;
        while (em.acc >= 1) {
            em.acc -= 1;
            const side = rnd() < 0.5 ? -1 : 1;
            const lx = side * (p.spawnX[0] + rnd() * (p.spawnX[1] - p.spawnX[0])) * S;
            const ly = (p.spawnY[0] + rnd() * (p.spawnY[1] - p.spawnY[0])) * S;
            const w = toWorld(px, py, angle, lx, ly);
            const sp = (p.speedBack[0] + rnd() * (p.speedBack[1] - p.speedBack[0])) * S;
            // back = away from the aim (the aim is (-sin, cos))
            const vx = sn * sp + (rnd() - 0.5) * 50 * S, vy = -cs * sp + (rnd() - 0.5) * 50 * S;
            const life = p.life[0] + rnd() * (p.life[1] - p.life[0]);
            const size = (p.size[0] + rnd() * (p.size[1] - p.size[0])) * 0.7 * S * PARTICLE_VIS;
            if (spawn(pool, w[0], w[1], vx, vy, life, size)) n++;
        }
        return n;
    }

    // Small pollen left along a bullet's path (rate per second per bullet); em = { acc } of that bullet's owner
    const BULLET_POLLEN_RATE = 24;   // per bullet per second (the artifact: 0.4 a frame at 60 fps)
    function emitBulletPollen(pool, em, fx, x, y, S, dt, rnd) {
        if (!fx || !fx.bullets || !fx.bullets.trailPollen) return 0;
        em.acc = Math.min(3, (em.acc || 0) + BULLET_POLLEN_RATE * dt);
        let n = 0;
        while (em.acc >= 1) {
            em.acc -= 1;
            if (spawn(pool, x, y, (rnd() - 0.5) * 30 * S, (rnd() - 0.5) * 30 * S, 0.25, 0.7 * S * PARTICLE_VIS * 1.5, 1)) n++;
        }
        return n;
    }

    // The aura's alpha at a time (ms): it breathes between the two values
    function auraAlpha(fx, nowMs) {
        const a = fx && fx.aura;
        if (!a) return 0;
        const k = 0.5 + 0.5 * Math.sin(nowMs / 1000 * Math.PI * 2 / a.period);
        return a.alpha[0] + (a.alpha[1] - a.alpha[0]) * k;
    }

    // The light that runs down the gun after a shot, ageMs after it: { x, y (gun units), a } or null when it is over
    function pulseAt(fx, ageMs) {
        const p = fx && fx.pulse;
        if (!p || !(ageMs >= 0)) return null;
        const dur = p.seconds * 1000;
        if (ageMs >= dur) return null;
        const k = ageMs / dur;
        return { x: p.from[0] + (p.to[0] - p.from[0]) * k, y: p.from[1] + (p.to[1] - p.from[1]) * k, a: 0.8 * (1 - k * 0.5) };
    }

    return { MAX_PARTICLES: MAX_PARTICLES, PARTICLE_VIS: PARTICLE_VIS, parseFx: parseFx, toWorld: toWorld, createPool: createPool, clear: clear,
             spawn: spawn, step: step, emitPollen: emitPollen, emitBulletPollen: emitBulletPollen, auraAlpha: auraAlpha, pulseAt: pulseAt };
});

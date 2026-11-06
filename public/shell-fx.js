// Spent cartridges: each shot throws a casing out of the side of the gun; it hops, lands, bounces once or twice, skids to a stop, lies there a moment and
// shrinks away. Visual only (the server never hears of it), and part of the "Fine effects".
//
// Made to cost nothing, like public/impact-fx.js: ONE fixed pool in typed arrays (nothing is allocated per frame or per shot), at most MAX_SPAWN a frame,
// casings shrink to nothing instead of fading (so a colour is one path: one stroke and one fill), nothing is drawn when nothing is alive.
//
//   ARShells.eject(kind, x, y, dx, dy, quality, rand)   kind: 'pistol' | 'smg' | 'rifle' | 'long' | 'shell'; (x, y) the gun's port, (dx, dy) the way it aims
//   ARShells.beginFrame() / step(dt) / draw(ctx, left, top, right, bottom)   once a frame, in that order; draw with the world transform set
//   ARShells.reset() / count() / MAX / MAX_SPAWN / KINDS (tests, a new match)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARShells = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX = 96, MAX_SPAWN = 10, GRAVITY = 640, INK = '#0B0F1A';
    const COLS = ['#E8B93E', '#B8862A', '#D8453A'];   // brass, dark brass (the base of a casing), shotgun red
    // per kind: length and width (world units), body colour, base colour (drawn at the back end, -1 none), speed out of the gun, hop speed, life (s)
    const KINDS = {
        pistol: { len: 5.4, wid: 2.7, body: 0, base: 1, spd: [70, 125], vz: [95, 150], life: [0.9, 1.25] },
        smg:    { len: 4.8, wid: 2.5, body: 0, base: 1, spd: [75, 135], vz: [95, 150], life: [0.8, 1.1] },
        rifle:  { len: 7.2, wid: 2.9, body: 0, base: 1, spd: [80, 140], vz: [100, 160], life: [0.9, 1.3] },
        long:   { len: 10.5, wid: 3.5, body: 0, base: 1, spd: [60, 110], vz: [100, 150], life: [1.0, 1.5] },
        shell:  { len: 8.6, wid: 4.6, body: 2, base: 0, spd: [70, 125], vz: [105, 165], life: [1.1, 1.6] },
    };
    const NAMES = Object.keys(KINDS), KIND_ID = {};
    NAMES.forEach((n, i) => { KIND_ID[n] = i; });
    const LIST = NAMES.map(n => KINDS[n]);

    const X = new Float32Array(MAX), Y = new Float32Array(MAX), Z = new Float32Array(MAX), VX = new Float32Array(MAX), VY = new Float32Array(MAX), VZ = new Float32Array(MAX);
    const ROT = new Float32Array(MAX), VR = new Float32Array(MAX), AGE = new Float32Array(MAX), LIFE = new Float32Array(MAX);
    const KIND = new Uint8Array(MAX), BOUNCE = new Uint8Array(MAX);
    let head = 0, live = 0, spawned = 0;
    const lerp = (a, b, t) => a + (b - a) * t;

    function eject(kind, x, y, dx, dy, quality, rand) {
        const id = KIND_ID[kind];
        if (id === undefined || !(quality > 0) || spawned >= MAX_SPAWN) return 0;
        rand = rand || Math.random;
        if (quality < 1 && rand() > quality) return 0;   // a struggling device throws fewer of them
        const k = LIST[id], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const rx = -uy, ry = ux;   // the shooter's right hand (the y axis points down the screen)
        const ang = Math.atan2(ry, rx) + (rand() - 0.5) * 0.8, spd = lerp(k.spd[0], k.spd[1], rand());
        const i = head; head = (head + 1) % MAX;   // the oldest one makes room: a shot never fails
        X[i] = x + rx * 3; Y[i] = y + ry * 3; Z[i] = 9;
        VX[i] = Math.cos(ang) * spd - ux * 22; VY[i] = Math.sin(ang) * spd - uy * 22; VZ[i] = lerp(k.vz[0], k.vz[1], rand());
        ROT[i] = rand() * 6.2832; VR[i] = (rand() < 0.5 ? -1 : 1) * lerp(9, 22, rand());
        AGE[i] = 0; LIFE[i] = lerp(k.life[0], k.life[1], rand()); KIND[i] = id; BOUNCE[i] = 0;
        spawned++;
        return 1;
    }
    function beginFrame() { spawned = 0; }
    function step(dt) {
        live = 0;
        for (let i = 0; i < MAX; i++) {
            if (LIFE[i] <= 0) continue;
            AGE[i] += dt;
            if (AGE[i] >= LIFE[i]) { LIFE[i] = 0; continue; }
            if (Z[i] > 0 || VZ[i] > 0) {
                VZ[i] -= GRAVITY * dt; Z[i] += VZ[i] * dt;
                X[i] += VX[i] * dt; Y[i] += VY[i] * dt; ROT[i] += VR[i] * dt;
                if (Z[i] <= 0) {   // it lands: a small bounce or two (each loses most of its energy), then it only skids
                    Z[i] = 0;
                    if (BOUNCE[i] < 2 && VZ[i] < -45) { VZ[i] = -VZ[i] * 0.34; VX[i] *= 0.55; VY[i] *= 0.55; VR[i] *= 0.5; BOUNCE[i]++; }
                    else VZ[i] = 0;
                }
            } else {
                const f = Math.exp(-dt * 11);
                X[i] += VX[i] * dt; Y[i] += VY[i] * dt; VX[i] *= f; VY[i] *= f; VR[i] *= f; ROT[i] += VR[i] * dt;
            }
            live++;
        }
    }
    function addRect(ctx, x, y, c, s, hl, hw, off0, off1) {   // a rotated rectangle from off0 to off1 along its length (c, s: cos and sin of the angle)
        const ax = c * off0, ay = s * off0, bx = c * off1, by = s * off1, px = -s * hw, py = c * hw;
        ctx.moveTo(x + ax + px, y + ay + py); ctx.lineTo(x + bx + px, y + by + py); ctx.lineTo(x + bx - px, y + by - py); ctx.lineTo(x + ax - px, y + ay - py); ctx.closePath();
    }
    function draw(ctx, l, t, r, b) {
        if (!live) return;
        ctx.lineJoin = 'round'; ctx.lineWidth = 1.1; ctx.strokeStyle = INK;
        for (let c = 0; c < COLS.length; c++) {
            ctx.beginPath();
            let any = false;
            for (let i = 0; i < MAX; i++) {
                if (LIFE[i] <= 0) continue;
                const k = LIST[KIND[i]];
                if (k.body !== c && k.base !== c) continue;
                const x = X[i], y = Y[i] - Z[i];
                if (x < l - 12 || x > r + 12 || y < t - 12 || y > b + 12) continue;
                const u = AGE[i] / LIFE[i], sc = u > 0.65 ? 1 - ((u - 0.65) / 0.35) * ((u - 0.65) / 0.35) : 1;   // lies there, then shrinks away
                if (sc < 0.08) continue;
                const cs = Math.cos(ROT[i]), sn = Math.sin(ROT[i]), hl = k.len * 0.5 * sc, hw = k.wid * 0.5 * sc;
                if (k.body === c) addRect(ctx, x, y, cs, sn, hl, hw, -hl, hl);
                if (k.base === c) addRect(ctx, x, y, cs, sn, hl, hw, -hl, -hl + k.len * 0.28 * sc);
                any = true;
            }
            if (!any) continue;
            ctx.fillStyle = COLS[c];
            ctx.fill(); ctx.stroke();
        }
    }
    function reset() { LIFE.fill(0); live = 0; head = 0; spawned = 0; }
    return { eject, beginFrame, step, draw, reset, count: () => live, MAX, MAX_SPAWN, KINDS: NAMES };
}));

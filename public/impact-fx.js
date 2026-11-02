// Bullet impact effects: when a bullet hits a zombie, a player, a tree, a rock or the base, a few chunky pieces fly off it in the
// colours of what was hit, with a small ring at the contact. Visual only (the server decides every hit).
//
// Made to cost nothing: ONE fixed pool of pieces in typed arrays (nothing is allocated per frame or per hit), a fixed ring pool,
// at most MAX_SPAWN pieces a frame, pieces shrink to nothing instead of fading (so a whole colour is one path: one stroke and one
// fill per colour, 12 colours at the most), and nothing is drawn when nothing is alive. `quality` (0..1) thins the burst out
// when the device is struggling (the dynamic resolution of game.js).
//
//   ARImpact.spawn(kind, x, y, dx, dy, quality, rand)   kind: 'zombie' | 'player' | 'tree' | 'rock' | 'metal' | 'spark'; (dx, dy) the way
//                                                       the bullet was flying (any length)
//   ARImpact.beginFrame() / step(dt) / draw(ctx, left, top, right, bottom)   once a frame, in that order; draw with the world transform set
//   ARImpact.reset() / count() / ringCount() / MAX_PIECES (tests, a new match)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARImpact = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_PIECES = 192, MAX_RINGS = 16, MAX_SPAWN = 64;
    const INK = '#0B0F1A';
    // colour table: [fill, outlined]
    const COLS = [
        ['#9BE04B', 1], ['#4E9A2A', 1], ['#D6F26B', 1],   // 0-2 zombie goo
        ['#FF4B5C', 1], ['#FF8A96', 1], ['#FFFFFF', 1],    // 3-5 player
        ['#6FDC63', 1], ['#2F9A3F', 1], ['#8A5A2B', 1],    // 6-8 leaves and bark
        ['#B7C1CC', 1], ['#6B7886', 1],                    // 9-10 rock
        ['#D9D2BE', 0], ['#FFD55E', 0],                    // 11 dust, 12 spark
    ];
    const NC = COLS.length;
    // per kind: pieces (at full quality), colours, speed, life (s), size (half side), how much of the spray goes back against the bullet,
    // spread (rad), the ring colour and radius; dust: soft puffs
    const KINDS = {
        zombie: { n: 9, cols: [0, 1, 2], spd: [100, 270], life: [0.34, 0.58], size: [3.2, 5.4], back: 0.6, spread: 1.15, ring: '#D6F26B', rr: 22 },
        player: { n: 9, cols: [3, 4, 5], spd: [100, 270], life: [0.34, 0.58], size: [3.2, 5.2], back: 0.6, spread: 1.15, ring: '#FFFFFF', rr: 22 },
        tree:   { n: 7, cols: [6, 7, 8], spd: [70, 210], life: [0.38, 0.66], size: [3.0, 5.0], back: 0.7, spread: 1.35, ring: null, rr: 0 },
        rock:   { n: 6, cols: [9, 10], spd: [90, 230], life: [0.30, 0.52], size: [2.8, 4.8], back: 0.8, spread: 1.2, ring: '#FFFFFF', rr: 16, dust: 2 },
        metal:  { n: 6, cols: [12, 9], spd: [130, 320], life: [0.22, 0.40], size: [2.2, 3.6], back: 0.85, spread: 1.0, ring: '#FFD55E', rr: 18 },
        spark:  { n: 5, cols: [12], spd: [110, 260], life: [0.20, 0.34], size: [2.2, 3.4], back: 0.8, spread: 1.1, ring: '#FFFFFF', rr: 12 },
    };
    const DUST = 11;

    const X = new Float32Array(MAX_PIECES), Y = new Float32Array(MAX_PIECES), VX = new Float32Array(MAX_PIECES), VY = new Float32Array(MAX_PIECES);
    const ROT = new Float32Array(MAX_PIECES), VR = new Float32Array(MAX_PIECES), AGE = new Float32Array(MAX_PIECES), LIFE = new Float32Array(MAX_PIECES);
    const SIZE = new Float32Array(MAX_PIECES), COL = new Uint8Array(MAX_PIECES), GROW = new Float32Array(MAX_PIECES);   // GROW: a puff swells, a chunk shrinks
    const RX = new Float32Array(MAX_RINGS), RY = new Float32Array(MAX_RINGS), RAGE = new Float32Array(MAX_RINGS), RLIFE = new Float32Array(MAX_RINGS), RR = new Float32Array(MAX_RINGS);
    const RCOL = new Array(MAX_RINGS).fill(null);
    let head = 0, rhead = 0, live = 0, rlive = 0, spawned = 0;
    const colCount = new Uint16Array(NC);

    const lerp = (a, b, t) => a + (b - a) * t;

    function spawnPiece(x, y, ang, spd, life, size, col, grow, rand) {
        const i = head; head = (head + 1) % MAX_PIECES;   // the oldest piece makes room: a burst never fails
        X[i] = x; Y[i] = y; VX[i] = Math.cos(ang) * spd; VY[i] = Math.sin(ang) * spd;
        ROT[i] = rand() * 6.2832; VR[i] = (rand() - 0.5) * 18;
        AGE[i] = 0; LIFE[i] = life; SIZE[i] = size; COL[i] = col; GROW[i] = grow;
    }
    function spawn(kind, x, y, dx, dy, quality, rand) {
        const k = KINDS[kind];
        if (!k || !(quality > 0) || spawned >= MAX_SPAWN) return 0;
        rand = rand || Math.random;
        const len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const back = Math.atan2(-uy, -ux), fwd = Math.atan2(uy, ux);
        const n = Math.max(2, Math.round(k.n * (quality > 1 ? 1 : quality)));
        let made = 0;
        for (let p = 0; p < n && spawned < MAX_SPAWN; p++) {
            const toBack = rand() < k.back;
            const ang = (toBack ? back : fwd) + (rand() - 0.5) * 2 * k.spread * (toBack ? 1 : 0.6);
            spawnPiece(x, y, ang, lerp(k.spd[0], k.spd[1], rand()) * (toBack ? 1 : 0.7), lerp(k.life[0], k.life[1], rand()),
                lerp(k.size[0], k.size[1], rand()), k.cols[(rand() * k.cols.length) | 0], 0, rand);
            spawned++; made++;
        }
        if (k.dust) {   // a couple of soft puffs that swell and fade
            for (let p = 0; p < k.dust && spawned < MAX_SPAWN; p++) {
                spawnPiece(x, y, back + (rand() - 0.5) * 2.4, lerp(20, 55, rand()), lerp(0.36, 0.55, rand()), lerp(3.2, 4.6, rand()), DUST, 1, rand);
                spawned++; made++;
            }
        }
        if (k.ring) {
            const r = rhead; rhead = (rhead + 1) % MAX_RINGS;
            RX[r] = x; RY[r] = y; RAGE[r] = 0; RLIFE[r] = 0.14; RR[r] = k.rr; RCOL[r] = k.ring;
        }
        return made;
    }
    function beginFrame() { spawned = 0; }
    function step(dt) {
        live = 0; rlive = 0; colCount.fill(0);
        const fr = Math.exp(-dt * 5.5);
        for (let i = 0; i < MAX_PIECES; i++) {
            if (LIFE[i] <= 0) continue;
            AGE[i] += dt;
            if (AGE[i] >= LIFE[i]) { LIFE[i] = 0; continue; }
            X[i] += VX[i] * dt; Y[i] += VY[i] * dt;
            VX[i] *= fr; VY[i] *= fr; ROT[i] += VR[i] * dt;
            live++; colCount[COL[i]]++;
        }
        for (let r = 0; r < MAX_RINGS; r++) {
            if (RLIFE[r] <= 0) continue;
            RAGE[r] += dt;
            if (RAGE[r] >= RLIFE[r]) { RLIFE[r] = 0; continue; }
            rlive++;
        }
    }
    function draw(ctx, l, t, r, b) {
        if (!live && !rlive) return;
        for (let c = 0; c < NC; c++) {
            if (!colCount[c]) continue;
            const outlined = COLS[c][1];
            ctx.beginPath();
            let any = false;
            for (let i = 0; i < MAX_PIECES; i++) {
                if (LIFE[i] <= 0 || COL[i] !== c) continue;
                const x = X[i], y = Y[i];
                if (x < l - 12 || x > r + 12 || y < t - 12 || y > b + 12) continue;
                const u = AGE[i] / LIFE[i];
                const s = SIZE[i] * (GROW[i] ? 0.8 + 0.9 * u : 1) * (GROW[i] ? 1 - u * u : 1 - u * u * 0.85);   // shrinks to nothing: no alpha per piece
                if (s < 0.25) continue;
                const cs = Math.cos(ROT[i]) * s, sn = Math.sin(ROT[i]) * s;
                ctx.moveTo(x - cs + sn, y - sn - cs);
                ctx.lineTo(x + cs + sn, y + sn - cs);
                ctx.lineTo(x + cs - sn, y + sn + cs);
                ctx.lineTo(x - cs - sn, y - sn + cs);
                ctx.closePath();
                any = true;
            }
            if (!any) continue;
            ctx.fillStyle = COLS[c][0];
            if (outlined) { ctx.lineWidth = 1.4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }
            else if (c === DUST) ctx.globalAlpha = 0.55;
            ctx.fill();
            if (c === DUST) ctx.globalAlpha = 1;
        }
        if (rlive) {
            ctx.lineWidth = 2;
            for (let k = 0; k < MAX_RINGS; k++) {
                if (RLIFE[k] <= 0) continue;
                const u = RAGE[k] / RLIFE[k];
                ctx.globalAlpha = (1 - u) * 0.9;
                ctx.strokeStyle = RCOL[k];
                ctx.beginPath(); ctx.arc(RX[k], RY[k], RR[k] * (0.25 + 0.75 * (1 - (1 - u) * (1 - u))), 0, 6.2832); ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }
    function reset() { LIFE.fill(0); RLIFE.fill(0); live = 0; rlive = 0; head = 0; rhead = 0; spawned = 0; colCount.fill(0); }
    return { spawn, beginFrame, step, draw, reset, count: () => live, ringCount: () => rlive, MAX_PIECES, MAX_RINGS, MAX_SPAWN, KINDS: Object.keys(KINDS) };
}));

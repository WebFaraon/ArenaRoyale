// ============================================
// ARENA ROYALE - game-physics.js
// Pure collision helpers shared by the server game loop (and unit tests).
// No game state lives here.
// ============================================
'use strict';

// Earliest parameter t in [0, 1] at which the segment (x0,y0)->(x1,y1) touches the
// circle (cx, cy, R). Returns 0 when the segment starts inside the circle, -1 when it
// never touches it. Swept test: a fast bullet cannot step over a target between ticks.
function segCircleT(x0, y0, x1, y1, cx, cy, R) {
    const fx = x0 - cx, fy = y0 - cy;
    const c = fx * fx + fy * fy - R * R;
    if (c <= 0) return 0;
    const dx = x1 - x0, dy = y1 - y0;
    const a = dx * dx + dy * dy;
    if (a === 0) return -1;
    const b = 2 * (fx * dx + fy * dy);
    if (b >= 0) return -1;                 // moving away from the centre
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t <= 1 ? t : -1;
}

// Cheap reject: does the circle's bounding box overlap the segment's bounding box?
function segBoxHitsCircle(minX, minY, maxX, maxY, cx, cy, R) {
    return !(cx + R < minX || cx - R > maxX || cy + R < minY || cy - R > maxY);
}

// Finds the first thing a bullet touches while moving from (x0,y0) to (x1,y1).
// targets: { obstacles: [{x,y,r}], zombies: [{x,y,alive,...}], zombieRadius(z) -> number,
//            players: [{id,x,y,alive}], playerRadius, ownerId, hitPlayers: bool }
// Returns { kind: 0 none | 1 obstacle | 2 zombie | 3 player, target, t }.
// Reuses the passed `out` object to avoid allocating per bullet per tick.
function firstBulletHit(x0, y0, x1, y1, radius, targets, out) {
    const minX = x0 < x1 ? x0 : x1, maxX = x0 < x1 ? x1 : x0;
    const minY = y0 < y1 ? y0 : y1, maxY = y0 < y1 ? y1 : y0;
    let bestT = 2, kind = 0, target = null;

    const obs = targets.obstacles;
    for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        const R = o.r + radius;
        if (!segBoxHitsCircle(minX, minY, maxX, maxY, o.x, o.y, R)) continue;
        const t = segCircleT(x0, y0, x1, y1, o.x, o.y, R);
        if (t >= 0 && t < bestT) { bestT = t; kind = 1; target = o; }
    }

    const zs = targets.zombies;
    if (zs) {
        for (let i = 0; i < zs.length; i++) {
            const z = zs[i];
            if (!z.alive) continue;
            const R = targets.zombieRadius(z) + radius;
            if (!segBoxHitsCircle(minX, minY, maxX, maxY, z.x, z.y, R)) continue;
            const t = segCircleT(x0, y0, x1, y1, z.x, z.y, R);
            if (t >= 0 && t < bestT) { bestT = t; kind = 2; target = z; }
        }
    }

    if (targets.hitPlayers) {
        const ps = targets.players;
        const R = targets.playerRadius + radius;
        for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            if (!p.alive || p.id === targets.ownerId) continue;
            if (!segBoxHitsCircle(minX, minY, maxX, maxY, p.x, p.y, R)) continue;
            const t = segCircleT(x0, y0, x1, y1, p.x, p.y, R);
            if (t >= 0 && t < bestT) { bestT = t; kind = 3; target = p; }
        }
    }

    out.kind = kind;
    out.target = target;
    out.t = kind ? bestT : -1;
    return out;
}

module.exports = { segCircleT, segBoxHitsCircle, firstBulletHit };

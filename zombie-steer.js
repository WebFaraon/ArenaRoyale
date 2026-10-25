// ============================================
// ARENA ROYALE - zombie-steer.js
// Steering helper for the PvE zombies (server only, and unit tests). No game state lives here.
// ============================================
'use strict';
const ARStructs = require('./public/structures.js');

// A zombie that chases a player must not run into the base head-on: the base is a big solid circle, and the trees
// and rocks' small push-away (server.js) is not enough to get round something this wide, so it used to stop against
// the wall pushing straight at it. From `BEND` units before the wall the pull towards the target is turned into a
// slide along the wall: the part of it that points into the base is taken out and put sideways, a little more the
// nearer the wall is, until at the wall it runs along it. It slides to the side the target is on (straight behind
// the base: always the same way round), and once the pull points away from the base nothing is changed.
// (ddx, ddy) is the unit direction to the target; the result goes into `out`.
const BEND = 70;
function avoidBase(zx, zy, ddx, ddy, base, r, out) {
    out.x = ddx; out.y = ddy;
    const bx = zx - base.x, by = zy - base.y;
    const wall = base.r + r, infl = wall + BEND;
    const dSq = bx * bx + by * by;
    if (dSq >= infl * infl || dSq === 0) return out;
    const d = Math.sqrt(dSq), rx = bx / d, ry = by / d;
    const inward = ddx * rx + ddy * ry;          // < 0: the target pulls into the base
    if (inward >= 0) return out;
    let tx = -ry, ty = rx;                       // along the wall, anticlockwise
    if (ddx * tx + ddy * ty < 0) { tx = -tx; ty = -ty; }   // the way the target is on
    const k = Math.min(1, Math.max(0, (infl - d) / BEND)); // 0 at the start of the bend, 1 at the wall
    out.x = ddx - k * inward * rx - k * inward * tx;
    out.y = ddy - k * inward * ry - k * inward * ty;
    return out;
}

// A zombie that is after a player must not stand pushing against a barricade between them (it neither hits it nor gets through):
// from `STRUCT_BEND` units before a wall the pull towards the target turns into a slide along it, towards the end of the wall that
// makes the shorter way round to the target (so one straight behind it is gone round, and it does not dither at the middle), until the
// pull no longer points into the wall. Each barricade of the list in turn. (ddx, ddy) is the unit direction to the target at (tx, ty);
// the result goes into `out` (not unit length: the caller normalises).
const STRUCT_BEND = 60;
// How far the row of barricades that `s` is part of reaches along its length (barricades of the same direction, in line with it and
// touching or nearly): the coordinate along the axis of its two ends (lo, hi) and of `s` itself (c)
function rowExtent(s, structs) {
    const along = (w) => s.o ? w.y : w.x, cross = (w) => s.o ? w.x : w.y, half = (w) => s.o ? ARStructs.halfH(w) : ARStructs.halfW(w);
    let lo = along(s) - half(s), hi = along(s) + half(s), grew = true;
    while (grew) {
        grew = false;
        for (let i = 0; i < structs.length; i++) {
            const w = structs[i];
            if (w === s || w.o !== s.o || Math.abs(cross(w) - cross(s)) > 20) continue;
            const wl = along(w) - half(w), wh = along(w) + half(w);
            if (wl <= hi + 8 && wh >= lo - 8 && (wl < lo || wh > hi)) { lo = Math.min(lo, wl); hi = Math.max(hi, wh); grew = true; }
        }
    }
    return { lo, hi, c: along(s) };
}
function avoidStructs(zx, zy, ddx, ddy, tx, ty, structs, r, out) {
    out.x = ddx; out.y = ddy;
    const p = { x: 0, y: 0 };
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        ARStructs.nearestPoint(zx, zy, s, p);
        const vx = zx - p.x, vy = zy - p.y;
        const infl = r + STRUCT_BEND, dSq = vx * vx + vy * vy;
        if (dSq >= infl * infl || dSq === 0) continue;
        const d = Math.sqrt(dSq), nx = vx / d, ny = vy / d;      // out of the wall, towards the zombie
        const inward = out.x * nx + out.y * ny;                  // < 0: the pull goes into the wall
        if (inward >= 0) continue;
        let sx = -ny, sy = nx;                                   // along the wall
        // the end of the wall (of the whole row, when barricades are put side by side) with the shorter way round: zombie -> end -> target
        const ax = s.o ? 0 : 1, ay = s.o ? 1 : 0;
        const ext = rowExtent(s, structs);
        const e1x = s.x + ax * (ext.hi - ext.c + r + 4), e1y = s.y + ay * (ext.hi - ext.c + r + 4);
        const e2x = s.x - ax * (ext.c - ext.lo + r + 4), e2y = s.y - ay * (ext.c - ext.lo + r + 4);
        const c1 = Math.hypot(e1x - zx, e1y - zy) + Math.hypot(tx - e1x, ty - e1y);
        const c2 = Math.hypot(e2x - zx, e2y - zy) + Math.hypot(tx - e2x, ty - e2y);
        const along = ax * sx + ay * sy;                         // ~ +-1 against the long side of the wall, ~ 0 at its end (past the end: round the corner)
        if (Math.abs(along) >= 0.5) {
            if ((c1 <= c2 ? along : -along) < 0) { sx = -sx; sy = -sy; }   // toward the chosen end
        } else if (out.x * sx + out.y * sy < 0) { sx = -sx; sy = -sy; }    // at the end: the way the target pulls
        const k = Math.min(1, Math.max(0, (infl - d) / STRUCT_BEND));
        out.x = out.x - k * inward * nx - k * inward * sx;
        out.y = out.y - k * inward * ny - k * inward * sy;
    }
    return out;
}

// What a PvE zombie goes for. Some types hunt players (`hunts`): a player within `playerRange` comes first. Then a barricade within
// `structRange` (smaller, so it is only one that is in the way), then the base. A type that does not hunt never goes for a player.
// Distances are to the nearest player / barricade (Infinity when there is none).
function pickTarget(hunts, playerDist, playerRange, structDist, structRange) {
    if (hunts && playerDist < playerRange) return 'player';
    if (structDist < structRange) return 'struct';
    return 'base';
}

module.exports = { avoidBase, avoidStructs, pickTarget, BEND, STRUCT_BEND };

// ============================================
// ARENA ROYALE - zombie-steer.js
// Steering helper for the PvE zombies (server only, and unit tests). No game state lives here.
// ============================================
'use strict';
const ARStructs = require('./public/structures.js');
const { segCircleT } = require('./game-physics.js');

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
// Which way round a wall to go, as the sense of the slide: +1 turns the way `n` rotates a quarter turn (so the same sense goes round every
// face of the rectangle: it is a way round, not "left" or "right"), -1 the other way. The way with the shorter trip zombie -> the end of
// the face -> target; a tie goes to +1. `n` is the unit vector out of the wall at the nearest point, `ext` the reach of the row.
const _cand = { x: 0, y: 0 };
function pickSense(zx, zy, tx, ty, s, ext, nx, ny, r) {
    const ax = s.o ? 0 : 1, ay = s.o ? 1 : 0, cx = -ay, cy = ax;       // along the wall, across it
    const m = r + 4, tx0 = -ny, ty0 = nx;                               // the slide direction for +1
    const endFace = Math.abs(ax * tx0 + ay * ty0) < 0.5;                // the pull meets a short end of the row, not a long side
    let best = 0, bestCost = Infinity;
    for (let k = 0; k < 2; k++) {
        const sense = k === 0 ? 1 : -1, tdx = tx0 * sense, tdy = ty0 * sense;
        let px, py;
        if (!endFace) {
            const up = ax * tdx + ay * tdy > 0;                         // the end of the row this sense slides towards
            const d = (up ? ext.hi - ext.c : ext.c - ext.lo) + m;
            px = s.x + ax * (up ? d : -d); py = s.y + ay * (up ? d : -d);
        } else {
            const up = ax * nx + ay * ny > 0;                           // the end face it is pressed against
            const d = (up ? ext.hi - ext.c : ext.c - ext.lo) + m, w = (s.o ? 17 : 17) + m;
            const cu = cx * tdx + cy * tdy > 0;                         // the corner of that face this sense slides towards
            px = s.x + ax * (up ? d : -d) + cx * (cu ? w : -w); py = s.y + ay * (up ? d : -d) + cy * (cu ? w : -w);
        }
        const cost = Math.hypot(px - zx, py - zy) + Math.hypot(tx - px, ty - py);
        if (cost < bestCost - 1e-6) { bestCost = cost; best = sense; }
    }
    return best;
}

// `memo` (optional, one per zombie: { sense, sid, n }) makes the choice stick: the way round is picked when the zombie first leans on a wall
// and kept while it is still leaning on that wall (6 s at most), so it cannot flip from one tick to the next at a corner. Only the wall it
// leans on hardest (the nearest) decides the slide; any other wall it is near only stops the pull into it. (The slides of two walls round
// which the zombie goes in opposite senses would cancel and leave it standing between them.)
const _asP = { x: 0, y: 0 };
const _lw = [], _ld = [], _lnx = [], _lny = [];
function avoidStructs(zx, zy, ddx, ddy, tx, ty, structs, r, out, memo) {
    out.x = ddx; out.y = ddy;
    const infl = r + STRUCT_BEND;
    let nl = 0, prim = -1, primD = Infinity;
    for (let i = 0; i < structs.length && nl < 8; i++) {
        const s = structs[i];
        ARStructs.nearestPoint(zx, zy, s, _asP);
        const vx = zx - _asP.x, vy = zy - _asP.y, dSq = vx * vx + vy * vy;
        if (dSq >= infl * infl || dSq === 0) continue;
        const d = Math.sqrt(dSq), nx = vx / d, ny = vy / d;      // out of the wall, towards the zombie
        if (out.x * nx + out.y * ny >= 0) continue;              // the pull does not go into this wall
        _lw[nl] = s; _ld[nl] = d; _lnx[nl] = nx; _lny[nl] = ny;
        if (d < primD) { primD = d; prim = nl; }
        nl++;
    }
    if (nl && memo && memo.sid) {                                // keep the wall it was going round unless another is clearly nearer
        for (let j = 0; j < nl; j++) if (_lw[j].id === memo.sid && _ld[j] <= primD + 10) { prim = j; break; }
    }
    // The wall it leans on hardest decides the way round; another wall near it slides the same way if its own best way round agrees, and
    // otherwise only stops the pull into it.
    let psx = 0, psy = 0;
    if (prim >= 0) {
        const s = _lw[prim], nx = _lnx[prim], ny = _lny[prim];
        let sense = memo && memo.sid === s.id ? memo.sense : 0;
        if (!sense) {
            sense = pickSense(zx, zy, tx, ty, s, rowExtent(s, structs), nx, ny, r);
            if (memo) { memo.sense = sense; memo.sid = s.id; memo.n = 0; }
        }
        psx = -ny * sense; psy = nx * sense;
    }
    for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < nl; j++) {
            if ((j === prim) !== (pass === 1)) continue;         // the others first, then the one it leans on hardest
            const nx = _lnx[j], ny = _lny[j], inward = out.x * nx + out.y * ny;
            if (inward >= 0) continue;
            const k = Math.min(1, Math.max(0, (infl - _ld[j]) / STRUCT_BEND));
            let sx = psx, sy = psy;
            if (j !== prim) {
                const sense = pickSense(zx, zy, tx, ty, _lw[j], rowExtent(_lw[j], structs), nx, ny, r);
                sx = -ny * sense; sy = nx * sense;
                if (sx * psx + sy * psy < 0) { out.x -= k * inward * nx; out.y -= k * inward * ny; continue; }
            }
            // Touching the wall (k = 1) the part of the pull that goes into it is replaced by a slide the chosen way, at least as strong as that
            // part; a pull along the wall the other way is dropped (added to the slide it would cancel it and leave the zombie standing where
            // the two balance). Further off the pull fades into the slide.
            const a = out.x * sx + out.y * sy, na = a + k * (Math.max(0, a) - inward - a);
            out.x = out.x - k * inward * nx - a * sx + na * sx;
            out.y = out.y - k * inward * ny - a * sy + na * sy;
        }
    }
    if (memo) {
        if (prim < 0 || ++memo.n > 360) { memo.sense = 0; memo.sid = 0; memo.n = 0; }
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

// The zombie a turret at (tx, ty) fires at: the nearest live one within `range` of its centre that it has a clear line to. A tree, a rock
// or the base in the way (`blockers`, circles { x, y, r }) stops the shot; barricades and other zombies do not. null when there is none.
function turretTarget(tx, ty, range, zombies, blockers) {
    let best = null, bestSq = range * range;
    for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z.alive || z.hp <= 0) continue;
        const dx = z.x - tx, dy = z.y - ty, dSq = dx * dx + dy * dy;
        if (dSq >= bestSq) continue;
        let clear = true;
        for (let b = 0; b < blockers.length; b++) {
            const o = blockers[b];
            if (segCircleT(tx, ty, z.x, z.y, o.x, o.y, o.r) >= 0) { clear = false; break; }
        }
        if (clear) { best = z; bestSq = dSq; }
    }
    return best;
}

module.exports = { avoidBase, avoidStructs, pickTarget, turretTarget, BEND, STRUCT_BEND };

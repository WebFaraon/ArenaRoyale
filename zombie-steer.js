// ============================================
// Blastridge - zombie-steer.js
// Steering helper for the PvE zombies (server only, and unit tests). No game state lives here.
// ============================================
'use strict';

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

module.exports = { avoidBase, BEND };

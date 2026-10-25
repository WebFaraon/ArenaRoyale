// ============================================
// ARENA ROYALE - structures.js
// What the PvE players build (barricades now, turrets next): the numbers (health, prices, ranges), the shape of a barricade
// and the checks both ends share: the server decides, the browser predicts its own movement and draws the placement ghost with
// the same code (tools/tests/structures.test.js). Pure: no DOM, no sockets, nothing allocated on the hot paths.
//
// A structure: { id, x, y, o, t, hp, maxHp, ... }  x, y = centre; o = 0 lies along x (108 x 34), 1 along y (34 x 108);
// t = tier 0..3 (wood, stone, metal, obsidian).
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARStructs = api;
})(this, function () {
    'use strict';

    const BARRICADE = {
        long: 108, short: 34,          // the sprite's size (public/images/pve/barricades), the hitbox is the same
        maxPerRoom: 20,
        detectRange: 130,              // a zombie that has no player to chase goes for a barricade this close (a player is 320 away)
        placeDist: 80,                 // the ghost: this far in front of the player (to the centre of the barricade)
        placeRange: 140,               // the server takes a placement no further than this from the player
        useRange: 70,                  // E (repair / upgrade) works within this of its surface
        repairShare: 0.5,              // fully repairing costs this share of the price of the tier
        // by tier: hp, total price (what it is worth), the price of the upgrade INTO the tier
        tiers: [
            { id: 'wood',  name: 'Lemn',     hp: 300,  total: 5,  up: 0 },
            { id: 'stone', name: 'Piatra',   hp: 600,  total: 13, up: 8 },
            { id: 'steel', name: 'Metal',    hp: 1000, total: 25, up: 12 },
            { id: 'obs',   name: 'Obsidian', hp: 1600, total: 43, up: 18 },
        ],
    };
    const BUY_COST = BARRICADE.tiers[0].total;   // a new barricade (wood), bought from the wave-break panel

    // half sizes of the rectangle of a structure
    function halfW(s) { return (s.o ? BARRICADE.short : BARRICADE.long) / 2; }
    function halfH(s) { return (s.o ? BARRICADE.long : BARRICADE.short) / 2; }

    // How far the circle (px, py) is from the rectangle: the distance of its centre to the nearest point (0 = inside)
    function distToRect(px, py, s) {
        const hw = halfW(s), hh = halfH(s);
        const dx = Math.max(Math.abs(px - s.x) - hw, 0), dy = Math.max(Math.abs(py - s.y) - hh, 0);
        return Math.sqrt(dx * dx + dy * dy);
    }
    // the nearest point of the rectangle to (px, py), in out.x / out.y
    function nearestPoint(px, py, s, out) {
        const hw = halfW(s), hh = halfH(s);
        out.x = Math.max(s.x - hw, Math.min(s.x + hw, px));
        out.y = Math.max(s.y - hh, Math.min(s.y + hh, py));
        return out;
    }
    // Pushes a circle (centre in out.x / out.y, radius r) out of the rectangle; true when it moved.
    function pushOut(out, r, s) {
        const hw = halfW(s), hh = halfH(s);
        const cx = Math.max(s.x - hw, Math.min(s.x + hw, out.x)), cy = Math.max(s.y - hh, Math.min(s.y + hh, out.y));
        let dx = out.x - cx, dy = out.y - cy;
        const dSq = dx * dx + dy * dy;
        if (dSq >= r * r) return false;
        if (dSq > 1e-9) {
            const d = Math.sqrt(dSq), k = (r - d) / d;
            out.x += dx * k; out.y += dy * k;
        } else {
            // the centre is inside the rectangle: leave by the nearest side
            const l = out.x - (s.x - hw), rr = (s.x + hw) - out.x, t = out.y - (s.y - hh), b = (s.y + hh) - out.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) out.x = s.x - hw - r; else if (m === rr) out.x = s.x + hw + r;
            else if (m === t) out.y = s.y - hh - r; else out.y = s.y + hh + r;
        }
        return true;
    }
    // every structure in the list, in turn (the player / zombie is moved by `pushOut` each time)
    function pushOutAll(out, r, list) {
        let moved = false;
        for (let i = 0; i < list.length; i++) if (pushOut(out, r, list[i])) moved = true;
        return moved;
    }

    function rectsOverlap(a, b, pad) {
        return Math.abs(a.x - b.x) < halfW(a) + halfW(b) + pad && Math.abs(a.y - b.y) < halfH(a) + halfH(b) + pad;
    }

    // The barricade nearest to (px, py) that is within `range` of it (surface distance), or null; out.d gets that distance
    function nearestInRange(px, py, list, range, out) {
        let best = null, bd = range;
        for (let i = 0; i < list.length; i++) {
            const d = distToRect(px, py, list[i]);
            if (d < bd) { bd = d; best = list[i]; }
        }
        if (out) out.d = best ? bd : Infinity;
        return best;
    }

    // The state a barricade is drawn in: 0 whole, 1 damaged (half its health or less)
    function state(s) { return s.hp <= s.maxHp * 0.5 ? 1 : 0; }

    function repairCost(s) {
        const missing = Math.max(0, s.maxHp - s.hp);
        if (missing <= 0) return 0;
        return Math.max(1, Math.ceil(missing / s.maxHp * BARRICADE.tiers[s.t].total * BARRICADE.repairShare));
    }
    function upgradeCost(s) {
        return s.t >= BARRICADE.tiers.length - 1 ? 0 : BARRICADE.tiers[s.t + 1].up;
    }
    // What E does at a barricade: 'repair' when it is hurt, else 'upgrade' while there is a tier above, else null
    function useAction(s) {
        if (s.hp < s.maxHp) return 'repair';
        return s.t < BARRICADE.tiers.length - 1 ? 'upgrade' : null;
    }

    // Where the ghost goes for a player at (px, py) looking along (dx, dy): in front of them, lying across the way they look
    function placement(px, py, dx, dy, out) {
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        out.x = px + dx * BARRICADE.placeDist;
        out.y = py + dy * BARRICADE.placeDist;
        out.o = Math.abs(dx) > Math.abs(dy) ? 1 : 0;   // looking sideways: the wall stands up; looking up or down: it lies down
        return out;
    }

    // Can a barricade stand here? ctx: { w, h (the arena), obstacles [{x, y, r}], base {x, y, r} | null, structs [], players [{x, y}], playerR, count }
    // Returns null when it can, else the reason (a short code the client turns into a message)
    function checkPlace(s, ctx) {
        if (ctx.count >= BARRICADE.maxPerRoom) return 'limit';
        const hw = halfW(s), hh = halfH(s);
        if (s.x - hw < 20 || s.x + hw > ctx.w - 20 || s.y - hh < 20 || s.y + hh > ctx.h - 20) return 'edge';
        for (let i = 0; i < ctx.obstacles.length; i++) {
            const ob = ctx.obstacles[i];
            if (distToRect(ob.x, ob.y, s) < ob.r) return 'blocked';
        }
        if (ctx.base && distToRect(ctx.base.x, ctx.base.y, s) < ctx.base.r + 4) return 'blocked';
        for (let i = 0; i < ctx.structs.length; i++) if (rectsOverlap(s, ctx.structs[i], 2)) return 'blocked';
        for (let i = 0; i < ctx.players.length; i++) if (distToRect(ctx.players[i].x, ctx.players[i].y, s) < ctx.playerR + 2) return 'player';
        return null;
    }

    return { BARRICADE, BUY_COST, halfW, halfH, distToRect, nearestPoint, nearestInRange, pushOut, pushOutAll, rectsOverlap, state, repairCost, upgradeCost, useAction, placement, checkPlace };
});

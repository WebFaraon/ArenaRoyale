// ============================================
// ARENA ROYALE - interp.js
// How other players, zombies and enemy bullets are placed between server snapshots. Pure functions (no DOM,
// no game state): the browser loads this file as window.ARInterp, tools/tests/interp.test.js requires it.
//
// All of it runs on the server's simulation timeline: a snapshot carries .st (tick number x tick length) and the
// frame draws the world as it was at renderTime = now - clockLag (game.js _noteSnapshotClock), a little in the
// past, so there are always two snapshots to blend. Nothing here reads the wall-clock arrival time of a packet.
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARInterp = api;
})(this, function () {
    'use strict';

    const PI2 = Math.PI * 2;
    const NONE = [];

    // Shortest-path blend of two angles (radians): no spin through the long way round at the 0 / 2pi wrap
    function lerpAngle(a0, a1, t) {
        let d = a1 - a0;
        if (d > Math.PI) d -= PI2; else if (d < -Math.PI) d += PI2;
        return a0 + d * t;
    }

    // The two snapshots around renderTime. buf: snapshots oldest first, each with .st (ms on the server timeline).
    // out.a / out.b: their indices; out.t: 0..1 between them, or up to 1 + extrapMs/span past the newest one (a
    // delivery pause: keep moving a little along the last motion instead of freezing); out.extrap: t > 1.
    // Before the oldest snapshot (not enough history yet) both are the oldest and t = 0.
    function locate(buf, renderTime, extrapMs, out) {
        const n = buf.length;
        let iOld = -1;
        for (let i = n - 1; i >= 0; i--) { if (buf[i].st <= renderTime) { iOld = i; break; } }
        let a, b;
        if (iOld < 0) { a = b = 0; }
        else if (iOld >= n - 1) { a = Math.max(0, n - 2); b = n - 1; }
        else { a = iOld; b = iOld + 1; }
        const span = buf[b].st - buf[a].st;
        const t = span > 0 ? Math.max(0, Math.min(1 + extrapMs / span, (renderTime - buf[a].st) / span)) : 0;
        out.a = a; out.b = b; out.t = t; out.extrap = t > 1;
        return out;
    }

    // Zombies. zOld / zNew: the flat zombie lists of two snapshots, 6 numbers each (id, x, y, angle x100, hp, type),
    // ascending id (server.js); x and y are posScale times the real value (netproto.js sends x4). targets: array indexed by zombie id, objects with x, y, angle (what is drawn).
    // A zombie in both snapshots is blended by t (and extrapolated past 1, like players); one that is only in the
    // newer snapshot (just spawned) or that jumped more than snapDist is put at its new place at once.
    function zombies(zOld, zNew, t, targets, snapDist, posScale) {
        if (!zNew) return;
        if (!zOld) zOld = NONE;
        const snap2 = snapDist * snapDist, inv = 1 / (posScale || 1);
        let j = 0;
        for (let i = 0; i < zNew.length; i += 6) {
            const id = zNew[i];
            while (j < zOld.length && zOld[j] < id) j += 6;
            const tg = targets[id];
            if (!tg) continue;
            const nx = zNew[i + 1] * inv, ny = zNew[i + 2] * inv, na = zNew[i + 3] / 100;
            if (j < zOld.length && zOld[j] === id) {
                const ox = zOld[j + 1] * inv, oy = zOld[j + 2] * inv, dx = nx - ox, dy = ny - oy;
                if (dx * dx + dy * dy > snap2) { tg.x = nx; tg.y = ny; tg.angle = na; }
                else {
                    tg.x = ox + dx * t; tg.y = oy + dy * t;
                    tg.angle = lerpAngle(zOld[j + 3] / 100, na, t < 1 ? t : 1);   // the angle is never extrapolated
                }
            } else { tg.x = nx; tg.y = ny; tg.angle = na; }
        }
    }

    // Enemy bullets fly straight at constant speed, so each is drawn from its position in the snapshot at or before
    // render time, advanced by exactly the time since that snapshot (position + velocity x age): it never goes back
    // and never depends on when a packet happened to arrive. A bullet that is only in a newer snapshot is not drawn
    // yet (it has not been fired at render time). Past the newest snapshot the age is capped at maxAgeMs.
    // out.base: index of the snapshot to read the bullets from; out.age: seconds to advance them.
    function bulletBase(buf, loc, renderTime, maxAgeMs, out) {
        const base = loc.extrap ? loc.b : loc.a;
        let ms = renderTime - buf[base].st;
        if (ms < 0) ms = 0; else if (ms > maxAgeMs) ms = maxAgeMs;
        out.base = base; out.age = ms / 1000;
        return out;
    }

    // The render clock. Snapshots sit on the server's timeline (st); the frame draws the world at renderTime = now - clock.lag, so there are
    // always two snapshots to blend. clock.note(now, st) is called for every packet; lag is what the render time is behind (null until the
    // first packet), delay is how far in the past that draws the newest data (for the debug overlay). The delay covers how late packets
    // arrive: the 95th percentile of lateness over the last `win` packets (~3 s), plus one tick and 6 ms, held between minMs and maxMs
    // (~28 ms on a clean line). A delivery pause shows up as one late packet followed by the queued ones arriving soon after; only the
    // first counts for the percentile (the rest are late only because they waited behind it), so one pause now and then moves nothing.
    // But a line that stalls again and again (TCP waiting for a lost packet: 150-300 ms every few seconds on a mobile or a bad Wi-Fi
    // line) leaves the others standing once the extrapolation (locate's extrapMs) runs out, and makes them jump when the data comes: so the
    // pauses are remembered for stallWinMs, and once there are two or more of them the delay is raised to stallHold x the second longest
    // (the longest is left out as a one-off). A single stall changes next to nothing; after stallWinMs without new ones it comes back down.
    // The lag moves at most stepMs per packet in either direction (about 9 % slow-motion or fast-forward at 1.5).
    // o: { tickMs, minMs, maxMs, win, stepMs, pauseLateMs, pauseWinMs, stallWinMs, stallHold, stallN }
    function createClock(o) {
        const win = o.win || 180, nStall = o.stallN || 8;
        const offWin = new Float64Array(win), lateSort = new Float64Array(win), stallT = new Float64Array(nStall), stallS = new Float64Array(nStall);
        let offN = 0, offI = 0, pauseEnd = -1, pauseLate = 0, stallI = 0, lag = null, delay = o.minMs + 8;
        function stallDelay(now) {
            let m1 = 0, m2 = 0;
            for (let i = 0; i < nStall; i++) {
                if (now - stallT[i] > o.stallWinMs) continue;
                const s = stallS[i];
                if (s > m1) { m2 = m1; m1 = s; } else if (s > m2) m2 = s;
            }
            return m2 * o.stallHold;
        }
        return {
            note(now, st) {
                let count = true;
                if (offN > 0) {
                    let m = Infinity;
                    for (let i = 0; i < offN; i++) if (offWin[i] < m) m = offWin[i];
                    const lateNow = now - st - m;
                    if (now < pauseEnd && lateNow < pauseLate) count = false;
                    else if (lateNow > o.pauseLateMs) { pauseEnd = now + o.pauseWinMs; pauseLate = lateNow; stallT[stallI] = now; stallS[stallI] = lateNow; stallI = (stallI + 1) % nStall; }
                }
                if (count) {
                    offWin[offI] = now - st;
                    offI = (offI + 1) % win;
                    if (offN < win) offN++;
                }
                let offMin = Infinity;
                for (let i = 0; i < offN; i++) if (offWin[i] < offMin) offMin = offWin[i];
                for (let i = 0; i < offN; i++) lateSort[i] = offWin[i] - offMin;
                const late = lateSort.subarray(0, offN).sort();
                const p95 = late[Math.min(offN - 1, Math.floor(offN * 0.95))];
                const d = Math.max(o.minMs, Math.min(o.maxMs, Math.max(p95 + o.tickMs + 6, stallDelay(now))));
                const target = offMin + d;
                if (lag === null || Math.abs(target - lag) > 250) lag = target;   // first packet / tab resumed
                else lag += Math.max(-o.stepMs, Math.min(o.stepMs, target - lag));
                delay = lag - offMin;
            },
            reset() { offN = 0; offI = 0; pauseEnd = -1; lag = null; stallT.fill(0); stallS.fill(0); },
            get lag() { return lag; },
            get delay() { return delay; },
        };
    }

    return { lerpAngle, locate, zombies, bulletBase, createClock };
});

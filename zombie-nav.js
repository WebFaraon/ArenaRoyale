// ============================================
// Blastridge - zombie-nav.js
// Where the PvE zombies walk. Pure and server only (no DOM, no game state): the arena is cut into square cells, and a distance field
// (Dijkstra) is made from where the zombies want to go (the players, the base); a zombie follows it downhill. So it finds its way
// round trees, rocks and the base, and through what the players built: a barricade or a turret is a cell it CAN cross but at a
// price (the harder to break, the dearer), so a zombie goes round a wall when the way round is short, breaks the weakest wall
// of a ring when there is no way round, and never walks into a tree. Trees, rocks, the base and the edge are solid.
// A zombie that is next to the first wall cell of its way is told which wall it is (steer's out.owner) and hits it.
// Two sizes: small (r up to ~22) and large (tank, brute, summoner), the large keeps further from the solid things.
// tools/tests/zombie-nav.test.js tests it.
// ============================================
'use strict';

const CELL = 32;
const INFL_S = 22, INFL_L = 36;   // how far from a solid thing the middle of a path stays (small / large zombie: about its radius and a little)
const WALL_INFL = 16;             // a wall's cells reach this far outside its shape
const WALL_BASE = 5, WALL_HP = 120;   // the price of crossing one cell of a wall: WALL_BASE + hp / WALL_HP (in cells of walking)
const SQ2 = Math.SQRT2;

function create(w, h) {
    const nx = Math.ceil(w / CELL), ny = Math.ceil(h / CELL), n = nx * ny;
    return {
        w, h, nx, ny, n,
        blockS: new Uint8Array(n), blockL: new Uint8Array(n),   // solid for a small / large zombie (trees, rocks, base, edge)
        wall: new Float32Array(n),                              // 0 = free, else the price of crossing this cell (a barricade or turret)
        owner: new Int32Array(n),                               // 1 + index into items of the weakest wall over the cell
        items: [],                                              // the walls of the last setWalls (the caller's objects)
        heapI: new Int32Array(n * 9), heapK: new Float32Array(n * 9), heapN: 0,
    };
}

const cellOf = (nav, x, y) => {
    const cx = Math.max(0, Math.min(nav.nx - 1, (x / CELL) | 0)), cy = Math.max(0, Math.min(nav.ny - 1, (y / CELL) | 0));
    return cy * nav.nx + cx;
};

// Trees and rocks ({x, y, r}), the base ({x, y, r}) and the edge: once for a match
function setStatics(nav, obstacles, base) {
    nav.blockS.fill(0); nav.blockL.fill(0);
    const mark = (cx0, cy0, r) => {
        for (let k = 0; k < 2; k++) {
            const arr = k ? nav.blockL : nav.blockS, rr = r + (k ? INFL_L : INFL_S), rr2 = rr * rr;
            const x0 = Math.max(0, ((cx0 - rr) / CELL) | 0), x1 = Math.min(nav.nx - 1, ((cx0 + rr) / CELL) | 0);
            const y0 = Math.max(0, ((cy0 - rr) / CELL) | 0), y1 = Math.min(nav.ny - 1, ((cy0 + rr) / CELL) | 0);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const dx = (x + 0.5) * CELL - cx0, dy = (y + 0.5) * CELL - cy0;
                if (dx * dx + dy * dy < rr2) arr[y * nav.nx + x] = 1;
            }
        }
    };
    for (let i = 0; i < obstacles.length; i++) mark(obstacles[i].x, obstacles[i].y, obstacles[i].r);
    if (base) mark(base.x, base.y, base.r);
    for (let y = 0; y < nav.ny; y++) for (let x = 0; x < nav.nx; x++) {
        const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL, i = y * nav.nx + x;
        if (px < INFL_S || py < INFL_S || px > nav.w - INFL_S || py > nav.h - INFL_S) nav.blockS[i] = 1;
        if (px < INFL_L || py < INFL_L || px > nav.w - INFL_L || py > nav.h - INFL_L) nav.blockL[i] = 1;
    }
}

// The walls the players built: rects = [{ x, y, hw, hh, hp, ref }] (barricades), circles = [{ x, y, r, hp, ref }] (turrets). ref = what the
// caller gets back as out.owner. A cell under several keeps the weakest.
function setWalls(nav, rects, circles) {
    nav.wall.fill(0); nav.owner.fill(0); nav.items.length = 0;
    const put = (i, cost, ref) => {
        if (nav.wall[i] === 0 || cost < nav.wall[i]) {
            nav.wall[i] = cost;
            let k = nav.items.indexOf(ref); if (k === -1) { nav.items.push(ref); k = nav.items.length - 1; }
            nav.owner[i] = k + 1;
        }
    };
    for (let r = 0; r < rects.length; r++) {
        const s = rects[r], cost = WALL_BASE + s.hp / WALL_HP, hw = s.hw + WALL_INFL, hh = s.hh + WALL_INFL;
        const x0 = Math.max(0, ((s.x - hw) / CELL) | 0), x1 = Math.min(nav.nx - 1, ((s.x + hw) / CELL) | 0);
        const y0 = Math.max(0, ((s.y - hh) / CELL) | 0), y1 = Math.min(nav.ny - 1, ((s.y + hh) / CELL) | 0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (Math.abs((x + 0.5) * CELL - s.x) <= hw && Math.abs((y + 0.5) * CELL - s.y) <= hh) put(y * nav.nx + x, cost, s.ref);
        }
    }
    for (let c = 0; c < circles.length; c++) {
        const s = circles[c], cost = WALL_BASE + s.hp / WALL_HP, rr = s.r + WALL_INFL, rr2 = rr * rr;
        const x0 = Math.max(0, ((s.x - rr) / CELL) | 0), x1 = Math.min(nav.nx - 1, ((s.x + rr) / CELL) | 0);
        const y0 = Math.max(0, ((s.y - rr) / CELL) | 0), y1 = Math.min(nav.ny - 1, ((s.y + rr) / CELL) | 0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const dx = (x + 0.5) * CELL - s.x, dy = (y + 0.5) * CELL - s.y;
            if (dx * dx + dy * dy <= rr2) put(y * nav.nx + x, cost, s.ref);
        }
    }
}

function newField(nav) { return new Float32Array(nav.n).fill(Infinity); }

// ---- the heap (lazy: a cell may be in it more than once, the stale ones are skipped) ----
function push(nav, i, k) {
    let p = nav.heapN++; const hi = nav.heapI, hk = nav.heapK;
    while (p > 0) { const q = (p - 1) >> 1; if (hk[q] <= k) break; hi[p] = hi[q]; hk[p] = hk[q]; p = q; }
    hi[p] = i; hk[p] = k;
}
function pop(nav) {   // the cell with the lowest key (its key is left in nav._popK)
    const hi = nav.heapI, hk = nav.heapK, top = hi[0]; nav._popK = hk[0];
    const n = --nav.heapN;
    if (n > 0) {
        const i = hi[n], k = hk[n]; let p = 0;
        for (;;) {
            let c = 2 * p + 1; if (c >= n) break;
            if (c + 1 < n && hk[c + 1] < hk[c]) c++;
            if (hk[c] >= k) break;
            hi[p] = hi[c]; hk[p] = hk[c]; p = c;
        }
        hi[p] = i; hk[p] = k;
    }
    return top;
}

// A free cell at or next to (x, y) for a source, or -1
function freeCell(nav, block, x, y) {
    const c0 = cellOf(nav, x, y);
    if (!block[c0]) return c0;
    const cx = c0 % nav.nx, cy = (c0 / nav.nx) | 0;
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 3 && best === -1; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const ax = cx + dx, ay = cy + dy;
            if (ax < 0 || ay < 0 || ax >= nav.nx || ay >= nav.ny || block[ay * nav.nx + ax]) continue;
            const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = ay * nav.nx + ax; }
        }
    }
    return best;
}

// The distance field to `sources` ([{ x, y }] points, or { ring: true, x, y, r0, r1 } = every free cell between two radii of a point, for the
// base): out[cell] = the cost of the way from that cell, Infinity if there is none within maxCost (in cells of walking). One field per size.
function build(nav, large, sources, maxCost, out) {
    const block = large ? nav.blockL : nav.blockS, nx = nav.nx, ny = nav.ny, wall = nav.wall;
    out.fill(Infinity); nav.heapN = 0;
    for (let s = 0; s < sources.length; s++) {
        const src = sources[s];
        if (src.ring) {
            const x0 = Math.max(0, ((src.x - src.r1) / CELL) | 0), x1 = Math.min(nx - 1, ((src.x + src.r1) / CELL) | 0);
            const y0 = Math.max(0, ((src.y - src.r1) / CELL) | 0), y1 = Math.min(ny - 1, ((src.y + src.r1) / CELL) | 0);
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const i = y * nx + x; if (block[i]) continue;
                const d = Math.hypot((x + 0.5) * CELL - src.x, (y + 0.5) * CELL - src.y);
                if (d >= src.r0 && d <= src.r1) { out[i] = 0; push(nav, i, 0); }
            }
        } else {
            const i = freeCell(nav, block, src.x, src.y);
            if (i >= 0 && out[i] > 0) { out[i] = 0; push(nav, i, 0); }
        }
    }
    while (nav.heapN > 0) {
        const i = pop(nav), k = nav._popK;
        if (k > out[i]) continue;
        const cx = i % nx, cy = (i / nx) | 0;
        for (let dy = -1; dy <= 1; dy++) {
            const ay = cy + dy; if (ay < 0 || ay >= ny) continue;
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const ax = cx + dx; if (ax < 0 || ax >= nx) continue;
                const j = ay * nx + ax; if (block[j]) continue;
                if (dx && dy && (block[cy * nx + ax] || block[ay * nx + cx])) continue;   // no cutting a corner of a solid cell
                const nk = k + (dx && dy ? SQ2 : 1) + wall[j];
                if (nk < out[j] && nk <= maxCost) { out[j] = nk; push(nav, j, nk); }
            }
        }
    }
    return out;
}

// Which way from (x, y): out.x/out.y = a point a few cells down the field (look = how many), out.owner = the wall (the caller's ref) that
// is the very next cell of the way, if it is one, out.dist = the cost still to go. false if the field says nothing here (no way
// within its reach): the caller walks straight, as before.
function steer(nav, field, large, x, y, look, out) {
    const block = large ? nav.blockL : nav.blockS, nx = nav.nx, ny = nav.ny;
    let i = cellOf(nav, x, y);
    if (field[i] === Infinity) {   // in a solid cell's margin (a zombie by a tree) or off the field: the best free cell next to it
        const cx = i % nx, cy = (i / nx) | 0; let best = -1, bk = Infinity;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const ax = cx + dx, ay = cy + dy; if (ax < 0 || ay < 0 || ax >= nx || ay >= ny) continue;
            const j = ay * nx + ax; if (field[j] < bk) { bk = field[j]; best = j; }
        }
        if (best === -1) return false;
        i = best;
    }
    out.owner = null; out.dist = field[i];
    if (!out.px) { out.px = []; out.py = []; }
    out.n = 0;
    let first = true;
    for (let s = 0; s < look; s++) {
        const cx = i % nx, cy = (i / nx) | 0; let best = -1, bk = field[i];
        for (let dy = -1; dy <= 1; dy++) {
            const ay = cy + dy; if (ay < 0 || ay >= ny) continue;
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const ax = cx + dx; if (ax < 0 || ax >= nx) continue;
                const j = ay * nx + ax; if (block[j] || !(field[j] < bk)) continue;
                if (dx && dy && (block[cy * nx + ax] || block[ay * nx + cx])) continue;
                bk = field[j]; best = j;
            }
        }
        if (best === -1) break;
        i = best; out.px[out.n] = (i % nx + 0.5) * CELL; out.py[out.n] = ((i / nx) | 0) * CELL + CELL / 2; out.n++;
        if (nav.wall[best] > 0) {   // the way goes through a wall: stop at it (and say which one if it is the very next cell)
            if (first) out.owner = nav.items[nav.owner[best] - 1] || null;
            break;
        }
        first = false;
    }
    if (out.n === 0) { out.px[0] = (i % nx + 0.5) * CELL; out.py[0] = ((i / nx) | 0) * CELL + CELL / 2; out.n = 1; }   // already at the lowest cell: stay there
    out.x = out.px[out.n - 1]; out.y = out.py[out.n - 1];   // the furthest point (the caller may pick a nearer one: out.px / out.py hold the steps)
    return true;
}

module.exports = { create, setStatics, setWalls, newField, build, steer, cellOf, CELL, INFL_S, INFL_L };

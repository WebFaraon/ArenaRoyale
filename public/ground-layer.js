// ============================================
// ARENA ROYALE - ground-layer.js
// The static part of the pitch (turf, colour patches, grass, chalk markings, kerb) drawn from cached bitmap tiles.
// Before, every frame stroked ~20 paths (grass tufts, dashed rings, lattice, boundary): the GPU needed 10-13 ms
// for them at 2560x1600, so the frame rate stayed at 55-80 whatever the screen refresh. The tiles are painted once
// by the very same functions (ARArena.drawGround / drawGrass / drawMarkings), then a frame is ~25 drawImage calls.
//
// - Tiles are small (TILE world units + a margin each side), never one big canvas: iOS Safari limits canvas area.
//   Memory is capped (BUDGET_MB) and tiles not used for a while are freed.
// - Each tile is an opaque, finished picture and overlaps its neighbours by MARGIN, so no seam can show at any
//   position or zoom (the overlap holds the same picture; an opaque edge over identical pixels changes nothing).
// - Built at the current pixel scale; while the zoom moves the old bitmap is stretched, and rebuilt a few at a time
//   once the scale is stable (ARArena.isScaleStable), like the other sprites. A tile not built yet is painted as
//   vectors, clipped to its own area, so nothing is ever missing.
// - ?gfx=legacy in the URL draws everything the old way (for comparison). setTheme(key) / invalidate() drop the
//   cache (a new season or look): the next frames build it again.
// - Whole-pixel blits: game.js keeps the device scale a multiple of 1/256 and the camera on whole device pixels, so a
//   256-unit tile is exactly n pixels and a tile blits 1:1 at an integer position. A fractional position or scale makes
//   the canvas filter every pixel (bilinear): in a software raster that was ~4.8 ms/frame at 1280x720 for the ground
//   alone, against ~1.1 ms for the same ground blitted 1:1. Tiles built for another n (the zoom just moved, or a
//   device scale that is not a multiple of 1/256) are drawn the old way, stretched, until they are rebuilt.
// Drawing only: no game state is read or changed here.
// ============================================
(function () {
    'use strict';

    const AW = 2600, AH = 2600;           // the arena (game.js ARENA_W / ARENA_H)
    const TILE = 256, MARGIN = 6;         // world units of a tile and its overlap on every side
    const ORIGIN = -32;                   // grid origin: the tiles reach 32 units outside the arena (kerb)
    const NT = 11;                        // tiles per axis: ORIGIN + 11 * 256 = 2784 > AW + 32
    const CULL = 24;                      // painting a tile culls with this much slack (a tuft is up to ~18 units long)
    const MAX_K = 2.5;                    // pixels per world unit of a tile bitmap, at most (a bitmap is stretched beyond)
    const STALE_LO = 0.87, STALE_HI = 1.15;  // rebuild once the screen scale is this far from the bitmap's
    const IDLE_MS = 20000;                // a tile not drawn for this long is freed
    const SURROUND = '#101A15';           // the dark ground outside the arena (arena-art.js drawGround)
    const touchMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '') && (navigator.maxTouchPoints || 0) > 1;
    const MOBILE = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod|Android/.test(navigator.userAgent || '') || touchMac);
    let BUDGET = (MOBILE ? 40 : 72) * 1048576;

    let legacy = false;
    try { legacy = new URLSearchParams(location.search).get('gfx') === 'legacy'; } catch (e) { /* no URL API */ }

    // Static decoration of the map (colour patches, grass tufts), seeded, so every client has the same field.
    // Same generator the match used inline (the flowers are drawn nowhere but still consume the sequence).
    function makeDeco() {
        let s = 0x1337cafe;
        const r = () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >> 7)) >>> 0; s = (s ^ (s << 17)) >>> 0; return s / 0xffffffff; };
        const W = 2600, H = 2600;
        const colorZones = [];
        for (let i = 0; i < 14; i++) {
            colorZones.push({ x: r() * W, y: r() * H, rx: 150 + r() * 280, ry: 100 + r() * 200,
                c: `rgba(${30 + (r() * 25) | 0},${90 + (r() * 40) | 0},${5 + (r() * 18) | 0},${(0.11 + r() * 0.10).toFixed(2)})` });
        }
        const FC = ['#ef4444', '#fde93d', '#ffffff', '#c084fc', '#ff9ff3', '#74b9ff', '#fdcb6e', '#a8e063'];
        const flowers = [];
        for (let i = 0; i < 260; i++) {
            flowers.push({ x: r() * W, y: r() * H, radius: 2.2 + r() * 2.8, c: FC[(r() * FC.length) | 0] });
        }
        const grassTufts = [];
        for (let i = 0; i < 420; i++) {
            grassTufts.push({ x: r() * W, y: r() * H, angle: -0.45 + r() * 0.9, len: 8 + r() * 10, a: 0.22 + r() * 0.26, dark: r() > 0.5 });
        }
        return { colorZones, flowers, grassTufts };
    }

    let deco = null, theme = '';
    const tiles = new Map();              // iy * 16 + ix -> { c, k, px, x0, y0, wU, bytes, last, lastMs }
    let bytes = 0, frame = 0, budget = 2, burst = 0;
    const stats = { built: 0, fallback: 0, evicted: 0, lastBuildMs: 0, buildMs: 0 };

    function setDeco(d) { deco = d; invalidate(); }
    function invalidate() {
        for (const t of tiles.values()) { t.c.width = 0; t.c.height = 0; }
        tiles.clear(); bytes = 0;
    }
    function setTheme(key) { key = String(key || ''); if (key !== theme) { theme = key; invalidate(); } }

    // The old drawing of the ground, in the order the match used: turf, colour patches, grass, markings.
    // l, t, r, b: the rectangle to cover (it also decides what is culled).
    function paintRegion(g, l, t, r, b) {
        ARArena.drawGround(g, l, t, r, b, AW, AH);
        g.save();
        g.beginPath();
        g.rect(0, 0, AW, AH);
        g.clip();
        for (const z of deco.colorZones) {
            if (z.x + z.rx < l || z.x - z.rx > r || z.y + z.ry < t || z.y - z.ry > b) continue;
            g.fillStyle = z.c;
            g.beginPath();
            g.ellipse(z.x, z.y, z.rx, z.ry, 0, 0, Math.PI * 2);
            g.fill();
        }
        g.restore();
        ARArena.drawGrass(g, deco.grassTufts, l, t, r, b);
        g.globalAlpha = 1;
        g.lineCap = 'butt';
        ARArena.drawMarkings(g, l, t, r, b, AW, AH, 1);
    }

    function build(ix, iy, k) {
        const t0 = performance.now();
        const wU = TILE + 2 * MARGIN, x0 = ORIGIN + ix * TILE - MARGIN, y0 = ORIGIN + iy * TILE - MARGIN;
        const px = Math.max(16, Math.ceil(wU * k)), kk = px / wU;   // kk: the exact density of this bitmap
        const c = document.createElement('canvas');
        c.width = c.height = px;
        const g = c.getContext('2d');
        g.setTransform(kk, 0, 0, kk, -x0 * kk, -y0 * kk);
        g.beginPath();
        g.rect(x0, y0, wU, wU);
        g.clip();
        paintRegion(g, x0 - CULL, y0 - CULL, x0 + wU + CULL, y0 + wU + CULL);
        const ms = performance.now() - t0;
        stats.built++; stats.lastBuildMs = ms; stats.buildMs += ms;
        return { c, k: kk, px, x0, y0, wU, bytes: px * px * 4, last: frame, lastMs: 0 };
    }

    // The whole-pixel tile: n = device pixels per TILE (so the scale is n / TILE), MARGIN rounded up to whole pixels.
    // World X is at tile pixel X*sq - dO - ix*n + mpx (dO: the grid origin in whole pixels), the same mapping for every
    // tile, so neighbours agree to the pixel where they overlap. x0/y0/wU are where the old (stretched) drawing puts it.
    function buildInt(ix, iy, n) {
        const t0 = performance.now();
        const sq = n / TILE, mpx = Math.ceil(MARGIN * sq), px = n + 2 * mpx, dO = Math.round(ORIGIN * sq);
        const wx0 = (dO + ix * n - mpx) / sq, wy0 = (dO + iy * n - mpx) / sq, wU = px / sq;
        const c = document.createElement('canvas');
        c.width = c.height = px;
        const g = c.getContext('2d');
        g.setTransform(sq, 0, 0, sq, -dO - ix * n + mpx, -dO - iy * n + mpx);
        g.beginPath();
        g.rect(wx0, wy0, wU, wU);
        g.clip();
        paintRegion(g, wx0 - CULL, wy0 - CULL, wx0 + wU + CULL, wy0 + wU + CULL);
        const ms = performance.now() - t0;
        stats.built++; stats.lastBuildMs = ms; stats.buildMs += ms;
        return { c, k: sq, n, mpx, px, dO, x0: wx0, y0: wy0, wU, bytes: px * px * 4, last: frame, lastMs: 0 };
    }

    // Allowed builds per frame: a couple in play, a few more while a match starts (countdown)
    function beginFrame(allowBurst) {
        frame++;
        budget = allowBurst ? 6 : 2;
    }

    // ctx: the world transform is set. view: the visible rectangle in world units. scale: device pixels per world unit.
    // stable: the zoom has settled (ARArena.isScaleStable()). now: performance.now().
    // ox, oy (optional): the device pixel of world (0, 0), whole numbers; with `scale` a multiple of 1/256 they allow 1:1 blits.
    function draw(ctx, l, t, r, b, scale, stable, now, ox, oy) {
        if (legacy || !deco || typeof ARArena === 'undefined') { if (deco) paintRegion(ctx, l, t, r, b); return; }
        const n = Math.round(scale * TILE);
        const whole = ox !== undefined && n >= 16 && n <= MAX_K * TILE && Math.abs(scale * TILE - n) < 1e-4 && ox === Math.round(ox) && oy === Math.round(oy);
        // the dark surround, only where no tile reaches (the grid covers ORIGIN .. ORIGIN + NT * TILE; a tile is opaque)
        const gEnd = ORIGIN + NT * TILE;
        if (l < ORIGIN || t < ORIGIN || r > gEnd || b > gEnd) {
            ctx.fillStyle = SURROUND;
            if (l < ORIGIN) ctx.fillRect(l, t, ORIGIN - l, b - t);
            if (r > gEnd) ctx.fillRect(gEnd, t, r - gEnd, b - t);
            const cl = Math.max(l, ORIGIN), cr = Math.min(r, gEnd);
            if (t < ORIGIN) ctx.fillRect(cl, t, cr - cl, ORIGIN - t);
            if (b > gEnd) ctx.fillRect(cl, gEnd, cr - cl, b - gEnd);
        }
        const k = Math.min(MAX_K, scale);
        const ix0 = Math.max(0, Math.floor((l - ORIGIN - MARGIN) / TILE)), ix1 = Math.min(NT - 1, Math.floor((r - ORIGIN + MARGIN) / TILE));
        const iy0 = Math.max(0, Math.floor((t - ORIGIN - MARGIN) / TILE)), iy1 = Math.min(NT - 1, Math.floor((b - ORIGIN + MARGIN) / TILE));
        let devMode = false;          // the transform is the identity (whole-pixel blits) rather than the world one
        const sq = n / TILE, dO0 = Math.round(ORIGIN * sq), mp0 = Math.ceil(MARGIN * sq);
        for (let iy = iy0; iy <= iy1; iy++) {
            for (let ix = ix0; ix <= ix1; ix++) {
                const key = iy * 16 + ix;
                let tile = tiles.get(key);
                // whole-pixel mode wants a tile built for exactly this n; otherwise the old rule (rebuild once the scale is far off)
                const stale = tile && stable && (whole ? tile.n !== n : (tile.k / k < STALE_LO || tile.k / k > STALE_HI));
                if (budget > 0 && (!tile || stale)) {
                    budget--;
                    const nt = whole ? buildInt(ix, iy, n) : build(ix, iy, k);
                    if (tile) { bytes -= tile.bytes; tile.c.width = 0; tile.c.height = 0; }
                    tiles.set(key, nt); bytes += nt.bytes; tile = nt;
                }
                if (tile) {
                    tile.last = frame; tile.lastMs = now;
                    if (whole && tile.n === n) {
                        if (!devMode) { ctx.setTransform(1, 0, 0, 1, 0, 0); devMode = true; }
                        ctx.drawImage(tile.c, ox + dO0 + ix * n - mp0, oy + dO0 + iy * n - mp0);
                    } else {
                        if (devMode) { ctx.setTransform(scale, 0, 0, scale, ox, oy); devMode = false; }
                        ctx.drawImage(tile.c, tile.x0, tile.y0, tile.wU, tile.wU);
                    }
                } else {
                    // not built yet: the same picture as vectors, inside the tile's own area
                    if (devMode) { ctx.setTransform(scale, 0, 0, scale, ox, oy); devMode = false; }
                    stats.fallback++;
                    const x = ORIGIN + ix * TILE, y = ORIGIN + iy * TILE;
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x, y, TILE, TILE);
                    ctx.clip();
                    paintRegion(ctx, x - CULL, y - CULL, x + TILE + CULL, y + TILE + CULL);
                    ctx.restore();
                }
            }
        }
        if (devMode) ctx.setTransform(scale, 0, 0, scale, ox, oy);
        // one tile ahead per frame, in the ring just outside the view, so walking never meets an unbuilt tile
        if (budget > 0) {
            for (let iy = Math.max(0, iy0 - 1); iy <= Math.min(NT - 1, iy1 + 1) && budget > 0; iy++) {
                for (let ix = Math.max(0, ix0 - 1); ix <= Math.min(NT - 1, ix1 + 1); ix++) {
                    const key = iy * 16 + ix;
                    if (tiles.has(key)) continue;
                    const nt = whole ? buildInt(ix, iy, n) : build(ix, iy, k);
                    nt.last = frame - 1; nt.lastMs = now;     // not drawn: evicted first if memory is short
                    tiles.set(key, nt); bytes += nt.bytes; budget = 0; break;
                }
            }
        }
        if (bytes > BUDGET || (frame & 63) === 0) evict(now);
    }

    // Builds, ahead of need, the tiles of a rectangle that is not on the screen (where the camera is about to jump: the PvE players are put
    // back by the base when a wave starts). At most `maxBuild` a call; the tiles already there are kept alive (they do not go idle).
    // Same arguments as draw(); returns how many tiles of the rectangle are still missing.
    function warm(l, t, r, b, scale, stable, now, ox, oy, maxBuild) {
        if (legacy || !deco || !stable || typeof ARArena === 'undefined') return 0;
        const n = Math.round(scale * TILE);
        const whole = ox !== undefined && n >= 16 && n <= MAX_K * TILE && Math.abs(scale * TILE - n) < 1e-4 && ox === Math.round(ox) && oy === Math.round(oy);
        const k = Math.min(MAX_K, scale);
        const ix0 = Math.max(0, Math.floor((l - ORIGIN - MARGIN) / TILE)), ix1 = Math.min(NT - 1, Math.floor((r - ORIGIN + MARGIN) / TILE));
        const iy0 = Math.max(0, Math.floor((t - ORIGIN - MARGIN) / TILE)), iy1 = Math.min(NT - 1, Math.floor((b - ORIGIN + MARGIN) / TILE));
        let missing = 0, built = 0;
        for (let iy = iy0; iy <= iy1; iy++) {
            for (let ix = ix0; ix <= ix1; ix++) {
                const key = iy * 16 + ix, tile = tiles.get(key);
                if (tile && (whole ? tile.n === n : !(tile.k / k < STALE_LO || tile.k / k > STALE_HI))) { tile.lastMs = now; continue; }
                missing++;
                if (built >= maxBuild) continue;
                const nt = whole ? buildInt(ix, iy, n) : build(ix, iy, k);
                if (tile) { bytes -= tile.bytes; tile.c.width = 0; tile.c.height = 0; }
                nt.last = frame - 1; nt.lastMs = now;     // not drawn: evicted first if memory is short, but not idle
                tiles.set(key, nt); bytes += nt.bytes; built++; missing--;
            }
        }
        return missing;
    }

    // Frees tiles not drawn this frame: the oldest first while over budget, anything idle for IDLE_MS regardless
    function evict(now) {
        let list = null;
        for (const [key, t] of tiles) {
            if (t.last === frame) continue;
            if (now - t.lastMs > IDLE_MS) { drop(key, t); continue; }
            if (bytes > BUDGET) (list || (list = [])).push([key, t]);
        }
        if (list) {
            list.sort((a, b) => a[1].last - b[1].last);
            for (let i = 0; i < list.length && bytes > BUDGET; i++) drop(list[i][0], list[i][1]);
        }
    }
    function drop(key, t) { bytes -= t.bytes; t.c.width = 0; t.c.height = 0; tiles.delete(key); stats.evicted++; }

    window.ARGround = {
        makeDeco, setDeco, setTheme, invalidate, beginFrame, draw, warm, paintRegion,
        paintsAll() { return !legacy && !!deco && typeof ARArena !== 'undefined'; },   // draw() leaves no pixel of the view untouched
        setLegacy(v) { legacy = !!v; },
        setBudgetMb(mb) { BUDGET = mb * 1048576; },
        isLegacy() { return legacy; },
        info() { return { tiles: tiles.size, mb: +(bytes / 1048576).toFixed(1), budgetMb: BUDGET / 1048576, ...stats, legacy }; },
        TILE, MARGIN, ORIGIN, NT,
    };
})();

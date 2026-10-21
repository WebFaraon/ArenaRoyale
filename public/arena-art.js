// ============================================
// ARENA ROYALE - arena-art.js
// Look of the match: the pitch, trees, rocks, zombies and the closing zone.
// Drawing only. Hitboxes, positions and game state are never read or changed here.
// ============================================
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const CHALK = '242,239,230';
    const LIGHT_ANGLE = -2.35; // light comes from the upper left, for trees and rocks alike

    // ---------- helpers ----------
    function lerp(a, b, t) { return a + (b - a) * t; }
    function mix(c0, c1, t) {
        return 'rgb(' + Math.round(lerp(c0[0], c1[0], t)) + ',' + Math.round(lerp(c0[1], c1[1], t)) + ',' + Math.round(lerp(c0[2], c1[2], t)) + ')';
    }

    // ---------- the pitch ----------
    // Out of bounds is dark stadium ground; inside, mown turf in alternating bands.
    function drawGround(ctx, l, t, r, b, AW, AH) {
        // the dark surround only shows when the view reaches past the arena edge
        if (l < 0 || t < 0 || r > AW || b > AH) {
            ctx.fillStyle = '#101A15';
            ctx.fillRect(l, t, r - l, b - t);
        }
        const x0 = Math.max(0, l), y0 = Math.max(0, t), x1 = Math.min(AW, r), y1 = Math.min(AH, b);
        if (x1 <= x0 || y1 <= y0) return;
        ctx.fillStyle = '#4F8B3B';
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        const band = 130;
        ctx.fillStyle = 'rgba(16,52,22,.13)';
        for (let x = Math.floor(x0 / band) * band; x < x1; x += band) {
            if (((x / band) & 1) !== 0) continue;
            const xs = Math.max(x, x0), xe = Math.min(x + band, x1);
            ctx.fillRect(xs, y0, xe - xs, y1 - y0);
        }
    }

    // Strokes only the part of a dashed circle that can be on screen. Dashing the whole circle
    // costs ~1 ms per frame for the big rings; the dash offset keeps the pattern anchored to the
    // circle exactly as if it had been drawn in full from angle 0.
    function visibleArc(ctx, cx, cy, rad, l, t, r, b, dashLen) {
        const m = ctx.lineWidth;
        const L = l - m, T = t - m, Rr = r + m, B = b + m;
        // circle entirely off the view?
        const nx = Math.max(L, Math.min(cx, Rr)) - cx, ny = Math.max(T, Math.min(cy, B)) - cy;
        if (nx * nx + ny * ny > rad * rad) return;
        const fx = Math.max(Math.abs(L - cx), Math.abs(Rr - cx)), fy = Math.max(Math.abs(T - cy), Math.abs(B - cy));
        if (fx * fx + fy * fy < rad * rad) return; // view entirely inside the ring
        let a0 = 0, a1 = TAU;
        if (cx < L || cx > Rr || cy < T || cy > B) {
            // centre outside the view: the view spans less than half a turn as seen from it
            const ref = Math.atan2((T + B) / 2 - cy, (L + Rr) / 2 - cx);
            let lo = 0, hi = 0;
            const xs = [L, Rr, Rr, L], ys = [T, T, B, B];
            for (let i = 0; i < 4; i++) {
                let d = Math.atan2(ys[i] - cy, xs[i] - cx) - ref;
                if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
                if (d < lo) lo = d; if (d > hi) hi = d;
            }
            a0 = ref + lo; a1 = ref + hi;
            a0 = ((a0 % TAU) + TAU) % TAU; a1 = a0 + (hi - lo);
        }
        ctx.lineDashOffset = (a0 * rad) % dashLen;
        ctx.beginPath(); ctx.arc(cx, cy, rad, a0, a1); ctx.stroke();
    }

    // Chalk markings: centre rings, registration crosses, a ticked boundary line.
    function drawMarkings(ctx, l, t, r, b, AW, AH, zoom) {
        ctx.save();
        const cx = AW / 2, cy = AH / 2;
        ctx.lineCap = 'butt';

        ctx.strokeStyle = 'rgba(' + CHALK + ',.30)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cx, cy, 240, 0, TAU); ctx.stroke();
        ctx.setLineDash([22, 18]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(' + CHALK + ',.20)';
        visibleArc(ctx, cx, cy, 720, l, t, r, b, 40);
        visibleArc(ctx, cx, cy, 1200, l, t, r, b, 40);
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        ctx.fillStyle = 'rgba(' + CHALK + ',.30)';
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, TAU); ctx.fill();

        // registration crosses on a loose lattice
        const step = 260;
        ctx.strokeStyle = 'rgba(' + CHALK + ',.20)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = Math.ceil(Math.max(0, l) / step) * step; x < Math.min(AW, r); x += step) {
            for (let y = Math.ceil(Math.max(0, t) / step) * step; y < Math.min(AH, b); y += step) {
                ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y);
                ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9);
            }
        }
        ctx.stroke();

        // boundary: a dark kerb outside, a chalk line inside, ticks every 200
        ctx.strokeStyle = '#0B130F';
        ctx.lineWidth = 22;
        ctx.strokeRect(-11, -11, AW + 22, AH + 22);
        ctx.strokeStyle = 'rgba(' + CHALK + ',.92)';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, AW - 6, AH - 6);
        ctx.strokeStyle = 'rgba(' + CHALK + ',.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = 200; x < AW; x += 200) {
            if (x < l || x > r) continue;
            ctx.moveTo(x, 6); ctx.lineTo(x, 34);
            ctx.moveTo(x, AH - 6); ctx.lineTo(x, AH - 34);
        }
        for (let y = 200; y < AH; y += 200) {
            if (y < t || y > b) continue;
            ctx.moveTo(6, y); ctx.lineTo(34, y);
            ctx.moveTo(AW - 6, y); ctx.lineTo(AW - 34, y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // ---------- trees: a flat canopy of overlapping lobes, lit from the upper left ----------
    function lobePath(ctx, x, y, rot, dist, lr, cr, n) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const a = rot + (i * TAU) / n;
            const cx = x + Math.cos(a) * dist, cy = y + Math.sin(a) * dist;
            ctx.moveTo(cx + lr, cy);
            ctx.arc(cx, cy, lr, 0, TAU);
        }
        if (cr > 0) { ctx.moveTo(x + cr, y); ctx.arc(x, y, cr, 0, TAU); }
    }
    function drawTree(ctx, x, y, r, rot) {
        const R = r * 1.1;
        const n = 6;
        const dist = R * 0.5, lr = R * 0.56;
        ctx.fillStyle = 'rgba(8,30,14,.32)';
        ctx.beginPath(); ctx.ellipse(x + R * 0.18, y + R * 0.28, R * 1.02, R * 0.88, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#16401C';
        lobePath(ctx, x, y, rot, dist, lr + 3, R * 0.62 + 3, n); ctx.fill();
        ctx.fillStyle = '#2A6B30';
        lobePath(ctx, x, y, rot, dist, lr, R * 0.62, n); ctx.fill();
        ctx.fillStyle = '#3B8639';
        lobePath(ctx, x - R * 0.05, y - R * 0.08, rot, dist * 0.92, lr * 0.74, R * 0.46, n); ctx.fill();
        // highlights: a lit crescent on the upper-left rim of every lobe
        ctx.strokeStyle = '#6CBB56';
        ctx.lineWidth = Math.max(2, R * 0.05);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const a = rot + (i * TAU) / n;
            const hx = x + Math.cos(a) * dist, hy = y + Math.sin(a) * dist;
            ctx.moveTo(hx + Math.cos(LIGHT_ANGLE - 0.8) * lr * 0.74, hy + Math.sin(LIGHT_ANGLE - 0.8) * lr * 0.74);
            ctx.arc(hx, hy, lr * 0.74, LIGHT_ANGLE - 0.8, LIGHT_ANGLE + 0.8);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    // ---------- rocks: low-poly boulders with a fixed light, so facets do not spin with the rock ----------
    const ROCK_DARK = [58, 70, 79], ROCK_LIGHT = [140, 154, 164];
    function drawRock(ctx, x, y, r, rot) {
        const n = 7, R = r * 0.96;
        const pts = [];
        for (let i = 0; i < n; i++) {
            const a = rot + (i * TAU) / n;
            const k = 0.84 + 0.16 * Math.sin(i * 2.7 + rot * 3.1);
            pts.push([x + Math.cos(a) * R * k, y + Math.sin(a) * R * k]);
        }
        ctx.fillStyle = 'rgba(6,22,12,.34)';
        ctx.beginPath();
        for (let i = 0; i < n; i++) { i ? ctx.lineTo(pts[i][0] + 5, pts[i][1] + 8) : ctx.moveTo(pts[i][0] + 5, pts[i][1] + 8); }
        ctx.closePath(); ctx.fill();
        for (let i = 0; i < n; i++) {
            const p = pts[i], q = pts[(i + 1) % n];
            const am = rot + ((i + 0.5) * TAU) / n;
            const tt = (Math.cos(am - LIGHT_ANGLE) + 1) / 2;
            ctx.fillStyle = mix(ROCK_DARK, ROCK_LIGHT, tt);
            ctx.beginPath();
            ctx.moveTo(x - R * 0.06, y - R * 0.1);
            ctx.lineTo(p[0], p[1]);
            ctx.lineTo(q[0], q[1]);
            ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#25313A';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < n; i++) { i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]); }
        ctx.closePath(); ctx.stroke();
        ctx.lineJoin = 'miter';
    }

    // ---------- closing zone: darkened ground with hazard hatching and a hard edge ----------
    // The darkening and the hatching live in one pattern tile (same result as filling one over the
    // other: source-over is associative), so the outside of the zone costs one fill, not two.
    let zonePattern = null;
    function getZonePattern(ctx) {
        if (zonePattern) return zonePattern;
        const c = document.createElement('canvas');
        c.width = c.height = 28;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(9,20,18,.5)';
        g.fillRect(0, 0, 28, 28);
        g.strokeStyle = 'rgba(255,65,85,.34)';
        g.lineWidth = 6;
        g.beginPath();
        [0, 28, 56].forEach(function (k) { g.moveTo(k + 4, -4); g.lineTo(k - 32, 32); });
        g.stroke();
        zonePattern = ctx.createPattern(c, 'repeat');
        return zonePattern;
    }
    function drawZone(ctx, l, t, r, b, zone, zoom) {
        // Where the view sits against the safe circle (the edge lines reach 16px inside it):
        //   whole view inside  -> nothing visible at all (most of a match)
        //   circle off-screen  -> plain shaded rect, no hole and no edge lines
        let inside = false, reaches = false;
        if (zone.r > 0) {
            const fx = Math.max(Math.abs(l - zone.cx), Math.abs(r - zone.cx));
            const fy = Math.max(Math.abs(t - zone.cy), Math.abs(b - zone.cy));
            const rin = zone.r - 18 / zoom;
            inside = rin > 0 && fx * fx + fy * fy <= rin * rin;
            const nx = Math.max(l, Math.min(zone.cx, r)) - zone.cx;
            const ny = Math.max(t, Math.min(zone.cy, b)) - zone.cy;
            const rout = zone.r + 4 / zoom;
            reaches = nx * nx + ny * ny < rout * rout;
        }
        if (inside) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(l, t, r - l, b - t);
        if (reaches) ctx.arc(zone.cx, zone.cy, zone.r, 0, TAU, true);
        ctx.fillStyle = getZonePattern(ctx) || 'rgba(9,20,18,.5)';
        ctx.fill();
        if (reaches) {
            ctx.beginPath();
            ctx.arc(zone.cx, zone.cy, zone.r, 0, TAU);
            ctx.strokeStyle = '#FF4155';
            ctx.lineWidth = 5 / zoom;
            ctx.stroke();
            ctx.setLineDash([16 / zoom, 12 / zoom]);
            ctx.strokeStyle = 'rgba(' + CHALK + ',.6)';
            ctx.lineWidth = 2 / zoom;
            visibleArc(ctx, zone.cx, zone.cy, Math.max(0, zone.r - 14 / zoom), l, t, r, b, 28 / zoom);
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }
        ctx.restore();
    }

    // ---------- zombies: top-down, facing +x: shoulders, head, reaching arms ----------
    function capsule(ctx, x0, y0, x1, y1, w, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    function drawZombie(ctx, zb, def, R, now) {
        ctx.save();
        ctx.translate(zb.x, zb.y);

        // threat ring
        ctx.beginPath();
        ctx.arc(0, 0, R + 9, 0, TAU);
        ctx.fillStyle = def.ringFill;
        ctx.fill();
        ctx.strokeStyle = def.ringColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.rotate(zb.angle);

        ctx.fillStyle = 'rgba(6,22,12,.3)';
        ctx.beginPath(); ctx.ellipse(R * 0.12, R * 0.22, R * 0.85, R * 1.05, 0, 0, TAU); ctx.fill();

        // arms: outline pass, then colour pass, then hands; they sway out of step
        const sway = Math.sin(now * 0.008 + (zb.x + zb.y) * 0.05) * R * 0.14;
        for (let s = -1; s <= 1; s += 2) {
            const ex = R * 1.5, ey = s * R * 0.5 + s * sway;
            capsule(ctx, R * 0.15, s * R * 0.78, ex, ey, R * 0.5, def.armStroke);
            capsule(ctx, R * 0.15, s * R * 0.78, ex, ey, R * 0.34, def.armColor);
            ctx.fillStyle = def.innerColor;
            ctx.beginPath(); ctx.arc(ex, ey, R * 0.22, 0, TAU); ctx.fill();
        }

        // shoulders
        ctx.beginPath();
        ctx.ellipse(-R * 0.05, 0, R * 0.72, R * 1.0, 0, 0, TAU);
        ctx.fillStyle = def.bodyColor;
        ctx.fill();
        ctx.strokeStyle = def.armStroke;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // torn cloth: two darker patches
        ctx.fillStyle = def.armStroke;
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.ellipse(-R * 0.3, R * 0.38, R * 0.22, R * 0.14, 0.6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-R * 0.34, -R * 0.3, R * 0.16, R * 0.11, -0.5, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;

        // heavy type: shoulder plates
        if (zb.type === 2) {
            ctx.fillStyle = def.armColor;
            ctx.strokeStyle = def.armStroke;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(-R * 0.5, -R * 1.02, R * 0.78, R * 0.34, 3); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.roundRect(-R * 0.5, R * 0.68, R * 0.78, R * 0.34, 3); ctx.fill(); ctx.stroke();
        }

        // head and eyes
        ctx.beginPath();
        ctx.arc(R * 0.22, 0, R * 0.52, 0, TAU);
        ctx.fillStyle = def.innerColor;
        ctx.fill();
        ctx.strokeStyle = def.armStroke;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = def.ringColor;
        ctx.beginPath(); ctx.arc(R * 0.5, -R * 0.19, R * 0.1, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(R * 0.5, R * 0.19, R * 0.1, 0, TAU); ctx.fill();
        ctx.restore();
    }

    // ---------- sprite cache ----------
    // Trees, rocks and zombies are drawn from bitmaps rasterised once at the current pixel scale
    // (world units -> device pixels): one drawImage instead of 20-40 path operations each.
    // A bitmap made at another scale is still used, stretched, while the zoom is moving; it is
    // redone once the scale has been stable for a moment. At most SPRITE_BUDGET bitmaps are made
    // per frame (anything over budget is drawn as vectors that frame), so zooming, a new game or
    // a wave of new zombies never turns into a frame spike.
    const SPRITE_BUDGET = 4;
    const STABLE_MS = 300;
    let budget = SPRITE_BUDGET, pixScale = 0, scaleSince = 0, scaleStable = false;
    const propSprites = new WeakMap();
    const CPU_CTX = { willReadFrequently: true };   // obstacle object -> {c, scale}
    const zombieSprites = new Map();     // type index (and 'kit') -> {c, scale, pad}

    // burst: a one-off larger budget (first frame of a match, before anything is cached)
    let burstNext = 0;
    function allowBurst(n) { burstNext = n; }
    function beginFrame(scale, now) {
        budget = burstNext || SPRITE_BUDGET;
        burstNext = 0;
        if (Math.abs(scale - pixScale) > 1e-4 * scale) { pixScale = scale; scaleSince = now; }
        scaleStable = now - scaleSince >= STABLE_MS;
    }
    // Returns a sprite for `key`, making or refreshing it if the budget allows
    function sprite(existing, pad, paint) {
        const fresh = existing && (existing.scale === pixScale || !scaleStable);
        if (fresh || budget <= 0 || !(pixScale > 0)) return existing || null;
        budget--;
        const px = Math.max(2, Math.ceil(pad * 2 * pixScale));
        const c = existing ? existing.c : document.createElement('canvas');
        c.width = px; c.height = px; // also clears
        // CPU-backed: a small bitmap is painted on the CPU in well under a millisecond and uploaded
        // once, instead of queueing complex path raster on the GPU (that stalled the first frame)
        const g = c.getContext('2d', CPU_CTX);
        const k = px / (pad * 2);
        g.setTransform(k, 0, 0, k, px / 2, px / 2);
        paint(g);
        return { c: c, scale: pixScale, pad: pad };
    }

    // ---------- trees and rocks as sprites (one set per season) ----------
    // public/images/map/<season>/<id>.png + public/data/map-objects.json (the pack in _redesign/map-objects):
    // 3 px per world unit, the image centre is the object's position, the shadow is part of the image (down and
    // to the right). Never rotated: only mirrored and scaled a little, both worked out from the obstacle's
    // position, so every player sees the same trees.
    // The server sends only type, position and radius r (the collision, never touched here). Which sprite an
    // obstacle gets follows its r, and the sprite is scaled so its visualRadius covers what the vector drawing
    // below used to cover (trees 1.166 r + 3, rocks 0.96 r + 1.5): the look takes the same room on the map.
    // Until a sprite is in (or when it is missing), the vector drawing is used, so nothing is ever empty.
    // Trees are drawn in a second pass above the players (drawCrown); rocks stay under them.
    const MAP_DIR = '/images/map/';
    const TREE_R = [42, 62], ROCK_R = [26, 42];      // the server's generateObstacles ranges, to split them into bands
    const PINE_SHARE = 64;                           // of 256: about a quarter of the trees are pines
    const VAR_MIN = 0.9, VAR_MAX = 1.1;              // the scale variation
    const CROWN_ALPHA = 0.42, CROWN_FADE = 12;       // a crown with someone under it: opacity, and how fast it gets there (1/s)
    const mapArt = { meta: null, loading: false, want: null, season: null, sets: {} };   // sets[season][id] = { img, state: 0 loading, 1 ready, 2 failed, bmp }
    const mapVariants = new WeakMap();               // obstacle -> { id, flip, k, nom, crownR, alpha }
    const mapDraws = { sprite: 0, vector: 0 };       // objects drawn from sprites / from the old vectors (tests read it)

    // The pixels of a position folded into 32 bits (the same everywhere: server positions are whole numbers)
    function posHash(x, y) {
        let h = Math.imul((x | 0) ^ 0x9E3779B1, 0x85EBCA6B) ^ Math.imul(((y | 0) + 0x7F4A7C15) | 0, 0xC2B2AE35);
        h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
        return h >>> 0;
    }
    function oldTreeRadius(r) { return r * 1.1 * 1.06 + 3; }
    function oldRockRadius(r) { return r * 0.96 + 1.5; }
    function bandOf(r, lo, hi, n) { const q = (r - lo) / (hi - lo); return Math.max(0, Math.min(n - 1, Math.floor(q * n))); }
    // The sprite id of an obstacle (its band by r; a tree can be a pine) and its band's middle r
    function pickSprite(o, h) {
        if (o.type === 'tree') {
            if (((h >>> 11) & 255) < PINE_SHARE) return { id: 'brad', rMid: (TREE_R[0] + TREE_R[1]) / 2, old: oldTreeRadius };
            const b = bandOf(o.r, TREE_R[0], TREE_R[1], 3);
            return { id: ['copac_mic', 'copac_mediu', 'copac_mare'][b], rMid: TREE_R[0] + (TREE_R[1] - TREE_R[0]) * (b * 2 + 1) / 6, old: oldTreeRadius };
        }
        const b = bandOf(o.r, ROCK_R[0], ROCK_R[1], 2);
        return { id: ['piatra_medie', 'piatra_mare'][b], rMid: ROCK_R[0] + (ROCK_R[1] - ROCK_R[0]) * (b * 2 + 1) / 4, old: oldRockRadius };
    }
    // How this obstacle looks: sprite, mirror, size. Null until map-objects.json is in (not remembered then).
    function variantOf(o) {
        let v = mapVariants.get(o);
        if (v !== undefined) return v;
        if (!mapArt.meta) return null;
        const h = posHash(o.x, o.y);
        const pick = pickSprite(o, h);
        const m = mapArt.meta.objects[pick.id];
        const varK = VAR_MIN + (VAR_MAX - VAR_MIN) * (((h >>> 1) & 1023) / 1023);
        const target = pick.old(o.r);                   // what the old drawing covered
        v = {
            id: pick.id, flip: (h & 1) === 1,
            k: target / m.visualRadius * varK,          // sprite scale in the world
            nom: pick.old(pick.rMid) / m.visualRadius,   // the scale its bitmap is made at (the middle of its band)
            crownR: target * varK, alpha: 1, tree: o.type === 'tree',
        };
        mapVariants.set(o, v);
        return v;
    }
    function mapSet(season) {
        return mapArt.sets[season] || (mapArt.sets[season] = {});
    }
    function mapEntry(season, id) {
        const set = mapSet(season);
        let e = set[id];
        if (e) return e;
        e = set[id] = { img: new Image(), state: 0, bmp: [null, null] };
        e.img.onload = function () { e.state = e.img.naturalWidth > 0 ? 1 : 2; };
        e.img.onerror = function () { e.state = 2; console.warn('[map] sprite lipsa: ' + season + '/' + id + ' (se deseneaza varianta veche)'); };
        e.img.src = window.arAsset ? window.arAsset(MAP_DIR + season + '/' + id + '.png') : MAP_DIR + season + '/' + id + '.png';
        return e;
    }
    // The season of the match. Starts loading the sprites at once; safe to call before map-objects.json is in.
    function setMapSeason(season) {
        mapArt.want = season || null;
        if (!mapArt.meta) {
            if (mapArt.loading) return;
            mapArt.loading = true;
            const url = window.arAsset ? window.arAsset('/data/map-objects.json') : '/data/map-objects.json';
            fetch(url).then(function (r) { if (!r.ok) throw new Error('map-objects.json ' + r.status); return r.json(); }).then(function (d) {
                const errs = window.ARShared && window.ARShared.checkMapObjects ? window.ARShared.checkMapObjects(d) : [];
                if (errs.length) throw new Error(errs.join('; '));
                mapArt.meta = d;
                setMapSeason(mapArt.want);
            }).catch(function (e) { console.warn('[map]', e.message, '(se deseneaza varianta veche)'); });
            return;
        }
        const s = mapArt.meta.seasons.indexOf(mapArt.want) >= 0 ? mapArt.want : mapArt.meta.seasons[0];
        mapArt.season = s;
        for (const id of (window.ARShared ? window.ARShared.MAP_OBJECT_IDS : [])) mapEntry(s, id);
    }
    function reduceTo(img, px) {   // halve while the source is over twice the target: a clean downscale in one go looks rough
        let src = img, w = img.naturalWidth;
        while (w > px * 2) {
            const h = Math.ceil(w / 2), c = document.createElement('canvas');
            c.width = c.height = h;
            const g = c.getContext('2d');
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            g.drawImage(src, 0, 0, h, h);
            src = c; w = h;
        }
        return src;
    }
    // The bitmap of a sprite at the current scale, one per mirror (e.bmp[0], e.bmp[1]): the mirror is made once, so
    // drawing takes no transform. Rebuilt when the scale changed (budgeted like every sprite). Null: not possible now.
    function mapBitmap(e, v) {
        const slot = v.flip ? 1 : 0, old = e.bmp[slot];
        if (old && (old.scale === pixScale || !scaleStable)) return old;
        const m = mapArt.meta.objects[v.id], pad = m.frameRadius * v.nom, flip = v.flip;
        const s = sprite(old, pad, function (g) {
            g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
            if (flip) g.scale(-1, 1);
            g.drawImage(reduceTo(e.img, g.canvas.width), -pad, -pad, pad * 2, pad * 2);
        });
        if (s) e.bmp[slot] = s;
        return s || old || null;
    }
    // Makes this obstacle's sprite ready to draw: true when it is (variant known, image in, bitmap made); then
    // curV (how it looks) and curS (its bitmap) hold it until the next call. False: use the vector drawing.
    let curV = null, curS = null;
    function mapPrep(o) {
        if (!mapArt.season) return false;
        const v = variantOf(o);
        if (!v) return false;
        const set = mapArt.sets[mapArt.season], e = (set && set[v.id]) || mapEntry(mapArt.season, v.id);
        if (e.state !== 1) return false;
        const s = mapBitmap(e, v);
        if (!s) return false;
        curV = v; curS = s;
        return true;
    }
    // x, y: the object's centre. The mirror is in the bitmap; alpha < 1 for a crown with someone under it.
    function drawMapObj(ctx, x, y, v, s, alpha) {
        const half = s.pad * (v.k / v.nom);
        if (alpha < 1) { ctx.globalAlpha = alpha; ctx.drawImage(s.c, x - half, y - half, half * 2, half * 2); ctx.globalAlpha = 1; }
        else ctx.drawImage(s.c, x - half, y - half, half * 2, half * 2);
    }
    // The crown of a tree, above the players. Whoever stands under it (ax, ay, ar: centres and radii of the
    // players and zombies on screen, n of them) makes it see-through, fading in and out (dt in seconds).
    // False when this obstacle is not a tree drawn from a sprite (it was drawn, as a vector, in drawProp).
    function drawCrown(ctx, o, x, y, dt, ax, ay, ar, n) {
        if (o.type !== 'tree' || !mapPrep(o)) return false;
        const v = curV, s = curS;
        let under = false;
        for (let i = 0; i < n; i++) {
            const dx = x - ax[i], dy = y - ay[i], rr = v.crownR + ar[i];
            if (dx * dx + dy * dy < rr * rr) { under = true; break; }
        }
        const target = under ? CROWN_ALPHA : 1;
        if (v.alpha !== target) {
            v.alpha += (target - v.alpha) * (1 - Math.exp(-CROWN_FADE * dt));
            if (Math.abs(v.alpha - target) < 0.01) v.alpha = target;
        }
        drawMapObj(ctx, x, y, v, s, v.alpha);
        mapDraws.sprite++;
        return true;
    }

    // Trees and rocks: never change, keyed by the obstacle object itself.
    // With the sprites in: rocks are drawn here, trees wait for drawCrown (above the players).
    function drawProp(ctx, o, x, y) {
        const tree = o.type === 'tree';
        if (mapPrep(o)) {
            if (!tree) { drawMapObj(ctx, x, y, curV, curS, 1); mapDraws.sprite++; }
            return;
        }
        mapDraws.vector++;
        const rot = o.rot || 0;
        // half-size of the bitmap: canopy + shadow for trees, outline + shadow offset for rocks
        const pad = tree ? o.r * 1.1 * 1.25 + 4 : o.r + 12;
        const old = propSprites.get(o);
        const s = sprite(old, pad, function (g) { tree ? drawTree(g, 0, 0, o.r, rot) : drawRock(g, 0, 0, o.r, rot); });
        if (s !== old && s) propSprites.set(o, s);
        if (s) ctx.drawImage(s.c, x - pad, y - pad, pad * 2, pad * 2);
        else if (tree) drawTree(ctx, x, y, o.r, rot);
        else drawRock(ctx, x, y, o.r, rot);
    }

    // ---------- zombies: the Obiecte Arena art, one SVG per type ----------
    // public/images/zombies/<id>.svg (the baked-in shadow cut out: it is drawn apart, see addZombieShadow). Seen
    // from above and facing down (+y) in the picture, whose origin is the zombie's centre. Scaled so the outline
    // circle of the body is as big as the server's hitbox for the type (def.r), so what you see is what a bullet
    // hits, and turned to face zb.angle (0 = +x), i.e. by angle - 90 degrees. Rastered from the vector at the
    // current pixel scale like the other sprites, so it stays sharp at any zoom. Until a picture is in (or if it
    // is missing) the old vector drawing is used, so a zombie is never invisible.
    // view: the picture's viewBox; disc: the outer radius of the body's outline circle; sh: the shadow ellipse
    // (cx, cy, rx, ry) of the original art, in picture units.
    const ZOMBIE_ART = [
        { id: 'zombi',       view: [-70, -52.5, 140, 140], disc: 38.5,  sh: [7, 12, 38.5, 35] },   // normal
        { id: 'zombi_rapid', view: [-60, -45, 120, 120],   disc: 29.95, sh: [7, 12, 33, 30] },     // runner
        { id: 'zombi_tanc',  view: [-90, -67.5, 180, 180], disc: 49.2,  sh: [7, 12, 49.5, 45] },   // tank
    ];
    const zombieImgs = ZOMBIE_ART.map(function (a) {
        const e = { img: new Image(), state: 0 };   // 0 loading, 1 ready, 2 failed
        e.img.onload = function () { e.state = e.img.naturalWidth > 0 ? 1 : 2; };
        e.img.onerror = function () { e.state = 2; console.warn('[zombi] desen lipsa: ' + a.id + ' (se deseneaza varianta veche)'); };
        e.img.src = window.arAsset ? window.arAsset('/images/zombies/' + a.id + '.svg') : '/images/zombies/' + a.id + '.svg';
        return e;
    });
    // The shadow stays down and to the right whichever way the zombie faces (the trees' is the same), so it is
    // not part of the turning picture. Adds one ellipse to the current path; the caller fills them all at once.
    function addZombieShadow(ctx, zb, def, typeKey) {
        const art = ZOMBIE_ART[typeKey] || ZOMBIE_ART[0], k = def.r / art.disc;
        const cx = zb.x + art.sh[0] * k, cy = zb.y + art.sh[1] * k, rx = art.sh[2] * k, ry = art.sh[3] * k;
        ctx.moveTo(cx + rx, cy);
        ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    }
    // `m` is the world transform (ctx.getTransform() taken once per frame); the caller restores it.
    function drawZombieSprite(ctx, m, zb, def, typeKey, now) {
        const art = ZOMBIE_ART[typeKey], z = zombieImgs[typeKey];
        let s = null, pad = 0;
        if (art && z.state === 1) {
            const k = def.r / art.disc, vx = art.view[0], vy = art.view[1], vw = art.view[2], vh = art.view[3];
            pad = Math.max(-vx, -vy, vx + vw, vy + vh) * k + 2;
            const old = zombieSprites.get(typeKey);
            s = sprite(old, pad, function (g) {
                g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
                g.drawImage(z.img, vx * k, vy * k, vw * k, vh * k);
            });
            if (s !== old && s) zombieSprites.set(typeKey, s);
        }
        if (!s) { ctx.setTransform(m); drawZombie(ctx, zb, def, def.r, now); return; }
        const a = (zb.angle || 0) - Math.PI / 2, cs = Math.cos(a), sn = Math.sin(a);
        ctx.setTransform(m.a * cs + m.c * sn, m.b * cs + m.d * sn, m.c * cs - m.a * sn, m.d * cs - m.b * sn,
                         m.a * zb.x + m.c * zb.y + m.e, m.b * zb.x + m.d * zb.y + m.f);
        ctx.drawImage(s.c, -pad, -pad, pad * 2, pad * 2);
    }
    // ---------- medkit: a red toy block with a white cross, hovering over its shadow ----------
    const KIT_HALF = 16, KIT_PAD = 21;
    function paintKit(g) {
        const s = KIT_HALF, r = 8, ol = 3, lip = 5;
        g.fillStyle = '#0A1013';
        g.beginPath(); g.roundRect(-s, -s, s * 2, s * 2, r); g.fill();
        g.fillStyle = '#B11F2E';
        g.beginPath(); g.roundRect(-s + ol, -s + ol, s * 2 - ol * 2, s * 2 - ol * 2, r - ol); g.fill();
        g.fillStyle = '#FF4B5C';
        g.beginPath(); g.roundRect(-s + ol, -s + ol, s * 2 - ol * 2, s * 2 - ol * 2 - lip, [r - ol, r - ol, 3, 3]); g.fill();
        g.fillStyle = 'rgba(255,255,255,.32)';
        g.fillRect(-s + ol + 4, -s + ol + 1.2, s * 2 - ol * 2 - 8, 2);
        // the cross: ink first, then white on top, lifted by the lip
        const a = 7.2, w = 2.7, cy = -lip / 2;
        g.fillStyle = '#0A1013';
        g.beginPath(); g.roundRect(-w - 1.8, cy - a - 1.8, (w + 1.8) * 2, (a + 1.8) * 2, 2.5); g.fill();
        g.beginPath(); g.roundRect(-a - 1.8, cy - w - 1.8, (a + 1.8) * 2, (w + 1.8) * 2, 2.5); g.fill();
        g.fillStyle = '#FFFFFF';
        g.beginPath(); g.roundRect(-w, cy - a, w * 2, a * 2, 1.5); g.fill();
        g.beginPath(); g.roundRect(-a, cy - w, a * 2, w * 2, 1.5); g.fill();
    }
    // yOff: extra vertical offset (drop-in, pickup); now drives the hover; bob 0 freezes it
    function drawKit(ctx, x, y, yOff, now, scale, bob) {
        const ph = bob ? Math.sin(now * 0.0042) : 0;
        const lift = (5 + ph * 3) - yOff;
        const sc = scale || 1;
        ctx.fillStyle = 'rgba(6,22,12,.34)';
        ctx.beginPath(); ctx.ellipse(x + 2, y + 13, 15 * sc * (1 - ph * 0.12), 5.5 * sc * (1 - ph * 0.12), 0, 0, TAU); ctx.fill();
        const old = zombieSprites.get('kit');
        const s = sprite(old, KIT_PAD, paintKit);
        if (s !== old && s) zombieSprites.set('kit', s);
        const half = KIT_PAD * sc;
        if (s) ctx.drawImage(s.c, x - half, y - half - lift, half * 2, half * 2);
        else { ctx.save(); ctx.translate(x, y - lift); ctx.scale(sc, sc); paintKit(ctx); ctx.restore(); }
    }

    function clearSprites() { zombieSprites.clear(); }
    function isScaleStable() { return scaleStable; }
    function takeBudget() { if (budget <= 0) return false; budget--; return true; }

    // Grass: one stroke per colour and opacity step instead of one per tuft
    const GRASS_STEPS = 4;
    let grassBuckets = null, grassSrc = null;
    function drawGrass(ctx, tufts, l, t, r, b) {
        if (grassSrc !== tufts) {
            grassSrc = tufts;
            grassBuckets = [];
            let lo = Infinity, hi = -Infinity;
            for (const g of tufts) { if (g.a < lo) lo = g.a; if (g.a > hi) hi = g.a; }
            const span = (hi - lo) || 1;
            for (let i = 0; i < GRASS_STEPS * 2; i++) grassBuckets.push({ items: [], a: 0, dark: i >= GRASS_STEPS });
            for (const g of tufts) {
                const step = Math.min(GRASS_STEPS - 1, Math.floor((g.a - lo) / span * GRASS_STEPS));
                const bk = grassBuckets[(g.dark ? GRASS_STEPS : 0) + step];
                bk.items.push({ x: g.x, y: g.y, ex: g.x + Math.sin(g.angle) * g.len, ey: g.y - g.len * 0.78 });
                bk.a += g.a;
            }
            for (const bk of grassBuckets) bk.a = bk.items.length ? bk.a / bk.items.length : 0;
        }
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        for (const bk of grassBuckets) {
            if (!bk.items.length) continue;
            ctx.beginPath();
            let any = false;
            for (const g of bk.items) {
                if (g.x < l || g.x > r || g.y < t || g.y > b) continue;
                ctx.moveTo(g.x, g.y); ctx.lineTo(g.ex, g.ey); any = true;
            }
            if (!any) continue;
            ctx.globalAlpha = bk.a;
            ctx.strokeStyle = bk.dark ? '#3E7A2C' : '#74B352';
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
    }

    // ---------- lobby backdrop: the same field the match is played on ----------
    // The trees and rocks are the match sprites (public/images/map/<season>/), laid out once per size from a
    // fixed seed, so the picture is always the same one. The middle band stays free for the login card and the
    // logo. Nothing is drawn for a sprite that is missing: the lobby is only a backdrop.
    const LOBBY_TREES = ['copac_mic', 'copac_mediu', 'copac_mare', 'brad'], LOBBY_ROCKS = ['piatra_medie', 'piatra_mare'];
    const LOBBY_IDS = LOBBY_TREES.concat(LOBBY_ROCKS);
    const lobbyReduced = new Map();   // 'season|id|px' -> the sprite halved down to about that many pixels

    // Loads map-objects.json and the lobby sprites, then calls cb(season) (cb(null) after 15 s: no sprites).
    function prepareLobby(season, cb) {
        setMapSeason(season);
        const t0 = Date.now();
        (function wait() {
            if (mapArt.meta) {
                const s = mapArt.meta.seasons.indexOf(season) >= 0 ? season : mapArt.meta.seasons[0];
                if (LOBBY_IDS.every(function (id) { return mapEntry(s, id).state !== 0; })) return cb(s);
            }
            if (Date.now() - t0 > 15000) return cb(null);
            setTimeout(wait, 80);
        })();
    }
    function lobbyRand(seed) {   // mulberry32
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    // Props for a W x H backdrop: { id, x, y, k (px per world unit), flip, r (visual radius, px) }, rocks first, then trees by y
    function layoutLobby(W, H, season) {
        const rnd = lobbyRand(20261021);
        const base = Math.max(0.45, Math.min(1.4, Math.min(W / 1500, H / 800)));
        const total = Math.max(8, Math.min(18, Math.round(W * H / 130000)));
        // kept free: the width of the login content (.auth-wrap, 1080 px at most, centred) and its middle band
        // (under 700 px the logo sits above the card and they fill the height)
        const narrow = W < 700;
        const half = Math.min(W * (narrow ? 0.38 : 0.46), 560), kx0 = W / 2 - half, kx1 = W / 2 + half;
        const ky0 = H * (narrow ? 0.03 : 0.2), ky1 = H * (narrow ? 0.93 : 0.8);
        const objs = mapArt.meta.objects, props = [];
        for (let tries = 0; props.length < total && tries < 600; tries++) {
            const rock = rnd() < 0.38;
            const ids = rock ? LOBBY_ROCKS : LOBBY_TREES;
            const id = ids[Math.floor(rnd() * ids.length)];
            const k = base * (0.9 + rnd() * 0.2), r = objs[id].visualRadius * k;
            const x = -W * 0.02 + rnd() * W * 1.04, y = -H * 0.02 + rnd() * H * 1.04;
            const flip = rnd() < 0.5;
            const nx = Math.max(kx0, Math.min(x, kx1)) - x, ny = Math.max(ky0, Math.min(y, ky1)) - y;
            if (nx * nx + ny * ny < r * r * 0.7) continue;   // its crown would reach into the kept area
            let ok = true;
            for (const q of props) { const dx = x - q.x, dy = y - q.y, rr = (r + q.r) * 0.92; if (dx * dx + dy * dy < rr * rr) { ok = false; break; } }
            if (ok) props.push({ id: id, x: x, y: y, k: k, flip: flip, r: r, rock: rock });
        }
        props.sort(function (a, b) { return (a.rock === b.rock ? a.y - b.y : (a.rock ? -1 : 1)); });
        return props;
    }
    function drawLobbyProps(ctx, bg) {
        const season = bg.season, objs = mapArt.meta.objects, dpr = bg.dpr || 1;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        for (const p of bg.props) {
            const e = mapEntry(season, p.id);
            if (e.state !== 1) continue;
            const half = objs[p.id].frameRadius * p.k, px = Math.max(8, Math.round(half * 2 * dpr));
            const key = season + '|' + p.id + '|' + (px >> 4);
            let src = lobbyReduced.get(key);
            if (!src) { src = reduceTo(e.img, px); lobbyReduced.set(key, src); }
            if (p.flip) { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(-1, 1); ctx.drawImage(src, -half, -half, half * 2, half * 2); ctx.restore(); }
            else ctx.drawImage(src, p.x - half, p.y - half, half * 2, half * 2);
        }
    }
    // W, H in CSS pixels (the caller sets the canvas transform). bg: { season, props, dpr } once the sprites are in.
    function drawLobbyField(ctx, W, H, bg) {
        drawGround(ctx, 0, 0, W, H, W, H);
        ctx.save();
        const cx = W / 2, cy = H / 2, m = Math.min(W, H);
        ctx.strokeStyle = 'rgba(' + CHALK + ',.26)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, m * 0.24, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
        ctx.fillStyle = 'rgba(' + CHALK + ',.26)';
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU); ctx.fill();
        ctx.restore();
        if (bg.season && mapArt.meta) {
            if (!bg.props || bg.propsW !== W || bg.propsH !== H) { bg.props = layoutLobby(W, H, bg.season); bg.propsW = W; bg.propsH = H; }
            drawLobbyProps(ctx, bg);
        }
    }

    window.ARArena = {
        drawGround: drawGround,
        drawMarkings: drawMarkings,
        drawTree: drawTree,
        drawRock: drawRock,
        drawZone: drawZone,
        drawZombie: drawZombie,
        drawLobbyField: drawLobbyField,
        prepareLobby: prepareLobby,
        beginFrame: beginFrame,
        allowBurst: allowBurst,
        drawProp: drawProp,
        drawCrown: drawCrown,
        setMapSeason: setMapSeason,
        mapState: function () { return { season: mapArt.season, meta: !!mapArt.meta, sets: mapArt.sets }; },
        mapStats: function (reset) { const s = { sprite: mapDraws.sprite, vector: mapDraws.vector }; if (reset) { mapDraws.sprite = 0; mapDraws.vector = 0; } return s; },
        // how an obstacle looks (tests): sprite id, mirrored, scale, crown radius, crown opacity; null before map-objects.json is in
        mapVariant: function (o) { const v = variantOf(o); return v ? { id: v.id, flip: v.flip, k: v.k, nom: v.nom, crownR: v.crownR, alpha: v.alpha } : null; },
        drawZombieSprite: drawZombieSprite,
        addZombieShadow: addZombieShadow,
        drawGrass: drawGrass,
        drawKit: drawKit,
        clearSprites: clearSprites,
        isScaleStable: isScaleStable,
        takeBudget: takeBudget,
    };
})();

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
    const ZOMBIE_FRAMES = 16; // arm sway steps per cycle (~50 ms each, under a pixel apart)
    let budget = SPRITE_BUDGET, pixScale = 0, scaleSince = 0, scaleStable = false;
    const propSprites = new WeakMap();
    const CPU_CTX = { willReadFrequently: true };   // obstacle object -> {c, scale}
    const zombieSprites = new Map();     // 'type|frame' -> {c, scale, pad}

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

    // Trees and rocks: never change, keyed by the obstacle object itself
    function drawProp(ctx, o, x, y) {
        const tree = o.type === 'tree';
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

    // Zombies: one bitmap per type and sway step, drawn rotated.
    // `m` is the world transform (ctx.getTransform() taken once per frame); the caller restores it.
    function zombieSway(zb, now) {
        const ph = now * 0.008 + (zb.x + zb.y) * 0.05;
        let f = Math.floor((ph / TAU - Math.floor(ph / TAU)) * ZOMBIE_FRAMES);
        if (f >= ZOMBIE_FRAMES) f = 0;
        return f;
    }
    function drawZombieSprite(ctx, m, zb, def, typeKey, now) {
        const R = def.r;
        const f = zombieSway(zb, now);
        const key = typeKey + '|' + f;
        const pad = Math.max(R * 1.85, R + 11) + 2;
        const old = zombieSprites.get(key);
        const s = sprite(old, pad, function (g) {
            const swayNow = (f / ZOMBIE_FRAMES) * TAU / 0.008; // a time whose sway phase is this step
            drawZombie(g, { x: 0, y: 0, angle: 0, type: zb.type }, def, R, swayNow);
        });
        if (s !== old && s) zombieSprites.set(key, s);
        const cs = Math.cos(zb.angle || 0), sn = Math.sin(zb.angle || 0);
        if (s) {
            ctx.setTransform(m.a * cs + m.c * sn, m.b * cs + m.d * sn, m.c * cs - m.a * sn, m.d * cs - m.b * sn,
                             m.a * zb.x + m.c * zb.y + m.e, m.b * zb.x + m.d * zb.y + m.f);
            ctx.drawImage(s.c, -pad, -pad, pad * 2, pad * 2);
        } else {
            ctx.setTransform(m);
            drawZombie(ctx, zb, def, R, now);
        }
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
        for (const rock of bg.rocks) drawRock(ctx, rock.x, rock.y, rock.r * 1.15, rock.rot);
        for (const tree of bg.trees) drawTree(ctx, tree.x, tree.y, tree.r * 0.95, tree.rot);
    }

    window.ARArena = {
        drawGround: drawGround,
        drawMarkings: drawMarkings,
        drawTree: drawTree,
        drawRock: drawRock,
        drawZone: drawZone,
        drawZombie: drawZombie,
        drawLobbyField: drawLobbyField,
        beginFrame: beginFrame,
        allowBurst: allowBurst,
        drawProp: drawProp,
        drawZombieSprite: drawZombieSprite,
        drawGrass: drawGrass,
        drawKit: drawKit,
        clearSprites: clearSprites,
        isScaleStable: isScaleStable,
        takeBudget: takeBudget,
    };
})();

// Checks public/ground-layer.js against the old vector drawing, without a match:
//  1. identity: the tiled ground vs the same ground painted as vectors, pixel by pixel, at many camera spots and zooms
//  2. seams: a camera moving in sub-pixel steps across tile borders, every frame compared (worst frame reported)
//  3. zoom: a zoom ramp (tiles stretched, then rebuilt) compared to vectors
//  4. cost: frame rate of the ground alone, tiled vs vectors, real vsync, at the user's screen
// node ground-fixture.js --server http://127.0.0.1:3100 [--size 1707x1067] [--dpr 1.5] [--shots dir]
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const SERVER = arg('server', 'http://127.0.0.1:3100'), DPR = +arg('dpr', 1.5), SHOTS = arg('shots', null);
const [VW, VH] = String(arg('size', '1707x1067')).split('x').map(Number);
const CHROME = process.env.CHROME_PATH || (() => {
    const base = path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'), 'ms-playwright');
    const dirs = fs.readdirSync(base).filter(d => /^chromium-[0-9]+$/.test(d)).sort();
    return path.join(base, dirs[dirs.length - 1], 'chrome-win64', 'chrome.exe');
})();

(async () => {
    const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--mute-audio', '--enable-precise-memory-info'] });
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.setContent('<body style="margin:0;background:#000"><canvas id="a" style="display:none"></canvas><canvas id="b" style="display:none"></canvas><canvas id="c" style="display:block;width:100vw;height:100vh"></canvas></body>');
    await page.addScriptTag({ url: SERVER + '/arena-art.js' });
    await page.addScriptTag({ url: SERVER + '/ground-layer.js' });
    const res = await page.evaluate(async ({ DPR, SHOTS }) => {
        const out = { identity: [], seams: null, zoom: null, cost: null };
        const A = document.getElementById('a'), B = document.getElementById('b'), C = document.getElementById('c');
        const VIEW_W = 1300, VIEW_H = 730;
        ARGround.setDeco(ARGround.makeDeco());
        // draws one frame the way game.js does: world transform, visible rectangle, then the ground
        function frame(cv, cssW, cssH, camX, camY, zf, mode) {
            const dpr = DPR; cv.width = Math.floor(cssW * dpr); cv.height = Math.floor(cssH * dpr);
            const g = cv.getContext('2d', { willReadFrequently: mode !== 'live' });
            const ZOOM = Math.min(cssW / (VIEW_W * zf), cssH / (VIEW_H * zf));
            g.clearRect(0, 0, cv.width, cv.height);
            g.save(); g.scale(dpr, dpr); g.translate(cssW / 2, cssH / 2); g.scale(ZOOM, ZOOM); g.translate(-camX, -camY);
            const l = camX - cssW / (2 * ZOOM), t = camY - cssH / (2 * ZOOM), r = l + cssW / ZOOM, b = t + cssH / ZOOM;
            ARGround.draw(g, l, t, r, b, dpr * ZOOM, true, performance.now());
            g.restore();
            return { g, scale: dpr * ZOOM };
        }
        function prepared(cssW, cssH, camX, camY, zf) {   // tiles all built
            for (let i = 0; i < 30; i++) { ARGround.beginFrame(true); ARGround.setLegacy(false); frame(B, cssW, cssH, camX, camY, zf, 'cpu'); }
        }
        function diff(ga, gb, w, h) {
            const a = ga.getImageData(0, 0, w, h).data, b = gb.getImageData(0, 0, w, h).data;
            let sum = 0, n = w * h, c16 = 0, c48 = 0, mx = 0, wx = 0, wy = 0;
            for (let i = 0, p = 0; i < a.length; i += 4, p++) {
                const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
                sum += d; if (d > 16) c16++; if (d > 48) c48++; if (d > mx) { mx = d; wx = p % w; wy = (p / w) | 0; }
            }
            return { mean: +(sum / n).toFixed(3), pct16: +(c16 / n * 100).toFixed(3), pct48: +(c48 / n * 100).toFixed(4), max: mx, at: [wx, wy] };
        }
        const cssW = innerWidth, cssH = innerHeight;
        const spots = [[1300, 1300, 1], [600, 700, 1], [2000, 2100, 1], [130, 130, 1], [2470, 2470, 1], [1300, 90, 1], [1500, 1300, 0.9], [900, 1800, 1.25], [1300, 1300, 1.6], [333.37, 777.91, 1]];
        const shotIdx = SHOTS ? 0 : -1; out.shots = [];
        for (const [cx, cy, zf] of spots) {
            ARGround.invalidate();
            ARGround.setLegacy(true); const L = frame(A, cssW, cssH, cx, cy, zf, 'cpu');
            ARGround.setLegacy(false); prepared(cssW, cssH, cx, cy, zf); const T = frame(B, cssW, cssH, cx, cy, zf, 'cpu');
            const d = diff(L.g, T.g, A.width, A.height);
            d.spot = [cx, cy, zf]; d.scale = +T.scale.toFixed(3); out.identity.push(d);
            if (SHOTS && out.shots.length < 3 && (cx === 130 || cx === 1300 && zf === 1)) out.shots.push({ spot: [cx, cy, zf], legacy: A.toDataURL('image/png'), tiled: B.toDataURL('image/png') });
        }
        out.info = ARGround.info();
        // 2. seams: move 0.37 world units per frame along x and y (diagonal) across several tile borders; compare each frame
        {
            const w = 1280, h = 800, zf = 1; let worst = null, sumPct = 0, frames = 0, buildSpike = 0;
            ARGround.invalidate(); prepared(w, h, 700, 700, zf);
            // build the whole path first (stable tiles), so we test the picture, not the build budget
            let cx = 640, cy = 640;
            for (let i = 0; i < 40; i++) { for (let k = 0; k < 20; k++) { ARGround.beginFrame(true); frame(B, w, h, 640 + i * 30, 640 + i * 30, zf, 'cpu'); } }
            for (let i = 0; i < 160; i++) {
                const x = 700 + i * 3.37 + (i % 7) * 0.13, y = 705 + i * 3.11;
                ARGround.setLegacy(true); const L = frame(A, w, h, x, y, zf, 'cpu');
                ARGround.setLegacy(false); ARGround.beginFrame(false); const T = frame(B, w, h, x, y, zf, 'cpu');
                const d = diff(L.g, T.g, A.width, A.height); frames++; sumPct += d.pct16;
                if (!worst || d.pct16 > worst.pct16) worst = { ...d, i, cam: [+x.toFixed(2), +y.toFixed(2)] };
            }
            out.seams = { frames, meanPct16: +(sumPct / frames).toFixed(3), worst };
        }
        // 3. zoom ramp: scale 1.0 -> 1.35 over 45 frames (tiles stretch), then 40 stable frames (rebuild)
        {
            const w = 1280, h = 800; let maxDuring = 0, maxAfter = 0, afterPct = 0;
            ARGround.invalidate(); prepared(w, h, 1300, 1300, 1);
            for (let i = 0; i < 45; i++) {
                const zf = 1 / (1 + i * 0.35 / 45);
                ARGround.setLegacy(true); const L = frame(A, w, h, 1300, 1300, zf, 'cpu');
                ARGround.setLegacy(false); ARGround.beginFrame(false); const T = frame(B, w, h, 1300, 1300, zf, 'cpu');
                const d = diff(L.g, T.g, A.width, A.height); maxDuring = Math.max(maxDuring, d.pct16);
            }
            for (let i = 0; i < 60; i++) {
                const zf = 1 / 1.35;
                ARGround.setLegacy(true); const L = frame(A, w, h, 1300, 1300, zf, 'cpu');
                ARGround.setLegacy(false); ARGround.beginFrame(false); const T = frame(B, w, h, 1300, 1300, zf, 'cpu');
                const d = diff(L.g, T.g, A.width, A.height); if (i >= 50) { maxAfter = Math.max(maxAfter, d.pct16); afterPct = d.pct16; }
            }
            out.zoom = { maxPct16DuringStretch: +maxDuring.toFixed(3), pct16AfterRebuild: +afterPct.toFixed(3), info: ARGround.info() };
        }
        // 4. cost: the ground alone on the visible canvas, real vsync, 4 s each
        async function fps(mode, moving) {
            ARGround.setLegacy(mode === 'legacy'); ARGround.invalidate();
            const dts = []; let last = 0; const t0 = performance.now(); let i = 0;
            await new Promise(res => { function f(ts) {
                if (last) dts.push(ts - last); last = ts; i++;
                const x = moving ? 900 + Math.sin(i / 90) * 500 : 1300, y = moving ? 900 + i * 0.4 % 800 : 1300;
                ARGround.beginFrame(i < 30); frame(C, cssW, cssH, x, y, 1, 'live');
                if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res(); }
                requestAnimationFrame(f); });
            const s = dts.slice(30).sort((a, b) => a - b); const mean = s.reduce((a, b) => a + b, 0) / s.length;
            return { fps: +(1000 / mean).toFixed(1), p50: +s[s.length >> 1].toFixed(2), p95: +s[Math.floor(s.length * .95)].toFixed(2), p99: +s[Math.floor(s.length * .99)].toFixed(2), max: +s[s.length - 1].toFixed(1) };
        }
        out.cost = { legacyStatic: await fps('legacy', false), tiledStatic: await fps('tiled', false), legacyMoving: await fps('legacy', true), tiledMoving: await fps('tiled', true) };
        out.info2 = ARGround.info();
        // 5. memory budget: a small canvas, an 8 MB budget, a walk over the whole map: tiles must be freed, the picture must stay right
        {
            const w = 640, h = 400; ARGround.invalidate(); ARGround.setBudgetMb(8);
            let maxMb = 0;
            for (let i = 0; i < 700; i++) {
                const x = 150 + (i / 700) * 2300, y = 150 + ((i * 7) % 700) / 700 * 2300;
                ARGround.beginFrame(false); frame(B, w, h, x, y, 1, 'cpu'); maxMb = Math.max(maxMb, ARGround.info().mb);
            }
            for (let k = 0; k < 30; k++) { ARGround.beginFrame(true); frame(B, w, h, 1200, 1200, 1, 'cpu'); }
            ARGround.setLegacy(true); const L = frame(A, w, h, 1200, 1200, 1, 'cpu'); ARGround.setLegacy(false);
            const T = frame(B, w, h, 1200, 1200, 1, 'cpu'); const d = diff(L.g, T.g, A.width, A.height);
            const inf = ARGround.info(); out.budget = { budgetMb: 8, maxMbDuringWalk: maxMb, finalMb: inf.mb, tiles: inf.tiles, evicted: inf.evicted, pct16AfterWalk: d.pct16 };
            ARGround.setBudgetMb(72);
        }
        // 6. theme change: the cache is dropped at once and rebuilt
        {
            const w = 640, h = 400; ARGround.invalidate(); ARGround.setTheme('vara');
            for (let k = 0; k < 10; k++) { ARGround.beginFrame(true); frame(B, w, h, 1200, 1200, 1, 'cpu'); }
            const before = ARGround.info().tiles; ARGround.setTheme('vara'); const same = ARGround.info().tiles;
            ARGround.setTheme('iarna'); const after = ARGround.info().tiles;
            for (let k = 0; k < 10; k++) { ARGround.beginFrame(true); frame(B, w, h, 1200, 1200, 1, 'cpu'); }
            ARGround.setLegacy(true); const L = frame(A, w, h, 1200, 1200, 1, 'cpu'); ARGround.setLegacy(false);
            const T = frame(B, w, h, 1200, 1200, 1, 'cpu'); const d = diff(L.g, T.g, A.width, A.height);
            out.theme = { tilesBuilt: before, afterSameTheme: same, afterNewTheme: after, rebuiltTiles: ARGround.info().tiles, pct16AfterRebuild: d.pct16 };
        }
        return out;
    }, { DPR, SHOTS: !!SHOTS });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); for (const s of res.shots) { const nm = `${s.spot.join('_')}`; fs.writeFileSync(path.join(SHOTS, `legacy_${nm}.png`), Buffer.from(s.legacy.split(',')[1], 'base64')); fs.writeFileSync(path.join(SHOTS, `tiled_${nm}.png`), Buffer.from(s.tiled.split(',')[1], 'base64')); } delete res.shots; }
    console.log(JSON.stringify({ size: [VW, VH], dpr: DPR, errors: errs.slice(0, 5), ...res }, null, 1));
    // pass / fail
    const fails = [];
    const chk = (ok, msg) => { if (!ok) fails.push(msg); };
    chk(!errs.length, 'page errors');
    for (const d of res.identity) { chk(d.pct16 < 0.5 && d.pct48 < 0.1, 'identity at ' + d.spot.join(',')); }
    chk(res.seams.worst.pct16 < 0.1, 'seams');
    chk(res.zoom.maxPct16DuringStretch < 0.5 && res.zoom.pct16AfterRebuild < 0.1, 'zoom');
    chk(res.cost.tiledStatic.fps > 1.5 * res.cost.legacyStatic.fps || res.cost.tiledStatic.fps > 230, 'tiles not faster than vectors');
    chk(res.budget.finalMb <= 12 && res.budget.evicted > 20 && res.budget.pct16AfterWalk < 0.5, 'memory budget');
    chk(res.theme.tilesBuilt > 0 && res.theme.afterSameTheme === res.theme.tilesBuilt && res.theme.afterNewTheme === 0 && res.theme.rebuiltTiles > 0 && res.theme.pct16AfterRebuild < 0.5, 'theme change');
    console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'PASS: ground-layer');
    process.exitCode = fails.length ? 1 : 0;
    await browser.close();
})();

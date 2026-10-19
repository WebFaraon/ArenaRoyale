// Frame rate of the zone overlay alone (ARArena.drawZone) at the user's screen, real vsync.
// node zone-fixture.js --server http://127.0.0.1:3100 [--size 1707x1067] [--dpr 1.5]
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const SERVER = arg('server', 'http://127.0.0.1:3100'), DPR = +arg('dpr', 1.5);
const [VW, VH] = String(arg('size', '1707x1067')).split('x').map(Number);
const CHROME = process.env.CHROME_PATH || (() => { const base = path.join(process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'), 'ms-playwright'); const dirs = fs.readdirSync(base).filter(d => /^chromium-[0-9]+$/.test(d)).sort(); return path.join(base, dirs[dirs.length - 1], 'chrome-win64', 'chrome.exe'); })();
(async () => {
    const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--mute-audio'] });
    const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR })).newPage();
    await page.setContent('<body style="margin:0"><canvas id="c" style="display:block;width:100vw;height:100vh"></canvas></body>');
    await page.addScriptTag({ url: SERVER + '/arena-art.js' });
    const res = await page.evaluate(async ({ DPR }) => {
        const C = document.getElementById('c'); const cssW = innerWidth, cssH = innerHeight;
        C.width = Math.floor(cssW * DPR); C.height = Math.floor(cssH * DPR);
        const g = C.getContext('2d'); const ZOOM = Math.min(cssW / 1300, cssH / 730);
        const P = CanvasRenderingContext2D.prototype; const orig = { stroke: P.stroke, setLineDash: P.setLineDash, fill: P.fill };
        async function run(name, cam, zone, patch) {
            P.stroke = orig.stroke; P.setLineDash = orig.setLineDash; P.fill = orig.fill; if (patch) patch();
            const dts = []; let last = 0; const t0 = performance.now();
            await new Promise(res => { function f(ts) { if (last) dts.push(ts - last); last = ts;
                g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#4F8B3B'; g.fillRect(0, 0, C.width, C.height);
                g.save(); g.scale(DPR, DPR); g.translate(cssW / 2, cssH / 2); g.scale(ZOOM, ZOOM); g.translate(-cam[0], -cam[1]);
                ARArena.drawZone(g, cam[0] - cssW / 2 / ZOOM, cam[1] - cssH / 2 / ZOOM, cam[0] + cssW / 2 / ZOOM, cam[1] + cssH / 2 / ZOOM, zone, ZOOM); g.restore();
                if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
            const s = dts.slice(20).sort((a, b) => a - b); return { name, fps: +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1), p50: +s[s.length >> 1].toFixed(2), p95: +s[Math.floor(s.length * .95)].toFixed(2) };
        }
        const out = [];
        const edge = { cx: 1300, cy: 1300, r: 700 };                   // the ring crosses the view
        out.push(await run('none (floor)', [1300, 1300], { cx: 1300, cy: 1300, r: 1650 }));
        out.push(await run('edge in view', [1300, 1900], edge));
        out.push(await run('edge, no setLineDash', [1300, 1900], edge, () => { P.setLineDash = function () {}; }));
        out.push(await run('edge, dashed arc skipped', [1300, 1900], edge, () => { P.stroke = function () { if (this.getLineDash().length) return; return orig.stroke.apply(this, arguments); }; }));
        out.push(await run('edge, all strokes skipped', [1300, 1900], edge, () => { P.stroke = function () {}; }));
        out.push(await run('all outside (r=0)', [1300, 1300], { cx: 1300, cy: 1300, r: 0 }));
        out.push(await run('all outside, no fill', [1300, 1300], { cx: 1300, cy: 1300, r: 0 }, () => { P.fill = function () {}; }));
        return out;
    }, { DPR });
    console.table(res); await browser.close();
})();

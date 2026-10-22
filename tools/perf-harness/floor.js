// What is the platform's own ceiling? A canvas of the same pixel size doing almost nothing per frame.
const { chromium } = require('playwright-core');
const CHROME = process.env.CHROME_PATH || (() => {
    const base = require('path').join(process.env.LOCALAPPDATA || require('path').join(require('os').homedir(), 'AppData', 'Local'), 'ms-playwright');
    const dirs = require('fs').readdirSync(base).filter(d => /^chromium-[0-9]+$/.test(d)).sort();
    return require('path').join(base, dirs[dirs.length - 1], 'chrome-win64', 'chrome.exe');
})();
(async () => {
  for (const [w, h, dpr, load] of [[1707, 1067, 1.5, 'trivial'], [1707, 1067, 1.5, 'fills3'], [1707, 1067, 1, 'trivial'], [1280, 800, 1, 'trivial']]) {
    const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--enable-precise-memory-info', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio'] });
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await page.setContent('<body style="margin:0"><canvas id=c style="display:block;width:100%;height:100%"></canvas></body>');
    const r = await page.evaluate(async ({ load }) => {
      const c = document.getElementById('c'); const d = Math.min(devicePixelRatio, 2);
      c.width = Math.floor(innerWidth * d); c.height = Math.floor(innerHeight * d);
      const g = c.getContext('2d'); const dts = []; let last = 0; let n = 0;
      return await new Promise(res => {
        function f(ts) {
          if (last) dts.push(ts - last); last = ts; n++;
          g.fillStyle = '#4F8B3B'; g.fillRect(0, 0, c.width, c.height);
          if (load === 'fills3') { g.fillStyle = 'rgba(16,52,22,.13)'; for (let x = 0; x < c.width; x += 260) g.fillRect(x, 0, 130, c.height); g.fillStyle = 'rgba(9,20,18,.5)'; g.fillRect(0, 0, c.width / 2, c.height); }
          if (performance.now() < t0 + 10000) requestAnimationFrame(f); else { const s = dts.slice(5).sort((a, b) => a - b); res({ fps: +(1000 / (s.reduce((a, b) => a + b, 0) / s.length)).toFixed(1), p50: +s[Math.floor(s.length / 2)].toFixed(2), p95: +s[Math.floor(s.length * .95)].toFixed(2), px: c.width * c.height }); }
        }
        const t0 = performance.now(); requestAnimationFrame(f);
      });
    }, { load });
    console.log(w + 'x' + h, 'dpr', dpr, load, JSON.stringify(r));
    await browser.close();
  }
})();

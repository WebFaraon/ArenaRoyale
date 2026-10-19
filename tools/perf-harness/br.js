// Browser-side measurement runner.
// node br.js --server http://127.0.0.1:3101 --mode br|pve --bots 10 --hz 0|60|144|240 --secs 25 --pass frames|cpu|heap|gc|dom --out file.json [--headed] [--cpu 1] [--dpr 1] [--size 1920x1080] [--pos]
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SERVER = arg('server', 'http://127.0.0.1:3101'), MODE = arg('mode', 'br'), NB = +arg('bots', 10), HZ = +arg('hz', 0), SECS = +arg('secs', 25);
const PASS = arg('pass', 'frames'), OUT = arg('out', null), HEADED = !!arg('headed', false), CPU = +arg('cpu', 1), DPR = +arg('dpr', 1);
const QUERY = String(arg('query', ''));
const [VW, VH] = String(arg('size', '1920x1080')).split('x').map(Number);
const POS = !!arg('pos', false);
const ABL = String(arg('abl', '')), EXP = String(arg('exp', '')), DBG = !!arg('dbg', false), GSLOG = !!arg('gslog', false), STILL = !!arg('still', false), GPUOFF = !!arg('gpuoff', false), VSYNC = !!arg('vsync', false), DECIM = +arg('decim', 1);
const BOTDIR = arg('botdir', __dirname);
const BOTPORT = +arg('botport', 3101);
const botHost = arg('bothost', null);
const CHROME = process.env.CHROME_PATH || (() => {
    const base = require('path').join(process.env.LOCALAPPDATA || require('path').join(require('os').homedir(), 'AppData', 'Local'), 'ms-playwright');
    const dirs = require('fs').readdirSync(base).filter(d => /^chromium-[0-9]+$/.test(d)).sort();
    return require('path').join(base, dirs[dirs.length - 1], 'chrome-win64', 'chrome.exe');
})();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (a, q) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

function initScript(hz, withPos, decim) {
    return `(() => {
    try { localStorage.setItem('ar_diag', '1'); } catch (e) {}
    const HZ = ${hz}, DECIM = ${decim}, WITHPOS = ${withPos ? 'true' : 'false'};
    const frames = [];   // [rafTimestamp, entryTime, cbDurationMs]
    const pos = [];      // per frame: [t, meX, meY, zombies flat..., | players flat...]
    window.__frames = frames; window.__pos = pos; window.__rec = false;
    const origRAF = window.requestAnimationFrame.bind(window);
    function sample(t) {
        if (!WITHPOS) return;
        const row = [t];
        const me = window.__arMe && window.__arMe(); row.push(me ? me[0] : -1, me ? me[1] : -1);
        const z = window.__arZombies ? window.__arZombies() : [];
        row.push(z.length); for (let i = 0; i < z.length && i < 40; i++) { row.push(z[i][0], z[i][1]); }
        const is = window.__arIS ? window.__arIS() : null; const pl = [];
        if (is) for (const id in is.players) { if (id === (window.__arMyId||'')) continue; const p = is.players[id]; pl.push(p.x, p.y, p.angle); }
        row.push(pl.length / 3); for (const v of pl) row.push(v);
        const bl = window.__arBullets ? window.__arBullets() : null; row.push(bl ? bl.length / 3 : -1); if (bl) for (const v of bl) row.push(v);
        pos.push(row);
    }
    if (HZ > 0) {
        let queue = [], nextCb = 1;
        window.requestAnimationFrame = cb => { queue.push(cb); return nextCb++; };
        window.cancelAnimationFrame = () => {};
        const period = 1000 / HZ; let next = performance.now() + period;
        const mc = new MessageChannel();
        mc.port1.onmessage = () => {
            const now = performance.now();
            if (now >= next) {
                next += period; if (now - next > 100) next = now + period;
                const cbs = queue; queue = [];
                const t0 = performance.now();
                for (const cb of cbs) { try { cb(now); } catch (e) { console.error('raf cb', e.message); } }
                const t1 = performance.now();
                if (window.__rec) { frames.push([now, t0, t1 - t0]); sample(now); }
            }
            mc.port2.postMessage(0);
        };
        mc.port2.postMessage(0);
    } else if (DECIM > 1) {
        let queue = [], nextCb = 1, cnt = 0;
        window.requestAnimationFrame = cb => { queue.push(cb); return nextCb++; };
        window.cancelAnimationFrame = () => {};
        const loop = ts => { origRAF(loop); if (++cnt % DECIM === 0) { const cbs = queue; queue = []; const t0 = performance.now(); for (const cb of cbs) { try { cb(ts); } catch (e) { console.error('raf cb', e.message); } } const t1 = performance.now(); if (window.__rec) { frames.push([ts, t0, t1 - t0]); sample(ts); } } };
        origRAF(loop);
    } else {
        window.requestAnimationFrame = cb => origRAF(ts => {
            const t0 = performance.now();
            try { cb(ts); } finally { const t1 = performance.now(); if (window.__rec) { frames.push([ts, t0, t1 - t0]); sample(ts); } }
        });
    }
    // DOM mutation census
    window.__mut = {}; window.__mutOn = false;
    const desc = n => { n = n.nodeType === 3 ? n.parentNode : n; if (!n || !n.tagName) return '?'; return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').join('.') : ''); };
    const startMO = () => {
        const mo = new MutationObserver(recs => { if (!window.__mutOn) return; for (const r of recs) { const k = r.type + ' ' + desc(r.target) + (r.attributeName ? ' [' + r.attributeName + ']' : ''); window.__mut[k] = (window.__mut[k] || 0) + 1; } });
        mo.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    };
    if (document.documentElement) startMO(); else document.addEventListener('DOMContentLoaded', startMO);
    // heap sawtooth sampler
    window.__heap = [];
    setInterval(() => { if (window.__rec && performance.memory) window.__heap.push([performance.now(), performance.memory.usedJSHeapSize]); }, 50);
    // long tasks
    window.__long = [];
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
})();`;
}

async function main() {
    const browser = await chromium.launch({
        executablePath: CHROME, headless: !HEADED,
        args: ['--headless=new', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
            ...(VSYNC ? [] : ['--disable-frame-rate-limit', '--disable-gpu-vsync']), '--autoplay-policy=no-user-gesture-required', ...(arg('plainflags', false) ? [] : ['--ignore-gpu-blocklist', '--enable-gpu-rasterization']), '--mute-audio', ...(GPUOFF ? ['--disable-gpu', '--disable-gpu-compositing'] : [])].filter(a => HEADED ? a !== '--headless=new' : true),
    });
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
    await page.addInitScript(initScript(HZ, POS, DECIM));
    if (EXP) await page.addInitScript(`(() => { const E = '${EXP}'.split(',');
      if (E.includes('lowsmooth')) { const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'imageSmoothingQuality'); Object.defineProperty(CanvasRenderingContext2D.prototype, 'imageSmoothingQuality', { get: d.get, set(v) { d.set.call(this, 'low'); } }); }
      if (E.includes('noalpha') || E.includes('desync')) { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { if (t === '2d' && this.id === 'gameCanvas') { o = Object.assign({}, o || {}); if (E.includes('noalpha')) o.alpha = false; if (E.includes('desync')) o.desynchronized = true; } return orig.call(this, t, o); }; }
      for (const m of ['drawImage','fillRect','fill','stroke','setLineDash','strokeRect','ellipse','roundRect','arc']) { if (E.includes('no_' + m)) { const o = CanvasRenderingContext2D.prototype[m]; CanvasRenderingContext2D.prototype[m] = function () { if (this.canvas && this.canvas.id === 'gameCanvas') return; return o.apply(this, arguments); }; } }
      { const P = CanvasRenderingContext2D.prototype; const oArc = P.arc, oBegin = P.beginPath, oStroke = P.stroke, oSR = P.strokeRect;
        let big = false, small = false;
        P.beginPath = function () { big = false; small = false; return oBegin.call(this); };
        P.arc = function (x, y, r) { if (r > 150) big = true; else small = true; return oArc.apply(this, arguments); };
        P.stroke = function () { const gc = this.canvas && this.canvas.id === 'gameCanvas';
          if (gc) { if (E.includes('no_dashstroke') && this.getLineDash().length) return; if (E.includes('no_bigarcstroke') && big) return; if (E.includes('no_smallstroke') && !big) return; if (E.includes('no_arcstroke') && (big || small)) return; }
          return oStroke.apply(this, arguments); };
        P.strokeRect = function () { if (E.includes('no_strokeRect') && this.canvas && this.canvas.id === 'gameCanvas') return; return oSR.apply(this, arguments); };
      }
      if (E.includes('count')) { window.__cnt = {}; const P = CanvasRenderingContext2D.prototype; const names = ['stroke','strokeRect','strokeText','fill','fillRect','fillText','drawImage','save','restore','setTransform','transform','translate','scale','rotate','beginPath','arc','ellipse','roundRect','rect','moveTo','lineTo','clip','createPattern','createLinearGradient','createRadialGradient','setLineDash','clearRect','getTransform','measureText','putImageData','getImageData'];
        for (const m of names) { const o = P[m]; if (!o) continue; P[m] = function () { if (this.canvas && this.canvas.id === 'gameCanvas') window.__cnt[m] = (window.__cnt[m] || 0) + 1; return o.apply(this, arguments); }; } }
      if (E.includes('noclear')) { const c = CanvasRenderingContext2D.prototype.clearRect; CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) { if (this.canvas && this.canvas.id === 'gameCanvas') return; return c.call(this, x, y, w, h); }; }
    })();`);
    const cdp = await ctx.newCDPSession(page);
    const bcdp = await browser.newBrowserCDPSession();
    let gpuInfo = null;
    try { const si = await bcdp.send('SystemInfo.getInfo'); gpuInfo = { dev: (si.gpu.devices || []).slice(0, 2).map(d => d.deviceString), feat: si.gpu.featureStatus && { canvas: si.gpu.featureStatus.canvas_oop_rasterization, raster: si.gpu.featureStatus.gpu_rasterization, comp: si.gpu.featureStatus.gpu_compositing } }; } catch (e) { gpuInfo = String(e.message).slice(0, 80); }

    // ---- bots (a child process hosting the room; waits for START) ----
    const botArgs = [path.join(BOTDIR, 'bots.js'), '--n', String(NB), '--mode', MODE, '--secs', String(SECS + 40), '--port', String(BOTPORT), '--hold', '--prefix', 'q' + Math.floor(Math.random() * 1000)];
    const bots = spawn('node', botArgs, { cwd: BOTDIR, stdio: ['pipe', 'pipe', 'inherit'] });
    let code = null; let botOut = '';
    bots.stdout.on('data', d => { botOut += d.toString(); const m = botOut.match(/ROOM (\w{5})/); if (m) code = m[1]; });
    for (let i = 0; i < 100 && !code; i++) await sleep(100);
    if (!code) throw new Error('no room code: ' + botOut);

    await page.goto(SERVER + '/' + (QUERY ? '?' + QUERY : ''), { waitUntil: 'load' });
    const nick = 'br' + Math.floor(Math.random() * 100000);
    await page.fill('#login-nickname', nick);
    await page.fill('#login-password', 'x');
    await page.evaluate(() => doLogin());
    await page.waitForFunction(() => document.getElementById('screen-lobby') && document.getElementById('screen-lobby').style.display !== 'none', null, { timeout: 15000 });
    await sleep(800);
    await page.evaluate((c) => { selectGamemode('br'); document.getElementById('room-code-input').value = c; startJoin(); }, code);
    await page.waitForFunction(() => document.getElementById('screen-waiting').style.display !== 'none', null, { timeout: 10000 });
    await sleep(800);
    bots.stdin.write('go\n');
    await page.waitForFunction(() => document.getElementById('screen-game').style.display === 'block', null, { timeout: 15000 });
    await page.evaluate(() => { window.__arMyId = window._gameSocket && window._gameSocket.id; });
    if (arg('compare', false)) {
        // countdown: nothing moves but the 20 ambient dots; same frame drawn tiled, then as vectors
        const prefix = arg('compare', 'cmp');
        await sleep(1600);
        await page.screenshot({ path: prefix + '_tiled.png' });
        await page.evaluate(() => ARGround.setLegacy(true)); await sleep(400);
        await page.screenshot({ path: prefix + '_legacy.png' });
        await page.evaluate(() => ARGround.setLegacy(false));
        const { PNG } = require('../../node_modules/pngjs');
        const A = PNG.sync.read(fs.readFileSync(prefix + '_tiled.png')), B = PNG.sync.read(fs.readFileSync(prefix + '_legacy.png'));
        let n = 0, c16 = 0, c48 = 0, sum = 0, mx = 0;
        for (let i = 0; i < A.data.length; i += 4) { const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])); n++; sum += d; if (d > 16) c16++; if (d > 48) c48++; if (d > mx) mx = d; }
        console.log(JSON.stringify({ compare: prefix, size: [A.width, A.height], mean: +(sum / n).toFixed(3), pct16: +(c16 / n * 100).toFixed(3), pct48: +(c48 / n * 100).toFixed(4), max: mx, tiles: await page.evaluate(() => ARGround.info()), errors: errors.slice(0, 5) }));
        try { bots.kill(); } catch (e) { } await browser.close(); process.exit(0);
    }
    await sleep(5500); // countdown + GO

    if (GSLOG) await page.evaluate(() => { window.__gsLog = []; window._gameSocket.on('gs', pk => { if (window.__rec) window.__gsLog.push([performance.now(), pk[8], pk[1].map(b => [b[0], b[1], b[2], b[3], b[4], b[5]]), pk[0].length]); }); });
    if (ABL) await page.evaluate((abl) => { for (const n of abl.split(',')) { if (n.startsWith('ARArena.')) { window.ARArena[n.slice(8)] = function () {}; } else { window[n] = function () {}; } } }, ABL);
    if (DBG) await page.keyboard.press('`');
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

    // ---- simple player: wander + shoot, driven from here ----
    let stop = false;
    (async () => {
        const keys = ['w', 'a', 's', 'd'];
        let held = new Set();
        const cx = VW / 2, cy = VH / 2;
        await page.mouse.move(cx + 200, cy);
        let i = 0;
        while (!stop) {
            try {
                const want = new Set(); const dir = i % 6;
                if (dir === 0) { want.add('d'); } else if (dir === 1) { want.add('d'); want.add('s'); } else if (dir === 2) { want.add('s'); } else if (dir === 3) { want.add('a'); } else if (dir === 4) { want.add('a'); want.add('w'); } else { want.add('w'); }
                for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
                for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
                held = want;
                const ang = (i * 0.9) % (Math.PI * 2);
                if (!STILL) await page.mouse.move(cx + Math.cos(ang) * 250, cy + Math.sin(ang) * 250);
                if (i % 3 === 0) await page.mouse.down(); else if (i % 3 === 2) await page.mouse.up();
            } catch (e) { }
            i++; await sleep(900);
        }
        try { for (const k of held) await page.keyboard.up(k); await page.mouse.up(); } catch (e) { }
    })();
    await sleep(2000); // settle (sprites cached etc.)

    // ---- pass ----
    const result = { args: { SERVER, MODE, NB, HZ, SECS, PASS, CPU, DPR, size: [VW, VH], HEADED }, gpu: gpuInfo, room: code };
    await cdp.send('Performance.enable');
    const m0 = (await cdp.send('Performance.getMetrics')).metrics;
    const pass = PASS;
    if (pass === 'cpu') { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 150 }); await cdp.send('Profiler.start'); }
    if (pass === 'heap') { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
    let traceEvents = [];
    if (pass === 'gc') {
        cdp.on('Tracing.dataCollected', d => { for (const e of d.value) traceEvents.push(e); });
        await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['v8', 'devtools.timeline', 'disabled-by-default-v8.gc'], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
    }
    await page.evaluate(() => { if (window.__cnt) for (const k in window.__cnt) window.__cnt[k] = 0; window.__frames.length = 0; window.__pos.length = 0; window.__heap.length = 0; window.__long.length = 0; window.__mut = {}; window.__mutOn = true; window.__rec = true; });
    const tStart = Date.now();
    if (arg('clearlabels', false)) setTimeout(() => page.evaluate(() => { window.__clearT = performance.now(); _labelCache.clear(); }).catch(() => {}), 8000);
    await sleep(SECS * 1000);
    const secsReal = (Date.now() - tStart) / 1000;
    await page.evaluate(() => { window.__rec = false; window.__mutOn = false; });
    const m1 = (await cdp.send('Performance.getMetrics')).metrics;
    const mm = o => Object.fromEntries(o.map(x => [x.name, x.value]));
    const a = mm(m0), b = mm(m1);
    result.metrics = { secs: secsReal };
    for (const k of ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration', 'V8CompileDuration', 'Nodes', 'JSHeapUsedSize', 'JSHeapTotalSize']) result.metrics[k] = k.endsWith('Count') || k.endsWith('Duration') ? (b[k] - a[k]) : b[k];
    if (pass === 'cpu') { const { profile } = await cdp.send('Profiler.stop'); result.cpuProfile = profile; }
    if (pass === 'heap') { const { profile } = await cdp.send('HeapProfiler.stopSampling'); result.heapProfile = profile; }
    if (pass === 'gc') {
        await new Promise(async (res) => { cdp.once('Tracing.tracingComplete', res); await cdp.send('Tracing.end'); });
        const names = {};
        const gc = traceEvents.filter(e => /GC/i.test(e.name) && e.ph === 'X' && e.dur !== undefined);
        for (const e of gc) { (names[e.name] = names[e.name] || []).push(e.dur / 1000); }
        result.gc = {}; for (const [k, v] of Object.entries(names)) result.gc[k] = { n: v.length, totalMs: +v.reduce((x, y) => x + y, 0).toFixed(2), p50: +pct(v, .5).toFixed(3), p95: +pct(v, .95).toFixed(3), max: +Math.max(...v).toFixed(3) };
        result.gcRaw = Object.keys(names);
    }
    // frames
    result.diag = await page.evaluate(() => { try { const d = window.__arDiag(); const c = d.csp || []; const s = c.slice().sort((a, b) => a - b); return { cspN: c.length, cspP50: s[Math.floor(s.length * .5)], cspP95: s[Math.floor(s.length * .95)], cspMax: s[s.length - 1], interp: d.interp, rtt: d.rtt, pktPs: d.pktPs, ghosts: d.ghosts, phantoms: d.phantoms, linked: d.linked }; } catch (e) { return String(e); } });
    result.labelCache = await page.evaluate(() => { try { return { size: _labelCache.size }; } catch (e) { return String(e); } });
    result.counts = await page.evaluate(() => window.__cnt || null);
    if (GSLOG) result.gsLog = await page.evaluate(() => window.__gsLog);
    const d = await page.evaluate(() => ({ frames: window.__frames, heap: window.__heap, mut: window.__mut, long: window.__long, pos: window.__pos }));
    stop = true;
    const fr = d.frames;
    if (arg('clearlabels', false)) { const ct = await page.evaluate(() => window.__clearT); result.clearSpike = fr.filter(f => f[1] >= ct && f[1] < ct + 400).map(f => +f[2].toFixed(2)).slice(0, 12); }
    const dur = fr.map(f => f[2]);
    const dts = []; for (let i = 1; i < fr.length; i++) dts.push(fr[i][0] - fr[i - 1][0]);
    const nominal = HZ > 0 ? 1000 / HZ : (dts.length ? pct(dts, .5) : 16.7);
    result.frames = {
        n: fr.length, fps: +(fr.length / secsReal).toFixed(1), nominalMs: +nominal.toFixed(2),
        cb: { avg: +(dur.reduce((x, y) => x + y, 0) / Math.max(1, dur.length)).toFixed(3), p50: +pct(dur, .5).toFixed(3), p95: +pct(dur, .95).toFixed(3), p99: +pct(dur, .99).toFixed(3), max: +Math.max(0, ...dur).toFixed(2), over2x: dur.filter(v => v > 2 * nominal).length, over1x: dur.filter(v => v > nominal).length, over8ms: dur.filter(v => v > 8).length, over16ms: dur.filter(v => v > 16.7).length },
        dt: { p50: +pct(dts, .5).toFixed(3), p95: +pct(dts, .95).toFixed(3), p99: +pct(dts, .99).toFixed(3), max: +Math.max(0, ...dts).toFixed(2), over1_5x: dts.filter(v => v > 1.5 * nominal).length, over2x: dts.filter(v => v > 2 * nominal).length },
        // the first 12 s of per-frame cb times, to spot warm-up
    };
    // heap sawtooth -> allocation estimate
    const hs = d.heap; let alloc = 0, drops = 0, dropMB = []; for (let i = 1; i < hs.length; i++) { const dd = hs[i][1] - hs[i - 1][1]; if (dd >= 0) alloc += dd; else { drops++; dropMB.push(-dd / 1048576); } }
    result.heap = { samples: hs.length, allocMBps: +(alloc / 1048576 / secsReal).toFixed(2), gcDrops: drops, gcDropsPerSec: +(drops / secsReal).toFixed(2), dropMBp50: +pct(dropMB, .5).toFixed(2), startMB: hs.length ? +(hs[0][1] / 1048576).toFixed(1) : 0, endMB: hs.length ? +(hs[hs.length - 1][1] / 1048576).toFixed(1) : 0 };
    result.long = { n: d.long.length, list: d.long.slice(0, 20).map(x => [Math.round(x[0]), Math.round(x[1])]) };
    result.mutationsPerSec = Object.fromEntries(Object.entries(d.mut).sort((x, y) => y[1] - x[1]).slice(0, 25).map(([k, v]) => [k, +(v / secsReal).toFixed(1)]));
    if (POS) result.pos = d.pos;
    result.errors = errors.slice(0, 15);
    if (arg('shot', false)) await page.screenshot({ path: arg('shot', 'shot.png') });
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(result));
    // short console summary
    const brief = { frames: result.frames, heap: result.heap, metrics: result.metrics, long: result.long.n, errors: result.errors.length, gpu: result.gpu };
    console.log(JSON.stringify(brief));
    try { bots.kill(); } catch (e) { }
    await browser.close();
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

// Standard before/after suite at the user's screen (2560x1600 physical, 150% scale = 1707x1067 CSS, dpr 1.5), real vsync.
// node suite.js --server http://127.0.0.1:3100 --label before [--reps 3] [--secs 20] [--query gfx=legacy] [--scenes pve,br]
// Output: results/<label>.json and a table on stdout. Needs the server running; opens visible Chrome windows.
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const SERVER = arg('server', 'http://127.0.0.1:3100'), LABEL = arg('label', 'run'), REPS = +arg('reps', 3), SECS = arg('secs', '20'), QUERY = arg('query', '');
const SCENES = arg('scenes', 'pve,br').split(',');
const PORT = new URL(SERVER).port || 80;
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
const all = {};
for (const scene of SCENES) {
    const rows = [];
    for (let i = 0; i < REPS; i++) {
        const out = path.join(__dirname, 'results', `${LABEL}_${scene}_${i}.json`);
        const a = ['br.js', '--server', SERVER, '--botport', String(PORT), '--mode', scene === 'pve' ? 'pve' : 'br', '--bots', scene === 'pve' ? '3' : '10',
            '--hz', '0', '--headed', '--vsync', '--size', '1707x1067', '--dpr', '1.5', '--secs', SECS, '--pass', 'frames', '--out', out];
        if (QUERY) a.push('--query', QUERY);
        spawnSync('node', a, { cwd: __dirname, stdio: ['ignore', 'ignore', 'inherit'], timeout: 240000 });
        if (!fs.existsSync(out)) { console.error('run failed', scene, i); continue; }
        const r = JSON.parse(fs.readFileSync(out));
        rows.push({ fps: r.frames.fps, dtP50: r.frames.dt.p50, dtP95: r.frames.dt.p95, dtP99: r.frames.dt.p99, dtMax: r.frames.dt.max, cbAvg: r.frames.cb.avg, cbP99: r.frames.cb.p99, allocMBps: r.heap.allocMBps });
    }
    all[scene] = rows;
}
console.log(`\n${LABEL}  (${SERVER}${QUERY ? '?' + QUERY : ''}, ${REPS} runs x ${SECS}s, median of runs)`);
console.log('scene | fps | dt p50 | dt p95 | dt p99 | dt max | JS ms/frame avg (p99) | alloc MB/s');
for (const [scene, rows] of Object.entries(all)) {
    if (!rows.length) continue;
    const m = k => med(rows.map(r => r[k]));
    console.log(`${scene.padEnd(5)} | ${m('fps').toFixed(0)} (runs ${rows.map(r => r.fps.toFixed(0)).join('/')}) | ${m('dtP50')} | ${m('dtP95')} | ${m('dtP99')} | ${m('dtMax')} | ${m('cbAvg').toFixed(2)} (${m('cbP99').toFixed(1)}) | ${m('allocMBps').toFixed(1)}`);
}
fs.writeFileSync(path.join(__dirname, 'results', `${LABEL}.json`), JSON.stringify(all, null, 1));

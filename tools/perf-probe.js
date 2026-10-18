// ============================================
// ARENA ROYALE - tools/perf-probe.js
// Game loop diagnostics, loaded by server.js only with PERF=1. Per room, one JSON line per second to
// PERF_OUT (default perf.jsonl in the project folder): tick time split by section, the real interval
// between ticks (= between 'gs' emits), how late each tick started, event loop delay, GC pauses,
// the encoded size of the state packet, inputs received per second and applied per player per tick.
// ============================================
const fs = require('fs');
const path = require('path');
const { performance, monitorEventLoopDelay, PerformanceObserver } = require('perf_hooks');
const notepack = require('notepack.io'); // the encoder socket.io-msgpack-parser uses

const OUT = process.env.PERF_OUT || path.join(__dirname, '..', 'perf.jsonl');
const out = fs.createWriteStream(OUT, { flags: 'a' });
const eld = monitorEventLoopDelay({ resolution: 1 });
eld.enable();
let gcN = 0, gcTotal = 0, gcMax = 0;
new PerformanceObserver(list => {
    for (const e of list.getEntries()) { gcN++; gcTotal += e.duration; if (e.duration > gcMax) gcMax = e.duration; }
}).observe({ entryTypes: ['gc'] });
console.log('[PERF] writing per-second game loop stats to ' + OUT);

const SECTIONS = ['players', 'pvp', 'zone', 'zombies', 'bullets', 'kits', 'snapshot', 'emit'];
const pct = (arr, q) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const r2 = v => Math.round(v * 100) / 100;

function fresh() {
    const sec = {};
    for (const k of SECTIONS) sec[k] = { sum: 0, max: 0 };
    return { winStart: performance.now(), ticks: [], intervals: [], late: [], bytes: [], sec, cur: {}, inputs: 0, perTick: [0, 0, 0, 0] };
}
const st = room => room._perf || (room._perf = Object.assign(fresh(), { prevStart: null, t: 0 }));

// start of a tick; `lateMs` = how far after its scheduled time it started
exports.tickStart = (room, lateMs) => {
    const s = st(room), t = performance.now();
    if (s.prevStart !== null) s.intervals.push(t - s.prevStart);
    s.prevStart = t; s.t0 = t; s.last = t;
    s.late.push(lateMs);
    for (const k of SECTIONS) s.cur[k] = 0;
};
// end of section `name` (time since the previous mark)
exports.mark = (room, name) => {
    const s = room._perf; if (!s || s.t0 === undefined) return;
    const t = performance.now();
    s.cur[name] += t - s.last; s.last = t;
};
// an input arrived from `playerId`
exports.input = (room, playerId) => { st(room).inputs++; };
// the tick applied `n` queued inputs for `playerId` (server.js input queue)
exports.applied = (room, playerId, n) => { const s = room._perf; if (s) s.perTick[Math.min(3, n)]++; };
// end of a tick: `payload` is the 'gs' array just emitted, `info()` describes the room (called once a second)
exports.tickEnd = (room, code, payload, playerIds, info) => {
    const s = room._perf; if (!s || s.t0 === undefined) return;
    const t = performance.now();
    s.ticks.push(t - s.t0);
    for (const k of SECTIONS) { const v = s.cur[k], a = s.sec[k]; a.sum += v; if (v > a.max) a.max = v; }
    s.bytes.push(notepack.encode(['gs', payload]).length); // measured after the tick timer stopped
    if (t - s.winStart < 1000) return;
    const n = s.ticks.length, sec = {};
    for (const k of SECTIONS) sec[k] = { avg: r2(s.sec[k].sum / n), max: r2(s.sec[k].max) };
    const line = {
        t: Date.now(), room: code, ...info(),
        ticks: n,
        tickMs: { p50: r2(pct(s.ticks, 0.5)), p95: r2(pct(s.ticks, 0.95)), max: r2(Math.max(...s.ticks)) },
        sec,
        emitIntervalMs: { p50: r2(pct(s.intervals, 0.5)), p95: r2(pct(s.intervals, 0.95)), max: r2(Math.max(0, ...s.intervals)), over25: s.intervals.filter(v => v > 25).length },
        lateMs: { p95: r2(pct(s.late, 0.95)), max: r2(Math.max(...s.late)) },
        eldMs: { p50: r2(eld.percentile(50) / 1e6), p99: r2(eld.percentile(99) / 1e6), max: r2(eld.max / 1e6) },
        gcMs: { n: gcN, total: r2(gcTotal), max: r2(gcMax) },
        bytes: { avg: Math.round(s.bytes.reduce((a, b) => a + b, 0) / s.bytes.length), max: Math.max(...s.bytes) },
        inputs: { recvPerSec: s.inputs, appliedPerPlayerPerTick: s.perTick },
    };
    out.write(JSON.stringify(line) + '\n');
    eld.reset(); gcN = 0; gcTotal = 0; gcMax = 0;
    const keep = { prevStart: s.prevStart, t0: s.t0, last: s.last, cur: s.cur };
    room._perf = Object.assign(fresh(), keep);
};

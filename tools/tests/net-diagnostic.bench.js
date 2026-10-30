// Local microbenchmark only. Run with NODE_PATH pointing at a local dependency install.
const { EventEmitter } = require('node:events');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createGsWriter } = require('../../server-gs');
const { NetDiagnostic, COL } = require('../net-diagnostic');
const msgpack = require('notepack.io');

const RUNS = 5, N = 30000;
const writer = createGsWriter(msgpack, 7);
const engine = new EventEmitter();
const transport = new EventEmitter();
transport.name = 'websocket';
transport.writable = true;
transport.socket = { bufferedAmount: 0, _socket: { writableLength: 0 } };
engine.transport = transport;
engine.readyState = 'open';
engine.writeBuffer = [];
const socket = new EventEmitter();
socket.id = 'benchmark';
socket._nickname = 'benchmark';
socket._verifiedId = 'benchmark';
socket.client = { conn: engine, writeToEngine(buf) {
    const packet = { type: 'message', data: buf };
    engine.emit('packetCreate', packet);
    engine.writeBuffer.push(packet);
    engine.emit('flush', engine.writeBuffer);
    engine.writeBuffer = [];
    transport.emit('drain');
} };
const shared = writer.begin([1, [], [], [], [], null, null]);
const own = [10, 10, 0, 0, 1, 0];
const diag = new NetDiagnostic(true, { allowedUserId: 'benchmark', isAuthorized: (socket, id) => socket._verifiedId === id });
diag.claim(socket, 'ROOM');

function measure(active) {
    const start = performance.now();
    let bytes = 0;
    for (let i = 0; i < N; i++) {
        const slot = active ? diag.begin(diag.active, i + 1, 0, 0, 0) : -1;
        if (active) { diag.mark(slot, COL.simEnd, 1); diag.mark(slot, COL.packStart, 1); diag.mark(slot, COL.encodeStart, 2); diag.mark(slot, COL.encodeEnd, 3); }
        bytes += writer.send(socket, shared, own, active ? diag : null, slot);
    }
    return { nsPerSnapshot: Math.round((performance.now() - start) * 1e6 / N), bytes };
}

measure(false); measure(true); // warm up JIT
const off = [], on = [];
for (let i = 0; i < RUNS; i++) {
    if (i % 2) { on.push(measure(true)); off.push(measure(false)); }
    else { off.push(measure(false)); on.push(measure(true)); }
}
const fixedServerBufferBytes = diag.active.rows.byteLength + diag.active.batch.byteLength + diag.active.events.byteLength;
function median(rows) { return rows.map(r => r.nsPerSnapshot).sort((a, b) => a - b)[Math.floor(rows.length / 2)]; }
async function finish() {
const dir = fs.mkdtempSync(path.join(__dirname, '.diag-bench-'));
try {
    diag.exportDir = dir;
    for (let tick = 1; tick <= 480; tick++) {
        const now = performance.now(), slot = diag.begin(diag.active, tick, now, now, 0);
        for (let col = 3; col < 26; col++) diag.mark(slot, col, now + col / 1000);
    }
    diag.active.lastIncident = -Infinity;
    const ready = once(socket, 'netdiag-export-ready');
    diag.incident(socket, 480, 'benchmark');
    const [notice] = await ready;
    const exportBytes = fs.statSync(path.join(dir, `arena-netdiag-${notice.id}.json`)).size;
    const exportPrepMs = +diag.active.lastExportPrepMs.toFixed(3);
    console.log(JSON.stringify({ node: process.version, iterationsPerRun: N, runs: RUNS,
    offNs: off.map(x => x.nsPerSnapshot), onNs: on.map(x => x.nsPerSnapshot),
    medianOffNs: median(off), medianOnNs: median(on), addedNs: median(on) - median(off),
    addedMsPerSecondAt60Hz: +((median(on) - median(off)) * 60 / 1e6).toFixed(4),
    fixedServerBufferBytes, exportPrepMs, exportBytes,
    payloadBytesSame: off.every(x => x.bytes === on[0].bytes) && on.every(x => x.bytes === on[0].bytes),
}));
} finally { diag.release(socket); fs.rmSync(dir, { recursive: true, force: true }); }
}
finish().catch(error => { console.error(error); process.exitCode = 1; });

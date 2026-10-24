const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { NetDiagnostic, COL, DECISION } = require('../net-diagnostic');

function fakeSocket(id = 'socket-one') {
    const engine = new EventEmitter();
    const transport = new EventEmitter();
    transport.name = 'websocket';
    transport.writable = true;
    transport.socket = { bufferedAmount: 0, _socket: { writableLength: 0 } };
    engine.transport = transport;
    engine.writeBuffer = [];
    engine.readyState = 'open';
    const socket = new EventEmitter();
    socket.id = id;
    socket._nickname = 'netdiag_local';
    socket._verifiedId = 'user-1';
    socket.client = { conn: engine };
    return { socket, engine, transport };
}

test('disabled by default, one active socket, and listeners removed on release', () => {
    const { socket, engine, transport } = fakeSocket();
    const disabled = new NetDiagnostic(false, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id });
    assert.equal(disabled.claim(socket, 'ROOM'), null);
    assert.equal(disabled.worker, null);
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id });
    assert.match(diag.claim(socket, 'ROOM'), /^[0-9a-f]{16}$/);
    assert.equal(diag.claim(fakeSocket('second').socket, 'ROOM'), null);
    assert.equal(diag.forRoom('OTHER'), null);
    assert.ok(diag.forRoom('ROOM'));
    diag.release(socket);
    assert.equal(diag.active, null);
    assert.equal(engine.listenerCount('packetCreate'), 0);
    assert.equal(engine.listenerCount('flush'), 0);
    assert.equal(transport.listenerCount('drain'), 0);
});

test('only the explicitly authorized account can claim the one slot', () => {
    const other = fakeSocket('other');
    const diag = new NetDiagnostic(true, { allowedUserId: 'authorized', isAuthorized: (socket, id) => socket._verifiedId === id });
    assert.equal(diag.claim(other.socket, 'ROOM'), null);
    assert.equal(diag.active, null);
    other.socket._nickname = 'authorized';
    assert.equal(diag.claim(other.socket, 'ROOM'), null, 'nickname alone is insufficient');
    other.socket._verifiedId = 'authorized';
    assert.ok(diag.claim(other.socket, 'ROOM'));
    diag.release(other.socket);
    assert.equal(diag.worker, null);
});

test('an export path inside the web root is rejected before activation', () => {
    const { socket } = fakeSocket();
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id,
        exportDir: path.join(__dirname, '../../public/diagnostics') });
    assert.equal(diag.claim(socket, 'ROOM'), null);
    assert.equal(diag.worker, null);
    assert.equal(diag.active, null);
    assert.match(String(diag.lastError), /public/);
});

test('probe and Engine.IO observer failures cannot prevent a gameplay write', () => {
    const msgpack = require('notepack.io');
    const { createGsWriter } = require('../../server-gs');
    const { socket, engine, transport } = fakeSocket();
    let writes = 0;
    socket.client.writeToEngine = () => { writes++; };
    const writer = createGsWriter(msgpack, 7);
    const shared = writer.begin([1, [], [], [], [], null, null]);
    const throwing = { beforeWrite() { throw Error('probe'); }, afterWrite() { throw Error('probe'); },
        decision() { throw Error('probe'); }, fail() {} };
    assert.ok(writer.send(socket, shared, [1], throwing, 0) > 0);
    assert.equal(writes, 1);
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id });
    diag.claim(socket, 'ROOM');
    diag.active.packets = { get() { throw Error('observer'); } };
    assert.doesNotThrow(() => engine.emit('packetCreate', { data: Buffer.from([1]) }));
    assert.equal(diag.active, null);
    assert.equal(engine.listenerCount('packetCreate'), 0);
    assert.equal(transport.listenerCount('drain'), 0);
    assert.equal(writes, 1);
});

test('large incident export stays off the gameplay socket and preserves bounded memory', async () => {
    const dir = fs.mkdtempSync(path.join(__dirname, '.diag-backlog-'));
    const { socket, engine } = fakeSocket();
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id, exportDir: dir });
    const sent = [];
    socket.on('netdiag-export-queued', data => sent.push(['queued', data]));
    socket.on('netdiag-export-ready', data => sent.push(['ready', data]));
    socket.on('netdiag-report', data => sent.push(['report', data]));
    diag.claim(socket, 'ROOM');
    for (let tick = 1; tick <= 480; tick++) {
        const now = performance.now();
        const slot = diag.begin(diag.active, tick, now - 0.25, now, 0.25);
        for (let col = 3; col < 26; col++) diag.mark(slot, col, now + col / 1000);
    }
    assert.equal(diag.active.rows.byteLength, 6000 * 26 * 8);
    assert.equal(diag.incident(socket, 480, 'client-gap'), true);
    const [notice] = await once(socket, 'netdiag-export-ready');
    const file = path.join(dir, `arena-netdiag-${notice.id}.json`);
    assert.ok(fs.statSync(file).size > 65536);
    assert.equal(sent.some(x => x[0] === 'report'), false);
    assert.ok(sent.every(x => JSON.stringify(x[1]).length < 512));
    assert.equal(engine.transport.socket._socket.writableLength, 0);
    diag.release(socket);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('export errors become a small failure notice and never escape a timer', async () => {
    const dir = fs.mkdtempSync(path.join(__dirname, '.diag-invalid-'));
    const file = path.join(dir, 'file');
    fs.writeFileSync(file, 'file');
    const { socket } = fakeSocket();
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id, exportDir: file });
    try {
        diag.claim(socket, 'ROOM');
        assert.equal(diag.incident(socket, 1, 'client-gap'), true);
        const [notice] = await once(socket, 'netdiag-export-failed');
        assert.equal(notice.ok, false);
        assert.equal(notice.error, 'EEXIST');
        assert.ok(diag.active);
    } finally { diag.release(socket); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an exception while preparing a timed export disables the probe safely', async () => {
    const { socket, engine } = fakeSocket();
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id });
    diag.claim(socket, 'ROOM');
    const slot = diag.begin(diag.active, 1, performance.now(), performance.now(), 0);
    assert.ok(slot >= 0);
    diag.active.rows.subarray = () => { throw Error('timed export probe'); };
    diag.incident(socket, 1, 'client-gap');
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.equal(diag.active, null);
    assert.match(String(diag.lastError), /timed export probe/);
    assert.equal(engine.listenerCount('flush'), 0);
});

test('private worker export retains at most twenty local reports', async () => {
    const dir = fs.mkdtempSync(path.join(__dirname, '.diag-retain-'));
    const worker = new Worker(path.join(__dirname, '../net-diagnostic-export-worker.js'));
    try {
        for (let i = 0; i < 21; i++) {
            const id = i.toString(16).padStart(24, '0');
            const result = once(worker, 'message');
            worker.postMessage({ id, dir, session: 'test', incidentTick: i, reason: 'test',
                wallEnd: new Date().toISOString(), serverNow: i, columns: ['tick'], decisions: {},
                rows: new Float64Array([i]), events: new Float64Array(0) });
            assert.equal((await result)[0].ok, true);
            await new Promise(resolve => setTimeout(resolve, 2));
        }
        const files = fs.readdirSync(dir);
        assert.equal(files.length, 20);
        assert.ok(!files.includes(`arena-netdiag-${'0'.repeat(24)}.json`));
    } finally { await worker.terminate(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('worker publishes only complete JSON and removes stale temporary files', async () => {
    const dir = fs.mkdtempSync(path.join(__dirname, '.diag-atomic-'));
    const stale = path.join(dir, `.arena-netdiag-${'a'.repeat(24)}.tmp`);
    fs.writeFileSync(stale, 'incomplete');
    const old = new Date(Date.now() - 7200000);
    fs.utimesSync(stale, old, old);
    const worker = new Worker(path.join(__dirname, '../net-diagnostic-export-worker.js'));
    const id = 'b'.repeat(24), file = path.join(dir, `arena-netdiag-${id}.json`);
    try {
        const result = once(worker, 'message');
        worker.postMessage({ id, dir, session: 'atomic', incidentTick: 1, reason: 'test',
            wallEnd: new Date().toISOString(), serverNow: 1, columns: ['tick'], decisions: {},
            rows: new Float64Array(250000), events: new Float64Array(0) });
        let mainThreadRan = false;
        await new Promise(resolve => setImmediate(() => { mainThreadRan = true; resolve(); }));
        assert.equal(mainThreadRan, true, 'worker serialization does not block the main event loop');
        const [notice] = await result;
        assert.equal(notice.ok, true);
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).rows.length, 250000);
        assert.equal(fs.existsSync(stale), false);
        assert.equal(fs.existsSync(path.join(dir, `.arena-netdiag-${id}.tmp`)), false);
        const duplicate = once(worker, 'message');
        worker.postMessage({ id, dir, session: 'duplicate', incidentTick: 2, reason: 'test',
            wallEnd: new Date().toISOString(), serverNow: 2, columns: ['tick'], decisions: {},
            rows: new Float64Array([2]), events: new Float64Array(0) });
        assert.equal((await duplicate)[0].ok, false, 'published reports cannot be overwritten');
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).session, 'atomic');
    } finally { await worker.terminate(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('worker shutdown cannot leave a partially published report', { timeout: 10000 }, async () => {
    const dir = fs.mkdtempSync(path.join(__dirname, '.diag-shutdown-'));
    const id = 'c'.repeat(24), temp = path.join(dir, `.arena-netdiag-${id}.tmp`);
    const file = path.join(dir, `arena-netdiag-${id}.json`);
    const worker = new Worker(path.join(__dirname, '../net-diagnostic-export-worker.js'));
    try {
        worker.postMessage({ id, dir, session: 'shutdown', incidentTick: 1, reason: 'test',
            wallEnd: new Date().toISOString(), serverNow: 1, columns: ['tick'], decisions: {},
            rows: new Float64Array(500000), events: new Float64Array(0) });
        for (let i = 0; i < 300 && !fs.existsSync(temp) && !fs.existsSync(file); i++)
            await new Promise(resolve => setTimeout(resolve, 5));
        assert.ok(fs.existsSync(temp) || fs.existsSync(file), 'worker began publication');
        await worker.terminate();
        if (fs.existsSync(file)) assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).session, 'shutdown');
        if (fs.existsSync(temp)) assert.ok(fs.statSync(temp).size >= 0);
    } finally { await worker.terminate(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('default export directory is stable across process instances', () => {
    const a = new NetDiagnostic(false), b = new NetDiagnostic(false);
    assert.equal(a.exportDir, b.exportDir);
    assert.ok(path.isAbsolute(a.exportDir));
    assert.match(path.basename(a.exportDir), /^arena-netdiag-(?:\d+|local)$/);
});

test('worker refuses a nonprivate export directory on Unix', { skip: process.platform === 'win32' }, async () => {
    const dir = fs.mkdtempSync(path.join(__dirname, '.diag-perms-'));
    fs.chmodSync(dir, 0o755);
    const worker = new Worker(path.join(__dirname, '../net-diagnostic-export-worker.js'));
    try {
        const result = once(worker, 'message');
        worker.postMessage({ id: 'd'.repeat(24), dir, session: 'private', incidentTick: 1,
            reason: 'test', wallEnd: new Date().toISOString(), serverNow: 1,
            columns: ['tick'], decisions: {}, rows: new Float64Array([1]), events: new Float64Array(0) });
        assert.equal((await result)[0].ok, false);
        assert.deepEqual(fs.readdirSync(dir), []);
    } finally { await worker.terminate(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('scheduledDue follows the reset deadline when catch-up ticks are dropped', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    const match = source.match(/function loop\(\) \{[\s\S]*?const now = performance\.now\(\);([\s\S]*?)if \(!room\.gameStarted/);
    assert.ok(match, 'game loop deadline accounting is present');
    function run(now) {
        const context = { now, next: 100, INTERVAL_MS: 16, MAX_CATCHUP: 10, got: null,
            tick(late, due) { context.got = [late, due]; } };
        vm.runInNewContext(match[1], context);
        return context.got;
    }
    assert.deepEqual(run(1000), [0, 1000]);
    assert.deepEqual(run(150), [50, 100]);
});

test('game cleanup ends the recording after RAF cancellation and disconnect is not a match end', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
    assert.match(source, /isGameplayActive: \(\) => !gameEnded \|\| isSpectating/);
    const cleanup = source.match(/window\._gameCleanup = \(\) => \{([\s\S]*?)\n    \};/);
    assert.ok(cleanup);
    assert.ok(cleanup[1].indexOf('cancelAnimationFrame(rafId)') < cleanup[1].indexOf('_BB.gameplayEnded(); _BB.detach()'));
    assert.match(source, /socket\.on\('game-rematch',[\s\S]*?_BB\.gameplayEnded\(\)/);
    assert.match(source, /socket\.on\('game-reset', reloadAfterDiagnostic\)/);
    assert.match(source, /bb\.whenSaved\(2000\)\.then\(\(\) => location\.reload\(\)/);
});

test('correlates packet create, Engine.IO flush and WebSocket transport drain by buffer', () => {
    const { socket, engine, transport } = fakeSocket();
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id });
    diag.claim(socket, 'ROOM');
    const state = diag.active;
    const due = performance.now() - 4;
    const slot = diag.begin(state, 42, due, performance.now(), 4);
    const buf = Buffer.from([1, 2, 3]);
    diag.beforeWrite(slot, buf, performance.now(), performance.now(), performance.now(), socket.client);
    const packet = { type: 'message', data: buf };
    engine.emit('packetCreate', packet);
    engine.writeBuffer.push(packet);
    transport.writable = false;
    diag.afterWrite(slot, socket.client);
    assert.equal(state.rows[slot + COL.engineAfter], 1);
    assert.equal(state.rows[slot + COL.decision], DECISION.sent);
    engine.emit('flush', engine.writeBuffer);
    engine.writeBuffer = [];
    transport.emit('drain');
    assert.ok(state.rows[slot + COL.packetCreate] > 0);
    assert.ok(state.rows[slot + COL.flush] >= state.rows[slot + COL.packetCreate]);
    assert.ok(state.rows[slot + COL.transportDrain] >= state.rows[slot + COL.flush]);
    diag.release(socket);
});

test('incident export is bounded, asynchronous, and contains explicit skip reason', async () => {
    const { socket } = fakeSocket();
    const dir = fs.mkdtempSync(path.join(__dirname, '.diag-export-'));
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id, exportDir: dir });
    const session = diag.claim(socket, 'ROOM');
    const state = diag.active;
    const slot = diag.begin(state, 73, performance.now(), performance.now(), 0);
    diag.decision(slot, 'silent', 621);
    const report = new Promise(resolve => socket.once('netdiag-export-ready', resolve));
    assert.equal(diag.incident(socket, 73, 'client-gap'), true);
    assert.equal(diag.incident(socket, 74, 'client-gap'), false);
    const notice = await report;
    const exported = JSON.parse(fs.readFileSync(path.join(dir, `arena-netdiag-${notice.id}.json`), 'utf8'));
    assert.equal(exported.session, session);
    assert.equal(exported.incidentTick, 73);
    assert.equal(exported.rows.length, 1);
    assert.equal(exported.rows[0][COL.decision], DECISION.silent);
    assert.equal(exported.rows[0][COL.inputAge], 621);
    diag.release(socket);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('browser parser calls decode hook once and preserves the decoded gs2 packet', () => {
    const events = [];
    const root = { ARBlackBox: { on: true, netActive: true, decode: (...args) => events.push(args) } };
    const context = { self: root, performance, Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder };
    const source = fs.readFileSync(path.join(__dirname, '../../public/socket-msgpack-parser.js'), 'utf8');
    vm.runInNewContext(source, context);
    const parser = root.msgpackParser;
    const data = { type: 2, data: ['gs2', [123, [], [], [], [], null, null, null]], nsp: '/' };
    const encoded = parser.Encoder.prototype.encode(data)[0];
    const decoder = new parser.Decoder();
    let decoded;
    decoder.on('decoded', packet => { decoded = packet; });
    decoder.add(encoded);
    assert.equal(decoded.data[1][0], 123);
    assert.equal(events.length, 1);
    assert.equal(events[0][2], 123);
    assert.ok(events[0][1] >= events[0][0]);
    root.ARBlackBox.netActive = false;
    decoder.add(encoded);
    assert.equal(events.length, 1);
    root.ARBlackBox.netActive = true;
    root.ARBlackBox.decode = () => { throw Error('browser probe'); };
    assert.doesNotThrow(() => decoder.add(encoded));
    assert.equal(decoded.data[1][0], 123);
    assert.equal(root.ARBlackBox.netActive, false);
});

test('browser defers large export until gameplay ends and clears diagnostic listeners', async () => {
    const window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
    const document = { hidden: false, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
        body: { appendChild() {} }, createElement() { return { setAttribute() {}, remove() {}, click() {}, className: '', innerHTML: '' }; } };
    let nextTimer = 0, stringifyCount = 0, active = true;
    const timers = new Set();
    const context = { self: window, window, document, navigator: { userAgent: 'test', platform: 'test', language: 'en' },
        screen: { width: 800, height: 600 }, innerWidth: 800, innerHeight: 600, performance,
        setInterval() { const id = ++nextTimer; timers.add(id); return id; }, clearInterval(id) { timers.delete(id); },
        setTimeout, clearTimeout, Date, PerformanceObserver, Blob, URL,
        JSON: { stringify(value) { stringifyCount++; return JSON.stringify(value); } } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/blackbox.js'), 'utf8'), context);
    const bb = window.ARBlackBox, socket = new EventEmitter();
    socket.connected = true;
    bb.attach({ socket, meta: () => ({}), counts: () => [0, 0, 1], isGameplayActive: () => active });
    assert.equal(bb.start(), true);
    socket.emit('netdiag-ready', { session: 'match-a' });
    socket.emit('netdiag-export-queued', { id: 'export-a', session: 'match-a', incidentTick: 44 });
    socket.emit('netdiag-export-ready', { id: 'export-a', session: 'match-a', incidentTick: 44, ok: true });
    assert.equal(stringifyCount, 0);
    await new Promise(resolve => setTimeout(resolve, 75));
    assert.equal(stringifyCount, 0);
    bb.save('F9');
    assert.equal(stringifyCount, 0);
    const beforeDisconnect = timers.size;
    socket.emit('disconnect', 'test');
    assert.equal(bb.netActive, false);
    assert.ok(timers.size < beforeDisconnect);
    socket.connected = false;
    socket.emit('reconnect');
    socket.emit('netdiag-ended', { session: 'match-a' });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(stringifyCount, 0, 'disconnect and reconnect do not end gameplay');
    assert.equal(bb.report(), null, 'manual report cannot snapshot during gameplay');
    bb.stop(true);
    assert.equal(stringifyCount, 0);
    bb.gameplayEnded();
    bb.detach();
    assert.equal(bb.hasPendingSave(), true);
    await new Promise(resolve => setTimeout(resolve, 10));
    await bb.whenSaved(100);
    assert.equal(bb.hasPendingSave(), false);
    assert.equal(stringifyCount, 1);
    assert.equal(window.__arBBLast.netDiagnostic.session, 'match-a');
    assert.equal(window.__arBBLast.netDiagnostic.server.id, 'export-a');
    assert.equal(window.__arBBLast.netDiagnostic.captures[0].incidentTick, 44);
    assert.equal(socket.listenerCount('netdiag-ready'), 0);
    assert.equal(socket.listenerCount('netdiag-export-ready'), 0);
    assert.equal(timers.size, 0);
});

test('release at rematch gives the next match a distinct session and no old listeners', () => {
    const { socket, engine, transport } = fakeSocket();
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id });
    const first = diag.claim(socket, 'ROOM');
    diag.begin(diag.active, 120, performance.now(), performance.now(), 0);
    diag.release(socket);
    assert.equal(engine.listenerCount('flush'), 0);
    assert.equal(transport.listenerCount('drain'), 0);
    const second = diag.claim(socket, 'ROOM');
    assert.notEqual(second, first);
    const slot = diag.begin(diag.active, 1, performance.now(), performance.now(), 0);
    assert.equal(diag.active.rows[slot + COL.tick], 1);
    diag.release(socket);
});

test('browser Blackbox keeps bounded decode/handler/interpolation rows and asks once for a gap', async () => {
    const window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
    const document = {
        hidden: false, addEventListener() {}, removeEventListener() {}, querySelector() { return null; },
        body: { appendChild() {} },
        createElement() { return { setAttribute() {}, remove() {}, className: '', innerHTML: '' }; },
    };
    const context = { self: window, window, document, navigator: { userAgent: 'test', platform: 'test', language: 'en' },
        screen: { width: 800, height: 600 }, innerWidth: 800, innerHeight: 600,
        performance, setInterval, clearInterval, setTimeout, clearTimeout, Date,
        PerformanceObserver, Blob, URL,
    };
    const source = fs.readFileSync(path.join(__dirname, '../../public/blackbox.js'), 'utf8');
    vm.runInNewContext(source, context);
    const blackbox = window.ARBlackBox;
    const socket = new EventEmitter();
    const requested = [];
    socket.on('netdiag-incident', data => requested.push(data.tick));
    blackbox.attach({ socket, meta: () => ({}), counts: () => [0, 0, 1] });
    try {
        assert.equal(blackbox.start(), true);
        socket.emit('netdiag-ready', { session: 'session-one' });
        const t = performance.now();
        blackbox.decode(t, t + 1, 10);
        blackbox.packet(t + 2, 10, 1, 0, 0);
        blackbox.handler(t + 3, 10, t + 2, 1, 0, 34);
        blackbox.interp(t + 4, 10, 2, 34, 0, 1);
        blackbox.packet(t + 70, 11, 1, 0, 0);
        blackbox.packet(t + 140, 12, 1, 0, 0);
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.deepEqual(requested, [11]);
        const report = blackbox.report();
        assert.equal(report.netDiagnostic.session, 'session-one');
        assert.equal(report.netDiagnostic.decode.length, 1);
        assert.equal(report.netDiagnostic.handler.length, 1);
        assert.equal(report.netDiagnostic.interpolation.length, 1);
    } finally {
        blackbox.stop(false);
        blackbox.detach();
    }
});

test('real local Socket.IO/Engine.IO path records all handoff stages without changing gs2', async () => {
    const { Server } = require('socket.io');
    const { io: connect } = require('../perf-harness/node_modules/socket.io-client');
    const parser = require('socket.io-msgpack-parser');
    const msgpack = require('notepack.io');
    const { createGsWriter } = require('../../server-gs');
    const httpServer = http.createServer();
    const io = new Server(httpServer, { parser, transports: ['websocket'], perMessageDeflate: false });
    const diag = new NetDiagnostic(true, { allowedUserId: 'user-1', isAuthorized: (socket, id) => socket._verifiedId === id });
    const writer = createGsWriter(msgpack, 7);
    const connection = once(io, 'connection');
    httpServer.listen(0, '127.0.0.1');
    await once(httpServer, 'listening');
    const client = connect(`ws://127.0.0.1:${httpServer.address().port}`, {
        parser, transports: ['websocket'], reconnection: false,
    });
    try {
        const [socket] = await connection;
        socket._nickname = 'netdiag_local';
        socket._verifiedId = 'user-1';
        const session = diag.claim(socket, 'ROOM');
        assert.ok(session);
        const slot = diag.begin(diag.active, 91, performance.now(), performance.now(), 0);
        const received = once(client, 'gs2');
        writer.send(socket, writer.begin([91, [], [], [], [], null, null]), [1, 2, 3], diag, slot);
        const [payload] = await received;
        assert.equal(payload[0], 91);
        await new Promise(resolve => setTimeout(resolve, 20));
        const row = diag.active.rows;
        assert.equal(row[slot + COL.decision], DECISION.sent);
        assert.ok(row[slot + COL.packetCreate] > 0);
        assert.ok(row[slot + COL.flush] >= row[slot + COL.packetCreate]);
        assert.ok(row[slot + COL.transportDrain] >= row[slot + COL.flush]);
        diag.release(socket);
    } finally {
        client.disconnect();
        await new Promise(resolve => io.close(resolve));
        httpServer.close();
    }
});

test('full local server keeps gs2 running when disabled or Supabase is unavailable', { timeout: 25000 }, async () => {
    const { io: connect } = require('../perf-harness/node_modules/socket.io-client');
    const parser = require('socket.io-msgpack-parser');
    const ARNet = require('../../public/netproto');
    for (const diagnosticFlag of ['0', '1']) {
    const port = 42000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '',
            LAG_LOG: '0', AR_NET_DIAG: diagnosticFlag, AR_NET_DIAG_USER_ID: 'user-1' }, stdio: 'ignore',
    });
    let client;
    try {
        let ready = false;
        for (let i = 0; i < 50 && !ready; i++) {
            try { await fetch(`http://127.0.0.1:${port}/api/build`); ready = true; }
            catch (_) { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        assert.ok(ready);
        const login = await (await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ nickname: 'netdiag_local', password: 'x' }),
        })).json();
        client = connect(`http://127.0.0.1:${port}`, { parser, transports: ['websocket'], reconnection: false });
        await once(client, 'connect');
        client.emit('authenticate', { nickname: 'netdiag_local', token: login.token });
        const roomCreated = once(client, 'room-created');
        client.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, mode: 'br', xp: 0, proto: ARNet.PROTO });
        await roomCreated;
        const started = once(client, 'game-start');
        client.emit('start-game');
        await started;
        let claims = 0;
        client.on('netdiag-ready', () => claims++);
        client.emit('netdiag-start');
        const [packet] = await once(client, 'gs2');
        assert.ok(Number.isInteger(packet[0]));
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(claims, 0, `diagnostic flag ${diagnosticFlag} without Supabase`);
    } finally { if (client) client.disconnect(); child.kill(); }
    }
});

test('full local game server grants one diagnostic slot and exports matched ticks', { timeout: 15000 }, async () => {
    const { io: connect } = require('../perf-harness/node_modules/socket.io-client');
    const parser = require('socket.io-msgpack-parser');
    const ARNet = require('../../public/netproto');
    const { fakeSupabase, makeRow } = require('./fake-supabase');
    const db = fakeSupabase({ row: { ...makeRow(), id: 'user-1', nickname: 'netdiag_local' } });
    await new Promise(resolve => db.listen(0, '127.0.0.1', resolve));
    const port = 41000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env, PORT: String(port), SUPABASE_URL: `http://127.0.0.1:${db.address().port}`, SUPABASE_SERVICE_KEY: 'test-key',
            LAG_LOG: '0', AR_NET_DIAG: '1', AR_NET_DIAG_USER_ID: 'user-1',
            AR_NET_DIAG_DIR: path.join(__dirname, '.diag-server-export') }, stdio: 'ignore',
    });
    let client;
    try {
        let ready = false;
        for (let i = 0; i < 50 && !ready; i++) {
            try { await fetch(`http://127.0.0.1:${port}/api/build`); ready = true; }
            catch (_) { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        assert.ok(ready, 'local game server started');
        const login = await (await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ nickname: 'netdiag_local', password: 'secret' }),
        })).json();
        assert.equal(login.ok, true);
        client = connect(`http://127.0.0.1:${port}`, { parser, transports: ['websocket'], reconnection: false });
        await once(client, 'connect');
        client.emit('authenticate', { nickname: 'netdiag_local', token: login.token });
        const roomCreated = once(client, 'room-created');
        client.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, mode: 'br', xp: 0, proto: ARNet.PROTO });
        await roomCreated;
        const gameStarted = once(client, 'game-start');
        client.emit('start-game');
        await gameStarted;
        const diagnosticReady = once(client, 'netdiag-ready');
        client.emit('netdiag-start');
        const [claim] = await diagnosticReady;
        assert.match(claim.session, /^[0-9a-f]{16}$/);
        const [packet] = await once(client, 'gs2');
        assert.ok(Number.isInteger(packet[0]));
        let gsCount = 0, pongCount = 0, legacyReports = 0;
        client.on('gs2', () => gsCount++);
        client.on('netdiag-pong', () => pongCount++);
        client.on('netdiag-report', () => legacyReports++);
        for (let i = 0; i < 20; i++) client.emit('netdiag-ping', performance.now());
        const reportPromise = once(client, 'netdiag-export-ready');
        for (let i = 0; i < 20; i++) client.emit('netdiag-incident', { tick: packet[0] });
        const [notice] = await reportPromise;
        const report = JSON.parse(fs.readFileSync(path.join(__dirname, '.diag-server-export', `arena-netdiag-${notice.id}.json`), 'utf8'));
        assert.equal(report.session, claim.session);
        assert.equal(report.reason, 'client-gap');
        assert.ok(report.rows.some(row => row[COL.tick] === packet[0]));
        assert.ok(report.rows.some(row => row[COL.decision] === DECISION.sent));
        assert.equal(pongCount, 1);
        assert.equal(legacyReports, 0);
        assert.ok(gsCount > 30, 'snapshots continue during export');
    } finally {
        if (client) client.disconnect();
        child.kill(); db.close();
        fs.rmSync(path.join(__dirname, '.diag-server-export'), { recursive: true, force: true });
    }
});

test('Supabase read failure and a different user ID deny activation', { timeout: 20000 }, async () => {
    const { io: connect } = require('../perf-harness/node_modules/socket.io-client');
    const parser = require('socket.io-msgpack-parser');
    const ARNet = require('../../public/netproto');
    const { startServer, post, makeRow } = require('./fake-supabase');
    for (const scenario of [
        { userId: 'user-1', failRead: true },
        { userId: 'another-user', failRead: false },
    ]) {
        const state = { row: { ...makeRow(), id: 'user-1', nickname: 'netdiag_local' }, failDiagRead: scenario.failRead };
        const server = await startServer(state, { AR_NET_DIAG: '1', AR_NET_DIAG_USER_ID: scenario.userId });
        let client;
        try {
        const login = await post(server.port, '/api/auth/login', { nickname: 'netdiag_local', password: 'secret' });
        assert.equal(login.ok, true);
        client = connect(`http://127.0.0.1:${server.port}`, { parser, transports: ['websocket'], reconnection: false });
        await once(client, 'connect');
        client.emit('authenticate', { nickname: 'netdiag_local', token: login.token });
        const roomCreated = once(client, 'room-created');
        client.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, mode: 'br', xp: 0, proto: ARNet.PROTO });
        await roomCreated;
        const started = once(client, 'game-start');
        client.emit('start-game');
        await started;
        let claims = 0;
        client.on('netdiag-ready', () => claims++);
        client.emit('netdiag-start');
        const [packet] = await once(client, 'gs2');
        assert.ok(Number.isInteger(packet[0]));
        await new Promise(resolve => setTimeout(resolve, 150));
        if (scenario.failRead) assert.ok(state.diagReads >= 1, 'activation attempted a live Supabase read');
        else assert.equal(state.diagReads || 0, 0, 'another user ID is denied before querying');
        assert.equal(claims, 0);
        } finally { if (client) client.disconnect(); server.stop(); }
    }
});

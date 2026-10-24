// Opt-in, one authorized socket. Exports run off the game thread and socket.
const { randomBytes } = require('crypto');
const { PerformanceObserver } = require('perf_hooks');
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

const COLUMNS = [
    'tick', 'due', 'start', 'simEnd', 'packStart', 'encodeStart', 'encodeEnd',
    'ownStart', 'ownEncodeEnd', 'ownEnd',
    'writeStart', 'writeEnd', 'bytes', 'rawBefore', 'rawAfter', 'engineBefore',
    'engineAfter', 'wsBefore', 'wsAfter', 'writableBefore', 'decision', 'inputAge',
    'packetCreate', 'flush', 'transportDrain', 'loopDelay',
];
const COL = Object.fromEntries(COLUMNS.map((name, index) => [name, index]));
const DECISION = Object.freeze({ pending: 0, sent: 1, silent: 2, rawBacklog: 3,
    noSocket: 4, closed: 5, fallback: 6, sendError: 7 });
const CAPACITY = 6000; // 100 seconds at 60 Hz, about 1.1 MiB
const COOLDOWN_MS = 30000;
function packetSlot(state, data) {
    if (!Buffer.isBuffer(data)) return -1;
    const serial = state.packets.get(data);
    return serial === undefined || state.count - serial > CAPACITY ? -1 : (serial % CAPACITY) * COLUMNS.length;
}

class NetDiagnostic {
    constructor(enabled = process.env.AR_NET_DIAG === '1', options = {}) {
        this.enabled = enabled;
        this.allowedUserId = options.allowedUserId === undefined ? process.env.AR_NET_DIAG_USER_ID : options.allowedUserId;
        this.isAuthorized = options.isAuthorized || (() => false);
        this.exportDir = options.exportDir || process.env.AR_NET_DIAG_DIR || path.join(os.tmpdir(), `arena-netdiag-${typeof process.getuid === 'function' ? process.getuid() : 'local'}`);
        this.active = null;
        this.worker = null;
        this.pending = new Map();
        this.lastError = null;
    }

    fail(error) {
        try {
            this.lastError = error;
            for (const pending of this.pending.values()) clearTimeout(pending.timeout);
            this.pending.clear();
            const state = this.active;
            if (state) this.release(state.socket);
            this.closeWorkerIfIdle();
        } catch (cleanupError) { this.lastError = cleanupError; this.active = null; }
    }

    closeWorkerIfIdle() {
        try {
            if (this.active || this.pending.size || !this.worker) return;
            const worker = this.worker;
            this.worker = null;
            worker.terminate().catch(error => { this.lastError = error; });
        } catch (error) { this.lastError = error; }
    }

    ensureWorker() {
        if (this.worker) return true;
        if (!path.isAbsolute(this.exportDir)) throw new Error('diagnostic export directory must be absolute');
        const dir = path.resolve(this.exportDir), publicDir = path.resolve(__dirname, '..', 'public');
        const compare = value => process.platform === 'win32' ? value.toLowerCase() : value;
        if (compare(dir) === compare(publicDir) || compare(dir).startsWith(compare(publicDir + path.sep)))
            throw new Error('diagnostic export directory is public');
        const worker = new Worker(path.join(__dirname, 'net-diagnostic-export-worker.js'));
        worker.on('message', result => {
            try {
                const pending = this.pending.get(result.id);
                if (pending) clearTimeout(pending.timeout);
                this.pending.delete(result.id);
                if (pending && this.active === pending.state)
                    pending.state.socket.emit(result.ok ? 'netdiag-export-ready' : 'netdiag-export-failed', result);
                this.closeWorkerIfIdle();
            } catch (error) { this.fail(error); }
        });
        worker.on('error', error => { if (this.worker !== worker) return; this.worker = null; this.fail(error); });
        worker.on('exit', code => { if (this.worker !== worker) return; this.worker = null; if (code) this.fail(new Error(`diagnostic worker exit ${code}`)); });
        worker.unref();
        this.worker = worker;
        return true;
    }

    claim(socket, roomCode) {
        try { return this._claim(socket, roomCode); }
        catch (error) { this.fail(error); return null; }
    }

    _claim(socket, roomCode) {
        if (!this.enabled || !this.allowedUserId || !this.isAuthorized(socket, this.allowedUserId) || this.active || !roomCode) return null;
        const conn = socket.client && socket.client.conn;
        const transport = conn && conn.transport;
        if (!conn || !transport || transport.name !== 'websocket') return null;
        try { this.ensureWorker(); } catch (error) { this.fail(error); return null; }
        const session = randomBytes(8).toString('hex');
        const state = {
            socket, socketId: socket.id, roomCode, session, conn, transport,
            rows: new Float64Array(CAPACITY * COLUMNS.length), count: 0,
            packets: new WeakMap(), batch: new Int32Array(CAPACITY), batchCount: 0,
            lastIncident: -Infinity, reportTimer: null, incidentTick: 0,
            events: new Float64Array(3 * 300), eventCount: 0, lagTimer: null, gcObserver: null,
        };
        state.recordEvent = (at, duration, type) => { try {
            const base = (state.eventCount++ % 300) * 3;
            state.events[base] = at;
            state.events[base + 1] = duration;
            state.events[base + 2] = type; // 1: event loop timer late, 2: GC
        } catch (error) { this.fail(error); } };
        state.onPacket = packet => { try {
            const slot = packetSlot(state, packet.data);
            if (slot >= 0) this.mark(slot, COL.packetCreate, performance.now());
        } catch (error) { this.fail(error); } };
        state.onFlush = packets => { try {
            const at = performance.now();
            state.batchCount = 0;
            for (const packet of packets) {
                const slot = packetSlot(state, packet.data);
                if (slot < 0 || state.batchCount === CAPACITY) continue;
                this.mark(slot, COL.flush, at);
                state.batch[state.batchCount++] = slot;
                const queuedAt = state.rows[slot + COL.packetCreate];
                if (queuedAt > 0 && at - queuedAt > 50)
                    this.incident(state.socket, state.rows[slot + COL.tick], 'engine-queued');
            }
        } catch (error) { this.fail(error); } };
        state.onTransportDrain = () => { try {
            const at = performance.now();
            for (let i = 0; i < state.batchCount; i++) {
                const slot = state.batch[i];
                this.mark(slot, COL.transportDrain, at);
                const flushedAt = state.rows[slot + COL.flush];
                if (flushedAt > 0 && at - flushedAt > 50)
                    this.incident(state.socket, state.rows[slot + COL.tick], 'transport-drain');
            }
            state.batchCount = 0;
        } catch (error) { this.fail(error); } };
        this.active = state;
        try {
        conn.on('packetCreate', state.onPacket);
        conn.on('flush', state.onFlush);
        transport.on('drain', state.onTransportDrain);
        let lastBeat = performance.now();
        state.lagTimer = setInterval(() => { try {
            const at = performance.now(), late = at - lastBeat - 25;
            lastBeat = at;
            if (late >= 15) state.recordEvent(at - late, late, 1);
        } catch (error) { this.fail(error); } }, 25);
        try {
            state.gcObserver = new PerformanceObserver(list => { try {
                for (const entry of list.getEntries()) state.recordEvent(entry.startTime, entry.duration, 2);
            } catch (error) { this.fail(error); } });
            state.gcObserver.observe({ entryTypes: ['gc'] });
        } catch (_) { state.gcObserver = null; }
        return session;
        } catch (error) { this.fail(error); return null; }
    }

    release(socket) {
        try {
        const state = this.active;
        if (!state || state.socket !== socket) return;
        this.active = null;
        for (const cleanup of [
            () => clearTimeout(state.reportTimer), () => clearInterval(state.lagTimer),
            () => state.gcObserver && state.gcObserver.disconnect(),
            () => state.conn.off('packetCreate', state.onPacket),
            () => state.conn.off('flush', state.onFlush),
            () => state.transport.off('drain', state.onTransportDrain),
        ]) { try { cleanup(); } catch (error) { this.lastError = error; } }
        this.closeWorkerIfIdle();
        } catch (error) { this.lastError = error; this.active = null; }
    }

    forRoom(roomCode) {
        try {
            const state = this.active;
            return state && state.roomCode === roomCode ? state : null;
        } catch (error) { this.fail(error); return null; }
    }

    begin(state, tick, due, start, late) {
        if (!state || state !== this.active) return -1;
        const slot = (state.count++ % CAPACITY) * COLUMNS.length;
        state.rows.fill(-1, slot, slot + COLUMNS.length);
        state.rows[slot + COL.tick] = tick;
        state.rows[slot + COL.due] = due;
        state.rows[slot + COL.start] = start;
        state.rows[slot + COL.loopDelay] = late;
        state.rows[slot + COL.decision] = DECISION.pending;
        if (late > 50) this.incident(state.socket, tick, 'server-tick');
        return slot;
    }

    mark(slot, column, value) {
        if (slot >= 0 && this.active) this.active.rows[slot + column] = value;
    }

    decision(slot, reason, inputAge) {
        this.mark(slot, COL.decision, DECISION[reason]);
        if (inputAge !== undefined) this.mark(slot, COL.inputAge, inputAge);
    }

    beforeWrite(slot, buf, ownStart, ownEncodeEnd, ownEnd, conn) {
        const state = this.active;
        if (!state || slot < 0) return;
        state.packets.set(buf, state.count - 1);
        this.mark(slot, COL.ownStart, ownStart);
        this.mark(slot, COL.ownEncodeEnd, ownEncodeEnd);
        this.mark(slot, COL.ownEnd, ownEnd);
        this.mark(slot, COL.bytes, buf.length);
        this.mark(slot, COL.writeStart, performance.now());
        this.sample(slot, conn, false);
    }

    afterWrite(slot, conn) {
        this.mark(slot, COL.writeEnd, performance.now());
        this.sample(slot, conn, true);
        this.decision(slot, 'sent');
        const state = this.active;
        if (state && slot >= 0 && state.rows[slot + COL.writeEnd] - state.rows[slot + COL.writeStart] > 50)
            this.incident(state.socket, state.rows[slot + COL.tick], 'server-write');
    }

    sample(slot, conn, after) {
        const engine = conn.conn, transport = engine.transport;
        const ws = transport && transport.socket, raw = ws && ws._socket;
        this.mark(slot, after ? COL.rawAfter : COL.rawBefore, raw ? raw.writableLength : -1);
        this.mark(slot, after ? COL.engineAfter : COL.engineBefore, engine.writeBuffer ? engine.writeBuffer.length : -1);
        this.mark(slot, after ? COL.wsAfter : COL.wsBefore, ws ? ws.bufferedAmount : -1);
        if (!after) this.mark(slot, COL.writableBefore, transport && transport.writable ? 1 : 0);
    }

    // Delay export until the incident has two seconds of aftermath. The game loop only sets a timer.
    incident(socket, tick, reason) {
        const state = this.active, now = performance.now();
        if (!state || state.socket !== socket || this.pending.size || now - state.lastIncident < COOLDOWN_MS) return false;
        state.lastIncident = now;
        state.incidentTick = Number.isInteger(tick) ? tick : 0;
        if (state.reportTimer) clearTimeout(state.reportTimer);
        state.reportTimer = setTimeout(() => { try {
            if (this.active !== state) return;
            state.reportTimer = null;
            const prepStart = performance.now();
            const end = performance.now(), from = end - 8000, selected = [];
            const n = Math.min(state.count, CAPACITY), first = state.count - n;
            for (let i = first; i < state.count; i++) {
                const base = (i % CAPACITY) * COLUMNS.length;
                if (state.rows[base + COL.start] >= from) selected.push(base);
            }
            const rows = new Float64Array(selected.length * COLUMNS.length);
            for (let i = 0; i < selected.length; i++)
                rows.set(state.rows.subarray(selected[i], selected[i] + COLUMNS.length), i * COLUMNS.length);
            const events = new Float64Array(900), eventN = Math.min(state.eventCount, 300), eventFirst = state.eventCount - eventN;
            let eventCount = 0;
            for (let i = eventFirst; i < state.eventCount; i++) {
                const base = (i % 300) * 3;
                if (state.events[base] >= from) events.set(state.events.subarray(base, base + 3), eventCount++ * 3);
            }
            const id = randomBytes(12).toString('hex');
            const timeout = setTimeout(() => { try {
                if (!this.pending.has(id)) return;
                this.pending.delete(id);
                if (this.active === state) socket.emit('netdiag-export-failed',
                    { id, ok: false, session: state.session, incidentTick: state.incidentTick, error: 'EXPORT_TIMEOUT' });
                const worker = this.worker; this.worker = null;
                if (worker) worker.terminate().catch(error => { this.lastError = error; });
            } catch (error) { this.fail(error); } }, 15000);
            timeout.unref();
            this.pending.set(id, { state, timeout });
            this.worker.postMessage({ id, dir: this.exportDir, session: state.session,
                reason, incidentTick: state.incidentTick, wallEnd: new Date().toISOString(),
                serverNow: end, columns: COLUMNS, decisions: DECISION,
                rows, events: events.subarray(0, eventCount * 3) }, [rows.buffer, events.buffer]);
            state.lastExportPrepMs = performance.now() - prepStart;
            socket.emit('netdiag-export-queued', { id, session: state.session,
                incidentTick: state.incidentTick, prepMs: state.lastExportPrepMs });
        } catch (error) { this.fail(error); }
        }, 2000);
        return true;
    }
}

// Diagnostic failures must never escape into a game tick or an Engine.IO callback.
for (const name of ['begin', 'mark', 'decision', 'beforeWrite', 'afterWrite', 'sample', 'incident']) {
    const original = NetDiagnostic.prototype[name];
    NetDiagnostic.prototype[name] = function (...args) {
        try { return original.apply(this, args); }
        catch (error) { try { this.fail(error); } catch (_) { this.active = null; }
            return name === 'begin' ? -1 : name === 'incident' ? false : undefined; }
    };
}

module.exports = { NetDiagnostic, COLUMNS, COL, DECISION };

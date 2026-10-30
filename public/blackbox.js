// ============================================
// Blastridge - blackbox.js
// The lag "black box" of the client. In a match F8 starts it; while it runs it keeps the last 90 seconds of what
// the frames, the packets and the main thread did, in memory (a few typed rings, nothing is sent anywhere), marks
// every spike it sees and says what most likely caused it. F9 saves the last 90 s now and goes on; F8 again saves
// and stops. The report is a small JSON file (arena-blackbox-<date>.json): the summary and the incidents first,
// then the raw series. Off by default; when off, the hooks in game.js cost one boolean check.
//
// Two parts. analyze(rec) is pure (no DOM, no clock): it takes the recorded series and returns the numbers and
// the incidents, so tools/tests/blackbox.test.js runs it in Node. The recorder below it is the browser part:
// hooks called by game.js (frame, packet, csp, ping, event) and the keys, the indicator and the download.
//
// What tells the causes apart:
//   - the main thread: a 25 ms heartbeat timer and the longtask observer say whether the page itself was blocked,
//     and for how long; a late packet while the page was blocked is not the network's fault;
//   - the frame's own cost (js) against the time between frames: a long frame whose JS was short was waited on by
//     something else (GPU, raster, the system);
//   - the packets: a gap that ends in a burst, with every tick present and the page free, needs the server trace
//     to distinguish late emission from buffering after emission; missing ticks need a server skip decision.
// ============================================
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARBlackBox = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const WINDOW_MS = 90000;        // how much is kept
    const BEAT_MS = 25;             // the heartbeat timer
    const STALL_MS = 40;            // a late heartbeat longer than this: the main thread was blocked
    const CSP_BAD_PX = 25;          // a prediction correction this big is an incident
    const CLUSTER_MS = 400;         // signals closer than this are one incident
    const HEAP_DROP_BYTES = 6 * 1048576;   // a drop this big is probably a major GC (a minor one is 1-4 MB)

    // ---------- the numbers ----------
    function pct(sorted, q) {
        if (!sorted.length) return 0;
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    }
    function sortedCol(rows, col) {
        const a = new Array(rows.length);
        for (let i = 0; i < rows.length; i++) a[i] = rows[i][col];
        return a.sort(function (x, y) { return x - y; });
    }
    function r1(v) { return Math.round(v * 10) / 10; }
    function stats(sorted) {
        return { p50: r1(pct(sorted, 0.5)), p95: r1(pct(sorted, 0.95)), p99: r1(pct(sorted, 0.99)), max: r1(sorted.length ? sorted[sorted.length - 1] : 0) };
    }

    const CAUSES = {
        'tab-hidden':  'Tab ascuns sau revenit: comportament normal al browserului, nu e o problemă a jocului.',
        'disconnect':  'Conexiunea cu serverul s-a pierdut (socket închis sau reconectat).',
        'resize':      'Schimbare de fereastră sau de rezoluție internă (se refac sprite-urile și dalele): nu e rețeaua.',
        'frame-cost':  'Cadrul însuși a costat prea mult (JS sau desen): vezi câți zombi, gloanțe și jucători erau în scenă.',
        'main-thread': 'Pagina a fost blocată în afara cadrului (alt script, extensie, GC sau sistemul): nu e rețeaua.',
        'gc':          'Pagina a fost blocată, iar memoria JS a scăzut brusc în același timp: probabil garbage collection.',
        'network':     'Pachetele au sosit în rafală, cu pagina liberă și fără tickuri lipsă; urma serverului arată dacă au fost emise târziu sau reținute ulterior.',
        'server-loop': 'Serverul însuși a fost blocat (event-loop) în același timp cu întârzierea pachetelor: nu e rețeaua ta.',
        'server-ticks': 'Au lipsit tick-uri: serverul nu le-a trimis acestui client (backpressure pe o conexiune lentă, sau server încărcat).',
        'render':      'Cadru lung fără blocare de JS: GPU, raster, compositor sau sistemul (termic, alt proces, vsync).',
        'teleport':    'Server-ul a repoziționat jucătorul (început de val PvE: toți sunt mutați lângă bază): salt vizibil, dar intenționat.',
        'prediction':  'Eroare mare de predicție, fără probleme de rețea sau de cadre: desincronizare client-server.',
        'unknown':     'Cauză neclară din datele disponibile.',
    };

    // ---------- analysis (pure) ----------
    // rec: times in ms from the start of the window.
    //   frames  [t, dt (ms since the previous frame), js (ms the frame's own work took)]
    //   packets [t, tick, gap (ms since the previous packet), tickGap (ticks missing since the previous), players, bullets, zombies]
    //   csp     [t, error in px]   heap [t, bytes]   pings [t, rtt ms]
    //   events  { t, type: 'stall' | 'longtask' (dur) | 'server-stall' (dur, the server's event loop was blocked; t is its start on this clock) | 'visibility' | 'resize' | 'rs-step' | 'wave-start' | 'pve-subwave' | 'pve-wave-break' | 'pve-panel' | 'disconnect' | 'reconnect', dur?, info? }
    function analyze(rec) {
        const frames = rec.frames || [], packets = rec.packets || [], csp = rec.csp || [], heap = rec.heap || [], pings = rec.pings || [], events = rec.events || [];
        const dtS = sortedCol(frames, 1), jsS = sortedCol(frames, 2), gapS = sortedCol(packets.slice(1), 2);
        const pingS = sortedCol(pings.filter(function (p) { return p[1] >= 0; }), 1), cspS = sortedCol(csp, 1);
        const dtMed = pct(dtS, 0.5) || 16.7, gapMed = pct(gapS, 0.5) || 16.7;
        const thrF = Math.max(50, 3 * dtMed), thrG = Math.max(100, 4 * gapMed);
        let tickGaps = 0;
        for (let i = 0; i < packets.length; i++) tickGaps += Math.max(0, packets[i][3]);
        const stalls = events.filter(function (e) { return e.type === 'stall'; }), longtasks = events.filter(function (e) { return e.type === 'longtask'; });
        let heapDrops = 0;
        for (let i = 1; i < heap.length; i++) if (heap[i - 1][1] - heap[i][1] >= HEAP_DROP_BYTES) heapDrops++;
        const seconds = frames.length ? (frames[frames.length - 1][0] - frames[0][0]) / 1000 : 0;
        const summary = {
            seconds: r1(seconds), frames: frames.length, fps: r1(seconds > 0 ? frames.length / seconds : 0),
            frameMs: stats(dtS), frameJsMs: stats(jsS),
            packets: packets.length, packetGapMs: stats(gapS), packetJitterMs: r1(pct(gapS, 0.95) - pct(gapS, 0.5)), missingTicks: tickGaps,
            pingMs: stats(pingS), predictionErrorPx: stats(cspS),
            stalls: stalls.length, worstStallMs: r1(stalls.reduce(function (m, e) { return Math.max(m, e.dur); }, 0)),
            longTasks: longtasks.length, worstLongTaskMs: r1(longtasks.reduce(function (m, e) { return Math.max(m, e.dur); }, 0)),
            bigHeapDrops: heapDrops,
            reconnects: events.filter(function (e) { return e.type === 'reconnect'; }).length,
        };

        // the signals: each says when it began and ended
        const sig = [];
        for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            if (f[1] > thrF) sig.push({ ts: f[0] - f[1], te: f[0], kind: 'frame', dt: f[1], js: f[2] });
        }
        for (let i = 1; i < packets.length; i++) {
            const p = packets[i];
            if (p[2] > thrG) sig.push({ ts: p[0] - p[2], te: p[0], kind: 'gap', gap: p[2], tickGap: p[3], idx: i });
            else if (p[3] >= 3) sig.push({ ts: p[0] - p[2], te: p[0], kind: 'gap', gap: p[2], tickGap: p[3], idx: i });
        }
        for (let i = 0; i < stalls.length; i++) sig.push({ ts: stalls[i].t, te: stalls[i].t + stalls[i].dur, kind: 'block', dur: stalls[i].dur });
        for (let i = 0; i < longtasks.length; i++) sig.push({ ts: longtasks[i].t, te: longtasks[i].t + longtasks[i].dur, kind: 'block', dur: longtasks[i].dur });
        for (let i = 0; i < csp.length; i++) if (csp[i][1] > CSP_BAD_PX) sig.push({ ts: csp[i][0], te: csp[i][0], kind: 'csp', err: csp[i][1] });
        sig.sort(function (a, b) { return a.ts - b.ts; });

        const clusters = [];
        for (let i = 0; i < sig.length; i++) {
            const s = sig[i], c = clusters[clusters.length - 1];
            if (c && s.ts <= c.te + CLUSTER_MS) { c.sig.push(s); if (s.te > c.te) c.te = s.te; }
            else clusters.push({ ts: s.ts, te: s.te, sig: [s] });
        }
        const baselinePing = pct(pingS, 0.5);
        const incidents = clusters.map(function (c) {
            const e = { frameMs: 0, frameJsMs: 0, jsMaxMs: 0, gapMs: 0, missingTicks: 0, blockedMs: 0, predictionErrorPx: 0 };
            let burst = 0, gapEnd = -1;
            for (let i = 0; i < c.sig.length; i++) {
                const s = c.sig[i];
                if (s.kind === 'frame') { if (s.dt > e.frameMs) { e.frameMs = s.dt; e.frameJsMs = s.js; } if (s.js > e.jsMaxMs) e.jsMaxMs = s.js; }
                else if (s.kind === 'gap') { if (s.gap > e.gapMs) { e.gapMs = s.gap; gapEnd = s.idx; } if (s.tickGap > e.missingTicks) e.missingTicks = s.tickGap; }
                else if (s.kind === 'block') e.blockedMs = Math.max(e.blockedMs, s.dur);
                else if (s.kind === 'csp') e.predictionErrorPx = Math.max(e.predictionErrorPx, s.err);
            }
            // a gap that ends in a burst: the packets behind it came within a few ms of each other
            if (gapEnd > 0) { for (let k = gapEnd; k < packets.length && packets[k][0] - packets[gapEnd][0] <= 12; k++) burst++; }
            // frames in the cluster whose own work was long (not only the worst-dt one)
            for (let i = 0; i < frames.length; i++) if (frames[i][0] >= c.ts && frames[i][0] <= c.te + 50 && frames[i][2] > e.jsMaxMs) e.jsMaxMs = frames[i][2];
            // what else happened around it
            const near = events.filter(function (v) { return v.t >= c.ts - 600 && v.t <= c.te + 600; });
            const has = function (type) { return near.some(function (v) { return v.type === type; }); };
            // PvE things that happened right around it (a wave starting, reinforcements, the break and its panel), so a stutter at one of those shows
            const pveNear = []; near.forEach(function (v) { if (/^(wave-start|pve-)/.test(v.type) && pveNear.indexOf(v.type) < 0) pveNear.push(v.type); });
            const rsStepJustBefore = events.some(function (v) { return v.type === 'rs-step' && v.t >= c.ts - 300 && v.t <= c.ts + 300; });
            let heapDrop = 0;
            for (let i = 1; i < heap.length; i++) if (heap[i][0] >= c.ts - 400 && heap[i][0] <= c.te + 400) heapDrop = Math.max(heapDrop, heap[i - 1][1] - heap[i][1]);
            let pingMax = -1;
            for (let i = 0; i < pings.length; i++) if (pings[i][0] >= c.ts - 2500 && pings[i][0] <= c.te + 2500 && pings[i][1] > pingMax) pingMax = pings[i][1];
            // the size of the scene at that moment
            const counts = (rec.counts || []).filter(function (r) { return r[0] >= c.ts - 1500 && r[0] <= c.te + 500; });
            const scene = counts.length ? { zombies: counts[counts.length - 1][1], bullets: counts[counts.length - 1][2], players: counts[counts.length - 1][3] } : null;

            // a stall the server itself reported (its event loop blocked), overlapping the window of the incident
            let srvStall = 0;
            for (let i = 0; i < events.length; i++) { const v = events[i]; if (v.type === 'server-stall' && v.t <= c.te + 150 && v.t + v.dur >= c.ts - 150 && v.dur > srvStall) srvStall = v.dur; }
            const blocked = e.blockedMs, thrBlock = STALL_MS;
            let id, conf = 'medie';
            if (has('visibility')) { id = 'tab-hidden'; conf = 'mare'; }
            else if (has('disconnect') || has('reconnect')) { id = 'disconnect'; conf = 'mare'; }
            else if (has('resize') || rsStepJustBefore) { id = 'resize'; conf = 'mare'; }
            else if (e.jsMaxMs >= 40 && (blocked < thrBlock || e.jsMaxMs >= 0.6 * blocked)) { id = 'frame-cost'; conf = 'mare'; }
            else if (srvStall >= 15 && blocked < thrBlock && (e.missingTicks >= 3 || e.gapMs >= thrG)) { id = 'server-loop'; conf = 'mare'; }
            else if (e.missingTicks >= 3 && blocked < thrBlock) { id = 'server-ticks'; conf = e.missingTicks >= 6 ? 'mare' : 'medie'; }
            else if (blocked >= thrBlock) { id = heapDrop >= HEAP_DROP_BYTES ? 'gc' : 'main-thread'; conf = heapDrop >= HEAP_DROP_BYTES ? 'medie' : 'mare'; }
            else if (e.gapMs >= thrG) { id = 'network'; conf = (burst >= 3 && (pingMax < 0 || pingMax > 1.5 * baselinePing + 20)) || burst >= 3 ? 'mare' : 'medie'; }
            else if (e.frameMs >= thrF) { id = 'render'; conf = e.frameJsMs < 0.25 * e.frameMs ? 'mare' : 'medie'; }
            else if (e.predictionErrorPx > CSP_BAD_PX && has('wave-start')) { id = 'teleport'; conf = 'mare'; }
            else if (e.predictionErrorPx > CSP_BAD_PX) { id = 'prediction'; conf = 'medie'; }
            else { id = 'unknown'; conf = 'mică'; }

            return {
                startMs: r1(c.ts), endMs: r1(c.te), durationMs: r1(c.te - c.ts),
                causeId: id, cause: CAUSES[id], confidence: conf,
                evidence: {
                    frameMs: r1(e.frameMs), frameJsMs: r1(e.frameJsMs), worstJsMs: r1(e.jsMaxMs),
                    packetGapMs: r1(e.gapMs), packetsInBurstAfter: burst, missingTicks: e.missingTicks,
                    nearEvents: pveNear, serverStallMs: srvStall, mainThreadBlockedMs: r1(blocked), heapDropMB: r1(heapDrop / 1048576),
                    pingMsNearby: pingMax, pingBaselineMs: r1(baselinePing), predictionErrorPx: r1(e.predictionErrorPx),
                    tabOrWindowEvent: has('visibility') || has('resize') || rsStepJustBefore, disconnected: has('disconnect') || has('reconnect'),
                },
                scene: scene,
            };
        });

        const byCause = {};
        for (let i = 0; i < incidents.length; i++) byCause[incidents[i].causeId] = (byCause[incidents[i].causeId] || 0) + 1;
        const real = Object.keys(byCause).filter(function (k) { return k !== 'tab-hidden' && k !== 'unknown'; }).sort(function (a, b) { return byCause[b] - byCause[a]; });
        summary.incidentsNearPveEvents = incidents.filter(function (i) { return i.evidence.nearEvents.length > 0; }).length;
        summary.incidents = incidents.length;
        summary.byCause = byCause;
        summary.verdict = !incidents.length ? 'Niciun incident în fereastra înregistrată: cadrele și pachetele au fost regulate.'
            : real.length ? 'Cauza cea mai frecventă: ' + CAUSES[real[0]] : CAUSES.unknown;
        return { summary: summary, incidents: incidents, thresholds: { frameSpikeMs: r1(thrF), packetGapMs: r1(thrG), stallMs: STALL_MS, predictionErrorPx: CSP_BAD_PX } };
    }

    const api = { on: false, netActive: false, analyze: analyze, CAUSES: CAUSES, WINDOW_MS: WINDOW_MS };
    if (typeof window === 'undefined' || typeof document === 'undefined') return api;

    // ---------- the recorder (browser) ----------
    // A ring of fixed rows (Float64Array): pushing is a few stores, nothing is allocated while it runs.
    function Ring(cols, cap) { this.cols = cols; this.cap = cap; this.a = new Float64Array(cols * cap); this.n = 0; this.i = 0; }
    Ring.prototype.push = function (a, b, c, d, e, f, g) {
        const o = this.i * this.cols, x = this.a;
        x[o] = a; if (this.cols > 1) x[o + 1] = b; if (this.cols > 2) x[o + 2] = c; if (this.cols > 3) x[o + 3] = d;
        if (this.cols > 4) { x[o + 4] = e; if (this.cols > 5) { x[o + 5] = f; if (this.cols > 6) x[o + 6] = g; } }
        this.i = (this.i + 1) % this.cap; if (this.n < this.cap) this.n++;
    };
    Ring.prototype.rows = function (from, t0) {   // chronological, times relative to t0, only rows at or after `from`
        const out = [], start = (this.i - this.n + this.cap) % this.cap;
        for (let k = 0; k < this.n; k++) {
            const o = ((start + k) % this.cap) * this.cols, row = new Array(this.cols);
            if (this.a[o] < from) continue;
            for (let c = 0; c < this.cols; c++) row[c] = this.a[o + c];
            row[0] = r1(row[0] - t0);
            out.push(row);
        }
        return out;
    };
    Ring.prototype.clear = function () { this.n = 0; this.i = 0; };

    const frames = new Ring(3, 30000), packets = new Ring(7, 9000), cspR = new Ring(2, 9000), heapR = new Ring(2, 600), pingR = new Ring(2, 200), countsR = new Ring(4, 200);
    let decodeR = null, handlerR = null, interpR = null, clockR = null; // allocated only after F8
    let events = [];
    let hooks = null, startedAt = 0, startedWall = 0, lastFrame = 0, lastPacket = 0, lastTick = -1, lastBeat = 0;
    let netSession = null, serverReport = null, lastIncidentAsk = -Infinity, pendingSave = null, saveTimer = null;
    let gameplayFinished = false;
    let netCaptures = [];
    let netClockTimer = null;
    let beatTimer = 0, heapTimer = 0, countTimer = 0, clockTimer = 0, observer = null, indicator = null;

    function toast(msg) { try { if (typeof root.showToast === 'function') root.showToast(msg); } catch (e) { /* no toast */ } }
    function gameplayActive() { try { return !gameplayFinished && !!(hooks && hooks.isGameplayActive && hooks.isGameplayActive()); } catch (_) { return !gameplayFinished; } }
    function pushEvent(t, type, dur, info) {
        events.push({ t: t, type: type, dur: dur || 0, info: info === undefined ? null : info });
        if (events.length > 1500) events = events.slice(-1000);
    }

    // the hooks game.js calls while api.on is true
    api.frame = function (ts, jsMs) {
        const dt = lastFrame ? ts - lastFrame : 0;
        lastFrame = ts;
        if (dt > 0) frames.push(ts, dt, jsMs);
    };
    api.packet = function (now, tick, nPlayers, nBullets, nZombies) {
        const gap = lastPacket ? now - lastPacket : 0, tg = lastTick >= 0 ? tick - lastTick - 1 : 0;
        lastPacket = now; lastTick = tick;
        packets.push(now, tick, gap, tg, nPlayers, nBullets, nZombies);
        if (netSession && gap > 50 && now - lastIncidentAsk > 30000 && hooks && hooks.socket) {
            lastIncidentAsk = now;
            const activeSession = netSession, activeSocket = hooks.socket;
            setTimeout(function () { try {
                if (api.netActive && netSession === activeSession && hooks && hooks.socket === activeSocket)
                    activeSocket.emit('netdiag-incident', { tick: tick });
            } catch (_) { endNet(); } }, 0);
        }
    };
    api.decode = function (start, end, tick) {
        if (api.netActive && Number.isInteger(tick)) decodeR.push(end, tick, start, end);
    };
    api.handler = function (end, tick, start, bufferLength, pendingInputs, interpDelay) {
        if (!api.netActive) return;
        handlerR.push(end, tick, end - start, bufferLength, pendingInputs, interpDelay);
    };
    api.interp = function (now, tick, age, delay, extrap, bufferLength) {
        if (!api.netActive) return;
        interpR.push(now, tick, age, delay, extrap, bufferLength);
    };
    api.csp = function (now, err) { cspR.push(now, err); };
    // The pong carries the server's wall clock and its recent event-loop stalls. The offset between the two clocks is the one of the
    // quickest round trip lately (NTP-like), good to about half that trip; each stall is placed on this page's clock and recorded once.
    let clk = null; const seenStall = [];
    api.ping = function (now, rtt, srvNow, srvStalls) {
        pingR.push(now, rtt);
        if (typeof srvNow !== 'number' || !(rtt >= 0)) return;
        const off = srvNow - (Date.now() - rtt / 2);
        if (!clk || rtt <= clk.rtt || now - clk.at > 30000) clk = { rtt: rtt, off: off, at: now };
        if (!api.on || !srvStalls || !srvStalls.length) return;
        for (let i = 0; i < srvStalls.length; i++) {
            const endWall = srvStalls[i][0], ms = srvStalls[i][1];
            if (seenStall.indexOf(endWall) >= 0) continue;
            seenStall.push(endWall); if (seenStall.length > 60) seenStall.shift();
            const tEnd = now - (Date.now() - (endWall - clk.off));
            pushEvent(tEnd - ms, 'server-stall', ms);
        }
    };
    api.event = function (type, info) { if (api.on) pushEvent(performance.now(), type, 0, info); };

    function beat() {   // late by more than STALL_MS: the main thread was blocked (the timer could not run)
        const now = performance.now(), late = now - lastBeat - BEAT_MS;
        if (late > STALL_MS && !document.hidden) pushEvent(lastBeat + BEAT_MS, 'stall', late);
        lastBeat = now;
    }
    function sampleHeap() { if (performance.memory) heapR.push(performance.now(), performance.memory.usedJSHeapSize); }
    function sampleCounts() { if (hooks && hooks.counts) { const c = hooks.counts(); countsR.push(performance.now(), c[0], c[1], c[2]); } }
    function onVis() { pushEvent(performance.now(), 'visibility', 0, document.visibilityState); }
    function onResize() { pushEvent(performance.now(), 'resize', 0, [innerWidth, innerHeight]); }
    function endNet() { api.netActive = false; clearInterval(netClockTimer); netClockTimer = null; }
    function onDisc(reason) { try { pushEvent(performance.now(), 'disconnect', 0, String(reason)); endNet(); } catch (_) { endNet(); } }
    function onReconn() { pushEvent(performance.now(), 'reconnect', 0, null); }

    function header() {
        const nav = navigator, c = nav.connection || {};
        const meta = hooks && hooks.meta ? hooks.meta() : {};
        return Object.assign({
            userAgent: nav.userAgent, platform: nav.platform, language: nav.language, cores: nav.hardwareConcurrency, memoryGB: nav.deviceMemory || null,
            devicePixelRatio: root.devicePixelRatio, screen: [screen.width, screen.height], viewport: [innerWidth, innerHeight],
            connection: { type: c.type || null, effectiveType: c.effectiveType || null, rtt: c.rtt === undefined ? null : c.rtt, downlink: c.downlink === undefined ? null : c.downlink, saveData: !!c.saveData },
            build: (document.querySelector('meta[name="ar-build"]') || {}).content || null,
            timezoneOffsetMin: new Date().getTimezoneOffset(),
        }, meta);
    }

    function snapshot(reason) {
        const now = performance.now(), from = Math.max(startedAt, now - WINDOW_MS), t0 = from, wallNow = Date.now();
        const rec = {
            frames: frames.rows(from, t0), packets: packets.rows(from, t0), csp: cspR.rows(from, t0), heap: heapR.rows(from, t0),
            pings: pingR.rows(from, t0), counts: countsR.rows(from, t0),
            events: events.filter(function (e) { return e.t >= from; }).map(function (e) { return { t: r1(e.t - t0), type: e.type, dur: r1(e.dur), info: e.info }; }),
        };
        const analysis = analyze(rec), wallStart = wallNow - (now - t0);
        for (let i = 0; i < analysis.incidents.length; i++) analysis.incidents[i].wallStart = new Date(wallStart + analysis.incidents[i].startMs).toISOString();   // to line up with [LAG] / [SLOW] in arena-error.log
        return {
            format: 'arena-blackbox', version: 1, reason: reason, savedAt: new Date(wallNow).toISOString(),
            window: { seconds: r1((now - t0) / 1000), wallStart: new Date(wallStart).toISOString(), wallEnd: new Date(wallNow).toISOString() },
            header: header(), summary: analysis.summary, thresholds: analysis.thresholds, incidents: analysis.incidents,
            series: { frames: rec.frames, packets: rec.packets, predictionError: rec.csp, heapBytes: rec.heap, pingMs: rec.pings, sceneCounts: rec.counts, events: rec.events },
            netDiagnostic: {
                session: netSession, server: serverReport,
                captures: netCaptures,
                decode: decodeR ? decodeR.rows(from, t0).map(function (row) { row[2] = r1(row[2] - t0); row[3] = r1(row[3] - t0); return row; }) : [],
                handler: handlerR ? handlerR.rows(from, t0) : [],
                interpolation: interpR ? interpR.rows(from, t0) : [], clock: clockR ? clockR.rows(from, 0) : [],
                legend: {
                    decode: '[t ms, tick, decode start ms, decode end ms]',
                    handler: '[t ms, tick, handler duration ms, state buffer length, pending inputs, interpolation delay ms]',
                    interpolation: '[t ms, selected tick, snapshot receive age ms, interpolation delay ms, extrapolating, state buffer length]',
                    clock: '[client send performance.now ms, server receive performance.now ms, server send performance.now ms, client receive performance.now ms, corrected RTT ms, server minus client offset estimate ms, uncertainty at least RTT/2 ms]',
                },
            },
            legend: {
                frames: '[t ms, ms since the previous frame, ms the frame\'s own work took]', packets: '[t ms, tick, ms since the previous packet, ticks missing, players, bullets, zombies]',
                predictionError: '[t ms, px]', heapBytes: '[t ms, used JS heap]', pingMs: '[t ms, rtt ms]', sceneCounts: '[t ms, zombies, bullets, players]',
            },
        };
    }
    function download(name, text) {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click();
        setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 2000);
    }
    function save(reason) {
        if (!api.on) return null;
        pendingSave = reason;
        scheduleSave();
        return null;
    }
    function flushPendingSave() {
        if (!pendingSave || gameplayActive()) return;
        const reason = pendingSave;
        clearInterval(saveTimer); saveTimer = null;
        try { saveNow(reason); pendingSave = null; }
        catch (_) { if (!saveTimer) saveTimer = setInterval(function () { try { flushPendingSave(); } catch (_) { endNet(); } }, 1000); }
    }
    function scheduleSave() {
        if (!pendingSave) return;
        if (!saveTimer) saveTimer = setInterval(function () { try { flushPendingSave(); } catch (_) { endNet(); } }, 1000);
        setTimeout(function () { try { flushPendingSave(); } catch (_) { endNet(); } }, 0);
    }
    function saveNow(reason) {
        const rep = snapshot(reason), d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
        const name = 'arena-blackbox-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.json';
        root.__arBBLast = rep;
        try { download(name, JSON.stringify(rep)); } catch (e) { /* downloads blocked: the report stays in window.__arBBLast */ }
        const n = rep.incidents.length;
        toast('Black box salvat: ' + name + ' (' + n + (n === 1 ? ' incident)' : ' incidente)'));
        return rep;
    }

    function showIndicator() {
        if (indicator) return;
        indicator = document.createElement('div');
        indicator.className = 'bb-rec'; indicator.setAttribute('role', 'status');
        document.body.appendChild(indicator);
        paintIndicator();
        clockTimer = setInterval(function () { try { paintIndicator(); } catch (_) { endNet(); } }, 1000);
    }
    function paintIndicator() {
        if (!indicator) return;
        const s = Math.floor((performance.now() - startedAt) / 1000);
        indicator.innerHTML = '<i class="bb-dot"></i><b>BLACK BOX</b> ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + ' <span>F9 salvează · F8 oprește</span>';
    }
    function hideIndicator() { clearInterval(clockTimer); if (indicator) { indicator.remove(); indicator = null; } }

    api.start = function () {
        if (api.on || !hooks || pendingSave) return false;
        frames.clear(); packets.clear(); cspR.clear(); heapR.clear(); pingR.clear(); countsR.clear();
        decodeR = null; handlerR = null; interpR = null; clockR = null;
        events = [];
        netSession = null; serverReport = null; netCaptures = []; lastIncidentAsk = -Infinity;
        api.netActive = false;
        lastFrame = 0; lastPacket = 0; lastTick = -1;
        startedAt = performance.now(); startedWall = Date.now(); lastBeat = startedAt;
        api.on = true;
        if (hooks.socket) try { hooks.socket.emit('netdiag-start'); } catch (_) {}
        beatTimer = setInterval(function () { try { beat(); } catch (_) { endNet(); } }, BEAT_MS);
        heapTimer = setInterval(function () { try { sampleHeap(); } catch (_) { endNet(); } }, 250);
        countTimer = setInterval(function () { try { sampleCounts(); } catch (_) { endNet(); } }, 1000);
        try { observer = new PerformanceObserver(function (list) { try { list.getEntries().forEach(function (e) { pushEvent(e.startTime, 'longtask', e.duration); }); } catch (_) { endNet(); } }); observer.observe({ entryTypes: ['longtask'] }); } catch (e) { observer = null; }
        document.addEventListener('visibilitychange', onVis); window.addEventListener('resize', onResize);
        showIndicator();
        toast('Black box pornit. F9 salvează acum, F8 oprește și salvează.');
        return true;
    };
    api.stop = function (saveReport) {
        if (!api.on) return null;
        let rep = null;
        try { if (saveReport) rep = save('stop'); } catch (_) {}
        if (hooks && hooks.socket && netSession) try { hooks.socket.emit('netdiag-stop'); } catch (_) {}
        endNet();
        api.on = false;
        clearInterval(beatTimer); clearInterval(heapTimer); clearInterval(countTimer);
        if (observer) { try { observer.disconnect(); } catch (_) {} observer = null; }
        try { document.removeEventListener('visibilitychange', onVis); } catch (_) {}
        try { window.removeEventListener('resize', onResize); } catch (_) {}
        try { hideIndicator(); } catch (_) {}
        return rep;
    };
    api.save = function (reason) { try { return save(reason || 'manual'); } catch (_) { endNet(); return null; } };
    api.report = function () { try { return api.on && !gameplayActive() ? snapshot('api') : null; } catch (_) { endNet(); return null; } };
    api.gameplayEnded = function () { gameplayFinished = true; scheduleSave(); };
    api.hasPendingSave = function () { return !!pendingSave; };
    api.whenSaved = function (timeoutMs) {
        if (!pendingSave) return Promise.resolve();
        return new Promise(function (resolve) {
            let poll, deadline;
            function done() { clearInterval(poll); clearTimeout(deadline); resolve(); }
            poll = setInterval(function () { if (!pendingSave) done(); }, 20);
            deadline = setTimeout(done, timeoutMs || 2000);
        });
    };

    function onNetReady(data) {
        if (!api.on || !data || typeof data.session !== 'string') return;
        netSession = data.session;
        decodeR = new Ring(4, 9000); handlerR = new Ring(6, 9000);
        interpR = new Ring(6, 12000); clockR = new Ring(7, 200);
        api.netActive = true;
        clearInterval(netClockTimer);
        const ping = function () { try { if (api.netActive && hooks && hooks.socket) hooks.socket.emit('netdiag-ping', performance.now()); } catch (_) { endNet(); } };
        ping();
        netClockTimer = setInterval(ping, 2000);
    }
    function onNetPong(clientSend, serverReceive, serverSend) {
        if (!api.on || !netSession) return;
        const clientReceive = performance.now();
        const correctedRtt = (clientReceive - clientSend) - (serverSend - serverReceive);
        if (!Number.isFinite(correctedRtt) || correctedRtt < 0) return;
        const offset = ((serverReceive - clientSend) + (serverSend - clientReceive)) / 2;
        clockR.push(clientSend, serverReceive, serverSend, clientReceive, correctedRtt, offset, correctedRtt / 2);
    }
    function onNetReport(data) {
        if (!api.on || !data || data.session !== netSession) return;
        serverReport = data;
        if (data.ok) {
            // Keep a small incident window while the long report is deferred until match end.
            setTimeout(function () { try {
                if (!api.on || netSession !== data.session) return;
                const from = performance.now() - 8000;
                netCaptures.push({ id: data.id, incidentTick: data.incidentTick,
                    packets: packets.rows(from, startedAt),
                    decode: decodeR ? decodeR.rows(from, startedAt) : [],
                    handler: handlerR ? handlerR.rows(from, startedAt) : [],
                    clock: clockR ? clockR.rows(from, 0) : [] });
                if (netCaptures.length > 3) netCaptures.shift();
                save('netdiag-incident');
            } catch (_) { endNet(); } }, 50);
        }
    }
    function onNetQueued(data) {
        if (api.on && data && data.session === netSession)
            serverReport = { id: data.id, session: data.session, incidentTick: data.incidentTick, status: 'queued' };
    }
    function onNetEnded(data) { if (data && data.session === netSession) { endNet(); scheduleSave(); } }

    function onKey(e) {
        if (e.repeat) return;
        if (e.key === 'F8') { e.preventDefault(); if (api.on) api.stop(true); else api.start(); }
        else if (e.key === 'F9') { e.preventDefault(); if (api.on) save('F9'); else toast('Pornește black box-ul cu F8, apoi F9 salvează.'); }
    }
    function safeCallback(fn) { return function () { try { return fn.apply(null, arguments); } catch (_) { endNet(); } }; }
    const safeReady = safeCallback(onNetReady), safePong = safeCallback(onNetPong);
    const safeReport = safeCallback(onNetReport), safeQueued = safeCallback(onNetQueued), safeEnded = safeCallback(onNetEnded);
    const safeKey = safeCallback(onKey), safeReconn = safeCallback(onReconn);
    // game.js: attach({ socket, meta(): extra header fields, counts(): [zombies, bullets, players] }) when a match starts
    api.attach = function (h) {
        api.detach();
        hooks = h;
        gameplayFinished = false;
        window.addEventListener('keydown', safeKey);
        if (h.socket) {
            h.socket.on('disconnect', onDisc);
            h.socket.on('netdiag-ready', safeReady);
            h.socket.on('netdiag-pong', safePong);
            h.socket.on('netdiag-export-ready', safeReport);
            h.socket.on('netdiag-export-failed', safeReport);
            h.socket.on('netdiag-export-queued', safeQueued);
            h.socket.on('netdiag-ended', safeEnded);
            if (h.socket.io) h.socket.io.on('reconnect', safeReconn);
        }
    };
    api.detach = function () {   // the match is over: save what there is and stop
        gameplayFinished = true;
        window.removeEventListener('keydown', safeKey);
        if (api.on) api.stop(true);
        if (hooks && hooks.socket) { try {
            hooks.socket.off('disconnect', onDisc);
            hooks.socket.off('netdiag-ready', safeReady);
            hooks.socket.off('netdiag-pong', safePong);
            hooks.socket.off('netdiag-export-ready', safeReport);
            hooks.socket.off('netdiag-export-failed', safeReport);
            hooks.socket.off('netdiag-export-queued', safeQueued);
            hooks.socket.off('netdiag-ended', safeEnded);
            if (hooks.socket.io) hooks.socket.io.off('reconnect', safeReconn);
        } catch (e) { /* socket gone */ } }
        hooks = null;
        scheduleSave();
    };
    for (const name of ['frame', 'packet', 'decode', 'handler', 'interp', 'csp', 'ping', 'event']) {
        const original = api[name];
        api[name] = function () { try { return original.apply(api, arguments); } catch (_) { endNet(); return undefined; } };
    }
    return api;
});

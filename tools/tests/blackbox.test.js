// node --test tools/tests/blackbox.test.js
// The black box's analysis (public/blackbox.js analyze): from the recorded series to the incidents and their most
// likely cause. The series here are made up: a clean 20 s at 60 fps / 60 packets per second, and one thing wrong at a time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../../public/blackbox.js');

const SECS = 20, MS = 1000 / 60;
// a clean recording: frames and packets every 16.7 ms, a ping every 2 s, the scene counts every second
function clean() {
    const frames = [], packets = [], pings = [], counts = [], heap = [], csp = [];
    for (let i = 1; i < SECS * 60; i++) frames.push([i * MS, MS, 2]);
    for (let i = 0; i < SECS * 60; i++) packets.push([i * MS, i, i ? MS : 0, 0, 3, 5, 8]);
    for (let s = 1; s < SECS; s += 2) pings.push([s * 1000, 30]);
    for (let s = 1; s < SECS; s++) counts.push([s * 1000, 8, 5, 3]);
    for (let t = 0; t < SECS * 1000; t += 250) heap.push([t, 40e6 + (t % 3000) * 1000]);
    for (let i = 0; i < SECS * 60; i += 3) csp.push([i * MS, 0.4]);
    return { frames, packets, pings, counts, heap, csp, events: [] };
}
const at = (rec, t) => rec.frames.findIndex(f => f[0] >= t);
const pidx = (rec, t) => rec.packets.findIndex(p => p[0] >= t);
// frame spike: the frame at t took `dt` ms between frames and `js` ms of work
function frameSpike(rec, t, dt, js) { const i = at(rec, t); rec.frames[i][1] = dt; rec.frames[i][2] = js; return rec; }
// packets held back for `gap` ms from t, then delivered together (a burst), every tick present
function packetBurst(rec, t, gap, n = 6) {
    const i = pidx(rec, t), keep = rec.packets.slice(0, i), tick0 = rec.packets[i][1], t1 = t + gap;
    for (let k = 0; k < n; k++) keep.push([t1 + k * 1.5, tick0 + k, k ? 1.5 : gap, 0, 3, 5, 8]);
    let tick = tick0 + n, tt = t1 + n * 1.5;
    while (tt < SECS * 1000) { keep.push([tt, tick, MS, 0, 3, 5, 8]); tick++; tt += MS; }
    rec.packets = keep; return rec;
}
const causeOf = r => r.incidents.map(i => i.causeId);

test('a clean recording has no incident and says so', () => {
    const r = analyze(clean());
    assert.equal(r.incidents.length, 0);
    assert.match(r.summary.verdict, /Niciun incident/);
    assert.ok(Math.abs(r.summary.fps - 60) < 1.5, 'fps ' + r.summary.fps);
    assert.equal(r.summary.missingTicks, 0);
    assert.equal(r.summary.pingMs.p50, 30);
});

test('a frame whose own work was long: the frame cost', () => {
    const rec = frameSpike(clean(), 10000, 95, 90);
    rec.events.push({ t: 10000, type: 'stall', dur: 80 });   // the timer was late too, because the frame held the thread
    const r = analyze(rec);
    assert.deepEqual(causeOf(r), ['frame-cost']);
    assert.equal(r.incidents[0].confidence, 'mare');
});

test('a long frame whose work was short and the thread free: render / GPU / system', () => {
    const r = analyze(frameSpike(clean(), 10000, 95, 3));
    assert.deepEqual(causeOf(r), ['render']);
});

test('the page blocked outside the frame: a late burst of packets is not the network', () => {
    const rec = frameSpike(packetBurst(clean(), 10000, 160), 10160, 160, 2);
    rec.events.push({ t: 10000, type: 'stall', dur: 150 });
    const r = analyze(rec);
    assert.deepEqual(causeOf(r), ['main-thread']);
    assert.equal(r.incidents[0].evidence.packetGapMs > 100, true, 'the gap is seen, but not blamed on the network');
});

test('the same block with a big drop of the JS heap: probably the garbage collector', () => {
    const rec = frameSpike(packetBurst(clean(), 10000, 160), 10160, 160, 2);
    rec.events.push({ t: 10000, type: 'longtask', dur: 150 });
    const i = rec.heap.findIndex(h => h[0] >= 10000);
    rec.heap[i][1] = rec.heap[i - 1][1] - 12e6;
    assert.deepEqual(causeOf(analyze(rec)), ['gc']);
});

test('packets held back and then delivered together, the page free and no tick missing: the network', () => {
    const rec = packetBurst(clean(), 10000, 420);
    rec.pings.push([10400, 380]);
    const r = analyze(rec);
    assert.deepEqual(causeOf(r), ['network']);
    assert.equal(r.incidents[0].confidence, 'mare');
    assert.ok(r.incidents[0].evidence.packetsInBurstAfter >= 3);
});

test('missing tick numbers: the server did not send them', () => {
    const rec = clean(), i = pidx(rec, 10000);
    for (let k = i; k < rec.packets.length; k++) rec.packets[k][1] += 9;
    rec.packets[i][3] = 9; rec.packets[i][2] = 160;
    for (let k = i; k < rec.packets.length; k++) rec.packets[k][0] += 144;
    const r = analyze(rec);
    assert.ok(r.incidents.some(x => x.causeId === 'server-ticks'), JSON.stringify(causeOf(r)));
    assert.equal(r.summary.missingTicks, 9);
});

test('a hidden tab, a resize, a disconnect: named as such, not blamed on the game', () => {
    for (const [type, id] of [['visibility', 'tab-hidden'], ['resize', 'resize'], ['rs-step', 'resize'], ['disconnect', 'disconnect']]) {
        const rec = frameSpike(clean(), 10000, 400, 6);
        rec.events.push({ t: 9900, type });
        assert.deepEqual(causeOf(analyze(rec)), [id], type);
    }
});

test('a big prediction error alone is a prediction problem', () => {
    const rec = clean(), i = rec.csp.findIndex(c => c[0] >= 10000);
    rec.csp[i][1] = 70;
    assert.deepEqual(causeOf(analyze(rec)), ['prediction']);
});

test('signals close together are one incident, far apart ones are two', () => {
    const near = frameSpike(frameSpike(clean(), 10000, 95, 90), 10250, 95, 90);
    assert.equal(analyze(near).incidents.length, 1);
    const far = frameSpike(frameSpike(clean(), 6000, 95, 90), 14000, 95, 90);
    assert.equal(analyze(far).incidents.length, 2);
});

test('each incident carries the scene it happened in and the evidence', () => {
    const r = analyze(frameSpike(clean(), 10000, 95, 90));
    const inc = r.incidents[0];
    assert.deepEqual(inc.scene, { zombies: 8, bullets: 5, players: 3 });
    assert.ok(inc.evidence.worstJsMs >= 90);
    assert.ok(inc.startMs < inc.endMs);
});

test('the same late burst, but the server reported its own event loop blocked then: the server, not the network', () => {
    const rec = packetBurst(clean(), 10000, 420);
    rec.pings.push([10400, 380]);
    rec.events.push({ t: 9990, type: 'server-stall', dur: 380 });
    const r = analyze(rec);
    assert.deepEqual(causeOf(r), ['server-loop']);
    assert.equal(r.incidents[0].confidence, 'mare');
    assert.equal(r.incidents[0].evidence.serverStallMs, 380);
});

test('a server stall far from the incident does not take the blame', () => {
    const rec = packetBurst(clean(), 10000, 420);
    rec.events.push({ t: 4000, type: 'server-stall', dur: 380 });
    assert.deepEqual(causeOf(analyze(rec)), ['network']);
});

test('when this page was blocked too, the page is named, with the server stall kept as evidence', () => {
    const rec = frameSpike(packetBurst(clean(), 10000, 160), 10160, 160, 2);
    rec.events.push({ t: 10000, type: 'stall', dur: 150 }, { t: 10010, type: 'server-stall', dur: 120 });
    const r = analyze(rec);
    assert.deepEqual(causeOf(r), ['main-thread']);
    assert.equal(r.incidents[0].evidence.serverStallMs, 120);
});

test('a big prediction error right at the start of a PvE wave is the server moving the player, not a prediction problem', () => {
    const rec = clean(), i = rec.csp.findIndex(c => c[0] >= 10000);
    rec.csp[i][1] = 200;
    rec.events.push({ t: 9990, type: 'wave-start', dur: 0, info: 2 });
    const r = analyze(rec);
    assert.deepEqual(causeOf(r), ['teleport']);
    assert.equal(r.incidents[0].confidence, 'mare');
});

test('a resolution step the game took 800 ms away from a stall does not explain it; one right at it does', () => {
    const far = frameSpike(clean(), 10000, 400, 6);
    far.events.push({ t: 8800, type: 'rs-step', dur: 0, info: 1 });
    assert.notDeepEqual(causeOf(analyze(far)), ['resize']);
    const at = frameSpike(clean(), 10000, 400, 6);
    at.events.push({ t: 9900, type: 'rs-step', dur: 0, info: 1 });
    assert.deepEqual(causeOf(analyze(at)), ['resize']);
});

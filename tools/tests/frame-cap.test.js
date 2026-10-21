// node --test tools/tests/frame-cap.test.js
// public/frame-cap.js: which displays get their frame rate capped, how evenly, and that the measurement is steady.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isCapped, createGate } = require('../../public/frame-cap.js');

// Runs `seconds` of animation frames from a source whose gap is gapFn(i) ms; returns the times of the frames that were drawn
function run(gapFn, seconds, gate) {
    gate = gate || createGate();
    const drawn = []; let t = 1000, i = 0;
    while (t < 1000 + seconds * 1000) { t += gapFn(i++); if (gate.frame(t)) drawn.push(t); }
    return { drawn, gate, frames: i };
}
const fixed = hz => () => 1000 / hz;
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gaps = d => { const g = []; for (let i = 1; i < d.length; i++) g.push(d[i] - d[i - 1]); return g; };
const fps = (r, seconds) => r.drawn.filter(t => t > 1000 + 2000).length / (seconds - 2);   // skip the 2 s of measurement

test('only displays of 200 Hz or more are capped', () => {
    for (const hz of [30, 60, 75, 90, 120, 144, 165, 180]) assert.equal(isCapped(hz), false, hz + ' Hz');
    for (const hz of [200, 240, 360, 480]) assert.equal(isCapped(hz), true, hz + ' Hz');
});

test('a 240 Hz display draws 120 frames a second, evenly (every 2nd)', () => {
    const r = run(fixed(240), 10);
    assert.ok(Math.abs(fps(r, 10) - 120) < 1.5, 'fps ' + fps(r, 10));
    const g = gaps(r.drawn.filter(t => t > 3000));
    assert.ok(g.every(x => Math.abs(x - 1000 / 120) < 0.5), 'gaps ' + Math.min(...g) + '..' + Math.max(...g));
});

test('a 360 Hz display draws 120 frames a second (every 3rd), a 480 Hz one too (every 4th)', () => {
    assert.ok(Math.abs(fps(run(fixed(360), 10), 10) - 120) < 1.5);
    assert.ok(Math.abs(fps(run(fixed(480), 10), 10) - 120) < 1.5);
});

test('displays below 200 Hz draw every frame: 60, 120, 144, 165, 180', () => {
    for (const hz of [60, 120, 144, 165, 180]) {
        const r = run(fixed(hz), 8);
        assert.equal(r.drawn.length, r.frames, hz + ' Hz');
    }
});

test('a 200 Hz display draws every 2nd frame, 100 fps', () => {
    assert.ok(Math.abs(fps(run(fixed(200), 10), 10) - 100) < 1.5);
});

test('jitter in the timestamps changes nothing', () => {
    const r = run(() => 1000 / 240 + (rnd() - 0.5) * 0.8, 10);
    assert.ok(Math.abs(fps(r, 10) - 120) < 3, 'fps ' + fps(r, 10));
    const r2 = run(() => 1000 / 144 + (rnd() - 0.5) * 1.5, 8);
    assert.equal(r2.drawn.length, r2.frames);
});

test('slow frames and pauses do not make a fast display look slow, and the cap holds through them', () => {
    const r = run(i => 1000 / 240 + (i % 7 === 6 ? 30 : 0) + (i % 211 === 210 ? 400 : 0), 12);
    assert.ok(r.gate.capped());
    assert.ok(fps(r, 12) <= 121, 'fps ' + fps(r, 12));
});

test('frames not locked to any display (1-1.5 ms apart) still come out at about 120 a second, never fewer', () => {
    const r = run(() => 1 + rnd() * 0.5, 10);
    assert.ok(fps(r, 10) > 110 && fps(r, 10) < 125, 'fps ' + fps(r, 10));
});

test('it starts uncapped and decides only after a full measurement', () => {
    const g = createGate(); let t = 0;
    for (let i = 0; i < 25; i++) { t += 1000 / 240; assert.equal(g.frame(t), true); }
});

test('moving to a faster display switches the cap on, back to a slower one switches it off', () => {
    const g = createGate(); let t = 0;
    for (let i = 0; i < 300; i++) { t += 1000 / 60; g.frame(t); }
    assert.equal(g.capped(), false);
    for (let i = 0; i < 500; i++) { t += 1000 / 240; g.frame(t); }
    assert.equal(g.capped(), true);
    for (let i = 0; i < 500; i++) { t += 1000 / 60; g.frame(t); }
    assert.equal(g.capped(), false);
});

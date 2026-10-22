// ============================================
// ARENA ROYALE - frame-cap.js
// Draws at most ~120 frames a second on a display faster than that, by skipping frames. The server sends 60 states a
// second and the game interpolates between them, so beyond ~120 the extra frames show next to nothing, but each one is
// a full redraw: at 244 fps (emulated) the main thread was so busy drawing that packets and timers waited (stalls 70/min,
// ping p99 108 ms; capped at 120: 2/min, 18 ms).
// - Only displays of MIN_HZ or more are capped. 144, 165 and 180 Hz do not divide into 120: skipping frames there gives
//   72-90 fps or an uneven cadence, which is worse than drawing every frame.
// - A frame is drawn once TARGET_MS minus half a refresh interval has passed since the last drawn one, so the frames
//   kept are the ones that fall nearest to 8.3 ms apart: every 2nd on 240 Hz, every 3rd on 360 Hz, an even cadence.
//   Being time-based, it cannot feed back on itself if the animation frames are not locked to a display (the drawn rate
//   stays ~120 whatever the frame source does).
// Pure (no DOM): the browser loads it as window.ARFrameCap, tools/tests/frame-cap.test.js requires it.
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARFrameCap = api;
})(this, function () {
    'use strict';

    const TARGET_HZ = 120, MIN_HZ = 200, WINDOW = 90, EVERY = 30;
    const TARGET_MS = 1000 / TARGET_HZ;

    function isCapped(hz) { return hz >= MIN_HZ; }

    // Feed it the timestamp of every animation frame, drawn or not: frame(ts) says whether to draw this one. The refresh
    // interval is the lower quartile of the recent gaps (a slow frame or a pause only makes a gap longer, so the quick ones
    // tell the refresh); capping switches on or off only when two measurements in a row agree.
    function createGate() {
        const ring = new Float64Array(WINDOW);
        let n = 0, at = 0, last = -1, lastDraw = -1e9, since = 0, on = false, cand = false, interval = 1000;
        function quartile() {
            const a = Array.prototype.slice.call(ring, 0, n).sort(function (x, y) { return x - y; });
            return a[Math.floor((n - 1) * 0.25)];
        }
        return {
            frame: function (ts) {
                if (last >= 0) {
                    const d = ts - last;
                    if (d > 0 && d < 100) { ring[at] = d; at = (at + 1) % WINDOW; if (n < WINDOW) n++; }
                }
                last = ts;
                if (++since >= EVERY && n >= EVERY) {
                    since = 0;
                    interval = quartile();
                    const c = isCapped(1000 / interval);
                    if (c === cand) on = c;
                    cand = c;
                }
                if (on && ts - lastDraw < TARGET_MS - interval / 2) return false;
                lastDraw = ts;
                return true;
            },
            capped: function () { return on; },
        };
    }

    return { isCapped: isCapped, createGate: createGate, TARGET_HZ: TARGET_HZ, MIN_HZ: MIN_HZ };
});

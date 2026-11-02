// The loading screen (#ar-loader): a bar of progress over the pitch, shown while the page boots (fonts, the logo and the
// trees and rocks of the backdrop) and while a match is made ready (the map, the zombies, the players' skins and guns, the
// first sprites). Nothing should pop in after it fades out.
//
// ARLoader.begin(opts) -> a session { add(id, weight, label), set(id, 0..1), poll(id, fn), finish() }
//   opts.delay    ms before the screen is shown at all (a load that is over by then never flashes it), default 0
//   opts.timeout  ms after which it is let go whatever is missing (a failed file must not trap the player), default 15000
//   opts.minShow  ms the screen stays up once it is shown, so it does not blink, default 450
//   opts.tips     show a tip under the bar
// add() declares a part of the work with its weight; set() / poll() report how far it is (0..1, never going back); the
// screen goes when every part is 1. The bar eases to the real value, so it moves smoothly and does not jump.
//
// The tracker is pure (and tested in tools/tests/loader.test.js); the rest is the DOM.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(null);
    else root.ARLoader = factory(root);
}(typeof self !== 'undefined' ? self : this, function (win) {
    'use strict';

    // ---------- the pure part ----------
    function createTracker() {
        const tasks = new Map();
        return {
            add(id, weight, label) { if (!tasks.has(id)) tasks.set(id, { w: weight > 0 ? weight : 1, p: 0, label: label || '' }); },
            set(id, p) {
                const t = tasks.get(id);
                if (!t) return;
                const v = p >= 1 ? 1 : p > 0 ? p : 0;
                if (v > t.p) t.p = v;   // never goes back: a bar that moves backwards looks broken
            },
            value() {
                let w = 0, s = 0;
                tasks.forEach(t => { w += t.w; s += t.w * t.p; });
                return w ? s / w : 1;
            },
            done() { for (const t of tasks.values()) if (t.p < 1) return false; return true; },
            // the label of the heaviest part still to do (what the screen says it is doing)
            pending() {
                let best = null;
                tasks.forEach(t => { if (t.p < 1 && (!best || t.w * (1 - t.p) > best.w * (1 - best.p))) best = t; });
                return best ? best.label : '';
            },
            size() { return tasks.size; },
        };
    }
    // The shown value follows the real one without jumping: at least a little, at most a lot, per second
    function ease(shown, target, dt) {
        if (shown >= target) return shown;
        const step = Math.max((target - shown) * Math.min(1, dt * 7), Math.min(target - shown, dt * 0.35));
        return Math.min(target, shown + step);
    }

    const api = { createTracker, ease };
    if (!win) return api;   // node (tests)

    // ---------- the screen ----------
    const TIPS = [
        'Press R to reload. A reload cannot be cancelled.',
        'Stand still next to a barricade and press E to repair or upgrade it.',
        'Turrets only shoot zombies, never players.',
        'Your bullets pass through your own barricades. Zombies do not.',
        'A Health Station heals everyone inside its ring.',
        'Shielded zombies block bullets from the front. Hit them from the side.',
        'Zombies drop coins. Walk over them to pick them up.',
        'Stay inside the zone: it only gets smaller.',
    ];
    const el = () => document.getElementById('ar-loader');
    let cur = null;

    function begin(opts) {
        opts = opts || {};
        if (cur) cur.close(true);
        const root = el(), tr = createTracker();
        const t0 = performance.now(), delay = opts.delay || 0, timeout = opts.timeout || 15000, minShow = opts.minShow === undefined ? 450 : opts.minShow;
        const pollers = new Map();
        let shownAt = 0, shown = 0, last = t0, timer = 0, raf = 0, closed = false, doneAt = 0, forced = false;
        const fill = root && root.querySelector('.ld-fill'), pct = root && root.querySelector('.ld-pct'),
            status = root && root.querySelector('.ld-status'), tip = root && root.querySelector('.ld-tip'), bar = root && root.querySelector('.ld-bar');

        function paint() {
            if (!root) return;
            const v = Math.max(0, Math.min(1, shown));
            if (fill) fill.style.transform = 'scaleX(' + v.toFixed(4) + ')';
            if (pct) pct.textContent = Math.round(v * 100) + '%';
            if (bar) bar.setAttribute('aria-valuenow', String(Math.round(v * 100)));
            if (status) { const l = tr.pending(); if (l) status.textContent = l; else if (tr.done()) status.textContent = 'Ready'; }
        }
        function show() {
            if (shownAt || !root) return;
            shownAt = performance.now();
            if (tip) tip.textContent = opts.tips ? TIPS[Math.floor(Math.random() * TIPS.length)] : '';
            root.classList.toggle('has-tip', !!opts.tips);
            root.classList.remove('is-hidden');
            root.setAttribute('aria-hidden', 'false');
            paint();
        }
        function hide() {
            if (root) { root.classList.add('is-hidden'); root.setAttribute('aria-hidden', 'true'); }
        }
        function close(silent) {
            if (closed) return;
            closed = true; clearInterval(timer); cancelAnimationFrame(raf);
            if (cur === session) cur = null;
            if (!silent) { hide(); if (opts.onDone) opts.onDone(forced); }
        }
        function frame(now) {
            if (closed) return;
            const dt = Math.min(0.1, (now - last) / 1000); last = now;
            const target = tr.done() ? 1 : Math.min(0.97, tr.value());   // the bar reaches 100% only when it is all in
            shown = ease(shown, target, dt);
            if (!shownAt && now - t0 >= delay && !tr.done()) show();
            if (shownAt) paint();
            const ready = tr.done() || forced;
            if (ready) {
                if (!doneAt) doneAt = now;
                // never shown (it was over in time): nothing to hide; shown: let the bar reach the end and stay a moment
                if (!shownAt) return close();
                shown = Math.max(shown, 1); paint();
                if (now - shownAt >= minShow && now - doneAt >= 120) return close();
            }
            raf = requestAnimationFrame(frame);
        }
        function runPollers() {
            pollers.forEach((fn, id) => {
                let v = 0;
                try { v = fn(); } catch (e) { v = 1; console.warn('[loader] ' + id + ':', e && e.message); }
                tr.set(id, v);
                if (v >= 1) pollers.delete(id);
            });
            if (performance.now() - t0 >= timeout && !tr.done()) {
                forced = true;
                console.warn('[loader] timeout, still missing:', tr.pending() || '?');
            }
        }
        const session = {
            add(id, weight, label) { tr.add(id, weight, label); },
            set(id, p) { tr.set(id, p); },
            poll(id, fn) { pollers.set(id, fn); runPollers(); },
            finish() { forced = true; },
            progress() { return tr.value(); },
            done() { return closed || tr.done(); },
            close,
        };
        timer = setInterval(runPollers, 60);
        // the screen is already up (the page boot): keep it, the first frame decides
        if (root && delay === 0 && !root.classList.contains('is-hidden')) { shownAt = t0; if (tip) tip.textContent = opts.tips ? TIPS[Math.floor(Math.random() * TIPS.length)] : ''; }
        raf = requestAnimationFrame(frame);
        cur = session;
        return session;
    }

    // ---------- the page boot: fonts, the logo, the backdrop of trees and rocks ----------
    // The screen is in the HTML (visible from the first paint); game.js reports the backdrop ('field') through boot.
    const boot = begin({ delay: 0, timeout: 10000, minShow: 350 });
    boot.add('fonts', 1, 'Loading fonts');
    boot.add('logo', 1, 'Loading');
    boot.add('field', 4, 'Setting up the pitch');
    boot.poll('fonts', () => {
        if (!document.fonts || !document.fonts.load) return 1;
        if (boot._fonts === undefined) {
            boot._fonts = 0;
            const done = () => { boot._fonts = 1; };
            Promise.all([document.fonts.load('800 1em Sen'), document.fonts.load('600 1em Sen')]).then(done, done);
            setTimeout(done, 3500);   // a blocked font host must not hold the page: the fallback face is used
        }
        return boot._fonts;
    });
    boot.poll('logo', () => {
        const img = document.querySelector('#ar-loader .ld-emblem');
        return !img || (img.complete) ? 1 : 0;
    });
    api.begin = begin;
    api.boot = boot;
    api.current = () => cur;
    return api;
}));

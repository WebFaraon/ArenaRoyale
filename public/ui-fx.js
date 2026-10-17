// ============================================
// ARENA ROYALE - ui-fx.js
// Presentation helpers only: icon markup, canvas icon strokes and
// micro-interactions (number flap, press haptics, state hooks for CSS).
// Nothing in here touches game state, networking or rendering logic.
// ============================================
(function () {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // ---------- icon markup for innerHTML templates ----------
    window.ico = function (name, cls) {
        return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + name + '"/></svg>';
    };

    // ---------- weapon pictograms for canvas (same paths as the SVG sprite) ----------
    const WEAPON_PATHS = {
        pistol:  ['M3 7h17v5h-8.5L10 14.2V19H6.5l.8-7H3z', 'M14 12v2.5'],
        assault: ['M2 10.5h4.5L8 9h8.5l1 1.5H22V13h-8l-1 1.5h-2L10.2 19H7.2L8 14.5H6.5L5 13H2z', 'M19.5 8v2.5'],
        sniper:  ['M2 11.5h5l1-1.5h7.5l.5 1.5H22V13h-6.5l-1 1.5H11l-1 4.5H7l1-4.5H7L5.5 13H2z', 'M9 6.5h6v2.5H9z'],
        shotgun: ['M2 10.5l4-1.5h16v3H12l-1.5 2H9l-.7 4.5H5.3L6.5 14 2 12.5z', 'M13.5 14.5h4'],
        // FAMAS: bullpup body, carry handle along the top, magazine behind the grip, flash hider
        burst:   ['M2 10.5H17.5V11H22V12.5H17.5V13.5H13.5L12.6 18.5H10L10.6 13.5H7.2V17.8H4.2V13.5H2Z', 'M5.5 10.5V7.5H15L17 10.5', 'M20.5 10v3'],
        smg:     ['M3 8.5h13l1 1.5h5v3H11.5l-1 1.5H9V20H6v-6H3z', 'M14 13v3'],
    };
    const _p2d = {};
    window.ARIcons = {
        // Strokes a weapon pictogram centered at (cx, cy) inside a size x size box.
        drawWeapon: function (ctx, id, cx, cy, size, color) {
            const defs = WEAPON_PATHS[id] || WEAPON_PATHS.pistol;
            const paths = _p2d[id] || (_p2d[id] = defs.map(function (d) { return new Path2D(d); }));
            ctx.save();
            ctx.translate(cx - size / 2, cy - size / 2);
            ctx.scale(size / 24, size / 24);
            ctx.strokeStyle = color || '#F2EFE6';
            ctx.lineWidth = 2.2;
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'square';
            for (let i = 0; i < paths.length; i++) ctx.stroke(paths[i]);
            ctx.restore();
        },
    };

    // ---------- device class ----------
    // Phones get the fullscreen gate and forced fullscreen; laptops and tablets get a setting instead.
    const touchCapable = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    window.ARDevice = { isPhone: touchCapable && Math.min(screen.width, screen.height) < 600 };

    // ---------- interface sound ----------
    // Web Audio with decoded buffers: instant start, overlapping plays, works on desktop, Android and iOS/iPadOS.
    // Browsers keep audio locked until a user gesture, so the context is created at load but only resumed (and a
    // silent HTML audio tag played, which lets iOS ignore the ring switch for page audio) on the first touch,
    // click or key press.
    const SFX_BASE = '/assets/soundEffetcs/';
    const SFX = {
        click:  { file: 'ButtonClick.mp3', gain: 0.55 },
        select: { file: 'Select.mp3',      gain: 0.8 },
        start:  { file: 'GameStart.mp3',   gain: 0.9 },
    };
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let actx = null;
    let sfxMuted = false;
    let unlocked = false;
    try { sfxMuted = localStorage.getItem('ar_ui_muted') === '1'; } catch (e) { /* storage may be blocked */ }

    function decode(ctx, data) {
        return new Promise(function (resolve, reject) {
            const p = ctx.decodeAudioData(data, resolve, reject);
            if (p && p.then) p.then(resolve, reject);
        });
    }
    function loadSfx() {
        Object.keys(SFX).forEach(function (k) {
            const s = SFX[k];
            // HTML audio is the fallback when Web Audio or decoding is missing
            s.el = new Audio(SFX_BASE + s.file);
            s.el.preload = 'auto';
            if (!AudioCtx) return;
            fetch(SFX_BASE + s.file)
                .then(function (r) { return r.arrayBuffer(); })
                .then(function (buf) {
                    actx = actx || new AudioCtx();
                    return decode(actx, buf);
                })
                .then(function (audio) { s.buffer = audio; })
                .catch(function () { /* keep the HTML audio fallback */ });
        });
    }
    function unlockAudio() {
        if (unlocked && actx && actx.state === 'running') return;
        try {
            actx = actx || (AudioCtx ? new AudioCtx() : null);
            if (actx && actx.state !== 'running') actx.resume();
            if (actx && !unlocked) {
                const b = actx.createBuffer(1, 1, 22050);
                const src = actx.createBufferSource();
                src.buffer = b; src.connect(actx.destination); src.start(0);
            }
        } catch (e) { /* ignore */ }
        if (!unlocked) {
            unlocked = true;
            try {
                const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
                silent.play().catch(function () {});
            } catch (e) { /* ignore */ }
        }
    }
    function playSfx(name) {
        const s = SFX[name];
        if (!s || sfxMuted) return;
        if (actx && s.buffer && actx.state === 'running') {
            const src = actx.createBufferSource();
            const g = actx.createGain();
            g.gain.value = s.gain;
            src.buffer = s.buffer;
            src.connect(g); g.connect(actx.destination);
            src.start(0);
            return;
        }
        if (s.el) {
            try {
                const el = s.el.cloneNode();
                el.volume = s.gain;
                el.play().catch(function () {});
            } catch (e) { /* ignore */ }
        }
    }
    window.ARSound = {
        play: playSfx,
        setMuted: function (m) { sfxMuted = !!m; },
        isMuted: function () { return sfxMuted; },
    };
    loadSfx();
    ['pointerdown', 'touchend', 'pointerup', 'click', 'keydown'].forEach(function (ev) {
        document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
    });

    // every button press clicks, except the pickers, which have their own sound
    const CLICK_SEL = 'button, a[onclick], [role="button"]';
    const QUIET_SEL = '.cs-select-btn, .weapon-card';
    document.addEventListener('click', function (e) {
        const t = e.target.closest && e.target.closest(CLICK_SEL + ', ' + QUIET_SEL);
        if (!t || t.disabled) return;
        // SELECTEAZA in the character catalog is the only place a character pick sounds 'select';
        // the lobby arrows also switch the character, but they are ordinary buttons
        if (t.matches('.cs-select-btn')) { playSfx('select'); return; }
        if (t.matches(QUIET_SEL)) return;
        playSfx('click');
    }, true);

    // picking a weapon
    ['selectWeapon'].forEach(function (fn) {
        document.addEventListener('DOMContentLoaded', function () {
            const orig = window[fn];
            if (typeof orig !== 'function') return;
            window[fn] = function () {
                playSfx('select');
                return orig.apply(this, arguments);
            };
        });
    });

    // canvas text needs the face loaded before first use
    if (document.fonts && document.fonts.load) {
        ['500 14px Sen', '700 14px Sen', '800 14px Sen'].forEach(function (f) { document.fonts.load(f); });
    }

    function ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    ready(function () {

        // ---------- number flap: re-trigger a CSS roll when a readout changes ----------
        const flapObserver = new MutationObserver(function (records) {
            for (let i = 0; i < records.length; i++) {
                let el = records[i].target;
                if (el.nodeType === 3) el = el.parentNode;
                while (el && !(el.hasAttribute && el.hasAttribute('data-flap'))) el = el.parentNode;
                if (!el) continue;
                const now = el.textContent;
                if (el.__flapText === now) continue;
                const first = el.__flapText === undefined;
                el.__flapText = now;
                if (first || reduceMotion.matches) continue;
                el.classList.remove('flap');
                void el.offsetWidth;
                el.classList.add('flap');
            }
        });
        document.querySelectorAll('[data-flap]').forEach(function (el) {
            el.__flapText = el.textContent;
            flapObserver.observe(el, { childList: true, characterData: true, subtree: true });
        });

        // ---------- result state for the game over board ----------
        const goTitle = document.getElementById('gameover-title');
        const goScreen = document.getElementById('screen-gameover');
        if (goTitle && goScreen) {
            const syncResult = function () {
                const t = goTitle.textContent.toUpperCase();
                const win = /CASTIG|VICTORIE|LOC 1\b/.test(t) && !/INFRANGERE|ELIMINAT/.test(t);
                goScreen.dataset.result = win ? 'win' : 'lose';
            };
            new MutationObserver(syncResult).observe(goTitle, { childList: true, characterData: true, subtree: true });
            syncResult();
        }

        // ---------- match start: the sound belongs to the "GO" frame, when movement unlocks ----------
        const cdNum = document.getElementById('countdown-number');
        if (cdNum) {
            let wasGo = false;
            const syncGo = function () {
                const go = /GO/i.test(cdNum.textContent);
                cdNum.classList.toggle('is-go', go);
                if (go && !wasGo) window.ARSound.play('start');
                wasGo = go;
            };
            new MutationObserver(syncGo).observe(cdNum, { childList: true, characterData: true, subtree: true });
        }

        // ---------- settings: sound and fullscreen ----------
        const settingsEl = document.getElementById('settings-overlay');
        const swSound = document.getElementById('set-sound');
        const soundIc = document.getElementById('set-sound-ic');
        const fsBtn = document.getElementById('set-fs');
        const fsHint = document.getElementById('set-fs-hint');
        let muted = window.ARSound.isMuted();

        function paintSound() {
            if (!swSound) return;
            swSound.setAttribute('aria-checked', muted ? 'false' : 'true');
            const txt = swSound.querySelector('.switch-text');
            if (txt) txt.textContent = muted ? 'OFF' : 'ON';
            const use = soundIc && soundIc.querySelector('use');
            if (use) use.setAttribute('href', muted ? '#volume-x' : '#volume-2');
        }
        if (swSound) {
            swSound.addEventListener('click', function () {
                muted = !muted;
                window.ARSound.setMuted(muted);
                try { localStorage.setItem('ar_ui_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
                paintSound();
                if (!muted) window.ARSound.play('click');
            });
        }
        paintSound();

        const docEl = document.documentElement;
        const canFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
        const inFs = function () { return !!(document.fullscreenElement || document.webkitFullscreenElement); };
        function paintFs() {
            if (!fsBtn) return;
            if (!canFs) {
                fsBtn.disabled = true;
                fsBtn.textContent = 'INDISPONIBIL';
                if (fsHint) fsHint.textContent = 'Pe iPhone: Share, apoi Adauga pe ecranul de pornire';
                return;
            }
            fsBtn.textContent = inFs() ? 'IESI' : 'INTRA';
            fsBtn.classList.toggle('is-on', inFs());
            if (fsHint) fsHint.textContent = inFs() ? 'Esti in ecran complet' : 'Ascunde bara browserului';
        }
        if (fsBtn) {
            fsBtn.addEventListener('click', function () {
                try {
                    if (inFs()) {
                        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
                    } else {
                        const p = (docEl.requestFullscreen || docEl.webkitRequestFullscreen).call(docEl);
                        if (p && p.then && window.ARDevice.isPhone && screen.orientation && screen.orientation.lock) {
                            p.then(function () { return screen.orientation.lock('landscape'); }).catch(function () {});
                        }
                    }
                } catch (e) { /* ignore */ }
            });
        }
        document.addEventListener('fullscreenchange', paintFs);
        document.addEventListener('webkitfullscreenchange', paintFs);
        paintFs();

        window.openSettings = function () {
            if (!settingsEl) return;
            muted = window.ARSound.isMuted();
            paintSound();
            paintFs();
            // Logging out belongs to the lobby only (not mid-match, not on the login screen)
            const lobby = document.getElementById('screen-lobby');
            const logoutRow = document.getElementById('set-row-logout');
            if (logoutRow) logoutRow.style.display = lobby && lobby.style.display !== 'none' ? '' : 'none';
            settingsEl.style.display = 'flex';
        };
        window.closeSettings = function () { if (settingsEl) settingsEl.style.display = 'none'; };
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeSettings(); });


        // ---------- press haptics on the controls that matter ----------
        const HAPTIC_SEL = '.btn-play, .btn-join, .stat-btn, .gm-card, .btn-start-game, .cs-action-btn, .mission-claim-btn, .auth-btn, #btn-rematch';
        if (navigator.vibrate) {
            document.addEventListener('pointerdown', function (e) {
                if (e.pointerType !== 'touch') return;
                const t = e.target.closest && e.target.closest(HAPTIC_SEL);
                if (t && !t.disabled) navigator.vibrate(8);
            }, { passive: true });
        }

        // ---------- sprite normaliser ----------
        // The character sprites carry very different amounts of empty margin, so at one plate size a pumpkin
        // reads tiny next to a tiger. Crop each sprite to its visible pixels and re-centre it on a square,
        // once per source, so every portrait fills its plate the same way. Display only: the game still
        // draws from the original files.
        const NORM_SEL = '.char-preview-img, .cs-img-wrap img, .lp-avatar-ring img, .waiting-card-av img';
        const normCache = new Map();
        const normLoad = new Map();

        function cropToSquare(im) {
            const maxSide = 512;
            const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
            const w = Math.max(1, Math.round(im.naturalWidth * k));
            const h = Math.max(1, Math.round(im.naturalHeight * k));
            const probe = document.createElement('canvas');
            probe.width = w; probe.height = h;
            const pctx = probe.getContext('2d', { willReadFrequently: true });
            pctx.drawImage(im, 0, 0, w, h);
            const px = pctx.getImageData(0, 0, w, h).data;
            let minX = w, minY = h, maxX = -1, maxY = -1;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (px[(y * w + x) * 4 + 3] > 24) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX < 0) return null;
            const bw = maxX - minX + 1, bh = maxY - minY + 1;
            const side = Math.max(bw, bh) * 1.04;
            const out = document.createElement('canvas');
            out.width = out.height = 256;
            const octx = out.getContext('2d');
            const s = 256 / side;
            octx.imageSmoothingQuality = 'high';
            octx.drawImage(probe, minX, minY, bw, bh, (256 - bw * s) / 2, (256 - bh * s) / 2, bw * s, bh * s);
            return out.toDataURL('image/png');
        }

        function normalise(img) {
            const src = img.getAttribute('src');
            if (!src || src.indexOf('data:') === 0) return;
            if (normCache.has(src)) { img.src = normCache.get(src); return; }
            img.style.opacity = '0';
            let pr = normLoad.get(src);
            if (!pr) {
                pr = new Promise(function (resolve) {
                    const im = new Image();
                    im.onload = function () { resolve(im); };
                    im.onerror = function () { resolve(null); };
                    im.src = src;
                });
                normLoad.set(src, pr);
            }
            pr.then(function (im) {
                let url = null;
                if (im) { try { url = cropToSquare(im); } catch (e) { url = null; } }
                if (url) normCache.set(src, url);
                if (img.getAttribute('src') === src) {
                    if (url) img.src = url;
                    img.style.opacity = '';
                }
            });
        }

        function scan(root) {
            if (root.nodeType !== 1) return;
            if (root.matches && root.matches(NORM_SEL)) normalise(root);
            if (root.querySelectorAll) root.querySelectorAll(NORM_SEL).forEach(normalise);
        }
        new MutationObserver(function (records) {
            for (let i = 0; i < records.length; i++) {
                const r = records[i];
                if (r.type === 'attributes') {
                    if (r.target.matches && r.target.matches(NORM_SEL)) normalise(r.target);
                } else {
                    r.addedNodes.forEach(scan);
                }
            }
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        scan(document.body);

        // ---------- keep the browser tint in step with the active surface ----------
        document.documentElement.classList.add('ui-ready');
    });
})();

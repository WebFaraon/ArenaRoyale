// ============================================
// Blastridge - game.js
// ============================================

// ─── Lobby background animation ───────────────────────────────────────────────
let _lobbyBgRaf = null;
const _LBG = {
    ready: false,
    gen: 0,        // bumped on every start/resize: a late sprite load for an older size is ignored
    season: null,  // set once the sprites of ARArena.prepareLobby are in
};

function _drawConcavePoly(ctx, cx, cy, r, sides, concave, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const a1 = (i / sides) * Math.PI * 2 + rot;
        const a2 = ((i + 1) / sides) * Math.PI * 2 + rot;
        const am = (a1 + a2) / 2;
        const p1x = cx + Math.cos(a1) * r, p1y = cy + Math.sin(a1) * r;
        const p2x = cx + Math.cos(a2) * r, p2y = cy + Math.sin(a2) * r;
        const cpx = cx + Math.cos(am) * r * concave, cpy = cy + Math.sin(am) * r * concave;
        if (i === 0) ctx.moveTo(p1x, p1y);
        ctx.quadraticCurveTo(cpx, cpy, p2x, p2y);
    }
    ctx.closePath();
}
function _drawHex(ctx, cx, cy, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rot;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else         ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
}

// Module-level path helpers — hoisted out of draw functions to avoid per-frame closure allocation.
// _polyPathOnly: n-sided polygon path, centered at (cx,cy). No fill/stroke — caller controls style.
function _polyPathOnly(ctx, cx, cy, r, n, angle) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + angle;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        else         ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
}
// _hexPathOnly: 6-sided path centered at origin (caller must ctx.translate to item pos first).
function _hexPathOnly(ctx, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rot;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
}

function startLobbyBackground() {
    const canvas = document.getElementById('lobby-bg-canvas');
    if (!canvas) return;
    canvas.style.display = '';  // un-hide if hidden by stopLobbyBackground
    if (_lobbyBgRaf) return; // already running

    if (!_LBG.ready) {
        _LBG.ready = true;
        _LBG.gen++;
        _LBG.season = null;
        _LBG.props = null;
        _LBG.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = Math.round(window.innerWidth  * _LBG.dpr);
        canvas.height = Math.round(window.innerHeight * _LBG.dpr);
    }

    // The field is still (no moving players), so one paint per start or resize is enough; the sprites of
    // trees and rocks arrive a moment later and repaint it once.
    const ctx = canvas.getContext('2d');
    _lobbyBgRaf = requestAnimationFrame(() => _lobbyBgTick(ctx));
    const gen = _LBG.gen;
    ARArena.prepareLobby(ARArena.mapState().season || 'vara', season => {
        if (gen !== _LBG.gen || !season || !_lobbyBgRaf) return;
        _LBG.season = season;
        _lobbyBgTick(ctx);
    });
}

function stopLobbyBackground() {
    if (_lobbyBgRaf) { cancelAnimationFrame(_lobbyBgRaf); _lobbyBgRaf = null; }
    const canvas = document.getElementById('lobby-bg-canvas');
    if (canvas) canvas.style.display = 'none';
}

function _lobbyBgTick(ctx) {
    const d = _LBG.dpr || 1;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ARArena.drawLobbyField(ctx, ctx.canvas.width / d, ctx.canvas.height / d, _LBG);
}
// ──────────────────────────────────────────────────────────────────────────────

const ARENA_W = 2600;
const ARENA_H = 2600;
const VIEW_W  = 1300;
const VIEW_H  =  730;
const MAX_DPR = 2;   // cap pixelRatio - 2x acopera toate telefoanele moderne fara cost excesiv

// ---------- G5: dynamic resolution ----------
// Past ~2 Mpx the canvas is fill-rate bound (fps ~ 1/pixels), so when fps stays under the target
// the internal resolution steps down (the canvas keeps its CSS size, the browser upscales it) and
// probes back up slowly. Hysteresis: 2 s of low fps to go down, 12 s of good fps to try up, and every
// failed probe doubles the wait. A step down that does not raise fps (a 30 fps display, a CPU-bound
// phone) is undone, and after two such failures the scaler stops for the session.
// ?rs=off keeps full resolution, ?rs=0.6 pins a fixed scale (measurements).
const RS_STEPS = [1, 0.85, 0.72, 0.62, 0.54];
const RS_TARGET_FPS = 54;
const _RS = {
    idx: 0, fixed: null, off: false,
    last: 0, wStart: 0, frames: 0, fps: 0,
    settleUntil: 0, bad: 0, good: 0, upNeed: 12000,
    probeAt: 0, check: null, noDownUntil: 0, fails: 0
};
function _rsInit() {
    _RS.idx = 0; _RS.fixed = null; _RS.off = false; _RS.last = 0; _RS.wStart = 0; _RS.frames = 0;
    _RS.settleUntil = 0; _RS.bad = 0; _RS.good = 0; _RS.upNeed = 12000;
    _RS.probeAt = 0; _RS.check = null; _RS.noDownUntil = 0; _RS.fails = 0;
    try {
        const q = new URLSearchParams(location.search).get('rs');
        if (q === 'off') _RS.off = true;
        else if (q && isFinite(+q) && +q >= 0.3 && +q <= 1) { _RS.fixed = +q; _RS.off = true; }
        else {
            const s = parseInt(localStorage.getItem('ar_rs_idx'), 10);   // last match's step: no re-learning
            if (s > 0 && s < RS_STEPS.length) _RS.idx = s;
        }
    } catch (e) { /* no URL API / storage blocked */ }
    window.__arRS = _RS;
}
function _rsScale() { return _RS.fixed !== null ? _RS.fixed : RS_STEPS[_RS.idx]; }
function _rsDpr() { return Math.min(window.devicePixelRatio || 1, MAX_DPR) * _rsScale(); }
function _rsApplySize(canvas) {
    const vv   = window.visualViewport;
    const cssW = vv ? vv.width  : window.innerWidth;
    const cssH = vv ? vv.height : window.innerHeight;
    const dpr  = _rsDpr();
    canvas.width  = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
}
function _rsSetIdx(canvas, idx, ts) {
    _RS.idx = idx;
    _RS.settleUntil = ts + 1800;   // sprite/tile caches rebuild at the new scale
    _RS.bad = 0; _RS.good = 0; _RS.frames = 0; _RS.wStart = 0;
    if (window.ARBlackBox && ARBlackBox.on) ARBlackBox.event('rs-step', idx);
    try { localStorage.setItem('ar_rs_idx', String(idx)); } catch (e) { /* storage blocked */ }
    _rsApplySize(canvas);
}
// Called once per rAF frame, before the canvas size is read.
function _rsTick(ts, canvas) {
    if (_RS.off) return;
    const dt = _RS.last ? ts - _RS.last : 0;
    _RS.last = ts;
    if (document.hidden || dt > 1000) {   // tab was in the background: restart the window
        _RS.wStart = 0; _RS.frames = 0; _RS.settleUntil = ts + 1500; return;
    }
    if (!_RS.wStart) { _RS.wStart = ts; _RS.frames = 0; if (!_RS.settleUntil) _RS.settleUntil = ts + 3000; return; }
    _RS.frames++;
    const el = ts - _RS.wStart;
    if (el < 1000) return;
    const fps = _RS.frames * 1000 / el;
    _RS.fps = fps; _RS.wStart = ts; _RS.frames = 0;
    if (ts < _RS.settleUntil) { _RS.wStart = 0; return; }   // measure only windows fully after the settle time
    if (_RS.check) {   // first full window after a step down: did it help?
        const c = _RS.check; _RS.check = null;
        if (fps < c.fps * 1.08 && fps < RS_TARGET_FPS) {
            _RS.fails++;
            _RS.noDownUntil = ts + 60000;
            _rsSetIdx(canvas, c.idx, ts);
            if (_RS.fails >= 2) _RS.off = true;
            return;
        }
    }
    if (fps < RS_TARGET_FPS) {
        _RS.good = 0; _RS.bad++;
        if (_RS.bad >= 2 && _RS.idx < RS_STEPS.length - 1 && ts >= _RS.noDownUntil) {
            if (_RS.probeAt && ts - _RS.probeAt < 10000) _RS.upNeed = Math.min(_RS.upNeed * 2, 120000);   // the probe up failed
            _RS.check = { idx: _RS.idx, fps };
            _rsSetIdx(canvas, _RS.idx + 1, ts);
        }
    } else {
        _RS.bad = 0; _RS.good++;
        if (_RS.good * 1000 >= _RS.upNeed && _RS.idx > 0 && ts >= _RS.noDownUntil) {
            _RS.probeAt = ts;
            _rsSetIdx(canvas, _RS.idx - 1, ts);
        }
    }
}

// Decoratiuni statice ale hartii (seed fix, acelasi generator ca inainte): ground-layer.js
const _mapDeco = ARGround.makeDeco();
ARGround.setDeco(_mapDeco);

// Particule ambient (screen space, animate)
const _ambParts = Array.from({ length: 20 }, () => ({
    x: Math.random() * 2600,
    y: Math.random() * 2600,
    vy: -(12 + Math.random() * 16),
    vx: (Math.random() - 0.5) * 6,
    size: 3.5 + Math.random() * 3,
    baseAlpha: 0.10 + Math.random() * 0.10,
    phase: Math.random() * Math.PI * 2
}));

// ---------- SKINURI ----------
// The skin list lives in public/data/skins.json, shared with the server (server.js reads the same file).
// img is the SVG (lobby), png the in-match sprite. Login waits for the list (doLogin / doRegister).
let CHARACTERS = [];
let SKIN_META  = null; // pivot, bodyRadius, hand, defaultSkin
const DEFAULT_SKIN = 'rookie';
const SKINS_READY = fetch(arAsset('/data/skins.json'))
    .then(r => { if (!r.ok) throw new Error('skins.json ' + r.status); return r.json(); })
    .then(data => {
        SKIN_META  = data;
        // image URLs carry the build (arAsset) so a deploy never mixes old and new art
        CHARACTERS = data.skins.map(s => ({ ...s, png: arAsset(s.png), svg: arAsset(s.svg), img: arAsset(s.svg) }));
        _initHands(data);
        CHARACTERS.forEach(c => _getCharImg(c.png));
        // the lobby previews nest each skin's SVG (skinPreviewSvg); ~57 KB for all of them
        return Promise.all(CHARACTERS.map(c => fetch(c.svg)
            .then(r => r.ok ? r.text() : '')
            .then(txt => { if (txt) _skinSvgText[c.id] = _nestSkinSvg(txt); })
            .catch(() => {})));
    });

// ---------- SKIN PREVIEW (lobby) ----------
// The lobby shows a skin the way the match draws it: the hands under the body, the skin SVG, then a
// highlight that does not turn. All in the skins' 100 × 100 viewBox (body centre 50,46, radius 36,
// facing down). The skin's own SVG is nested inline, so the result is a standalone SVG: an <img> shows
// it as a data: URL, vector-sharp at any size, and the skins' clipPath ids never meet in the page.
const _skinSvgText = {};      // skin id -> its SVG, root resized to the 100 box
const _skinPreviewCache = {}; // id + options -> data: URL
const SKIN_PREVIEW = {
    hero:   { hands: true, highlight: true, shadow: true, ring: true }, // the big character in the lobby
    full:   { hands: true, highlight: true },               // character catalog, waiting room
    avatar: { body: true },                                 // profile avatar: the body only, cut to its circle
};
function _nestSkinSvg(txt) {
    return txt.replace(/^\s*<svg\b[^>]*>/, '<svg x="0" y="0" width="100" height="100" viewBox="0 0 100 100">');
}
// One hand, bottom to top: dark disc, base disc up-left, small gloss, outline (same as _paintHand in the match)
function _previewHand(x, y, base, dark) {
    const r = _HAND.r, f = n => +n.toFixed(2);
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '" fill="' + dark + '"/>'
        + '<circle cx="' + f(x - 1) + '" cy="' + f(y - 1.2) + '" r="' + _HAND.inner + '" fill="' + base + '"/>'
        + '<circle cx="' + f(x - 2.6) + '" cy="' + f(y - 3.4) + '" r="1.8" fill="#FFFFFF" fill-opacity=".45"/>'
        + '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '" fill="none" stroke="' + SKIN_OUTLINE + '" stroke-width="' + _HAND.line + '"/>';
}
function skinPreviewSvg(skinId, opts = {}) {
    const s = getCharacterById(skinId) || getCharacterById(DEFAULT_SKIN);
    const inner = s && _skinSvgText[s.id];
    if (!inner) return null;
    if (opts.body) {
        // the body circle with its outline (radius 36 + half the 6.2 × 0.8182 stroke ≈ 38.5)
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="11.5 7.5 77 77">'
            + '<defs><clipPath id="arPvBody"><circle cx="50" cy="46" r="38.5"/></clipPath></defs>'
            + '<g clip-path="url(#arPvBody)">' + inner + '</g></svg>';
    }
    const h = (SKIN_META && SKIN_META.hand) || {};
    const ang = (h.defaultAngleDeg ?? 34) * Math.PI / 180, dist = h.defaultDistance || 47;
    const hx = Math.sin(ang) * dist, hy = 46 + Math.cos(ang) * dist; // 26.3, 85.0
    let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">';
    if (opts.shadow) {
        // a soft ground shadow under the body and hands
        out += '<defs><radialGradient id="arPvShadow"><stop offset="0" stop-color="#000" stop-opacity=".32"/>'
            + '<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>'
            + '<ellipse cx="50" cy="91" rx="40" ry="8" fill="url(#arPvShadow)"/>';
    }
    if (opts.ring) {
        // the rarity colour as a thin ring in the shadow, 3 screen px at any size (non-scaling stroke)
        out += '<ellipse cx="50" cy="91" rx="31" ry="6" fill="none" stroke="' + (RARITY_COLOR[s.rarity] || RARITY_COLOR.common)
            + '" stroke-opacity=".75" stroke-width="3" vector-effect="non-scaling-stroke"/>';
    }
    if (opts.hands) out += _previewHand(50 - hx, hy, s.base, s.dark) + _previewHand(50 + hx, hy, s.base, s.dark);
    out += inner;
    if (opts.highlight) out += '<ellipse cx="34" cy="25" rx="10" ry="4.6" fill="#FFFFFF" fill-opacity=".42" transform="rotate(-35 34 25)"/>';
    return out + '</svg>';
}
// The preview as an <img> src; falls back to the plain skin SVG if its text is not loaded
function skinPreviewSrc(skinId, opts) {
    const key = skinId + '|' + (opts.hands ? 'h' : '') + (opts.highlight ? 'l' : '') + (opts.shadow ? 's' : '') + (opts.ring ? 'r' : '') + (opts.body ? 'b' : '');
    if (_skinPreviewCache[key]) return _skinPreviewCache[key];
    const svg = skinPreviewSvg(skinId, opts);
    if (!svg) { const c = getCharacterById(skinId); return c ? c.svg : ''; }
    return (_skinPreviewCache[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}
const RARITY_COLOR = { common: '#7C8F9A', rare: '#52B6F0', epic: '#FF6A1A', legendary: '#FFC52E', season: '#FFD02A' };
const RARITY_LABEL = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', season: 'SEASON' };

// Tier colors by level bracket
const TIER_COLORS = [
    { min: 1,  max: 9,  color: '#C98A4B', glow: 'rgba(205,127,50,.55)',  name: 'Bronze'   },
    { min: 10, max: 19, color: '#C3CCD1', glow: 'rgba(192,192,192,.55)', name: 'Silver'   },
    { min: 20, max: 29, color: '#FFC52E', glow: 'rgba(255,215,0,.55)',   name: 'Gold'     },
    { min: 30, max: 39, color: '#7FD6FF', glow: 'rgba(136,238,255,.55)', name: 'Diamond'  },
    { min: 40, max: 49, color: '#c084fc', glow: 'rgba(192,132,252,.55)', name: 'Mythic'   },
    { min: 50, max: 50, color: '#e040fb', glow: 'rgba(224,64,251,.7)',   name: 'Amethyst' },
];
function getTier(level) {
    return TIER_COLORS.find(t => level >= t.min && level <= t.max) || TIER_COLORS[0];
}

let selectedCharacterId = DEFAULT_SKIN;
// Owned skins, sent by the server at login (every skin when the server runs with UNLOCK_ALL=1).
let unlockedCharacters  = [DEFAULT_SKIN];
let _currentShopFilter  = 'all';

function getCharacterById(id) { return CHARACTERS.find(c => c.id === id); }
function getSelectedCharacter() { return getCharacterById(selectedCharacterId) || CHARACTERS[0]; }

// Lobby hero: the arrows walk through all characters. An unlocked one is selected at once; a
// locked one is only shown (greyed, with its price) and a tap on it opens the shop. PLAY always
// uses the selected (unlocked) character.
let heroIndex = 0;
function _heroRender(char) {
    const unlocked = unlockedCharacters.includes(char.id);
    const preview = document.getElementById('preview');
    if (preview) preview.src = skinPreviewSrc(char.id, SKIN_PREVIEW.hero);
    const ring = document.getElementById('char-rarity-ring');
    if (ring) { ring.style.setProperty('--rc', RARITY_COLOR[char.rarity]); ring.classList.toggle('is-locked', !unlocked); }
    const nameEl = document.getElementById('char-name-display');
    if (nameEl) nameEl.textContent = char.name.toUpperCase();
    const idx = document.getElementById('hero-skin-idx');
    if (idx) idx.textContent = CHARACTERS.indexOf(char) + 1;
    const tot = document.getElementById('hero-skin-total');
    if (tot) tot.textContent = CHARACTERS.length;
    const lock = document.getElementById('hero-lock');
    if (lock) {
        lock.hidden = unlocked;
        const txt = document.getElementById('hero-lock-txt');
        if (txt && !unlocked) txt.innerHTML = !char.shop ? 'SEASON' : char.diamonds > 0 ? ico('gem') + ' ' + char.diamonds : ico('coins') + ' ' + char.coins.toLocaleString();
    }
}
function cycleCharacter(dir) {
    heroIndex = (heroIndex + dir + CHARACTERS.length) % CHARACTERS.length;
    const char = CHARACTERS[heroIndex];
    if (unlockedCharacters.includes(char.id)) selectCharacter(char.id);
    else _heroRender(char);
}
// Back to the selected character (leaving the lobby while a locked one is on stage)
function heroShowSelected() {
    const char = getSelectedCharacter();
    heroIndex = Math.max(0, CHARACTERS.indexOf(char));
    _heroRender(char);
}

function selectCharacter(id) {
    if (!unlockedCharacters.includes(id)) return;
    selectedCharacterId = id;
    heroIndex = Math.max(0, CHARACTERS.findIndex(c => c.id === id));
    const char = getCharacterById(id);
    if (!char) return;
    const preview = document.getElementById('preview');
    if (preview) preview.src = skinPreviewSrc(char.id, SKIN_PREVIEW.hero);
    const ring = document.getElementById('char-rarity-ring');
    if (ring) ring.style.setProperty('--rc', RARITY_COLOR[char.rarity]);
    const _cnd = document.getElementById('char-name-display');
    if (_cnd) _cnd.textContent = char.name.toUpperCase();
    _heroRender(char);
    const lpImg = document.getElementById('lp-avatar-img');
    const lpPh  = document.getElementById('lp-avatar-ph');
    if (lpImg) { lpImg.src = skinPreviewSrc(char.id, SKIN_PREVIEW.avatar); lpImg.style.display = 'block'; }
    if (lpPh)  lpPh.style.display = 'none';
    renderCharShopGrid(_currentShopFilter);
    if (currentProfile) currentProfile.skin = currentProfile.avatar = char.id;
    if (currentNickname && sessionToken) {
        fetch('/api/profile/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, avatar: char.id })
        }).catch(() => {});
    }
}

// ── WEAPON SELECTION ─────────────────────────────────────────────────────────
// Filled from public/data/weapons.json when it loads (WEAPONS_ART_READY), the file the server reads too
const WEAPONS = [];        // { id, name, desc, class, fireModeLabel, ...ARShared.weaponStats } in file order
const WEAPON_CLASSES = []; // { id, name } in menu order
const WEAPON_LOADOUT = {}; // id -> loadout base values and growth per point (HP/DMG/SPD)
const _WEAPON_DATA = {};   // id -> its WEAPONS entry
let WEAPON_RULES = null;   // aimDelay, reloadDelay, bulletRadius: the same for every gun
let DEFAULT_WEAPON = null;
// Per-jucator: socketId → weaponId (populat din player-image si playersMeta)
const _playerWeapons = new Map();
// Per-jucator: socketId → id-ul skinului armei ("default" = fara skin), validat de server (player-image /
// playersMeta); se deseneaza in meci (_gunLook, WEAPON SKINS IN HAND)
const _playerWeaponSkins = new Map();
let selectedWeapon = localStorage.getItem('selectedWeapon'); // checked once weapons.json is in

function _applyWeaponUI() {
    const w = _WEAPON_DATA[selectedWeapon] || _WEAPON_DATA[DEFAULT_WEAPON];
    if (!w) return; // weapons.json not in yet
    const icon  = document.getElementById('weapon-preview-icon');
    const nameEl = document.getElementById('weapon-name-display');
    const titleEl = document.getElementById('loadout-title');
    if (icon)  icon.innerHTML = ARIcons.weaponHtml(w.id, false);
    if (nameEl) nameEl.textContent = w.name.toUpperCase();
    if (titleEl) titleEl.innerHTML = `<span>${w.name.toUpperCase()}</span> LOADOUT`;
}

function selectWeapon(id) {
    selectedWeapon = id;
    localStorage.setItem('selectedWeapon', id);
    // Reset stats la 0 cand schimbi arma (build-ul difera per weapon)
    stats.hp = 0; stats.dmg = 0; stats.spd = 0;
    localStorage.setItem('ar_stats', JSON.stringify(stats));
    _applyWeaponUI();
    updateStatsUI();
}

// Initializeaza weapon UI la incarcare, once weapons.json is in (it arrives after DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => WEAPONS_ART_READY.then(_applyWeaponUI));

// ---------- ARSENAL ----------
// A screen over the lobby (index.html #screen-arsenal): the guns on the left, the chosen gun with its
// numbers and its look in the middle, your stats with it and its skins on the right. Everything comes from
// the game's data: weapons.json (WEAPONS, WEAPON_ART), weapon-skins.json (WEAPON_SKIN_CATALOG: names,
// rarity, price, unlock), weapon-skin-sprites.json (WEAPON_ART.skins: accent) and the profile
// (weapon_stats, owned_weapon_skins, equipped_weapon_skins). Buying and equipping go only through the
// server (/api/weapon-skins/buy, /equip); the screen changes after its answer, never before.
// "Vezi in mana" draws the player the way the match does (_drawPlayerFigure: same hands, same muzzle).
const ARS_RARITY = {
    rare:      { label: 'RARE',     title: 'Rare',     color: 'var(--c-sky)' },
    epic:      { label: 'EPIC',     title: 'Epic',     color: 'var(--c-purple)' },
    legendary: { label: 'LEGENDARY', title: 'Legendary', color: 'var(--c-gold)' },
    mythic:    { label: 'MYTHIC',    title: 'Mythic',    color: '#FFC21F' },
};
const NO_WSKIN = 'default';
// weapon: the gun shown; skin: the skin previewed on it (NO_WSKIN = the gun as it is); inHand: the figure
// view; busy: a request is out (one at a time, so a double click cannot send two)
const _ars = { weapon: null, skin: NO_WSKIN, cls: null, k: 1, inHand: false, busy: false, buy: null, raf: 0, fx: _newShotFx(), entries: {}, pool: ARSkinFx.createPool(40), em: { acc: 0 }, lastT: 0 };

// The screen is laid out like on a laptop at every size. Below ARS_MIN_W x ARS_MIN_H (a phone, a small tablet)
// the whole thing is drawn at that design size and scaled down to fit (#ars-fit: width/height = the screen / k,
// transform: scale(k)), so a phone shows the same three columns, smaller, with no scrolling to find things.
// --k lets the small print keep a readable size on screen (style.css: .is-scaled).
const ARS_MIN_W = 1280, ARS_MIN_H = 620;
function _arsFit() {
    const scr = document.getElementById('screen-arsenal'), fit = document.getElementById('ars-fit');
    if (!scr || !fit || scr.style.display === 'none') return;
    const cs = getComputedStyle(scr);
    const aw = scr.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const ah = scr.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (aw < 50 || ah < 50) return;
    const k = Math.min(1, aw / ARS_MIN_W, ah / ARS_MIN_H);
    _ars.k = k;
    const scaled = k < 0.999;
    scr.classList.toggle('is-scaled', scaled);
    scr.style.setProperty('--k', scaled ? k.toFixed(4) : '1');
    if (scaled) {
        fit.style.width = (aw / k).toFixed(1) + 'px';
        fit.style.height = (ah / k).toFixed(1) + 'px';
        fit.style.transform = `scale(${k.toFixed(4)})`;
    } else { fit.style.width = ''; fit.style.height = ''; fit.style.transform = ''; }
    scr.classList.toggle('is-tight', ah / k < 760);   // short screens: the trays take less room
}
// The lobby does the same (style.css: .lb-fit is a size container, the layout rules read it): laid out at least
// LOBBY_MIN_W x LOBBY_MIN_H like a laptop, scaled down to fit a phone or a small tablet.
const LOBBY_MIN_W = 1280, LOBBY_MIN_H = 650;
function _lobbyFit() {
    const scr = document.getElementById('screen-lobby'), fit = document.getElementById('lb-fit');
    if (!scr || !fit || scr.style.display === 'none') return;
    const cs = getComputedStyle(scr);
    const aw = scr.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const ah = scr.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (aw < 50 || ah < 50) return;
    const k = Math.min(1, aw / LOBBY_MIN_W, ah / LOBBY_MIN_H);
    const scaled = k < 0.999;
    scr.classList.toggle('is-scaled', scaled);
    scr.style.setProperty('--k', scaled ? k.toFixed(4) : '1');
    if (scaled) {
        fit.style.width = (aw / k).toFixed(1) + 'px';
        fit.style.height = (ah / k).toFixed(1) + 'px';
        fit.style.transform = `scale(${k.toFixed(4)})`;
    } else { fit.style.width = ''; fit.style.height = ''; fit.style.transform = ''; }
    if (window.adjustLbText) window.adjustLbText();   // the top bar's button labels follow the layout size
}
window.addEventListener('resize', _lobbyFit);
window.addEventListener('orientationchange', () => setTimeout(_lobbyFit, 150));
document.addEventListener('DOMContentLoaded', () => {
    const scr = document.getElementById('screen-lobby');
    if (scr && window.ResizeObserver) new ResizeObserver(_lobbyFit).observe(scr);   // fires when the lobby is shown
});
window.addEventListener('resize', _arsFit);
window.addEventListener('orientationchange', () => setTimeout(_arsFit, 150));

const _arsOwned    = () => new Set((currentProfile && currentProfile.owned_weapon_skins) || []);
const _arsStats    = id => ((currentProfile && currentProfile.weapon_stats) || {})[id] || { kills: 0, zombieKills: 0, damage: 0, shots: 0, hits: 0 };
const _arsSkinsOf  = wid => WEAPON_SKIN_CATALOG.list.filter(s => s.weapon === wid);
const _arsSkin     = id => (id && id !== NO_WSKIN ? WEAPON_SKIN_CATALOG.byId[id] || null : null);
// the skin on a gun as the server last said (and still owned), otherwise none
function _arsEquippedSkin(wid) {
    const id = ((currentProfile && currentProfile.equipped_weapon_skins) || {})[wid];
    const s = _arsSkin(id);
    return s && s.weapon === wid && _arsOwned().has(id) ? id : NO_WSKIN;
}
function _arsAccent(wid, skinId) {
    const sk = skinId !== NO_WSKIN && WEAPON_ART.skins[skinId];
    return (sk && sk.accent) || (WEAPON_ART.byId[wid] && WEAPON_ART.byId[wid].accent) || '#FFC53D';
}
// The gun lying down, barrel to the right. A skin: its icons/ SVG (a strip of the match frame 48 units tall,
// from y = 2 to past the muzzle). The base gun: the same strip cut from its match sprite (.ars-fi, --len =
// the strip's length), so Standard and the skins of a gun come out at one scale.
function _arsIcon(wid, skinId) {
    if (skinId !== NO_WSKIN) return `<img class="wicon" src="${arAsset(WEAPON_SKIN_DIR + 'icons/' + skinId + '.svg')}" alt="" draggable="false">`;
    const gun = WEAPON_ART.byId[wid];
    if (!gun) return ARIcons.weaponHtml(wid, false);
    return `<span class="ars-fi" style="--len:${gun.muzzle0[1] + 10}"><img src="${gun.img.src}" alt="" draggable="false"></span>`;
}
// ---- the pictures of the Arsenal ----
// Every preview and icon is fetched and decoded once (_arsLoad), the first time the lobby is idle after login
// (_arsWarm) or when the screen opens, so a click on a skin never waits for the network or the decoder.
const _arsImgs = new Map();   // url -> { img, ready: Promise<boolean>, box }
function _arsLoad(url) {
    let e = _arsImgs.get(url);
    if (e) return e;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    e = { img, ready: img.decode().then(() => true, () => false), box: undefined };
    _arsImgs.set(url, e);
    return e;
}
let _arsWarmed = false;
async function _arsWarm() {
    if (_arsWarmed) return;
    _arsWarmed = true;
    try { await Promise.all([WEAPONS_ART_READY, WEAPON_SKIN_ART_READY, WEAPON_SKIN_CATALOG_READY]); } catch { return; }
    const order = [selectedWeapon].concat(WEAPONS.map(w => w.id).filter(id => id !== selectedWeapon));
    for (const wid of order) {   // one gun at a time, the equipped one first, so it does not crowd the rest of the page
        const urls = [];
        if (WEAPON_ART.byId[wid]) urls.push(WEAPON_ART.byId[wid].img.src);
        for (const s of _arsSkinsOf(wid)) urls.push(arAsset(WEAPON_SKIN_DIR + 'svg/' + s.id + '.svg'), arAsset(WEAPON_SKIN_DIR + 'icons/' + s.id + '.svg'));
        await Promise.all(urls.map(u => _arsLoad(u).ready));
    }
}
// The rows of the 144-unit frame (barrel down) the gun's pixels cover: [first, end], measured once from the alpha
function _arsBox(e) {
    if (e.box !== undefined) return e.box;
    e.box = null;
    try {
        const W = 160, H = 288, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(e.img, 0, 0, W, H);
        const a = g.getImageData(0, 0, W, H).data;
        const rowHas = y => { for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 12) return true; return false; };
        let y0 = 0, y1 = H - 1;
        while (y0 < H && !rowHas(y0)) y0++;
        while (y1 > y0 && !rowHas(y1)) y1--;
        if (y0 < H) {
            e.box = [y0 / H * 144, (y1 + 1) / H * 144];
            // and how far it reaches across (wings, feathers): the stage shows the middle 44 units, wider art is shrunk to fit
            const colHas = x => { for (let y = y0; y <= y1; y++) if (a[(y * W + x) * 4 + 3] > 12) return true; return false; };
            let x0 = 0, x1 = W - 1;
            while (x0 < W && !colHas(x0)) x0++;
            while (x1 > x0 && !colHas(x1)) x1--;
            e.bx = [x0 / W * 80, (x1 + 1) / W * 80];
        }
    } catch { /* a picture that cannot be read stays where the frame puts it */ }
    return e.box;
}
function _arsGunUrl(wid, skinId) {
    return skinId !== NO_WSKIN ? arAsset(WEAPON_SKIN_DIR + 'svg/' + skinId + '.svg') : WEAPON_ART.byId[wid].img.src;
}
// the big preview: the match frame (80 x 144 units, barrel down) turned barrel-right: a skin's svg/ or the
// base gun's sprite, so every gun is drawn at the same scale. The wrapper starts empty: _arsFitGun puts the
// already decoded picture in it, centres it by its pixels and shows it.
function _arsGunPreview() { return '<div class="ars-gun"></div>'; }
// Shows the gun of the weapon and skin now selected. The picture on screen stays until the new one is decoded
// (never an empty stage). The new one is the cached element itself, moved into the stage: a new <img> for the
// same file would go through the loader again (a few ms on a good connection, a full round trip on a slow one).
let _arsGunSeq = 0;
async function _arsFitGun(swap) {
    const seq = ++_arsGunSeq;
    const wrap = document.querySelector('#ars-main .ars-gun');
    if (!wrap) return;
    const e = _arsLoad(_arsGunUrl(_ars.weapon, _ars.skin));
    await e.ready;
    if (seq !== _arsGunSeq || !wrap.isConnected) return;   // another click came first
    const box = _arsBox(e), el = e.img;
    wrap.style.setProperty('--dx', box ? ((72 - (box[0] + box[1]) / 2) / 144 * 100).toFixed(3) + '%' : '0%');
    // art wider than the 44 units the stage shows (the Viespe's wings, the Soim's feathers) is scaled down about the middle of its pixels
    const half = e.bx ? Math.max(40 - e.bx[0], e.bx[1] - 40) + 2 : 0;
    wrap.style.setProperty('--fit', half > 22 ? (22 / half).toFixed(3) : '1');
    wrap.style.setProperty('--ody', box ? (((box[0] + box[1]) / 2 / 144 - 0.5) * 100).toFixed(2) + '%' : '0%');
    el.className = '';
    el.alt = ''; el.draggable = false;
    if (el.parentNode !== wrap) wrap.replaceChildren(el);
    void el.offsetWidth;                                     // restarts the pop
    el.className = swap ? 'is-in is-swap' : 'is-in';
}
// The name of a bullet colour, from its hue
function _arsColorName(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    if (s < 0.2) return l > 0.7 ? 'White' : l < 0.25 ? 'Black' : 'Gray';
    if (l > 0.72) return h >= 235 && h < 300 ? 'Lilac' : h >= 160 && h < 235 ? 'Light blue' : h >= 40 && h < 160 ? 'Light green' : 'Pink';
    if (h < 12 || h >= 345) return 'Red';
    if (h < 40) return l < 0.55 && s < 0.65 ? 'Bronze' : 'Orange';
    if (h < 52) return 'Gold';
    if (h < 70) return 'Yellow';
    if (h < 160) return 'Green';
    if (h < 195) return 'Teal';
    if (h < 250) return 'Blue';
    if (h < 290) return 'Purple';
    return 'Pink';
}
// The bars: each gun's raw value, shown relative to the best gun (0..1). Damage is one shot (every pellet),
// fire rate is bullets per second (a burst counts all its bullets), range is speed x lifetime, accuracy
// drops with the spread (radians), reload is the time to fill the magazine (faster = longer bar).
function _arsBars(wid) {
    const raw = {};
    for (const w of WEAPONS) {
        const rate = w.fireMode === 'burst' ? w.burstCount / (w.shootCd + (w.burstCount - 1) * w.burstDelay) : 1 / w.shootCd;
        raw[w.id] = {
            dmg: WEAPON_LOADOUT[w.id].baseDmg * (w.pellets || 1), rate, range: w.bulletSpeed * w.bulletLife,
            acc: Math.max(0.05, 1 - (w.spread || 0)), ammo: w.ammoMax, reload: w.ammoMax / w.reloadRate,
        };
    }
    const all = Object.values(raw), me = raw[wid];
    const rel = k => me[k] / Math.max(...all.map(v => v[k]));
    const level = v => v >= 0.8 ? 'Very high' : v >= 0.6 ? 'High' : v >= 0.4 ? 'Medium' : v >= 0.2 ? 'Low' : 'Very low';
    const speed = v => v >= 0.8 ? 'Very fast' : v >= 0.6 ? 'Fast' : v >= 0.4 ? 'Medium' : v >= 0.2 ? 'Slow' : 'Very slow';
    const w = _WEAPON_DATA[wid];
    const reload = Math.min(...all.map(v => v.reload)) / me.reload;
    return [
        ['DAMAGE', rel('dmg'), level(rel('dmg'))],
        ['FIRE RATE', rel('rate'), level(rel('rate'))],
        ['RANGE', rel('range'), level(rel('range'))],
        ['ACCURACY', rel('acc'), level(rel('acc'))],
        ['MAGAZINE', rel('ammo'), me.ammo + (w.fireMode === 'burst' ? ' bursts' : ' rounds')],
        ['RELOAD', reload, speed(reload)],
    ];
}

function _arsSetMoney() {
    const p = currentProfile || {};
    const coins = (p.coins ?? 1000).toLocaleString(), diamonds = String(p.diamonds || 0);
    for (const [id, v] of [['ars-coins', coins], ['ars-diamonds', diamonds], ['lp-coins', coins], ['lp-crystals', diamonds], ['shop-coins', coins], ['shop-diamonds', diamonds]]) {
        const el = document.getElementById(id); if (el) el.textContent = v;
    }
}

// The category tabs over the list: one per class in weapons.json (with how many guns it has), the shown list is
// the active class. The class of the chosen gun is the one open.
function _arsClassOf(wid) { const w = _WEAPON_DATA[wid]; return w ? w.class : null; }
function _arsRenderTabs() {
    const box = document.getElementById('ars-tabs');
    if (!box) return;
    const tabs = WEAPON_CLASSES.map(c => ({ c, n: WEAPONS.filter(w => w.class === c.id).length })).filter(t => t.n);
    box.innerHTML = tabs.map(({ c, n }) => {
        const on = c.id === _ars.cls;
        return `<button type="button" role="tab" class="ars-blk ars-tab ${on ? 'ars-btn-orange is-on' : 'ars-btn-slate'}" data-cls="${c.id}" aria-selected="${on}" onclick="arsSelectClass('${c.id}')">
            <span class="ars-tab-name">${c.name.toUpperCase()}</span><span class="ars-tab-n">${n}</span></button>`;
    }).join('');
}
// A tab opens its class; when the chosen gun is not in it, the first gun of the class is chosen, so the middle
// and the right follow what the list shows.
function arsSelectClass(cid) {
    if (cid === _ars.cls) return;
    _ars.cls = cid;
    const first = WEAPONS.find(w => w.class === cid);
    if (first && _arsClassOf(_ars.weapon) !== cid) { arsSelectWeapon(first.id); return; }
    _arsRenderTabs(); _arsRenderList();
}

function _arsRenderList() {
    const box = document.getElementById('ars-weapons');
    const order = WEAPONS.filter(w => w.class === _ars.cls);
    box.innerHTML = order.map(w => {
        const sk = _arsEquippedSkin(w.id), cls = WEAPON_CLASSES.find(c => c.id === w.class);
        const sel = w.id === _ars.weapon;
        return `<button type="button" class="ars-wrow${sel ? ' is-sel' : ''}" data-w="${w.id}" aria-pressed="${sel}" onclick="arsSelectWeapon('${w.id}')">
            <span class="ars-wrow-icon">${_arsIcon(w.id, sk)}</span>
            <span class="ars-wrow-text">
                <span class="ars-wrow-name"><i class="ars-dot" style="--ac:${_arsAccent(w.id, sk)}"></i><span class="ars-wrow-nm">${w.name}</span></span>
                <span class="ars-wrow-sub">${cls ? cls.name : ''} · ${w.fireModeLabel}</span>
            </span>
            <span class="ars-wrow-end">
                <span class="ars-wrow-kills" title="kills">${pic('eliminari')}${_arsStats(w.id).kills.toLocaleString()}</span>
                ${w.id === selectedWeapon ? '<span class="ars-wrow-tag">IN MATCH</span>' : ''}
            </span>
        </button>`;
    }).join('');
}

function _arsRenderMain() {
    const wid = _ars.weapon, w = _WEAPON_DATA[wid], cls = WEAPON_CLASSES.find(c => c.id === w.class);
    const sk = _arsSkin(_ars.skin), eq = _arsEquippedSkin(wid), accent = _arsAccent(wid, _ars.skin);
    const shown = sk ? `${sk.name} · ${ARS_RARITY[sk.rarity].title}` : 'Standard';
    const skinLine = _ars.skin === eq ? `Skin: <b>${shown}</b>` : `Preview: <b>${shown}</b>`;
    const inMatch = selectedWeapon === wid;
    document.getElementById('ars-main').innerHTML = `
        <div class="ars-main-head">
            <div class="ars-main-id">
                <span class="ars-pill">${(cls ? cls.name : '').toUpperCase()} · ${w.fireModeLabel.toUpperCase()}</span>
                <h2 class="ars-main-name">${w.name}</h2>
                <span class="ars-main-skin">${skinLine}</span>
            </div>
            <div class="ars-bullet">
                <span class="ars-bullet-kick">BULLET COLOR</span>
                <span class="ars-bullet-val"><i class="ars-bullet-chip" style="--ac:${accent}"></i><span class="ars-bullet-nm">${_arsColorName(accent)}</span></span>
            </div>
        </div>
        <div class="ars-stage${_ars.inHand ? ' is-hand' : ''}" ${_ars.inHand ? 'title="Click to fire"' : ''}>
            ${_ars.inHand ? '<canvas id="ars-hand" aria-label="Your character holding the weapon"></canvas>' : _arsGunPreview()}
        </div>
        <div class="ars-bars">${_arsBars(wid).map(([label, v, txt]) => `
            <div class="ars-bar-row">
                <span class="ars-bar-label">${label}</span>
                <span class="ars-bar"><span class="ars-bar-fill" style="width:${Math.max(4, Math.round(v * 100))}%"></span></span>
                <span class="ars-bar-val">${txt}</span>
            </div>`).join('')}
        </div>
        <div class="ars-actions">
            <button type="button" class="ars-blk ars-btn-green ars-use" id="ars-use" onclick="arsUseInMatch()" ${inMatch ? 'aria-pressed="true"' : ''}>
                ${inMatch ? ico('check') + 'EQUIPPED IN MATCH' : 'USE IN MATCH'}</button>
            <button type="button" class="ars-blk ars-btn-slate ars-hand-btn" id="ars-hand-btn" onclick="arsToggleHand()" aria-pressed="${_ars.inHand}">
                ${_ars.inHand ? 'VIEW WEAPON' : 'HOLD WEAPON'}</button>
        </div>`;
    if (_ars.inHand) {
        const c = document.getElementById('ars-hand');
        c.addEventListener('pointerdown', () => _shotKick(_ars.fx, performance.now()));
        if (!_ars.raf) _ars.raf = requestAnimationFrame(_arsHandLoop);
    } else _arsFitGun(false);
}

function _arsRenderSide() {
    const wid = _ars.weapon, w = _WEAPON_DATA[wid], st = _arsStats(wid), owned = _arsOwned(), eq = _arsEquippedSkin(wid);
    const acc = st.shots ? Math.round(st.hits / st.shots * 100) + '%' : '-';
    const unlock = _arsSkinsOf(wid).find(s => s.unlock);
    let progress = '';
    if (unlock && !owned.has(unlock.id)) {
        const need = unlock.unlock.kills, have = Math.min(st.kills, need);
        progress = `<div class="ars-unlock">
            <span class="ars-unlock-icon">${_arsIcon(wid, unlock.id)}</span>
            <div class="ars-unlock-body">
                <div class="ars-unlock-line"><span>${have >= need
                    ? `<b>${unlock.name}</b> unlocks after your next match`
                    : `Unlock <b>${unlock.name}</b> at ${need} kills`}</span><span class="ars-unlock-n">${have} / ${need}</span></div>
                <div class="ars-bar"><span class="ars-bar-fill ars-fill-gold" style="width:${Math.max(3, Math.round(have / need * 100))}%"></span></div>
            </div>
        </div>`;
    } else if (unlock) {
        progress = `<div class="ars-unlock ars-unlock-done">${ico('badge-check')}<span>All unlockable skins earned</span></div>`;
    }
    const box = (label, val, cls = '') => `<div class="ars-stat${cls}"><span class="ars-stat-label">${label}</span><span class="ars-stat-val">${val}</span></div>`;
    document.getElementById('ars-stats').innerHTML = `
        <h3 class="ars-tray-title">YOUR ${w.name.toUpperCase()} STATS</h3>
        <div class="ars-stat-grid">
            ${box('KILLS', st.kills.toLocaleString(), ' ars-stat-kills')}${box('ZOMBIE KILLS', st.zombieKills.toLocaleString())}
            ${box('ACCURACY', acc)}${box('TOTAL DAMAGE', st.damage.toLocaleString())}
        </div>
        ${progress}`;

    const p = currentProfile || {};
    const cards = [{ id: NO_WSKIN, name: 'Standard' }].concat(_arsSkinsOf(wid)).map(s => {
        const isStd = s.id === NO_WSKIN, has = isStd || owned.has(s.id), isEq = s.id === eq;
        const rar = isStd ? { label: 'STANDARD', color: '#C9D4DA' } : ARS_RARITY[s.rarity];
        let foot;
        if (isEq) foot = `<span class="ars-badge ars-badge-gold">${ico('check')}EQUIPPED</span>`;
        else if (has) foot = `<button type="button" class="ars-blk ars-btn-green ars-mini" onclick="arsEquip('${s.id}')">EQUIP</button>`;
        else if (s.unlock) foot = `<span class="ars-badge ars-badge-lock">${ico('lock')}${s.unlock.kills} kills</span>`;
        else if (s.season) foot = `<span class="ars-badge ars-badge-lock">${ico('lock')}SEASON ITEM</span>`;
        else {
            const gem = !!s.price.diamonds, cost = gem ? s.price.diamonds : s.price.coins;
            const short = (gem ? (p.diamonds || 0) : (p.coins ?? 1000)) < cost;
            foot = `<button type="button" class="ars-blk ars-btn-gold ars-mini${short ? ' is-short' : ''}" onclick="arsAskBuy('${s.id}')" aria-label="Buy ${s.name} for ${cost} ${gem ? 'diamonds' : 'coins'}">${ico(gem ? 'gem' : 'coins')}${cost.toLocaleString()}</button>`;
        }
        return `<div class="ars-skin${s.id === _ars.skin ? ' is-sel' : ''}${isEq ? ' is-eq' : ''}${has ? '' : ' is-locked'}" data-skin="${s.id}" style="--rc:${rar.color}">
            <button type="button" class="ars-skin-face" onclick="arsPreviewSkin('${s.id}')" aria-label="Preview ${s.name}" aria-pressed="${s.id === _ars.skin}">
                <span class="ars-skin-rar">${rar.label}</span>
                <span class="ars-skin-icon">${_arsIcon(wid, s.id)}</span>
                <span class="ars-skin-name">${s.name}</span>
            </button>
            <div class="ars-skin-foot">${foot}</div>
        </div>`;
    });
    const nOwned = 1 + _arsSkinsOf(wid).filter(s => owned.has(s.id)).length;
    document.getElementById('ars-skins').innerHTML = `
        <div class="ars-tray-head"><h3 class="ars-tray-title">${w.name.toUpperCase()} SKINS</h3><span class="ars-tray-note">${nOwned} / ${cards.length} owned</span></div>
        <div class="ars-skin-grid">${cards.join('')}</div>`;
}

function _arsRender() { _arsRenderTabs(); _arsRenderList(); _arsRenderMain(); _arsRenderSide(); }

async function openArsenal(weaponId, skinId) {
    _arsWarm();
    await Promise.all([WEAPONS_ART_READY, WEAPON_SKIN_ART_READY, WEAPON_SKIN_CATALOG_READY]);
    if (!WEAPONS.length) return;
    _ars.weapon = _WEAPON_DATA[weaponId] ? weaponId : (_WEAPON_DATA[selectedWeapon] ? selectedWeapon : DEFAULT_WEAPON);
    _ars.cls = _arsClassOf(_ars.weapon);
    const sk = _arsSkin(skinId);
    _ars.skin = sk && sk.weapon === _ars.weapon ? skinId : _arsEquippedSkin(_ars.weapon);
    _ars.inHand = false;
    _arsSetMoney();
    _arsRender();
    const scr = document.getElementById('screen-arsenal');
    scr.classList.remove('is-closing');
    scr.style.display = 'flex';          // starts the arrival animation (style.css: arsIn, and the lobby fades out under it)
    _arsFit();
    document.body.classList.add('arsenal-open');
    document.addEventListener('keydown', _arsKey);
    const back = scr.querySelector('.ars-back'); if (back) back.focus({ preventScroll: true, focusVisible: false });
}
// Leaving plays the arrival backwards: the screen fades and sinks while the lobby fades back in under it, and
// only then is it hidden.
function closeArsenal() {
    const scr = document.getElementById('screen-arsenal');
    if (scr.style.display === 'none' || scr.classList.contains('is-closing')) return;
    closeArsConfirm();
    document.removeEventListener('keydown', _arsKey);
    if (_ars.raf) { cancelAnimationFrame(_ars.raf); _ars.raf = 0; }
    document.body.classList.remove('arsenal-open');
    _applyWeaponUI();
    const onEnd = e => { if (e.target === scr) finish(); };
    const finish = () => {
        scr.removeEventListener('animationend', onEnd);
        if (!scr.classList.contains('is-closing')) return;
        scr.classList.remove('is-closing');
        scr.style.display = 'none';
        const ring = document.getElementById('weapon-ring'); if (ring) ring.focus({ preventScroll: true });
    };
    scr.classList.add('is-closing');
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    scr.addEventListener('animationend', onEnd);
    setTimeout(finish, 450);   // if the animation never reports (a hidden tab)
}
function _arsKey(e) {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('ars-confirm').hidden) closeArsConfirm(); else closeArsenal();
}
function arsSelectWeapon(id) {
    if (!_WEAPON_DATA[id]) return;
    _ars.weapon = id;
    _ars.cls = _arsClassOf(id);
    _ars.skin = _arsEquippedSkin(id);
    _arsRender();
}
// A click on a skin changes only what the skin changes (the card ring, the skin line, the bullet colour, the
// gun): no panel is rebuilt, so nothing is fetched or decoded again and the frame stays light.
function arsPreviewSkin(id) {
    const sk = _arsSkin(id);
    if (id !== NO_WSKIN && (!sk || sk.weapon !== _ars.weapon)) return;
    if (id === _ars.skin) return;
    _ars.skin = id;
    const wid = _ars.weapon, eq = _arsEquippedSkin(wid), accent = _arsAccent(wid, id);
    const shown = sk ? `${sk.name} · ${ARS_RARITY[sk.rarity].title}` : 'Standard';
    const main = document.getElementById('ars-main');
    main.querySelector('.ars-main-skin').innerHTML = id === eq ? `Skin: <b>${shown}</b>` : `Previzualizare: <b>${shown}</b>`;
    main.querySelector('.ars-bullet-chip').style.setProperty('--ac', accent);
    main.querySelector('.ars-bullet-nm').textContent = _arsColorName(accent);
    for (const card of document.querySelectorAll('#ars-skins .ars-skin')) {
        const on = card.dataset.skin === id;
        card.classList.toggle('is-sel', on);
        card.querySelector('.ars-skin-face').setAttribute('aria-pressed', String(on));
    }
    if (!_ars.inHand) _arsFitGun(true);   // in the hand view the canvas reads _ars.skin every frame
}
// the gun for the match (selectWeapon: the loadout points start again for the new gun)
function arsUseInMatch() {
    if (selectedWeapon === _ars.weapon) return;
    selectWeapon(_ars.weapon);
    _arsRenderList(); _arsRenderMain();
}
function arsToggleHand() {
    _ars.inHand = !_ars.inHand;
    if (!_ars.inHand && _ars.raf) { cancelAnimationFrame(_ars.raf); _ars.raf = 0; }
    _arsRenderMain();
}
// The player holding the gun, the match's own drawing: the character skin they have on, the weapon skin
// previewed, aiming right. A click fires (recoil and the muzzle flash at the skin's barrel).
function _arsHandLoop(now) {
    _ars.raf = 0;
    const c = document.getElementById('ars-hand');
    if (!c || !_ars.inHand || document.getElementById('screen-arsenal').style.display === 'none') return;
    _ars.raf = requestAnimationFrame(_arsHandLoop);
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * _ars.k;   // the screen may be scaled down (_arsFit): one canvas pixel per device pixel
    const cw = Math.max(1, Math.round(c.clientWidth * dpr)), ch = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const skin = _ars.skin === NO_WSKIN ? null : _ars.skin;
    const look = _gunLook(_ars.weapon, skin);
    const back = _playerRingR() + 8, front = (look ? look.muzzle[1] : 60) + 22, half = _playerRingR() + 10;
    const px = Math.min(cw / (back + front), ch / (half * 2)); // device px per world unit
    ARArena.beginFrame(px, now);
    ctx.setTransform(px, 0, 0, px, (cw - (back + front) * px) / 2 + back * px, ch / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const entry = _ars.entries[selectedCharacterId] || (_ars.entries[selectedCharacterId] = _makeSkinEntry(selectedCharacterId));
    _drawPlayerFigure(ctx, ctx.getTransform(), 0, 0, -Math.PI / 2, entry, _ars.weapon, px, '#46D17C', 'rgba(70,209,124,0.14)', _ars.fx, now, skin);
    // a mythic skin's pollen (SKIN EFFECTS), in the same world transform
    const fdt = Math.min(0.05, Math.max(0, (now - _ars.lastT) / 1000)); _ars.lastT = now;
    if (_SKINFX.full && look && look.fx && look.fx.pollen) ARSkinFx.emitPollen(_ars.pool, _ars.em, look.fx, 0, 0, -Math.PI / 2, PLAYER_VISUAL_SCALE, fdt, Math.random);
    if (_ars.pool.n) { ARSkinFx.step(_ars.pool, fdt); _drawSkinPollen(ctx, _ars.pool, px); }
}

async function _arsPost(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ nickname: currentNickname, token: sessionToken }, body)) }).then(r => r.json());
}
async function arsEquip(skinId) {
    if (_ars.busy || !currentNickname) return;
    _ars.busy = true;
    const wid = _ars.weapon;
    try {
        const r = await _arsPost('/api/weapon-skins/equip', { weapon: wid, skinId });
        if (!r.ok) { showToast(r.error || 'Could not equip skin'); return; }
        if (currentProfile) currentProfile.equipped_weapon_skins = r.equipped || {};
        if (_ars.weapon === wid) _ars.skin = skinId;
        _arsRender();
    } catch { showToast('Network error. Please try again.'); }
    finally { _ars.busy = false; }
}
// Buying asks first. Not enough money: a short note, no request.
function arsAskBuy(skinId) {
    const s = _arsSkin(skinId);
    if (!s || !s.price || _ars.busy) return;
    const p = currentProfile || {}, gem = !!s.price.diamonds, cost = gem ? s.price.diamonds : s.price.coins;
    const have = gem ? (p.diamonds || 0) : (p.coins ?? 1000);
    if (have < cost) { showToast(`You need ${(cost - have).toLocaleString()} more ${gem ? 'diamonds' : 'coins'} for ${s.name}`); return; }
    _ars.buy = skinId;
    arsPreviewSkin(skinId);
    document.getElementById('ars-confirm-icon').innerHTML = _arsIcon(s.weapon, skinId);
    document.getElementById('ars-confirm-title').textContent = `BUY ${s.name.toUpperCase()}?`;
    document.getElementById('ars-confirm-text').innerHTML =
        `${ARS_RARITY[s.rarity].title} skin for ${WEAPON_ART.byId[s.weapon].name}. Costs <b>${ico(gem ? 'gem' : 'coins')}${cost.toLocaleString()}</b> ${gem ? 'diamonds' : 'coins'}; you will have ${(have - cost).toLocaleString()} left.`;
    const btn = document.getElementById('ars-confirm-buy');
    btn.disabled = false; btn.textContent = 'BUY';
    document.getElementById('ars-confirm').hidden = false;
    btn.focus({ preventScroll: true });
}
function closeArsConfirm() {
    const el = document.getElementById('ars-confirm');
    if (el) el.hidden = true;
    _ars.buy = null;
}
async function confirmArsBuy() {
    const skinId = _ars.buy, s = _arsSkin(skinId);
    if (!s || _ars.busy) return;
    _ars.busy = true;
    const btn = document.getElementById('ars-confirm-buy');
    btn.disabled = true; btn.textContent = '...';
    try {
        const r = await _arsPost('/api/weapon-skins/buy', { skinId });
        closeArsConfirm();
        if (!r.ok) { showToast(r.error || 'Could not buy skin'); return; }
        if (currentProfile) {
            currentProfile.coins = r.coins; currentProfile.diamonds = r.diamonds;
            if (Array.isArray(r.owned)) currentProfile.owned_weapon_skins = r.owned;
        }
        _arsSetMoney();
        if (_ars.weapon === s.weapon) _ars.skin = skinId;
        _arsRender();
        showToast(`You bought ${s.name}. Tap EQUIP to use it.`);
    } catch { closeArsConfirm(); showToast('Network error. Please try again.'); }
    finally { _ars.busy = false; }
}

// "Skin deblocat": the server says so at the end of a match (weapon-skin-unlocked); the notice waits for the
// lobby and opens the Arsenal on that skin
const _wskinNotices = [];
function queueWeaponSkinNotice(skins) {
    for (const s of skins || []) if (s && s.id && !_wskinNotices.some(n => n.id === s.id)) _wskinNotices.push(s);
    showWeaponSkinNotice();
}
function showWeaponSkinNotice() {
    const el = document.getElementById('wskin-notice');
    const lobby = document.getElementById('screen-lobby');
    if (!el || !lobby || lobby.style.display === 'none' || !_wskinNotices.length) { if (el && !_wskinNotices.length) el.hidden = true; return; }
    const s = _wskinNotices[0], gun = WEAPON_ART.byId[s.weapon];
    document.getElementById('wskin-notice-icon').innerHTML = _arsIcon(s.weapon, s.id);
    document.getElementById('wskin-notice-name').textContent = `${s.name}${gun ? ' for ' + gun.name : ''}`;
    el.hidden = false;
}
function openWeaponSkinNotice() {
    const s = _wskinNotices.shift();
    document.getElementById('wskin-notice').hidden = true;
    if (s) openArsenal(s.weapon, s.id);
}
function dismissWeaponSkinNotice() {
    _wskinNotices.shift();
    document.getElementById('wskin-notice').hidden = true;
    showWeaponSkinNotice();
}
// ─────────────────────────────────────────────────────────────────────────────

function openCharacterShop() {
    const overlay = document.getElementById('char-shop-overlay');
    if (!overlay) return;
    const p = currentProfile || {};
    const shopCoinsEl = document.getElementById('shop-coins');
    const shopDiamEl  = document.getElementById('shop-diamonds');
    if (shopCoinsEl) shopCoinsEl.textContent = (p.coins ?? 1000).toLocaleString();
    if (shopDiamEl)  shopDiamEl.textContent  = p.diamonds || 0;
    overlay.style.display = 'flex';
    _currentShopFilter = 'all';
    document.querySelectorAll('.csf-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.csf-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');
    renderCharShopGrid('all');
}

function closeCharacterShop() {
    const overlay = document.getElementById('char-shop-overlay');
    if (overlay) overlay.style.display = 'none';
}

function filterCharShop(rarity, btn) {
    _currentShopFilter = rarity;
    document.querySelectorAll('.csf-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderCharShopGrid(rarity);
}

function renderCharShopGrid(filter) {
    const grid = document.getElementById('char-shop-grid');
    if (!grid) return;
    const chars = filter === 'all' ? CHARACTERS : CHARACTERS.filter(c => c.rarity === filter);
    const p  = currentProfile || {};
    const xp = p.xp || 0;
    let playerLevel = 1, lvlInc = 100, lvlThresh = 0;
    for (let n = 2; n <= 50; n++) {
        lvlThresh += lvlInc;
        if (xp >= lvlThresh) playerLevel = n; else break;
        if (n >= 3) lvlInc += 50;
    }
    grid.innerHTML = chars.map(char => {
        const isUnlocked = unlockedCharacters.includes(char.id);
        const isSelected = char.id === selectedCharacterId;
        const col        = RARITY_COLOR[char.rarity];
        const coins      = p.coins    ?? 1000;
        const diamonds   = p.diamonds || 0;
        const lvlOk      = playerLevel >= char.level;
        const costOk     = char.diamonds > 0 ? diamonds >= char.diamonds : coins >= char.coins;
        const canAfford  = isUnlocked || (lvlOk && costOk);
        const costStr    = char.diamonds > 0 ? `${ico('gem')} ${char.diamonds}` : (char.coins === 0 ? 'GRATUIT' : `${ico('coins')} ${char.coins.toLocaleString()}`);
        const lvlStr     = char.level > 1 ? ` · LV ${char.level}+` : '';
        let actionBtn;
        if (isUnlocked) {
            actionBtn = isSelected
            ? `<button class="cs-action-btn cs-selected-btn">${ico('check')} SELECTED</button>`
                : `<button class="cs-action-btn cs-select-btn" onclick="selectCharacter('${char.id}');closeCharacterShop()">SELECT</button>`;
        } else if (!char.shop) {
            // TODO: season skins are granted through admin or code, never sold here
            actionBtn = `<button class="cs-action-btn cs-locked-btn" disabled>SEASON</button>`;
        } else if (canAfford) {
            actionBtn = `<button class="cs-action-btn cs-unlock-btn" onclick="unlockCharacter('${char.id}',this)">${costStr}${lvlStr}</button>`;
        } else {
            actionBtn = `<button class="cs-action-btn cs-locked-btn" disabled>${costStr}${lvlStr}</button>`;
        }
        const shopImgStyle = '';
        return `<div class="char-shop-card cs-r-${char.rarity}${isSelected ? ' cs-card-selected' : ''}${!isUnlocked ? ' cs-card-locked' : ''}" style="--rc:${col}">
            <div class="cs-img-outer">
                <div class="cs-img-wrap">
                    <img src="${skinPreviewSrc(char.id, SKIN_PREVIEW.full)}" alt="${char.name}"${shopImgStyle} onerror="this.style.opacity='.25'">
                    ${!isUnlocked ? `<div class="cs-lock-overlay">${ico('lock')}</div>` : ''}
                </div>
                ${isSelected ? `<div class="cs-selected-badge">${ico('check')}</div>` : ''}
                ${char.isNew ? '<div class="cs-new-badge">NEW</div>' : ''}
            </div>
            <div class="cs-title">
                <div class="cs-char-name">${char.name.toUpperCase()}</div>
                <div class="cs-rarity-label" style="color:${col}">${RARITY_LABEL[char.rarity]}</div>
            </div>
            ${actionBtn}
        </div>`;
    }).join('');
}

async function unlockCharacter(id, btn) {
    if (!currentNickname || !sessionToken) return;
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = '...';
    try {
        const data = await fetch('/api/characters/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, characterId: id })
        }).then(r => r.json());
        if (!data.ok) {
            btn.disabled = false;
            btn.textContent = origText;
            alert(data.error || 'Could not unlock this character.');
            return;
        }
        if (currentProfile) {
            currentProfile.coins    = data.coins;
            currentProfile.diamonds = data.diamonds;
        }
        unlockedCharacters = data.unlocked_characters;
        const shopCoinsEl = document.getElementById('shop-coins');
        const shopDiamEl  = document.getElementById('shop-diamonds');
        if (shopCoinsEl) shopCoinsEl.textContent = data.coins.toLocaleString();
        if (shopDiamEl)  shopDiamEl.textContent  = data.diamonds;
        const coinsEl = document.getElementById('lp-coins');
        const diamEl  = document.getElementById('lp-crystals');
        if (coinsEl) coinsEl.textContent = data.coins.toLocaleString();
        if (diamEl)  diamEl.textContent  = data.diamonds;
        selectCharacter(id);
        renderCharShopGrid(_currentShopFilter);
    } catch {
        btn.disabled = false;
        btn.textContent = origText;
        alert('Network error.');
    }
}

// ---------- FRIENDS SYSTEM ----------
let friendsData = { friends: [], pendingIncoming: [], pendingOutgoing: [] };

async function loadFriends() {
    try {
        const res = await fetch('/api/friends/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken })
        });
        const data = await res.json();
        if (data.friends)         friendsData.friends         = data.friends;
        // server returns [{nickname}] arrays for pending — normalize to strings
        if (data.pendingIncoming) friendsData.pendingIncoming = data.pendingIncoming.map(x => x.nickname || x);
        if (data.pendingOutgoing) friendsData.pendingOutgoing = data.pendingOutgoing.map(x => x.nickname || x);
        updateFriendNotificationBadge(friendsData.pendingIncoming.length);
        renderFriendsPanel();
    } catch {}
}

function updateFriendNotificationBadge(count) {
    const navBadge    = document.getElementById('friends-nav-badge');
    const mobileBadge = document.getElementById('friends-tab-badge');
    const show = count > 0;
    if (navBadge)    { navBadge.textContent    = count; navBadge.style.display    = show ? '' : 'none'; }
    if (mobileBadge) { mobileBadge.textContent = count; mobileBadge.style.display = show ? '' : 'none'; }
}

function openFriendsPanel() {
    const overlay = document.getElementById('friends-overlay');
    if (overlay) overlay.style.display = 'flex';
    renderFriendsPanel();
}

function closeFriendsPanel() {
    const overlay = document.getElementById('friends-overlay');
    if (overlay) overlay.style.display = 'none';
    const searchInput = document.getElementById('friends-search-input');
    const searchResults = document.getElementById('friends-search-results');
    if (searchInput)  searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';
}

const _LVL_XP = (() => {
    const t = [0, 0]; let inc = 100;
    for (let n = 2; n <= 50; n++) { t.push(t[t.length - 1] + inc); if (n >= 3) inc += 50; }
    return t;
})();
function getLevelFromXP(xp) {
    for (let n = _LVL_XP.length - 1; n >= 1; n--) { if (xp >= _LVL_XP[n]) return n; }
    return 1;
}

function renderFriendsPanel() {
    const pendingList = document.getElementById('friends-pending-list');
    const friendsList  = document.getElementById('friends-list');
    const pendingSection = document.getElementById('friends-pending-section');

    if (pendingList) {
        if (friendsData.pendingIncoming.length === 0) {
            pendingList.innerHTML = '';
            if (pendingSection) pendingSection.style.display = 'none';
        } else {
            if (pendingSection) pendingSection.style.display = '';
            pendingList.innerHTML = friendsData.pendingIncoming.map(nick => `
                <div class="pending-row">
                    <span class="pending-nick">${escapeHtml(nick)}</span>
                    <div class="pending-actions">
                        <button class="pending-accept" onclick="respondFriendRequest('${escapeHtml(nick)}','accept')">Accept</button>
                        <button class="pending-reject" onclick="respondFriendRequest('${escapeHtml(nick)}','reject')">Reject</button>
                    </div>
                </div>
            `).join('');
        }
    }

    if (friendsList) {
        if (friendsData.friends.length === 0) {
            friendsList.innerHTML = '<div class="friends-empty">No friends yet. Search by username!</div>';
        } else {
            friendsList.innerHTML = friendsData.friends.map(f => {
                const lvl   = getLevelFromXP(f.xp || 0);
                const tier  = getTier(lvl);
                const rankName = ['Recruit','Novice','Scout','Survivor','Hunter','Duelist','Raider','Mercenary','Assaulter','Veteran','Eliminator','Striker','Gladiator','Dominator','Executor','Predator','Berserker','Shadow','Phantom','Ravager','Titan','Conqueror','Warlord','Bloodhound','Reaper','Destroyer','Overkiller','Nemesis','Juggernaut','Annihilator','Apex Hunter','Void Walker','Deathbringer','Skullcrusher','Iron Legend','Chaos Knight','Doom Slayer','Inferno Lord','Storm Bringer','War Titan','Eternal Fang','Dark Sovereign','Oblivion','Cataclysm','Supreme Predator','Immortal','Ascendant','Mythic','Legendary','Battle Royale God'][lvl - 1] || 'Recruit';
                return `
                <div class="friend-row">
                    <span class="friend-online-dot ${f.online ? 'online' : ''}"></span>
                    <div class="friend-info">
                        <span class="friend-nick">${escapeHtml(f.nickname)}</span>
                        <span class="friend-rank-txt" style="color:${tier.color}">${rankName}</span>
                    </div>
                    <div class="friend-right">
                        <span class="friend-lv-badge" style="border-color:${tier.color};color:${tier.color}">LV ${lvl}</span>
                        <span class="friend-status">${f.online ? 'Online' : 'Offline'}</span>
                    </div>
                    <button class="friend-remove-btn" onclick="removeFriend('${escapeHtml(f.nickname)}')" title="Remove friend">${ico('x')}</button>
                </div>`;
            }).join('');
        }
    }
}

async function searchFriend() {
    const input = document.getElementById('friends-search-input');
    const resultsEl = document.getElementById('friends-search-results');
    if (!input || !resultsEl) return;
    const query = input.value.trim();
    if (!query) { resultsEl.innerHTML = ''; return; }
    try {
        const res = await fetch('/api/friends/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, query })
        });
        const data = await res.json();
        // server returns { players: [{nickname, xp}] }
        const players = data.players || [];
        if (players.length === 0) {
            resultsEl.innerHTML = '<div class="friends-empty">No players found.</div>';
            return;
        }
        resultsEl.innerHTML = players.map(p => {
            const nick = p.nickname;
            const isFriend  = friendsData.friends.some(f => f.nickname === nick);
            const isPending = friendsData.pendingOutgoing.includes(nick) || friendsData.pendingIncoming.includes(nick);
            let btn = '';
            if (isFriend)        btn = '<span class="search-already-friend">Friend</span>';
            else if (isPending)  btn = '<span class="search-already-friend">Request sent</span>';
            else                 btn = `<button class="pending-accept" onclick="sendFriendRequest('${escapeHtml(nick)}')">Add</button>`;
            return `<div class="friend-row">${escapeHtml(nick)}<span style="flex:1"></span>${btn}</div>`;
        }).join('');
    } catch {
        resultsEl.innerHTML = '<div class="friends-empty">Network error.</div>';
    }
}

async function sendFriendRequest(target) {
    try {
        const res = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, target })
        });
        const data = await res.json();
        if (data.ok) {
            if (!friendsData.pendingOutgoing.includes(target)) friendsData.pendingOutgoing.push(target);
            searchFriend();
        } else {
            alert(data.error || 'Could not send friend request.');
        }
    } catch {
        alert('Network error.');
    }
}

async function respondFriendRequest(requester, action) {
    try {
        const res = await fetch('/api/friends/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, requester, action })
        });
        const data = await res.json();
        if (data.ok) {
            friendsData.pendingIncoming = friendsData.pendingIncoming.filter(n => n !== requester);
            if (action === 'accept') {
                if (!friendsData.friends.some(f => f.nickname === requester)) {
                    friendsData.friends.push({ nickname: requester, online: false });
                }
            }
            updateFriendNotificationBadge(friendsData.pendingIncoming.length);
            renderFriendsPanel();
        } else {
            alert(data.error || 'Something went wrong.');
        }
    } catch {
        alert('Network error.');
    }
}

async function removeFriend(target) {
    try {
        const res = await fetch('/api/friends/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, target })
        });
        const data = await res.json();
        if (data.ok) {
            friendsData.friends = friendsData.friends.filter(f => f.nickname !== target);
            renderFriendsPanel();
        }
    } catch {}
}

function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---------- AUTH STATE ----------
let currentNickname = '';
let currentPassword = '';
let sessionToken    = '';
let currentProfile  = null;
let _sessionSocket  = null;

function showForceLogout(msg) {
    if (_sessionSocket) { _sessionSocket.disconnect(); _sessionSocket = null; }
    const overlay = document.createElement('div');
    overlay.className = 'ar-forcelogout';
    overlay.innerHTML = `
        <div class="ar-forcelogout-title">${ico('triangle-alert')}Deconectat</div>
        <div class="ar-forcelogout-msg">${msg}</div>
        <button onclick="location.reload()">OK</button>
    `;
    document.body.appendChild(overlay);
}

// ---------- NEW BUILD ----------
// The server sends every new socket its build (server.js BUILD, the same one stamped into this page as
// AR_BUILD). On another build the page reloads, so it never runs old code against new files. A server
// restart drops the socket (no auto-reconnect), so after an unexpected disconnect we ask /api/build until
// the server answers.
let _buildReloading = false;
function _checkBuild(build) {
    if (!build || !AR_BUILD || build === AR_BUILD || _buildReloading) return;
    // a page that still has the old build after reloading for this one (an HTML cache in between): stop, no loop
    try {
        if (sessionStorage.getItem('ar_reload_for') === build) return;
        sessionStorage.setItem('ar_reload_for', build);
    } catch (e) { /* storage blocked: reload anyway */ }
    _buildReloading = true;
    const overlay = document.createElement('div');
    overlay.className = 'ar-forcelogout ar-newbuild';
    overlay.innerHTML = `<div class="ar-forcelogout-title">${ico('refresh-cw')}New version detected. Reloading...</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => location.reload(), 2000);
}
function _watchBuild(socket) {
    socket.on('build', _checkBuild);
    socket.on('proto-mismatch', () => _checkBuild('proto'));   // this page speaks another state packet than the server: reload once
    socket.on('disconnect', reason => {
        if (reason === 'io client disconnect') return; // we closed it ourselves
        let tries = 0;
        const probe = () => fetch('/api/build', { cache: 'no-store' })
            .then(r => r.json()).then(d => _checkBuild(d.build))
            .catch(() => { if (++tries < 40) setTimeout(probe, 3000); }); // server still down: try for ~2 min
        setTimeout(probe, 1500);
    });
    return socket;
}

function createSessionSocket() {
    if (_sessionSocket) { _sessionSocket.disconnect(); }
    const _ioOpts = typeof msgpackParser !== 'undefined'
        ? { parser: msgpackParser, transports: ['websocket'], reconnection: false }
        : { transports: ['websocket'], reconnection: false };
    _sessionSocket = _watchBuild(io(_ioOpts));
    _sessionSocket.emit('authenticate', { nickname: currentNickname, token: sessionToken });
    _sessionSocket.on('force-logout', showForceLogout);

    // server sends array of online friend nicknames
    _sessionSocket.on('friends-online-status', (onlineNicks) => {
        friendsData.friends.forEach(f => {
            f.online = onlineNicks.includes(f.nickname);
        });
        renderFriendsPanel();
    });

    // server sends { nickname } object
    _sessionSocket.on('friend-online', ({ nickname: nick }) => {
        const f = friendsData.friends.find(f => f.nickname === nick);
        if (f) { f.online = true; renderFriendsPanel(); }
    });

    _sessionSocket.on('friend-offline', ({ nickname: nick }) => {
        const f = friendsData.friends.find(f => f.nickname === nick);
        if (f) { f.online = false; renderFriendsPanel(); }
    });

    // server sends { from: nickname }
    _sessionSocket.on('friend-request-incoming', ({ from: requester }) => {
        if (!friendsData.pendingIncoming.includes(requester)) {
            friendsData.pendingIncoming.push(requester);
            updateFriendNotificationBadge(friendsData.pendingIncoming.length);
            renderFriendsPanel();
            showFriendRequestToast(requester);
        }
    });

    // server sends { by: nickname, xp, online }
    _sessionSocket.on('friend-accepted', ({ by: nick, xp, online }) => {
        friendsData.pendingOutgoing = friendsData.pendingOutgoing.filter(n => n !== nick);
        if (!friendsData.friends.some(f => f.nickname === nick)) {
            friendsData.friends.push({ nickname: nick, online: !!online, xp: xp || 0 });
        }
        renderFriendsPanel();
        showToast(`${nick} accepted your friend request!`);
    });

    // server sends { nickname, xp, online } — new friend added on acceptor side
    _sessionSocket.on('friend-added', ({ nickname: nick, xp, online }) => {
        if (!friendsData.friends.some(f => f.nickname === nick)) {
            friendsData.friends.push({ nickname: nick, online: !!online, xp: xp || 0 });
            renderFriendsPanel();
        }
    });

    // server sends { by: nickname } — celălalt te-a șters din prieteni
    _sessionSocket.on('friend-removed', ({ by: nick }) => {
        friendsData.friends = friendsData.friends.filter(f => f.nickname !== nick);
        renderFriendsPanel();
    });

    _sessionSocket.on('room-invite', ({ from, roomCode }) => {
        showRoomInvitePopup(from, roomCode);
    });

    _sessionSocket.on('invite-result', ({ ok, msg }) => {
        showToast(msg);
    });

    _sessionSocket.on('invite-declined', ({ by }) => {
        showToast(`${by} declined the invite.`);
    });

    return _sessionSocket;
}

function showFriendRequestToast(requester) {
    showToast(`${requester} sent you a friend request!`);
}

function showToast(msg) {
    let toast = document.getElementById('ar-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ar-toast';
        toast.className = 'ar-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    document.getElementById('form-login').style.display    = isLogin ? 'flex' : 'none';
    document.getElementById('form-register').style.display = isLogin ? 'none' : 'flex';
}

function authSuccess(nickname, password, player, token) {
    currentNickname = nickname;
    currentPassword = password;
    currentProfile  = player;
    sessionToken    = token || '';
    unlockedCharacters = Array.isArray(player.unlocked_characters) && player.unlocked_characters.length ? player.unlocked_characters : [DEFAULT_SKIN];
    localStorage.setItem('ar_nickname', nickname);

    // Prioritate: DB daca are valori salvate; altfel localStorage (fallback instant)
    const dbTotal = (player.stat_hp || 0) + (player.stat_dmg || 0) + (player.stat_spd || 0);
    if (dbTotal > 0) {
        stats.hp  = player.stat_hp  || 0;
        stats.dmg = player.stat_dmg || 0;
        stats.spd = player.stat_spd || 0;
    } else {
        try {
            const s = JSON.parse(localStorage.getItem('ar_stats') || 'null');
            if (s && (s.hp || 0) + (s.dmg || 0) + (s.spd || 0) > 0) {
                stats.hp  = Math.min(10, Math.max(0, s.hp  || 0));
                stats.dmg = Math.min(10, Math.max(0, s.dmg || 0));
                stats.spd = Math.min(10, Math.max(0, s.spd || 0));
                if (pointsUsed() > MAX_POINTS) { stats.hp = 0; stats.dmg = 0; stats.spd = 0; }
            }
        } catch {}
    }

    document.getElementById('screen-auth').style.display  = 'none';
    document.getElementById('screen-lobby').style.display = 'flex';
    startLobbyBackground();
    prepopulateLobby();
    _applyWeaponUI();
    createSessionSocket();
    loadFriends();
    setTimeout(_arsWarm, 1500);   // the Arsenal's pictures, once the lobby is up
}

function logoutToAuth() {
    location.reload();
}

async function doLogin() {
    const nickname = (document.getElementById('login-nickname').value || '').trim();
    const password = document.getElementById('login-password').value || '';
    const errorEl  = document.getElementById('login-error');
    const btn      = document.getElementById('login-btn');
    const btnText  = btn.querySelector('.btn-text');

    if (!nickname || !password) { errorEl.textContent = 'Please fill in all fields.'; return; }

    btn.disabled = true;
    btnText.textContent = 'Signing in...';
    errorEl.textContent = '';

    try {
        const res  = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, password })
        });
        const data = await res.json();

        if (!data.ok) {
            errorEl.textContent = '' + data.error;
            btn.disabled = false;
            btnText.textContent = 'SIGN IN';
            return;
        }
        await Promise.all([SKINS_READY, WEAPONS_ART_READY]);
        authSuccess(nickname, password, data.player, data.token);
    } catch {
        errorEl.textContent = 'Network error. Please try again.';
        btn.disabled = false;
        btnText.textContent = 'SIGN IN';
    }
}

async function doRegister() {
    const nickname = (document.getElementById('reg-nickname').value || '').trim();
    const password = document.getElementById('reg-password').value || '';
    const confirm  = document.getElementById('reg-confirm').value  || '';
    const errorEl  = document.getElementById('reg-error');
    const btn      = document.getElementById('reg-btn');
    const btnText  = btn.querySelector('.btn-text');

    if (!nickname || !password || !confirm) { errorEl.textContent = 'Please fill in all fields.'; return; }
    if (password !== confirm) { errorEl.textContent = 'Passwords do not match.'; return; }

    btn.disabled = true;
    btnText.textContent = 'Creating account...';
    errorEl.textContent = '';

    try {
        const res  = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, password })
        });
        const data = await res.json();

        if (!data.ok) {
            errorEl.textContent = '' + data.error;
            btn.disabled = false;
            btnText.textContent = 'CREATE ACCOUNT';
            return;
        }
        await Promise.all([SKINS_READY, WEAPONS_ART_READY]);
        authSuccess(nickname, password, data.player, data.token);
    } catch {
        errorEl.textContent = 'Network error. Please try again.';
        btn.disabled = false;
        btnText.textContent = 'CREATE ACCOUNT';
    }
}

// ---------- NAVIGARE & CAMERA ----------
let pendingRoom = null;
let selectedGamemode = null;

function selectGamemode(mode) {
    selectedGamemode = mode;
    const brCard  = document.getElementById('gm-br');
    const pveCard = document.getElementById('gm-pve');
    const lobby   = document.getElementById('screen-lobby');
    const playBtn = document.getElementById('btn-play');
    const noSel   = document.getElementById('rc-no-sel');
    const modeInfo = document.getElementById('rc-mode-info');
    const bigIcon  = document.getElementById('rc-big-icon');
    const bigName  = document.getElementById('rc-mode-big-name');
    const bigBadge = document.getElementById('rc-mode-badge');
    const bigDesc  = document.getElementById('rc-mode-big-desc');
    const feat1    = document.getElementById('rc-mode-feat-1');
    const feat2    = document.getElementById('rc-mode-feat-2');

    if (brCard)  { brCard.classList.toggle('gm-selected', mode === 'br');  brCard.classList.toggle('gm-deselected', mode !== 'br'); }
    if (pveCard) { pveCard.classList.toggle('gm-selected', mode === 'pve'); pveCard.classList.toggle('gm-deselected', mode !== 'pve'); }
    if (lobby) { lobby.classList.toggle('mode-br', mode === 'br'); lobby.classList.toggle('mode-pve', mode === 'pve'); }

    if (playBtn) playBtn.disabled = false;
    if (noSel)   noSel.style.display   = 'none';
    if (modeInfo) modeInfo.style.display = 'flex';

    const isBr = mode === 'br';
    if (bigIcon)  bigIcon.innerHTML  = ico(isBr ? 'swords' : 'biohazard');
    if (bigName)  bigName.textContent  = isBr ? 'BATTLE ROYALE' : 'SURVIVAL PvE';
    if (bigBadge) bigBadge.textContent = isBr ? 'PvP' : 'CO-OP';
    if (bigDesc)  bigDesc.textContent  = isBr ? 'Be the last player standing' : 'Team up against the horde';
    if (feat1)    feat1.innerHTML      = isBr ? ico('users') + 'Up to 20 players' : ico('handshake') + 'Teams of 2–4 players';
    if (feat2)    feat2.innerHTML      = isBr ? ico('timer') + '~10 min / match' : ico('biohazard') + 'Zombie hordes';
}

function prepopulateLobby() {
    const nameInput = document.getElementById('input-name');
    if (nameInput) nameInput.value = currentNickname || '';

    // The saved skin id (server.js maps an old image URL to its id, or to the default, at login)
    const savedId = currentProfile?.skin;
    selectedCharacterId = savedId && getCharacterById(savedId) && unlockedCharacters.includes(savedId) ? savedId : DEFAULT_SKIN;
    const activeChar = getSelectedCharacter();
    // Arata numele caracterului (ex: "Pharaoh"), nu al jucatorului
    const nameDisplay = document.getElementById('char-name-display');
    if (nameDisplay) nameDisplay.textContent = (activeChar.name || 'NINJA').toUpperCase();
    const preview = document.getElementById('preview');
    if (preview) preview.src = skinPreviewSrc(activeChar.id, SKIN_PREVIEW.hero);
    const rarityRing = document.getElementById('char-rarity-ring');
    if (rarityRing) rarityRing.style.setProperty('--rc', RARITY_COLOR[activeChar.rarity]);
    heroShowSelected();
    // Battle Royale is chosen by default, so PLAY is always ready
    selectGamemode(selectedGamemode || 'br');

    updateStatsUI();

    // ── Left panel population ──
    const p = currentProfile || {};
    const wins  = p.wins_total   || 0;
    const kills = p.kills_total  || 0;
    const games = p.games_played || 0;

    const xp       = p.xp       || 0;
    const coins    = p.coins    ?? 1000;
    const crystals = p.diamonds || 0;

    // Threshold-uri cumulative de XP per nivel (index = nivel)
    // Nivel 2=100, 3=200, 4=350, 5=550 ... (increment creste cu 50 de la nivel 3)
    const LVL_XP = (() => {
        const t = [0, 0]; let inc = 100;
        for (let n = 2; n <= 50; n++) { t.push(t[t.length-1] + inc); if (n >= 3) inc += 50; }
        return t;
    })();
    let level = 1;
    for (let n = LVL_XP.length - 1; n >= 1; n--) { if (xp >= LVL_XP[n]) { level = n; break; } }
    const xpInLvl  = xp - LVL_XP[level];
    const xpNeeded = (LVL_XP[level + 1] || LVL_XP[level] + 9999) - LVL_XP[level];
    const xpPct    = Math.round(Math.min(1, xpInLvl / xpNeeded) * 100);

    const RANKS = [
        'Recruit','Novice','Scout','Survivor','Hunter',
        'Duelist','Raider','Mercenary','Assaulter','Veteran',
        'Eliminator','Striker','Gladiator','Dominator','Executor',
        'Predator','Berserker','Shadow','Phantom','Ravager',
        'Titan','Conqueror','Warlord','Bloodhound','Reaper',
        'Destroyer','Overkiller','Nemesis','Juggernaut','Annihilator',
        'Apex Hunter','Void Walker','Deathbringer','Skullcrusher','Iron Legend',
        'Chaos Knight','Doom Slayer','Inferno Lord','Storm Bringer','War Titan',
        'Eternal Fang','Dark Sovereign','Oblivion','Cataclysm','Supreme Predator',
        'Immortal','Ascendant','Mythic','Legendary','Battle Royale God',
    ];
    const rank = RANKS[Math.min(49, level - 1)];
    const winRate  = games > 0 ? Math.round(wins / games * 100) : 0;

    // Tier color for avatar ring
    const tier = getTier(level);

    // Left panel avatar — use selected character
    const lpAvatarImg = document.getElementById('lp-avatar-img');
    const lpAvatarPh  = document.getElementById('lp-avatar-ph');
    const lpChar = getSelectedCharacter();
    if (lpAvatarImg && lpChar) {
        lpAvatarImg.src = skinPreviewSrc(lpChar.id, SKIN_PREVIEW.avatar);
        lpAvatarImg.style.display = 'block';
        lpAvatarImg.style.border = `3px solid ${tier.color}`;
        lpAvatarImg.style.boxShadow = `0 0 18px ${tier.glow}`;
        if (lpAvatarPh) lpAvatarPh.style.display = 'none';
    }
    if (lpAvatarPh) {
        lpAvatarPh.style.border = `3px solid ${tier.color}`;
        lpAvatarPh.style.boxShadow = `0 0 18px ${tier.glow}`;
    }
    const lpRankEl = document.getElementById('lp-rank');
    if (lpRankEl) lpRankEl.style.color = tier.color;

    const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    _set('lp-level',   'LV ' + level);
    _set('lp-nick',    currentNickname || 'PLAYER');
    _set('lp-rank',    rank);
    _set('lp-xp-txt',  xpInLvl + ' / ' + xpNeeded);
    _set('lp-coins',   coins.toLocaleString());
    _set('lp-crystals', crystals);
    _set('lp-wins',    wins);
    _set('lp-kills',   kills);
    _set('lp-games',   games);
    _set('lp-winrate', winRate + '%');

    const xpFill = document.getElementById('lp-xp-fill');
    if (xpFill) setTimeout(() => { xpFill.style.width = xpPct + '%'; }, 120);

    // ── Right panel: missions ──
    renderMissions(p.missions);

    startEventTimer();
    switchLobbyTab('center');
    showWeaponSkinNotice(); // a skin unlocked in the last match (ARSENAL)
}

// Daily missions come from the server (missions.js): six per day, drawn from a varied pool.
// Each row: progress block, name, mode chip (BR / PvE) or weapon icon, rewards, segmented bar.
let _missionsCache = [];
function renderMissions(list) {
    const el = document.getElementById('lp-missions');
    if (!el) return;
    if (!Array.isArray(list) || !list.length) { el.innerHTML = '<div class="lp-lb-row lp-lb-empty">Loading...</div>'; return; }
    _missionsCache = list;
    const count = document.getElementById('mc-count');
    if (count) count.textContent = list.length;
    // The card shows three: claimable first, then the ones closest to done, claimed last
    const rank = m => m.claimed ? 3 : (m.prog >= m.goal ? 0 : 1 + (1 - m.prog / m.goal));
    const top = list.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    el.innerHTML = top.map(m => {
        const prog = Math.min(m.prog || 0, m.goal);
        const done = prog >= m.goal;
        const pct = Math.min(100, Math.round(prog / m.goal * 100));
        const big = m.goal >= 100;
        const fmt = v => big && v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : v;
        const reward = '<span class="rw rw-coin">+' + m.coins + ico('coins') + '</span>' + (m.diamonds ? '<span class="rw rw-gem">+' + m.diamonds + ico('gem') + '</span>' : '');
        const right = m.claimed ? '<span class="mc-done">' + ico('check') + '</span>'
            : done ? '<button class="mission-claim-btn mc-claim" onclick="claimMission(\'' + m.id + '\',this,' + m.coins + ',' + m.diamonds + ')">Claim</button>'
            : '<span class="mc-reward">' + reward + '</span>';
        return '<div class="mc-row' + (done ? ' is-done' : '') + (m.claimed ? ' is-claimed' : '') + '" id="mission-' + m.id + '">'
            + '<span class="mc-title" title="' + m.title + '">' + m.title + '</span>' + right
            + '<span class="mc-bar"><span class="mc-fill" style="width:' + pct + '%"></span></span>'
            + '<span class="mc-prog">' + fmt(prog) + '<i> / ' + fmt(m.goal) + '</i></span></div>';
    }).join('');
    _renderMissionsFull(list);
}
function openMissions() {
    _renderMissionsFull(_missionsCache);
    const o = document.getElementById('missions-overlay');
    if (o) o.style.display = 'flex';
}
function closeMissions() {
    const o = document.getElementById('missions-overlay');
    if (o) o.style.display = 'none';
}
// Full list for the modal: the detailed mission rows
function _renderMissionsFull(list) {
    const el = document.getElementById('missions-modal-list');
    if (!el || !Array.isArray(list)) return;
    const fmt = (v, big) => big && v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : v;
    el.innerHTML = list.map(m => {
        const prog = Math.min(m.prog || 0, m.goal);
        const done = prog >= m.goal;
        const pct = Math.min(100, Math.round(prog / m.goal * 100));
        const big = m.goal >= 100;
        // the tile says what kind of mission it is: weapon, mode, or general
        const kind = m.weapon ? 'wpn' : m.tag === 'pve' ? 'pve' : m.tag === 'br' ? 'br' : 'gen';
        const tileIco = done ? 'check' : kind === 'pve' ? 'biohazard' : kind === 'br' ? 'swords' : 'target';
        const tileHtml = !done && m.weapon ? ARIcons.weaponHtml(m.weapon, true) : ico(tileIco);
        const tags = (m.tag === 'pve' ? '<span class="mm-tag mm-pve">PvE</span>' : m.tag === 'br' ? '<span class="mm-tag mm-br">BR</span>' : '')
            + (m.weapon ? '<span class="mm-tag mm-wpn">' + ((_WEAPON_DATA[m.weapon] && _WEAPON_DATA[m.weapon].name) || m.weapon).toUpperCase() + '</span>' : '')
            + (m.slot === 'hard' ? '<span class="mm-tag mm-hard">HARD</span>' : '');
        const reward = '<span class="rw rw-coin">+' + m.coins + ico('coins') + '</span>' + (m.diamonds ? '<span class="rw rw-gem">+' + m.diamonds + ico('gem') + '</span>' : '');
        const action = m.claimed ? '<span class="mm-claimed">' + ico('check') + 'Claimed</span>'
            : done ? '<button class="mission-claim-btn mm-claim" onclick="claimMission(\'' + m.id + '\',this,' + m.coins + ',' + m.diamonds + ')">Claim</button>' : '';
        return '<div class="mm-row mm-' + kind + (done ? ' is-done' : '') + (m.claimed ? ' is-claimed' : '') + '" id="mission-full-' + m.id + '">'
            + '<span class="mm-tile">' + tileHtml + '</span>'
            + '<span class="mm-title">' + m.title + '</span>'
            + '<span class="mm-reward">' + reward + '</span>'
            + '<span class="mm-tags">' + tags + '</span>'
            + '<span class="mm-bar"><span class="mm-fill" style="width:' + pct + '%"></span></span>'
            + '<span class="mm-prog">' + fmt(prog, big) + '<i> / ' + fmt(m.goal, big) + '</i></span>'
            + (action ? '<span class="mm-act">' + action + '</span>' : '')
            + '</div>';
    }).join('');
}

async function claimMission(missionId, btn, coinsReward, diamondsReward) {
    if (!currentNickname || !sessionToken) return;
    btn.disabled = true;
    btn.textContent = '...';
    try {
        const res = await fetch('/api/missions/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, missionId })
        });
        const data = await res.json();
        if (!data.ok) { btn.disabled = false; btn.textContent = 'Claim'; return; }

        // Without a database the server only confirms the reward; add it locally
        const coins = data.coins ?? ((currentProfile && currentProfile.coins) || 0) + (data.rewardCoins || coinsReward);
        const diamonds = data.diamonds ?? ((currentProfile && currentProfile.diamonds) || 0) + (data.rewardDiamonds || diamondsReward);
        if (currentProfile) {
            currentProfile.coins = coins;
            currentProfile.diamonds = diamonds;
            if (Array.isArray(data.missions)) currentProfile.missions = data.missions;
        }

        const coinEl = document.getElementById('lp-coins');
        const diamEl = document.getElementById('lp-crystals');
        spawnCoinFly(btn, coinEl, coinsReward, 'coins');
        if (diamondsReward > 0) setTimeout(() => spawnCoinFly(btn, diamEl, diamondsReward, 'gem'), 300);

        const list = Array.isArray(data.missions) ? data.missions
            : _missionsCache.map(x => x.id === missionId ? Object.assign({}, x, { claimed: true }) : x);
        renderMissions(list);
        setTimeout(() => {
            const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            _set('lp-coins', Number(coins).toLocaleString());
            _set('lp-crystals', diamonds);
        }, 900);
    } catch { btn.disabled = false; btn.textContent = 'Claim'; }
}

function spawnCoinFly(fromEl, toEl, amount, icon) {
    if (!fromEl || !toEl) return;
    const fromR = fromEl.getBoundingClientRect();
    const toR   = toEl.getBoundingClientRect();
    const count = Math.min(amount, 8);
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'ar-fly' + (icon === 'gem' ? ' gem' : '');
            el.innerHTML = ico(icon);
            el.style.left = (fromR.left + fromR.width/2) + 'px';
            el.style.top  = (fromR.top + fromR.height/2) + 'px';
            document.body.appendChild(el);
            requestAnimationFrame(() => requestAnimationFrame(() => {
                el.style.left    = (toR.left + toR.width/2) + 'px';
                el.style.top     = (toR.top  + toR.height/2) + 'px';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.4)';
            }));
            setTimeout(() => el.remove(), 750);
        }, i * 80);
    }
}

let _eventTimerInterval = null;

function loadMiniLeaderboard() {
    const el = document.getElementById('lp-mini-lb');
    if (!el) return;
    fetch('/api/leaderboard')
        .then(r => r.json())
        .then(data => {
            const rows = (Array.isArray(data) ? data : []).slice(0, 5);
            if (!rows.length) {
                el.innerHTML = '<div class="lp-lb-row lp-lb-empty">No players yet</div>';
                return;
            }
            el.innerHTML = rows.map((row, i) => {
                const medal  = i + 1;
                const cls    = i < 3 ? ' r' + (i + 1) : '';
                const level  = getLevelFromXP(row.xp || 0);
                const tier   = getTier(level);
                return `<div class="lp-lb-row${cls}">
                    <span class="lp-lb-rank${cls}">${medal}</span>
                    <div class="lp-lb-info">
                        <span class="lp-lb-nick${cls}">${row.nickname}</span>
                        <span class="lp-lb-lv" style="color:${tier.color}">LV ${level} · ${tier.name}</span>
                    </div>
                    <div class="lp-lb-wins">
                        <span class="lp-lb-val">${row.wins_total}</span>
                        <span class="lp-lb-wins-label">wins</span>
                    </div>
                </div>`;
            }).join('');
        })
        .catch(() => {
            if (el) el.innerHTML = '<div class="lp-lb-row lp-lb-empty">Unavailable</div>';
        });
}

function tournamentSignup() {
    showToast('Weekend Tournament registration opens soon.');
}

function stopEventTimer() {
    if (_eventTimerInterval) { clearInterval(_eventTimerInterval); _eventTimerInterval = null; }
}

function startEventTimer() {
    const el = document.getElementById('lp-event-timer');
    if (!el) return;
    if (_eventTimerInterval) clearInterval(_eventTimerInterval);
    const now       = new Date();
    const target    = new Date(now);
    // Next Saturday 20:00; on a Saturday before 20:00 that is today
    const daysToSat = (6 - now.getDay() + 7) % 7;
    target.setDate(now.getDate() + daysToSat);
    target.setHours(20, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 7);
    const pad = v => String(v).padStart(2, '0');
    function tick() {
        const diff = target - Date.now();
        if (diff <= 0) { el.textContent = 'NOW!'; clearInterval(_eventTimerInterval); return; }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor(diff % 86400000 / 3600000);
        const m = Math.floor(diff % 3600000 / 60000);
        const s = Math.floor(diff % 60000 / 1000);
        // more than a day out: days + hours:minutes, so the readout keeps its width
        el.textContent = d > 0 ? d + 'd ' + pad(h) + ':' + pad(m) : pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    tick();
    _eventTimerInterval = setInterval(tick, 1000);
}

function updateOnlineCounter() {
    const el = document.getElementById('lobby-online-count');
    if (!el) return;
    const base = 8 + Math.floor(Math.random() * 12);
    el.textContent = base;
    setTimeout(function drift() {
        const cur   = parseInt(el.textContent) || base;
        const next  = Math.max(5, cur + Math.floor(Math.random() * 5) - 2);
        el.textContent = next;
        setTimeout(drift, 4000 + Math.random() * 3000);
    }, 3000);
}

function switchLobbyTab(which) {
    const panelL = document.querySelector('.lobby-panel-left');
    const panelC = document.querySelector('.lobby-center');
    const panelR = document.querySelector('.lobby-panel-right');
    if (!panelL || !panelC || !panelR) return;

    panelL.classList.remove('tab-active');
    panelR.classList.remove('tab-active');
    panelC.classList.remove('tab-hidden');
    document.querySelectorAll('.lti-btn').forEach(b => b.classList.remove('active'));

    const btn = document.getElementById('tab-' + which);
    if (btn) btn.classList.add('active');

    if (which === 'left') {
        panelL.classList.add('tab-active');
        panelC.classList.add('tab-hidden');
    } else if (which === 'right') {
        panelR.classList.add('tab-active');
        panelC.classList.add('tab-hidden');
    }

    // The layout per tab lives in CSS (style.css: .lobby-body[data-tab]); the play card belongs
    // to the main tab on phones even though it sits in the right column on wide screens.
    const body = document.querySelector('.lobby-body');
    if (body) { body.dataset.tab = which === 'left' || which === 'right' ? which : 'center'; body.scrollTop = 0; }
    // 'center' is default — center already visible, side panels already hidden
}

function leaveWaiting() {
    returnToLobby();
}

function showLeaveConfirm() {
    const overlay = document.getElementById('leave-confirm');
    if (overlay) overlay.style.display = 'flex';
}

function hideLeaveConfirm() {
    const overlay = document.getElementById('leave-confirm');
    if (overlay) overlay.style.display = 'none';
}

function confirmLeaveGame() {
    hideLeaveConfirm();
    returnToLobby();
}

function returnToLobby() {
    hideLeaveConfirm();
    // Distruge joystick-urile, event listener-ele si RAF din sesiunea anterioara
    // Fara asta, la jocul urmator ar exista instante duplicate → joystick blocat
    if (window._gameCleanup) {
        window._gameCleanup();
        window._gameCleanup = null;
    }

    // Deconecteaza socket-ul — declanseaza imediat 'disconnect' pe server
    // Server-ul curata camera: o sterge daca e goala, transfera host daca mai sunt jucatori
    if (window._gameSocket) {
        window._gameSocket.disconnect();
        window._gameSocket = null;
    }

    // Ascunde toate ecranele de joc
    ['screen-game', 'screen-gameover', 'screen-waiting'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // --- Reset complet sala de asteptare ---
    const waitingCode = document.getElementById('waiting-code-display');
    if (waitingCode) waitingCode.textContent = '—';
    const waitingPlayers = document.getElementById('waiting-players');
    if (waitingPlayers) waitingPlayers.innerHTML = '';
    const waitingCount = document.getElementById('waiting-count');
    if (waitingCount) waitingCount.textContent = '0';
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.style.display = 'none';
    const subMsg = document.getElementById('waiting-sub-msg');
    if (subMsg) subMsg.style.display = 'block';

    // --- Reset ecran gameover ---
    const goTitle = document.getElementById('gameover-title');
    const goMsg   = document.getElementById('gameover-msg');
    const goStats = document.getElementById('round-stats-section');
    if (goTitle) goTitle.textContent = 'ELIMINATED!';
    if (goMsg)   goMsg.textContent   = 'You were eliminated';
    if (goStats) goStats.style.display = 'none';
    const rematchBtn = document.getElementById('btn-rematch');
    if (rematchBtn) { rematchBtn.disabled = false; rematchBtn.textContent = 'PLAY AGAIN'; }

    // --- Reset input camera din lobby ---
    const codeInput = document.getElementById('room-code-input');
    if (codeInput) codeInput.value = '';
    const roomErrMsg = document.getElementById('room-error-msg');
    if (roomErrMsg) roomErrMsg.textContent = '';
    const errMsg = document.getElementById('error-msg');
    if (errMsg) errMsg.textContent = '';

    pendingRoom = null;
    selectGamemode(selectedGamemode || 'br');
    heroShowSelected();
    const _noSel = document.getElementById('rc-no-sel');
    const _modeInfo = document.getElementById('rc-mode-info');
    if (_noSel)   _noSel.style.display   = 'flex';
    if (_modeInfo) _modeInfo.style.display = 'none';
    _waitingRoomPlayers = new Set();
    const invBtn = document.getElementById('btn-invite-friends');
    if (invBtn) invBtn.style.display = 'none';

    // Reseteaza UI-ul de joc pentru urmatoarea sesiune
    const _mkEl = document.getElementById('my-kills');
    if (_mkEl) _mkEl.textContent = '0';
    const _paEl = document.getElementById('players-alive');
    if (_paEl) _paEl.textContent = '0';
    const _kfEl = document.getElementById('kill-feed');
    if (_kfEl) _kfEl.innerHTML = '';

    // Revine la lobby cu sesiunea pastrata (fara re-login)
    document.getElementById('screen-lobby').style.display = 'flex';
    startLobbyBackground();
    prepopulateLobby();
    createSessionSocket();
    loadFriends();
}

// ---------- LEADERBOARD OVERLAY ----------
function openLeaderboard() {
    const overlay = document.getElementById('lb-overlay');
    overlay.style.display = 'flex';
    loadLeaderboardOverlay();
}

function closeLeaderboard() {
    document.getElementById('lb-overlay').style.display = 'none';
}

async function loadLeaderboardOverlay() {
    const status = document.getElementById('lbo-status');
    const tbody  = document.getElementById('lbo-body');
    status.style.display = 'block';
    status.textContent   = 'Loading...';
    tbody.innerHTML      = '';
    try {
        const res  = await fetch('/api/leaderboard');
        const data = await res.json();
        renderLeaderboardOverlay(data);
    } catch {
        status.textContent = 'Could not load the leaderboard.';
    }
}

function renderLeaderboardOverlay(data) {
    const status = document.getElementById('lbo-status');
    const tbody  = document.getElementById('lbo-body');
    if (!data || data.length === 0) {
        tbody.innerHTML    = '';
        status.textContent = 'No players registered yet.';
        status.style.display = 'block';
        return;
    }
    status.style.display = 'none';
    tbody.innerHTML = data.map((p, i) => {
        const kRate   = p.games_played > 0 ? (p.kills_total / p.games_played).toFixed(1) : '0.0';
        const rankStr = `<span class="rk${i < 3 ? ' rk-' + (i + 1) : ''}">${i + 1}</span>`;
        const rowCls  = (i < 3 ? `top-${i + 1}` : '') + (currentNickname && p.nickname === currentNickname ? ' is-me' : '');
        const name    = String(p.nickname).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<tr class="${rowCls}">
            <td class="rank">${rankStr}</td>
            <td class="name">${name}</td>
            <td class="wins">${p.wins_total   || 0}</td>
            <td class="kills">${p.kills_total  || 0}</td>
            <td class="games">${p.games_played || 0}</td>
            <td class="krate">${kRate}</td>
        </tr>`;
    }).join('');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLeaderboard();
});

// Creeaza camera noua
function startCreate() {
    const errEl = document.getElementById('error-msg');
    const preview = document.getElementById('preview');
    if (!preview || !preview.src || preview.style.display === 'none') {
        errEl.textContent = 'Select a character first.';
        return;
    }
    errEl.textContent = '';
    pendingRoom = { action: 'create' };
    joinGame();
}

// Intra cu cod
function startJoin() {
    if (!selectedGamemode) selectGamemode('br');
    const code  = (document.getElementById('room-code-input').value || '').trim().toUpperCase();
    const roomErr = document.getElementById('room-error-msg');
    const errEl   = document.getElementById('error-msg');
    if (code.length !== 5) {
        roomErr.textContent = 'Room codes must contain 5 letters.';
        return;
    }
    const preview = document.getElementById('preview');
    if (!preview || !preview.src || preview.style.display === 'none') {
        errEl.textContent = 'Select a character first.';
        return;
    }
    roomErr.textContent = '';
    errEl.textContent = '';
    pendingRoom = { action: 'join', code };
    joinGame();
}

window.addEventListener('resize', () => {
    const canvas = document.getElementById('lobby-bg-canvas');
    if (!canvas) return;
    const wasRunning = !!_lobbyBgRaf;
    stopLobbyBackground();
    _LBG.ready = false;
    if (wasRunning) startLobbyBackground();
});

document.addEventListener('DOMContentLoaded', () => {
    startLobbyBackground();

    // Pre-fill nickname din localStorage
    const saved = localStorage.getItem('ar_nickname');
    if (saved) {
        const l = document.getElementById('login-nickname');
        if (l) l.value = saved;
    }

    // Enter pe campurile de login
    ['login-nickname', 'login-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });

    // Enter pe campurile de register
    ['reg-nickname', 'reg-password', 'reg-confirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
    });

    // Enter pe codul camerei
    const codeInput = document.getElementById('room-code-input');
    if (codeInput) codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') selectJoin(); });
});

const MOVE_THRESHOLD  = 0.1;
const SHOOT_THRESHOLD = 0.25;

// ---------- STATISTICI BUILD ----------
const stats = { hp: 0, dmg: 0, spd: 0 };
const MAX_POINTS = 10;

function pointsUsed() { return stats.hp + stats.dmg + stats.spd; }

function changeStat(stat, delta) {
    const newVal = stats[stat] + delta;
    if (newVal < 0) return;
    if (newVal > 10) return;
    if (delta > 0 && pointsUsed() >= MAX_POINTS) return;
    stats[stat] = newVal;
    updateStatsUI();
    localStorage.setItem('ar_stats', JSON.stringify({ hp: stats.hp, dmg: stats.dmg, spd: stats.spd }));
}

function updateStatsUI() {
    const remaining = MAX_POINTS - pointsUsed();
    const ptDisp = document.getElementById('points-display');
    const ptEl   = document.querySelector('.bc-points');
    if (ptDisp) ptDisp.textContent = remaining;
    if (ptEl)   ptEl.classList.toggle('bc-zero', remaining === 0);
    const valHp  = document.getElementById('val-hp');
    const valDmg = document.getElementById('val-dmg');
    const valSpd = document.getElementById('val-spd');
    const barHp  = document.getElementById('bar-hp');
    const barDmg = document.getElementById('bar-dmg');
    const barSpd = document.getElementById('bar-spd');
    const _wl = WEAPON_LOADOUT[selectedWeapon] || WEAPON_LOADOUT[DEFAULT_WEAPON];
    if (!_wl) return; // weapons.json not in yet
    if (valHp)  valHp.textContent  = (_wl.baseHp  + stats.hp  * _wl.hpPer)  + ' HP';
    if (valDmg) valDmg.textContent = (_wl.baseDmg + stats.dmg * _wl.dmgPer) + ' DMG';
    if (valSpd) valSpd.textContent = (_wl.baseSpd + stats.spd * _wl.spdPer).toFixed(1) + ' SPD';
    if (barHp)  barHp.style.width  = (stats.hp  / 10 * 100) + '%';
    if (barDmg) barDmg.style.width = (stats.dmg / 10 * 100) + '%';
    if (barSpd) barSpd.style.width = (stats.spd / 10 * 100) + '%';
}

function updateBuildType() {
    const buildEl = document.getElementById('build-type');
    const max = Math.max(stats.hp, stats.dmg, stats.spd);
    let text = '';
    if (stats.hp === stats.dmg && stats.dmg === stats.spd) text = 'Balanced build';
    else if (stats.hp  === max && stats.hp  >= 4) text = 'Tank: tough but slow';
    else if (stats.dmg === max && stats.dmg >= 4) text = 'Sniper: powerful but fragile';
    else if (stats.spd === max && stats.spd >= 4) text = 'Runner: very fast but vulnerable';
    else text = 'Mixed build';
    buildEl.textContent = text;
}

// (image upload replaced by character shop system)

// ---------- INTRA IN JOC ----------
function joinGame() {
    const name = currentNickname;
    if (!name) return;
    const char     = getSelectedCharacter();

    if (currentNickname && sessionToken) {
        fetch('/api/profile/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, stat_hp: stats.hp, stat_dmg: stats.dmg, stat_spd: stats.spd })
        }).catch(() => {});
    }

    goFullscreen();
    document.getElementById('screen-lobby').style.display   = 'none';
    document.getElementById('screen-waiting').style.display = 'flex';
    initGame(name, char.id, stats, pendingRoom);
}

// ---------- FULLSCREEN ----------
function goFullscreen() {
    if (!window.ARDevice || !ARDevice.isPhone) return;
    const el = document.documentElement;
    if (el.requestFullscreen)       el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
}

// Bullet trail sprite: the same look the per-frame gradient used to draw (fade from the tail,
// bright core line), rendered once and reused for every bullet.
let _trailSpriteCanvas = null;
function _getTrailSprite() {
    if (_trailSpriteCanvas) return _trailSpriteCanvas;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 16;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,140,0,0)');
    grad.addColorStop(0.55, 'rgba(255,195,50,0.12)');
    grad.addColorStop(1, 'rgba(255,225,90,0.32)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(256, 1); g.lineTo(256, 15); g.closePath(); g.fill();
    const core = g.createLinearGradient(0, 0, 256, 0);
    core.addColorStop(0, 'rgba(255,240,160,0)');
    core.addColorStop(1, 'rgba(255,240,160,0.38)');
    g.strokeStyle = core; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(14, 8); g.lineTo(256, 8); g.stroke();
    _trailSpriteCanvas = c;
    return c;
}

// Cached outlined labels (player names, HP numbers) and weapon badges. strokeText + fillText with a
// round join is one of the slowest canvas calls; a label is rendered once per text/style and then
// blitted. While the zoom is moving an old label is stretched; it is redone once the scale settles
// (at most a few per frame, ARArena.takeBudget), so zooming never spikes.
const _labelCache = new Map();
let _labelMeasure = null;
function _labelSprite(key, scale, w, h, paint) {
    let s = _labelCache.get(key);
    if (s && (s.scale === scale || !ARArena.isScaleStable())) return s;
    if (s && !ARArena.takeBudget()) return s;
    if (_labelCache.size > 600) _labelCache.clear();
    const c = s ? s.c : document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.max(1, Math.ceil(h * scale));
    const g = c.getContext('2d', { willReadFrequently: true }); // CPU-painted, uploaded once
    g.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
    paint(g);
    s = { c, scale, w, h, ax: 0, ay: 0 };
    _labelCache.set(key, s);
    return s;
}
function _drawLabel(ctx, text, sizePx, fill, stroke, strokeW, baseline, x, y, scale) {
    const key = 'L' + text + '|' + sizePx + '|' + fill + '|' + strokeW + '|' + baseline;
    let s = _labelCache.get(key);
    if (!s || s.scale !== scale) {
        const font = 'bold ' + sizePx + 'px Sen, Arial';
        if (!_labelMeasure) _labelMeasure = document.createElement('canvas').getContext('2d');
        _labelMeasure.font = font;
        const w = Math.ceil(_labelMeasure.measureText(text).width + strokeW + 6);
        const h = Math.ceil(sizePx * 1.5 + strokeW + 6);
        const ax = w / 2, ay = baseline === 'middle' ? h / 2 : Math.round(h * 0.72);
        s = _labelSprite(key, scale, w, h, (g) => {
            g.font = font; g.textAlign = 'center'; g.textBaseline = baseline; g.lineJoin = 'round';
            g.lineWidth = strokeW; g.strokeStyle = stroke; g.fillStyle = fill;
            g.strokeText(text, ax, ay); g.fillText(text, ax, ay);
        });
        s.ax = ax; s.ay = ay;
    }
    ctx.drawImage(s.c, x - s.ax, y - s.ay, s.w, s.h);
}
// A weapon's white icon and the same shape in ink (for the drop under it), as canvases; null until loaded
const _wIconInk = {};
function _weaponIconPair(id) {
    const white = ARIcons.weapon(id, true);
    if (!white.complete || !white.naturalWidth) return null;
    let ink = _wIconInk[id];
    if (!ink) {
        ink = document.createElement('canvas');
        ink.width = white.naturalWidth; ink.height = white.naturalHeight;
        const g = ink.getContext('2d');
        g.drawImage(white, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = INK; g.fillRect(0, 0, ink.width, ink.height);
        _wIconInk[id] = ink;
    }
    return { white, ink };
}
// Draws the icon fitted in a w x h box centred on (cx, cy), with its ink drop `drop` px below
function _drawWeaponIcon(g, id, cx, cy, w, h, drop) {
    const pair = _weaponIconPair(id);
    if (!pair) return false;
    const iw = pair.white.naturalWidth, ih = pair.white.naturalHeight;
    const k = Math.min(w / iw, h / ih), dw = iw * k, dh = ih * k;
    g.drawImage(pair.ink, cx - dw / 2, cy - dh / 2 + drop, dw, dh);
    g.drawImage(pair.white, cx - dw / 2, cy - dh / 2, dw, dh);
    return true;
}
function _drawBadge(ctx, wd, x, y, size, scale) {
    const ready = !!_weaponIconPair(wd.id);
    const key = 'B3' + wd.id + '|' + size + (ready ? '' : '|wait');
    const pad = 1;
    const s = _labelSprite(key, scale, size + pad * 2, size + pad * 2 + 3, (g) => {
        g.translate(pad, pad);
        const ol = Math.max(1.6, size * 0.11);
        _drawBlock(g, 0, 0, size, size, size * 0.26, '#2A3A45', '#18232A', ol, size * 0.16, 2.5);
        _drawWeaponIcon(g, wd.id, size / 2, size * 0.43, size * 0.78, size * 0.52, 1.2);
    });
    ctx.drawImage(s.c, x - pad, y - pad, s.w, s.h);
}
// Toy block on canvas: the same recipe as the DOM blocks (style.css, TOY-BLOCK ARENA):
// ground shadow, ink outline, darker lip along the bottom, face, light bevel on top.
const INK = '#0A1013';
function _drawBlock(ctx, x, y, w, h, r, face, lip, ol = 3, lipH = 5, sh = 4) {
    if (sh) { ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath(); ctx.roundRect(x, y + sh, w, h, r); ctx.fill(); }
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    const ix = x + ol, iy = y + ol, iw = w - ol * 2, ih = h - ol * 2, ir = Math.max(0, r - ol);
    if (iw <= 0 || ih <= 0) return;
    ctx.fillStyle = lip; ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, ir); ctx.fill();
    const fh = Math.max(1, ih - lipH), br = Math.min(ir, fh / 2);
    ctx.fillStyle = face; ctx.beginPath(); ctx.roundRect(ix, iy, iw, fh, [ir, ir, Math.min(br, 3), Math.min(br, 3)]); ctx.fill();
    if (iw > ir * 1.4 + 2) { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(ix + ir * 0.7, iy + Math.max(1, ol * 0.4), iw - ir * 1.4, Math.max(1.2, ol * 0.6)); }
}
// face / lip pairs of the toy palette
const TOY = {
    green: ['#46D46A', '#24903C'], gold: ['#FFC72E', '#C68A07'], red: ['#FF4B5C', '#B11F2E'],
    orange: ['#FF7A1F', '#B94E0C'], sky: ['#38A7F2', '#1D6DAE'], slate: ['#2A3A45', '#18232A'],
};
// HP bar: sunk dark track in an ink frame, the fill a small toy block of its own
function _drawHpBar(ctx, x, y, w, h, ratio, ol) {
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.roundRect(x - ol, y - ol + 3, w + ol * 2, h + ol * 2, h * 0.45 + ol); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - ol, y - ol, w + ol * 2, h + ol * 2, h * 0.45 + ol); ctx.fill();
    ctx.fillStyle = '#1B252C'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h * 0.45); ctx.fill();
    if (ratio <= 0) return;
    const c = ratio > 0.5 ? TOY.green : ratio > 0.25 ? TOY.gold : TOY.red;
    const fw = Math.max(h * 0.9, w * ratio);
    ctx.fillStyle = c[1]; ctx.beginPath(); ctx.roundRect(x, y, fw, h, h * 0.45); ctx.fill();
    ctx.fillStyle = c[0]; ctx.beginPath(); ctx.roundRect(x, y, fw, h * 0.7, [h * 0.45, h * 0.45, 2, 2]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + h * 0.4, y + h * 0.12, Math.max(0, fw - h * 0.8), Math.max(1, h * 0.14));
}

// The bars of the zombies that are hurt: the player's bar made small (an ink frame round a sunk track, the fill a
// small toy block with its lip and bevel). A zombie at full health has none. All of them together cost a few fills:
// the frames, the tracks, then the lip and the face of each colour, then the bevels.
const _ZBAR_H = 6, _ZBAR_OL = 1.6;
const _zbX = [], _zbY = [], _zbW = [], _zbF = [], _zbBand = [];
function _drawZombieBars(ctx, list, n, defs) {
    const h = _ZBAR_H, ol = _ZBAR_OL, rad = h * 0.45;
    for (let i = 0; i < n; i++) {
        const z = list[i], def = defs[z.type || 0] || defs[0];
        const ratio = Math.max(0, Math.min(1, z.hp / def.maxHp)), w = Math.max(24, def.r * 1.6);
        _zbW[i] = w; _zbX[i] = z.x - w / 2; _zbY[i] = z.y - def.r - 12 - h;
        _zbF[i] = Math.max(h * 0.9, w * ratio);
        _zbBand[i] = ratio > 0.5 ? 0 : ratio > 0.25 ? 1 : 2;
    }
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.roundRect(_zbX[i] - ol, _zbY[i] - ol, _zbW[i] + ol * 2, h + ol * 2, rad + ol);
    ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.roundRect(_zbX[i], _zbY[i], _zbW[i], h, rad);
    ctx.fillStyle = '#1B252C'; ctx.fill();
    const bands = [TOY.green, TOY.gold, TOY.red];
    for (let b = 0; b < 3; b++) {
        let any = false;
        ctx.beginPath();
        for (let i = 0; i < n; i++) if (_zbBand[i] === b) { ctx.roundRect(_zbX[i], _zbY[i], _zbF[i], h, rad); any = true; }
        if (!any) continue;
        ctx.fillStyle = bands[b][1]; ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < n; i++) if (_zbBand[i] === b) ctx.roundRect(_zbX[i], _zbY[i], _zbF[i], h * 0.7, [rad, rad, 1.5, 1.5]);
        ctx.fillStyle = bands[b][0]; ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.rect(_zbX[i] + h * 0.4, _zbY[i] + h * 0.12, Math.max(0, _zbF[i] - h * 0.8), Math.max(0.8, h * 0.14));
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
}

// Labels made before the web font arrived would keep the fallback font: redo them once it loads
try { if (document.fonts) document.fonts.addEventListener('loadingdone', () => _labelCache.clear()); } catch (e) { /* no FontFaceSet */ }

// Sets ctx to world matrix m, then translate(x, y) and rotate so +x points along (dx, dy).
// Replaces save/translate/rotate/restore (and atan2/cos/sin) for things drawn many times a frame.
function _setRotated(ctx, m, x, y, dx, dy) {
    const l = Math.sqrt(dx * dx + dy * dy);
    const cs = l > 0 ? dx / l : 1, sn = l > 0 ? dy / l : 0;
    ctx.setTransform(m.a * cs + m.c * sn, m.b * cs + m.d * sn, m.c * cs - m.a * sn, m.d * cs - m.b * sn,
                     m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
}

// ---------- ASSETS ----------

const _charImgCache = {};
function _getCharImg(src) {
    if (!_charImgCache[src]) {
        const img = new Image();
        img.src = src;
        _charImgCache[src] = img;
    }
    return _charImgCache[src];
}

// ---------- SKINS IN THE MATCH ----------
// World units: the body has radius 36; the 256 px PNG covers 100 × 100 units with its pivot
// (skins.json "pivot", 128,118 px) on the player position. Hitbox stays PLAYER_HIT_R (30).
// The art faces down, and player.angle is already measured from "down" (atan2(-dx, dy)), so the
// sprite and the hands rotate by player.angle; +y in that frame is the aim direction.
// How big a player looks in the match: set in public/combat-shared.js (PLAYER_VISUAL_SCALE, reglabil
// intre 0.8 si 0.9), because the server needs it too: it scales the muzzle, where bullets start.
// It scales the sprite, hands, highlight, hit flash, ring, label positions and guns together;
// the hitbox (PLAYER_HIT_R, server PLAYER_SIZE) does not change.
const PLAYER_VISUAL_SCALE = ARShared.PLAYER_VISUAL_SCALE;
const SKIN_FRAME_UNITS = 100;
const SKIN_BODY_R      = 36;
const SKIN_OUTLINE     = '#0B0F1A';
const SKIN_DRAW_UNITS  = SKIN_FRAME_UNITS * PLAYER_VISUAL_SCALE; // the frame as drawn (85 units at 0.85)

// The sprite: a PNG drawn once at its on-screen size (frame units × dpr × ZOOM) and rotated per player.
// No clip, so parts outside the body (horns, halo) stay whole. Redone once the zoom settles, a few per
// frame (ARArena.takeBudget), like the labels; while the zoom moves the old one is stretched.
function _skinSprite(entry, scale) {
    return _imageSprite(entry, 'sprite', entry.img, scale, SKIN_DRAW_UNITS, SKIN_DRAW_UNITS);
}
function _imageSprite(holder, key, img, scale, wUnits, hUnits) {
    if (!img.complete || !img.naturalWidth) return null;
    let s = holder[key];
    if (s && (s.scale === scale || !ARArena.isScaleStable())) return s;
    if (s && !ARArena.takeBudget()) return s;
    const pw = Math.max(8, Math.ceil(wUnits * scale)), ph = Math.max(8, Math.ceil(hUnits * scale));
    // Big reductions in one step lose detail on some browsers: halve first while the source is over 2× the target
    let src = img, sw = img.naturalWidth, sh = img.naturalHeight;
    while (sw > pw * 2 && sh > ph * 2) {
        const h = document.createElement('canvas');
        h.width = Math.ceil(sw / 2); h.height = Math.ceil(sh / 2);
        const hg = h.getContext('2d');
        hg.imageSmoothingEnabled = true; hg.imageSmoothingQuality = 'high';
        hg.drawImage(src, 0, 0, h.width, h.height);
        src = h; sw = h.width; sh = h.height;
    }
    const c = s ? s.c : document.createElement('canvas');
    c.width = pw; c.height = ph; // also clears
    const g = c.getContext('2d', { willReadFrequently: true }); // CPU-painted, uploaded once
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, sw, sh, 0, 0, pw, ph);
    s = { c, scale };
    holder[key] = s;
    return s;
}

// Hands: two circles under the body, in the skin colours, at ±34° from the aim and 47 units out
// (skins.json "hand"). One hand is painted once per skin at the on-screen scale and that sprite is
// drawn twice in the rotated frame, so the inner circle and the gloss keep their offsets in rotated
// coordinates. Filling the circles as paths instead, in a frame rotated differently for every player,
// cost far more than the whole old frame on a software rasteriser (24 players, dpr 2: 164 -> 10 fps).
const _HAND = { r: 9.4, inner: 6.6, line: 3.2, cx: [0, 0], cy: [0, 0], reach: 0 };
const HAND_BOX = 12; // half the hand sprite, in art units: radius 9.4 + half the outline 1.6 + margin
function _initHands(meta) {
    const h = (meta && meta.hand) || {};
    _HAND.r = h.radius || 9.4;
    _HAND.inner = h.innerRadius || 6.6;
    _HAND.line = h.outline || 3.2;
    const ang = (h.defaultAngleDeg ?? 34) * Math.PI / 180, dist = h.defaultDistance || 47;
    const S = PLAYER_VISUAL_SCALE;
    for (let i = 0; i < 2; i++) {
        const a = Math.PI / 2 + (i ? ang : -ang);
        _HAND.cx[i] = Math.cos(a) * dist * S;
        _HAND.cy[i] = Math.sin(a) * dist * S;
    }
    _HAND.reach = (dist + _HAND.r + _HAND.line / 2) * S; // 49.3 units at 0.85
}
_initHands(null);
function _disc(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
// One hand centred on 0,0, bottom to top: dark disc, base disc up-left, small gloss, outline
function _paintHand(g, base, dark) {
    _disc(g, 0, 0, _HAND.r);         g.fillStyle = dark; g.fill();
    _disc(g, -1, -1.2, _HAND.inner); g.fillStyle = base; g.fill();
    _disc(g, -2.6, -3.4, 1.8);       g.fillStyle = 'rgba(255,255,255,.45)'; g.fill();
    _disc(g, 0, 0, _HAND.r);         g.strokeStyle = SKIN_OUTLINE; g.lineWidth = _HAND.line; g.stroke();
}
// A small sprite (half size `box` units) at the on-screen scale, remade like _skinSprite when the zoom settles
function _unitSprite(holder, key, scale, box, paint) {
    let s = holder[key];
    if (s && (s.scale === scale || !ARArena.isScaleStable())) return s;
    if (s && !ARArena.takeBudget()) return s;
    const px = Math.max(4, Math.ceil(box * 2 * scale));
    const c = s ? s.c : document.createElement('canvas');
    c.width = c.height = px; // also clears
    const g = c.getContext('2d');
    const k = px / (box * 2);
    g.setTransform(k, 0, 0, k, px / 2, px / 2);
    paint(g);
    s = { c, scale };
    holder[key] = s;
    return s;
}
// pts: two [x, y] points in the rotated frame, already scaled (a gun's grip); omitted = the default spot
// dy: shift along the aim (negative = back, the recoil)
function _drawHands(ctx, entry, scale, pts, dy = 0) {
    const S = PLAYER_VISUAL_SCALE, box = HAND_BOX * S;
    const s = _unitSprite(entry, 'hand', scale, box, g => { g.scale(S, S); _paintHand(g, entry.base, entry.dark); });
    for (let i = 0; i < 2; i++) {
        const hx = pts ? pts[i][0] : _HAND.cx[i], hy = (pts ? pts[i][1] : _HAND.cy[i]) + dy;
        ctx.drawImage(s.c, hx - box, hy - box, box * 2, box * 2);
    }
}
// Highlight: a small white ellipse at the top left of the body that never turns with the aim, one
// sprite for every skin. It lies wholly inside the body (centre 21.4 units out + 8.2 radius < 36),
// so it needs no clip.
const _HL_ROT = -35 * Math.PI / 180;
const HL_BOX = 9;
const _hlHolder = {};
function _drawSkinHighlight(ctx, x, y, scale) {
    const S = PLAYER_VISUAL_SCALE, box = HL_BOX * S;
    const s = _unitSprite(_hlHolder, 'hl', scale, box, g => {
        g.scale(S, S);
        g.beginPath();
        g.ellipse(0, 0, 8.2, 3.8, _HL_ROT, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,.42)';
        g.fill();
    });
    ctx.drawImage(s.c, x - 13 * S - box, y - 17 * S - box, box * 2, box * 2);
}

// ---------- GUNS IN HAND ----------
// public/data/weapons.json: per gun the sprite, the two hand points and the muzzle, in world units from
// the body centre with the aim pointing down (the same frame as the skins); every sprite shares one frame
// (weapons.json "sprite"). All of it is multiplied by PLAYER_VISUAL_SCALE.
const WEAPON_ART = { ready: false, tl: null, size: null, byId: {}, skins: {} };
const WEAPONS_ART_READY = fetch(arAsset('/data/weapons.json'))
    .then(r => { if (!r.ok) throw new Error('weapons.json ' + r.status); return r.json(); })
    .then(data => {
        const errs = ARShared.checkWeapons(data);
        if (errs.length) throw new Error(errs.join('; '));
        // stats, loadout, classes, rules (the same values server.js reads)
        WEAPON_RULES = data.rules;
        DEFAULT_WEAPON = data.defaultWeapon;
        WEAPON_CLASSES.push(...data.classes);
        for (const [id, w] of Object.entries(data.weapons)) {
            const entry = { id, name: w.name, desc: w.desc, class: w.class, fireModeLabel: w.fireModeLabel, cameraZoom: w.cameraZoom || 1, ...ARShared.weaponStats(w) };
            WEAPONS.push(entry);
            _WEAPON_DATA[id] = entry;
            WEAPON_LOADOUT[id] = w.loadout;
        }
        if (!_WEAPON_DATA[selectedWeapon]) selectedWeapon = DEFAULT_WEAPON;
        const S = PLAYER_VISUAL_SCALE, sp = data.sprite;
        WEAPON_ART.tl = sp.topLeft.map(v => v * S);
        WEAPON_ART.size = sp.size.map(v => v * S);
        for (const [id, w] of Object.entries(data.weapons)) {
            const img = new Image();
            img.src = arAsset(w.sprite);
            const stats = _WEAPON_DATA[id];
            const muzzleDist = ARShared.muzzleDistance(w);
            WEAPON_ART.byId[id] = {
                id, name: w.name, img, accent: w.accent,
                hands:  w.hands.map(p => [p[0] * S, p[1] * S]),
                muzzle: [w.muzzle[0] * S, w.muzzle[1] * S],
                hands0: w.hands, muzzle0: w.muzzle, // unscaled, for the dev view readout
                recoil: (w.recoil || 0) * S,
                flashLen: w.flash.length * S,
                flashWid: w.flash.width * S,
                flashSprite: null, trail: null,
                // where bullets start and how long they live (server.js GUN_FIRE uses the same functions)
                muzzleDist,
                bulletLife: ARShared.bulletLife(stats.bulletLife, stats.bulletSpeed, muzzleDist),
                bulletSprite: null,
            };
        }
        WEAPON_ART.ready = true;
    })
    .catch(e => console.warn('[weapons]', e.message));

// ---------- WEAPON SKINS IN HAND ----------
// public/images/weapons/skins/weapon-skin-sprites.json: per skin (the ids of public/data/weapon-skins.json)
// its sprite (the same frame as the base guns), hands, muzzle and accent. Only the look changes: the hands
// sit on the skin, the muzzle flash comes out of the skin's barrel, the flash, the bullet and its trail take
// the skin's accent. Bullets still start at the gun's own muzzle (server.js GUN_FIRE and the prediction use
// muzzleDist of the base gun), so a longer barrel gives no advantage. A skin's sprite is loaded the first
// time a player holding it is drawn, once; until it is in, or if it fails, the base gun is drawn.
const WEAPON_SKIN_DIR = '/images/weapons/skins/';
const WEAPON_SKIN_ART_READY = Promise.all([WEAPONS_ART_READY, fetch(arAsset(WEAPON_SKIN_DIR + 'weapon-skin-sprites.json'))
    .then(r => { if (!r.ok) throw new Error('weapon-skin-sprites.json ' + r.status); return r.json(); })])
    .then(([, data]) => {
        const S = PLAYER_VISUAL_SCALE;
        const pt = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
        for (const [id, k] of Object.entries(data.skins || {})) {
            const base = k && WEAPON_ART.byId[k.weapon];
            if (!base || !Array.isArray(k.hands) || k.hands.length !== 2 || !k.hands.every(pt) || !pt(k.muzzle) || typeof k.sprite !== 'string') {
                console.warn('[weapon skins] ' + id + ': date invalide, se deseneaza arma de baza');
                continue;
            }
            WEAPON_ART.skins[id] = {
                id, weapon: k.weapon, name: base.name,
                src: arAsset(WEAPON_SKIN_DIR + 'sprites/' + k.sprite), img: null, failed: false,
                accent: /^#[0-9A-Fa-f]{6}$/.test(k.accent) ? k.accent : base.accent,
                hands:  k.hands.map(p => [p[0] * S, p[1] * S]),
                muzzle: [k.muzzle[0] * S, k.muzzle[1] * S],
                hands0: k.hands, muzzle0: k.muzzle, // unscaled, for the dev view readout
                recoil: base.recoil, flashLen: base.flashLen, flashWid: base.flashWid,
                flashSprite: null, trail: null, bulletSprite: null,
                fx: ARSkinFx.parseFx(k.fx),   // the mythic skins' effects (SKIN EFFECTS below); null for the others
            };
        }
    })
    .catch(e => console.warn('[weapon skins]', e.message));
// The weapon skin catalog: public/data/weapon-skins.json, the file server.js reads (ARShared.weaponSkins
// works out the prices). For the Arsenal: names, rarity, price, unlock.
const WEAPON_SKIN_CATALOG = { byId: {}, list: [] };
const WEAPON_SKIN_CATALOG_READY = fetch(arAsset('/data/weapon-skins.json'))
    .then(r => { if (!r.ok) throw new Error('weapon-skins.json ' + r.status); return r.json(); })
    .then(data => { for (const s of ARShared.weaponSkins(data)) { WEAPON_SKIN_CATALOG.byId[s.id] = s; WEAPON_SKIN_CATALOG.list.push(s); } })
    .catch(e => console.warn('[weapon skins]', e.message));
// What a gun looks like in a player's hands: the skin's look (sprite, hands, muzzle flash, accent for the
// flash, the bullet and the trail) when skinId is a skin of that gun whose sprite is in; otherwise all of the base gun
function _gunLook(weaponId, skinId) {
    const base = WEAPON_ART.byId[weaponId];
    const sk = skinId && skinId !== 'default' ? WEAPON_ART.skins[skinId] : null;
    if (!base || !sk || sk.weapon !== weaponId || sk.failed) return base;
    if (!sk.img) {
        sk.img = new Image();
        sk.img.onerror = () => { sk.failed = true; console.warn('[weapon skins] ' + sk.id + ': sprite-ul nu s-a incarcat, se deseneaza arma de baza'); };
        sk.img.src = sk.src;
    }
    return sk.img.complete && sk.img.naturalWidth ? sk : base;
}

// A skin's draw cache: the image, its colours and the sprites made from it
function _makeSkinEntry(skinId) {
    const charDef = getCharacterById(skinId) || getCharacterById(DEFAULT_SKIN);
    return {
        img: _getCharImg(charDef ? charDef.png : ''), sprite: null, hand: null,
        base: charDef ? charDef.base : '#E7ECF3', dark: charDef ? charDef.dark : '#AEB8C8',
    };
}

// ---------- SHOT EFFECTS ----------
// Per player: when the last kick started and when the last flash fired. Every bullet kicks: the gun
// and hands go back by the gun's "recoil" in RECOIL_UP_MS (ease-out), then return in RECOIL_BACK_MS.
// A kick during an earlier one rises from where the gun already is, so fast guns never go past the
// maximum. Bullets of one shot (shotgun pellets) fire within a few ms and count once.
const RECOIL_UP_MS = 50, RECOIL_BACK_MS = 120, FLASH_MS = 70;
function _newShotFx() { return { kick: -1e9, flash: -1e9 }; }
function _shotRecoil(fx, now) {
    const t = now - fx.kick;
    if (t < 0 || t >= RECOIL_UP_MS + RECOIL_BACK_MS) return 0;
    if (t < RECOIL_UP_MS) { const u = 1 - t / RECOIL_UP_MS; return 1 - u * u; }
    const u = 1 - (t - RECOIL_UP_MS) / RECOIL_BACK_MS;
    return u * u;
}
function _shotKick(fx, now) {
    if (now - fx.flash < 25) return; // the other pellets of the same shot
    const cur = _shotRecoil(fx, now);
    fx.kick = now - RECOIL_UP_MS * (1 - Math.sqrt(1 - Math.min(1, cur)));
    fx.flash = now;
}

// Muzzle flash: a star stretched along the shot (+y here, the aim), the gun's accent with a white core
// and a thin ink outline; one sprite per gun at the on-screen scale, drawn shrinking and fading.
function _starPath(g, len, wid, k) {
    // five tips: forward, two forward diagonals, two sides; a solid core between them.
    // Polar around the muzzle, angle 0 = forward (+y)
    const inner = Math.max(len * 0.12, wid * 0.24) * k;
    const tips = [[0, len * 0.82], [0.7, Math.max(wid * 0.62, len * 0.42)], [1.75, wid * 0.5], [-1.75, wid * 0.5], [-0.7, Math.max(wid * 0.62, len * 0.42)]];
    const order = [0, 1, 2, 3, 4];
    g.beginPath();
    for (let i = 0; i < order.length; i++) {
        const [a0, r0] = tips[order[i]], [a1] = tips[order[(i + 1) % order.length]];
        const x = Math.sin(a0) * r0 * k, y = Math.cos(a0) * r0 * k;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        let am = (a0 + a1) / 2;
        if (order[i] === 2) am = Math.PI; // between the two side tips: across the back
        g.lineTo(Math.sin(am) * inner, Math.cos(am) * inner);
    }
    g.closePath();
}
function _flashSprite(gun, scale) {
    if (gun.fx && gun.fx.flash) return _skinFlashSprite(gun, scale);
    const box = gun.flashLen;
    const s = _unitSprite(gun, 'flashSprite', scale, box, g => {
        _starPath(g, gun.flashLen, gun.flashWid, 1);
        g.fillStyle = gun.accent || '#FFC53D'; g.fill();
        g.lineWidth = 0.7; g.strokeStyle = SKIN_OUTLINE; g.lineJoin = 'round'; g.stroke();
        _starPath(g, gun.flashLen, gun.flashWid, 0.48);
        g.fillStyle = '#FFFFFF'; g.fill();
    });
    s.box = box;
    return s;
}

// Bullet trail in the gun's accent (the skin's, with one equipped): fades in from the tail, a lighter core
// line; one per gun / skin
function _trailSpriteFor(weaponId, skinId) {
    const gun = _gunLook(weaponId, skinId) || WEAPON_ART.byId[DEFAULT_WEAPON];
    if (!gun) return _getTrailSprite();
    if (gun.trail) return gun.trail;
    const hex = (gun.accent || '#FFC53D').replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16), gr = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const rgba = a => 'rgba(' + r + ',' + gr + ',' + b + ',' + a + ')';
    const lr = Math.round(r + (255 - r) * 0.55), lg = Math.round(gr + (255 - gr) * 0.55), lb = Math.round(b + (255 - b) * 0.55);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 12;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, rgba(0)); grad.addColorStop(0.6, rgba(0.14)); grad.addColorStop(1, rgba(0.42));
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(256, 1.5); g.lineTo(256, 10.5); g.closePath(); g.fill();
    const core = g.createLinearGradient(0, 0, 256, 0);
    core.addColorStop(0, 'rgba(' + lr + ',' + lg + ',' + lb + ',0)'); core.addColorStop(1, 'rgba(' + lr + ',' + lg + ',' + lb + ',0.5)');
    g.strokeStyle = core; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(256, 6); g.stroke();
    gun.trail = c;
    return c;
}

// ---------- SKIN EFFECTS (the mythic weapon skins) ----------
// weapon-skin-sprites.json "fx" (read by ARSkinFx.parseFx, public/skin-fx.js): a glow under the player, a light that runs
// down the gun at each shot, a star at the muzzle, needle bullets with a glow, and hexagon pollen off the player and off the
// bullets. Everything is a sprite painted once per scale (like the guns and the bullets), drawn with one drawImage; the
// pollen is one fixed pool (ARSkinFx) updated once per frame. Visual only. The setting "Efecte skin" (Settings) off, or the
// dynamic resolution having stepped down (the device is struggling), leaves the glow, the star and the needles and drops the
// pollen and the light on the gun. The wings of the Viespe do not move: the sprite is a still picture.
const _SKINFX = { full: true };
try { _SKINFX.full = localStorage.getItem('ar_skinfx') !== '0'; } catch (e) { /* storage blocked: full */ }
const _skinFxOn = () => _SKINFX.full && _RS.idx === 0;   // the pollen in a match
document.addEventListener('DOMContentLoaded', () => {
    const sw = document.getElementById('set-skinfx');
    if (!sw) return;
    const paint = () => {
        sw.setAttribute('aria-checked', _SKINFX.full ? 'true' : 'false');
        const t = sw.querySelector('.switch-text'); if (t) t.textContent = _SKINFX.full ? 'ON' : 'OFF';
    };
    sw.addEventListener('click', () => {
        _SKINFX.full = !_SKINFX.full;
        try { localStorage.setItem('ar_skinfx', _SKINFX.full ? '1' : '0'); } catch (e) { /* ignore */ }
        paint();
    });
    paint();
});
const _hexRgba = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
// A soft round glow in one colour, fading to nothing at the edge; box = its radius in world units
function _glowSprite(holder, key, scale, box, hex) {
    const s = _unitSprite(holder, key, scale, box, g => {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, box);
        gr.addColorStop(0, _hexRgba(hex, 1)); gr.addColorStop(1, _hexRgba(hex, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, box, 0, Math.PI * 2); g.fill();
    });
    s.box = box;
    return s;
}
// the glow under the player, in the gun's frame, drawn before the body; it breathes
function _drawSkinAura(ctx, gun, scale, now) {
    const a = gun.fx.aura, S = PLAYER_VISUAL_SCALE;
    const sp = _glowSprite(gun, 'auraSprite', scale, a.radius * S, a.color);
    ctx.globalAlpha = ARSkinFx.auraAlpha(gun.fx, now);
    ctx.drawImage(sp.c, a.at[0] * S - sp.box, a.at[1] * S - sp.box, sp.box * 2, sp.box * 2);
    ctx.globalAlpha = 1;
}
// the light that runs down the gun after a shot (age ms since the shot), with the gun's recoil
function _drawSkinPulse(ctx, gun, scale, age, back) {
    const pu = ARSkinFx.pulseAt(gun.fx, age);
    if (!pu) return;
    const S = PLAYER_VISUAL_SCALE, p = gun.fx.pulse;
    const sp = _glowSprite(gun, 'pulseSprite', scale, p.radius * S, p.color);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pu.a;
    ctx.drawImage(sp.c, pu.x * S - sp.box, pu.y * S - back - sp.box, sp.box * 2, sp.box * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
}
// the muzzle star: four points (long along the shot), ink outline, colour, white core; drawn by _drawPlayerFigure like any flash
function _skinFlashSprite(gun, scale) {
    const S = PLAYER_VISUAL_SCALE, c = gun.fx.flash.colors, box = 12.6 * S;
    const s = _unitSprite(gun, 'flashSprite', scale, box, g => {
        for (let pass = 0; pass < 2; pass++) {
            const r0 = (pass ? 8 : 9.03) * S, r1 = (pass ? 1.6 : 2.2) * S;
            g.beginPath();
            for (let j = 0; j < 8; j++) {
                const rr = j % 2 ? r1 : (j % 4 === 0 ? r0 * 1.4 : r0 * 0.9), aa = j / 8 * Math.PI * 2;
                g.lineTo(Math.sin(aa) * rr, Math.cos(aa) * rr);
            }
            g.closePath(); g.fillStyle = pass ? c[1] : c[0]; g.fill();
        }
        g.fillStyle = c[2]; g.beginPath(); g.arc(0, 0, 1.3 * S, 0, Math.PI * 2); g.fill();
    });
    s.box = box;
    return s;
}
// the needle bullet (a diamond, tip forward along +x), with its glow baked in: one drawImage per bullet
const NEEDLE_K = 0.55;   // the artifact's pixels -> world units, so a needle is about as long as the capsule bullet
function _needleBulletSprite(gun, scale) {
    const b = gun.fx.bullets, K = NEEDLE_K, box = Math.max(14 * K + 1.5, b.glowRadius * K);
    const s = _unitSprite(gun, 'bulletSprite', scale, box, g => {
        if (b.glowRadius > 0) {
            const gr = g.createRadialGradient(0, 0, 0, 0, 0, b.glowRadius * K);
            gr.addColorStop(0, _hexRgba(b.colors[0], 0.35)); gr.addColorStop(1, _hexRgba(b.colors[0], 0));
            g.fillStyle = gr; g.beginPath(); g.arc(0, 0, b.glowRadius * K, 0, Math.PI * 2); g.fill();
        }
        const dia = (tip, back, half, hb) => { g.beginPath(); g.moveTo(tip * K, 0); g.lineTo(hb * K, -half * K); g.lineTo(back * K, 0); g.lineTo(hb * K, half * K); g.closePath(); };
        dia(14, -14, 5.4, -8); g.fillStyle = b.outline; g.fill();
        dia(11, -11, 3.2, -7); g.fillStyle = b.colors[0]; g.fill();
        g.beginPath(); g.moveTo(8 * K, 0); g.lineTo(-3 * K, -1.2 * K); g.lineTo(-3 * K, 1.2 * K); g.closePath(); g.fillStyle = b.colors[1]; g.fill();
    });
    s.box = box;
    s.noTrail = true;   // the needle leaves pollen, not the accent streak the other bullets leave
    return s;
}
// pollen: a hexagon in the skin's colour with an ink outline, painted at 2.5x so the biggest ones stay sharp.
// The dots off the bullets (the artifact's brown trail) are the same hexagon in a light and a dark brown, with a thicker dark ring
const _DOT_LOOK = [['#FFC21F', '#0B0F1A', 0.34], ['#D9993A', '#2B1A08', 0.5], ['#8A5418', '#1E1205', 0.5]];
function _hexSprite(scale, kind) {
    const look = _DOT_LOOK[kind] || _DOT_LOOK[0];
    const s = _unitSprite(_SKINFX, 'hex' + kind, scale * 2.5, 1.3, g => {
        g.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(Math.cos(a), Math.sin(a)); }
        g.closePath(); g.fillStyle = look[0]; g.fill();
        g.lineWidth = look[2]; g.strokeStyle = look[1]; g.lineJoin = 'round'; g.stroke();
    });
    s.box = 1.3;
    return s;
}
// draws a pool's particles (hexagons, the pollen and the dots off the bullets) in the current (world) transform, each fading out over its life
function _drawSkinPollen(ctx, pool, scale) {
    if (!pool.n) return;
    const hs = [_hexSprite(scale, 0), _hexSprite(scale, 1), _hexSprite(scale, 2)], box = hs[0].box;
    for (let i = 0; i < pool.n; i++) {
        const k = pool.age[i] / pool.life[i], r = pool.size[i];
        ctx.globalAlpha = Math.max(0, 1 - k * k);
        ctx.drawImage(hs[pool.kind[i]].c, pool.x[i] - r * box, pool.y[i] - r * box, r * box * 2, r * box * 2);
    }
    ctx.globalAlpha = 1;
}
// one emitter counter per player (and per bullet owner), made when first needed
function _skinEmitter(map, id) { let e = map.get(id); if (!e) { e = { acc: 0 }; map.set(id, e); } return e; }

// The ring under a player: just outside the default hands (its 3-unit stroke clears them)
function _playerRingR() { return _HAND.reach + 2.5; }

// One player as the match draws it, used by the match loop and the ?dev=weapons view.
// ctx's transform is `wm` (world -> device) on entry and on exit; x, y, angle in world units / player.angle
// (0 = aim down); scale = device px per world unit (dpr × ZOOM) for the sprite caches.
// Order: ring, then with a gun: body, gun, hands on the gun, muzzle flash, fixed highlight;
// without one (dev view only): hands at the default spot under the body, body, highlight.
// fx (optional): the player's shot effects (_newShotFx), drawn as of `now` (performance.now()).
// weaponSkin (optional): the skin on the gun (server state); its sprite, hands and muzzle flash are drawn.
function _drawPlayerFigure(ctx, wm, x, y, angle, entry, weaponId, scale, ringStroke, ringFill, fx, now, weaponSkin) {
    const ringR = _playerRingR();
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.fillStyle = ringFill;
    ctx.fill();
    ctx.strokeStyle = ringStroke;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const gun = weaponId ? _gunLook(weaponId, weaponSkin) : null;
    _setRotated(ctx, wm, x, y, Math.cos(angle), Math.sin(angle));
    if (gun && gun.fx && gun.fx.aura) _drawSkinAura(ctx, gun, scale, now);   // under the body
    if (entry && !gun) _drawHands(ctx, entry, scale);
    const spr = entry ? _skinSprite(entry, scale) : null;
    if (spr) {
        const pivX = (SKIN_META ? SKIN_META.pivot[0] / SKIN_META.size : 0.5) * SKIN_DRAW_UNITS;
        const pivY = (SKIN_META ? SKIN_META.pivot[1] / SKIN_META.size : 0.4609375) * SKIN_DRAW_UNITS;
        ctx.drawImage(spr.c, -pivX, -pivY, SKIN_DRAW_UNITS, SKIN_DRAW_UNITS);
    } else {
        // image still loading: the body as a plain disc in the skin colour
        ctx.beginPath();
        ctx.arc(0, 0, SKIN_BODY_R * PLAYER_VISUAL_SCALE, 0, Math.PI * 2);
        ctx.fillStyle = entry ? entry.base : '#E7ECF3';
        ctx.fill();
        ctx.strokeStyle = SKIN_OUTLINE; ctx.lineWidth = 4.4 * PLAYER_VISUAL_SCALE; ctx.stroke();
    }
    if (gun) {
        // recoil: the gun and hands go back along the aim (the body stays)
        const back = fx ? gun.recoil * _shotRecoil(fx, now) : 0;
        const gs = _imageSprite(gun, 'sprite', gun.img, scale, WEAPON_ART.size[0], WEAPON_ART.size[1]);
        if (gs) ctx.drawImage(gs.c, WEAPON_ART.tl[0], WEAPON_ART.tl[1] - back, WEAPON_ART.size[0], WEAPON_ART.size[1]);
        if (entry) _drawHands(ctx, entry, scale, gun.hands, -back);
        if (gun.fx && gun.fx.pulse && fx && _SKINFX.full) _drawSkinPulse(ctx, gun, scale, now - fx.flash, back);
        const fage = fx ? now - fx.flash : Infinity;
        if (fage >= 0 && fage < FLASH_MS) {
            const a = fage / FLASH_MS, k = 1 - 0.4 * a;
            const fs = _flashSprite(gun, scale), half = fs.box * k;
            ctx.globalAlpha = 1 - a;
            ctx.drawImage(fs.c, gun.muzzle[0] - half, gun.muzzle[1] - back - half, half * 2, half * 2);
            ctx.globalAlpha = 1;
        }
    }
    ctx.setTransform(wm);
    _drawSkinHighlight(ctx, x, y, scale);
}

// Bullets: a capsule along +x (the direction of travel) in the gun's accent (the skin's, with one equipped),
// ink outline and a small white glint, painted once per gun / skin at the on-screen scale and rotated per
// bullet. Visual only: the hit radius stays the server's BULLET_RADIUS (6).
const BULLET_LOOK = { len: 14, wid: 5 };
const PELLET_LOOK = { len: 8, wid: 4 };   // guns that fire pellets (shotgun)
function _bulletSprite(weaponId, scale, skinId) {
    const gun = _gunLook(weaponId, skinId) || WEAPON_ART.byId[DEFAULT_WEAPON];
    if (!gun) return null;
    if (gun.fx && gun.fx.bullets) return _needleBulletSprite(gun, scale);
    const look = (_WEAPON_DATA[weaponId] || {}).pellets > 1 ? PELLET_LOOK : BULLET_LOOK;
    const box = look.len / 2 + 1.5;
    const s = _unitSprite(gun, 'bulletSprite', scale, box, g => {
        const hl = look.len / 2, r = look.wid / 2;
        g.beginPath();
        g.moveTo(-hl + r, -r);
        g.lineTo(hl - r, -r);
        g.arc(hl - r, 0, r, -Math.PI / 2, Math.PI / 2);
        g.lineTo(-hl + r, r);
        g.arc(-hl + r, 0, r, Math.PI / 2, Math.PI * 1.5);
        g.closePath();
        g.fillStyle = gun.accent || '#FFC53D';
        g.fill();
        g.lineWidth = 1.4;
        g.strokeStyle = SKIN_OUTLINE;
        g.stroke();
        g.beginPath();
        g.arc(hl - r - 0.6, -r * 0.35, Math.max(0.7, r * 0.38), 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fill();
    });
    s.box = box;
    return s;
}

// Developer view of a player with each gun: open the game with ?dev=weapons (public/dev-weapons.js).
// Nothing of it loads without the parameter.
try {
    if (new URLSearchParams(location.search).get('dev') === 'weapons') {
        const s = document.createElement('script');
        s.src = arAsset('/dev-weapons.js');
        document.head.appendChild(s);
    }
} catch (e) { /* no URL API */ }

// ---------- INITIALIZARE ----------
function initGame(playerName, playerSkin, playerStats, roomAction) {
    const canvas = document.getElementById('gameCanvas');
    const ctx    = canvas.getContext('2d');

    stopEventTimer();   // the lobby countdown has nothing to do during a match (startEventTimer restarts it in the lobby)
    _rsInit();
    function resizeCanvas() { _rsApplySize(canvas); }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);

    // Preia socket-ul de sesiune creat la intrarea in lobby (deja autentificat pe server)
    const _ioFallbackOpts = typeof msgpackParser !== 'undefined'
        ? { parser: msgpackParser, transports: ['websocket'], reconnection: false }
        : { transports: ['websocket'], reconnection: false };
    const socket = _sessionSocket || _watchBuild(io(_ioFallbackOpts));
    _sessionSocket = null;

    const playerData = { name: playerName, skin: playerSkin, stats: playerStats, xp: currentProfile?.xp || 0, weapon: selectedWeapon, mode: selectedGamemode || 'br', proto: ARNet.PROTO };

    if (roomAction.action === 'create') {
        socket.emit('create-room', playerData);
    } else {
        socket.emit('join-room', { code: roomAction.code, ...playerData });
    }

    socket.on('room-created', ({ code }) => {
        document.getElementById('waiting-code-display').textContent = code;
        document.getElementById('btn-start-game').style.display     = 'block';
        document.getElementById('waiting-sub-msg').style.display    = 'none';
    });

    socket.on('room-joined', ({ code }) => {
        document.getElementById('waiting-code-display').textContent = code;
    });

    socket.on('host-transferred', () => {
        document.getElementById('btn-start-game').style.display  = 'block';
        document.getElementById('waiting-sub-msg').style.display = 'none';
    });

    socket.on('room-error', (msg) => {
        document.getElementById('screen-waiting').style.display = 'none';
        document.getElementById('screen-lobby').style.display   = 'flex';
        startLobbyBackground();
        document.getElementById('room-error-msg').textContent   = '' + msg;
        socket.disconnect();
    });

    const playerImages = {};
    // Cache entry (image, colours, sprite) dupa URL — mai multi jucatori cu acelasi skin
    // impart acelasi obiect; o singura incarcare de imagine si un singur sprite (_skinSprite)
    const _playerEntryByUrl = {};

    socket.on('player-image', (data) => {
        if (data.weapon) _playerWeapons.set(data.id, data.weapon);
        if (data.weaponSkin) _playerWeaponSkins.set(data.id, data.weaponSkin);
        if (playerImages[data.id]) return;

        // The server sends a skin id it has validated; the sprite comes from our own list
        const charDef = getCharacterById(data.skin) || getCharacterById(DEFAULT_SKIN);
        const url = charDef ? charDef.png : '';
        // Refoloseste entry-ul deja construit pentru acest URL (alt jucator cu acelasi skin)
        if (_playerEntryByUrl[url]) {
            playerImages[data.id] = _playerEntryByUrl[url];
            return;
        }

        const entry = _makeSkinEntry(charDef ? charDef.id : DEFAULT_SKIN);
        playerImages[data.id] = entry;
        _playerEntryByUrl[url] = entry; // inregistrat dupa URL pentru reutilizare
    });

    socket.on('waiting-room', ({ players: playerList, hostId } = {}) => {
        if (!playerList) return;
        const grid = document.getElementById('waiting-players');
        grid.innerHTML = '';
        let imInRoom = false;
        playerList.forEach(p => {
            const pLevel = p.level || 1;
            const pTier  = getTier(pLevel);
            if (p.id === socket.id) imInRoom = true;
            const card = document.createElement('div');
            card.className = 'waiting-card';
            card.innerHTML = `
                <div class="waiting-card-av">
                    <img src="${skinPreviewSrc(getCharacterById(p.skin) ? p.skin : DEFAULT_SKIN, SKIN_PREVIEW.full)}" onerror="this.style.background='#e8a020';this.src=''"
                         style="border:3px solid ${pTier.color};box-shadow:0 0 14px ${pTier.glow}">
                    <span class="waiting-lv-badge" style="background:${pTier.color};color:#000">LV ${pLevel}</span>
                </div>
                <span>${p.name}</span>
            `;
            grid.appendChild(card);
        });
        // Butonul + e mereu primul, in afara gridului; il aratam doar daca suntem in camera
        const invBtn = document.getElementById('btn-invite-friends');
        if (invBtn) invBtn.style.display = imInRoom ? 'flex' : 'none';
        // Retinem numele jucatorilor din camera pentru panoul de invitatii
        _waitingRoomPlayers = new Set(playerList.map(p => p.name));
        document.getElementById('waiting-count').textContent = playerList.length;
        const amHost = hostId === socket.id;
        document.getElementById('btn-start-game').style.display  = amHost ? 'block' : 'none';
        document.getElementById('waiting-sub-msg').style.display = amHost ? 'none'  : 'block';
    });

    socket.on('room-invite', ({ from, roomCode }) => {
        showRoomInvitePopup(from, roomCode);
    });

    socket.on('invite-result', ({ ok, msg }) => {
        showToast(msg);
    });

    socket.on('invite-declined', ({ by }) => {
        showToast(`${by} declined your invitation.`);
    });

    let gameLoopStarted = false;
    const gameControl   = { countdownActive: false };

    function showCountdown() {
        gameControl.countdownActive = true;
        const overlay = document.getElementById('countdown-overlay');
        const numEl   = document.getElementById('countdown-number');
        numEl.style.color = '#fff';
        overlay.classList.add('active');
        let n = 3;
        numEl.textContent = n;
        // The first frame of a match is the heaviest one (canvas, sprites, HUD all appear): the
        // first pop waits for it, so no animation is running while that frame renders.
        numEl.classList.add('cd-first');
        const tick = setInterval(() => {
            n--;
            numEl.classList.remove('cd-first');
            if (n > 0) {
                numEl.textContent = n;
                numEl.style.animation = 'none';
                void numEl.offsetWidth;
                numEl.style.animation = '';
            } else {
                clearInterval(tick);
                numEl.textContent = 'GO!';
                numEl.style.color = '#00ff88';
                numEl.style.animation = 'none';
                void numEl.offsetWidth;
                numEl.style.animation = '';
                setTimeout(() => {
                    overlay.classList.remove('active');
                    numEl.style.color = '#fff';
                    gameControl.countdownActive = false;
                    gameControl.countdownEndTime = performance.now();
                }, 700);
            }
        }, 1000);
    }

    socket.on('game-start', (data) => {
        if (data && data.playersMeta)  gameControl.pendingMeta      = data.playersMeta;
        if (data && data.obstacles)    gameControl.pendingObstacles = data.obstacles;
        if (data && data.mode)         gameControl.mode             = data.mode;
        if (data && data.season)       gameControl.pendingSeason    = data.season;
        stopLobbyBackground();
        document.getElementById('screen-waiting').style.display = 'none';
        document.getElementById('screen-game').style.display    = 'block';
        // Reset UI la fiecare inceput de meci nou
        document.getElementById('my-kills').textContent      = '0';
        document.getElementById('players-alive').textContent = '0';
        document.getElementById('kill-feed').innerHTML       = '';
        const _isPve = (data && data.mode) === 'pve';
        showCountdown();
        document.getElementById('btn-rematch').onclick = () => {
            socket.emit('rematch');
            const btn = document.getElementById('btn-rematch');
            btn.disabled = true;
            btn.textContent = 'Asteptand...';
        };
        if (!gameLoopStarted) {
            gameLoopStarted = true;
            startGameLoop(socket, canvas, ctx, playerImages, gameControl);
        } else if (gameControl.reset) {
            gameControl.reset();
        }
        // Set AFTER reset — reset ascunde pve-top-hud
        document.getElementById('pve-top-hud').style.display = _isPve ? 'flex' : 'none';
        document.getElementById('game-ui').style.display     = _isPve ? 'none' : 'block';
    });

    socket.on('game-reset', () => { location.reload(); });

    window._gameSocket = socket;
}

function startGame() {
    if (window._gameSocket) window._gameSocket.emit('start-game');
}

// ---------- BUCLA PRINCIPALA DE JOC ----------
function startGameLoop(socket, canvas, ctx, playerImages, gameControl) {


    // ---------- JOYSTICK-URI ----------
    const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const joystickSize = Math.min(80, window.innerWidth * 0.18);
    const _stub = { on: () => {}, destroy: () => {} };

    let joystickLeft, joystickRight;
    if (isDesktop) {
        document.getElementById('zone-left').style.display  = 'none';
        document.getElementById('zone-right').style.display = 'none';
        joystickLeft  = _stub;
        joystickRight = _stub;
    } else {
        try {
            joystickLeft = nipplejs.create({
                zone: document.getElementById('zone-left'),
                mode: 'dynamic', color: '#ffffff', size: joystickSize
            });
            joystickRight = nipplejs.create({
                zone: document.getElementById('zone-right'),
                mode: 'dynamic', color: '#e94560', size: joystickSize
            });
        } catch (_njErr) {
            joystickLeft  = _stub;
            joystickRight = _stub;
        }
    }

    let moveDir      = { x: 0, y: 0 };
    let shootDir     = { x: 0, y: 0 };
    let isShooting           = false;
    let _shootMustRelease    = false;
    let _aimActive           = false;
    let _clientHasReleased   = false;
    let aimStartTime         = null;
    let gameEnded    = false;
    let _selfDead    = false;
    let myAngle      = 0;
    let moveAngle    = 0;

    const _hiddenPlayers = new Set(); // enemy IDs hidden immediately on kill-event, before interpolation catches up

    let isSpectating    = false;
    let spectateTargetId = null;
    let myElimData      = null;

    let predX = null, predY = null, predSpeed = 132; // px/sec (actualizat din meta)
    let _zoomFactor = 1.0; // factor view per arma (1.0 = normal, >1 = zoom out)
    let _waveStartAt = -1e9, _tpFx = null;   // PvE: when the last wave began; the phase-in effect after the server moved us
    const TP_MS = 450;
    const stateBuffer  = []; // [{t, players:{id:{x,y,angle,hp,maxHp,alive,kills,name}}, bullets:[], zone:{}}]
    const playerMeta   = {}; // {id: {speed, maxHp, name}} — static per runda, trimis o data
    window.__arPlayerName = id => (playerMeta[id] && playerMeta[id].name) || null; // ?dev=weapons
    // Aplica metadata trimisa de server inainte ca startGameLoop sa fie apelat
    // Players are named by a small slot number in the state packet (netproto.js); playersMeta says which is who
    const _slotId = [];
    function _noteSlots(meta) { for (const id in meta) if (meta[id].slot !== undefined) _slotId[meta[id].slot] = id; }
    if (gameControl.pendingMeta) {
        Object.assign(playerMeta, gameControl.pendingMeta);
        _noteSlots(gameControl.pendingMeta);
        for (const [id, m] of Object.entries(gameControl.pendingMeta)) { if (m.weapon) _playerWeapons.set(id, m.weapon); if (m.weaponSkin) _playerWeaponSkins.set(id, m.weaponSkin); }
        delete gameControl.pendingMeta;
    }
    let _obstacles = gameControl.pendingObstacles || []; delete gameControl.pendingObstacles;
    // The look of the trees and rocks for this match (server.js MAP SEASON; summer when the server sends none)
    ARArena.setMapSeason(gameControl.pendingSeason || 'vara'); ARGround.setTheme(gameControl.pendingSeason || 'vara'); delete gameControl.pendingSeason;
    const _gameMode = gameControl.mode || 'br'; delete gameControl.mode;
    let _zone = { cx: ARENA_W / 2, cy: ARENA_H / 2, r: 1650, waitTimer: 30 };
    let _zoneTimerAlpha = 0;
    const _vig = { c: null, w: 0, h: 0, dpr: 0 };   // the cached zone vignette
    const _zl = { sec: -1, st: -1, fs: 0, text: '', key: '', w: 0, h: 0 }; // the cached zone label (see TIMER ZONA)
    const _zombies        = [];  // by zombie id (server.js), hp -1 = dead / not drawn
    let   _zSeenGen       = 0;   // state packet counter, to spot zombies missing from the latest one
    const _zombieDeathFx  = [];
    const _pveState = { baseHp: 1000, baseMaxHp: 1000, wave: 0, waveBreak: false, breakTimer: 0, breakTimerMax: 15, myCoins: 0 };
    const _playerDeathFx  = [];  // { x, y, startTime, shards }
    const _prevPlayerAlive = {};
    const _healthKits   = new Map(); // id → {x, y, timeLeft}
    const _kitPickupFx  = [];        // { x, y, amount, startTime }
    const _coinFloats   = [];        // { x, y, amount, startTime } — coin earn popup
    const _coinDrops    = new Map(); // PvE coins on the ground: id -> { x, y, ox, oy, t0 } (ox/oy: where the zombie died)
    const _coinFx       = [];        // coins just taken: { x, y, t0 }, a short hop and fade
    const COIN_LAND_MS = ARPveCoins.LAND_MS, COIN_TTL_MS = ARPveCoins.TTL_MS, COIN_BLINK_MS = ARPveCoins.BLINK_MS;   // pve-coins.js: the server uses the same life
    const _kitDropAnim  = new Map(); // id → dropStartTime (animatie de cadere la spawn)
    const _obsShake     = {};   // obstacle index → shake start ms
    // The sideways offset of a shaking obstacle (hit by a bullet) at time now
    function _obsShakeX(i, now) {
        if (_obsShake[i] === undefined) return 0;
        const sa = (now - _obsShake[i]) / 1000;
        if (sa > 0.40) { delete _obsShake[i]; return 0; }
        return Math.sin(sa * 26 * Math.PI * 2) * 2.2 * (1 - sa / 0.40);
    }
    const hitEffects    = [];
    const _footsteps    = []; // { x, y, angle, t }
    const _footTimers   = {}; // pid → sec since last step
    const _footSide     = {}; // pid → 0|1
    const _prevPlayerPos = {};
    const _srvBulletSeen = new Map(); // bullet id → first-seen timestamp
    const _playerFx = new Map(); // socketId → shot effects (_newShotFx): recoil + muzzle flash
    // The mythic skins' pollen (SKIN EFFECTS): one pool for the whole screen, one emitter counter per player / bullet owner
    const _skinPool = ARSkinFx.createPool(), _skinEm = new Map();
    const _fxFor = id => { let f = _playerFx.get(id); if (!f) { f = _newShotFx(); _playerFx.set(id, f); } return f; };
    const prevHp         = {};
    const latestHp       = {}; // hp instantaneu din gs, fara delay de interpolatie
    const damageNumbers  = [];
    let _myLastKills     = -1; // -1 = neinitializat; previne notificari din gs-uri stale dupa reset

    const ammoState      = { ammo: 10, max: 10, reloading: false, reloadProgress: 1 };
    // Cache ammo bar pe OffscreenCanvas — redesenat doar la schimbarea starii, nu la 60fps
    const _ammoBarCache  = { oc: null, key: '' };



    const flashTimers      = {}; // {playerId: timestamp} — flash rosu la primirea damage-ului








    // ── Object pools for getInterpolatedState() — eliminate per-frame GC allocations ──
    // Players: persistent objects mutated in-place each frame (1 allocation per player ever)
    const _ISP = {};  // id → {id, name, x, y, angle, hp, maxHp, alive, kills}
    const _ISActiveIds = new Set(); // IDs active în frame curent — evita delete loop la fiecare frame
    const _IS = { players: {}, bullets: [] };

    // ── Client-side bullet prediction — instant visual feedback before server confirms ──
    // Every own bullet is drawn from this list. A prediction is spawned the moment you fire,
    // then linked to the server bullet that confirms it (sid). The server stays the authority:
    //   - server bullet disappears (it hit something)  -> the linked prediction is removed at once
    //   - server fires a bullet we did not predict     -> a "ghost" is spawned from server data, so
    //                                                    no bullet that deals damage is ever invisible
    //   - prediction never confirmed (phantom shot)    -> removed after ~RTT
    const _clientBullets    = []; // {x, y, dx, dy, life, spawnTime, sid, px, py, hiddenAt, dead}
    const _pendingBurstShots = []; // {spawnAt, x, y, dx, dy, life}
    let   _clientNextShotAt = 0;  // performance.now() timestamp of the next allowed local shot
    let   _ammoHoldUntil    = 0;  // keep the locally predicted ammo until the server confirms it
    const _ammoRow          = [0, 0, 0, 0, 0];
    const _ownLinked        = new Map(); // server bullet id -> client bullet
    const _ownUnmatched     = new Map(); // server bullet id -> first time seen without a prediction
    const _GHOST_GRACE_MS   = 50;
    let   _ownSeenGen       = 0;
    let   _srvSeenGen       = 0;
    const _bDiag = { predicted: 0, linked: 0, ghosts: 0, phantoms: 0, srvRemoved: 0, hitLinked: 0 };
    const _rttMs = () => (_pingRtt > 0 ? _pingRtt : 120);
    // Fire timing mirrors server.js. Cooldowns and burst delays carry their sub-tick remainder on
    // the server, so their average length is exact (SMG 120 ms, Burst cycle 800 ms); a real shot
    // lands up to one tick after its due time, which keeps our prediction slightly ahead.
    // The aim delay (weapons.json rules.aimDelay, 0 now = the gun fires as soon as the input lands; it was 0.3 s) is armed when the server applies the input, on
    // the first tick after it lands, and counted down from that same tick, so the server fires between
    // (k-1) and k ticks after the input lands (k = ticks to count the delay down, the server's own
    // arithmetic). Use the earliest: a prediction a few ms early links fine, one a few ms late races the
    // server bullet.
    const _AIM_MS = (() => { let c = WEAPON_RULES.aimDelay, k = 0; while (c > 0) { c -= ARShared.TICK_S; k++; } return Math.max(0, (k - 1) * ARShared.TICK_S * 1000); })();

    function _reconcileOwnBullets(bullets, now) {
        const myId = socket.id;
        _ownSeenGen++;
        const _linkWindow = Math.min(900, _rttMs() + 300);
        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            if (b.ownerId !== myId) continue;
            const known = _ownLinked.get(b.id);
            if (known) { known.seenGen = _ownSeenGen; continue; }
            if (_bDiag.srvLog && _bDiag.srvLog.length < 300) _bDiag.srvLog.push(Math.round(now));
            const sl = Math.hypot(b.dx, b.dy) || 1;
            const ux = b.dx / sl, uy = b.dy / sl;
            // Link to the best unconfirmed prediction: same direction, fired recently, oldest first
            let best = null, bestDot = 0;
            for (let k = 0; k < _clientBullets.length; k++) {
                const c = _clientBullets[k];
                if (c.sid !== null || c.dead || now - c.spawnTime > _linkWindow) continue;
                const cl = Math.hypot(c.dx, c.dy) || 1;
                const dot = (c.dx * ux + c.dy * uy) / cl;
                if (dot < 0.96) continue; // more than ~16 degrees apart: a different shot
                if (!best || dot > bestDot + 0.002 || (Math.abs(dot - bestDot) <= 0.002 && c.spawnTime < best.spawnTime)) {
                    best = c; bestDot = dot;
                }
            }
            if (!best) {
                // No prediction yet. Our own shot may still be a frame or two behind the server's
                // (very low ping, a slow frame): wait briefly before showing it from server data.
                const since = _ownUnmatched.get(b.id);
                if (since === undefined) { _ownUnmatched.set(b.id, now); continue; }
                if (now - since < _GHOST_GRACE_MS) continue;
            }
            _ownUnmatched.delete(b.id);
            if (best) {
                best.sid = b.id; best.seenGen = _ownSeenGen;
                _ownLinked.set(b.id, best);
                _bDiag.linked++;
                if (_bDiag.lagMax !== undefined) { const lg = now - best.spawnTime; _bDiag.lagSum += lg; if (lg > _bDiag.lagMax) _bDiag.lagMax = lg; if (_bDiag.lagList.length < 200) _bDiag.lagList.push(Math.round(lg)); }
            } else {
                // The server fired a shot this client did not predict: show it from server data
                const age = Math.min(0.3, _rttMs() / 2000 + _GHOST_GRACE_MS / 1000);
                const g = { x: b.x, y: b.y, dx: b.dx, dy: b.dy, life: Math.max(0.05, _myGunFire().bulletLife - age),
                            spawnTime: now, sid: b.id, seenGen: _ownSeenGen, px: b.x, py: b.y, hiddenAt: 0, dead: false, ghost: true };
                _clientBullets.push(g);
                _ownLinked.set(b.id, g);
                _bDiag.ghosts++;
                _shotKick(_fxFor(myId), now);
                if (_bDiag.ghostLog) {
                    const cands = _clientBullets.filter(c => c !== g).map(c => ({ age: Math.round(now - c.spawnTime), sid: c.sid, dead: c.dead, ghost: !!c.ghost,
                        dot: +((c.dx * ux + c.dy * uy) / (Math.hypot(c.dx, c.dy) || 1)).toFixed(3) }));
                    _bDiag.ghostLog.push({ sid: b.id, t: Math.round(now), win: _linkWindow, cands });
                }
            }
        }
        // Unmatched ids the server no longer sends (bullet died during the grace) are dropped
        if (_ownUnmatched.size) for (const [sid, t0] of _ownUnmatched) if (now - t0 > 1000) _ownUnmatched.delete(sid);
        // A linked bullet missing from this packet was removed by the server (hit or expired)
        for (const [sid, c] of _ownLinked) {
            if (c.seenGen !== _ownSeenGen) { _ownLinked.delete(sid); c.dead = true; _bDiag.srvRemoved++; }
        }
    }
    // The server tells the shooter which bullet hit (hit event, bid). Usually that bullet is
    // linked and the next packet removes it anyway. But a bullet fired point blank can hit on the
    // tick it is created and never appear in a packet: its prediction would then fly on for
    // ~RTT+200 ms before being dropped. Match it to the oldest unconfirmed prediction heading at
    // the target and end it now.
    function _ownBulletHit(bid, tx, ty) {
        const linked = _ownLinked.get(bid);
        if (linked) { linked.dead = true; return; }
        const now = performance.now();
        const win = Math.min(900, _rttMs() + 300);
        let best = null;
        for (let k = 0; k < _clientBullets.length; k++) {
            const c = _clientBullets[k];
            if (c.sid !== null || c.dead || now - c.spawnTime > win) continue;
            const l = Math.hypot(c.dx, c.dy) || 1, ux = c.dx / l, uy = c.dy / l;
            const wx = tx - c.x, wy = ty - c.y;
            const along = wx * ux + wy * uy, off = Math.abs(wx * uy - wy * ux);
            if (along < -60 || off > 70) continue; // not heading at this target
            if (!best || c.spawnTime < best.spawnTime) best = c;
        }
        if (!best) return;
        best.sid = bid; best.dead = true;  // dead + linked: removed without a tombstone or phantom count
        _bDiag.hitLinked++;
    }
    // x, y: the muzzle; ox, oy: the shooter's centre, where the first swept hit test starts (server.js sx, sy)
    function _newClientBullet(x, y, dx, dy, life, now, ox, oy) {
        _bDiag.predicted++;
        _shotKick(_fxFor(socket.id), now);
        if (_bDiag.spawnLog && _bDiag.spawnLog.length < 300) { _bDiag.spawnLog.push(Math.round(now)); _bDiag.spawnPos.push([+x.toFixed(2), +y.toFixed(2), +ox.toFixed(2), +oy.toFixed(2), +(dx / Math.hypot(dx, dy)).toFixed(4), +(dy / Math.hypot(dx, dy)).toFixed(4)]); }
        return { x, y, dx, dy, life, spawnTime: now, sid: null, seenGen: 0, px: ox, py: oy, hiddenAt: 0, dead: false, noPredict: false };
    }
    // The equipped gun's muzzle distance and bullet lifetime (WEAPON_ART, same formula as server.js)
    function _myGunFire() {
        const g = WEAPON_ART.byId[selectedWeapon] || WEAPON_ART.byId[DEFAULT_WEAPON];
        return g ? g : { muzzleDist: ARShared.LEGACY_MUZZLE, bulletLife: (_WEAPON_DATA[selectedWeapon] || _WEAPON_DATA[DEFAULT_WEAPON]).bulletLife };
    }
    function _removeClientBullet(i) {
        const c = _clientBullets[i];
        // Still alive on the server (e.g. our copy timed out first): leave a tombstone so the
        // next packet does not mistake it for an unpredicted shot and spawn a ghost of it.
        if (c.sid !== null && !c.dead) _ownLinked.set(c.sid, { tomb: true, seenGen: c.seenGen, dead: true });
        _clientBullets.splice(i, 1);
    }

    // Collision constants mirrored from the server (server.js: PLAYER_SIZE / 2, PVE_ZOMBIE_DEFS.r, PVE_BASE_R)
    const PLAYER_HIT_R   = 30;
    const _PVE_ZB_RADIUS = [20, 16, 28]; // normal, runner, tank
    const _PVE_BASE_R    = 85;
    const _PVE_BASE      = { x: ARENA_W / 2, y: ARENA_H / 2, r: _PVE_BASE_R };   // a solid circle for bullets and players
    const _solidOut      = { x: 0, y: 0 };
    // Same slide-out the server applies to a player after moving (obstacles, then the PvE base)
    function _pushOutOfSolids(x, y) {
        for (let i = 0; i < _obstacles.length; i++) {
            const o = _obstacles[i];
            const ox = x - o.x, oy = y - o.y, m = o.r + PLAYER_HIT_R, dSq = ox * ox + oy * oy;
            if (dSq >= m * m || dSq === 0) continue;
            const d = Math.sqrt(dSq);
            x = o.x + ox / d * m; y = o.y + oy / d * m;
        }
        if (_gameMode === 'pve') {
            const bx = ARENA_W / 2, by = ARENA_H / 2;
            const ox = x - bx, oy = y - by, m = _PVE_BASE_R + PLAYER_HIT_R, dSq = ox * ox + oy * oy;
            if (dSq < m * m && dSq > 0) { const d = Math.sqrt(dSq); x = bx + ox / d * m; y = by + oy / d * m; }
        }
        _solidOut.x = x; _solidOut.y = y;
        return _solidOut;
    }
    // Earliest t in [0,1] where segment (x0,y0)->(x1,y1) touches circle (cx,cy,R); -1 if never.
    // Same maths as game-physics.js on the server.
    function _segCircleT(x0, y0, x1, y1, cx, cy, R) {
        const fx = x0 - cx, fy = y0 - cy;
        const c = fx * fx + fy * fy - R * R;
        if (c <= 0) return 0;
        const dx = x1 - x0, dy = y1 - y0;
        const a = dx * dx + dy * dy;
        if (a === 0) return -1;
        const b = 2 * (fx * dx + fy * dy);
        if (b >= 0) return -1;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return -1;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        return t <= 1 ? t : -1;
    }

    // True if the segment an enemy bullet is extrapolated along touches an obstacle, a zombie or
    // (BR only) a player other than its owner. Same radii as the server's hit test (game-physics.js: r + BULLET_RADIUS).
    function _enemyBulletBlocked(x0, y0, x1, y1, ownerId, rState) {
        const minX = x0 < x1 ? x0 : x1, maxX = x0 < x1 ? x1 : x0;
        const minY = y0 < y1 ? y0 : y1, maxY = y0 < y1 ? y1 : y0;
        for (let i = 0; i < _obstacles.length; i++) {
            const o = _obstacles[i], R = o.r + 6;
            if (o.x + R < minX || o.x - R > maxX || o.y + R < minY || o.y - R > maxY) continue;
            if (_segCircleT(x0, y0, x1, y1, o.x, o.y, R) >= 0) return true;
        }
        if (_gameMode === 'pve') {
            const R = _PVE_BASE.r + 6;
            if (!(_PVE_BASE.x + R < minX || _PVE_BASE.x - R > maxX || _PVE_BASE.y + R < minY || _PVE_BASE.y - R > maxY)
                && _segCircleT(x0, y0, x1, y1, _PVE_BASE.x, _PVE_BASE.y, R) >= 0) return true;
        }
        for (let i = 0; i < _zombies.length; i++) {
            const z = _zombies[i];
            if (!z || z.hp <= 0) continue;
            const R = (_gameMode === 'pve' ? (_PVE_ZB_RADIUS[z.type || 0] || 20) : 20) + 6;
            if (z.x + R < minX || z.x - R > maxX || z.y + R < minY || z.y - R > maxY) continue;
            if (_segCircleT(x0, y0, x1, y1, z.x, z.y, R) >= 0) return true;
        }
        if (_gameMode === 'pve') return false; // no friendly fire: bullets pass through teammates
        const R = PLAYER_HIT_R + 6;
        for (const pid in rState.players) {
            if (pid === ownerId) continue;
            const p = rState.players[pid];
            if (!p.alive || _hiddenPlayers.has(pid)) continue;
            const mine = pid === socket.id && predX !== null;
            const px = mine ? predX : p.x, py = mine ? predY : p.y;
            if (px + R < minX || px - R > maxX || py + R < minY || py - R > maxY) continue;
            if (_segCircleT(x0, y0, x1, y1, px, py, R) >= 0) return true;
        }
        return false;
    }

    // Opt-in diagnostics for automated tests (localStorage.ar_diag = '1'); no effect otherwise
    try {
        if (localStorage.getItem('ar_diag') === '1') {
            _bDiag.lagSum = 0; _bDiag.lagMax = 0; _bDiag.lagList = []; _bDiag.spawnLog = []; _bDiag.srvLog = []; _bDiag.csp = []; _bDiag.track = []; _bDiag.phantomLog = []; _bDiag.ammoLog = []; _bDiag.ghostLog = []; _bDiag.frames = []; _bDiag.spawnPos = [];
            window.__arDiag = () => ({ ..._bDiag, interp: _interpShow, buf: stateBuffer.length, active: _clientBullets.length, linkedNow: _ownLinked.size, rtt: _pingRtt, pktPs: _dbgPktPs, fps: _dbgFps, st: { isShooting, mustRelease: _shootMustRelease, ammo: ammoState.ammo, reloading: ammoState.reloading, aim: aimStartTime, cd: gameControl.countdownActive, dead: _selfDead, predX, next: _clientNextShotAt, now: performance.now(), ended: gameEnded } });
            window.__arZombies = () => _zombies.filter(z => z && z.hp > 0).map(z => [z.x, z.y]);
            window.__arMe = () => [predX, predY];
            window.__arObs = () => _obstacles; // the obstacles as the client has them (map sprites tests)
            window.__arIS = () => _IS; // the other players as last rendered (interpolation)
            window.__arBullets = () => { const o = [], bl = _IS.bullets, age = _IS.bulletAge || 0; if (bl) for (const b of bl) { if (b.ownerId !== socket.id) o.push(b.id, b.x + b.dx * age, b.y + b.dy * age); } return o; }; // enemy bullets as drawn (id, x, y)
        }
    } catch (e) { /* storage blocked */ }

    // Cached DOM references — evita getElementById in hot paths (draw loop, gs handler)
    const _specNameEl     = document.getElementById('spec-target-name');
    const _specHpEl       = document.getElementById('spec-target-hp');
    const _playersAliveEl = document.getElementById('players-alive');

    // ── Debug overlay (toggle with backtick `) ────────────────────────────────
    let _dbgVisible   = false;
    let _dbgFpsFrames = 0, _dbgFpsWindowStart = 0, _dbgFps = 0;
    let _dbgGsCount   = 0, _dbgGsWindowStart  = 0, _dbgGs  = 0;
    let _dbgDrawMs    = 0, _dbgUpdateMs        = 0;
    let _dbgPending   = 0;
    let _dbgSrvTps    = '?', _dbgSrvEnts = 0, _dbgSrvPickups = 0;
    let _pingRtt      = -1;
    const _dbgBtn     = document.getElementById('btn-debug-toggle');
    function _toggleDbg() {
        _dbgVisible = !_dbgVisible;
        if (_dbgBtn) _dbgBtn.classList.toggle('active', _dbgVisible);
    }
    window._toggleDbg = _toggleDbg;
    const _onDbgKey = (e) => { if (e.key === '`') _toggleDbg(); };
    window.addEventListener('keydown', _onDbgKey);

    // Lag black box (blackbox.js): F8 starts it in a match. The hooks below cost one check while it is off.
    const _BB = window.ARBlackBox || { on: false, attach() {}, detach() {}, frame() {}, packet() {}, csp() {}, ping() {}, event() {} };
    _BB.attach({
        socket,
        meta: () => ({ mode: _gameMode, weapon: selectedWeapon, resolutionStep: _RS.idx, resolutionScale: _rsScale(), canvas: [canvas.width, canvas.height] }),
        counts: () => {
            let z = 0;
            for (let i = 0; i < _zombies.length; i++) if (_zombies[i] && _zombies[i].hp > 0) z++;
            const e = stateBuffer[stateBuffer.length - 1];
            return [z, e ? e.bullets.length : 0, e ? Object.keys(e.players).length : 0];
        },
    });

    // Ping RTT measurement — trimis la fiecare 2s, server echoueaza timestamp
    socket.on('c-pong', (t, srvNow, srvStalls) => { _pingRtt = Math.round(performance.now() - t); if (_BB.on) _BB.ping(performance.now(), _pingRtt, srvNow, srvStalls); });
    const _pingInterval = setInterval(() => { if (!gameEnded) socket.emit('c-ping', performance.now()); }, 2000);

    let mouseActive = false;
    let _lineDashZoom = -1;
    let _lineDashArr  = [0, 0];

    // Input send rate matches server tick (60Hz = 17ms).
    // All input (move + rotate + shoot) goes through one unified packet from rAF.
    const EMIT_MS         = ARShared.TICK_S * 1000; // one server tick (16.7 ms)
    // ── Interpolation clock ──────────────────────────────────────────────────
    // Snapshots sit on the server's simulation timeline (tick number x tick length, entry.st), so neither
    // network jitter nor a server tick that runs a little late bunches them up. The render delay covers
    // how late packets arrive: the 95th percentile over the last ~3 s plus one tick and a small margin,
    // between 26 and 70 ms (~28 on a clean line). A delivery pause shows up as one late packet followed
    // by the queued ones arriving soon after; only the first counts (the rest are late only because they
    // waited behind it), so a pause now and then does not move the delay at all. The delay moves at
    // most 1.5 ms per packet in either direction (about 9 % slow-motion or fast-forward), so whatever it
    // climbs on a bad line it gives back just as fast. During a pause the other players are
    // extrapolated for a short while (getInterpolatedState) instead of freezing.
    const INTERP_MIN_MS = 26, INTERP_MAX_MS = 70, CLOCK_WIN = 180;
    const CLOCK_STEP_MS = 1.5;  // per packet, both ways
    const EXTRAP_MS     = 100;  // how far past the newest snapshot other players keep moving in a pause
    const CORRECT_MS    = 60;   // time constant for blending out the guess once real data is back
    const PAUSE_LATE_MS = 30;   // a packet this late starts a delivery pause...
    const PAUSE_WIN_MS  = 300;  // ...and the less late ones within this time are its queue draining
    const _offWin   = new Float64Array(CLOCK_WIN);  // arrival time - server time, per packet
    const _lateSort = new Float64Array(CLOCK_WIN);
    let _offN = 0, _offI = 0, _pauseEnd = -1, _pauseLate = 0;
    let _clockLag   = null; // render server-time = performance.now() - _clockLag (a large negative number: clocks differ)
    let _interpShow = 34;   // current delay, for the debug overlay
    function _noteSnapshotClock(now, st) {
        // A delivery pause: the first late packet counts, the ones draining the queue behind it do not
        let count = true;
        if (_offN > 0) {
            let m = Infinity;
            for (let i = 0; i < _offN; i++) if (_offWin[i] < m) m = _offWin[i];
            const lateNow = now - st - m;
            if (now < _pauseEnd && lateNow < _pauseLate) count = false;
            else if (lateNow > PAUSE_LATE_MS) { _pauseEnd = now + PAUSE_WIN_MS; _pauseLate = lateNow; }
        }
        if (count) {
            _offWin[_offI] = now - st;
            _offI = (_offI + 1) % CLOCK_WIN;
            if (_offN < CLOCK_WIN) _offN++;
        }
        let offMin = Infinity;
        for (let i = 0; i < _offN; i++) if (_offWin[i] < offMin) offMin = _offWin[i];
        for (let i = 0; i < _offN; i++) _lateSort[i] = _offWin[i] - offMin;
        const late = _lateSort.subarray(0, _offN).sort();
        const p95 = late[Math.min(_offN - 1, Math.floor(_offN * 0.95))];
        const delay = Math.max(INTERP_MIN_MS, Math.min(INTERP_MAX_MS, p95 + EMIT_MS + 6));
        const target = offMin + delay;
        if (_clockLag === null || Math.abs(target - _clockLag) > 250) _clockLag = target;  // first packet / tab resumed
        else _clockLag += Math.max(-CLOCK_STEP_MS, Math.min(CLOCK_STEP_MS, target - _clockLag));
        _interpShow = _clockLag - offMin;
    }
    function _resetSnapshotClock() { _offN = 0; _offI = 0; _pauseEnd = -1; _clockLag = null; }

    let _inputSeq        = 0;
    let _lastInputSend   = 0;
    const _pendingInputs = []; // [{seq, dx, dy, dt}] — replay buffer for CSP

    // ── Inputs: one per server tick ──────────────────────────────────────────
    // An input goes out for every state packet the server sends (one per tick), so the client can never
    // send faster or slower than the server ticks: no drift, whatever the frame rate or timer precision.
    // A burst of packets (after a network pause) sends one input, not one per packet. The server applies
    // them one per tick (server.js applyInput), so each input moves the player exactly one tick: that is
    // also what the prediction replays (dt below).
    function _sendInputForTick(now) {
        // same burst as the previous packet (bursts after a pause arrive < 1 ms apart; a server tick that
        // ran a little late can be followed by one ~5 ms later, which still gets its own input)
        if (now - _lastInputSend < EMIT_MS / 4) return;
        _sendInput(now);
    }
    function _sendInput(now) {
        if (gameEnded || gameControl.countdownActive || _selfDead || _pveState.waveBreak) return;
        _lastInputSend = now;
        const seq = ++_inputSeq;
        socket.emit('input', {
            seq,
            dx: moveDir.x,  dy: moveDir.y,
            angle: myAngle,
            shooting: isShooting,
            sdx: (isShooting || _aimActive) ? -Math.sin(myAngle) : 0,
            sdy: (isShooting || _aimActive) ?  Math.cos(myAngle) : 0,
        });
        _dbgPktSent++;
        // Record for CSP replay (limit buffer to ~3s worth of inputs)
        if (predX !== null) {
            _pendingInputs.push({ seq, dx: moveDir.x, dy: moveDir.y, dt: ARShared.TICK_S });
            if (_pendingInputs.length > 180) _pendingInputs.shift();
        }
    }

    // Debug: track packets sent/sec
    let _dbgPktSent = 0, _dbgPktSentWindow = 0, _dbgPktPs = 0;

    // ── Diagnostic sparkline ring-buffers (Float32Array = no GC, no alloc per frame) ──
    const _GRAPH_N    = 120;  // 2s of history at 60fps
    const _graphFps   = new Float32Array(_GRAPH_N);
    const _graphFt    = new Float32Array(_GRAPH_N); // frame time ms
    const _graphErr   = new Float32Array(_GRAPH_N); // CSP pred error px
    const _graphMem   = new Float32Array(_GRAPH_N); // JS heap MB
    const _graphPkts  = new Float32Array(_GRAPH_N); // packets/s sent
    const _graphLag   = new Float32Array(_GRAPH_N); // estimated input lag ms
    let   _graphHead  = 0;

    function _emitStop() {
        moveDir.x = 0; moveDir.y = 0;
    }

    let _lastJoyMoveX = 0, _lastJoyMoveY = 0;


    joystickLeft.on('move', (evt, data) => {
        if (gameEnded || gameControl.countdownActive) return;
        const force = data.force || 0;
        if (force >= MOVE_THRESHOLD) {
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) {
                moveDir.x = data.vector.x / len;
                moveDir.y = -data.vector.y / len;
                moveAngle = Math.atan2(-moveDir.x, moveDir.y);
                if (!isShooting && !_aimActive && !mouseActive) myAngle = moveAngle;
                // rAF unified input sends the angle at 30Hz
            }
        } else {
            moveDir.x = 0; moveDir.y = 0;
        }
        // State updated in moveDir — rAF at 30Hz handles the emit.
        _lastJoyMoveX = moveDir.x;
        _lastJoyMoveY = moveDir.y;
    });

    joystickLeft.on('end', () => {
        _emitStop(); // zeros moveDir; rAF sends the updated state
    });

    let _lastJoyAngle = null;

    joystickRight.on('move', (evt, data) => {
        if (gameEnded || gameControl.countdownActive || _pveState.waveBreak) return;
        const force = data.force || 0;
        if (force >= SHOOT_THRESHOLD) {
            _aimActive = true;
            const now = performance.now();
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) { shootDir.x = data.vector.x / len; shootDir.y = -data.vector.y / len; }
            if (!isShooting) {
                if (_shootMustRelease && _clientHasReleased && ammoState.ammo > 0) {
                    _shootMustRelease = false;
                    _clientHasReleased = false;
                }
                if (!_shootMustRelease) { isShooting = true; aimStartTime = now; }
            }
            myAngle = Math.atan2(data.vector.y, -data.vector.x) + Math.PI / 2;
            _lastJoyAngle = myAngle;
        } else {
            _aimActive = false;
            if (isShooting) { isShooting = false; aimStartTime = null; }
        }
        // rAF unified input handles emit
    });

    joystickRight.on('end', () => {
        _aimActive = false;
        _clientHasReleased = true;
        // Curata _shootMustRelease doar daca exista ammo; altfel asteptam reload complet
        if (ammoState.ammo > 0) _shootMustRelease = false;
        if (isShooting) { isShooting = false; aimStartTime = null; }
        if (!mouseActive && (moveDir.x !== 0 || moveDir.y !== 0)) myAngle = moveAngle;
        // the stop goes out with the next input (one per server tick)
    });

    // ---------- WASD + MOUSE ----------
    const keysHeld = new Set();

    function updateKeyMove() {
        let dx = 0, dy = 0;
        if (keysHeld.has('w') || keysHeld.has('arrowup'))    dy -= 1;
        if (keysHeld.has('s') || keysHeld.has('arrowdown'))  dy += 1;
        if (keysHeld.has('a') || keysHeld.has('arrowleft'))  dx -= 1;
        if (keysHeld.has('d') || keysHeld.has('arrowright')) dx += 1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            moveDir.x = dx / len; moveDir.y = dy / len;
            moveAngle = Math.atan2(-moveDir.x, moveDir.y);
            if (!isShooting && !_aimActive && !mouseActive) myAngle = moveAngle;
        } else {
            moveDir.x = 0; moveDir.y = 0;
        }
        // Emit happens in rAF at 30Hz — no direct emit here.
    }

    // Handleri numiti — necesari pentru removeEventListener la cleanup
    const onKeyDown = (e) => {
        if (gameEnded || gameControl.countdownActive || _pveState.waveBreak) return;
        const k = e.key.toLowerCase();
        if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) {
            e.preventDefault();
            keysHeld.add(k);
            updateKeyMove();
        }
    };
    const onKeyUp = (e) => {
        keysHeld.delete(e.key.toLowerCase());
        updateKeyMove();
    };
    const onPointerMove = (e) => {
        if (e.pointerType !== 'mouse') return;
        mouseActive = true;
        const rect = canvas.getBoundingClientRect();
        const W  = canvas.width  / _rsDpr();
        const H  = canvas.height / _rsDpr();
        const dx = (e.clientX - rect.left) - W / 2;
        const dy = (e.clientY - rect.top)  - H / 2;
        myAngle = Math.atan2(-dx, dy);
        // Angle is sent via unified input at 30Hz from rAF — no separate rotate emit needed.
        // Sending 'rotate' here too doubled mouse packet rate and caused server-side angle
        // race conditions with the input packet arriving in the same tick window.
        if (isShooting) {
            shootDir.x = -Math.sin(myAngle);
            shootDir.y =  Math.cos(myAngle);
            // Shoot emit handled after aim delay in draw loop
        }
    };
    const onPointerLeave = (e) => {
        if (e.pointerType !== 'mouse') return;
        mouseActive = false;
    };
    const onPointerDown = (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0 || gameEnded || gameControl.countdownActive || _pveState.waveBreak) return;
        _aimActive = true;
        _clientHasReleased = ammoState.ammo > 0 ? false : _clientHasReleased;
        if (ammoState.ammo > 0) _shootMustRelease = false;
        if (!_shootMustRelease) { isShooting = true; aimStartTime = performance.now(); }
        else { _clientHasReleased = true; } // marcheaza release pentru a permite re-armare cand ammo revine
        shootDir.x = -Math.sin(myAngle);
        shootDir.y =  Math.cos(myAngle);
        // Shoot state captured by rAF unified input at 30Hz
    };
    const onPointerUp = (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        _aimActive = false;
        _clientHasReleased = true;
        if (ammoState.ammo > 0) _shootMustRelease = false;
        isShooting = false;
        aimStartTime = null;
        if (moveDir.x !== 0 || moveDir.y !== 0) myAngle = moveAngle;
        // the stop goes out with the next input (one per server tick)
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    canvas.addEventListener('pointermove',  onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown',  onPointerDown);
    canvas.addEventListener('pointerup',    onPointerUp);

    let rafId = null;

    // Cleanup global: distrug joystick-urile, event listener-ele si RAF-ul
    // Apelat de returnToLobby() pentru a preveni instante duplicate la jocul urmator
    window._gameCleanup = () => {
        joystickLeft.destroy();
        joystickRight.destroy();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup',   onKeyUp);
        window.removeEventListener('keydown', _onDbgKey);
        _BB.detach();   // saves the report if it was running
        canvas.removeEventListener('pointermove',  onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('pointerdown',  onPointerDown);
        canvas.removeEventListener('pointerup',    onPointerUp);
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        clearInterval(_pingInterval);
        moveDir.x = 0; moveDir.y = 0;
        isShooting = false;
        aimStartTime = null;
        gameEnded = false;
        _pendingInputs.length = 0;
        _inputSeq = 0;
        _lastInputSend = 0;
        document.removeEventListener('visibilitychange', _visibilityHandler);
    };

    // ---------- STAREA JOCULUI ----------
    let lastGameStateTime = 0;

    // iOS Safari: cand pagina revine din fundal (ecran pornit / app switch),
    // reseteaza watchdog-ul ca sa nu arate fals "Conexiune Pierduta"
    const _visibilityHandler = () => {
        if (document.visibilityState === 'visible' && lastGameStateTime > 0) {
            lastGameStateTime = performance.now();
        }
    };
    document.addEventListener('visibilitychange', _visibilityHandler);
    let _lastDomHudUpdate = 0;
    const killFeedEl  = document.getElementById('kill-feed');
    const myKillsEl   = document.getElementById('my-kills');

    function showKillNotif(count) {
        const notif   = document.getElementById('kill-notif');
        const countEl = document.getElementById('kill-notif-count');
        countEl.textContent = count === 1 ? '1 KILL' : `${count} KILLS`;
        notif.classList.remove('active');
        void notif.offsetWidth;
        notif.classList.add('active');
    }

    socket.on('leaderboard-update', (data) => {
        const overlay = document.getElementById('lb-overlay');
        if (overlay && overlay.style.display !== 'none') renderLeaderboardOverlay(data);
    });

    socket.on('kit-pickup', ({ amount, x, y }) => {
        _kitPickupFx.push({ x, y, amount: Math.round(amount), startTime: performance.now() });
    });

    socket.on('hit', ({ amount, x, y, bid }) => {
        damageNumbers.push({ x, y: y - 20, amount, startTime: performance.now(), dir: Math.random() < 0.5 ? -1 : 1, rot: (Math.random() - 0.5) * 0.3 });
        if (bid !== undefined) _ownBulletHit(bid, x, y);
    });

    // Server performance stats — emitted every 2 s; used by debug overlay
    socket.on('srv-stats', ({ tps, ents, pickups }) => {
        _dbgSrvTps     = tps;
        _dbgSrvEnts    = ents;
        _dbgSrvPickups = pickups || 0;
    });

    const _own = { ammo: 0, max: 0, reloading: false, reloadProgress: 1, ack: 0, coins: 0 };
    socket.on(ARNet.EVENT, (pk) => {
        // [tick, players, bullets, zombies, kits, zone, pve, own]: see public/netproto.js
        const tickNo = pk[0], pFlat = pk[1], bFlat = pk[2], zArr = pk[3], kArr = pk[4], zone2 = pk[5], pve2 = pk[6], ownRow = pk[7];

        _dbgGsCount++;
        const now = performance.now();
        if (_BB.on) _BB.packet(now, tickNo, pFlat.length / 6, bFlat.length / 6, zArr ? zArr.length / 6 : 0);
        _sendInputForTick(now); // one input per server tick (see _sendInputForTick)
        // This client's own row (ammo, reload, ack, coins) comes last in the packet; the rest is shared by the room
        let ammoArr = null, _myCoins = 0;
        if (ownRow) {
            ARNet.own(ownRow, _own);
            _ammoRow[0] = _own.ammo; _ammoRow[1] = _own.max; _ammoRow[2] = _own.reloading ? 1 : 0;
            _ammoRow[3] = _own.reloadProgress; _ammoRow[4] = _own.ack;
            ammoArr = _ammoRow; _myCoins = _own.coins;
        }
        const pveArr = pve2 ? [pve2[0], pve2[1], pve2[2], pve2[3], pve2[4] / ARNet.TQ, _myCoins] : null;
        if (ammoArr) {
            const _prevAmmo = ammoState.ammo;
            // Locally predicted shots spend ammo instantly; the server catches up ~RTT later.
            // Until then an older (higher) server value must not undo the prediction.
            const _srvAmmo = Math.max(0, ammoArr[0] || 0);
            if (_bDiag.ammoLog && _bDiag.ammoLog.length < 400 && _bDiag._lastSrvAmmo !== _srvAmmo) { _bDiag._lastSrvAmmo = _srvAmmo; _bDiag.ammoLog.push(Math.round(now) + ":" + _srvAmmo + ":" + (ammoArr[2] ? 1 : 0)); }
            const _holdPrediction = now < _ammoHoldUntil && _srvAmmo > ammoState.ammo && !ammoArr[2];
            if (!_holdPrediction) ammoState.ammo = _srvAmmo;
            ammoState.max  = Math.max(1, ammoArr[1] || 10);
            ammoState.reloading      = !!ammoArr[2];
            ammoState.reloadProgress = Math.max(0, Math.min(1, ammoArr[3] ?? 1));
            if (_prevAmmo > 0 && ammoState.ammo === 0) {
                _shootMustRelease = true;
                _clientHasReleased = false;
            }
            if (_prevAmmo === 0 && ammoState.ammo > 0 && !ammoState.reloading) {
                _shootMustRelease = false;
                _clientHasReleased = true;
            }
            // Magazine refilled while the trigger is still held: the server clears its
            // "release to shoot" lock on a full reload and starts firing again after a fresh
            // AIM_DELAY (server.js reload branch + input handler). Mirror it, or those shots are
            // never predicted and only show up late, from server data.
            if (_shootMustRelease && isShooting && _prevAmmo < ammoState.max && ammoState.ammo >= ammoState.max &&
                !ammoState.reloading && (_WEAPON_DATA[selectedWeapon] || {}).fireMode !== 'semi') {
                _shootMustRelease = false;
                _clientHasReleased = true;
                aimStartTime = now;
            }
        }
        if (zone2) {   // the centre never moves (the middle of the arena)
            _zone.r = zone2[0]; _zone.waitTimer = zone2[1] / ARNet.TQ;
        }
        if (pveArr) {
            _pveState.baseHp      = pveArr[0];
            _pveState.baseMaxHp   = pveArr[1];
            _pveState.wave        = pveArr[2];
            _pveState.waveBreak   = !!pveArr[3];
            _pveState.breakTimer  = pveArr[4];
            _pveState.myCoins     = pveArr[5];
            updatePveHud();
        }
        if (zArr) {
            // Live zombies only, 6 values each: id, x, y, angle x100, hp, type. One that is no longer
            // listed has died (its last position is kept for the death effect; hp -1 = not drawn).
            const _zGen = ++_zSeenGen;
            for (let _zi = 0; _zi < zArr.length; _zi += 6) {
                const _zid = zArr[_zi];
                const _zb = _zombies[_zid] || (_zombies[_zid] = { hp: -1 });
                const _zPrevHp = _zb.hp;
                // sx, sy, sa: where the server has it now. What is drawn (x, y, angle) is blended between two
                // snapshots in getInterpolatedState; a zombie seen for the first time starts at its server place.
                _zb.sx = zArr[_zi + 1] / ARNet.PQ; _zb.sy = zArr[_zi + 2] / ARNet.PQ; _zb.sa = zArr[_zi + 3] / ARNet.ZAQ;
                if (_zPrevHp < 0) { _zb.x = _zb.sx; _zb.y = _zb.sy; _zb.angle = _zb.sa; }
                _zb.hp = zArr[_zi + 4];
                _zb.type = zArr[_zi + 5] || 0;
                _zb.seen = _zGen;
                if (_zPrevHp > 0 && _zPrevHp - _zb.hp > 0.5) {
                    hitEffects.push({ x: _zb.sx, y: _zb.sy, life: 2.0 });
                }
            }
            for (let _zi = 0; _zi < _zombies.length; _zi++) {
                const _zb = _zombies[_zi];
                if (!_zb || _zb.seen === _zGen || _zb.hp < 0) continue;
                if (_zb.hp > 0) { // death effect
                    const _shards = [];
                    const _k0 = (Math.random() * 5) | 0;   // zombie pieces are kinds 0-4 (arena-art.js drawShard)
                    for (let _si = 0; _si < 7; _si++) {
                        _shards.push({ angle: (_si / 7) * Math.PI * 2 + Math.random() * 0.4, speed: 35 + Math.random() * 45, rot: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 8, kind: (_k0 + _si) % 5, size: 0.8 + Math.random() * 0.35 });
                    }
                    _zombieDeathFx.push({ x: _zb.x, y: _zb.y, startTime: performance.now(), shards: _shards });
                }
                _zb.hp = -1;
            }
        }
        if (kArr) {
            const _kSeen = new Set();
            for (let _ki = 0; _ki < kArr.length; _ki += 4) {
                const _kid = kArr[_ki];
                _kSeen.add(_kid);
                if (!_healthKits.has(_kid)) _kitDropAnim.set(_kid, performance.now());
                _healthKits.set(_kid, { x: kArr[_ki+1], y: kArr[_ki+2], timeLeft: kArr[_ki+3] });
            }
            for (const [_kid] of _healthKits) {
                if (!_kSeen.has(_kid)) { _healthKits.delete(_kid); _kitDropAnim.delete(_kid); }
            }
        }
        // Server sends velocity normalised by ARShared.NET_BULLET_SPEED (1000 px/s). The old 1400 factor made
        // every enemy bullet extrapolate 40% too fast, then snap back on the next packet (jitter).
        const entry = {
            t:       now,
            // the server's simulation time: tick number x tick length (older servers: the tick's wall clock)
            st:      tickNo * ARShared.TICK_S * 1000,
            players: {},
            z:       zArr || null,   // the packet's zombie list, blended per frame (ARInterp.zombies)
            // direction arrives x1000 (server.js state packet)
            bullets: ARNet.bullets(bFlat, _slotId, WEAPON_RULES.bulletRadius),
        };
        _reconcileOwnBullets(entry.bullets, now);
        // Trail age bookkeeping for other players' bullets: once per packet, not per frame
        _srvSeenGen++;
        for (const b of entry.bullets) {
            const _s = _srvBulletSeen.get(b.id);
            if (_s) _s.gen = _srvSeenGen;
            else {
                _srvBulletSeen.set(b.id, { t: now, gen: _srvSeenGen });
            }
        }
        for (const [_sid, _s] of _srvBulletSeen) { if (_s.gen !== _srvSeenGen) _srvBulletSeen.delete(_sid); }

        ARNet.eachPlayer(pFlat, (slot, x, y, angle, hp, alive, kills) => {
            const id = _slotId[slot];
            if (id === undefined) return;
            const meta = playerMeta[id] || {};
            if (!alive) _hiddenPlayers.delete(id);
            // Detectie moarte jucator → efect vizual
            if (!alive && _prevPlayerAlive[id] === true && id !== socket.id) {
                const _dshards = [];
                const _dk0 = (Math.random() * 5) | 0;   // player pieces are kinds 5-9
                for (let _si = 0; _si < 8; _si++) {
                    _dshards.push({ angle: (_si / 8) * Math.PI * 2 + Math.random() * 0.5, speed: 45 + Math.random() * 55, rot: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 9, kind: 5 + (_dk0 + _si) % 5, size: 0.85 + Math.random() * 0.35 });
                }
                _playerDeathFx.push({ x, y, startTime: performance.now(), shards: _dshards });
            }
            _prevPlayerAlive[id] = !!alive;
            entry.players[id] = { id, x, y, angle, hp, maxHp: meta.maxHp || 500, alive: !!alive, kills, name: meta.name || '' };
        });


        _noteSnapshotClock(now, entry.st);
        stateBuffer.push(entry);
        while (stateBuffer.length > 20) stateBuffer.shift();
        lastGameStateTime = now;

        const me = entry.players[socket.id];
        if (me && !_selfDead) {
            const meta = playerMeta[socket.id];
            if (meta && meta.speed) predSpeed = meta.speed;

            // ── Client-Side Prediction Reconciliation (replay-based) ──────────
            // 1. Remove inputs the server has already processed (seq <= ackSeq).
            // 2. From the authoritative server position, replay the remaining
            //    unacknowledged inputs to compute where we should be right now.
            // 3. Smooth-correct predX/Y toward the replayed position.
            const ackSeq = (ammoArr && ammoArr[4]) ? ammoArr[4] : 0;
            while (_pendingInputs.length > 0 && _pendingInputs[0].seq <= ackSeq) {
                _pendingInputs.shift();
            }
            let _rx = me.x, _ry = me.y;
            for (const inp of _pendingInputs) {
                _rx = Math.max(20, Math.min(ARENA_W - 20, _rx + inp.dx * predSpeed * inp.dt));
                _ry = Math.max(20, Math.min(ARENA_H - 20, _ry + inp.dy * predSpeed * inp.dt));
                const _rs = _pushOutOfSolids(_rx, _ry); // same slide-out as the server tick
                _rx = _rs.x; _ry = _rs.y;
            }
            // Always anchor predX/Y to the replayed position.
            // Previously: only applied for errors >150px, so small drift accumulated
            // indefinitely and micro-corrections caused constant jitter.
            // Now: tiny errors (timing noise) correct gently each tick; large errors snap.
            if (predX === null || isNaN(predX) || isNaN(predY)) {
                predX = _rx; predY = _ry;
            } else {
                const _cspErr = Math.hypot(_rx - predX, _ry - predY);
                if (_bDiag.csp && _bDiag.csp.length < 5000) _bDiag.csp.push(+_cspErr.toFixed(2));
                if (_BB.on) _BB.csp(now, _cspErr);
                if (_cspErr > 90 && now - _waveStartAt < 1500) {
                    // The server put everyone back by the base for the new wave (startPveWave): not a drift to blend away.
                    // Sliding there at 40 px per tick looked like flying across the map (and a jump with no cue past 400 px);
                    // snap and phase in instead.
                    predX = _rx; predY = _ry;
                    _tpFx = { t0: now, x: _rx, y: _ry };
                } else if (_cspErr > 400) {
                    // Snap only for truly catastrophic divergence (>3s lag spike / respawn).
                    predX = _rx; predY = _ry;
                } else {
                    // Proportional blend: tiny errors use alpha ~0.3; larger errors up to 0.8.
                    // Capped at 40px/tick so a 200px error takes ~5 ticks to correct invisibly.
                    const _alpha = Math.min(1.0, 0.3 + _cspErr * 0.01);
                    const _maxMove = 40;
                    const _moveX = (_rx - predX) * _alpha;
                    const _moveY = (_ry - predY) * _alpha;
                    const _moveDist = Math.hypot(_moveX, _moveY);
                    if (_moveDist > _maxMove) {
                        const _s = _maxMove / _moveDist;
                        predX += _moveX * _s;
                        predY += _moveY * _s;
                    } else {
                        predX += _moveX;
                        predY += _moveY;
                    }
                }
            }

            const newKills = me.kills || 0;
            // _myLastKills == -1 inseamna primul pachet dupa reset; nu notifica (ar putea fi stale)
            if (_myLastKills >= 0 && newKills > _myLastKills && !gameControl.countdownActive) showKillNotif(newKills);
            if (myKillsEl.textContent !== String(newKills)) myKillsEl.textContent = newKills;
            _myLastKills = newKills;
        }

        // DOM HUD throttled la 10Hz (nu la 30Hz) — reduce reflow-urile DOM
        if (now - _lastDomHudUpdate >= 100) {
            _lastDomHudUpdate = now;
            let _aliveCount = 0;
            for (const pid in entry.players) { if (entry.players[pid].alive) _aliveCount++; }
            if (_playersAliveEl && _playersAliveEl.textContent !== String(_aliveCount)) _playersAliveEl.textContent = _aliveCount;
        }

        for (const pid in entry.players) {
            const p = entry.players[pid];
            if (prevHp[pid] !== undefined && prevHp[pid] - p.hp > 1) {
                hitEffects.push({ x: p.x, y: p.y, life: 2.0 });
                flashTimers[pid] = performance.now();
                // (own bullets that hit are removed by _reconcileOwnBullets: the server drops them)
            }
            prevHp[pid]    = p.hp;
            latestHp[pid]  = p.hp;
        }

    });

    socket.on('kill-event', ({ killerName, victimName, byZone, victimId }) => {
        if (victimId && victimId !== socket.id) _hiddenPlayers.add(victimId);
        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        entry.textContent = byZone
            ? `${victimName} was eliminated by the zone`
            : `${killerName} eliminated ${victimName}`;
        killFeedEl.appendChild(entry);
        setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry); }, 4000);
        while (killFeedEl.children.length > 5) killFeedEl.removeChild(killFeedEl.firstChild);
    });

    // ---------- SPECTATOR ----------
    function exitSpectating() {
        isSpectating     = false;
        spectateTargetId = null;
        document.getElementById('spectator-hud').style.display = 'none';
    }

    window._startSpectating = function () {
        const state = getInterpolatedState();
        if (!state) return;
        let firstId = null;
        for (const id in state.players) {
            const p = state.players[id];
            if (p.alive && id !== socket.id) { firstId = id; break; }
        }
        if (!firstId) return;
        spectateTargetId = firstId;
        isSpectating = true;
        document.getElementById('screen-gameover').style.display = 'none';
        document.getElementById('spectator-hud').style.display   = 'flex';
    };

    window._specCycle = function (dir) {
        const state = getInterpolatedState();
        if (!state) return;
        const alive = [];
        for (const id in state.players) {
            const p = state.players[id];
            if (p.alive && id !== socket.id) alive.push(p);
        }
        if (alive.length === 0) return;
        const idx = alive.findIndex(p => p.id === spectateTargetId);
        spectateTargetId = alive[((idx < 0 ? 0 : idx) + dir + alive.length) % alive.length].id;
    };

    socket.on('game-ended', () => {
        // Ascunde butonul spectate indiferent de situatie
        const specBtn = document.getElementById('btn-spectate');
        if (specBtn) specBtn.style.display = 'none';

        if (!isSpectating) return;
        exitSpectating();
        setTimeout(() => {
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 800);
    });

    socket.on('eliminated', ({ placement, totalPlayers, killedBy, kills } = {}) => {
        // In PvE jucatorul poate fi respawnat la wave urmatoare, deci nu setam gameEnded
        if (_gameMode !== 'pve') gameEnded = true;
        _selfDead  = true;
        moveDir.x = 0; moveDir.y = 0; isShooting = false; aimStartTime = null;
        myElimData = { placement, totalPlayers, killedBy, kills };
        setTimeout(() => {
            if (_gameMode === 'pve') {
                document.getElementById('gameover-title').textContent = 'ELIMINATED!';
                document.getElementById('gameover-msg').textContent   = 'You will respawn at the start of the next wave.';
                document.getElementById('round-stats-section').style.display = 'none';
                const specBtn = document.getElementById('btn-spectate');
                if (specBtn) specBtn.style.display = 'none';
            } else {
                document.getElementById('gameover-title').textContent =
                    `PLACE ${placement} OF ${totalPlayers}`;
                document.getElementById('gameover-msg').textContent = killedBy === 'zombie'
                    ? 'Eliminated by a zombie'
                    : killedBy
                        ? `Eliminated by ${killedBy}`
                        : 'Eliminated by the zone';
                document.getElementById('stat-round-kills').textContent = kills || 0;
                document.getElementById('round-stats-section').style.display = 'block';
                const specBtn = document.getElementById('btn-spectate');
                if (specBtn) specBtn.style.display = placement > 2 ? 'block' : 'none';
            }
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 2000);
    });

    socket.on('winner', ({ kills } = {}) => {
        gameEnded = true;
        moveDir.x = 0; moveDir.y = 0; isShooting = false; aimStartTime = null;
        setTimeout(() => {
            document.getElementById('gameover-title').textContent = '1ST PLACE — YOU WON!';
            document.getElementById('gameover-msg').textContent   = 'You are the last player standing!';
            document.getElementById('stat-round-kills').textContent = kills || 0;
            document.getElementById('round-stats-section').style.display = 'block';
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 2000);
    });

    socket.on('round-stats', (data) => {
        if (!data || !currentProfile) return;
        currentProfile.kills_total  = data.killsTotal  || 0;
        currentProfile.wins_total   = data.winsTotal   || 0;
        currentProfile.games_played = data.gamesPlayed || 0;
        currentProfile.xp           = data.xp          || 0;
        currentProfile.coins        = data.coins        ?? 1000;
        currentProfile.diamonds     = data.diamonds     || 0;
        if (data.missions) currentProfile.missions = data.missions;
        // totals per weapon after this match (server.js WEAPON STATS); no UI yet, see ?dev=weapons
        if (data.weaponStats) currentProfile.weapon_stats = data.weaponStats;
    });

    // A weapon skin unlocked with kills (server.js WEAPON SKINS): a notice in the lobby leads to the Arsenal
    socket.on('weapon-skin-unlocked', (data) => {
        if (!data || !Array.isArray(data.skins) || !currentProfile) return;
        if (Array.isArray(data.owned)) currentProfile.owned_weapon_skins = data.owned;
        queueWeaponSkinNotice(data.skins);
    });

    // ---------- RESET PENTRU REMATCH ----------
    function resetForNewGame() {
        _spriteBurst = true;
        gameEnded  = false;
        _selfDead  = false;
        _hiddenPlayers.clear();
        _playerWeapons.clear();
        _playerWeaponSkins.clear();
        if (gameControl.pendingMeta) {
            _noteSlots(gameControl.pendingMeta);
            for (const [id, m] of Object.entries(gameControl.pendingMeta)) { if (m.weapon) _playerWeapons.set(id, m.weapon); if (m.weaponSkin) _playerWeaponSkins.set(id, m.weaponSkin); }
        }
        predX      = null; predY = null;
        isShooting = false;
        aimStartTime = null;
        moveDir.x  = 0; moveDir.y  = 0;
        shootDir.x = 0; shootDir.y = 0;
        myAngle = 0; moveAngle = 0; lastTime = 0;
        stateBuffer.length = 0;
        _resetSnapshotClock();
        _inputSeq = 0; _lastInputSend = 0;
        _pendingInputs.length = 0;
        _clientBullets.length = 0;
        _clientNextShotAt = 0; _ammoHoldUntil = 0;
        _pendingBurstShots.length = 0;
        _ownLinked.clear(); _ownUnmatched.clear(); _srvBulletSeen.clear();

        _dbgPktSent = 0; _dbgPktPs = 0; _dbgPktSentWindow = 0;
        _lastJoyMoveX = 0; _lastJoyMoveY = 0; _lastJoyAngle = null;
        for (const k in prevHp) delete prevHp[k];
        _myLastKills = -1;
        hitEffects.length = 0;
        damageNumbers.length = 0;
        for (const k in flashTimers) delete flashTimers[k];
        ammoState.ammo = 10;
        ammoState.max = 10;
        ammoState.reloading = false;
        ammoState.reloadProgress = 1;
        killFeedEl.innerHTML = '';
        myKillsEl.textContent = '0';
        document.getElementById('kill-notif').classList.remove('active');
        keysHeld.clear();
        document.getElementById('round-stats-section').style.display = 'none';
        document.getElementById('gameover-title').textContent = 'ELIMINATED!';
        document.getElementById('gameover-msg').textContent   = 'You were eliminated';
        const specBtn = document.getElementById('btn-spectate');
        if (specBtn) specBtn.style.display = 'none';
        exitSpectating();
        myElimData = null;
        _ammoBarCache.key = '';
        if (gameControl.pendingObstacles) { _obstacles = gameControl.pendingObstacles; delete gameControl.pendingObstacles; }
        if (gameControl.pendingSeason) { ARArena.setMapSeason(gameControl.pendingSeason); ARGround.setTheme(gameControl.pendingSeason); delete gameControl.pendingSeason; }
        _zone = { cx: ARENA_W / 2, cy: ARENA_H / 2, r: 1650, waitTimer: 30 };
        _zoneTimerAlpha = 0;
        _zombies.length = 0;
        _zombieDeathFx.length = 0;
        const _pp = document.getElementById('pve-upgrade-panel');
        _pp.style.transition = ''; _pp.style.opacity = '1'; _pp.style.display = 'none';
        document.getElementById('pve-top-hud').style.display = 'none';
        _pveState.baseHp = 1000; _pveState.wave = 0; _pveState.waveBreak = false; _pveState.myCoins = 0;
        Object.keys(_pveUpgCounts).forEach(k => _pveUpgCounts[k] = 0);
        const skipBtn = document.getElementById('pve-skip-btn');
        if (skipBtn) { skipBtn.disabled = false; skipBtn.textContent = 'SKIP'; }
        _playerDeathFx.length = 0;
        for (const k in _prevPlayerAlive) delete _prevPlayerAlive[k];
        _healthKits.clear();
        _kitPickupFx.length = 0;
        _kitDropAnim.clear();
        _coinFloats.length = 0;
        _coinDrops.clear(); _coinFx.length = 0;
        for (const k in _obsShake) delete _obsShake[k];
        gameControl.countdownEndTime = null;
        _footsteps.length = 0;
        for (const k in _footTimers) delete _footTimers[k];
        for (const k in _footSide)   delete _footSide[k];
        for (const k in _prevPlayerPos) delete _prevPlayerPos[k];
        _srvBulletSeen.clear();
    }
    gameControl.reset = resetForNewGame;

    socket.on('rematch-vote', ({ count, total }) => {
        const btn = document.getElementById('btn-rematch');
        btn.textContent = `JOACA DIN NOU (${count}/${total})`;
    });

    // ---- PvE events ----
    // Called for every packet (60/s): unchanged values are not written again. Rewriting the same
    // text still replaces the text node, invalidates style and wakes the observers in ui-fx.js.
    const _pveHudEls  = {};
    function _setHudText(id, v) {
        const el = _pveHudEls[id] || (_pveHudEls[id] = document.getElementById(id));
        if (!el) return;
        const s = String(v);
        if (el.textContent !== s) el.textContent = s; // compared with the DOM: other code writes these too
    }
    function updatePveHud() {
        if (_gameMode !== 'pve') return;
        _setHudText('pve-wave-num', _pveState.wave);
        _setHudText('pve-coins-num', _pveState.myCoins);
        const ratio = _pveState.baseMaxHp > 0 ? Math.max(0, _pveState.baseHp / _pveState.baseMaxHp) : 0;
        const w = (ratio * 100).toFixed(1) + '%';
        const bar = _pveHudEls.bar || (_pveHudEls.bar = document.getElementById('pve-base-bar-inner'));
        if (bar && bar.__w !== w) { bar.style.width = w; bar.__w = w; } // only written here
        _setHudText('pve-base-hp-text', _pveState.baseHp);
        _setHudText('pve-upgrade-coins', _pveState.myCoins);
    }

    const _PVE_UPG_CLIENT = {
        dmg:  { baseCost: 6,  costInc: 4, maxUses: 5 },
        spd:  { baseCost: 5,  costInc: 3, maxUses: 4 },
        hp:   { baseCost: 7,  costInc: 4, maxUses: 5 },
        ammo: { baseCost: 4,  costInc: 2, maxUses: 4 },
    };
    const _pveUpgCounts = { dmg: 0, spd: 0, hp: 0, ammo: 0 };

    function _pveUpgCost(type, count) {
        const d = _PVE_UPG_CLIENT[type];
        return d ? d.baseCost + count * d.costInc : 999;
    }

    function updateUpgradeButtons() {
        Object.keys(_PVE_UPG_CLIENT).forEach(type => {
            const btn = document.querySelector(`.pve-upg-btn[data-type="${type}"]`);
            if (!btn) return;
            const d = _PVE_UPG_CLIENT[type];
            const count = _pveUpgCounts[type] || 0;
            const maxed = count >= d.maxUses;
            const cost  = maxed ? null : _pveUpgCost(type, count);
            btn.querySelector('.pve-upg-cost').textContent = maxed ? 'MAX' : String(cost);
            btn.disabled = maxed;
            btn.classList.toggle('pve-upg-maxed', maxed);
            // Segmente progres
            const segsEl = btn.querySelector('.pve-upg-segs');
            if (segsEl) {
                segsEl.innerHTML = '';
                for (let i = 0; i < d.maxUses; i++) {
                    const seg = document.createElement('span');
                    seg.className = 'pve-upg-seg' + (i < count ? ' active' : '');
                    segsEl.appendChild(seg);
                }
            }
        });
    }

    window.buyUpgrade = function(type) { socket.emit('buy-upgrade', { type }); };

    function showPvePanel() {
        const panel = document.getElementById('pve-upgrade-panel');
        panel.style.transition = 'none';
        panel.style.opacity    = '0';
        panel.style.display    = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            panel.style.transition = 'opacity 0.4s ease';
            panel.style.opacity    = '1';
        }));
    }
    function hidePvePanel(cb) {
        const panel = document.getElementById('pve-upgrade-panel');
        if (panel.style.display === 'none') { if (cb) cb(); return; }
        panel.style.transition = 'opacity 0.35s ease';
        panel.style.opacity    = '0';
        setTimeout(() => {
            panel.style.display    = 'none';
            panel.style.opacity    = '1';
            panel.style.transition = '';
            if (cb) cb();
        }, 360);
    }
    window.skipWaveBreak = function() {
        socket.emit('pve-skip');
        const btn = document.getElementById('pve-skip-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Vote recorded'; }
    };

    socket.on('pve-coins', ({ coins, earned, x, y }) => {
        _pveState.myCoins = coins;
        updatePveHud();
        if (earned && x !== undefined && y !== undefined) {
            // coins picked up one after another over a pile add up in one popup
            const _now = performance.now(), _last = _coinFloats[_coinFloats.length - 1];
            if (_last && _now - _last.startTime < 400) { _last.amount += earned; _last.x = x; _last.y = y - 20; }
            else _coinFloats.push({ x, y: y - 20, amount: earned, startTime: _now });
        }
    });
    // PvE coins lie on the ground until somebody touches them (server: pve-coins.js; these two events are not part of gs2).
    // coin-drops: a zombie died at (ox, oy) and these landed around it. coin-taken: gone (gone: true = they timed out).
    socket.on('coin-drops', ({ ox, oy, c }) => {
        const _now = performance.now();
        for (let i = 0; i < c.length; i++) _coinDrops.set(c[i][0], { x: c[i][1], y: c[i][2], ox, oy, t0: _now });
    });
    socket.on('coin-taken', ({ ids, gone }) => {
        const _now = performance.now();
        for (let i = 0; i < ids.length; i++) {
            const d = _coinDrops.get(ids[i]);
            if (!d) continue;
            if (!gone) _coinFx.push({ x: d.x, y: d.y, t0: _now });
            _coinDrops.delete(ids[i]);
        }
    });

    socket.on('upgrade-result', ({ ok, type, coins, upgCounts, reason, newMaxHp }) => {
        if (!ok) { if (reason === 'max') showToast('Maximum upgrade level reached!'); return; }
        _pveState.myCoins = coins;
        if (upgCounts) Object.assign(_pveUpgCounts, upgCounts);
        if (newMaxHp && playerMeta[socket.id]) playerMeta[socket.id].maxHp = newMaxHp;
        updatePveHud();
        updateUpgradeButtons();
        const labels = { dmg: 'Damage +5%', spd: 'Speed +4%', hp: 'Max HP +15', ammo: 'Ammo +12%' };
        showToast(labels[type] || 'Upgrade applied!');
    });

    socket.on('pve-wave-start', ({ wave, total, batches }) => {
        if (_BB.on) ARBlackBox.event('wave-start', wave);   // the server puts everyone back by the base here: a jump, by design
        _waveStartAt = performance.now();
        _pveState.waveBreak = false;
        _pveState.wave = wave;
        hidePvePanel();
        document.getElementById('pve-wave-num').textContent = wave;
        // Respawn local daca jucatorul era mort
        if (_selfDead) {
            _selfDead = false;
            document.getElementById('screen-gameover').style.display = 'none';
            document.getElementById('screen-game').style.display     = 'block';
        }
        // Reset shooting state complet pentru a preveni auto-shooting
        isShooting = false; aimStartTime = null;
        _shootMustRelease = false; _clientHasReleased = true;
        _clientNextShotAt = 0; _ammoHoldUntil = 0; _pendingBurstShots.length = 0;
        moveDir.x = 0; moveDir.y = 0;
        _pendingInputs.length = 0;
        showToast(`WAVE ${wave} / ${total}`);
    });

    socket.on('pve-subwave', ({ remaining }) => {
        if (_BB.on) ARBlackBox.event('pve-subwave', remaining);
        showToast(remaining > 0 ? 'Reinforcements!' : '');
    });

    socket.on('pve-skip-status', ({ votes, total }) => {
        const btn = document.getElementById('pve-skip-btn');
        if (btn) btn.textContent = votes >= total ? 'SKIP' : `SKIP (${votes}/${total})`;
    });

    socket.on('pve-wave-break', ({ wave, nextWave, timer }) => {
        if (_BB.on) ARBlackBox.event('pve-wave-break', wave);
        _pveState.waveBreak = true;
        _pveState.breakTimer = timer;
        _pveState.breakTimerMax = timer;
        isShooting = false; moveDir.x = 0; moveDir.y = 0;
        _pendingInputs.length = 0;
        keysHeld.clear();
        // Delay 1s inainte de a arata panoul (ca sa se vada coin-urile de la ultimul zombi)
        const _panelDelay = 1000;
        const _effectiveTimer = timer - _panelDelay / 1000;
        setTimeout(() => {
            if (!_pveState.waveBreak) return; // wave a inceput deja (skip rapid)
            if (_BB.on) ARBlackBox.event('pve-panel', wave);
            document.getElementById('pve-upgrade-wave-info').innerHTML = `Wave ${wave}${ico('arrow-right')}${nextWave}`;
            document.getElementById('pve-upgrade-coins').textContent = _pveState.myCoins;
            const skipBtn = document.getElementById('pve-skip-btn');
            if (skipBtn) { skipBtn.disabled = false; skipBtn.textContent = 'SKIP'; }
            updateUpgradeButtons();
            showPvePanel();
            // Animare timer bar porneaza de la starea curenta a timerului
            const timerBar = document.getElementById('pve-upg-timer-bar');
            if (timerBar) {
                // slides out of its track (transform: compositor only); animating width re-laid out and
                // repainted the panel every frame for the whole break
                timerBar.style.transition = 'none'; timerBar.style.transform = 'translateX(0)';
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    timerBar.style.transition = `transform ${_effectiveTimer}s linear`;
                    timerBar.style.transform = 'translateX(-100%)';
                }));
            }
        }, _panelDelay);
    });

    socket.on('pve-end', ({ result, wavesCleared }) => {
        gameEnded = true;
        moveDir.x = 0; moveDir.y = 0; isShooting = false;
        hidePvePanel();
        setTimeout(() => {
            if (result === 'victory') {
                document.getElementById('gameover-title').textContent = 'VICTORY!';
                document.getElementById('gameover-msg').textContent   = `You survived all ${wavesCleared} waves!`;
            } else {
                document.getElementById('gameover-title').textContent = 'DEFEAT!';
                document.getElementById('gameover-msg').textContent   = `The base fell after ${wavesCleared} wave${wavesCleared === 1 ? '' : 's'}.`;
            }
            document.getElementById('round-stats-section').style.display = 'none';
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 1500);
    });

    socket.on('game-rematch', ({ isHost, playersMeta }) => {
        resetForNewGame();
        if (playersMeta) {
            Object.assign(playerMeta, playersMeta);
            _noteSlots(playersMeta);
            for (const [id, m] of Object.entries(playersMeta)) { if (m.weapon) _playerWeapons.set(id, m.weapon); if (m.weaponSkin) _playerWeaponSkins.set(id, m.weaponSkin); }
        }
        const btn = document.getElementById('btn-rematch');
        btn.disabled    = false;
        btn.textContent = 'PLAY AGAIN';
        document.getElementById('screen-gameover').style.display = 'none';
        document.getElementById('screen-game').style.display     = 'none';
        document.getElementById('screen-waiting').style.display  = 'flex';
        document.getElementById('btn-start-game').style.display  = isHost ? 'block' : 'none';
        document.getElementById('waiting-sub-msg').style.display = isHost ? 'none'  : 'block';
    });

    // Ammo: one ink frame, the rounds as small gold blocks inside it (the gaps show the ink)
    function drawAmmoBar(ctx, x, y, width, height, state) {
        const maxAmmo = Math.max(1, state.max || 10);
        const ol = 1.8, gap = 1.6;
        ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.roundRect(x - ol, y - ol + 2.5, width + ol * 2, height + ol * 2, 3); ctx.fill();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - ol, y - ol, width + ol * 2, height + ol * 2, 3); ctx.fill();
        const segW = (width - gap * (maxAmmo - 1)) / maxAmmo;
        ctx.fillStyle = '#1B252C';
        for (let i = 0; i < maxAmmo; i++) ctx.fillRect(x + i * (segW + gap), y, segW, height);
        ctx.fillStyle = TOY.gold[1];
        const full = Math.min(state.ammo, maxAmmo);
        for (let i = 0; i < full; i++) ctx.fillRect(x + i * (segW + gap), y, segW, height);
        ctx.fillStyle = TOY.gold[0];
        for (let i = 0; i < full; i++) ctx.fillRect(x + i * (segW + gap), y, segW, height * 0.62);
        if (state.ammo < maxAmmo && state.reloadProgress > 0) {
            const sx = x + state.ammo * (segW + gap);
            ctx.fillStyle = '#FFE08A'; ctx.fillRect(sx, y, segW * state.reloadProgress, height);
        }
    }

    // ---------- INTERPOLARE STATE ----------
    const _loc = { a: 0, b: 0, t: 0, extrap: false }, _bb = { base: 0, age: 0 };
    const ZOMBIE_SNAP = 120;   // a zombie that moved further than this between two snapshots is not blended
    function getInterpolatedState() {
        if (stateBuffer.length === 0) return null;

        // On the server's timeline (entry.st), see _noteSnapshotClock
        if (_clockLag === null) return null;
        const renderTime = performance.now() - _clockLag;

        // The two snapshots that bracket renderTime (interp.js)
        const loc = ARInterp.locate(stateBuffer, renderTime, EXTRAP_MS, _loc);
        const sOld = stateBuffer[loc.a], sNew = stateBuffer[loc.b];
        const t = loc.t;
        const extrapolating = t > 1;
        const nowMs = performance.now();

        _ISActiveIds.clear();
        for (const id in sOld.players) {
            _ISActiveIds.add(id);
            const op = sOld.players[id];
            const np = sNew.players[id];

            // One persistent object per player — never reallocated, avoids GC
            if (!_IS.players[id]) _IS.players[id] = {};
            const out = _IS.players[id];

            out.id    = id;
            out.name  = op.name;
            out.maxHp = op.maxHp;
            out.hp    = op.hp;
            // Use the newer alive/kills so death and kills reflect immediately
            out.alive = np ? np.alive : op.alive;
            out.kills = np ? np.kills : op.kills;

            let tx, ty;
            if (np && t > 0) {
                tx = op.x + (np.x - op.x) * t;
                ty = op.y + (np.y - op.y) * t;
                // Shortest-path angle lerp — handles the 0/2π wraparound (no extrapolation for the angle)
                let da = np.angle - op.angle;
                if (da >  Math.PI) da -= Math.PI * 2;
                if (da < -Math.PI) da += Math.PI * 2;
                out.angle = op.angle + da * Math.min(1, t);
            } else {
                tx = op.x; ty = op.y;
                out.angle = op.angle;
            }
            // After an extrapolation the real data can differ a little from the guess: spread that
            // correction over ~CORRECT_MS instead of jumping (a big gap, e.g. a respawn, still snaps).
            if (out.extrap && !extrapolating && out.x !== undefined) {
                out.ex = out.x - tx; out.ey = out.y - ty;
                if (out.ex * out.ex + out.ey * out.ey > 80 * 80) { out.ex = 0; out.ey = 0; }
            }
            if (out.ex || out.ey) {
                const k = Math.exp(-Math.max(0, nowMs - (out.tDraw || nowMs)) / CORRECT_MS);
                out.ex *= k; out.ey *= k;
                if (Math.abs(out.ex) < 0.05 && Math.abs(out.ey) < 0.05) { out.ex = 0; out.ey = 0; }
            }
            out.x = tx + (out.ex || 0);
            out.y = ty + (out.ey || 0);
            out.extrap = extrapolating;
            out.tDraw  = nowMs;
        }
        for (const id in _IS.players) {
            if (!_ISActiveIds.has(id)) delete _IS.players[id];
        }

        // Zombies: blended between the same two snapshots as the players (they used to jump to each packet's place)
        ARInterp.zombies(sOld.z, sNew.z, t, _zombies, ZOMBIE_SNAP, ARNet.PQ);

        // Enemy bullets: straight lines, drawn from the snapshot at or before render time plus the exact time since it
        ARInterp.bulletBase(stateBuffer, loc, renderTime, EXTRAP_MS, _bb);
        _IS.bullets = stateBuffer[_bb.base].bullets;
        _IS.bulletAge = _bb.age;
        return _IS;
    }

    // Array pre-alocat pentru randare gloante — refolosit fiecare frame, fara new [] la 60fps
    const _allRenderBullets = [];

    // ── Sparkline helper — draws a labelled mini-graph from a ring-buffer ────────
    function _drawSparkline(ctx, arr, head, n, x, y, w, h, maxVal, color, label, curStr) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ffffff18';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, w, h);
        if (maxVal <= 0) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const step = w / Math.max(n - 1, 1);
        for (let i = 0; i < n; i++) {
            const val = arr[(head - n + i + n * 2) % n];
            const px  = x + i * step;
            const py  = y + h - Math.min(val / maxVal, 1) * (h - 3) - 1;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = color;
        ctx.fillText(`${label}:${curStr}`, x + 2, y + 1);
    }

    // Zombie looks per type (normal, runner, tank). r is the hitbox radius of the server (PVE_ZOMBIE_DEFS; BR zombies
    // are all the first type): the new art is scaled to it (ARArena.drawZombieSprite), so the body you see is what
    // a bullet hits. The colours are for the old vector drawing, used only until the pictures are in.
    const _ZB_DEFS = [
        { r: 20, maxHp: 100, bodyColor: '#5E9253', innerColor: '#7DB26A', armColor: '#4A7A42', armStroke: '#25422A', ringColor: '#FF4155', ringFill: 'rgba(255,65,85,0.10)' },
        { r: 16, maxHp: 50,  bodyColor: '#C27A33', innerColor: '#E39A4D', armColor: '#9D5F26', armStroke: '#4C2D10', ringColor: '#FF6A1A', ringFill: 'rgba(255,106,26,0.12)' },
        { r: 28, maxHp: 400, bodyColor: '#4F6A99', innerColor: '#6F8CBD', armColor: '#3E557D', armStroke: '#1D2B45', ringColor: '#52B6F0', ringFill: 'rgba(82,182,240,0.10)' },
    ];
    const FOOT_STEPS     = 10;
    const DN_MS          = 820; // damage popup life // footprint fade steps (2.5 s / 10 = one step every 250 ms)
    const _zVisibleList  = [];
    const _zHurt         = [];
    // players drawn this frame (figure first, tags after the tree crowns) and the bodies a crown can be over
    const _plQ = [], _plQx = [], _plQy = [];
    const _crX = [], _crY = [], _crR = [];
    let _spriteBurst     = true;
    let _warmLeft        = 1;       // sprites still to be made ahead of their first use (ARArena.warm); 0 when done

    // ---------- BUCLA DE RANDARE ----------
    let lastTime  = 0;
    // A display of 200 Hz or more is drawn at about 120 frames a second, the rest skipped (frame-cap.js); ?fps=off draws every one
    const _fcGate = (window.ARFrameCap && !/[?&]fps=off\b/.test(location.search)) ? ARFrameCap.createGate() : null;
    function draw(timestamp) {
        rafId = requestAnimationFrame(draw);
        if (_fcGate && !_fcGate.frame(timestamp)) return;
        const _drawStart = performance.now();

        _rsTick(timestamp, canvas);
        const dpr  = _rsDpr();
        const W    = canvas.width  / dpr;
        const H    = canvas.height / dpr;
        let ZOOM = Math.min(W / VIEW_W, H / VIEW_H); // recalculat dupa dtSec

        const rState = getInterpolatedState();
        if (!rState) { ctx.clearRect(0, 0, canvas.width, canvas.height); lastTime = timestamp; return; }

        const dtSec = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
        lastTime = timestamp;

        // Zoom out per arma (weapons.json cameraZoom: sniper vede mai mult din mapa), tranzitie lina
        const _targetZoom = (_WEAPON_DATA[selectedWeapon] || _WEAPON_DATA[DEFAULT_WEAPON]).cameraZoom;
        _zoomFactor += (_targetZoom - _zoomFactor) * Math.min(1, dtSec * 4);
        ZOOM = Math.min(W / (VIEW_W * _zoomFactor), H / (VIEW_H * _zoomFactor));
        // Device pixels per world unit as a multiple of 1/256 (a change of at most 0.2%): a 256-unit ground tile is then a whole
        // number of pixels and the ground and the zone blit 1:1 instead of being filtered (see ground-layer.js).
        const _sq = Math.max(1 / 256, Math.round(dpr * ZOOM * 256) / 256);
        ZOOM = _sq / dpr;

        // ── Local position prediction (runs every rAF frame) ─────────────────
        // Same rules as the server tick: move, clamp to the arena, slide out of obstacles (and the
        // PvE base). Without the slide the client walked into trees and was pulled back by every
        // server packet (rubber-banding along cover).
        if (predX !== null && !_selfDead) {
            predX = Math.max(20, Math.min(ARENA_W - 20, predX + moveDir.x * predSpeed * dtSec));
            predY = Math.max(20, Math.min(ARENA_H - 20, predY + moveDir.y * predSpeed * dtSec));
            const _ps = _pushOutOfSolids(predX, predY);
            predX = _ps.x; predY = _ps.y;
        }

        // ── Client bullet spawn — uses weapon-specific speed + lifetime ──
        const _shotNow = performance.now();
        if (isShooting && !_shootMustRelease && !_selfDead && !gameControl.countdownActive &&
            _shotNow >= _clientNextShotAt && ammoState.ammo > 0 && predX !== null &&
            aimStartTime !== null && _shotNow - aimStartTime >= _AIM_MS) {
            const _myWdSpawn = _WEAPON_DATA[selectedWeapon] || _WEAPON_DATA[DEFAULT_WEAPON];
            const _cbspd  = _myWdSpawn.bulletSpeed;
            const _fire   = _myGunFire();
            const _cblife = _fire.bulletLife;
            const _cbPellets = _myWdSpawn.pellets;
            const _cbSpread  = _myWdSpawn.spread;
            const _bcdx = -Math.sin(myAngle), _bcdy = Math.cos(myAngle);
            const _mx = predX + _bcdx * _fire.muzzleDist, _my = predY + _bcdy * _fire.muzzleDist;
            for (let _pi = 0; _pi < _cbPellets; _pi++) {
                const _ang = _cbPellets === 1 ? 0 : -_cbSpread / 2 + _pi * _cbSpread / (_cbPellets - 1);
                const _cos = Math.cos(_ang), _sin = Math.sin(_ang);
                const _pdx = _bcdx * _cos - _bcdy * _sin;
                const _pdy = _bcdx * _sin + _bcdy * _cos;
                _clientBullets.push(_newClientBullet(_mx, _my, _pdx * _cbspd, _pdy * _cbspd, _cblife, _shotNow, predX, predY));
            }
            const _burstCount = _myWdSpawn.fireMode === 'burst' ? _myWdSpawn.burstCount : 1;
            const _burstDelay = _myWdSpawn.burstDelay;
            // Holding the trigger: count from when the shot was due, not from this frame, or every
            // shot lands up to a frame later than the server's (the server cadence is exact).
            const _shotBase = (_shotNow - _clientNextShotAt < 2 * EMIT_MS) ? _clientNextShotAt : _shotNow;
            for (let _bi = 1; _bi < _burstCount; _bi++) {
                _pendingBurstShots.push({
                    spawnAt: _shotBase + _bi * _burstDelay * 1000,
                    odx: _bcdx, ody: _bcdy,
                    dx: _bcdx * _cbspd, dy: _bcdy * _cbspd, life: _cblife
                });
            }
            // The server allows the next trigger only after the whole burst AND the cooldown.
            // Using only the cooldown (0.6 s instead of 0.8 s for Burst) made the client fire bursts
            // the server never fired, and miss the ones it did: the "invisible bullets".
            _clientNextShotAt = _shotBase + (_myWdSpawn.shootCd + (_burstCount - 1) * _burstDelay) * 1000;
            // Spend the round locally right away; the server confirms it about one RTT later.
            ammoState.ammo = Math.max(0, ammoState.ammo - 1);
            _ammoHoldUntil = _shotNow + Math.max(160, _rttMs() + 100);
            if (ammoState.ammo === 0) { _shootMustRelease = true; _clientHasReleased = false; }
            if (_myWdSpawn.fireMode === 'semi') { _shootMustRelease = true; _clientHasReleased = false; isShooting = false; }
        }
        // Spawn pending burst bullets cu delay real
        const _cbNow = performance.now();
        while (_pendingBurstShots.length > 0 && _pendingBurstShots[0].spawnAt <= _cbNow) {
            const _pbs = _pendingBurstShots.shift();
            if (predX !== null && !_selfDead) {
                const _bm = _myGunFire().muzzleDist;
                _clientBullets.push(_newClientBullet(predX + _pbs.odx * _bm, predY + _pbs.ody * _bm, _pbs.dx, _pbs.dy, _pbs.life, _cbNow, predX, predY));
            }
        }

        // ── Own bullets: lifetime, server reconciliation, predicted impacts ──
        // Impacts are predicted with a swept test (obstacles, zombies, enemies as you see them) so a
        // bullet stops on contact instead of flying through while the server's answer is on its way.
        // A predicted impact only hides the bullet; if the server bullet is still alive 220 ms later
        // the prediction was wrong and the bullet reappears.
        const _phantomMs = Math.max(250, Math.min(900, _rttMs() + 200));
        const _predictEnemies = _gameMode !== 'pve';
        for (let _ci = _clientBullets.length - 1; _ci >= 0; _ci--) {
            const _cb = _clientBullets[_ci];
            const _age = (_cbNow - _cb.spawnTime) / 1000;
            if (_cb.dead || _age > _cb.life + 0.05) { _removeClientBullet(_ci); continue; }
            if (_cb.sid === null && _cbNow - _cb.spawnTime > _phantomMs) { _bDiag.phantoms++; if (_bDiag.phantomLog && _bDiag.phantomLog.length < 60) _bDiag.phantomLog.push([Math.round(_cb.spawnTime), ammoState.ammo, _ammoRow[0], _ammoRow[2] ? 1 : 0, isShooting ? 1 : 0, _shootMustRelease ? 1 : 0, aimStartTime === null ? -1 : Math.round(aimStartTime), _selfDead ? 1 : 0, _pveState.waveBreak ? 1 : 0].join(":")); _removeClientBullet(_ci); continue; }
            if (_cb.hiddenAt) {
                if (_cb.sid !== null && _cbNow - _cb.hiddenAt > 220) { _cb.hiddenAt = 0; _cb.noPredict = true; }
                continue;
            }
            const _a = Math.min(_age, _cb.life);
            const _x1 = _cb.x + _cb.dx * _a, _y1 = _cb.y + _cb.dy * _a;
            const _x0 = _cb.px, _y0 = _cb.py;
            _cb.px = _x1; _cb.py = _y1;
            if (_cb.noPredict) continue;
            const _bMinX = _x0 < _x1 ? _x0 : _x1, _bMaxX = _x0 < _x1 ? _x1 : _x0;
            const _bMinY = _y0 < _y1 ? _y0 : _y1, _bMaxY = _y0 < _y1 ? _y1 : _y0;
            let _hitT = 2, _hitObs = -1;
            for (let _oi = 0; _oi < _obstacles.length; _oi++) {
                const _o = _obstacles[_oi], _R = _o.r + 6;
                if (_o.x + _R < _bMinX || _o.x - _R > _bMaxX || _o.y + _R < _bMinY || _o.y - _R > _bMaxY) continue;
                const _t = _segCircleT(_x0, _y0, _x1, _y1, _o.x, _o.y, _R);
                if (_t >= 0 && _t < _hitT) { _hitT = _t; _hitObs = _oi; }
            }
            if (_gameMode === 'pve') {   // the base stops bullets too
                const _R = _PVE_BASE.r + 6;
                if (!(_PVE_BASE.x + _R < _bMinX || _PVE_BASE.x - _R > _bMaxX || _PVE_BASE.y + _R < _bMinY || _PVE_BASE.y - _R > _bMaxY)) {
                    const _t = _segCircleT(_x0, _y0, _x1, _y1, _PVE_BASE.x, _PVE_BASE.y, _R);
                    if (_t >= 0 && _t < _hitT) { _hitT = _t; _hitObs = -1; }
                }
            }
            for (let _zi = 0; _zi < _zombies.length; _zi++) {
                const _zb = _zombies[_zi];
                if (!_zb || _zb.hp < 0) continue;
                const _R = (_gameMode === 'pve' ? (_PVE_ZB_RADIUS[_zb.type || 0] || 20) : 20) + 6;
                const _zbx = _zb.sx, _zby = _zb.sy;   // the server's latest place, as the prediction always used
                if (_zbx + _R < _bMinX || _zbx - _R > _bMaxX || _zby + _R < _bMinY || _zby - _R > _bMaxY) continue;
                const _t = _segCircleT(_x0, _y0, _x1, _y1, _zbx, _zby, _R);
                if (_t >= 0 && _t < _hitT) { _hitT = _t; _hitObs = -1; }
            }
            if (_predictEnemies) {
                const _R = PLAYER_HIT_R + 6;
                for (const _pid in rState.players) {
                    if (_pid === socket.id) continue;
                    const _pp = rState.players[_pid];
                    if (!_pp.alive || _hiddenPlayers.has(_pid)) continue;
                    if (_pp.x + _R < _bMinX || _pp.x - _R > _bMaxX || _pp.y + _R < _bMinY || _pp.y - _R > _bMaxY) continue;
                    const _t = _segCircleT(_x0, _y0, _x1, _y1, _pp.x, _pp.y, _R);
                    if (_t >= 0 && _t < _hitT) { _hitT = _t; _hitObs = -1; }
                }
            }
            if (_hitT <= 1) {
                _cb.hiddenAt = _cbNow;
                if (_hitObs >= 0) _obsShake[_hitObs] = _cbNow;
            }
        }

        // Inputs go out on their own clock (_inputClock), not from here
        const _nowI = performance.now();

        // ── Packets/sec counter ───────────────────────────────────────────────
        if (_nowI - _dbgPktSentWindow >= 1000) {
            _dbgPktPs = _dbgPktSent; _dbgPktSent = 0; _dbgPktSentWindow = _nowI;
        }

        const me = rState.players[socket.id];
        if (_bDiag.track && _bDiag.track.length < 4000) { for (const _tp in rState.players) { if (_tp !== socket.id) { _bDiag.track.push([performance.now(), rState.players[_tp].x, rState.players[_tp].y]); break; } } }

        // Spectator: auto-switch daca tinta a murit, urmareste tinta vie
        if (isSpectating) {
            if (!spectateTargetId || !rState.players[spectateTargetId] || !rState.players[spectateTargetId].alive) {
                spectateTargetId = null;
                for (const pid in rState.players) {
                    if (rState.players[pid].alive && pid !== socket.id) { spectateTargetId = pid; break; }
                }
            }
            const sp = spectateTargetId ? rState.players[spectateTargetId] : null;
            // text only when it changed: assigning textContent every frame forces a text-node rewrite
            const _spN = sp ? sp.name : '—';
            const _spH = sp ? `${Math.ceil(Math.max(0, sp.hp))} / ${sp.maxHp} HP` : '';
            if (_specNameEl && _specNameEl._v !== _spN) _specNameEl.textContent = _specNameEl._v = _spN;
            if (_specHpEl && _specHpEl._v !== _spH)     _specHpEl.textContent   = _specHpEl._v   = _spH;
        }

        const specTarget = isSpectating && spectateTargetId ? rState.players[spectateTargetId] : null;
        const camX = specTarget ? specTarget.x : (predX !== null ? predX : (me ? me.x : ARENA_W / 2));
        const camY = specTarget ? specTarget.y : (predY !== null ? predY : (me ? me.y : ARENA_H / 2));

        // The camera sits on whole device pixels: _ox/_oy are where world (0, 0) lands, so everything static blits at the same
        // sub-pixel phase, and the ground can blit 1:1. Moving things are still drawn at their exact (fractional) positions.
        const _ox = Math.round(canvas.width / 2 - camX * _sq), _oy = Math.round(canvas.height / 2 - camY * _sq);
        ctx.save();
        ctx.setTransform(_sq, 0, 0, _sq, _ox, _oy);

        // World transform, read once: sprites drawn with setTransform start from it (no save/restore)
        const _wm = ctx.getTransform();
        // First frame of a match: build every tree/rock bitmap now (normally 4 per frame). Before,
        // the props over budget were drawn as full vector paths on that first frame, which queued
        // a 100-200 ms GPU raster and made the countdown stutter.
        const _spriteBurst0 = _spriteBurst;
        if (_spriteBurst && _obstacles.length) { ARArena.allowBurst(_obstacles.length + 8); _spriteBurst = false; }
        const _gNow = performance.now();
        ARArena.beginFrame(dpr * ZOOM, _gNow);
        if (_warmLeft) _warmLeft = ARArena.warm(_ZB_DEFS, _gameMode === 'pve');   // zombie, base, coin, kit and shard sprites, a few a frame from the start
        ARGround.beginFrame(gameControl.countdownActive || _spriteBurst0);
        const _lblScale = dpr * ZOOM;

        const visLeft   = -_ox / _sq;
        const visTop    = -_oy / _sq;
        const visRight  = (canvas.width - _ox) / _sq;
        const visBottom = (canvas.height - _oy) / _sq;

        // --- FUNDAL + DECORATIUNI + MARCAJE --- (iarba, zone de culoare, marcaje, chenar: dale din cache, ground-layer.js)
        // The ground paints every pixel of the view (tiles, or vectors where a tile is not built, and the dark surround), so the
        // frame needs no clear before it: one full-canvas fill less (~0.2 ms/frame at 1280x720 in a software raster).
        if (!ARGround.paintsAll()) ctx.clearRect(visLeft, visTop, visRight - visLeft, visBottom - visTop);
        ARGround.draw(ctx, visLeft, visTop, visRight, visBottom, _lblScale, ARArena.isScaleStable(), _gNow, _ox, _oy);
        // (no flowers: the pitch stays clean)
        // Particule ambient (world-space, se misca independent de camera)
        {
            const _apT = performance.now() * 0.001;
            ctx.fillStyle = '#ffffff';
            for (const p of _ambParts) {
                p.y += p.vy * dtSec;
                p.x += p.vx * dtSec;
                if (p.y < -50 || p.x < -50 || p.x > ARENA_W + 50) {
                    p.x = Math.random() * ARENA_W;
                    p.y = ARENA_H + 20;
                }
                if (p.x < visLeft - 30 || p.x > visRight + 30 || p.y < visTop - 30 || p.y > visBottom + 30) continue;
                ctx.globalAlpha = p.baseAlpha * (0.5 + 0.5 * Math.sin(_apT * 1.1 + p.phase));
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.lineCap     = 'butt';

        // (marcajele sunt in dalele din ground-layer.js)

        // --- OBSTACOLE ---
        const _obsNow = performance.now();
        // (trees drawn from sprites wait for the crown pass, above the players; rocks stay here, under them)
        for (let _oi = 0; _oi < _obstacles.length; _oi++) {
            const obs = _obstacles[_oi];
            const _om = obs.r * 1.6 + 12; // the sprite and its shadow reach past the collision radius
            if (obs.x + _om < visLeft || obs.x - _om > visRight ||
                obs.y + _om < visTop  || obs.y - _om > visBottom) continue;
            ARArena.drawProp(ctx, obs, obs.x + _obsShakeX(_oi, _obsNow), obs.y); // cached bitmap
        }

        // --- ZONA --- (BR only)
        if (_gameMode !== 'pve') ARArena.drawZone(ctx, visLeft, visTop, visRight, visBottom, _zone, ZOOM, _ox, _oy, _lblScale);

        // --- INDICATOR TRAIECTORIE ---
        if ((_aimActive || isShooting || mouseActive) && me && me.alive && !gameEnded) {
            const dirX       = -Math.sin(myAngle);
            const dirY       =  Math.cos(myAngle);
            const _trajWd   = _WEAPON_DATA[selectedWeapon] || _WEAPON_DATA[DEFAULT_WEAPON];
            const TRAJ_START = ARShared.LEGACY_MUZZLE;
            const TRAJ_END   = ARShared.LEGACY_MUZZLE + _trajWd.bulletSpeed * _trajWd.bulletLife;
            ctx.save();
            ctx.lineWidth = 2.5 / ZOOM;
            if (_lineDashZoom !== ZOOM) { _lineDashZoom = ZOOM; _lineDashArr = [6 / ZOOM, 24 / ZOOM]; }
            ctx.setLineDash(_lineDashArr);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            if (_trajWd.pellets > 1) {
                const _tSpread = _trajWd.spread;
                const _cosL = Math.cos(-_tSpread / 2), _sinL = Math.sin(-_tSpread / 2);
                const _pdxL = dirX * _cosL - dirY * _sinL, _pdyL = dirX * _sinL + dirY * _cosL;
                const _cosR = Math.cos( _tSpread / 2), _sinR = Math.sin( _tSpread / 2);
                const _pdxR = dirX * _cosR - dirY * _sinR, _pdyR = dirX * _sinR + dirY * _cosR;
                // Linia stanga
                ctx.beginPath();
                ctx.moveTo(camX + _pdxL * TRAJ_START, camY + _pdyL * TRAJ_START);
                ctx.lineTo(camX + _pdxL * TRAJ_END,   camY + _pdyL * TRAJ_END);
                ctx.stroke();
                // Linia dreapta
                ctx.beginPath();
                ctx.moveTo(camX + _pdxR * TRAJ_START, camY + _pdyR * TRAJ_START);
                ctx.lineTo(camX + _pdxR * TRAJ_END,   camY + _pdyR * TRAJ_END);
                ctx.stroke();
                // Arc la capat
                ctx.beginPath();
                ctx.arc(camX, camY, TRAJ_END, Math.atan2(_pdyL, _pdxL), Math.atan2(_pdyR, _pdxR), false);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(camX + dirX * TRAJ_START, camY + dirY * TRAJ_START);
                ctx.lineTo(camX + dirX * TRAJ_END,   camY + dirY * TRAJ_END);
                ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.restore();
        }



        // --- GLOANTE ---
        // One transform per bullet: the trail is a sprite drawn once at startup (no gradient object
        // created per bullet per frame), then the projectile image on top of it.
        // Enemy bullets extrapolate forward from the latest snapshot; own bullets come from
        // _clientBullets (predicted + reconciled with the server, see _reconcileOwnBullets).
        const _bulletNow = performance.now();
        const _skinDt = Math.min(0.05, dtSec), _skinPollen = _skinFxOn();   // the mythic skins' pollen (SKIN EFFECTS)
        const _bulletAge = rState.bulletAge;   // seconds since the snapshot the bullets are read from, on the server timeline
        ctx.fillStyle = '#ffffff';
        for (const b of rState.bullets) {
            if (b.ownerId === socket.id) continue;
            const _bx = b.x + b.dx * _bulletAge;
            const _by = b.y + b.dy * _bulletAge;
            // Extrapolating up to 50 ms past the last packet must not carry a bullet through a tree
            // or a player it is about to hit (the server removes it on the next packet anyway)
            if (_bulletAge > 0 && _enemyBulletBlocked(b.x, b.y, _bx, _by, b.ownerId, rState)) continue;
            const _seen = _srvBulletSeen.get(b.id);
            // the shot's flash and the trail start when the bullet is first drawn (it is drawn a little behind the packet)
            if (_seen && !_seen.drawn) { _seen.drawn = true; _seen.t = _bulletNow; _shotKick(_fxFor(b.ownerId), _bulletNow); }
            const _bAge = _seen ? (_bulletNow - _seen.t) / 1000 : 0;
            const _trail = Math.min(_bAge * 480, 110);
            const _bw = _playerWeapons.get(b.ownerId) || DEFAULT_WEAPON;
            const _bs = _bulletSprite(_bw, _lblScale, _playerWeaponSkins.get(b.ownerId));
            _setRotated(ctx, _wm, _bx, _by, b.dx, b.dy);
            if (_trail > 4 && !(_bs && _bs.noTrail)) ctx.drawImage(_trailSpriteFor(_bw, _playerWeaponSkins.get(b.ownerId)), -_trail, -3, _trail, 6);
            if (_bs) ctx.drawImage(_bs.c, -_bs.box, -_bs.box, _bs.box * 2, _bs.box * 2);
            else { ctx.beginPath(); ctx.arc(0, 0, b.radius || 6, 0, Math.PI * 2); ctx.fill(); }
            if (_skinPollen) {
                const _eg = _gunLook(_bw, _playerWeaponSkins.get(b.ownerId));
                if (_eg && _eg.fx && _eg.fx.bullets && _eg.fx.bullets.trailPollen) ARSkinFx.emitBulletPollen(_skinPool, _skinEmitter(_skinEm, 'b' + b.ownerId), _eg.fx, _bx, _by, PLAYER_VISUAL_SCALE, _skinDt, Math.random);
            }
        }
        ctx.setTransform(_wm);
        // Own bullets — fade-out in the last 20% of their lifetime; hidden ones hit something
        const _myBs = _bulletSprite(selectedWeapon, _lblScale, _playerWeaponSkins.get(socket.id));
        const _myTrail = _trailSpriteFor(selectedWeapon, _playerWeaponSkins.get(socket.id));
        const _myGunFx = _skinPollen ? (_gunLook(selectedWeapon, _playerWeaponSkins.get(socket.id)) || {}).fx : null;
        for (const cb of _clientBullets) {
            if (cb.hiddenAt || cb.dead) continue;
            const _cAgeFull = (_bulletNow - cb.spawnTime) / 1000;
            const _cbLife   = cb.life;
            const _cAge     = Math.min(_cAgeFull, _cbLife);
            const _cbx      = cb.x + cb.dx * _cAge;
            const _cby      = cb.y + cb.dy * _cAge;
            const _fadeStart = _cbLife * 0.80;
            const _cAlpha   = _cAgeFull < _fadeStart ? 1.0 : Math.max(0, 1 - (_cAgeFull - _fadeStart) / (_cbLife - _fadeStart));
            if (_cAlpha <= 0) continue;
            const _trail = Math.min(_cAgeFull * 480, 110);
            ctx.globalAlpha = _cAlpha;
            _setRotated(ctx, _wm, _cbx, _cby, cb.dx, cb.dy);
            if (_trail > 4 && !(_myBs && _myBs.noTrail)) ctx.drawImage(_myTrail, -_trail, -3, _trail, 6);
            if (_myBs) ctx.drawImage(_myBs.c, -_myBs.box, -_myBs.box, _myBs.box * 2, _myBs.box * 2);
            else { ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); }
            if (_myGunFx && _myGunFx.bullets && _myGunFx.bullets.trailPollen) ARSkinFx.emitBulletPollen(_skinPool, _skinEmitter(_skinEm, 'b' + socket.id), _myGunFx, _cbx, _cby, PLAYER_VISUAL_SCALE, _skinDt, Math.random);
        }
        ctx.setTransform(_wm);
        ctx.globalAlpha = 1;

        // --- PASI ---
        // Grouped by fade step: FOOT_STEPS fills per frame instead of one per footprint (up to 80)
        const _fpNow = performance.now();
        while (_footsteps.length && _fpNow - _footsteps[0].t >= 2500) _footsteps.shift();
        if (_footsteps.length) {
            ctx.fillStyle = '#1a1008';
            for (let _step = 0; _step < FOOT_STEPS; _step++) {
                ctx.beginPath();
                let _any = false;
                for (let _fi = 0; _fi < _footsteps.length; _fi++) {
                    const _f = _footsteps[_fi];
                    const _fAge = (_fpNow - _f.t) / 2500;
                    if (_fAge >= 1 || Math.min(FOOT_STEPS - 1, (_fAge * FOOT_STEPS) | 0) !== _step) continue;
                    if (_f.x < visLeft - 5 || _f.x > visRight + 5 || _f.y < visTop - 5 || _f.y > visBottom + 5) continue;
                    ctx.moveTo(_f.x + 4, _f.y);
                    ctx.arc(_f.x, _f.y, 4, 0, Math.PI * 2);
                    _any = true;
                }
                if (!_any) continue;
                ctx.globalAlpha = (1 - (_step + 0.5) / FOOT_STEPS) * 0.22;
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // --- HEALTH KITS ---
        const _kitNow = performance.now();
        for (const [_kid, _kit] of _healthKits) {
            if (_kit.x + 35 < visLeft || _kit.x - 35 > visRight || _kit.y + 35 < visTop || _kit.y - 35 > visBottom) continue;
            // Animatie de drop la spawn
            let _kitYOff = 0;
            const _kdropStart = _kitDropAnim.get(_kid);
            if (_kdropStart !== undefined) {
                const _kdropAge = (_kitNow - _kdropStart) / 1000;
                if (_kdropAge < 0.45) {
                    _kitYOff = -28 * Math.pow(1 - _kdropAge / 0.45, 2);
                } else {
                    _kitDropAnim.delete(_kid);
                }
            }
            ARArena.drawKit(ctx, _kit.x, _kit.y, _kitYOff, _kitNow + _kid * 377, 1, 1);
        }

        // --- KIT PICKUP FX ---
        for (let _kfi = _kitPickupFx.length - 1; _kfi >= 0; _kfi--) {
            const _kf = _kitPickupFx[_kfi];
            const _kfAge = (performance.now() - _kf.startTime) / 1000;
            if (_kfAge > 0.7) { _kitPickupFx.splice(_kfi, 1); continue; }
            const _kfT = _kfAge / 0.7;
            // Kit se estompeaza si urca
            // the kit pops up and away, the heal amount rises in toy green
            ctx.globalAlpha = 1 - _kfT;
            ARArena.drawKit(ctx, _kf.x, _kf.y, -_kfT * 26, 0, 1 + _kfT * 0.5, 0);
            ctx.globalAlpha = _kfT < 0.4 ? 1 : Math.max(0, 1 - (_kfT - 0.4) / 0.6);
            const _kfS = _kfT < 0.15 ? 0.5 + _kfT / 0.15 * 0.75 : _kfT < 0.3 ? 1.25 - (_kfT - 0.15) / 0.15 * 0.25 : 1;
            ctx.save();
            ctx.translate(_kf.x, _kf.y - 30 - _kfT * 42);
            ctx.scale(_kfS, _kfS);
            _drawLabel(ctx, '+' + _kf.amount, Math.round(24 / ZOOM), '#66E287', INK, 5 / ZOOM, 'alphabetic', 0, 0, _lblScale * 1.25);
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // --- PvE COINS ON THE GROUND --- (shadows are one fill, then the coins)
        if (_gameMode === 'pve' && (_coinDrops.size > 0 || _coinFx.length > 0)) {
            const _cNow = performance.now();
            ctx.beginPath();
            for (const [, _cd] of _coinDrops) {
                if (_cd.x + 24 < visLeft || _cd.x - 24 > visRight || _cd.y + 24 < visTop || _cd.y - 24 > visBottom) continue;
                const _cq = Math.min(1, (_cNow - _cd.t0) / COIN_LAND_MS), _ce = 1 - (1 - _cq) * (1 - _cq);
                ARArena.addCoinShadow(ctx, _cd.ox + (_cd.x - _cd.ox) * _ce, _cd.oy + (_cd.y - _cd.oy) * _ce, 0.5 + 0.5 * _cq);
            }
            ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fill();
            for (const [_cid, _cd] of _coinDrops) {
                if (_cd.x + 24 < visLeft || _cd.x - 24 > visRight || _cd.y + 24 < visTop || _cd.y - 24 > visBottom) continue;
                const _cAge = _cNow - _cd.t0;
                if (_cAge > COIN_TTL_MS + 3000) { _coinDrops.delete(_cid); continue; }   // the server's word never came: do not keep it forever
                // the last seconds: it blinks
                if (_cAge > COIN_TTL_MS - COIN_BLINK_MS && ((_cAge / 140) | 0) % 2 === 1) continue;
                const _cq = Math.min(1, _cAge / COIN_LAND_MS), _ce = 1 - (1 - _cq) * (1 - _cq);
                const _cx = _cd.ox + (_cd.x - _cd.ox) * _ce, _cy = _cd.oy + (_cd.y - _cd.oy) * _ce - 30 * _cq * (1 - _cq) * 2;   // an arc: up and down
                ARArena.drawCoin(ctx, _cx, _cy, _cq < 1 ? 0.55 + 0.45 * _cq : 1);
            }
            for (let _cfi = _coinFx.length - 1; _cfi >= 0; _cfi--) {
                const _cf = _coinFx[_cfi], _cfT = (_cNow - _cf.t0) / 280;
                if (_cfT >= 1) { _coinFx.splice(_cfi, 1); continue; }
                ctx.globalAlpha = 1 - _cfT;
                ARArena.drawCoin(ctx, _cf.x, _cf.y - 22 * _cfT, 1 + 0.25 * _cfT);
            }
            ctx.globalAlpha = 1;
        }

        // --- PLAYER DEATH FX ---
        const _pdfNow = performance.now();
        for (let _pdfi = _playerDeathFx.length - 1; _pdfi >= 0; _pdfi--) {
            const _pdf = _playerDeathFx[_pdfi];
            const _pdfAge = (_pdfNow - _pdf.startTime) / 1000;
            if (_pdfAge > 0.8) { _playerDeathFx.splice(_pdfi, 1); continue; }
            const _pdfT = _pdfAge / 0.8;
            // Flash
            if (_pdfAge < 0.12) {
                ctx.globalAlpha = (1 - _pdfAge / 0.12) * 0.6;
                ctx.beginPath(); ctx.arc(_pdf.x, _pdf.y, 32, 0, Math.PI * 2);
                ctx.fillStyle = '#ffcc44'; ctx.fill();
            }
            // Inel principal
            ctx.globalAlpha = (1 - _pdfT) * 0.85;
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(_pdf.x, _pdf.y, 8 + _pdfT * 72, 0, Math.PI * 2); ctx.stroke();
            // Inel secundar
            ctx.globalAlpha = (1 - _pdfT) * 0.4;
            ctx.strokeStyle = '#ffcc44';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(_pdf.x, _pdf.y, 8 + _pdfT * 52, 0, Math.PI * 2); ctx.stroke();
            // Cioburi: chunky toy pieces (ARArena.drawShard), flying out, turning, shrinking and fading
            ctx.globalAlpha = Math.min(1, (1 - _pdfT) * 1.6);
            for (const _sh of _pdf.shards) {
                const _sr = _sh.speed * _pdfAge;
                ARArena.drawShard(ctx, _sh.kind, _pdf.x + Math.cos(_sh.angle) * _sr, _pdf.y + Math.sin(_sh.angle) * _sr, _sh.rot + _sh.rotSpeed * _pdfAge, _sh.size * (1 - 0.65 * _pdfT));
            }
        }
        ctx.globalAlpha = 1;

        // --- ZOMBIE DEATH FX ---
        const _dfNow = performance.now();
        for (let _dfi = _zombieDeathFx.length - 1; _dfi >= 0; _dfi--) {
            const _df = _zombieDeathFx[_dfi];
            const _dfAge = (_dfNow - _df.startTime) / 1000;
            if (_dfAge > 0.75) { _zombieDeathFx.splice(_dfi, 1); continue; }
            const _dfT = _dfAge / 0.75;
            // Flash initial (prima 0.1s)
            if (_dfAge < 0.1) {
                ctx.globalAlpha = (1 - _dfAge / 0.1) * 0.55;
                ctx.beginPath(); ctx.arc(_df.x, _df.y, 28, 0, Math.PI * 2);
                ctx.fillStyle = '#9BE08A'; ctx.fill();
            }
            // Inel expandat (gros, vizibil)
            ctx.globalAlpha = (1 - _dfT) * 0.85;
            ctx.strokeStyle = '#46D17C';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(_df.x, _df.y, 8 + _dfT * 70, 0, Math.PI * 2); ctx.stroke();
            // Al doilea inel mai subtire
            ctx.globalAlpha = (1 - _dfT) * 0.45;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(_df.x, _df.y, 8 + _dfT * 55, 0, Math.PI * 2); ctx.stroke();
            // Cioburi: chunky toy pieces (ARArena.drawShard), flying out, turning, shrinking and fading
            ctx.globalAlpha = Math.min(1, (1 - _dfT) * 1.6);
            for (const _sh of _df.shards) {
                const _sr = _sh.speed * _dfAge;
                ARArena.drawShard(ctx, _sh.kind, _df.x + Math.cos(_sh.angle) * _sr, _df.y + Math.sin(_sh.angle) * _sr, _sh.rot + _sh.rotSpeed * _dfAge, _sh.size * (1 - 0.65 * _dfT));
            }
        }
        ctx.globalAlpha = 1;

        // --- BAZA PvE --- (ARArena.drawBase: the fort; its HP bar is drawn with the names, above the crowns)
        if (_gameMode === 'pve') ARArena.drawBase(ctx, _PVE_BASE.x, _PVE_BASE.y, Math.max(0, _pveState.baseHp / (_pveState.baseMaxHp || 1000)), Date.now() / 1000);

        // --- ZOMBI ---
        // The art is a cached bitmap per type (ARArena.drawZombieSprite); the shadows of all the zombies are one fill
        // under them all; the HP bars are then drawn as four fills in total (track + one per colour) instead of two each.
        const _zNow = performance.now();
        let _zVisible = 0;
        for (let _zi = 0; _zi < _zombies.length; _zi++) {
            const _zb = _zombies[_zi];
            if (!_zb || _zb.hp < 0) continue;
            const _zbx = _zb.x, _zby = _zb.y;
            const _zDef = _ZB_DEFS[_zb.type || 0] || _ZB_DEFS[0];
            const _zbR = _zDef.r;
            if (_zbx + _zbR + 50 < visLeft || _zbx - _zbR - 50 > visRight || _zby + _zbR + 50 < visTop || _zby - _zbR - 50 > visBottom) continue;
            _zVisibleList[_zVisible++] = _zb;
        }
        if (_zVisible > 0) {
            ctx.setTransform(_wm);
            ctx.beginPath();
            for (let _zi = 0; _zi < _zVisible; _zi++) {
                const _zb = _zVisibleList[_zi], _zType = _zb.type || 0, _zDef = _ZB_DEFS[_zType] || _ZB_DEFS[0];
                if (_zDef.r * ZOOM >= 5) ARArena.addZombieShadow(ctx, _zb, _zDef, _zType);
            }
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fill();
        }
        for (let _zi = 0; _zi < _zVisible; _zi++) {
            const _zb = _zVisibleList[_zi];
            const _zType = _zb.type || 0;
            const _zDef = _ZB_DEFS[_zType] || _ZB_DEFS[0];
            const _zbR = _zDef.r;
            // Simplified at long range: a plain disc, when the zombies are tiny on screen
            if (_zbR * ZOOM < 5) {
                ctx.setTransform(_wm);
                ctx.fillStyle = _zDef.bodyColor;
                ctx.beginPath(); ctx.arc(_zb.x, _zb.y, _zbR, 0, Math.PI*2); ctx.fill();
                continue;
            }
            ARArena.drawZombieSprite(ctx, _wm, _zb, _zDef, _zType, _zNow);
        }
        // HP bars: only on the zombies that are hurt (see _drawZombieBars)
        ctx.setTransform(_wm);
        {
            let _hurt = 0;
            for (let _zi = 0; _zi < _zVisible; _zi++) {
                const _zb = _zVisibleList[_zi], _zDef = _ZB_DEFS[_zb.type || 0] || _ZB_DEFS[0];
                if (_zb.hp > 0 && _zb.hp < _zDef.maxHp) _zHurt[_hurt++] = _zb;
            }
            if (_hurt > 0) _drawZombieBars(ctx, _zHurt, _hurt, _ZB_DEFS);
        }

        // --- JUCATORI ---
        // The ring sits just outside the default hands and the labels stack on it

        const _ringR    = _playerRingR();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        let _plN = 0;
        for (const pid in rState.players) {
            const player = rState.players[pid];
            if (!player.alive || player.hp <= 0) continue;
            const isMe = player.id === socket.id;
            if (isMe && _selfDead) continue;
            if (!isMe && _hiddenPlayers.has(player.id)) continue;
            let px, py, pangle;
            if (isMe && predX !== null) {
                px = predX; py = predY; pangle = myAngle;
            } else {
                px = player.x; py = player.y; pangle = player.angle || 0;
            }
            // Footstep spawning
            const _pprev = _prevPlayerPos[pid];
            const _pDist = _pprev ? Math.hypot(px - _pprev.x, py - _pprev.y) : 0;
            if (_pprev) { _pprev.x = px; _pprev.y = py; } else _prevPlayerPos[pid] = { x: px, y: py };
            _footTimers[pid] = (_footTimers[pid] || 0) + _pDist;
            if (_footTimers[pid] >= 35 && _footsteps.length < 80) {
                _footTimers[pid] = 0;
                _footsteps.push({ x: px, y: py, t: performance.now() });
            }

            // 130: a long gun (up to ~128 units in front) must not vanish at the screen edge
            if (!isMe && (px + 130 < visLeft || px - 130 > visRight || py + 130 < visTop || py - 130 > visBottom)) continue;
            const ringColor = isMe ? '#46D17C' : '#FF4155';
            const ringFill  = isMe ? 'rgba(70,209,124,0.14)' : 'rgba(255,65,85,0.14)';
            // Ring, body, gun, hands on the gun, fixed highlight (see GUNS IN HAND)
            const _pWeapon = isMe ? (_playerWeapons.get(socket.id) || selectedWeapon) : (_playerWeapons.get(player.id) || DEFAULT_WEAPON);
            _drawPlayerFigure(ctx, _wm, px, py, pangle, playerImages[player.id], _pWeapon, _lblScale, ringColor, ringFill, _playerFx.get(player.id), _bulletNow, _playerWeaponSkins.get(player.id));
            if (_skinPollen) {   // a mythic skin sheds pollen from the wings
                const _sg = _gunLook(_pWeapon, _playerWeaponSkins.get(player.id));
                if (_sg && _sg.fx && _sg.fx.pollen) ARSkinFx.emitPollen(_skinPool, _skinEmitter(_skinEm, player.id), _sg.fx, px, py, pangle, PLAYER_VISUAL_SCALE, _skinDt, Math.random);
            }

            // Hit flash on the body; the tag and bars come after the tree crowns (below)
            const flashAge = flashTimers[player.id] !== undefined
                ? performance.now() - flashTimers[player.id] : Infinity;
            if (flashAge < 280) {
                ctx.globalAlpha = (1 - flashAge / 280) * 0.7;
                ctx.beginPath();
                ctx.arc(px, py, (SKIN_BODY_R + 2) * PLAYER_VISUAL_SCALE, 0, Math.PI * 2);
                ctx.fillStyle = '#ff2020';
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            _plQ[_plN] = player; _plQx[_plN] = px; _plQy[_plN] = py; _plN++;
        }
        ctx.imageSmoothingQuality = 'low'; // back to the default for the rest of the frame
        // The mythic skins' pollen: moved once, drawn over the players (only the particles of the pool; none = nothing to do)
        if (_skinPool.n) { ARSkinFx.step(_skinPool, _skinDt); ctx.setTransform(_wm); _drawSkinPollen(ctx, _skinPool, _lblScale); }

        // --- COROANE --- (trees from sprites: above the players and zombies; see-through over whoever is under)
        {
            let _crN = 0;
            for (let i = 0; i < _plN; i++) { _crX[_crN] = _plQx[i]; _crY[_crN] = _plQy[i]; _crR[_crN] = PLAYER_HIT_R; _crN++; }
            for (let i = 0; i < _zVisible; i++) { const z = _zVisibleList[i]; _crX[_crN] = z.x; _crY[_crN] = z.y; _crR[_crN] = (_ZB_DEFS[z.type || 0] || _ZB_DEFS[0]).r; _crN++; }
            for (let _oi = 0; _oi < _obstacles.length; _oi++) {
                const obs = _obstacles[_oi];
                if (obs.type !== 'tree') continue;
                const _om = obs.r * 1.6 + 12;
                if (obs.x + _om < visLeft || obs.x - _om > visRight || obs.y + _om < visTop || obs.y - _om > visBottom) continue;
                ARArena.drawCrown(ctx, obs, obs.x + _obsShakeX(_oi, _obsNow), obs.y, dtSec, _crX, _crY, _crR, _crN);
            }
        }

        // --- NUME + HP --- (above the crowns, so a tag is never hidden)
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (_gameMode === 'pve') {   // the base's bar: the player's, made bigger, over the fort
            const _bBarW = 150, _bBarH = 20, _bBarX = _PVE_BASE.x - _bBarW / 2, _bBarY = _PVE_BASE.y - _PVE_BASE_R - 52;
            const _bRatio = Math.max(0, Math.min(1, _pveState.baseHp / (_pveState.baseMaxHp || 1000)));
            _drawLabel(ctx, 'BASE', 14, '#66E287', INK, 4, 'alphabetic', _PVE_BASE.x, _bBarY - 10, _lblScale);
            _drawHpBar(ctx, _bBarX, _bBarY, _bBarW, _bBarH, _bRatio, 2.5);
            _drawLabel(ctx, String(Math.ceil(_pveState.baseHp)), 13, '#ffffff', INK, 4, 'middle', _PVE_BASE.x, _bBarY + _bBarH / 2, _lblScale);
        }
        for (let _qi = 0; _qi < _plN; _qi++) {
            const player = _plQ[_qi], px = _plQx[_qi], py = _plQy[_qi];
            const isMe = player.id === socket.id;
            const barH = isMe ? 22 : 13;
            const ammoH = 6;
            const barW = isMe ? 108 : 70;
            // Bara HP (toti jucatorii) — folosim latestHp pentru update instant, fara delay de interpolatie
            // Yours ends with the ammo bar on the ring; the others' bar sits 6 units above it
            const hpRatio = Math.min(1, Math.max(0, (latestHp[player.id] ?? player.hp) / player.maxHp));
            const barX    = px - barW / 2;
            const barY    = py - _ringR - barH - (isMe ? 4 + ammoH : 6);
            _drawLabel(ctx, player.name, isMe ? 14 : 12, isMe ? '#66E287' : '#ffffff', INK, 4, 'alphabetic',
                       px, barY - (isMe ? 12 : 10), _lblScale);
            _drawHpBar(ctx, barX, barY, barW, barH, hpRatio, isMe ? 2.5 : 2);

            // Text HP pe bara (cached label per value)
            _drawLabel(ctx, String(Math.ceil(latestHp[player.id] ?? player.hp)), isMe ? 13 : 8, '#ffffff', INK, isMe ? 4 : 3, 'middle',
                       barX + barW / 2, barY + barH / 2, _lblScale);

            if (isMe) {
                drawAmmoBar(ctx, barX, barY + barH + 4, barW, ammoH, ammoState);
            }

            // Weapon type badge — vizibil pentru toti jucatorii (eu + altii)
            {
                const _wid = isMe
                    ? (selectedWeapon || DEFAULT_WEAPON)
                    : (_playerWeapons.get(player.id) || DEFAULT_WEAPON);
                const _wd  = _WEAPON_DATA[_wid] || _WEAPON_DATA[DEFAULT_WEAPON];
                const _wsz = barH;
                const _wx  = barX + barW + 4;
                const _wy  = barY;
                _drawBadge(ctx, _wd, _wx, _wy, _wsz, _lblScale);
            }
        }
        ctx.imageSmoothingQuality = 'low'; // back to the default for the rest of the frame

        // --- HIT EFFECTS ---
        if (hitEffects.length > 0) {
            for (let i = hitEffects.length - 1; i >= 0; i--) {
                const h = hitEffects[i];
                h.life -= dtSec * 3.33; // frame-rate independent: 2.0 start → 0 over ~0.6 s
                if (h.life <= 0) { hitEffects.splice(i, 1); continue; }
                const t = (2.0 - h.life) / 2.0;
                ctx.globalAlpha = (h.life / 2.0) * 0.20;
                ctx.strokeStyle = '#ffcc00';
                ctx.lineWidth   = 2.5 / ZOOM;
                ctx.beginPath();
                ctx.arc(h.x, h.y, 22 + t * 65, 0, Math.PI * 2);
                ctx.stroke();
                if (t < 0.45) {
                    ctx.globalAlpha = (0.45 - t) / 0.45 * 0.18;
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth   = 2 / ZOOM;
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, 14 + t * 28, 0, Math.PI * 2);
                    ctx.stroke();
                }
                if (t < 0.18) {
                    ctx.globalAlpha = (0.18 - t) / 0.18 * 0.09;
                    ctx.fillStyle   = '#ffee88';
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, 28, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        // --- DAMAGE NUMBERS ---
        // Font fix per-loop elimina re-parse la fiecare numar; fara save/restore per numar
        const nowDN = performance.now();
        // Cleanup pass separat (evita splice in draw loop)
        for (let i = damageNumbers.length - 1; i >= 0; i--) {
            if (nowDN - damageNumbers[i].startTime >= DN_MS) damageNumbers.splice(i, 1);
        }
        // Scaling text mai mic pe mobile (ecran ingust)
        const _textScale = W < 500 ? 0.65 : 1;

        // Damage popups: slam in oversized and tilted, settle, float up, fade. Heavy hits are
        // bigger and gold. Each number is one cached label drawn under a transform.
        if (damageNumbers.length > 0) {
            for (const dn of damageNumbers) {
                const t = (nowDN - dn.startTime) / DN_MS;
                const heavy = dn.amount >= 60;
                const size = Math.round((heavy ? 30 : 24) * (H < 520 ? 0.68 : 1) * _textScale / ZOOM);
                const pop = t < 0.1 ? 0.35 + (t / 0.1) * 1.15 : t < 0.24 ? 1.5 - ((t - 0.1) / 0.14) * 0.5 : 1;
                const rise = 1 - Math.pow(1 - Math.min(1, t * 1.2), 3);
                ctx.globalAlpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
                ctx.save();
                ctx.translate(dn.x + dn.dir * rise * 22, dn.y - 6 - rise * 46);
                ctx.rotate((dn.rot || 0) * (1 - rise * 0.6));
                ctx.scale(pop, pop);
                _drawLabel(ctx, '-' + dn.amount, size, heavy ? '#FFC72E' : '#FF5A64', INK, 6 / ZOOM, 'alphabetic', 0, 0, _lblScale * 1.5);
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        }

        // --- COIN FLOATS (PvE) ---
        if (_gameMode === 'pve' && _coinFloats.length > 0) {
            for (let _ci = _coinFloats.length - 1; _ci >= 0; _ci--) {
                if (nowDN - _coinFloats[_ci].startTime >= 900) { _coinFloats.splice(_ci, 1); }
            }
            if (_coinFloats.length > 0) {
                const _cfSize = Math.round(19 * _textScale / ZOOM), _cfStroke = 3 / ZOOM;
                for (const _cf of _coinFloats) {
                    const _ct = (nowDN - _cf.startTime) / 900;
                    ctx.globalAlpha = Math.max(0, 1 - _ct * _ct);
                    const _cfY = _cf.y - _ct * 50;
                    _drawLabel(ctx, '+' + _cf.amount, _cfSize, '#f5c542', '#000000bb', _cfStroke, 'alphabetic', _cf.x, _cfY, _lblScale);
                }
                ctx.globalAlpha = 1;
            }
        }

        // --- ARRIVAL (PvE wave start): a ring that opens where we landed and the scene coming out of the dark ---
        if (_tpFx) {
            const _tq = (performance.now() - _tpFx.t0) / TP_MS;
            if (_tq >= 1 || gameEnded) _tpFx = null;
            else {
                const _te = 1 - (1 - _tq) * (1 - _tq);                 // ease-out
                ctx.globalAlpha = 0.9 * (1 - _tq);
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 7 * (1 - _tq) / ZOOM;
                ctx.beginPath(); ctx.arc(_tpFx.x, _tpFx.y, 26 + 110 * _te, 0, Math.PI * 2); ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        ctx.restore();

        if (_tpFx) {
            const _tq = (performance.now() - _tpFx.t0) / TP_MS;
            ctx.globalAlpha = 0.85 * (1 - _tq) * (1 - _tq);
            ctx.fillStyle = '#0B1511';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
        }

        // --- TIMER ZONA (screen space, proportional) --- BR only
        if (!gameEnded && _gameMode !== 'pve') {
            if (gameControl.countdownEndTime) {
                _zoneTimerAlpha = Math.min(1, (performance.now() - gameControl.countdownEndTime) / 500);
            }
            if (_zoneTimerAlpha > 0) {
                // The label is a cached sprite: text, block and outline are painted again only when the text
                // (whole seconds, or the phase) or the size changes, not 60-240 times a second
                const _zFontSz = Math.max(13, Math.round(Math.min(W, H) * 0.03));
                const _zt = _zone.waitTimer;
                const _zSec = _zt > 0 ? Math.ceil(_zt) : 0;
                const _zSt = _zt > 0 ? 0 : (_zone.r > 0 ? 1 : 2);
                if (_zl.sec !== _zSec || _zl.st !== _zSt || _zl.fs !== _zFontSz) {
                    _zl.sec = _zSec; _zl.st = _zSt; _zl.fs = _zFontSz;
                    _zl.text = _zSt === 0 ? `Zona se restrange in ${_zSec}s` : (_zSt === 1 ? 'Zona se restrange!' : 'Zona inchisa!');
                    if (!_labelMeasure) _labelMeasure = document.createElement('canvas').getContext('2d');
                    _labelMeasure.font = `800 ${_zFontSz}px Sen, Arial`;
                    _zl.w = _labelMeasure.measureText(_zl.text).width + 34;
                    _zl.h = _zFontSz + 20;
                    _zl.key = 'ZT|' + _zl.text + '|' + _zFontSz;
                }
                const _zPad = 8, _zw = _zl.w, _zh = _zl.h;
                const _zs = _labelSprite(_zl.key, dpr, _zw + _zPad * 2, _zh + 4 + _zPad * 2, (g) => {
                    const c = _zSt === 0 ? TOY.slate : TOY.red, ol = _zFontSz < 16 ? 2.5 : 3;
                    g.translate(_zPad, _zPad);
                    _drawBlock(g, 0, 0, _zw, _zh, Math.round(_zh * 0.3), c[0], c[1], ol, 5, 4);
                    g.font = `800 ${_zFontSz}px Sen, Arial`;
                    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
                    g.lineWidth = Math.max(3, _zFontSz * 0.24); g.strokeStyle = INK; g.fillStyle = '#FFFFFF';
                    g.strokeText(_zl.text, _zw / 2, _zh / 2 - 1);
                    g.fillText(_zl.text, _zw / 2, _zh / 2 - 1);
                });
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.globalAlpha = _zoneTimerAlpha;
                ctx.drawImage(_zs.c, W / 2 - _zw / 2 - _zPad, Math.round(H * 0.07) - _zPad, _zs.w, _zs.h);
                ctx.globalAlpha = 1;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
        }

        // --- VIGNETA ZONA (screen space, cand esti in afara) --- BR only
        if (!gameEnded && _gameMode !== 'pve' && _zone.r >= 0 && predX !== null) {
            const _distZ = Math.hypot(predX - _zone.cx, predY - _zone.cy);
            if (_zone.r === 0 || _distZ > _zone.r) {
                // a pre-painted gradient (alpha 0 -> 1) at the canvas's own size, blitted 1:1 and faded by the pulse: no gradient
                // object and no string per frame. (It used to be a quarter-size one stretched over the screen: the filtering of
                // that stretch cost ~3.9 ms/frame at 1280x720 in a software raster, ~0.9 ms for the 1:1 blit.)
                const _vcw = canvas.width, _vch = canvas.height;
                if (_vig.w !== _vcw || _vig.h !== _vch) {
                    if (!_vig.c) _vig.c = document.createElement('canvas');
                    _vig.c.width = _vcw; _vig.c.height = _vch;
                    const vg = _vig.c.getContext('2d');
                    const gr = vg.createRadialGradient(_vcw / 2, _vch / 2, _vch * 0.25, _vcw / 2, _vch / 2, _vch * 0.75);
                    gr.addColorStop(0, 'rgba(220,0,0,0)'); gr.addColorStop(1, 'rgba(220,0,0,1)');
                    vg.fillStyle = gr; vg.fillRect(0, 0, _vcw, _vch);
                    _vig.w = _vcw; _vig.h = _vch;
                }
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalAlpha = Math.round((0.25 + 0.15 * Math.sin(performance.now() / 160)) * 100) / 100;
                ctx.drawImage(_vig.c, 0, 0);
                ctx.globalAlpha = 1;
            }
        }

        // --- WEAPON BLOCK (jos-centru, screen space) ---
        if (!gameEnded && !isSpectating) {
            const _myWid  = _playerWeapons.get(socket.id) || selectedWeapon;
            const _myWd   = _WEAPON_DATA[_myWid] || _WEAPON_DATA[DEFAULT_WEAPON];
            ctx.save();
            ctx.scale(dpr, dpr);
            const _bSz  = Math.round(H < 520 ? Math.min(44, Math.max(30, H * 0.105)) : Math.min(86, Math.max(40, Math.min(W * 0.056, H * 0.095))));
            const _wSz  = _bSz;
            const _wX   = Math.round(W / 2 - _wSz / 2);
            const _wY   = H - _bSz - 20 - (window.innerHeight < 520 ? 0 : 4);
            const _sol  = _bSz < 50 ? 2.5 : 3;
            const _slip = Math.round(_bSz * 0.1);
            // Weapon block: orange, white pictogram with an ink drop
            _drawBlock(ctx, _wX, _wY, _wSz, _wSz, Math.round(_wSz * 0.24), TOY.orange[0], TOY.orange[1], _sol, _slip, 5);
            _drawWeaponIcon(ctx, _myWd.id, _wX + _wSz / 2, _wY + _wSz / 2 - _slip / 2, _wSz * 0.74, _wSz * 0.5, 1.5);
            ctx.restore();
        }

        // --- WATCHDOG ---
        if (lastGameStateTime > 0 && (performance.now() - lastGameStateTime) > 10000) {
            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.fillRect(0, 0, W, H);
            ctx.font      = `${Math.max(32, W * 0.05)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FF4155'; ctx.fillText('!', W / 2, H / 2 - Math.max(32, W * 0.05));
            ctx.font      = `bold ${Math.max(16, W * 0.022)}px Sen, sans-serif`;
            ctx.fillStyle = '#ff4444';
            ctx.fillText('CONNECTION LOST', W / 2, H / 2 + 4);
            ctx.font      = `${Math.max(12, W * 0.016)}px Sen, sans-serif`;
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText('The server is not responding. Reload the page.', W / 2, H / 2 + Math.max(24, W * 0.038));
            ctx.restore();
        }

        // --- DEBUG OVERLAY (backtick to toggle) ---
        _dbgDrawMs = performance.now() - _drawStart;
        if (_BB.on) _BB.frame(timestamp, _dbgDrawMs);
        if (_bDiag.frames && _bDiag.frames.length < 30000) _bDiag.frames.push(+_dbgDrawMs.toFixed(3));
        _dbgFpsFrames++;
        if (timestamp - _dbgFpsWindowStart >= 1000) {
            _dbgFps = Math.round(_dbgFpsFrames * 1000 / Math.max(1, timestamp - _dbgFpsWindowStart));
            _dbgFpsFrames = 0;
            _dbgFpsWindowStart = timestamp;
            _dbgGs = _dbgGsCount;
            _dbgGsCount = 0;
        }
        if (_dbgVisible && rState) {
            _dbgPending = _pendingInputs.length;
            let playerCount = 0, aliveCount = 0;
            for (const id in rState.players) {
                playerCount++;
                if (rState.players[id].alive) aliveCount++;
            }
            const bulletCount  = rState.bullets.length;
            const memStr = (typeof performance !== 'undefined' && performance.memory)
                ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}MB / ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)}MB`
                : 'n/a';
            const stateAgeMs = lastGameStateTime > 0 ? ((performance.now() - lastGameStateTime) | 0) + 'ms' : '--';
            // Prediction error: distance between local pred position and latest server position
            const _srvMe    = stateBuffer.length ? stateBuffer[stateBuffer.length - 1].players[socket.id] : null;
            const _predErrRaw = (predX !== null && _srvMe) ? Math.hypot(predX - _srvMe.x, predY - _srvMe.y) : 0;
            const _predErr  = predX !== null && _srvMe ? _predErrRaw.toFixed(1) : '--';
            const _lagMs    = Math.round(_pendingInputs.length * EMIT_MS + Math.max(0, _pingRtt) / 2);
            const _fpsColor = _dbgFps >= 55 ? '#00ff88' : _dbgFps >= 30 ? '#ff8c00' : '#ff4444';
            const _tpsColor = _dbgSrvTps >= 28 ? '#00ff88' : _dbgSrvTps >= 20 ? '#ff8c00' : '#ff4444';
            const _pingColor = _pingRtt < 80 ? '#00ff88' : _pingRtt < 200 ? '#ff8c00' : '#ff4444';
            const _errColor  = _predErrRaw < 10 ? '#00ff88' : _predErrRaw < 50 ? '#ff8c00' : '#ff4444';
            const _lagColor  = _lagMs < 80 ? '#00ff88' : _lagMs < 150 ? '#ff8c00' : '#ff4444';
            const lines = [
                { text: `FPS: ${_dbgFps}   frame: ${_dbgDrawMs.toFixed(1)}ms   res: ${Math.round(_rsScale() * 100)}%${_RS.off && _RS.fixed === null ? ' (off)' : ''}`,            color: _fpsColor  },
                { text: `TPS: ${_dbgSrvTps}   entities: ${_dbgSrvEnts}   pickups: ${_dbgSrvPickups}`, color: _tpsColor },
                { text: `PING: ${_pingRtt < 0 ? '--' : _pingRtt + 'ms'}   pkt/s: ${_dbgPktPs}   rx gs/s: ${_dbgGs}`, color: _pingColor },
                { text: `CSP: pending:${_dbgPending}   err:${_predErr}px   lag:~${_lagMs}ms`, color: _errColor  },
                { text: `ENT: pl ${aliveCount}/${playerCount}   bul ${bulletCount}`, color: '#ffffff' },
                { text: `INTERP: buf ${stateBuffer.length}   age ${stateAgeMs}   delay ${_interpShow.toFixed(0)}ms   cbul ${_clientBullets.length}`, color: '#cccccc' },
                { text: `MEM: ${memStr}`,                                                     color: '#aa88ff' },
                { text: `POS: (${predX !== null ? (predX|0) : '--'}, ${predY !== null ? (predY|0) : '--'})`, color: '#888888' },
            ];

            // ── Sample ring-buffers every frame while overlay is visible ──
            const _memMB = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0;
            _graphFps [_graphHead] = _dbgFps;
            _graphFt  [_graphHead] = _dbgDrawMs;
            _graphErr [_graphHead] = _predErrRaw;
            _graphMem [_graphHead] = _memMB;
            _graphPkts[_graphHead] = _dbgPktPs;
            _graphLag [_graphHead] = _lagMs;
            _graphHead = (_graphHead + 1) % _GRAPH_N;

            ctx.save();
            ctx.scale(dpr, dpr);
            const lh = 17, pad = 7;
            const gw = 114, gh = 28, ggap = 3;
            const graphRowsH = (gh + ggap) * 2 + 2; // 2 rows of sparklines + top separator
            const bw = 360, bh = lines.length * lh + pad * 2 + graphRowsH;
            ctx.fillStyle = 'rgba(0,0,0,0.88)';
            const dbgTop = 160;
            ctx.beginPath(); ctx.roundRect(8, dbgTop, bw, bh, 6); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(8, dbgTop, bw, bh, 6); ctx.stroke();
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            for (let li = 0; li < lines.length; li++) {
                ctx.fillStyle = lines[li].color;
                ctx.fillText(lines[li].text, 8 + pad, dbgTop + pad + li * lh);
            }

            // ── Sparkline graphs (2 rows × 3 columns) ──────────────────────
            const gx = 8 + ggap, gy1 = dbgTop + lines.length * lh + pad * 2;
            const gy2 = gy1 + gh + ggap;
            // Row 1: FPS | Frame Time | CSP Error
            _drawSparkline(ctx, _graphFps,  _graphHead, _GRAPH_N, gx,               gy1, gw, gh, 70,  '#00ff88', 'FPS', String(_dbgFps));
            _drawSparkline(ctx, _graphFt,   _graphHead, _GRAPH_N, gx + gw + ggap,   gy1, gw, gh, 33,  '#ff8c00', 'FT',  _dbgDrawMs.toFixed(1)+'ms');
            _drawSparkline(ctx, _graphErr,  _graphHead, _GRAPH_N, gx + (gw+ggap)*2, gy1, gw, gh, 100, '#ff4444', 'ERR', _predErr+'px');
            // Row 2: Pkts/s | Input Lag | Heap MB
            _drawSparkline(ctx, _graphPkts, _graphHead, _GRAPH_N, gx,               gy2, gw, gh, 35,  '#5bb8f5', 'PKT', _dbgPktPs+'/s');
            _drawSparkline(ctx, _graphLag,  _graphHead, _GRAPH_N, gx + gw + ggap,   gy2, gw, gh, 200, _lagColor,  'LAG', _lagMs+'ms');
            _drawSparkline(ctx, _graphMem,  _graphHead, _GRAPH_N, gx + (gw+ggap)*2, gy2, gw, gh, 100, '#aa88ff', 'MB',  _memMB.toFixed(0));

            ctx.restore();
        }
    }

    draw();
}

// ─── Friend Invite System ─────────────────────────────────────────────────────

function openWaitingInvitePanel() {
    const roomCode = (document.getElementById('waiting-code-display').textContent || '').trim();
    if (!roomCode || roomCode === '—') return;

    const list = document.getElementById('waiting-invite-list');
    const onlineFriends = (friendsData.friends || []).filter(f => f.online);

    if (onlineFriends.length === 0) {
        list.innerHTML = '<div class="wip-empty">No friends are online right now.</div>';
    } else {
        list.innerHTML = onlineFriends.map(f => {
            const nick = f.nickname.replace(/'/g, "\\'");
            const inRoom = _waitingRoomPlayers.has(f.nickname);
            return `
            <div class="wip-friend-row">
                <span class="wip-dot"></span>
                <span class="wip-nick">${f.nickname}</span>
                ${inRoom
                    ? `<span class="wip-in-room">${ico('check')}In room</span>`
                    : `<button class="wip-invite-btn" id="wip-btn-${nick}" onclick="sendRoomInvite('${nick}','${roomCode}')">INVITE</button>`
                }
            </div>`;
        }).join('');
    }

    document.getElementById('waiting-invite-panel').style.display = 'flex';
}

function closeWaitingInvitePanel() {
    document.getElementById('waiting-invite-panel').style.display = 'none';
}

function sendRoomInvite(targetNickname, roomCode) {
    const socket = window._gameSocket;
    if (!socket) return;
    socket.emit('invite-friend', { targetNickname, roomCode });
    const btn = document.getElementById(`wip-btn-${targetNickname}`);
    if (btn) { btn.textContent = 'SENT'; btn.disabled = true; }
}

let _pendingInvite      = null;
let _ripTimerRaf        = null;
let _waitingRoomPlayers = new Set();

function showRoomInvitePopup(from, roomCode) {
    const gameScreen = document.getElementById('screen-game');
    if (gameScreen && gameScreen.style.display !== 'none') return;

    _pendingInvite = { from, roomCode };
    document.getElementById('invite-from').textContent      = from;
    document.getElementById('invite-room-code').textContent = roomCode;

    const bar = document.getElementById('rip-timer-bar');
    bar.style.transition = 'none';
    bar.style.width = '100%';

    document.getElementById('room-invite-popup').style.display = 'flex';

    clearTimeout(_pendingInvite._timeout);
    cancelAnimationFrame(_ripTimerRaf);

    const duration = 15000;
    const start = performance.now();
    function tick(now) {
        const elapsed = now - start;
        const pct = Math.max(0, 1 - elapsed / duration);
        bar.style.transition = 'none';
        bar.style.width = (pct * 100) + '%';
        if (pct > 0) { _ripTimerRaf = requestAnimationFrame(tick); }
        else { closeRoomInvitePopup(); }
    }
    _ripTimerRaf = requestAnimationFrame(tick);
}

function closeRoomInvitePopup() {
    cancelAnimationFrame(_ripTimerRaf);
    document.getElementById('room-invite-popup').style.display = 'none';
    _pendingInvite = null;
}

function declineRoomInvite() {
    if (!_pendingInvite) return;
    const socket = window._gameSocket || _sessionSocket;
    if (socket) socket.emit('decline-invite', { from: _pendingInvite.from });
    closeRoomInvitePopup();
}

function acceptRoomInvite() {
    if (!_pendingInvite) return;
    const { roomCode } = _pendingInvite;
    closeRoomInvitePopup();

    // Curata starea jocului curent daca exista
    if (window._gameCleanup) { window._gameCleanup(); window._gameCleanup = null; }
    if (window._gameSocket) {
        window._gameSocket.disconnect();
        window._gameSocket = null;
    }
    // Deconecteaza socketul de sesiune vechi INAINTE de a crea unul nou,
    // altfel serverul trimite force-logout pe cel vechi cand noul se autentifica.
    if (_sessionSocket) {
        _sessionSocket.off('force-logout');
        _sessionSocket.disconnect();
        _sessionSocket = null;
    }

    // Ascunde orice ecran activ
    ['screen-game', 'screen-gameover', 'screen-lobby'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Reseteaza UI waiting room
    const waitCode = document.getElementById('waiting-code-display');
    if (waitCode) waitCode.textContent = '—';
    const waitCount = document.getElementById('waiting-count');
    if (waitCount) waitCount.textContent = '0';
    const waitGrid = document.getElementById('waiting-players');
    if (waitGrid) waitGrid.innerHTML = '';
    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) startBtn.style.display = 'none';
    const subMsg = document.getElementById('waiting-sub-msg');
    if (subMsg) subMsg.style.display = 'block';

    document.getElementById('screen-waiting').style.display = 'flex';

    // Creeaza socket nou autentificat si intra in camera
    pendingRoom = { action: 'join', code: roomCode };
    const _invIoOpts = typeof msgpackParser !== 'undefined'
        ? { parser: msgpackParser, transports: ['websocket'] }
        : { transports: ['websocket'] };
    _sessionSocket = _watchBuild(io(_invIoOpts));
    _sessionSocket.emit('authenticate', { nickname: currentNickname, token: sessionToken });
    const char = getSelectedCharacter();
    initGame(currentNickname, char.id, stats, pendingRoom);
}


updateStatsUI();

// ============================================
// ARENA ROYALE - game.js
// ============================================

// ─── Lobby background animation ───────────────────────────────────────────────
let _lobbyBgRaf = null;
const _LBG = {
    ready: false,
    gridSize: 50,
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
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        const W = canvas.width, H = canvas.height;

        _LBG.trees = [];
        for (let i = 0; i < 16; i++) {
            _LBG.trees.push({
                x: 30 + Math.random() * (W - 60),
                y: 30 + Math.random() * (H - 60),
                r: 18 + Math.random() * 16,
                rot: Math.random() * Math.PI * 2,
            });
        }

        _LBG.rocks = [];
        for (let i = 0; i < 10; i++) {
            _LBG.rocks.push({
                x: 30 + Math.random() * (W - 60),
                y: 30 + Math.random() * (H - 60),
                r: 14 + Math.random() * 14,
                rot: Math.random() * Math.PI,
            });
        }
    }

    // The field is still (no moving players), so one paint per start or resize is enough
    const ctx = canvas.getContext('2d');
    _lobbyBgRaf = requestAnimationFrame(() => _lobbyBgTick(ctx));
}

function stopLobbyBackground() {
    if (_lobbyBgRaf) { cancelAnimationFrame(_lobbyBgRaf); _lobbyBgRaf = null; }
    const canvas = document.getElementById('lobby-bg-canvas');
    if (canvas) canvas.style.display = 'none';
}

function _lobbyBgTick(ctx) {
    ARArena.drawLobbyField(ctx, ctx.canvas.width, ctx.canvas.height, _LBG);
}
// ──────────────────────────────────────────────────────────────────────────────

const ARENA_W = 2600;
const ARENA_H = 2600;
const VIEW_W  = 1300;
const VIEW_H  =  730;
const MAX_DPR = 2;   // cap pixelRatio - 2x acopera toate telefoanele moderne fara cost excesiv

// Decoratiuni statice ale hartii (generate o singura data cu seed fix pentru reproducibilitate)
const _mapDeco = (() => {
    let s = 0x1337cafe;
    const r = () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >> 7)) >>> 0; s = (s ^ (s << 17)) >>> 0; return s / 0xffffffff; };
    const W = 2600, H = 2600;
    const colorZones = [];
    for (let i = 0; i < 14; i++) {
        colorZones.push({ x: r()*W, y: r()*H, rx: 150+r()*280, ry: 100+r()*200,
            c: `rgba(${30+(r()*25)|0},${90+(r()*40)|0},${5+(r()*18)|0},${(0.11+r()*0.10).toFixed(2)})` });
    }
    const FC = ['#ef4444','#fde93d','#ffffff','#c084fc','#ff9ff3','#74b9ff','#fdcb6e','#a8e063'];
    const flowers = [];
    for (let i = 0; i < 260; i++) {
        flowers.push({ x: r()*W, y: r()*H, radius: 2.2+r()*2.8, c: FC[(r()*FC.length)|0] });
    }
    const grassTufts = [];
    for (let i = 0; i < 420; i++) {
        grassTufts.push({ x: r()*W, y: r()*H, angle: -0.45+r()*0.9, len: 8+r()*10, a: 0.22+r()*0.26, dark: r()>0.5 });
    }
    return { colorZones, flowers, grassTufts };
})();

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
const SKINS_READY = fetch('/data/skins.json')
    .then(r => { if (!r.ok) throw new Error('skins.json ' + r.status); return r.json(); })
    .then(data => {
        SKIN_META  = data;
        CHARACTERS = data.skins.map(s => ({ ...s, img: s.svg }));
        CHARACTERS.forEach(c => _getCharImg(c.png));
    });
const RARITY_COLOR = { common: '#7C8F9A', rare: '#52B6F0', epic: '#FF6A1A', legendary: '#FFC52E', season: '#FFD02A' };
const RARITY_LABEL = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', season: 'SEZON' };

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
// Owned skins, sent by the server at login. While "unlockAllForTesting" is true in public/data/skins.json
// the server sends every skin. TODO: SCOATE INAINTE DE LANSARE (flagul din skins.json).
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
    if (preview) preview.src = char.img;
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
        if (txt && !unlocked) txt.innerHTML = !char.shop ? 'SEZON' : char.diamonds > 0 ? ico('gem') + ' ' + char.diamonds : ico('coins') + ' ' + char.coins.toLocaleString();
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
    if (preview) preview.src = char.img;
    const ring = document.getElementById('char-rarity-ring');
    if (ring) ring.style.setProperty('--rc', RARITY_COLOR[char.rarity]);
    const _cnd = document.getElementById('char-name-display');
    if (_cnd) _cnd.textContent = char.name.toUpperCase();
    _heroRender(char);
    const lpImg = document.getElementById('lp-avatar-img');
    const lpPh  = document.getElementById('lp-avatar-ph');
    if (lpImg) { lpImg.src = char.img; lpImg.style.display = 'block'; }
    if (lpPh)  lpPh.style.display = 'none';
    renderCharShopGrid(_currentShopFilter);
    if (currentProfile) currentProfile.skin = currentProfile.avatar = char.id;
    if (currentNickname && currentPassword) {
        fetch('/api/profile/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, password: currentPassword, avatar: char.id })
        }).catch(() => {});
    }
}

// ── WEAPON SELECTION ─────────────────────────────────────────────────────────
const WEAPONS = [
    { id: 'pistol',  name: 'Pistol',  icon: 'w-pistol', color: '#F2EFE6', desc: 'Echilibrat, versatil',       bulletLife: 0.38, bulletSpeed: 1000, shootCd: 0.50 },
    { id: 'assault', name: 'Assault', icon: 'w-assault', color: '#F2EFE6', desc: 'Rata mare de tragere',       bulletLife: 0.50, bulletSpeed: 1100, shootCd: 0.25 },
    { id: 'sniper',  name: 'Sniper',  icon: 'w-sniper', color: '#F2EFE6', desc: 'Precis, letal la distanta',  bulletLife: 0.50, bulletSpeed: 1500, shootCd: 1.00 },
    { id: 'shotgun', name: 'Shotgun', icon: 'w-shotgun', color: '#F2EFE6', desc: 'Devastator de aproape',      bulletLife: 0.244, bulletSpeed:  900, shootCd: 0.85, pellets: 5, spread: 0.85 },
    { id: 'burst',   name: 'Burst',   icon: 'w-burst', color: '#F2EFE6', desc: 'Rafala de 3 gloante',        bulletLife: 0.518, bulletSpeed: 1100, shootCd: 0.60, burst: 3, burstDelay: 0.10 },
    { id: 'smg',     name: 'SMG',     icon: 'w-smg', color: '#F2EFE6', desc: 'Ultra rapid, damage mic',    bulletLife: 0.50, bulletSpeed: 1000, shootCd: 0.12 },
];
// Loadout stats per weapon (minim + crestere per punct)
const WEAPON_LOADOUT = {
    pistol:  { baseHp: 350, baseDmg: 25, baseSpd: 2.0, hpPer: 40, dmgPer: 3, spdPer: 0.2 },
    assault: { baseHp: 350, baseDmg: 10, baseSpd: 2.0, hpPer: 40, dmgPer: 2, spdPer: 0.2 },
    sniper:  { baseHp: 250, baseDmg: 50, baseSpd: 1.7, hpPer: 30, dmgPer: 5, spdPer: 0.2 },
    shotgun: { baseHp: 400, baseDmg: 13, baseSpd: 1.9, hpPer: 40, dmgPer: 2, spdPer: 0.2 },
    burst:   { baseHp: 350, baseDmg: 18, baseSpd: 2.0, hpPer: 40, dmgPer: 2, spdPer: 0.2 },
    smg:     { baseHp: 350, baseDmg:  7, baseSpd: 2.1, hpPer: 40, dmgPer: 1, spdPer: 0.2 },
};
// Lookup rapid pentru rendering arma (referinta la WEAPONS entries)
const _WEAPON_DATA = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
// Per-jucator: socketId → weaponId (populat din player-image si playersMeta)
const _playerWeapons = new Map();
let selectedWeapon = localStorage.getItem('selectedWeapon') || 'pistol';

function _applyWeaponUI() {
    const w = WEAPONS.find(x => x.id === selectedWeapon) || WEAPONS[0];
    const ring  = document.getElementById('weapon-ring');
    const icon  = document.getElementById('weapon-preview-icon');
    const nameEl = document.getElementById('weapon-name-display');
    const titleEl = document.getElementById('loadout-title');
    if (ring)  { ring.style.setProperty('--wc', w.color); }
    if (icon)  icon.innerHTML = ico(w.icon);
    if (nameEl) nameEl.textContent = w.name.toUpperCase();
    if (titleEl) titleEl.innerHTML = `<span>${w.name.toUpperCase()}</span> LOADOUT`;
}

function openWeaponSelect() {
    const overlay = document.getElementById('weapon-select-overlay');
    if (!overlay) return;
    const grid = document.getElementById('weapon-select-grid');
    if (grid) {
        grid.innerHTML = WEAPONS.map(w => `
            <div class="weapon-card${w.id === selectedWeapon ? ' wc-selected' : ''}"
                 style="--wc:${w.color}"
                 onclick="selectWeapon('${w.id}')">
                <span class="weapon-card-icon">${ico(w.icon)}</span>
                <span class="weapon-card-name">${w.name.toUpperCase()}</span>
                <span class="weapon-card-desc">${w.desc}</span>
            </div>`).join('');
    }
    overlay.style.display = 'flex';
}

function closeWeaponSelect() {
    const overlay = document.getElementById('weapon-select-overlay');
    if (overlay) overlay.style.display = 'none';
}

function selectWeapon(id) {
    selectedWeapon = id;
    localStorage.setItem('selectedWeapon', id);
    // Reset stats la 0 cand schimbi arma (build-ul difera per weapon)
    stats.hp = 0; stats.dmg = 0; stats.spd = 0;
    localStorage.setItem('ar_stats', JSON.stringify(stats));
    _applyWeaponUI();
    updateStatsUI();
    closeWeaponSelect();
}

// Initializeaza weapon UI la incarcare
document.addEventListener('DOMContentLoaded', () => setTimeout(_applyWeaponUI, 50));
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
                ? `<button class="cs-action-btn cs-selected-btn">${ico('check')} SELECTAT</button>`
                : `<button class="cs-action-btn cs-select-btn" onclick="selectCharacter('${char.id}');closeCharacterShop()">SELECTEAZA</button>`;
        } else if (!char.shop) {
            // TODO: season skins are granted through admin or code, never sold here
            actionBtn = `<button class="cs-action-btn cs-locked-btn" disabled>SEZON</button>`;
        } else if (canAfford) {
            actionBtn = `<button class="cs-action-btn cs-unlock-btn" onclick="unlockCharacter('${char.id}',this)">${costStr}${lvlStr}</button>`;
        } else {
            actionBtn = `<button class="cs-action-btn cs-locked-btn" disabled>${costStr}${lvlStr}</button>`;
        }
        const shopImgStyle = '';
        return `<div class="char-shop-card cs-r-${char.rarity}${isSelected ? ' cs-card-selected' : ''}${!isUnlocked ? ' cs-card-locked' : ''}" style="--rc:${col}">
            <div class="cs-img-outer">
                <div class="cs-img-wrap">
                    <img src="${char.img}" alt="${char.name}"${shopImgStyle} onerror="this.style.opacity='.25'">
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
            alert(data.error || 'Nu s-a putut debloca.');
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
        alert('Eroare de retea.');
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
            friendsList.innerHTML = '<div class="friends-empty">Nu ai prieteni inca. Cauta dupa nickname!</div>';
        } else {
            friendsList.innerHTML = friendsData.friends.map(f => {
                const lvl   = getLevelFromXP(f.xp || 0);
                const tier  = getTier(lvl);
                const rankName = ['Recrut','Novice','Cercetaș','Supraviețuitor','Vânător','Duelist','Raider','Mercenar','Asaltor','Veteran','Eliminator','Striker','Gladiator','Dominator','Executor','Predator','Berserker','Shadow','Phantom','Ravager','Titan','Conqueror','Warlord','Bloodhound','Reaper','Destroyer','Overkiller','Nemesis','Juggernaut','Annihilator','Apex Hunter','Void Walker','Deathbringer','Skullcrusher','Iron Legend','Chaos Knight','Doom Slayer','Inferno Lord','Storm Bringer','War Titan','Eternal Fang','Dark Sovereign','Oblivion','Cataclysm','Supreme Predator','Immortal','Ascendant','Mythic','Legendary','Battle Royale God'][lvl - 1] || 'Recrut';
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
                    <button class="friend-remove-btn" onclick="removeFriend('${escapeHtml(f.nickname)}')" title="Sterge prieten">${ico('x')}</button>
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
            resultsEl.innerHTML = '<div class="friends-empty">Niciun jucator gasit.</div>';
            return;
        }
        resultsEl.innerHTML = players.map(p => {
            const nick = p.nickname;
            const isFriend  = friendsData.friends.some(f => f.nickname === nick);
            const isPending = friendsData.pendingOutgoing.includes(nick) || friendsData.pendingIncoming.includes(nick);
            let btn = '';
            if (isFriend)        btn = '<span class="search-already-friend">Prieten</span>';
            else if (isPending)  btn = '<span class="search-already-friend">Cerere trimisa</span>';
            else                 btn = `<button class="pending-accept" onclick="sendFriendRequest('${escapeHtml(nick)}')">Adauga</button>`;
            return `<div class="friend-row">${escapeHtml(nick)}<span style="flex:1"></span>${btn}</div>`;
        }).join('');
    } catch {
        resultsEl.innerHTML = '<div class="friends-empty">Eroare retea.</div>';
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
            alert(data.error || 'Eroare la trimitere cerere.');
        }
    } catch {
        alert('Eroare retea.');
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
            alert(data.error || 'Eroare.');
        }
    } catch {
        alert('Eroare retea.');
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

function createSessionSocket() {
    if (_sessionSocket) { _sessionSocket.disconnect(); }
    const _ioOpts = typeof msgpackParser !== 'undefined'
        ? { parser: msgpackParser, transports: ['websocket'], reconnection: false }
        : { transports: ['websocket'], reconnection: false };
    _sessionSocket = io(_ioOpts);
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
        showToast(`${nick} a acceptat cererea ta de prietenie!`);
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
        showToast(`${by} a refuzat invitatia.`);
    });

    return _sessionSocket;
}

function showFriendRequestToast(requester) {
    showToast(`${requester} vrea sa te adauge prieten!`);
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

    if (!nickname || !password) { errorEl.textContent = 'Completeaza toate campurile'; return; }

    btn.disabled = true;
    btnText.textContent = 'Se verifica...';
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
            btnText.textContent = 'INTRU IN JOC';
            return;
        }
        await SKINS_READY;
        authSuccess(nickname, password, data.player, data.token);
    } catch {
        errorEl.textContent = 'Eroare de retea. Incearca din nou.';
        btn.disabled = false;
        btnText.textContent = 'INTRU IN JOC';
    }
}

async function doRegister() {
    const nickname = (document.getElementById('reg-nickname').value || '').trim();
    const password = document.getElementById('reg-password').value || '';
    const confirm  = document.getElementById('reg-confirm').value  || '';
    const errorEl  = document.getElementById('reg-error');
    const btn      = document.getElementById('reg-btn');
    const btnText  = btn.querySelector('.btn-text');

    if (!nickname || !password || !confirm) { errorEl.textContent = 'Completeaza toate campurile'; return; }
    if (password !== confirm) { errorEl.textContent = 'Parolele nu coincid'; return; }

    btn.disabled = true;
    btnText.textContent = 'Se creeaza...';
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
            btnText.textContent = 'CREEAZA CONT';
            return;
        }
        await SKINS_READY;
        authSuccess(nickname, password, data.player, data.token);
    } catch {
        errorEl.textContent = 'Eroare de retea. Incearca din nou.';
        btn.disabled = false;
        btnText.textContent = 'CREEAZA CONT';
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
    if (bigDesc)  bigDesc.textContent  = isBr ? 'Ultimul supravietuitor castiga' : 'Cooperare contra hoardelor';
    if (feat1)    feat1.innerHTML      = isBr ? ico('users') + 'Max 20 jucatori' : ico('handshake') + 'Echipe 2-4 jucatori';
    if (feat2)    feat2.innerHTML      = isBr ? ico('timer') + '~10 min / runda' : ico('biohazard') + 'Horde de zombii';
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
    if (preview) preview.src = activeChar.img;
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
        'Recrut','Novice','Cercetaș','Supraviețuitor','Vânător',
        'Duelist','Raider','Mercenar','Asaltor','Veteran',
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
        lpAvatarImg.src = lpChar.img;
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
    _set('lp-nick',    currentNickname || 'JUCATOR');
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
}

// Daily missions come from the server (missions.js): six per day, drawn from a varied pool.
// Each row: progress block, name, mode chip (BR / PvE) or weapon icon, rewards, segmented bar.
let _missionsCache = [];
function renderMissions(list) {
    const el = document.getElementById('lp-missions');
    if (!el) return;
    if (!Array.isArray(list) || !list.length) { el.innerHTML = '<div class="lp-lb-row lp-lb-empty">Se incarca...</div>'; return; }
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
            : done ? '<button class="mission-claim-btn mc-claim" onclick="claimMission(\'' + m.id + '\',this,' + m.coins + ',' + m.diamonds + ')">Revendica</button>'
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
        const tileIco = done ? 'check' : m.weapon ? 'w-' + m.weapon : kind === 'pve' ? 'biohazard' : kind === 'br' ? 'swords' : 'target';
        const tags = (m.tag === 'pve' ? '<span class="mm-tag mm-pve">PvE</span>' : m.tag === 'br' ? '<span class="mm-tag mm-br">BR</span>' : '')
            + (m.weapon ? '<span class="mm-tag mm-wpn">' + m.weapon.toUpperCase() + '</span>' : '')
            + (m.slot === 'hard' ? '<span class="mm-tag mm-hard">GREU</span>' : '');
        const reward = '<span class="rw rw-coin">+' + m.coins + ico('coins') + '</span>' + (m.diamonds ? '<span class="rw rw-gem">+' + m.diamonds + ico('gem') + '</span>' : '');
        const action = m.claimed ? '<span class="mm-claimed">' + ico('check') + 'Revendicat</span>'
            : done ? '<button class="mission-claim-btn mm-claim" onclick="claimMission(\'' + m.id + '\',this,' + m.coins + ',' + m.diamonds + ')">Revendica</button>' : '';
        return '<div class="mm-row mm-' + kind + (done ? ' is-done' : '') + (m.claimed ? ' is-claimed' : '') + '" id="mission-full-' + m.id + '">'
            + '<span class="mm-tile">' + ico(tileIco) + '</span>'
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
        if (!data.ok) { btn.disabled = false; btn.textContent = 'Revendica'; return; }

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
    } catch { btn.disabled = false; btn.textContent = 'Revendica'; }
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
                el.innerHTML = '<div class="lp-lb-row lp-lb-empty">Niciun jucator</div>';
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
                        <span class="lp-lb-wins-label">victorii</span>
                    </div>
                </div>`;
            }).join('');
        })
        .catch(() => {
            if (el) el.innerHTML = '<div class="lp-lb-row lp-lb-empty">Indisponibil</div>';
        });
}

function tournamentSignup() {
    showToast('Inscrierile la Weekend Tournament se deschid in curand.');
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
        if (diff <= 0) { el.textContent = 'ACUM!'; clearInterval(_eventTimerInterval); return; }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor(diff % 86400000 / 3600000);
        const m = Math.floor(diff % 3600000 / 60000);
        const s = Math.floor(diff % 60000 / 1000);
        // more than a day out: days + hours:minutes, so the readout keeps its width
        el.textContent = d > 0 ? d + 'z ' + pad(h) + ':' + pad(m) : pad(h) + ':' + pad(m) + ':' + pad(s);
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
    if (goTitle) goTitle.textContent = 'ELIMINAT!';
    if (goMsg)   goMsg.textContent   = 'Ai fost eliminat din arena';
    if (goStats) goStats.style.display = 'none';
    const rematchBtn = document.getElementById('btn-rematch');
    if (rematchBtn) { rematchBtn.disabled = false; rematchBtn.textContent = 'JOACA DIN NOU'; }

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
    status.textContent   = 'Se incarca...';
    tbody.innerHTML      = '';
    try {
        const res  = await fetch('/api/leaderboard');
        const data = await res.json();
        renderLeaderboardOverlay(data);
    } catch {
        status.textContent = 'Eroare la incarcare.';
    }
}

function renderLeaderboardOverlay(data) {
    const status = document.getElementById('lbo-status');
    const tbody  = document.getElementById('lbo-body');
    if (!data || data.length === 0) {
        tbody.innerHTML    = '';
        status.textContent = 'Niciun jucator inregistrat inca.';
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
        errEl.textContent = 'Adauga imaginea personajului tau!';
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
        roomErr.textContent = 'Codul trebuie sa aiba 5 litere.';
        return;
    }
    const preview = document.getElementById('preview');
    if (!preview || !preview.src || preview.style.display === 'none') {
        errEl.textContent = 'Adauga imaginea personajului tau!';
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
    const _wl = WEAPON_LOADOUT[selectedWeapon] || WEAPON_LOADOUT.pistol;
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
    if (stats.hp === stats.dmg && stats.dmg === stats.spd) text = 'Build Echilibrat';
    else if (stats.hp  === max && stats.hp  >= 4) text = 'Tank: rezistent dar lent';
    else if (stats.dmg === max && stats.dmg >= 4) text = 'Sniper: lovesti tare dar fragil';
    else if (stats.spd === max && stats.spd >= 4) text = 'Runner: super rapid dar slab';
    else text = 'Build Mixt';
    buildEl.textContent = text;
}

// (image upload replaced by character shop system)

// ---------- INTRA IN JOC ----------
function joinGame() {
    const name = currentNickname;
    if (!name) return;
    const char     = getSelectedCharacter();

    if (currentNickname && currentPassword) {
        fetch('/api/profile/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, password: currentPassword, stat_hp: stats.hp, stat_dmg: stats.dmg, stat_spd: stats.spd })
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
function _drawBadge(ctx, wd, x, y, size, scale) {
    const key = 'B2' + wd.id + '|' + size;
    const pad = 1;
    const s = _labelSprite(key, scale, size + pad * 2, size + pad * 2 + 3, (g) => {
        g.translate(pad, pad);
        const ol = Math.max(1.6, size * 0.11);
        _drawBlock(g, 0, 0, size, size, size * 0.26, '#2A3A45', '#18232A', ol, size * 0.16, 2.5);
        g.save(); g.translate(0, 1.2); ARIcons.drawWeapon(g, wd.id, size / 2, size * 0.45, size * 0.64, INK); g.restore();
        ARIcons.drawWeapon(g, wd.id, size / 2, size * 0.45 - 0.4, size * 0.64, '#FFFFFF');
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

// Labels made before the web font arrived would keep the fallback font: redo them once it loads
try { if (document.fonts) document.fonts.addEventListener('loadingdone', () => _labelCache.clear()); } catch (e) { /* no FontFaceSet */ }

// All shards of a death effect as one path (triangles rotated by hand), so the effect costs one
// fill and one stroke instead of a save/restore, fill and stroke per shard.
function _shardsPath(ctx, fx, age, sz) {
    ctx.beginPath();
    for (const sh of fx.shards) {
        const r = sh.speed * age;
        const sx = fx.x + Math.cos(sh.angle) * r, sy = fx.y + Math.sin(sh.angle) * r;
        const a = sh.rot + sh.rotSpeed * age, cs = Math.cos(a), sn = Math.sin(a);
        // local points (0,-1.2s) (0.8s,0.8s) (-0.8s,0.8s), rotated by a
        const p0x = 1.2 * sz * sn,              p0y = -1.2 * sz * cs;
        const p1x = 0.8 * sz * cs - 0.8 * sz * sn, p1y = 0.8 * sz * sn + 0.8 * sz * cs;
        const p2x = -0.8 * sz * cs - 0.8 * sz * sn, p2y = -0.8 * sz * sn + 0.8 * sz * cs;
        ctx.moveTo(sx + p0x, sy + p0y); ctx.lineTo(sx + p1x, sy + p1y); ctx.lineTo(sx + p2x, sy + p2y); ctx.closePath();
    }
}

// Sets ctx to world matrix m, then translate(x, y) and rotate so +x points along (dx, dy).
// Replaces save/translate/rotate/restore (and atan2/cos/sin) for things drawn many times a frame.
function _setRotated(ctx, m, x, y, dx, dy) {
    const l = Math.sqrt(dx * dx + dy * dy);
    const cs = l > 0 ? dx / l : 1, sn = l > 0 ? dy / l : 0;
    ctx.setTransform(m.a * cs + m.c * sn, m.b * cs + m.d * sn, m.c * cs - m.a * sn, m.d * cs - m.b * sn,
                     m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
}

// ---------- ASSETS ----------
const _bulletImgCache = {};
function _getBulletImg(src) {
    if (!_bulletImgCache[src]) {
        const img = new Image();
        img.src = src;
        _bulletImgCache[src] = img;
    }
    return _bulletImgCache[src];
}
// One bullet for every skin (weapon skins will set the tracer colour later)
const defaultBulletImg = _getBulletImg('/assets/bullets/ninja_bullet.png');

const _charImgCache = {};
function _getCharImg(src) {
    if (!_charImgCache[src]) {
        const img = new Image();
        img.src = src;
        _charImgCache[src] = img;
    }
    return _charImgCache[src];
}

const PLAYER_SPRITE_SIZE = 90;

// buildObstacleCanvases removed

function drawCircularCoverImage(ctx, img, size, scale = 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.clip();

    const iw = img.naturalWidth || img.width || size;
    const ih = img.naturalHeight || img.height || size;
    // Dividing srcSize by scale zooms in (scale>1 = larger character)
    const srcSize = Math.min(iw, ih) / scale;
    const sx = (iw - srcSize) / 2;
    const sy = (ih - srcSize) / 2;
    ctx.drawImage(img, sx, sy, srcSize, srcSize, -size / 2, -size / 2, size, size);
    ctx.restore();
}

// ---------- INITIALIZARE ----------
function initGame(playerName, playerSkin, playerStats, roomAction) {
    const canvas = document.getElementById('gameCanvas');
    const ctx    = canvas.getContext('2d');

    function resizeCanvas() {
        const vv   = window.visualViewport;
        const cssW = vv ? vv.width  : window.innerWidth;
        const cssH = vv ? vv.height : window.innerHeight;
        const dpr  = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        canvas.width  = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width  = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);

    // Preia socket-ul de sesiune creat la intrarea in lobby (deja autentificat pe server)
    const _ioFallbackOpts = typeof msgpackParser !== 'undefined'
        ? { parser: msgpackParser, transports: ['websocket'], reconnection: false }
        : { transports: ['websocket'], reconnection: false };
    const socket = _sessionSocket || io(_ioFallbackOpts);
    _sessionSocket = null;

    const playerData = { name: playerName, skin: playerSkin, stats: playerStats, xp: currentProfile?.xp || 0, weapon: selectedWeapon, mode: selectedGamemode || 'br' };

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
    // Cache entry (inclusiv circleOC) dupa URL — mai multi jucatori cu acelasi personaj
    // impart acelasi obiect; o singura incarcare de imagine si un singur OffscreenCanvas
    const _playerEntryByUrl = {};

    socket.on('player-image', (data) => {
        if (data.weapon) _playerWeapons.set(data.id, data.weapon);
        if (playerImages[data.id]) return;

        // The server sends a skin id it has validated; the sprite comes from our own list
        const charDef = getCharacterById(data.skin) || getCharacterById(DEFAULT_SKIN);
        const url = charDef ? charDef.png : '';
        // Refoloseste entry-ul deja construit pentru acest URL (alt jucator cu acelasi skin)
        if (_playerEntryByUrl[url]) {
            playerImages[data.id] = _playerEntryByUrl[url];
            return;
        }

        const img = new Image();
        img.src = url;
        const entry = { img, scale: 1.0, bulletImg: defaultBulletImg, bulletScale: 1.0, circleOC: null };
        playerImages[data.id] = entry;
        _playerEntryByUrl[url] = entry; // inregistrat dupa URL pentru reutilizare
        img.onload = () => {
            const sz = PLAYER_SPRITE_SIZE;
            const res = sz * 2; // 2× resolution so DPR=2 displays crisply
            try {
                const oc = new OffscreenCanvas(res, res);
                const oc2d = oc.getContext('2d');
                oc2d.scale(2, 2); // draw at logical sz × sz, store at res × res
                const iw = img.naturalWidth, ih = img.naturalHeight;
                const srcSize = Math.min(iw, ih) / scale;
                const sx = (iw - srcSize) / 2, sy = (ih - srcSize) / 2;
                oc2d.beginPath();
                oc2d.arc(sz / 2, sz / 2, sz / 2, 0, Math.PI * 2);
                oc2d.clip();
                oc2d.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, sz, sz);
                entry.circleOC = oc; // toti jucatorii care impart acest entry beneficiaza automat
            } catch (_) {}
        };
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
                    <img src="${(getCharacterById(p.skin) || getCharacterById(DEFAULT_SKIN) || {}).img || ''}" onerror="this.style.background='#e8a020';this.src=''"
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
        showToast(`${by} a refuzat invitatia.`);
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
    const stateBuffer  = []; // [{t, players:{id:{x,y,angle,hp,maxHp,alive,kills,name}}, bullets:[], zone:{}}]
    const playerMeta   = {}; // {id: {speed, maxHp, name}} — static per runda, trimis o data
    // Aplica metadata trimisa de server inainte ca startGameLoop sa fie apelat
    if (gameControl.pendingMeta) {
        Object.assign(playerMeta, gameControl.pendingMeta);
        for (const [id, m] of Object.entries(gameControl.pendingMeta)) { if (m.weapon) _playerWeapons.set(id, m.weapon); }
        delete gameControl.pendingMeta;
    }
    let _obstacles = gameControl.pendingObstacles || []; delete gameControl.pendingObstacles;
    const _gameMode = gameControl.mode || 'br'; delete gameControl.mode;
    let _zone = { cx: ARENA_W / 2, cy: ARENA_H / 2, r: 1650, waitTimer: 30 };
    let _zoneTimerAlpha = 0;
    const _zombies        = [];
    const _zombieDeathFx  = [];
    const _pveState = { baseHp: 1000, baseMaxHp: 1000, wave: 0, waveBreak: false, breakTimer: 0, breakTimerMax: 15, myCoins: 0 };
    const _playerDeathFx  = [];  // { x, y, startTime, shards }
    const _prevPlayerAlive = {};
    const _healthKits   = new Map(); // id → {x, y, timeLeft}
    const _kitPickupFx  = [];        // { x, y, amount, startTime }
    const _coinFloats   = [];        // { x, y, amount, startTime } — coin earn popup
    const _kitDropAnim  = new Map(); // id → dropStartTime (animatie de cadere la spawn)
    const _obsShake     = {};   // obstacle index → shake start ms
    const hitEffects    = [];
    const _footsteps    = []; // { x, y, angle, t }
    const _footTimers   = {}; // pid → sec since last step
    const _footSide     = {}; // pid → 0|1
    const _prevPlayerPos = {};
    const _srvBulletSeen = new Map(); // bullet id → first-seen timestamp
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
    const SRV_BULLET_SPEED  = 1000; // server BULLET_SPEED: velocity normaliser in the gs packet
    const _ownLinked        = new Map(); // server bullet id -> client bullet
    const _ownUnmatched     = new Map(); // server bullet id -> first time seen without a prediction
    const _GHOST_GRACE_MS   = 50;
    let   _ownSeenGen       = 0;
    let   _srvSeenGen       = 0;
    const _bDiag = { predicted: 0, linked: 0, ghosts: 0, phantoms: 0, srvRemoved: 0, hitLinked: 0 };
    const _rttMs = () => (_pingRtt > 0 ? _pingRtt : 120);
    // Fire timing mirrors server.js. Cooldowns and burst delays carry their sub-tick remainder on
    // the server, so their average length is exact (SMG 120 ms, Burst cycle 800 ms); a real shot
    // lands up to one 17 ms tick after its due time, which keeps our prediction slightly ahead.
    // AIM_DELAY (0.3 s) is armed by the input handler between ticks and first counted down on the
    // next tick, so the server fires 289-306 ms after the input lands. Use the earliest: a
    // prediction a few ms early links fine, one a few ms late races the server bullet.
    const _AIM_MS = (() => { let c = 0.3, k = 0; while (c > 0) { c -= 0.017; k++; } return (k - 1) * 17; })();

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
                const wd = _WEAPON_DATA[selectedWeapon] || _WEAPON_DATA.pistol;
                const age = Math.min(0.3, _rttMs() / 2000 + _GHOST_GRACE_MS / 1000);
                const g = { x: b.x, y: b.y, dx: b.dx, dy: b.dy, life: Math.max(0.05, (wd.bulletLife || 0.5) - age),
                            spawnTime: now, sid: b.id, seenGen: _ownSeenGen, px: b.x, py: b.y, hiddenAt: 0, dead: false, ghost: true };
                _clientBullets.push(g);
                _ownLinked.set(b.id, g);
                _bDiag.ghosts++;
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
    function _newClientBullet(x, y, dx, dy, life, now) {
        _bDiag.predicted++;
        if (_bDiag.spawnLog && _bDiag.spawnLog.length < 300) _bDiag.spawnLog.push(Math.round(now));
        return { x, y, dx, dy, life, spawnTime: now, sid: null, seenGen: 0, px: x, py: y, hiddenAt: 0, dead: false, noPredict: false };
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
            _bDiag.lagSum = 0; _bDiag.lagMax = 0; _bDiag.lagList = []; _bDiag.spawnLog = []; _bDiag.srvLog = []; _bDiag.csp = []; _bDiag.track = []; _bDiag.phantomLog = []; _bDiag.ammoLog = []; _bDiag.ghostLog = []; _bDiag.frames = [];
            window.__arDiag = () => ({ ..._bDiag, active: _clientBullets.length, linkedNow: _ownLinked.size, rtt: _pingRtt, pktPs: _dbgPktPs, fps: _dbgFps, st: { isShooting, mustRelease: _shootMustRelease, ammo: ammoState.ammo, reloading: ammoState.reloading, aim: aimStartTime, cd: gameControl.countdownActive, dead: _selfDead, predX, next: _clientNextShotAt, now: performance.now(), ended: gameEnded } });
            window.__arZombies = () => _zombies.filter(z => z && z.hp > 0).map(z => [z.x, z.y]);
            window.__arMe = () => [predX, predY];
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

    // Ping RTT measurement — trimis la fiecare 2s, server echoueaza timestamp
    socket.on('c-pong', (t) => { _pingRtt = Math.round(performance.now() - t); });
    const _pingInterval = setInterval(() => { if (!gameEnded) socket.emit('c-ping', performance.now()); }, 2000);

    let mouseActive = false;
    let _lineDashZoom = -1;
    let _lineDashArr  = [0, 0];

    // Input send rate matches server tick (60Hz = 17ms).
    // All input (move + rotate + shoot) goes through one unified packet from rAF.
    const EMIT_MS         = 17;
    // ── Interpolation clock ──────────────────────────────────────────────────
    // Snapshots are placed on the server's own timeline (its tick timestamp), not on arrival time,
    // so network jitter no longer bunches them up or leaves gaps. The render delay covers how late
    // packets actually arrive (99th percentile over ~3 s) plus one tick: ~26 ms on a clean line,
    // more on a jittery one. It grows quickly when the line gets worse and shrinks slowly, and every
    // change is spread over many frames (a few % slow-motion / fast-forward, never a jump back).
    const INTERP_MIN_MS = 26, INTERP_MAX_MS = 200, CLOCK_WIN = 180;
    const _offWin   = new Float64Array(CLOCK_WIN);  // arrival time - server time, per packet
    const _lateSort = new Float64Array(CLOCK_WIN);
    let _offN = 0, _offI = 0;
    let _clockLag   = null; // render server-time = performance.now() - _clockLag (a large negative number: clocks differ)
    let _interpShow = 34;   // current delay, for the debug overlay
    function _noteSnapshotClock(now, st) {
        _offWin[_offI] = now - st;
        _offI = (_offI + 1) % CLOCK_WIN;
        if (_offN < CLOCK_WIN) _offN++;
        let offMin = Infinity;
        for (let i = 0; i < _offN; i++) if (_offWin[i] < offMin) offMin = _offWin[i];
        for (let i = 0; i < _offN; i++) _lateSort[i] = _offWin[i] - offMin;
        const late = _lateSort.subarray(0, _offN).sort();
        const p99 = late[Math.min(_offN - 1, Math.floor(_offN * 0.99))];
        const delay = Math.max(INTERP_MIN_MS, Math.min(INTERP_MAX_MS, p99 + 17 + 6));
        const target = offMin + delay;
        if (_clockLag === null || Math.abs(target - _clockLag) > 250) _clockLag = target;  // first packet / tab resumed
        else if (target > _clockLag) _clockLag = Math.min(target, _clockLag + 1.5);   // <= 9% slower
        else _clockLag = Math.max(target, _clockLag - 0.5);                           // <= 3% faster
        _interpShow = _clockLag - offMin;
    }
    function _resetSnapshotClock() { _offN = 0; _offI = 0; _clockLag = null; }

    let _inputSeq        = 0;
    let _lastInputSend   = 0;
    const _pendingInputs = []; // [{seq, dx, dy, dt}] — replay buffer for CSP

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
        // Emit imediat stop-shoot pentru a minimiza fereastra in care serverul trage dar clientul nu
        if (!gameEnded && !_selfDead) {
            socket.emit('input', { seq: ++_inputSeq, dx: moveDir.x, dy: moveDir.y, angle: myAngle, shooting: false });
            _lastInputSend = performance.now();
        }
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
        const W  = canvas.width  / Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const H  = canvas.height / Math.min(window.devicePixelRatio || 1, MAX_DPR);
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
        // Emit imediat pentru a nu astepta urmatorul ciclu 30Hz
        if (!gameEnded && !_selfDead) {
            socket.emit('input', { seq: ++_inputSeq, dx: moveDir.x, dy: moveDir.y, angle: myAngle, shooting: false });
            _lastInputSend = performance.now();
        }
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

    socket.on('gs', ([pArr, bArr, privArr, serverTime = 0, zoneArr, zArr, kArr, pveShared]) => {

        _dbgGsCount++;
        const now = performance.now();
        // One packet per tick for the whole room: pick this client's private row
        // [id, ammo, ammoMax, reloading, reloadProgress, ackSeq, coins] out of the flat array.
        let ammoArr = null, _myCoins = 0;
        if (privArr) {
            for (let _pi = 0; _pi < privArr.length; _pi += 7) {
                if (privArr[_pi] === socket.id) {
                    _ammoRow[0] = privArr[_pi + 1]; _ammoRow[1] = privArr[_pi + 2]; _ammoRow[2] = privArr[_pi + 3];
                    _ammoRow[3] = privArr[_pi + 4]; _ammoRow[4] = privArr[_pi + 5];
                    ammoArr = _ammoRow; _myCoins = privArr[_pi + 6];
                    break;
                }
            }
        }
        const pveArr = pveShared ? [pveShared[0], pveShared[1], pveShared[2], pveShared[3], pveShared[4], _myCoins] : null;
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
                !ammoState.reloading && !(_WEAPON_DATA[selectedWeapon] || {}).semiAuto) {
                _shootMustRelease = false;
                _clientHasReleased = true;
                aimStartTime = now;
            }
        }
        if (zoneArr) {
            _zone.cx = zoneArr[0]; _zone.cy = zoneArr[1];
            _zone.r  = zoneArr[2]; _zone.waitTimer = zoneArr[3];
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
            for (let _zi = 0; _zi < zArr.length; _zi += 5) {
                const _zid = _zi / 5;
                if (!_zombies[_zid]) _zombies[_zid] = { hp: -1 };
                const _zPrevHp = _zombies[_zid].hp;
                _zombies[_zid].x = zArr[_zi]; _zombies[_zid].y = zArr[_zi+1];
                _zombies[_zid].angle = zArr[_zi+2]; _zombies[_zid].hp = zArr[_zi+3];
                _zombies[_zid].type = zArr[_zi+4] || 0;
                // Death + damage feedback
                if (_zPrevHp > 0 && _zombies[_zid].hp <= 0) {
                    const _shards = [];
                    for (let _si = 0; _si < 7; _si++) {
                        _shards.push({ angle: (_si / 7) * Math.PI * 2 + Math.random() * 0.4, speed: 35 + Math.random() * 45, rot: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 8 });
                    }
                    _zombieDeathFx.push({ x: _zombies[_zid].x, y: _zombies[_zid].y, startTime: performance.now(), shards: _shards });
                }
                if (_zPrevHp > 0 && _zombies[_zid].hp >= 0 && _zPrevHp - _zombies[_zid].hp > 0.5) {
                    hitEffects.push({ x: _zombies[_zid].x, y: _zombies[_zid].y, life: 2.0 });
                }
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
        // Server sends velocity normalised by its BULLET_SPEED (1000 px/s). The old 1400 factor made
        // every enemy bullet extrapolate 40% too fast, then snap back on the next packet (jitter).
        const entry = {
            t:       now,
            st:      serverTime || now,
            players: {},
            bullets: bArr.map(([id, x, y, dx, dy, ownerId]) => ({ id, x, y, dx: dx * SRV_BULLET_SPEED, dy: dy * SRV_BULLET_SPEED, ownerId, radius: 6 })),
        };
        _reconcileOwnBullets(entry.bullets, now);
        // Trail age bookkeeping for other players' bullets: once per packet, not per frame
        _srvSeenGen++;
        for (const b of entry.bullets) {
            const _s = _srvBulletSeen.get(b.id);
            if (_s) _s.gen = _srvSeenGen; else _srvBulletSeen.set(b.id, { t: now, gen: _srvSeenGen });
        }
        for (const [_sid, _s] of _srvBulletSeen) { if (_s.gen !== _srvSeenGen) _srvBulletSeen.delete(_sid); }

        pArr.forEach(([id, x, y, angle, hp, alive, kills]) => {
            const meta = playerMeta[id] || {};
            if (!alive) _hiddenPlayers.delete(id);
            // Detectie moarte jucator → efect vizual
            if (!alive && _prevPlayerAlive[id] === true && id !== socket.id) {
                const _dshards = [];
                for (let _si = 0; _si < 8; _si++) {
                    _dshards.push({ angle: (_si / 8) * Math.PI * 2 + Math.random() * 0.5, speed: 45 + Math.random() * 55, rot: Math.random() * Math.PI, rotSpeed: (Math.random() - 0.5) * 9 });
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
                if (_cspErr > 400) {
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
            ? `${victimName} a fost eliminat de zona`
            : `${killerName} l-a eliminat pe ${victimName}`;
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
        socket.emit('move', { x: 0, y: 0 });
        socket.emit('stop-shoot');
        myElimData = { placement, totalPlayers, killedBy, kills };
        setTimeout(() => {
            if (_gameMode === 'pve') {
                document.getElementById('gameover-title').textContent = 'ELIMINAT!';
                document.getElementById('gameover-msg').textContent   = 'Vei fi respawnat la inceputul wave-ului urmator';
                document.getElementById('round-stats-section').style.display = 'none';
                const specBtn = document.getElementById('btn-spectate');
                if (specBtn) specBtn.style.display = 'none';
            } else {
                document.getElementById('gameover-title').textContent =
                    `LOC ${placement} DIN ${totalPlayers}`;
                document.getElementById('gameover-msg').textContent = killedBy === 'zombie'
                    ? 'Eliminat de un zombi'
                    : killedBy
                        ? `Eliminat de ${killedBy}`
                        : 'Eliminat de zona';
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
        socket.emit('move', { x: 0, y: 0 });
        socket.emit('stop-shoot');
        setTimeout(() => {
            document.getElementById('gameover-title').textContent = 'LOC 1 — AI CASTIGAT!';
            document.getElementById('gameover-msg').textContent   = 'Esti ultimul supravietuitor!';
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
    });

    // ---------- RESET PENTRU REMATCH ----------
    function resetForNewGame() {
        _spriteBurst = true;
        gameEnded  = false;
        _selfDead  = false;
        _hiddenPlayers.clear();
        _playerWeapons.clear();
        if (gameControl.pendingMeta) {
            for (const [id, m] of Object.entries(gameControl.pendingMeta)) { if (m.weapon) _playerWeapons.set(id, m.weapon); }
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
        document.getElementById('gameover-title').textContent = 'ELIMINAT!';
        document.getElementById('gameover-msg').textContent   = 'Ai fost eliminat din arena';
        const specBtn = document.getElementById('btn-spectate');
        if (specBtn) specBtn.style.display = 'none';
        exitSpectating();
        myElimData = null;
        _ammoBarCache.key = '';
        if (gameControl.pendingObstacles) { _obstacles = gameControl.pendingObstacles; delete gameControl.pendingObstacles; }
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
        if (btn) { btn.disabled = true; btn.textContent = 'Vot inregistrat'; }
    };

    socket.on('pve-coins', ({ coins, earned, x, y }) => {
        _pveState.myCoins = coins;
        updatePveHud();
        if (earned && x !== undefined && y !== undefined) {
            _coinFloats.push({ x, y: y - 20, amount: earned, startTime: performance.now() });
        }
    });

    socket.on('upgrade-result', ({ ok, type, coins, upgCounts, reason, newMaxHp }) => {
        if (!ok) { if (reason === 'max') showToast('Upgrade maxim atins!'); return; }
        _pveState.myCoins = coins;
        if (upgCounts) Object.assign(_pveUpgCounts, upgCounts);
        if (newMaxHp && playerMeta[socket.id]) playerMeta[socket.id].maxHp = newMaxHp;
        updatePveHud();
        updateUpgradeButtons();
        const labels = { dmg: 'Damage +5%', spd: 'Viteza +4%', hp: 'HP Max +15', ammo: 'Ammo +12%' };
        showToast(labels[type] || 'Upgrade aplicat!');
    });

    socket.on('pve-wave-start', ({ wave, total, batches }) => {
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
        showToast(remaining > 0 ? 'Intariri!' : '');
    });

    socket.on('pve-skip-status', ({ votes, total }) => {
        const btn = document.getElementById('pve-skip-btn');
        if (btn) btn.textContent = votes >= total ? 'SKIP' : `SKIP (${votes}/${total})`;
    });

    socket.on('pve-wave-break', ({ wave, nextWave, timer }) => {
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
            document.getElementById('pve-upgrade-wave-info').innerHTML = `Wave ${wave}${ico('arrow-right')}${nextWave}`;
            document.getElementById('pve-upgrade-coins').textContent = _pveState.myCoins;
            const skipBtn = document.getElementById('pve-skip-btn');
            if (skipBtn) { skipBtn.disabled = false; skipBtn.textContent = 'SKIP'; }
            updateUpgradeButtons();
            showPvePanel();
            // Animare timer bar porneaza de la starea curenta a timerului
            const timerBar = document.getElementById('pve-upg-timer-bar');
            if (timerBar) {
                timerBar.style.transition = 'none'; timerBar.style.width = '100%';
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    timerBar.style.transition = `width ${_effectiveTimer}s linear`;
                    timerBar.style.width = '0%';
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
                document.getElementById('gameover-title').textContent = 'VICTORIE!';
                document.getElementById('gameover-msg').textContent   = `Ati supravietuit toate cele ${wavesCleared} wave-uri!`;
            } else {
                document.getElementById('gameover-title').textContent = 'INFRANGERE!';
                document.getElementById('gameover-msg').textContent   = `Baza a cazut dupa ${wavesCleared} wave${wavesCleared === 1 ? '' : '-uri'} complete!`;
            }
            document.getElementById('round-stats-section').style.display = 'none';
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 1500);
    });

    socket.on('game-rematch', ({ isHost, playersMeta }) => {
        resetForNewGame();
        if (playersMeta) {
            Object.assign(playerMeta, playersMeta);
            for (const [id, m] of Object.entries(playersMeta)) { if (m.weapon) _playerWeapons.set(id, m.weapon); }
        }
        const btn = document.getElementById('btn-rematch');
        btn.disabled    = false;
        btn.textContent = 'JOACA DIN NOU';
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
    function getInterpolatedState() {
        if (stateBuffer.length === 0) return null;

        // On the server's timeline (entry.st), see _noteSnapshotClock
        if (_clockLag === null) return null;
        const renderTime = performance.now() - _clockLag;

        // Find the two snapshots that bracket renderTime.
        // stateBuffer is oldest-first; scan backwards for the last one <= renderTime.
        let iOld = -1;
        for (let i = stateBuffer.length - 1; i >= 0; i--) {
            if (stateBuffer[i].st <= renderTime) { iOld = i; break; }
        }

        let sOld, sNew;
        if (iOld < 0) {
            // renderTime is before ALL buffered snapshots — not enough history yet, use oldest
            sOld = sNew = stateBuffer[0];
        } else if (iOld >= stateBuffer.length - 1) {
            // renderTime is past the newest snapshot — extrapolate slightly from last two
            sOld = stateBuffer[Math.max(0, stateBuffer.length - 2)];
            sNew = stateBuffer[stateBuffer.length - 1];
        } else {
            sOld = stateBuffer[iOld];
            sNew = stateBuffer[iOld + 1];
        }

        const span = sNew.st - sOld.st;
        // t in [0,1] for normal interpolation; allow up to 1.5 for slight extrapolation
        const t = span > 0 ? Math.max(0, Math.min(1.0, (renderTime - sOld.st) / span)) : 0;

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

            if (np && t > 0) {
                out.x = op.x + (np.x - op.x) * t;
                out.y = op.y + (np.y - op.y) * t;
                // Shortest-path angle lerp — handles the 0/2π wraparound
                let da = np.angle - op.angle;
                if (da >  Math.PI) da -= Math.PI * 2;
                if (da < -Math.PI) da += Math.PI * 2;
                out.angle = op.angle + da * t;
            } else {
                out.x     = op.x;
                out.y     = op.y;
                out.angle = op.angle;
            }
        }
        for (const id in _IS.players) {
            if (!_ISActiveIds.has(id)) delete _IS.players[id];
        }

        // Bullets always from the latest snapshot; extrapolated forward in the draw loop.
        _IS.bullets = stateBuffer[stateBuffer.length - 1].bullets;
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

    // Zombie looks per type (normal, runner, tank); hitbox radii live on the server
    const _ZB_DEFS = [
        { r: 16, maxHp: 100, bodyColor: '#5E9253', innerColor: '#7DB26A', armColor: '#4A7A42', armStroke: '#25422A', ringColor: '#FF4155', ringFill: 'rgba(255,65,85,0.10)' },
        { r: 12, maxHp: 50,  bodyColor: '#C27A33', innerColor: '#E39A4D', armColor: '#9D5F26', armStroke: '#4C2D10', ringColor: '#FF6A1A', ringFill: 'rgba(255,106,26,0.12)' },
        { r: 24, maxHp: 400, bodyColor: '#4F6A99', innerColor: '#6F8CBD', armColor: '#3E557D', armStroke: '#1D2B45', ringColor: '#52B6F0', ringFill: 'rgba(82,182,240,0.10)' },
    ];
    const _ZB_BAR_COLORS = ['rgba(0,0,0,0.55)', '#46D17C', '#FFC52E', '#FF4155'];
    const FOOT_STEPS     = 10;
    const DN_MS          = 820; // damage popup life // footprint fade steps (2.5 s / 10 = one step every 250 ms)
    const _zVisibleList  = [];
    let _spriteBurst     = true;

    // ---------- BUCLA DE RANDARE ----------
    let lastTime  = 0;
    function draw(timestamp) {
        rafId = requestAnimationFrame(draw);
        const _drawStart = performance.now();

        const dpr  = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const W    = canvas.width  / dpr;
        const H    = canvas.height / dpr;
        let ZOOM = Math.min(W / VIEW_W, H / VIEW_H); // recalculat dupa dtSec

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const rState = getInterpolatedState();
        if (!rState) { lastTime = timestamp; return; }

        const dtSec = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
        lastTime = timestamp;

        // Zoom out per arma: sniper vede 1.25x mai mult din mapa, tranzitie lina
        const _targetZoom = (selectedWeapon === 'sniper') ? 1.15 : 1.0;
        _zoomFactor += (_targetZoom - _zoomFactor) * Math.min(1, dtSec * 4);
        ZOOM = Math.min(W / (VIEW_W * _zoomFactor), H / (VIEW_H * _zoomFactor));

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
            const _myWdSpawn = _WEAPON_DATA[selectedWeapon] || _WEAPON_DATA.pistol;
            const _cbspd  = _myWdSpawn.bulletSpeed || 1000;
            const _cblife = _myWdSpawn.bulletLife  || 0.60;
            const _cbPellets = _myWdSpawn.pellets || 1;
            const _cbSpread  = _myWdSpawn.spread  || 0;
            const _bcdx = -Math.sin(myAngle), _bcdy = Math.cos(myAngle);
            for (let _pi = 0; _pi < _cbPellets; _pi++) {
                const _ang = _cbPellets === 1 ? 0 : -_cbSpread / 2 + _pi * _cbSpread / (_cbPellets - 1);
                const _cos = Math.cos(_ang), _sin = Math.sin(_ang);
                const _pdx = _bcdx * _cos - _bcdy * _sin;
                const _pdy = _bcdx * _sin + _bcdy * _cos;
                _clientBullets.push(_newClientBullet(predX + _bcdx * 25, predY + _bcdy * 25, _pdx * _cbspd, _pdy * _cbspd, _cblife, _shotNow));
            }
            const _burstCount = _myWdSpawn.burst || 1;
            const _burstDelay = _myWdSpawn.burstDelay || 0.08;
            // Holding the trigger: count from when the shot was due, not from this frame, or every
            // shot lands up to a frame later than the server's (the server cadence is exact).
            const _shotBase = (_shotNow - _clientNextShotAt < 34) ? _clientNextShotAt : _shotNow;
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
            _clientNextShotAt = _shotBase + ((_myWdSpawn.shootCd || 0.25) + (_burstCount - 1) * _burstDelay) * 1000;
            // Spend the round locally right away; the server confirms it about one RTT later.
            ammoState.ammo = Math.max(0, ammoState.ammo - 1);
            _ammoHoldUntil = _shotNow + Math.max(160, _rttMs() + 100);
            if (ammoState.ammo === 0) { _shootMustRelease = true; _clientHasReleased = false; }
            if (_myWdSpawn.semiAuto) { _shootMustRelease = true; _clientHasReleased = false; isShooting = false; }
        }
        // Spawn pending burst bullets cu delay real
        const _cbNow = performance.now();
        while (_pendingBurstShots.length > 0 && _pendingBurstShots[0].spawnAt <= _cbNow) {
            const _pbs = _pendingBurstShots.shift();
            if (predX !== null && !_selfDead) {
                _clientBullets.push(_newClientBullet(predX + _pbs.odx * 25, predY + _pbs.ody * 25, _pbs.dx, _pbs.dy, _pbs.life, _cbNow));
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
            for (let _zi = 0; _zi < _zombies.length; _zi++) {
                const _zb = _zombies[_zi];
                if (!_zb || _zb.hp < 0) continue;
                const _R = (_gameMode === 'pve' ? (_PVE_ZB_RADIUS[_zb.type || 0] || 20) : 20) + 6;
                if (_zb.x + _R < _bMinX || _zb.x - _R > _bMaxX || _zb.y + _R < _bMinY || _zb.y - _R > _bMaxY) continue;
                const _t = _segCircleT(_x0, _y0, _x1, _y1, _zb.x, _zb.y, _R);
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

        // ── Unified 60Hz input send ───────────────────────────────────────────
        // Sends one compact packet per server tick interval: move+angle+shoot bundled.
        // Inputs are recorded with their dt for CSP replay on server ack.
        const _nowI = performance.now();
        // Threshold a bit under the tick: with exactly 17 ms a 60 Hz screen (16.7 ms frames) only
        // sent on some frames (30-50 inputs/s) while the replay below assumed 17 ms per input.
        if (!gameEnded && !gameControl.countdownActive && !_selfDead && !_pveState.waveBreak && _nowI - _lastInputSend >= EMIT_MS - 4) {
            // Real time since the previous input: how long the server applies the previous one
            const _inDt = (_nowI - _lastInputSend) < 100 ? (_nowI - _lastInputSend) / 1000 : EMIT_MS / 1000;
            _lastInputSend = _nowI;
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
            // Record for CSP replay (limit buffer to ~3s worth of inputs at 60Hz)
            if (predX !== null) {
                // dt = real interval between inputs (not the rAF frame time, and not a fixed 17 ms):
                // the server keeps applying an input every tick until the next one lands, so the
                // replay must cover the same wall time or it under-predicts and pulls you back.
                _pendingInputs.push({ seq, dx: moveDir.x, dy: moveDir.y, dt: _inDt });
                if (_pendingInputs.length > 180) _pendingInputs.shift();
            }
        }

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
            if (_specNameEl) _specNameEl.textContent = sp ? sp.name : '—';
            if (_specHpEl)   _specHpEl.textContent   = sp ? `${Math.ceil(Math.max(0, sp.hp))} / ${sp.maxHp} HP` : '';
        }

        const specTarget = isSpectating && spectateTargetId ? rState.players[spectateTargetId] : null;
        const camX = specTarget ? specTarget.x : (predX !== null ? predX : (me ? me.x : ARENA_W / 2));
        const camY = specTarget ? specTarget.y : (predY !== null ? predY : (me ? me.y : ARENA_H / 2));

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(W / 2, H / 2);
        ctx.scale(ZOOM, ZOOM);
        ctx.translate(-camX, -camY);

        // World transform, read once: sprites drawn with setTransform start from it (no save/restore)
        const _wm = ctx.getTransform();
        // First frame of a match: build every tree/rock bitmap now (normally 4 per frame). Before,
        // the props over budget were drawn as full vector paths on that first frame, which queued
        // a 100-200 ms GPU raster and made the countdown stutter.
        if (_spriteBurst && _obstacles.length) { ARArena.allowBurst(_obstacles.length + 8); _spriteBurst = false; }
        ARArena.beginFrame(dpr * ZOOM, performance.now());
        const _lblScale = dpr * ZOOM;

        const visLeft   = camX - W / (2 * ZOOM);
        const visTop    = camY - H / (2 * ZOOM);
        const visRight  = visLeft + W / ZOOM;
        const visBottom = visTop  + H / ZOOM;

        // --- FUNDAL ---
        ARArena.drawGround(ctx, visLeft, visTop, visRight, visBottom, ARENA_W, ARENA_H);

        // --- DECORATIUNI HARTA ---
        // Zone cu nuanta de verde usor diferita — clampate la limitele arenei
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, ARENA_W, ARENA_H);
        ctx.clip();
        for (const z of _mapDeco.colorZones) {
            if (z.x + z.rx < visLeft || z.x - z.rx > visRight || z.y + z.ry < visTop || z.y - z.ry > visBottom) continue;
            ctx.fillStyle = z.c;
            ctx.beginPath();
            ctx.ellipse(z.x, z.y, z.rx, z.ry, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        // Tufisuri de iarba (batched: one stroke per colour/opacity step)
        ARArena.drawGrass(ctx, _mapDeco.grassTufts, visLeft, visTop, visRight, visBottom);
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

        // --- MARCAJE ---
        ARArena.drawMarkings(ctx, visLeft, visTop, visRight, visBottom, ARENA_W, ARENA_H, ZOOM);

        // --- OBSTACOLE ---
        const _obsNow = performance.now();
        for (let _oi = 0; _oi < _obstacles.length; _oi++) {
            const obs = _obstacles[_oi];
            if (obs.x + obs.r < visLeft || obs.x - obs.r > visRight ||
                obs.y + obs.r < visTop  || obs.y - obs.r > visBottom) continue;
            // Shake offset
            let _sox = 0, _soy = 0;
            if (_obsShake[_oi] !== undefined) {
                const _sa = (_obsNow - _obsShake[_oi]) / 1000;
                if (_sa > 0.40) { delete _obsShake[_oi]; }
                else {
                    const _samp = 2.2 * (1 - _sa / 0.40);
                    _sox = Math.sin(_sa * 26 * Math.PI * 2) * _samp;
                }
            }
            const _ox = obs.x + _sox, _oy = obs.y + _soy;
            ARArena.drawProp(ctx, obs, _ox, _oy); // cached bitmap per obstacle
        }

        // --- ZONA --- (BR only)
        if (_gameMode !== 'pve') ARArena.drawZone(ctx, visLeft, visTop, visRight, visBottom, _zone, ZOOM);

        // --- INDICATOR TRAIECTORIE ---
        if ((_aimActive || isShooting || mouseActive) && me && me.alive && !gameEnded) {
            const dirX       = -Math.sin(myAngle);
            const dirY       =  Math.cos(myAngle);
            const _trajWd   = _WEAPON_DATA[selectedWeapon] || _WEAPON_DATA.pistol;
            const TRAJ_START = 25;
            const TRAJ_END   = 25 + (_trajWd.bulletSpeed || 1000) * (_trajWd.bulletLife || 0.60);
            ctx.save();
            ctx.lineWidth = 2.5 / ZOOM;
            if (_lineDashZoom !== ZOOM) { _lineDashZoom = ZOOM; _lineDashArr = [6 / ZOOM, 24 / ZOOM]; }
            ctx.setLineDash(_lineDashArr);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            if (_trajWd.pellets && _trajWd.pellets > 1) {
                const _tSpread = _trajWd.spread || 0;
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
        const _bulletAge = Math.min((_bulletNow - lastGameStateTime) / 1000, 0.05);
        const _trailSprite = _getTrailSprite();
        const _projSz = 38;
        ctx.fillStyle = '#ffffff';
        for (const b of rState.bullets) {
            if (b.ownerId === socket.id) continue;
            const _bx = b.x + b.dx * _bulletAge;
            const _by = b.y + b.dy * _bulletAge;
            // Extrapolating up to 50 ms past the last packet must not carry a bullet through a tree
            // or a player it is about to hit (the server removes it on the next packet anyway)
            if (_bulletAge > 0 && _enemyBulletBlocked(b.x, b.y, _bx, _by, b.ownerId, rState)) continue;
            const _seen = _srvBulletSeen.get(b.id);
            const _bAge = _seen ? (_bulletNow - _seen.t) / 1000 : 0;
            const _trail = Math.min(_bAge * 480, 110);
            const _bImg = playerImages[b.ownerId]?.bulletImg;
            const _imgOk = _bImg && _bImg.complete && _bImg.naturalWidth;
            _setRotated(ctx, _wm, _bx, _by, b.dx, b.dy);
            if (_trail > 4) ctx.drawImage(_trailSprite, -_trail, -4, _trail, 8);
            if (_imgOk) ctx.drawImage(_bImg, -_projSz / 2, -_projSz / 2, _projSz, _projSz);
            else { ctx.beginPath(); ctx.arc(0, 0, b.radius || 6, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.setTransform(_wm);
        // Own bullets — fade-out in the last 20% of their lifetime; hidden ones hit something
        const _myBImg = playerImages[socket.id]?.bulletImg;
        const _myImgOk = _myBImg && _myBImg.complete && _myBImg.naturalWidth;
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
            if (_trail > 4) ctx.drawImage(_trailSprite, -_trail, -4, _trail, 8);
            if (_myImgOk) ctx.drawImage(_myBImg, -_projSz / 2, -_projSz / 2, _projSz, _projSz);
            else { ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); }
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
            // Cioburi
            ctx.globalAlpha = Math.pow(1 - _pdfT, 1.4);
            _shardsPath(ctx, _pdf, _pdfAge, 8 * (1 - _pdfT));
            ctx.fillStyle = '#ffaa22'; ctx.fill();
            ctx.strokeStyle = '#cc6600'; ctx.lineWidth = 1; ctx.stroke();
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
            // Cioburi mari
            ctx.globalAlpha = Math.pow(1 - _dfT, 1.5);
            _shardsPath(ctx, _df, _dfAge, 9 * (1 - _dfT));
            ctx.fillStyle = '#5E9253'; ctx.fill();
            ctx.strokeStyle = '#25422A'; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // --- BAZA PvE ---
        if (_gameMode === 'pve') {
            const _bx = ARENA_W / 2, _by = ARENA_H / 2;
            const _bhpRatio = Math.max(0, _pveState.baseHp / (_pveState.baseMaxHp || 1000));
            const _t = Date.now() / 1000;
            ctx.save();
            ctx.translate(_bx, _by);

            // Perimetru exterior — hexagon de 6 colturi
            const _wallR = 80;
            const _wallColor = _bhpRatio > 0.5 ? '#17372F' : _bhpRatio > 0.25 ? '#4A3A12' : '#4A1A1E';
            const _wallStroke = _bhpRatio > 0.5 ? '#46D17C' : _bhpRatio > 0.25 ? '#FFC52E' : '#FF4155';
            ctx.beginPath();
            for (let _i = 0; _i < 6; _i++) {
                const _a = _i * Math.PI / 3 - Math.PI / 6;
                _i === 0 ? ctx.moveTo(Math.cos(_a) * _wallR, Math.sin(_a) * _wallR)
                         : ctx.lineTo(Math.cos(_a) * _wallR, Math.sin(_a) * _wallR);
            }
            ctx.closePath();
            ctx.fillStyle = _wallColor; ctx.fill();
            ctx.strokeStyle = _wallStroke; ctx.lineWidth = 3.5; ctx.stroke();

            // Turnuri la colturi
            for (let _i = 0; _i < 6; _i++) {
                const _a = _i * Math.PI / 3 - Math.PI / 6;
                const _tx = Math.cos(_a) * _wallR, _ty = Math.sin(_a) * _wallR;
                ctx.beginPath(); ctx.arc(_tx, _ty, 10, 0, Math.PI * 2);
                ctx.fillStyle = '#1a3a1e'; ctx.fill();
                ctx.strokeStyle = _wallStroke; ctx.lineWidth = 2.5; ctx.stroke();
                // Detaliu turn
                ctx.beginPath(); ctx.arc(_tx, _ty, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = _wallStroke; ctx.fill();
            }

            // Ziduri interioare — octagon
            const _innerR = 44;
            ctx.beginPath();
            for (let _i = 0; _i < 8; _i++) {
                const _a = _i * Math.PI / 4;
                _i === 0 ? ctx.moveTo(Math.cos(_a) * _innerR, Math.sin(_a) * _innerR)
                         : ctx.lineTo(Math.cos(_a) * _innerR, Math.sin(_a) * _innerR);
            }
            ctx.closePath();
            ctx.fillStyle = '#0B1C17'; ctx.fill();
            ctx.strokeStyle = 'rgba(70,209,124,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();

            // Core pulsant
            const _pulse = 0.7 + 0.3 * Math.sin(_t * 2.5);
            const _coreColor = _bhpRatio > 0.5 ? '#46D17C' : _bhpRatio > 0.25 ? '#FFC52E' : '#FF4155';
            ctx.beginPath(); ctx.arc(0, 0, 18 * _pulse, 0, Math.PI * 2);
            ctx.strokeStyle = _coreColor; ctx.lineWidth = 2; ctx.globalAlpha = 0.55; ctx.stroke(); ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2);
            ctx.fillStyle = _coreColor; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();

            // HP bar + text interior (pe octagon)
            const _hbW = _innerR * 1.5, _hbH = 5;
            const _hbY = _innerR * 0.72;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath(); ctx.roundRect(-_hbW / 2, _hbY, _hbW, _hbH, 0); ctx.fill();
            ctx.fillStyle = _coreColor;
            ctx.beginPath(); ctx.roundRect(-_hbW / 2, _hbY, _hbW * _bhpRatio, _hbH, 0); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.font = `bold ${Math.round(_innerR * 0.32)}px 'Sen', sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(_pveState.baseHp, 0, _hbY - _innerR * 0.22);

            ctx.restore();
        }

        // --- ZOMBI ---
        // Bodies come from cached bitmaps (ARArena.drawZombieSprite); the HP bars of all zombies
        // are then drawn as four fills in total (track + one per colour) instead of two each.
        const _zNow = performance.now();
        let _zVisible = 0;
        for (let _zi = 0; _zi < _zombies.length; _zi++) {
            const _zb = _zombies[_zi];
            if (!_zb || _zb.hp < 0) continue;
            const _zbx = _zb.x, _zby = _zb.y;
            const _zType = _zb.type || 0;
            const _zDef = _ZB_DEFS[_zType] || _ZB_DEFS[0];
            const _zbR = _zDef.r;
            if (_zbx + _zbR + 50 < visLeft || _zbx - _zbR - 50 > visRight || _zby + _zbR + 50 < visTop || _zby - _zbR - 50 > visBottom) continue;
            _zVisibleList[_zVisible++] = _zb;
            // Simplificat la distanta mare — reduce draw calls cand zombi sunt mici pe ecran
            if (_zbR * ZOOM < 5) {
                ctx.setTransform(_wm);
                ctx.fillStyle = _zDef.bodyColor;
                ctx.beginPath(); ctx.arc(_zbx, _zby, _zbR, 0, Math.PI*2); ctx.fill();
                continue;
            }
            ARArena.drawZombieSprite(ctx, _wm, _zb, _zDef, _zType, _zNow);
        }
        ctx.setTransform(_wm);
        if (_zVisible > 0) {
            for (let _pass = 0; _pass < 4; _pass++) {
                ctx.beginPath();
                let _any = false;
                for (let _zi = 0; _zi < _zVisible; _zi++) {
                    const _zb = _zVisibleList[_zi];
                    const _zDef = _ZB_DEFS[_zb.type || 0] || _ZB_DEFS[0];
                    const _zbR = _zDef.r;
                    const _zhpRatio = Math.max(0, Math.min(1, _zb.hp / _zDef.maxHp));
                    const _band = _zhpRatio > 0.5 ? 1 : _zhpRatio > 0.25 ? 2 : 3;
                    if (_pass !== 0 && _pass !== _band) continue;
                    const _zbW = Math.max(28, _zbR * 2.2);
                    ctx.rect(_zb.x - _zbW / 2, _zb.y - _zbR - 14, _pass === 0 ? _zbW : _zbW * _zhpRatio, 3);
                    _any = true;
                }
                if (!_any) continue;
                ctx.fillStyle = _ZB_BAR_COLORS[_pass];
                ctx.fill();
            }
        }

        // --- JUCATORI ---
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

            if (!isMe && (px + 80 < visLeft || px - 80 > visRight || py + 80 < visTop || py - 80 > visBottom)) continue;
            const sqSize = 90;
            const ringR  = sqSize / 2 + 8;
            const ringColor = isMe ? '#46D17C' : '#FF4155';
            const ringFill  = isMe ? 'rgba(70,209,124,0.14)' : 'rgba(255,65,85,0.14)';

            // Ring: filled + stroked, drawn BEFORE the character so it appears behind
            ctx.beginPath();
            ctx.arc(px, py, ringR, 0, Math.PI * 2);
            ctx.fillStyle = ringFill;
            ctx.fill();
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.55;
            ctx.stroke();
            ctx.globalAlpha = 1;

            _setRotated(ctx, _wm, px, py, Math.cos(pangle), Math.sin(pangle));
            const _entry = playerImages[player.id];
            if (_entry && (_entry.circleOC || (_entry.img && _entry.img.complete && _entry.img.naturalWidth))) {
                if (_entry.circleOC) {
                    ctx.drawImage(_entry.circleOC, -sqSize / 2, -sqSize / 2, sqSize, sqSize);
                } else {
                    drawCircularCoverImage(ctx, _entry.img, sqSize, _entry.scale || 1);
                }
            } else {
                ctx.fillStyle = ringColor;
                ctx.globalAlpha = 0.85;
                ctx.fillRect(-sqSize / 2, -sqSize / 2, sqSize, sqSize);
                ctx.globalAlpha = 1;
            }
            ctx.setTransform(_wm);

            // Flash + Nume (name tag is a cached label: one drawImage instead of strokeText+fillText)
            const flashAge = flashTimers[player.id] !== undefined
                ? performance.now() - flashTimers[player.id] : Infinity;
            const barH = isMe ? 22 : 13;
            const ammoH = 6;
            const barW = isMe ? 108 : 70;
            if (flashAge < 280) {
                ctx.globalAlpha = (1 - flashAge / 280) * 0.7;
                ctx.beginPath();
                ctx.arc(px, py, sqSize / 2 + 2, 0, Math.PI * 2);
                ctx.fillStyle = '#ff2020';
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            _drawLabel(ctx, player.name, isMe ? 14 : 12, isMe ? '#66E287' : '#ffffff', INK, 4, 'alphabetic',
                       px, py - ringR - (isMe ? 44 : 38), _lblScale);

            // Bara HP (toti jucatorii) — folosim latestHp pentru update instant, fara delay de interpolatie
            const hpRatio = Math.min(1, Math.max(0, (latestHp[player.id] ?? player.hp) / player.maxHp));
            const barX    = px - barW / 2;
            const barY    = py - ringR - (isMe ? 32 : 28);
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
                    ? (selectedWeapon || 'pistol')
                    : (_playerWeapons.get(player.id) || 'pistol');
                const _wd  = _WEAPON_DATA[_wid] || _WEAPON_DATA.pistol;
                const _wsz = barH;
                const _wx  = barX + barW + 4;
                const _wy  = barY;
                _drawBadge(ctx, _wd, _wx, _wy, _wsz, _lblScale);
            }
        }

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

        ctx.restore();


        // --- TIMER ZONA (screen space, proportional) --- BR only
        if (!gameEnded && _gameMode !== 'pve') {
            if (gameControl.countdownEndTime) {
                _zoneTimerAlpha = Math.min(1, (performance.now() - gameControl.countdownEndTime) / 500);
            }
            if (_zoneTimerAlpha > 0) {
                ctx.save();
                ctx.scale(dpr, dpr);
                ctx.globalAlpha = _zoneTimerAlpha;
                ctx.textAlign = 'center';
                const _zFontSz = Math.max(13, Math.round(Math.min(W, H) * 0.03));
                ctx.font = `800 ${_zFontSz}px Sen, Arial`;
                const _zt = _zone.waitTimer;
                const _zLabel = _zt > 0
                    ? `Zona se restrange in ${Math.ceil(_zt)}s`
                    : (_zone.r > 0 ? 'Zona se restrange!' : 'Zona inchisa!');
                const _zc = _zt > 0 ? TOY.slate : TOY.red;
                const _ztW = ctx.measureText(_zLabel).width + 34;
                const _ztH = _zFontSz + 20;
                const _ztX = W / 2, _ztTop = Math.round(H * 0.07);
                const _zol = _zFontSz < 16 ? 2.5 : 3;
                _drawBlock(ctx, _ztX - _ztW / 2, _ztTop, _ztW, _ztH, Math.round(_ztH * 0.3), _zc[0], _zc[1], _zol, 5, 4);
                ctx.textBaseline = 'middle';
                ctx.lineJoin = 'round';
                ctx.lineWidth = Math.max(3, _zFontSz * 0.24);
                ctx.strokeStyle = INK;
                ctx.strokeText(_zLabel, _ztX, _ztTop + _ztH / 2 - 1);
                ctx.fillStyle = _zt > 0 ? '#FFFFFF' : '#FFFFFF';
                ctx.fillText(_zLabel, _ztX, _ztTop + _ztH / 2 - 1);
                ctx.restore();
            }
        }

        // --- VIGNETA ZONA (screen space, cand esti in afara) --- BR only
        if (!gameEnded && _gameMode !== 'pve' && _zone.r >= 0 && predX !== null) {
            const _distZ = Math.hypot(predX - _zone.cx, predY - _zone.cy);
            if (_zone.r === 0 || _distZ > _zone.r) {
                ctx.save();
                ctx.scale(dpr, dpr);
                const _pulse = 0.25 + 0.15 * Math.sin(performance.now() / 160);
                const _vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
                _vg.addColorStop(0, 'rgba(220,0,0,0)');
                _vg.addColorStop(1, `rgba(220,0,0,${_pulse.toFixed(2)})`);
                ctx.fillStyle = _vg;
                ctx.fillRect(0, 0, W, H);
                ctx.restore();
            }
        }

        // --- BULLET SLOT + WEAPON TYPE BADGE (jos-centru, screen space, alaturi) ---
        if (!gameEnded && !isSpectating) {
            const _bSlotE = playerImages[socket.id];
            const _myWid  = _playerWeapons.get(socket.id) || selectedWeapon;
            const _myWd   = _WEAPON_DATA[_myWid] || _WEAPON_DATA.pistol;
            ctx.save();
            ctx.scale(dpr, dpr);
            const _bSz  = Math.round(H < 520 ? Math.min(44, Math.max(30, H * 0.105)) : Math.min(86, Math.max(40, Math.min(W * 0.056, H * 0.095))));
            const _wSz  = _bSz;
            const _gap  = Math.round(_bSz * 0.14);
            const _totalW = _bSz + _gap + _wSz;
            const _bX   = Math.round(W / 2 - _totalW / 2);
            const _wX   = _bX + _bSz + _gap;
            const _bY   = H - _bSz - 20 - (window.innerHeight < 520 ? 0 : 4);
            const _wY   = _bY;
            const _sol  = _bSz < 50 ? 2.5 : 3;
            const _slip = Math.round(_bSz * 0.1);
            // Bullet slot (left): slate block with the projectile sprite
            _drawBlock(ctx, _bX, _bY, _bSz, _bSz, Math.round(_bSz * 0.24), '#2A3A45', '#18232A', _sol, _slip, 5);
            if (_bSlotE?.bulletImg?.complete && _bSlotE.bulletImg.naturalWidth > 0) {
                const _bPad = Math.round(_bSz * 0.16);
                ctx.drawImage(_bSlotE.bulletImg, _bX + _bPad, _bY + _bPad - _slip / 2, _bSz - _bPad * 2, _bSz - _bPad * 2);
            }
            // Weapon block (right): orange, white pictogram with an ink drop
            _drawBlock(ctx, _wX, _wY, _wSz, _wSz, Math.round(_wSz * 0.24), TOY.orange[0], TOY.orange[1], _sol, _slip, 5);
            ARIcons.drawWeapon(ctx, _myWd.id, _wX + _wSz / 2, _wY + _wSz / 2 - _slip / 2 + 1.5, _wSz * 0.62, INK);
            ARIcons.drawWeapon(ctx, _myWd.id, _wX + _wSz / 2, _wY + _wSz / 2 - _slip / 2, _wSz * 0.62, '#FFFFFF');
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
            ctx.fillText('CONEXIUNE PIERDUTA', W / 2, H / 2 + 4);
            ctx.font      = `${Math.max(12, W * 0.016)}px Sen, sans-serif`;
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText('Serverul nu raspunde. Reincarca pagina.', W / 2, H / 2 + Math.max(24, W * 0.038));
            ctx.restore();
        }

        // --- DEBUG OVERLAY (backtick to toggle) ---
        _dbgDrawMs = performance.now() - _drawStart;
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
                { text: `FPS: ${_dbgFps}   frame: ${_dbgDrawMs.toFixed(1)}ms`,              color: _fpsColor  },
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
        list.innerHTML = '<div class="wip-empty">Niciun prieten online momentan.</div>';
    } else {
        list.innerHTML = onlineFriends.map(f => {
            const nick = f.nickname.replace(/'/g, "\\'");
            const inRoom = _waitingRoomPlayers.has(f.nickname);
            return `
            <div class="wip-friend-row">
                <span class="wip-dot"></span>
                <span class="wip-nick">${f.nickname}</span>
                ${inRoom
                    ? `<span class="wip-in-room">${ico('check')}în cameră</span>`
                    : `<button class="wip-invite-btn" id="wip-btn-${nick}" onclick="sendRoomInvite('${nick}','${roomCode}')">INVITA</button>`
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
    if (btn) { btn.textContent = 'TRIMIS'; btn.disabled = true; }
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
    _sessionSocket = io(_invIoOpts);
    _sessionSocket.emit('authenticate', { nickname: currentNickname, token: sessionToken });
    const char = getSelectedCharacter();
    initGame(currentNickname, char.id, stats, pendingRoom);
}


updateStatsUI();

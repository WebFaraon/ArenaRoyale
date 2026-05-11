// ============================================
// ARENA ROYALE - game.js
// ============================================

// ─── Lobby background animation ───────────────────────────────────────────────
let _lobbyBgRaf = null;
const _LBG = {
    bots: [],
    lastTime: 0,
    gridSize: 50,
};
const _BOT_COLORS = ['#e94560','#5bb8f5','#34d39a','#f0944d','#a78bfa'];

function startLobbyBackground() {
    const canvas = document.getElementById('lobby-bg-canvas');
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const W = canvas.width, H = canvas.height;

    _LBG.bots = [];
    for (let i = 0; i < 5; i++) {
        const spd = 55 + Math.random() * 70;
        const angle = Math.random() * Math.PI * 2;
        _LBG.bots.push({
            x: 50 + Math.random() * (W - 100),
            y: 50 + Math.random() * (H - 100),
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            color: _BOT_COLORS[i],
            nextTurn: 1 + Math.random() * 2.5,
            timer: 0,
            r: 13,
        });
    }

    _LBG.trees = [];
    for (let i = 0; i < 16; i++) {
        _LBG.trees.push({
            x: 30 + Math.random() * (W - 60),
            y: 30 + Math.random() * (H - 60),
            r: 18 + Math.random() * 16,
        });
    }

    _LBG.rocks = [];
    for (let i = 0; i < 10; i++) {
        _LBG.rocks.push({
            x: 30 + Math.random() * (W - 60),
            y: 30 + Math.random() * (H - 60),
            rx: 9 + Math.random() * 10,
            ry: 6 + Math.random() * 8,
            angle: Math.random() * Math.PI,
        });
    }

    _LBG.lastTime = performance.now();
    if (_lobbyBgRaf) cancelAnimationFrame(_lobbyBgRaf);
    _lobbyBgTick(canvas.getContext('2d'));
}

function stopLobbyBackground() {
    if (_lobbyBgRaf) { cancelAnimationFrame(_lobbyBgRaf); _lobbyBgRaf = null; }
}

function _lobbyBgTick(ctx) {
    const now = performance.now();
    const dt  = Math.min((now - _LBG.lastTime) / 1000, 0.05);
    _LBG.lastTime = now;
    const W = ctx.canvas.width, H = ctx.canvas.height;

    ctx.fillStyle = '#4a7c2f';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(20,50,10,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += _LBG.gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += _LBG.gridSize) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.strokeStyle = '#1a3a0a';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);

    // Rocks (static, behind trees)
    for (const r of _LBG.rocks) {
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.angle);
        ctx.beginPath();
        ctx.ellipse(3, 4, r.rx, r.ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, 0, r.rx, r.ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#6e6454';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-r.rx * 0.22, -r.ry * 0.22, r.rx * 0.42, r.ry * 0.42, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#8a7e6e';
        ctx.fill();
        ctx.restore();
    }

    // Trees (static, in front of rocks)
    for (const t of _LBG.trees) {
        ctx.beginPath();
        ctx.arc(t.x + 4, t.y + 6, t.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fillStyle = '#2a5818';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.18, t.y - t.r * 0.18, t.r * 0.56, 0, Math.PI * 2);
        ctx.fillStyle = '#3d7222';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.28, t.y - t.r * 0.3, t.r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#4e8e2c';
        ctx.fill();
    }

    for (const bot of _LBG.bots) {
        bot.timer += dt;
        if (bot.timer >= bot.nextTurn) {
            bot.timer = 0;
            bot.nextTurn = 1.5 + Math.random() * 3;
            const spd   = 55 + Math.random() * 70;
            const angle = Math.random() * Math.PI * 2;
            bot.vx = Math.cos(angle) * spd;
            bot.vy = Math.sin(angle) * spd;
        }
        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;
        if (bot.x < bot.r)     { bot.x = bot.r;     bot.vx =  Math.abs(bot.vx); }
        if (bot.x > W - bot.r) { bot.x = W - bot.r; bot.vx = -Math.abs(bot.vx); }
        if (bot.y < bot.r)     { bot.y = bot.r;     bot.vy =  Math.abs(bot.vy); }
        if (bot.y > H - bot.r) { bot.y = H - bot.r; bot.vy = -Math.abs(bot.vy); }

        ctx.beginPath();
        ctx.arc(bot.x + 3, bot.y + 4, bot.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(bot.x, bot.y, bot.r, 0, Math.PI * 2);
        ctx.fillStyle = bot.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _lobbyBgRaf = requestAnimationFrame(() => _lobbyBgTick(ctx));
}
// ──────────────────────────────────────────────────────────────────────────────

const ARENA_W = 2600;
const ARENA_H = 2600;
const VIEW_W  = 1300;
const VIEW_H  =  730;
const MAX_DPR = 1.5; // cap pixelRatio — reduces canvas pixels by ~44% vs 2x on Retina/iPad

// ---------- SISTEM PERSONAJE ----------
const CHARACTERS = [
    // scale: factor de zoom (>1 = mai mare, <1 = mai mic)
    // bullet: imaginea proiectilului; scale: zoom in cerc; bulletScale: marimea proiectilului (1.0=normal, 1.4=mai mare)
    { id: 'ninja',      name: 'Ninja',       rarity: 'common',    img: '/images/characters/ninja.png',      level: 1,  coins: 0,    diamonds: 0,  default: true, scale: 1.0, bulletScale: 1.0, bullet: '/assets/bullets/ninja_bullet.png'           },
    { id: 'zombie',     name: 'Zombie',      rarity: 'common',    img: '/images/characters/zombie.png',     level: 1,  coins: 150,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Zombie.png'    },
    { id: 'robot',      name: 'Robot',       rarity: 'common',    img: '/images/characters/robot.png',      level: 1,  coins: 150,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Robot.png'     },
    { id: 'wizard',     name: 'Wizard',      rarity: 'common',    img: '/images/characters/wizard.png',     level: 2,  coins: 200,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Wizard.png'    },
    { id: 'sheriff',    name: 'Cowboy',      rarity: 'common',    img: '/images/characters/cowboy.png',     level: 3,  coins: 250,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Cowboy.png'    },
    { id: 'pumpkin',    name: 'Pumpkin',     rarity: 'common',    img: '/images/characters/pumpkin.png',    level: 3,  coins: 300,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Pumpkin.png'   },
    { id: 'forestelf',  name: 'Forest Elf',  rarity: 'rare',      img: '/images/characters/forestElf.png',  level: 4,  coins: 400,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_ForestElf.png' },
    { id: 'fire',       name: 'Fire Knight', rarity: 'rare',      img: '/images/characters/fire.png',       level: 5,  coins: 500,  diamonds: 0,  scale: 0.85,   bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Fire.png'      },
    { id: 'tiger',      name: 'Tiger',       rarity: 'rare',      img: '/images/characters/tiger.png',      level: 5,  coins: 500,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Tiger.png'     },
    { id: 'shark',      name: 'Shark',       rarity: 'rare',      img: '/images/characters/shark.png',      level: 6,  coins: 600,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Shark.png'     },
    { id: 'thunderbot', name: 'Thunder Bot', rarity: 'rare',      img: '/images/characters/thunderBot.png', level: 6,  coins: 650,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_ThunderBot.png'},
    { id: 'werewolf',   name: 'Werewolf',    rarity: 'rare',      img: '/images/characters/werewolf.png',   level: 6,  coins: 700,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Werewolf.png'  },
    { id: 'cyberbrain', name: 'Cyber Brain', rarity: 'rare',      img: '/images/characters/cyberBrain.png', level: 7,  coins: 800,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_CyberBrain.png'},
    { id: 'viking',     name: 'Viking',      rarity: 'epic',      img: '/images/characters/viking.png',     level: 10, coins: 1800, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Viking.png'    },
    { id: 'sungod',     name: 'Sun God',     rarity: 'epic',      img: '/images/characters/sunGod.png',     level: 10, coins: 2000, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_SunGod.png'    },
    { id: 'ice',        name: 'Ice Queen',   rarity: 'epic',      img: '/images/characters/ice.png',        level: 10, coins: 0,    diamonds: 15, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Ice.png'       },
    { id: 'magmagolem', name: 'Magma Golem', rarity: 'epic',      img: '/images/characters/magmaGolem.png', level: 12, coins: 2500, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_MagmaGolem.png'},
    { id: 'royalking',  name: 'Royal King',  rarity: 'epic',      img: '/images/characters/royalKing.png',  level: 12, coins: 0,    diamonds: 20, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_King.png'      },
    { id: 'vampire',    name: 'Vampire',     rarity: 'legendary', img: '/images/characters/vampire.png',    level: 15, coins: 0,    diamonds: 40, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Vampire.png'   },
    { id: 'samurai',    name: 'Samurai',     rarity: 'legendary', img: '/images/characters/samurai.png',    level: 18, coins: 0,    diamonds: 60, scale: 1.0,    bulletScale: 1.0, bullet: '/assets/bullets/ninja_bullet.png'         },
    { id: 'pharaoh',    name: 'Pharaoh',     rarity: 'legendary', img: '/images/characters/pharaoh.png',    level: 20, coins: 0,    diamonds: 75, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Pharaoh.png'   },
];
const RARITY_COLOR = { common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7', legendary: '#f59e0b' };
const RARITY_LABEL = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

// Tier colors by level bracket
const TIER_COLORS = [
    { min: 1,  max: 9,  color: '#cd7f32', glow: 'rgba(205,127,50,.55)',  name: 'Bronze'   },
    { min: 10, max: 19, color: '#c0c0c0', glow: 'rgba(192,192,192,.55)', name: 'Silver'   },
    { min: 20, max: 29, color: '#ffd700', glow: 'rgba(255,215,0,.55)',   name: 'Gold'     },
    { min: 30, max: 39, color: '#88eeff', glow: 'rgba(136,238,255,.55)', name: 'Diamond'  },
    { min: 40, max: 49, color: '#c084fc', glow: 'rgba(192,132,252,.55)', name: 'Mythic'   },
    { min: 50, max: 50, color: '#e040fb', glow: 'rgba(224,64,251,.7)',   name: 'Amethyst' },
];
function getTier(level) {
    return TIER_COLORS.find(t => level >= t.min && level <= t.max) || TIER_COLORS[0];
}

let selectedCharacterId = 'ninja';
let unlockedCharacters  = CHARACTERS.map(c => c.id); // TESTING: toate deblocate
let _currentShopFilter  = 'all';

function getCharacterById(id) { return CHARACTERS.find(c => c.id === id); }
function getSelectedCharacter() { return getCharacterById(selectedCharacterId) || CHARACTERS[0]; }

function selectCharacter(id) {
    if (!unlockedCharacters.includes(id)) return;
    selectedCharacterId = id;
    const char = getCharacterById(id);
    if (!char) return;
    const preview = document.getElementById('preview');
    if (preview) preview.src = char.img;
    const ring = document.getElementById('char-rarity-ring');
    if (ring) ring.style.boxShadow = `0 0 0 3px ${RARITY_COLOR[char.rarity]}, 0 0 18px ${RARITY_COLOR[char.rarity]}66`;
    const lpImg = document.getElementById('lp-avatar-img');
    const lpPh  = document.getElementById('lp-avatar-ph');
    if (lpImg) { lpImg.src = char.img; lpImg.style.display = 'block'; }
    if (lpPh)  lpPh.style.display = 'none';
    renderCharShopGrid(_currentShopFilter);
    if (currentProfile) currentProfile.avatar = char.img;
    if (currentNickname && currentPassword) {
        fetch('/api/profile/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, password: currentPassword, avatar: char.img })
        }).catch(() => {});
    }
}

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
        const costStr    = char.diamonds > 0 ? `💎 ${char.diamonds}` : (char.coins === 0 ? 'GRATUIT' : `🪙 ${char.coins.toLocaleString()}`);
        const lvlStr     = char.level > 1 ? ` · LV ${char.level}+` : '';
        let actionBtn;
        if (isUnlocked) {
            actionBtn = isSelected
                ? `<button class="cs-action-btn cs-selected-btn">✓ SELECTAT</button>`
                : `<button class="cs-action-btn cs-select-btn" onclick="selectCharacter('${char.id}');closeCharacterShop()">SELECTEAZA</button>`;
        } else if (canAfford) {
            actionBtn = `<button class="cs-action-btn cs-unlock-btn" onclick="unlockCharacter('${char.id}',this)">${costStr}${lvlStr}</button>`;
        } else {
            actionBtn = `<button class="cs-action-btn cs-locked-btn" disabled>${costStr}${lvlStr}</button>`;
        }
        const shopImgStyle = char.scale && char.scale !== 1.0 ? ` style="transform:scale(${char.scale})"` : '';
        return `<div class="char-shop-card cs-r-${char.rarity}${isSelected ? ' cs-card-selected' : ''}${!isUnlocked ? ' cs-card-locked' : ''}" style="--rc:${col}">
            <div class="cs-img-outer">
                <div class="cs-img-wrap">
                    <img src="${char.img}" alt="${char.name}"${shopImgStyle} onerror="this.style.opacity='.25'">
                    ${!isUnlocked ? '<div class="cs-lock-overlay">🔒</div>' : ''}
                </div>
                ${isSelected ? '<div class="cs-selected-badge">✓</div>' : ''}
            </div>
            <div class="cs-rarity-label" style="color:${col}">${RARITY_LABEL[char.rarity]}</div>
            <div class="cs-char-name">${char.name.toUpperCase()}</div>
            ${actionBtn}
        </div>`;
    }).join('');
}

async function unlockCharacter(id, btn) {
    if (!currentNickname || !sessionToken) return;
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = '⏳ ...';
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
    overlay.style.cssText = 'position:fixed;inset:0;background:#0a0a0f;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;font-family:Lexend,Arial,sans-serif;';
    overlay.innerHTML = `
        <div style="color:#ff4466;font-size:22px;font-weight:700;margin-bottom:16px;">⚠ Deconectat</div>
        <div style="color:#ccc;font-size:15px;text-align:center;max-width:320px;line-height:1.6;">${msg}</div>
        <button onclick="location.reload()" style="margin-top:28px;padding:12px 32px;background:#ff4466;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">OK</button>
    `;
    document.body.appendChild(overlay);
}

function createSessionSocket() {
    if (_sessionSocket) { _sessionSocket.disconnect(); }
    _sessionSocket = io();
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

    // server sends { by: nickname }
    _sessionSocket.on('friend-accepted', ({ by: nick }) => {
        friendsData.pendingOutgoing = friendsData.pendingOutgoing.filter(n => n !== nick);
        if (!friendsData.friends.some(f => f.nickname === nick)) {
            friendsData.friends.push({ nickname: nick, online: false });
        }
        renderFriendsPanel();
        showToast(`${nick} a acceptat cererea ta de prietenie!`);
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
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 22px;border-radius:10px;font-size:14px;font-family:Lexend,Arial,sans-serif;z-index:99999;box-shadow:0 4px 18px #0008;pointer-events:none;transition:opacity 0.3s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
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
    unlockedCharacters = CHARACTERS.map(c => c.id); // TESTING: toate deblocate
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

    if (!nickname || !password) { errorEl.textContent = '⚠️ Completeaza toate campurile'; return; }

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
            errorEl.textContent = '⚠️ ' + data.error;
            btn.disabled = false;
            btnText.textContent = 'INTRU IN JOC';
            return;
        }
        authSuccess(nickname, password, data.player, data.token);
    } catch {
        errorEl.textContent = '⚠️ Eroare de retea. Incearca din nou.';
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

    if (!nickname || !password || !confirm) { errorEl.textContent = '⚠️ Completeaza toate campurile'; return; }
    if (password !== confirm) { errorEl.textContent = '⚠️ Parolele nu coincid'; return; }

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
            errorEl.textContent = '⚠️ ' + data.error;
            btn.disabled = false;
            btnText.textContent = 'CREEAZA CONT';
            return;
        }
        authSuccess(nickname, password, data.player, data.token);
    } catch {
        errorEl.textContent = '⚠️ Eroare de retea. Incearca din nou.';
        btn.disabled = false;
        btnText.textContent = 'CREEAZA CONT';
    }
}

// ---------- NAVIGARE & CAMERA ----------
let pendingRoom = null;

function prepopulateLobby() {
    // Existing: name badge + avatar
    const nameDisplay = document.getElementById('char-name-display');
    if (nameDisplay) nameDisplay.textContent = currentNickname || 'JUCATOR';
    const nameInput = document.getElementById('input-name');
    if (nameInput) nameInput.value = currentNickname || '';

    // Restore selected character from saved avatar URL (case-insensitive match)
    const savedAvatar     = (currentProfile?.avatar || '').toLowerCase();
    const savedChar       = CHARACTERS.find(c => savedAvatar.includes('/' + c.id + '.'));
    if (savedChar && unlockedCharacters.includes(savedChar.id)) {
        selectedCharacterId = savedChar.id;
    } else {
        selectedCharacterId = 'ninja';
    }
    const activeChar = getSelectedCharacter();
    const preview = document.getElementById('preview');
    if (preview) preview.src = activeChar.img;
    const rarityRing = document.getElementById('char-rarity-ring');
    if (rarityRing) rarityRing.style.boxShadow = `0 0 0 3px ${RARITY_COLOR[activeChar.rarity]}, 0 0 18px ${RARITY_COLOR[activeChar.rarity]}66`;

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
    const MISSION_DEFS = [
        { id: 'kills', name: 'Elimina 5 inamici',  total: 5, rewardTxt: '+50 🪙',        coins: 50,  diamonds: 0 },
        { id: 'games', name: 'Joaca 3 meciuri',     total: 3, rewardTxt: '+30 🪙',        coins: 30,  diamonds: 0 },
        { id: 'wins',  name: 'Castiga un meci',     total: 1, rewardTxt: '+100 🪙 +1 💎', coins: 100, diamonds: 1 },
    ];
    const mData = p.missions || { kills: 0, games: 0, wins: 0, killsClaimed: false, gamesClaimed: false, winsClaimed: false };
    const mProgress = { kills: mData.kills || 0, games: mData.games || 0, wins: mData.wins || 0 };
    const mClaimed  = { kills: mData.killsClaimed, games: mData.gamesClaimed, wins: mData.winsClaimed };

    const missionsEl = document.getElementById('lp-missions');
    if (missionsEl) {
        missionsEl.innerHTML = MISSION_DEFS.map(m => {
            const prog    = Math.min(mProgress[m.id], m.total);
            const done    = prog >= m.total;
            const claimed = mClaimed[m.id];
            const pct     = Math.min(100, Math.round(prog / m.total * 100));
            let actionHtml = '';
            if (done && !claimed) {
                actionHtml = `<button class="mission-claim-btn" onclick="claimMission('${m.id}',this,${m.coins},${m.diamonds})">✅ Revendica Recompensa</button>`;
            } else if (claimed) {
                actionHtml = `<div class="mission-claimed-txt">✔ Revendicat</div>`;
            }
            return `<div class="lp-mission${done ? ' lp-mission-done' : ''}${claimed ? ' lp-mission-claimed' : ''}" id="mission-${m.id}">
                <div class="lp-mission-name">
                    <span>${claimed ? '🏅' : done ? '🎯' : '⚪'} ${m.name}</span>
                    <span class="lp-mission-reward">${m.rewardTxt}</span>
                </div>
                <div class="lp-mission-bar"><div class="lp-mission-fill" style="width:${pct}%"></div></div>
                <div class="lp-mission-prog">${prog} / ${m.total}</div>
                ${actionHtml}
            </div>`;
        }).join('');
    }

    loadMiniLeaderboard();
    startEventTimer();
    updateOnlineCounter();
    switchLobbyTab('center');
}

async function claimMission(missionId, btn, coinsReward, diamondsReward) {
    if (!currentNickname || !sessionToken) return;
    btn.disabled = true;
    btn.textContent = '⏳ ...';
    try {
        const res = await fetch('/api/missions/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, token: sessionToken, missionId })
        });
        const data = await res.json();
        if (!data.ok) { btn.disabled = false; btn.textContent = '✅ Revendica Recompensa'; return; }

        // Actualizeaza profilul
        if (currentProfile) {
            currentProfile.coins    = data.coins;
            currentProfile.diamonds = data.diamonds;
            if (currentProfile.missions) currentProfile.missions[missionId + 'Claimed'] = true;
        }

        // Animatie monede
        const coinEl  = document.getElementById('lp-coins');
        const diamEl  = document.getElementById('lp-crystals');
        spawnCoinFly(btn, coinEl, coinsReward, '🪙');
        if (diamondsReward > 0) setTimeout(() => spawnCoinFly(btn, diamEl, diamondsReward, '💎'), 300);

        // Marcheaza misiunea ca revendicata
        const missionDiv = document.getElementById('mission-' + missionId);
        if (missionDiv) {
            missionDiv.classList.add('lp-mission-claimed');
            const claimBtn = missionDiv.querySelector('.mission-claim-btn');
            if (claimBtn) claimBtn.outerHTML = '<div class="mission-claimed-txt">✔ Revendicat</div>';
        }
        setTimeout(() => {
            const _set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            _set('lp-coins',    data.coins.toLocaleString());
            _set('lp-crystals', data.diamonds);
        }, 900);
    } catch { btn.disabled = false; btn.textContent = '✅ Revendica Recompensa'; }
}

function spawnCoinFly(fromEl, toEl, amount, icon) {
    if (!fromEl || !toEl) return;
    const fromR = fromEl.getBoundingClientRect();
    const toR   = toEl.getBoundingClientRect();
    const count = Math.min(amount, 8);
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.textContent = icon;
            el.style.cssText = `position:fixed;z-index:99999;font-size:1.3rem;pointer-events:none;
                left:${fromR.left + fromR.width/2}px;top:${fromR.top + fromR.height/2}px;
                transition:all 0.7s cubic-bezier(.2,.8,.4,1);opacity:1;`;
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
                el.innerHTML = '<div style="color:var(--dim);font-size:.7rem;text-align:center;padding:10px 0">Niciun jucator</div>';
                return;
            }
            el.innerHTML = rows.map((row, i) => {
                const medals = ['🥇','🥈','🥉'];
                const medal  = medals[i] || (i + 1);
                const cls    = i < 3 ? ' r' + (i + 1) : '';
                return `<div class="lp-lb-row">
                    <span class="lp-lb-rank${cls}">${medal}</span>
                    <span class="lp-lb-nick">${row.nickname}</span>
                    <span class="lp-lb-val">${row.wins_total}W</span>
                </div>`;
            }).join('');
        })
        .catch(() => {
            if (el) el.innerHTML = '<div style="color:var(--dim);font-size:.7rem;text-align:center;padding:10px 0">Indisponibil</div>';
        });
}

function startEventTimer() {
    const el = document.getElementById('lp-event-timer');
    if (!el) return;
    if (_eventTimerInterval) clearInterval(_eventTimerInterval);
    const now       = new Date();
    const target    = new Date(now);
    const daysToSat = (6 - now.getDay() + 7) % 7 || 7;
    target.setDate(now.getDate() + daysToSat);
    target.setHours(20, 0, 0, 0);
    function tick() {
        const diff = target - Date.now();
        if (diff <= 0) { el.textContent = 'ACUM!'; clearInterval(_eventTimerInterval); return; }
        const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
        const m = String(Math.floor(diff % 3600000 / 60000)).padStart(2, '0');
        const s = String(Math.floor(diff % 60000 / 1000)).padStart(2, '0');
        el.textContent = h + ':' + m + ':' + s;
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
    } else if (which === 'friends') {
        openFriendsPanel();
        // deactivate tab highlight — it just opens the overlay
        if (btn) btn.classList.remove('active');
    }

    const body = document.querySelector('.lobby-body');
    if (body) body.scrollTop = 0;
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
    if (goTitle) goTitle.textContent = '💀 ELIMINAT!';
    if (goMsg)   goMsg.textContent   = 'Ai fost eliminat din arena';
    if (goStats) goStats.style.display = 'none';
    const rematchBtn = document.getElementById('btn-rematch');
    if (rematchBtn) { rematchBtn.disabled = false; rematchBtn.textContent = '🔄 JOACA DIN NOU'; }

    // --- Reset input camera din lobby ---
    const codeInput = document.getElementById('room-code-input');
    if (codeInput) codeInput.value = '';
    const roomErrMsg = document.getElementById('room-error-msg');
    if (roomErrMsg) roomErrMsg.textContent = '';
    const errMsg = document.getElementById('error-msg');
    if (errMsg) errMsg.textContent = '';

    pendingRoom = null;

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
    status.textContent   = '⏳ Se incarca...';
    tbody.innerHTML      = '';
    try {
        const res  = await fetch('/api/leaderboard');
        const data = await res.json();
        renderLeaderboardOverlay(data);
    } catch {
        status.textContent = '⚠️ Eroare la incarcare.';
    }
}

function renderLeaderboardOverlay(data) {
    const status = document.getElementById('lbo-status');
    const tbody  = document.getElementById('lbo-body');
    if (!data || data.length === 0) {
        tbody.innerHTML    = '';
        status.textContent = '🎮 Niciun jucator inregistrat inca.';
        status.style.display = 'block';
        return;
    }
    status.style.display = 'none';
    const medals = ['🥇','🥈','🥉'];
    tbody.innerHTML = data.map((p, i) => {
        const kRate   = p.games_played > 0 ? (p.kills_total / p.games_played).toFixed(1) : '0.0';
        const rankStr = i < 3 ? medals[i] : `#${i + 1}`;
        const rowCls  = i < 3 ? `top-${i + 1}` : '';
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
        errEl.textContent = '⚠️ Adauga imaginea personajului tau!';
        return;
    }
    errEl.textContent = '';
    pendingRoom = { action: 'create' };
    joinGame();
}

// Intra cu cod
function startJoin() {
    const code  = (document.getElementById('room-code-input').value || '').trim().toUpperCase();
    const roomErr = document.getElementById('room-error-msg');
    const errEl   = document.getElementById('error-msg');
    if (code.length !== 5) {
        roomErr.textContent = '⚠️ Codul trebuie sa aiba 5 litere.';
        return;
    }
    const preview = document.getElementById('preview');
    if (!preview || !preview.src || preview.style.display === 'none') {
        errEl.textContent = '⚠️ Adauga imaginea personajului tau!';
        return;
    }
    roomErr.textContent = '';
    errEl.textContent = '';
    pendingRoom = { action: 'join', code };
    joinGame();
}

document.addEventListener('DOMContentLoaded', () => {
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
    if (ptEl)   ptEl.style.color   = remaining === 0 ? '#e94560' : '#00ff88';
    const valHp  = document.getElementById('val-hp');
    const valDmg = document.getElementById('val-dmg');
    const valSpd = document.getElementById('val-spd');
    const barHp  = document.getElementById('bar-hp');
    const barDmg = document.getElementById('bar-dmg');
    const barSpd = document.getElementById('bar-spd');
    if (valHp)  valHp.textContent  = (500 + stats.hp  * 40) + ' HP';
    if (valDmg) valDmg.textContent = (10  + stats.dmg *  4) + ' DMG';
    if (valSpd) valSpd.textContent = (2.5 + stats.spd * 0.3).toFixed(1) + ' SPD';
    if (barHp)  barHp.style.width  = (stats.hp  / 10 * 100) + '%';
    if (barDmg) barDmg.style.width = (stats.dmg / 10 * 100) + '%';
    if (barSpd) barSpd.style.width = (stats.spd / 10 * 100) + '%';
}

function updateBuildType() {
    const buildEl = document.getElementById('build-type');
    const max = Math.max(stats.hp, stats.dmg, stats.spd);
    let text = '';
    if (stats.hp === stats.dmg && stats.dmg === stats.spd) text = '⚖️ Build Echilibrat';
    else if (stats.hp  === max && stats.hp  >= 4) text = '🛡️ Tank — Rezistent dar lent';
    else if (stats.dmg === max && stats.dmg >= 4) text = '💥 Sniper — Lovesti tare dar fragil';
    else if (stats.spd === max && stats.spd >= 4) text = '⚡ Runner — Super rapid dar slab';
    else text = '🎯 Build Mixt';
    buildEl.textContent = text;
}

// (image upload replaced by character shop system)

// ---------- INTRA IN JOC ----------
function joinGame() {
    const name = currentNickname;
    if (!name) return;
    const char     = getSelectedCharacter();
    const imageUrl = char.img;

    if (currentNickname && currentPassword) {
        fetch('/api/profile/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, password: currentPassword, stat_hp: stats.hp, stat_dmg: stats.dmg, stat_spd: stats.spd })
        }).catch(() => {});
    }

    goFullscreen();
    stopLobbyBackground();
    document.getElementById('screen-lobby').style.display   = 'none';
    document.getElementById('screen-waiting').style.display = 'flex';
    initGame(name, imageUrl, stats, pendingRoom);
}

// ---------- FULLSCREEN ----------
function goFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen)       el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
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
// Preîncarcă toate proiectilele unice
CHARACTERS.forEach(c => _getBulletImg(c.bullet || '/assets/bullets/ninja_bullet.png'));
const defaultBulletImg = _getBulletImg('/assets/bullets/ninja_bullet.png');

const PLAYER_SPRITE_SIZE = 90;

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
function initGame(playerName, playerImage, playerStats, roomAction) {
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
    const socket = _sessionSocket || io();
    _sessionSocket = null;

    const playerData = { name: playerName, image: playerImage, stats: playerStats, xp: currentProfile?.xp || 0 };

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
        document.getElementById('room-error-msg').textContent   = '⚠️ ' + msg;
        socket.disconnect();
    });

    const playerImages = {};
    socket.on('player-image', (data) => {
        if (!playerImages[data.id]) {
            const img = new Image();
            img.src = data.image;
            const charDef = CHARACTERS.find(c => data.image === c.img);
            const bulletSrc = charDef?.bullet || '/assets/bullets/ninja_bullet.png';
            playerImages[data.id] = { img, scale: charDef?.scale || 1.0, bulletImg: _getBulletImg(bulletSrc), bulletScale: charDef?.bulletScale || 1.0 };
        }
    });

    socket.on('waiting-room', ({ players: playerList, hostId } = {}) => {
        if (!playerList) return;
        const grid = document.getElementById('waiting-players');
        grid.innerHTML = '';
        playerList.forEach(p => {
            const pLevel = p.level || 1;
            const pTier  = getTier(pLevel);
            const card = document.createElement('div');
            card.className = 'waiting-card';
            card.innerHTML = `
                <div class="waiting-card-av">
                    <img src="${p.image}" onerror="this.style.background='#e8a020';this.src=''"
                         style="border:3px solid ${pTier.color};box-shadow:0 0 14px ${pTier.glow}">
                    <span class="waiting-lv-badge" style="background:${pTier.color};color:#000">LV ${pLevel}</span>
                </div>
                <span>${p.name}</span>
            `;
            grid.appendChild(card);
        });
        document.getElementById('waiting-count').textContent = playerList.length;
        const amHost = hostId === socket.id;
        document.getElementById('btn-start-game').style.display  = amHost ? 'block' : 'none';
        document.getElementById('waiting-sub-msg').style.display = amHost ? 'none'  : 'block';
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
        const tick = setInterval(() => {
            n--;
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
                }, 700);
            }
        }, 1000);
    }

    socket.on('game-start', (data) => {
        if (gameControl.setObstacles) gameControl.setObstacles((data && data.obstacles) || []);
        if (data && data.zoneStartsAt) gameControl.zoneStartsAt = data.zoneStartsAt;
        if (data && data.playersMeta) gameControl.pendingMeta = data.playersMeta;
        document.getElementById('screen-waiting').style.display = 'none';
        document.getElementById('screen-game').style.display    = 'block';
        // Reset UI la fiecare inceput de meci nou
        document.getElementById('my-kills').textContent      = '0';
        document.getElementById('players-alive').textContent = '0';
        document.getElementById('kill-feed').innerHTML       = '';
        showCountdown();
        document.getElementById('btn-rematch').onclick = () => {
            socket.emit('rematch');
            const btn = document.getElementById('btn-rematch');
            btn.disabled = true;
            btn.textContent = '⏳ Asteptand...';
        };
        if (!gameLoopStarted) {
            gameLoopStarted = true;
            startGameLoop(socket, canvas, ctx, playerImages, gameControl, (data && data.obstacles) || []);
        } else if (gameControl.reset) {
            gameControl.reset();
        }
    });

    socket.on('game-reset', () => { location.reload(); });

    window._gameSocket = socket;
}

function startGame() {
    if (window._gameSocket) window._gameSocket.emit('start-game');
}

// ---------- BUCLA PRINCIPALA DE JOC ----------
function startGameLoop(socket, canvas, ctx, playerImages, gameControl, initialObstacles) {
    let obstacles = initialObstacles || [];
    gameControl.setObstacles = (obs) => { obstacles = obs; };

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
        joystickLeft = nipplejs.create({
            zone: document.getElementById('zone-left'),
            mode: 'dynamic', color: '#ffffff', size: joystickSize
        });
        joystickRight = nipplejs.create({
            zone: document.getElementById('zone-right'),
            mode: 'dynamic', color: '#e94560', size: joystickSize
        });
    }

    let moveDir      = { x: 0, y: 0 };
    let shootDir     = { x: 0, y: 0 };
    let isShooting   = false;
    let aimStartTime = null;
    let gameEnded    = false;
    let myAngle      = 0;
    let moveAngle    = 0;

    let isSpectating    = false;
    let spectateTargetId = null;
    let myElimData      = null;

    let predX = null, predY = null, predSpeed = 132; // px/sec (actualizat din meta)
    const stateBuffer  = []; // [{t, players:{id:{x,y,angle,hp,maxHp,alive,kills,name}}, bullets:[], zone:{}}]
    const playerMeta   = {}; // {id: {speed, maxHp, name}} — static per runda, trimis o data
    // Aplica metadata trimisa de server inainte ca startGameLoop sa fie apelat
    if (gameControl.pendingMeta) { Object.assign(playerMeta, gameControl.pendingMeta); delete gameControl.pendingMeta; }
    const hitEffects   = [];
    const prevHp         = {};
    const damageNumbers  = [];
    const obstacleShakes = {};
    const ammoState      = { ammo: 10, max: 10, reloading: false, reloadProgress: 1 };
    const pickupVisuals  = new Map();
    const pickupBursts   = [];
    const playerTrails   = new Map(); // id → [{x, y, born}]
    const bulletTrails   = new Map(); // id → [{x, y, t}]
    const flashTimers      = {}; // {playerId: timestamp} — flash rosu la primirea damage-ului
    const zombieFlashTimers = {}; // {zombieId: timestamp}
    const prevZombieHp     = {};

    let mouseActive = false;

    let lastMoveEmit   = 0;
    let lastShootEmit  = 0;
    let lastRotateEmit = 0;
    const EMIT_MS      = 50;   // max 20 update-uri/sec — matching server tick rate
    const INTERP_DELAY = 60;   // randam cu 60ms intarziere (un tick+) — mai putin mismatch vizual

    joystickLeft.on('move', (evt, data) => {
        if (gameEnded || gameControl.countdownActive) return;
        const now   = performance.now();
        const force = data.force || 0;
        if (force >= MOVE_THRESHOLD) {
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) {
                moveDir.x = data.vector.x / len;
                moveDir.y = -data.vector.y / len;
                moveAngle = Math.atan2(-moveDir.x, moveDir.y);
                if (!isShooting && !mouseActive && now - lastRotateEmit >= EMIT_MS) {
                    myAngle = moveAngle;
                    socket.emit('rotate', myAngle);
                    lastRotateEmit = now;
                }
            }
        } else {
            moveDir.x = 0; moveDir.y = 0;
        }
        if (now - lastMoveEmit >= EMIT_MS) {
            socket.emit('move', moveDir);
            lastMoveEmit = now;
        }
    });

    joystickLeft.on('end', () => {
        moveDir.x = 0; moveDir.y = 0;
        socket.emit('move', moveDir);
    });

    joystickRight.on('move', (evt, data) => {
        if (gameEnded || gameControl.countdownActive) return;
        const force = data.force || 0;
        if (force >= SHOOT_THRESHOLD) {
            const now = performance.now();
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) { shootDir.x = data.vector.x / len; shootDir.y = -data.vector.y / len; }
            if (!isShooting) {
                isShooting = true;
                aimStartTime = now;
            }
            myAngle = Math.atan2(data.vector.y, -data.vector.x) + Math.PI / 2;
            if (now - lastRotateEmit >= EMIT_MS) {
                socket.emit('rotate', myAngle);
                lastRotateEmit = now;
            }
            // Shoot emit is handled in the draw loop after the 0.5s aim delay
        } else {
            if (isShooting) {
                isShooting = false;
                aimStartTime = null;
                socket.emit('stop-shoot');
            }
        }
    });

    joystickRight.on('end', () => {
        if (isShooting) {
            isShooting = false;
            aimStartTime = null;
            socket.emit('stop-shoot');
        }
        if (!mouseActive && (moveDir.x !== 0 || moveDir.y !== 0)) {
            myAngle = moveAngle;
            socket.emit('rotate', myAngle);
        }
    });

    // ---------- WASD + MOUSE ----------
    const keysHeld = new Set();

    let lastSentMove = { x: 0, y: 0 };

    function updateKeyMove() {
        const now = performance.now();
        let dx = 0, dy = 0;
        if (keysHeld.has('w') || keysHeld.has('arrowup'))    dy -= 1;
        if (keysHeld.has('s') || keysHeld.has('arrowdown'))  dy += 1;
        if (keysHeld.has('a') || keysHeld.has('arrowleft'))  dx -= 1;
        if (keysHeld.has('d') || keysHeld.has('arrowright')) dx += 1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            moveDir.x = dx / len; moveDir.y = dy / len;
            moveAngle = Math.atan2(-moveDir.x, moveDir.y);
            if (!isShooting && !mouseActive && now - lastRotateEmit >= EMIT_MS) {
                myAngle = moveAngle;
                socket.emit('rotate', myAngle);
                lastRotateEmit = now;
            }
        } else {
            moveDir.x = 0; moveDir.y = 0;
        }
        // Trimite doar cand directia s-a schimbat (nu la fiecare tasta)
        if (moveDir.x !== lastSentMove.x || moveDir.y !== lastSentMove.y) {
            socket.emit('move', moveDir);
            lastSentMove.x = moveDir.x;
            lastSentMove.y = moveDir.y;
        }
    }

    // Handleri numiti — necesari pentru removeEventListener la cleanup
    const onKeyDown = (e) => {
        if (gameEnded || gameControl.countdownActive) return;
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
        const now = performance.now();
        if (!gameEnded && !gameControl.countdownActive && now - lastRotateEmit >= EMIT_MS) {
            socket.emit('rotate', myAngle);
            lastRotateEmit = now;
        }
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
        if (e.pointerType !== 'mouse' || e.button !== 0 || gameEnded || gameControl.countdownActive) return;
        isShooting = true;
        aimStartTime = performance.now();
        shootDir.x = -Math.sin(myAngle);
        shootDir.y =  Math.cos(myAngle);
        // Shoot emit delayed — handled in draw loop after 0.5s
    };
    const onPointerUp = (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        isShooting = false;
        aimStartTime = null;
        socket.emit('stop-shoot');
        if (moveDir.x !== 0 || moveDir.y !== 0) {
            myAngle = moveAngle;
            socket.emit('rotate', myAngle);
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
        canvas.removeEventListener('pointermove',  onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        canvas.removeEventListener('pointerdown',  onPointerDown);
        canvas.removeEventListener('pointerup',    onPointerUp);
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        moveDir.x = 0; moveDir.y = 0;
        isShooting = false;
        aimStartTime = null;
        gameEnded = false;
    };

    // ---------- STAREA JOCULUI ----------
    let lastGameStateTime = 0;
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

    // gs: [pArr, bArr, zArr, ammoArr, zombieArr, itemArr]
    // pArr: [id, x, y, angle, hp, alive, kills]  — name/maxHp in playerMeta
    // bArr: [id, x, y, dirX, dirY]
    // zArr: [x, y, radius, shrinking]
    // ammoArr: [ammo, maxAmmo, reloading, reloadProgress] - doar pentru jucatorul local
    socket.on('gs', ([pArr, bArr, zArr, ammoArr, zombieArr = [], itemArr = []]) => {
        const now = performance.now();
        if (ammoArr) {
            ammoState.ammo = Math.max(0, ammoArr[0] || 0);
            ammoState.max = Math.max(1, ammoArr[1] || 10);
            ammoState.reloading = !!ammoArr[2];
            ammoState.reloadProgress = Math.max(0, Math.min(1, ammoArr[3] ?? 1));
        }
        const entry = {
            t:       now,
            players: {},
            bullets: bArr.map(([id, x, y, dx, dy, ownerId]) => ({ id, x, y, dx, dy, ownerId, radius: 6 })),
            zombies: zombieArr.map(([id, x, y, hp, maxHp, angle]) => ({ id, x, y, hp, maxHp, angle: angle || 0 })),
            pickups: itemArr.map(([id, x, y]) => ({ id, x, y })),
            zone:    { x: zArr[0], y: zArr[1], radius: zArr[2], shrinking: !!zArr[3] }
        };

        entry.pickups.forEach(item => {
            if (!pickupVisuals.has(item.id)) pickupVisuals.set(item.id, { born: now });
        });
        const activePickups = new Set(entry.pickups.map(item => item.id));
        for (const id of pickupVisuals.keys()) {
            if (!activePickups.has(id)) pickupVisuals.delete(id);
        }

        pArr.forEach(([id, x, y, angle, hp, alive, kills]) => {
            const meta = playerMeta[id] || {};
            entry.players[id] = { id, x, y, angle, hp, maxHp: meta.maxHp || 500, alive: !!alive, kills, name: meta.name || '' };
        });

        stateBuffer.push(entry);
        while (stateBuffer.length > 20) stateBuffer.shift();
        lastGameStateTime = now;

        const me = entry.players[socket.id];
        if (me) {
            const meta = playerMeta[socket.id];
            if (meta && meta.speed) predSpeed = meta.speed;
            if (predX === null || isNaN(predX) || isNaN(predY)) {
                predX = me.x; predY = me.y;
            } else {
                const dist = Math.hypot(me.x - predX, me.y - predY);
                if (dist > 120) {
                    predX = me.x; predY = me.y;
                } else if (dist > 1) {
                    predX += (me.x - predX) * 0.18;
                    predY += (me.y - predY) * 0.18;
                }
            }
            const newKills  = me.kills || 0;
            const prevKills = parseInt(myKillsEl.textContent) || 0;
            if (newKills > prevKills && !gameControl.countdownActive) showKillNotif(newKills);
            myKillsEl.textContent = newKills;
        }

        document.getElementById('players-alive').textContent =
            Object.values(entry.players).filter(p => p.alive).length;

        Object.values(entry.players).forEach(p => {
            if (prevHp[p.id] !== undefined && prevHp[p.id] - p.hp > 1) {
                hitEffects.push({ x: p.x, y: p.y, life: 2.0 });
                flashTimers[p.id] = performance.now();
            }
            prevHp[p.id] = p.hp;
        });

        entry.zombies.forEach(z => {
            if (prevZombieHp[z.id] !== undefined && prevZombieHp[z.id] - z.hp > 1)
                zombieFlashTimers[z.id] = performance.now();
            prevZombieHp[z.id] = z.hp;
        });
    });

    socket.on('obstacle-hit', ({ idx }) => {
        obstacleShakes[idx] = performance.now();
    });

    socket.on('damage-dealt', ({ amount, x, y }) => {
        damageNumbers.push({ amount, x, y, dir: Math.random() > 0.5 ? 1 : -1, startTime: performance.now() });
    });

    socket.on('zombie-hit', ({ amount, x, y }) => {
        damageNumbers.push({ amount, x, y, dir: 0, startTime: performance.now() });
    });

    socket.on('pickup-collected', ({ id, x, y, heal }) => {
        pickupVisuals.delete(id);
        pickupBursts.push({ x, y, heal: heal || 0, startTime: performance.now() });
    });

    socket.on('kill-event', ({ killerName, victimName, byZone }) => {
        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        entry.textContent = byZone
            ? `☠️ ${victimName} a fost eliminat de zona`
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
        const alive = state ? Object.values(state.players).filter(p => p.alive && p.id !== socket.id) : [];
        if (alive.length === 0) return;
        spectateTargetId = alive[0].id;
        isSpectating = true;
        document.getElementById('screen-gameover').style.display = 'none';
        document.getElementById('spectator-hud').style.display   = 'flex';
    };

    window._specCycle = function (dir) {
        const state = getInterpolatedState();
        if (!state) return;
        const alive = Object.values(state.players).filter(p => p.alive && p.id !== socket.id);
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
        gameEnded = true;
        moveDir.x = 0; moveDir.y = 0; isShooting = false; aimStartTime = null;
        socket.emit('move', { x: 0, y: 0 });
        socket.emit('stop-shoot');
        myElimData = { placement, totalPlayers, killedBy, kills };
        setTimeout(() => {
            const medals = { 2: '🥈', 3: '🥉' };
            const medal  = medals[placement] || '';
            document.getElementById('gameover-title').textContent =
                `${medal} LOC ${placement} DIN ${totalPlayers}`;
            document.getElementById('gameover-msg').textContent = killedBy
                ? `Eliminat de ${killedBy}`
                : 'Eliminat de zona ☠️';
            document.getElementById('stat-round-kills').textContent = kills || 0;
            document.getElementById('round-stats-section').style.display = 'block';
            // Arata spectate doar daca raman cel putin 2 jucatori (altfel jocul tocmai s-a terminat)
            const specBtn = document.getElementById('btn-spectate');
            if (specBtn) specBtn.style.display = placement > 2 ? 'block' : 'none';
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 2000);
    });

    socket.on('winner', ({ kills } = {}) => {
        gameEnded = true;
        moveDir.x = 0; moveDir.y = 0; isShooting = false; aimStartTime = null;
        socket.emit('move', { x: 0, y: 0 });
        socket.emit('stop-shoot');
        setTimeout(() => {
            document.getElementById('gameover-title').textContent = '🏆 LOC 1 — AI CASTIGAT!';
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
        gameEnded  = false;
        predX      = null; predY = null;
        isShooting = false;
        aimStartTime = null;
        moveDir.x  = 0; moveDir.y  = 0;
        shootDir.x = 0; shootDir.y = 0;
        myAngle = 0; moveAngle = 0; lastTime = 0;
        stateBuffer.length = 0;
        lastSentMove.x = 0; lastSentMove.y = 0;
        for (const k in prevHp) delete prevHp[k];
        hitEffects.length = 0;
        damageNumbers.length = 0;
        pickupBursts.length = 0;
        pickupVisuals.clear();
        playerTrails.clear();
        bulletTrails.clear();
        for (const k in obstacleShakes) delete obstacleShakes[k];
        for (const k in flashTimers)       delete flashTimers[k];
        for (const k in zombieFlashTimers) delete zombieFlashTimers[k];
        for (const k in prevZombieHp)      delete prevZombieHp[k];
        ammoState.ammo = 10;
        ammoState.max = 10;
        ammoState.reloading = false;
        ammoState.reloadProgress = 1;
        killFeedEl.innerHTML = '';
        myKillsEl.textContent = '0';
        document.getElementById('kill-notif').classList.remove('active');
        keysHeld.clear();
        document.getElementById('round-stats-section').style.display = 'none';
        document.getElementById('gameover-title').textContent = '💀 ELIMINAT!';
        document.getElementById('gameover-msg').textContent   = 'Ai fost eliminat din arena';
        const specBtn = document.getElementById('btn-spectate');
        if (specBtn) specBtn.style.display = 'none';
        exitSpectating();
        myElimData = null;
    }
    gameControl.reset = resetForNewGame;

    socket.on('rematch-vote', ({ count, total }) => {
        const btn = document.getElementById('btn-rematch');
        btn.textContent = `🔄 JOACA DIN NOU (${count}/${total})`;
    });

    socket.on('game-rematch', ({ isHost, obstacles: newObs, playersMeta }) => {
        if (newObs) obstacles = newObs;
        if (playersMeta) Object.assign(playerMeta, playersMeta);
        resetForNewGame();
        const btn = document.getElementById('btn-rematch');
        btn.disabled    = false;
        btn.textContent = '🔄 JOACA DIN NOU';
        document.getElementById('screen-gameover').style.display = 'none';
        document.getElementById('screen-game').style.display     = 'none';
        document.getElementById('screen-waiting').style.display  = 'flex';
        document.getElementById('btn-start-game').style.display  = isHost ? 'block' : 'none';
        document.getElementById('waiting-sub-msg').style.display = isHost ? 'none'  : 'block';
    });

    function drawAmmoBar(ctx, x, y, width, height, state) {
        const maxAmmo = Math.max(1, state.max || 10);
        const gap = 2;
        const segW = (width - gap * (maxAmmo - 1)) / maxAmmo;
        const progressUnits = state.reloading
            ? Math.max(0, Math.min(maxAmmo, state.reloadProgress * maxAmmo))
            : Math.max(0, Math.min(maxAmmo, state.ammo));

        ctx.save();
        ctx.fillStyle = '#00000070';
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 2);
        ctx.fill();

        for (let i = 0; i < maxAmmo; i++) {
            const sx = x + i * (segW + gap);
            const fillPart = Math.max(0, Math.min(1, progressUnits - i));
            ctx.fillStyle = '#5a4a14';
            ctx.beginPath();
            ctx.roundRect(sx, y, segW, height, 1.5);
            ctx.fill();

            if (fillPart > 0) {
                ctx.fillStyle = state.reloading ? '#ffd95a' : '#ffcc22';
                ctx.beginPath();
                ctx.roundRect(sx, y, segW * fillPart, height, 1.5);
                ctx.fill();
            }
        }
        ctx.strokeStyle = state.reloading ? '#fff2a0cc' : '#ffcc2266';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawZombie(ctx, z, now) {
        const R = 19;
        const sides = 7;
        const polyRot = (z.id * 1.91) % (Math.PI * 2);
        const wobble = Math.sin(now * 0.003 + z.id * 2.7) * 1.5;

        function poly(cx, cy, r, n, angle) {
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + angle;
                if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                else         ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.closePath();
        }

        // Cerc rosu exterior — desenat primul, sub corp
        ctx.save();
        ctx.translate(z.x, z.y + wobble);
        ctx.beginPath();
        ctx.arc(0, 0, R + 8, 0, Math.PI * 2);
        ctx.fillStyle = '#e94560';
        ctx.globalAlpha = 0.13;
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();

        ctx.save();
        ctx.translate(z.x, z.y + wobble);

        // Rotatie dupa directia de miscare (angle=0 → merge spre dreapta → +X = inainte)
        ctx.rotate(z.angle);

        // Brate intinse in fata — doua stubs pe axa +X (directia de mers)
        ctx.fillStyle = '#1e4010';
        ctx.strokeStyle = '#0a1a04';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(R + 1, -11, 13, 8); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(R + 1,   3, 13, 8); ctx.fill(); ctx.stroke();

        // Head outline
        ctx.fillStyle = '#0a1a04';
        poly(0, 0, R + 3, sides, polyRot);
        ctx.fill();

        // Head main
        ctx.fillStyle = '#2e6614';
        poly(0, 0, R, sides, polyRot);
        ctx.fill();

        // Head highlight
        ctx.fillStyle = '#4a9a20';
        poly(-4, -4, R * 0.50, sides, polyRot + 0.5);
        ctx.fill();

        // HP bar (fara rotatie — mereu orizontal)
        ctx.restore();
        ctx.save();
        ctx.translate(z.x, z.y + wobble);
        const hpRatio = Math.max(0, z.hp / z.maxHp);
        const barW = 44, barH = 4;
        ctx.fillStyle = '#00000080';
        ctx.fillRect(-barW / 2, -R - 15, barW, barH);
        ctx.fillStyle = '#55dd22';
        ctx.fillRect(-barW / 2, -R - 15, barW * hpRatio, barH);

        // Flash rosu cand primeste damage
        const flashAge = zombieFlashTimers[z.id] !== undefined
            ? performance.now() - zombieFlashTimers[z.id] : Infinity;
        if (flashAge < 280) {
            ctx.globalAlpha = (1 - flashAge / 280) * 0.65;
            ctx.fillStyle = '#ff2020';
            ctx.beginPath();
            ctx.arc(0, 0, R + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    function drawHealthPickup(ctx, item, now) {
        const visual = pickupVisuals.get(item.id) || { born: now };
        const age = now - visual.born;

        // Drop: cade 48px in 500ms cu un mic bounce (overshoot)
        const dropT = Math.min(age / 500, 1);
        const ease = dropT < 0.75
            ? dropT / 0.75
            : 1 + Math.sin((dropT - 0.75) / 0.25 * Math.PI) * 0.18;
        const dropY = item.y - (1 - ease) * 48;

        // Idle: bob lent + rotatie lenta
        const idleY  = Math.sin(now * 0.0025 + item.id * 1.4) * 3.5;
        const idleRot = now * 0.00045 + item.id * 0.9;
        const scale  = dropT < 0.1 ? dropT * 10 : 1;
        const y      = dropY + (dropT >= 1 ? idleY : 0);

        function hexPath(r) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + idleRot;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
        }

        ctx.save();
        ctx.translate(item.x, y);
        ctx.scale(scale, scale);

        // Glow pulsant (idle only)
        if (dropT >= 1) {
            const glow = 0.14 + Math.sin(now * 0.004 + item.id) * 0.06;
            ctx.globalAlpha = glow;
            ctx.fillStyle = '#ff3355';
            hexPath(26);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Drop ring
        if (dropT < 1) {
            ctx.globalAlpha = (1 - dropT) * 0.85;
            ctx.strokeStyle = '#ff5577';
            ctx.lineWidth = 2.5;
            hexPath(30 + dropT * 18);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Corp hexagonal — contur
        ctx.fillStyle = '#1a0008';
        hexPath(17);
        ctx.fill();

        // Corp hexagonal — umplere
        ctx.fillStyle = '#8a1030';
        hexPath(14);
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#c02040';
        hexPath(8);
        ctx.fill();

        // Cruce alba
        ctx.fillStyle = '#ffd0d8';
        ctx.fillRect(-2.5, -8, 5, 16);
        ctx.fillRect(-8, -2.5, 16, 5);

        ctx.restore();
    }

    function drawPickupBursts(ctx, now) {
        for (let i = pickupBursts.length - 1; i >= 0; i--) {
            const b = pickupBursts[i];
            const t = (now - b.startTime) / 900;
            if (t >= 1) { pickupBursts.splice(i, 1); continue; }
            ctx.save();
            ctx.translate(b.x, b.y - t * 40);
            ctx.globalAlpha = 1 - t;

            // Inel hexagonal care se extinde
            ctx.strokeStyle = '#ff3355';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let s = 0; s < 6; s++) {
                const a = (s / 6) * Math.PI * 2;
                const rr = 16 + t * 38;
                if (s === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
                else         ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.stroke();

            ctx.font = `bold ${17 + t * 7}px Lexend, Arial`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffb8c4';
            ctx.strokeStyle = '#3a0010cc';
            ctx.lineWidth = 3;
            const label = b.heal > 0 ? `+${b.heal} HP` : '+HP';
            ctx.strokeText(label, 0, -22);
            ctx.fillText(label, 0, -22);
            ctx.restore();
        }
    }

    // ---------- INTERPOLARE STATE ----------
    function getInterpolatedState() {
        if (stateBuffer.length === 0) return null;
        const renderTime = performance.now() - INTERP_DELAY;

        let prev = null, next = null;
        for (let i = 0; i < stateBuffer.length; i++) {
            if (stateBuffer[i].t <= renderTime) prev = stateBuffer[i];
            else { next = stateBuffer[i]; break; }
        }

        if (!prev) return stateBuffer[0];
        if (!next) return prev; // folosim ultimul state daca suntem in fata

        const span = Math.max(next.t - prev.t, 1);
        const t    = Math.min((renderTime - prev.t) / span, 1);

        const players = {};
        for (const id in prev.players) {
            const p0 = prev.players[id];
            const p1 = next.players[id];
            if (p1) {
                // Interpolare unghi cu wrap corect (evita rotatie 360° la schimbare semn)
                let da = p1.angle - p0.angle;
                if (da >  Math.PI) da -= Math.PI * 2;
                if (da < -Math.PI) da += Math.PI * 2;
                players[id] = {
                    id, name: p1.name,
                    x:     p0.x + (p1.x - p0.x) * t,
                    y:     p0.y + (p1.y - p0.y) * t,
                    angle: p0.angle + da * t,
                    hp:    p1.hp, maxHp: p1.maxHp,
                    alive: p1.alive, kills: p1.kills
                };
            } else {
                players[id] = { ...p0 };
            }
        }
        for (const id in next.players) {
            if (!players[id]) players[id] = { ...next.players[id] };
        }

        const prevZombies = new Map((prev.zombies || []).map(z => [z.id, z]));
        const zombies = (next.zombies || []).map(z1 => {
            const z0 = prevZombies.get(z1.id);
            if (!z0) return { ...z1 };
            let da = z1.angle - z0.angle;
            if (da >  Math.PI) da -= Math.PI * 2;
            if (da < -Math.PI) da += Math.PI * 2;
            return {
                ...z1,
                x: z0.x + (z1.x - z0.x) * t,
                y: z0.y + (z1.y - z0.y) * t,
                angle: z0.angle + da * t
            };
        });

        // Interpoleaza gloantele dupa ID intre prev si next (evita 120px salturi la 50ms)
        const nextBulletMap = {};
        for (const b of next.bullets) nextBulletMap[b.id] = b;

        const bullets = [];
        for (const b0 of prev.bullets) {
            const b1 = nextBulletMap[b0.id];
            if (b1) {
                bullets.push({ ...b1, x: b0.x + (b1.x - b0.x) * t, y: b0.y + (b1.y - b0.y) * t });
                delete nextBulletMap[b0.id];
            }
            // gloante moarte intre prev→next dispar natural
        }
        // Gloante noi (nu existau in prev): le retragem cu un tick ca sa apara din spawn,
        // nu teleportate deja 90px in fata. Interpolarea normala le misca de acolo inainte.
        const tickSec = span / 1000;
        for (const id in nextBulletMap) {
            const b = nextBulletMap[id];
            bullets.push({
                ...b,
                x: b.x - b.dx * 1800 * tickSec,
                y: b.y - b.dy * 1800 * tickSec
            });
        }

        return { players, bullets, zombies, pickups: next.pickups || [], zone: next.zone };
    }

    // ---------- TRAIL JUCATORI ----------
    const TRAIL_LIFE     = 1300;
    const TRAIL_MIN_DIST = 22;

    function samplePlayerTrails(players, myId, myPredX, myPredY, now) {
        for (const [id, p] of Object.entries(players)) {
            if (!p.alive) { playerTrails.delete(id); continue; }
            const sx = (id === myId && myPredX !== null) ? myPredX : p.x;
            const sy = (id === myId && myPredY !== null) ? myPredY : p.y;
            let trail = playerTrails.get(id);
            if (!trail) { trail = []; playerTrails.set(id, trail); }
            const last = trail[trail.length - 1];
            if (!last || Math.hypot(sx - last.x, sy - last.y) >= TRAIL_MIN_DIST) {
                trail.push({ x: sx, y: sy, born: now });
            }
            const cutoff = now - TRAIL_LIFE;
            while (trail.length > 0 && trail[0].born < cutoff) trail.shift();
        }
        for (const id of playerTrails.keys()) {
            if (!players[id]) playerTrails.delete(id);
        }
    }

    function drawPlayerTrails(ctx, now, myId) {
        for (const [id, trail] of playerTrails) {
            const color = id === myId ? '#00ff88' : '#ff8c00';
            for (const step of trail) {
                const age = now - step.born;
                const alpha = (1 - age / TRAIL_LIFE) * 0.28;
                if (alpha <= 0) continue;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(step.x, step.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    // ---------- BUCLA DE RANDARE ----------
    let lastTime  = 0;
    function draw(timestamp) {
        rafId = requestAnimationFrame(draw);

        const dpr  = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const W    = canvas.width  / dpr;
        const H    = canvas.height / dpr;
        const ZOOM = Math.min(W / VIEW_W, H / VIEW_H);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const rState = getInterpolatedState();
        if (!rState) { lastTime = timestamp; return; }

        const dtSec = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
        lastTime = timestamp;

        if (predX !== null) {
            predX = Math.max(20, Math.min(ARENA_W - 20, predX + moveDir.x * predSpeed * dtSec));
            predY = Math.max(20, Math.min(ARENA_H - 20, predY + moveDir.y * predSpeed * dtSec));
            for (const obs of obstacles) {
                const dx = predX - obs.x, dy = predY - obs.y;
                const dist = Math.hypot(dx, dy);
                const minD = 30 + obs.radius;
                if (dist < minD && dist > 0) { predX = obs.x + (dx / dist) * minD; predY = obs.y + (dy / dist) * minD; }
            }
        }

        // Emit shoot dupa 0.5s aim delay (egal pe desktop si mobil)
        if (isShooting && !gameEnded && !gameControl.countdownActive && !ammoState.reloading && ammoState.ammo > 0) {
            const nowShoot = performance.now();
            if (aimStartTime && nowShoot - aimStartTime >= 500 && nowShoot - lastShootEmit >= EMIT_MS) {
                socket.emit('shoot', shootDir);
                lastShootEmit = nowShoot;
            }
        }

        const me = rState.players[socket.id];

        // Spectator: auto-switch daca tinta a murit, urmareste tinta vie
        if (isSpectating) {
            const aliveOthers = Object.values(rState.players).filter(p => p.alive && p.id !== socket.id);
            if (spectateTargetId && (!rState.players[spectateTargetId] || !rState.players[spectateTargetId].alive)) {
                spectateTargetId = aliveOthers.length > 0 ? aliveOthers[0].id : null;
            }
            const nameEl = document.getElementById('spec-target-name');
            const hpEl   = document.getElementById('spec-target-hp');
            const sp = spectateTargetId ? rState.players[spectateTargetId] : null;
            if (nameEl) nameEl.textContent = sp ? sp.name : '—';
            if (hpEl)   hpEl.textContent   = sp ? `❤ ${Math.ceil(Math.max(0, sp.hp))} / ${sp.maxHp}` : '';
        }

        const specTarget = isSpectating && spectateTargetId ? rState.players[spectateTargetId] : null;
        const camX = specTarget ? specTarget.x : (predX !== null ? predX : (me ? me.x : ARENA_W / 2));
        const camY = specTarget ? specTarget.y : (predY !== null ? predY : (me ? me.y : ARENA_H / 2));

        samplePlayerTrails(rState.players, socket.id, predX, predY, timestamp);

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(W / 2, H / 2);
        ctx.scale(ZOOM, ZOOM);
        ctx.translate(-camX, -camY);

        const visLeft   = camX - W / (2 * ZOOM);
        const visTop    = camY - H / (2 * ZOOM);
        const visRight  = visLeft + W / ZOOM;
        const visBottom = visTop  + H / ZOOM;

        // --- FUNDAL ---
        ctx.fillStyle = '#1c2b14';
        ctx.fillRect(visLeft, visTop, W / ZOOM, H / ZOOM);
        ctx.fillStyle = '#4a7c2f';
        ctx.fillRect(0, 0, ARENA_W, ARENA_H);

        // --- GRILA ---
        ctx.strokeStyle = 'rgba(20, 50, 10, 0.25)';
        ctx.lineWidth   = 1 / ZOOM;
        const gridSize  = 50;
        ctx.beginPath();
        for (let x = Math.floor(visLeft / gridSize) * gridSize; x < visRight; x += gridSize) {
            ctx.moveTo(x, visTop); ctx.lineTo(x, visBottom);
        }
        for (let y = Math.floor(visTop / gridSize) * gridSize; y < visBottom; y += gridSize) {
            ctx.moveTo(visLeft, y); ctx.lineTo(visRight, y);
        }
        ctx.stroke();

        ctx.strokeStyle = '#1a3a0a';
        ctx.lineWidth   = 8 / ZOOM;
        ctx.strokeRect(0, 0, ARENA_W, ARENA_H);

        // --- ZONA ---
        if (rState.zone) {
            const zone = rState.zone;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff4444cc';
            ctx.lineWidth   = 4 / ZOOM;
            ctx.stroke();
            ctx.beginPath();
            ctx.rect(visLeft, visTop, W / ZOOM, H / ZOOM);
            ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2, true);
            ctx.fillStyle = '#ff000030';
            ctx.fill();
        }

        // --- OBSTACOLE ---
        function drawConcavePoly(cx, cy, r, sides, concave, rot) {
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
        function drawHex(cx, cy, r, rot) {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + rot;
                if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                else         ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            }
            ctx.closePath();
        }

        obstacles.forEach((obs, idx) => {
            const { x: ox, y: oy, radius: r, type } = obs;
            if (ox + r < visLeft || ox - r > visRight || oy + r < visTop || oy - r > visBottom) return;
            const rot = ((ox * 7 + oy * 13) % 628) / 100;

            let sx = 0;
            if (obstacleShakes[idx] !== undefined) {
                const el = performance.now() - obstacleShakes[idx];
                const dur = 320;
                if (el < dur) {
                    sx = Math.sin(el * 0.13) * 2.5 * (1 - el / dur);
                } else {
                    delete obstacleShakes[idx];
                }
            }
            const x = ox + sx, y = oy;

            if (type === 'tree') {
                ctx.fillStyle = '#0e2e05';
                drawConcavePoly(x, y, r, 5, 0.72, rot);
                ctx.fill();
                ctx.fillStyle = '#1e5c0a';
                drawConcavePoly(x, y, r * 0.88, 5, 0.72, rot);
                ctx.fill();
                ctx.fillStyle = '#2e8a14';
                drawConcavePoly(x, y, r * 0.54, 5, 0.72, rot);
                ctx.fill();
            } else {
                ctx.fillStyle = '#18181f';
                drawHex(x, y, r, rot);
                ctx.fill();
                ctx.fillStyle = '#4a4a58';
                drawHex(x, y, r * 0.88, rot);
                ctx.fill();
                ctx.fillStyle = '#686875';
                drawHex(x, y, r * 0.58, rot);
                ctx.fill();
                ctx.fillStyle = '#82828f';
                drawHex(x, y, r * 0.32, rot);
                ctx.fill();
            }
        });

        (rState.pickups || []).forEach(item => drawHealthPickup(ctx, item, timestamp));
        (rState.zombies || []).forEach(z => {
            if (z.x + 60 < visLeft || z.x - 60 > visRight || z.y + 60 < visTop || z.y - 60 > visBottom) return;
            drawZombie(ctx, z, timestamp);
        });

        // --- INDICATOR TRAIECTORIE ---
        if ((isShooting || mouseActive) && me && me.alive && !gameEnded) {
            const dirX       = -Math.sin(myAngle);
            const dirY       =  Math.cos(myAngle);
            const TRAJ_START = 25;   // coincide cu spawn offset server-side
            const TRAJ_END   = 625;  // 25 + 600px (1800 px/s × 0.333s)
            const aiming = aimStartTime && (performance.now() - aimStartTime) < 500;
            ctx.save();
            ctx.strokeStyle = aiming ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.45)';
            ctx.lineWidth   = 2.5 / ZOOM;
            ctx.setLineDash([6 / ZOOM, 24 / ZOOM]);
            ctx.beginPath();
            ctx.moveTo(camX + dirX * TRAJ_START, camY + dirY * TRAJ_START);
            ctx.lineTo(camX + dirX * TRAJ_END,   camY + dirY * TRAJ_END);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // --- GLOANTE ---
        // Update trail history
        const TRAIL_MAX_AGE = 160; // ms — cat timp ramane urma
        const activeBulletIds = new Set(rState.bullets.map(b => b.id));
        for (const [id] of bulletTrails) { if (!activeBulletIds.has(id)) bulletTrails.delete(id); }
        rState.bullets.forEach(bullet => {
            if (!bulletTrails.has(bullet.id)) bulletTrails.set(bullet.id, []);
            const hist = bulletTrails.get(bullet.id);
            const last = hist[hist.length - 1];
            if (!last || last.x !== bullet.x || last.y !== bullet.y)
                hist.push({ x: bullet.x, y: bullet.y, t: timestamp });
            while (hist.length > 1 && timestamp - hist[0].t > TRAIL_MAX_AGE) hist.shift();
        });

        rState.bullets.forEach(bullet => {
            const angle = Math.atan2(bullet.dy || 0, bullet.dx || 0);
            const bScale = playerImages[bullet.ownerId]?.bulletScale || 1.0;
            const size  = (bullet.radius || 6) * 6.5 * bScale;

            // Trail progresiv din istoric
            const hist = bulletTrails.get(bullet.id);
            if (hist && hist.length >= 2) {
                const oldest = hist[0].t;
                const span   = Math.max(timestamp - oldest, 1);
                ctx.save();
                ctx.lineCap = 'round';
                for (let i = 1; i < hist.length; i++) {
                    const p0 = hist[i - 1];
                    const p1 = hist[i];
                    const alpha = ((p0.t - oldest) / span + (p1.t - oldest) / span) * 0.5;
                    ctx.beginPath();
                    ctx.moveTo(p0.x, p0.y);
                    ctx.lineTo(p1.x, p1.y);
                    ctx.strokeStyle = '#ffbe1e';
                    ctx.globalAlpha = alpha * 0.10;
                    ctx.lineWidth   = 6;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(p0.x, p0.y);
                    ctx.lineTo(p1.x, p1.y);
                    ctx.strokeStyle = '#ffffbe';
                    ctx.globalAlpha = alpha * 0.18;
                    ctx.lineWidth   = 2;
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Sprite glont
            const ownerImgData = playerImages[bullet.ownerId];
            const bImg = ownerImgData?.bulletImg || defaultBulletImg;
            ctx.save();
            ctx.translate(bullet.x, bullet.y);
            ctx.rotate(angle);
            ctx.drawImage(bImg, -size / 2, -size / 2, size, size);
            ctx.restore();
        });

        // --- TRAIL PASI ---
        drawPlayerTrails(ctx, timestamp, socket.id);

        // --- JUCATORI ---
        ctx.font      = 'bold 14px Lexend, Arial';
        ctx.textAlign = 'center';
        Object.values(rState.players).forEach(player => {
            if (!player.alive) return;
            const isMe = player.id === socket.id;
            let px, py, pangle;
            if (isMe && predX !== null) {
                px = predX; py = predY; pangle = myAngle;
            } else {
                px = player.x; py = player.y; pangle = player.angle || 0;
            }
            if (!isMe && (px + 80 < visLeft || px - 80 > visRight || py + 80 < visTop || py - 80 > visBottom)) return;
            const size = PLAYER_SPRITE_SIZE;
            const ringR = size * 0.5;
            const ringColor = isMe ? '#00ff88' : '#e94560';

            // Inel colorat sub sprite (fara rotatie) — localizare imediata
            ctx.save();
            ctx.translate(px, py);
            ctx.globalAlpha = 0.18;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.fillStyle = ringColor;
            ctx.fill();
            ctx.globalAlpha = isMe ? 0.8 : 0.6;
            ctx.strokeStyle = ringColor;
            ctx.lineWidth   = (isMe ? 3 : 2) / ZOOM;
            ctx.beginPath();
            ctx.arc(0, 0, ringR + 2 / ZOOM, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Sprite jucator
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(pangle);
            const imgData = playerImages[player.id];
            const img = imgData?.img;
            if (img && img.complete && img.naturalWidth > 0) {
                drawCircularCoverImage(ctx, img, size, imgData.scale || 1);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                ctx.fillStyle = ringColor;
                ctx.fill();
            }
            ctx.restore();

            // Flash rosu cand primeste damage
            const flashAge = flashTimers[player.id] !== undefined
                ? performance.now() - flashTimers[player.id] : Infinity;
            if (flashAge < 280) {
                ctx.save();
                ctx.translate(px, py);
                ctx.globalAlpha = (1 - flashAge / 280) * 0.7;
                ctx.beginPath();
                ctx.arc(0, 0, size * 0.52, 0, Math.PI * 2);
                ctx.fillStyle = '#ff2020';
                ctx.fill();
                ctx.restore();
            }

            // Nume
            const barH   = isMe ? 6 : 4;
            const ammoH  = 6;
            const barW   = isMe ? 70 : 52;
            const nameY  = py - ringR - (isMe ? 44 : 38);
            ctx.save();
            ctx.font        = `bold ${isMe ? 14 : 12}px Lexend, Arial`;
            ctx.textAlign   = 'center';
            ctx.strokeStyle = '#000000cc';
            ctx.lineWidth   = 3;
            ctx.lineJoin    = 'round';
            ctx.fillStyle   = isMe ? '#00ff88' : '#ffffff';
            ctx.strokeText(player.name, px, nameY);
            ctx.fillText(player.name,   px, nameY);
            ctx.restore();

            // Bara HP (toti jucatorii)
            const hpRatio = Math.max(0, player.hp / player.maxHp);
            const barX    = px - barW / 2;
            const barY    = py - ringR - (isMe ? 32 : 28);
            ctx.fillStyle = '#00000070';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
            ctx.fillStyle = hpRatio > 0.5 ? '#00ff88' : hpRatio > 0.25 ? '#ff8c00' : '#e94560';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW * hpRatio, barH, 2); ctx.fill();

            if (isMe) {
                drawAmmoBar(ctx, barX, barY + barH + 4, barW, ammoH, ammoState);
            }
        });

        // --- HIT EFFECTS ---
        for (let i = hitEffects.length - 1; i >= 0; i--) {
            const h = hitEffects[i];
            h.life -= 0.055; // ~550ms la 60fps
            if (h.life <= 0) { hitEffects.splice(i, 1); continue; }
            const t = (2.0 - h.life) / 2.0; // progres 0→1
            ctx.save();
            // Inel exterior galben — se extinde larg
            ctx.globalAlpha = (h.life / 2.0) * 0.20;
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth   = 2.5 / ZOOM;
            ctx.beginPath();
            ctx.arc(h.x, h.y, 22 + t * 65, 0, Math.PI * 2);
            ctx.stroke();
            // Inel interior alb — dispare rapid
            if (t < 0.45) {
                ctx.globalAlpha = (0.45 - t) / 0.45 * 0.18;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth   = 2 / ZOOM;
                ctx.beginPath();
                ctx.arc(h.x, h.y, 14 + t * 28, 0, Math.PI * 2);
                ctx.stroke();
            }
            // Flash fill in centru (doar la impact)
            if (t < 0.18) {
                ctx.globalAlpha = (0.18 - t) / 0.18 * 0.09;
                ctx.fillStyle   = '#ffee88';
                ctx.beginPath();
                ctx.arc(h.x, h.y, 28, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // --- DAMAGE NUMBERS ---
        const nowDN = performance.now();
        ctx.textAlign = 'center';
        for (let i = damageNumbers.length - 1; i >= 0; i--) {
            const dn = damageNumbers[i];
            const t  = (nowDN - dn.startTime) / 900;
            if (t >= 1) { damageNumbers.splice(i, 1); continue; }
            ctx.save();
            ctx.globalAlpha  = 1 - t;
            ctx.font         = `bold ${Math.round((22 + t * 8) / ZOOM)}px Lexend, Arial`;
            ctx.strokeStyle  = '#00000099';
            ctx.lineWidth    = 3 / ZOOM;
            ctx.fillStyle    = '#ff3333';
            const dnX = dn.x + dn.dir * t * 52;
            const dnY = dn.y - t * 22;
            ctx.strokeText(`-${dn.amount}`, dnX, dnY);
            ctx.fillText(`-${dn.amount}`,   dnX, dnY);
            ctx.restore();
        }

        drawPickupBursts(ctx, timestamp);

        ctx.restore();

        // --- TIMER ZONA ---
        if (rState && !rState.zone.shrinking && gameControl.zoneStartsAt && !gameControl.countdownActive) {
            const secsLeft = Math.ceil((gameControl.zoneStartsAt - Date.now()) / 1000);
            if (secsLeft > 0) {
                ctx.save();
                ctx.scale(dpr, dpr);
                const label = `⚠ Zona se porneste in ${secsLeft}s`;
                ctx.font      = `bold ${Math.max(13, W * 0.018)}px Lexend, sans-serif`;
                ctx.textAlign = 'center';
                const tw = ctx.measureText(label).width + 24;
                const th = Math.max(13, W * 0.018) * 1.6;
                const tx = W / 2 - tw / 2;
                const ty = 14;
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 8); ctx.fill();
                ctx.fillStyle   = secsLeft <= 6 ? '#ff4444' : '#ff8c00';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, W / 2, ty + th / 2);
                ctx.restore();
            }
        }

        // --- WATCHDOG ---
        if (lastGameStateTime > 0 && (performance.now() - lastGameStateTime) > 5000) {
            ctx.save();
            ctx.scale(dpr, dpr);
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.fillRect(0, 0, W, H);
            ctx.font      = `${Math.max(32, W * 0.05)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚠️', W / 2, H / 2 - Math.max(32, W * 0.05));
            ctx.font      = `bold ${Math.max(16, W * 0.022)}px Lexend, sans-serif`;
            ctx.fillStyle = '#ff4444';
            ctx.fillText('CONEXIUNE PIERDUTA', W / 2, H / 2 + 4);
            ctx.font      = `${Math.max(12, W * 0.016)}px Lexend, sans-serif`;
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText('Serverul nu raspunde. Reincarca pagina.', W / 2, H / 2 + Math.max(24, W * 0.038));
            ctx.restore();
        }
    }

    draw();
}

updateStatsUI();

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

    if (_LBG.bots.length === 0) {
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

    _LBG.lastTime = performance.now();
    _lobbyBgTick(canvas.getContext('2d'));
}

function stopLobbyBackground() {
    if (_lobbyBgRaf) { cancelAnimationFrame(_lobbyBgRaf); _lobbyBgRaf = null; }
    const canvas = document.getElementById('lobby-bg-canvas');
    if (canvas) canvas.style.display = 'none';
}

function _lobbyBgTick(ctx) {
    const now = performance.now();
    const dt  = Math.min((now - _LBG.lastTime) / 1000, 0.05);
    _LBG.lastTime = now;
    const W = ctx.canvas.width, H = ctx.canvas.height;

    ctx.fillStyle = '#548e35';
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

    // Rocks — hexagonal (same style as in-game)
    for (const rock of _LBG.rocks) {
        ctx.fillStyle = '#18181f';
        _drawHex(ctx, rock.x + 3, rock.y + 4, rock.r, rock.rot);
        ctx.fill();
        ctx.fillStyle = '#4a4a58';
        _drawHex(ctx, rock.x, rock.y, rock.r * 0.88, rock.rot);
        ctx.fill();
        ctx.fillStyle = '#686875';
        _drawHex(ctx, rock.x, rock.y, rock.r * 0.58, rock.rot);
        ctx.fill();
        ctx.fillStyle = '#82828f';
        _drawHex(ctx, rock.x, rock.y, rock.r * 0.32, rock.rot);
        ctx.fill();
    }

    // Trees — concave polygon (same style as in-game)
    for (const t of _LBG.trees) {
        ctx.fillStyle = '#0e2e05';
        _drawConcavePoly(ctx, t.x + 4, t.y + 5, t.r, 5, 0.72, t.rot);
        ctx.fill();
        ctx.fillStyle = '#1e5c0a';
        _drawConcavePoly(ctx, t.x, t.y, t.r, 5, 0.72, t.rot);
        ctx.fill();
        ctx.fillStyle = '#2e8a14';
        _drawConcavePoly(ctx, t.x, t.y, t.r * 0.54, 5, 0.72, t.rot);
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
const MAX_DPR = 2;   // cap pixelRatio - 2x acopera toate telefoanele moderne fara cost excesiv

// ---------- SISTEM PERSONAJE ----------
const CHARACTERS = [
    // scale: factor de zoom (>1 = mai mare, <1 = mai mic)
    // bullet: imaginea proiectilului; scale: zoom in cerc; bulletScale: marimea proiectilului (1.0=normal, 1.4=mai mare)
    // ── COMMON ──────────────────────────────────────────────────────────────────
    { id: 'ninja',       name: 'Ninja',        rarity: 'common',    img: '/images/characters/ninja.png',         level: 1,  coins: 0,    diamonds: 0,  default: true, scale: 1.0, bulletScale: 1.0, bullet: '/assets/bullets/ninja_bullet.png'            },
    { id: 'zombie',      name: 'Zombie',       rarity: 'common',    img: '/images/characters/zombie.png',        level: 1,  coins: 150,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Zombie.png'     },
    { id: 'robot',       name: 'Robot',        rarity: 'common',    img: '/images/characters/robot.png',         level: 1,  coins: 150,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Robot.png'      },
    { id: 'wizard',      name: 'Wizard',       rarity: 'common',    img: '/images/characters/wizard.png',        level: 2,  coins: 200,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Wizard.png'     },
    { id: 'pilot',       name: 'Pilot',        rarity: 'common',    img: '/images/characters/pilot.png',         level: 2,  coins: 180,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Pilot.png',      isNew: true },
    { id: 'sheriff',     name: 'Cowboy',       rarity: 'common',    img: '/images/characters/cowboy.png',        level: 3,  coins: 250,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Cowboy.png'     },
    { id: 'pumpkin',     name: 'Pumpkin',      rarity: 'common',    img: '/images/characters/pumpkin.png',       level: 3,  coins: 300,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Pumpkin.png'    },
    // ── RARE ────────────────────────────────────────────────────────────────────
    { id: 'forestelf',   name: 'Forest Elf',   rarity: 'rare',      img: '/images/characters/forestElf.png',     level: 4,  coins: 400,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_ForestElf.png'  },
    { id: 'fire',        name: 'Fire Knight',  rarity: 'rare',      img: '/images/characters/fire.png',          level: 5,  coins: 500,  diamonds: 0,  scale: 0.85,   bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Fire.png'       },
    { id: 'tiger',       name: 'Tiger',        rarity: 'rare',      img: '/images/characters/tiger.png',         level: 5,  coins: 500,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Tiger.png'      },
    { id: 'shark',       name: 'Shark',        rarity: 'rare',      img: '/images/characters/shark.png',         level: 6,  coins: 600,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Shark.png'      },
    { id: 'thunderbot',  name: 'Thunder Bot',  rarity: 'rare',      img: '/images/characters/thunderBot.png',    level: 6,  coins: 650,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_ThunderBot.png' },
    { id: 'werewolf',    name: 'Werewolf',     rarity: 'rare',      img: '/images/characters/werewolf.png',      level: 6,  coins: 700,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Werewolf.png'   },
    { id: 'cyberbrain',  name: 'Cyber Brain',  rarity: 'rare',      img: '/images/characters/cyberBrain.png',    level: 7,  coins: 800,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_CyberBrain.png' },
    { id: 'hacker',      name: 'Hacker',       rarity: 'rare',      img: '/images/characters/hacker.png',        level: 7,  coins: 750,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Hacker.png',     isNew: true },
    { id: 'timetraveler',name: 'Time Traveler', rarity: 'rare',     img: '/images/characters/timeTraveller.png', level: 8,  coins: 850,  diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_TimeTraveler.png',isNew: true },
    // ── EPIC ────────────────────────────────────────────────────────────────────
    { id: 'viking',      name: 'Viking',       rarity: 'epic',      img: '/images/characters/viking.png',        level: 10, coins: 1800, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Viking.png'     },
    { id: 'sungod',      name: 'Sun God',      rarity: 'epic',      img: '/images/characters/sunGod.png',        level: 10, coins: 2000, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_SunGod.png'     },
    { id: 'ice',         name: 'Ice Queen',    rarity: 'epic',      img: '/images/characters/ice.png',           level: 10, coins: 0,    diamonds: 15, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Ice.png'        },
    { id: 'crocodile',   name: 'Crocodile',    rarity: 'epic',      img: '/images/characters/crocodile.png',     level: 11, coins: 2200, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Crocodile.png',  isNew: true },
    { id: 'magmagolem',  name: 'Magma Golem',  rarity: 'epic',      img: '/images/characters/magmaGolem.png',    level: 12, coins: 2500, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_MagmaGolem.png' },
    { id: 'royalking',   name: 'Royal King',   rarity: 'epic',      img: '/images/characters/royalKing.png',     level: 12, coins: 0,    diamonds: 20, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_King.png'       },
    { id: 'gorilla',     name: 'Gorilla',      rarity: 'epic',      img: '/images/characters/gorilla.png',       level: 13, coins: 2800, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Gorilla.png',    isNew: true },
    { id: 'taurus',      name: 'Taurus',       rarity: 'epic',      img: '/images/characters/taurus.png',        level: 13, coins: 2600, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Taurus.png',     isNew: true },
    { id: 'necromancer', name: 'Necromancer',  rarity: 'epic',      img: '/images/characters/necromancer.png',   level: 14, coins: 3000, diamonds: 0,  scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Necromancer.png',isNew: true },
    // ── LEGENDARY ───────────────────────────────────────────────────────────────
    { id: 'vampire',     name: 'Vampire',      rarity: 'legendary', img: '/images/characters/vampire.png',       level: 15, coins: 0,    diamonds: 40, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Vampire.png'    },
    { id: 'paladin',     name: 'Paladin',      rarity: 'legendary', img: '/images/characters/paladin.png',       level: 17, coins: 0,    diamonds: 50, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Paladin.png',    isNew: true },
    { id: 'samurai',     name: 'Samurai',      rarity: 'legendary', img: '/images/characters/samurai.png',       level: 18, coins: 0,    diamonds: 60, scale: 1.0,    bulletScale: 1.0, bullet: '/assets/bullets/ninja_bullet.png'           },
    { id: 'scorpion',    name: 'Scorpion',     rarity: 'legendary', img: '/images/characters/scorpion.png',      level: 19, coins: 0,    diamonds: 65, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Scorpion.png',   isNew: true },
    { id: 'pharaoh',     name: 'Pharaoh',      rarity: 'legendary', img: '/images/characters/pharaoh.png',       level: 20, coins: 0,    diamonds: 75, scale: 1.0,    bulletScale: 1.4, bullet: '/assets/bullets/Projectile_Pharaoh.png'    },
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
    if (ring) ring.style.setProperty('--rc', RARITY_COLOR[char.rarity]);
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
                ${char.isNew ? '<div class="cs-new-badge">NEW</div>' : ''}
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
                    <button class="friend-remove-btn" onclick="removeFriend('${escapeHtml(f.nickname)}')" title="Sterge prieten">✕</button>
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
    if (bigIcon)  bigIcon.textContent  = isBr ? '⚔️' : '🧟';
    if (bigName)  bigName.textContent  = isBr ? 'BATTLE ROYALE' : 'SURVIVAL PvE';
    if (bigBadge) bigBadge.textContent = isBr ? 'PvP' : 'CO-OP';
    if (bigDesc)  bigDesc.textContent  = isBr ? 'Ultimul supravietuitor castiga' : 'Cooperare contra hoardelor';
    if (feat1)    feat1.textContent    = isBr ? '👥 Max 20 jucatori' : '🤝 Echipe 2-4 jucatori';
    if (feat2)    feat2.textContent    = isBr ? '⏱ ~10 min / runda'  : '🧟 Horde de zombii';
}

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
    if (rarityRing) rarityRing.style.setProperty('--rc', RARITY_COLOR[activeChar.rarity]);

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
    selectedGamemode = null;
    const _lobby = document.getElementById('screen-lobby');
    if (_lobby) { _lobby.classList.remove('mode-br', 'mode-pve'); }
    ['gm-br', 'gm-pve'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('gm-selected', 'gm-deselected'); }
    });
    const _playBtn = document.getElementById('btn-play');
    if (_playBtn) _playBtn.disabled = true;
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
    if (!selectedGamemode) selectGamemode('br');
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

window.addEventListener('resize', () => {
    const canvas = document.getElementById('lobby-bg-canvas');
    if (!canvas) return;
    const wasRunning = !!_lobbyBgRaf;
    stopLobbyBackground();
    _LBG.bots = [];
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
    if (ptEl)   ptEl.style.color   = remaining === 0 ? '#e94560' : '#00ff88';
    const valHp  = document.getElementById('val-hp');
    const valDmg = document.getElementById('val-dmg');
    const valSpd = document.getElementById('val-spd');
    const barHp  = document.getElementById('bar-hp');
    const barDmg = document.getElementById('bar-dmg');
    const barSpd = document.getElementById('bar-spd');
    if (valHp)  valHp.textContent  = (350 + stats.hp  * 40) + ' HP';
    if (valDmg) valDmg.textContent = (10  + stats.dmg *  2) + ' DMG';
    if (valSpd) valSpd.textContent = (2.0 + stats.spd * 0.2).toFixed(1) + ' SPD';
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

const _charImgCache = {};
function _getCharImg(src) {
    if (!_charImgCache[src]) {
        const img = new Image();
        img.src = src;
        _charImgCache[src] = img;
    }
    return _charImgCache[src];
}
// Preîncarcă toate imaginile caracterelor imediat la încărcarea paginii
CHARACTERS.forEach(c => _getCharImg(c.img));

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
    const _ioFallbackOpts = typeof msgpackParser !== 'undefined'
        ? { parser: msgpackParser, transports: ['websocket'], reconnection: false }
        : { transports: ['websocket'], reconnection: false };
    const socket = _sessionSocket || io(_ioFallbackOpts);
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
    // Cache entry (inclusiv circleOC) dupa URL — mai multi jucatori cu acelasi personaj
    // impart acelasi obiect; o singura incarcare de imagine si un singur OffscreenCanvas
    const _playerEntryByUrl = {};

    socket.on('player-image', (data) => {
        if (playerImages[data.id]) return;

        // Refoloseste entry-ul deja construit pentru acest URL (alt jucator cu acelasi personaj)
        if (_playerEntryByUrl[data.image]) {
            playerImages[data.id] = _playerEntryByUrl[data.image];
            return;
        }

        const img = new Image();
        img.src = data.image;
        const charDef = CHARACTERS.find(c => data.image === c.img);
        const bulletSrc = charDef?.bullet || '/assets/bullets/ninja_bullet.png';
        const scale = charDef?.scale || 1.0;
        const entry = { img, scale, bulletImg: _getBulletImg(bulletSrc), bulletScale: charDef?.bulletScale || 1.0, circleOC: null };
        playerImages[data.id] = entry;
        _playerEntryByUrl[data.image] = entry; // inregistrat dupa URL pentru reutilizare
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
                    <img src="${p.image}" onerror="this.style.background='#e8a020';this.src=''"
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
                gameControl.countdownActive = false;
                setTimeout(() => {
                    overlay.classList.remove('active');
                    numEl.style.color = '#fff';
                    gameControl.countdownEndTime = performance.now();
                }, 700);
            }
        }, 1000);
    }

    socket.on('game-start', (data) => {
        if (data && data.playersMeta)  gameControl.pendingMeta      = data.playersMeta;
        if (data && data.obstacles)    gameControl.pendingObstacles = data.obstacles;
        stopLobbyBackground();
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
            startGameLoop(socket, canvas, ctx, playerImages, gameControl);
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
    let isShooting   = false;
    let aimStartTime = null;
    let gameEnded    = false;
    let _selfDead    = false;
    let myAngle      = 0;
    let moveAngle    = 0;

    const _hiddenPlayers = new Set(); // enemy IDs hidden immediately on kill-event, before interpolation catches up

    let isSpectating    = false;
    let spectateTargetId = null;
    let myElimData      = null;

    let predX = null, predY = null, predSpeed = 132; // px/sec (actualizat din meta)
    const stateBuffer  = []; // [{t, players:{id:{x,y,angle,hp,maxHp,alive,kills,name}}, bullets:[], zone:{}}]
    const playerMeta   = {}; // {id: {speed, maxHp, name}} — static per runda, trimis o data
    // Aplica metadata trimisa de server inainte ca startGameLoop sa fie apelat
    if (gameControl.pendingMeta)      { Object.assign(playerMeta, gameControl.pendingMeta); delete gameControl.pendingMeta; }
    let _obstacles = gameControl.pendingObstacles || []; delete gameControl.pendingObstacles;
    let _zone = { cx: ARENA_W / 2, cy: ARENA_H / 2, r: 1650, waitTimer: 30 };
    let _zoneTimerAlpha = 0;
    const _zombies        = [];
    const _zombieDeathFx  = [];
    const _playerDeathFx  = [];  // { x, y, startTime, shards }
    const _prevPlayerAlive = {};
    const _healthKits   = new Map(); // id → {x, y, timeLeft}
    const _kitPickupFx  = [];        // { x, y, amount, startTime }
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
    const _clientBullets    = []; // {x, y, dx, dy, spawnTime}
    let   _clientShootCd    = 0;  // mirrors server SHOOT_CD; decremented in rAF

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
    // 2 ticks of buffer at 60Hz — enough to always have a bracket without adding visible lag.
    const INTERP_DELAY_MS = 34;

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
                if (!isShooting && !mouseActive) myAngle = moveAngle;
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
            _lastJoyAngle = myAngle;
        } else {
            if (isShooting) { isShooting = false; aimStartTime = null; }
        }
        // rAF unified input handles emit
    });

    joystickRight.on('end', () => {
        if (isShooting) { isShooting = false; aimStartTime = null; }
        if (!mouseActive && (moveDir.x !== 0 || moveDir.y !== 0)) myAngle = moveAngle;
        // rAF unified input handles emit
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
            if (!isShooting && !mouseActive) myAngle = moveAngle;
        } else {
            moveDir.x = 0; moveDir.y = 0;
        }
        // Emit happens in rAF at 30Hz — no direct emit here.
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
        if (e.pointerType !== 'mouse' || e.button !== 0 || gameEnded || gameControl.countdownActive) return;
        isShooting = true;
        aimStartTime = performance.now();
        shootDir.x = -Math.sin(myAngle);
        shootDir.y =  Math.cos(myAngle);
        // Shoot state captured by rAF unified input at 30Hz
    };
    const onPointerUp = (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        isShooting = false;
        aimStartTime = null;
        if (moveDir.x !== 0 || moveDir.y !== 0) myAngle = moveAngle;
        // rAF unified input will send shooting:false at next 30Hz tick
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
    };

    // ---------- STAREA JOCULUI ----------
    let lastGameStateTime = 0;
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

    socket.on('hit', ({ amount, x, y }) => {
        damageNumbers.push({ x, y: y - 20, amount, startTime: performance.now(), dir: Math.random() < 0.5 ? -1 : 1 });
    });

    // Server performance stats — emitted every 2 s; used by debug overlay
    socket.on('srv-stats', ({ tps, ents, pickups }) => {
        _dbgSrvTps     = tps;
        _dbgSrvEnts    = ents;
        _dbgSrvPickups = pickups || 0;
    });

    socket.on('gs', ([pArr, bArr, ammoArr, serverTime = 0, zoneArr, zArr, kArr]) => {

        _dbgGsCount++;
        const now = performance.now();
        if (ammoArr) {
            ammoState.ammo = Math.max(0, ammoArr[0] || 0);
            ammoState.max  = Math.max(1, ammoArr[1] || 10);
            ammoState.reloading      = !!ammoArr[2];
            ammoState.reloadProgress = Math.max(0, Math.min(1, ammoArr[3] ?? 1));
        }
        if (zoneArr) {
            _zone.cx = zoneArr[0]; _zone.cy = zoneArr[1];
            _zone.r  = zoneArr[2]; _zone.waitTimer = zoneArr[3];
        }
        if (zArr) {
            for (let _zi = 0; _zi < zArr.length; _zi += 4) {
                const _zid = _zi / 4;
                if (!_zombies[_zid]) _zombies[_zid] = { hp: -1 };
                const _zPrevHp = _zombies[_zid].hp;
                _zombies[_zid].x = zArr[_zi]; _zombies[_zid].y = zArr[_zi+1];
                _zombies[_zid].angle = zArr[_zi+2]; _zombies[_zid].hp = zArr[_zi+3];
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
        const entry = {
            t:       now,
            st:      serverTime || now,
            players: {},
            bullets: bArr.map(([id, x, y, dx, dy, ownerId]) => ({ id, x, y, dx: dx * 1400, dy: dy * 1400, ownerId, radius: 6 })),
        };

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

            }
            // Always anchor predX/Y to the replayed position.
            // Previously: only applied for errors >150px, so small drift accumulated
            // indefinitely and micro-corrections caused constant jitter.
            // Now: tiny errors (timing noise) correct gently each tick; large errors snap.
            if (predX === null || isNaN(predX) || isNaN(predY)) {
                predX = _rx; predY = _ry;
            } else {
                const _cspErr = Math.hypot(_rx - predX, _ry - predY);
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

            const newKills  = me.kills || 0;
            const prevKills = parseInt(myKillsEl.textContent) || 0;
            // Kill notification — imediat (important pentru feedback)
            if (newKills > prevKills && !gameControl.countdownActive) showKillNotif(newKills);
            myKillsEl.textContent = newKills;
        }

        // DOM HUD throttled la 10Hz (nu la 30Hz) — reduce reflow-urile DOM
        if (now - _lastDomHudUpdate >= 100) {
            _lastDomHudUpdate = now;
            let _aliveCount = 0;
            for (const pid in entry.players) { if (entry.players[pid].alive) _aliveCount++; }
            if (_playersAliveEl) _playersAliveEl.textContent = _aliveCount;
        }

        for (const pid in entry.players) {
            const p = entry.players[pid];
            if (prevHp[pid] !== undefined && prevHp[pid] - p.hp > 1) {
                hitEffects.push({ x: p.x, y: p.y, life: 2.0 });
                flashTimers[pid] = performance.now();
                // Expira cel mai apropiat client bullet la confirmarea hitului
                if (_clientBullets.length > 0) {
                    const _bn = performance.now();
                    let _nearIdx = 0, _nearDist = Infinity;
                    for (let _bi = 0; _bi < _clientBullets.length; _bi++) {
                        const cb = _clientBullets[_bi];
                        const _cAge = Math.min((_bn - cb.spawnTime) / 1000, 0.60);
                        const _d = Math.hypot(cb.x + cb.dx * _cAge - p.x, cb.y + cb.dy * _cAge - p.y);
                        if (_d < _nearDist) { _nearDist = _d; _nearIdx = _bi; }
                    }
                    if (_nearDist < 300) _clientBullets.splice(_nearIdx, 1);
                }
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
        gameEnded = true;
        _selfDead  = true;
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
        _selfDead  = false;
        _hiddenPlayers.clear();
        predX      = null; predY = null;
        isShooting = false;
        aimStartTime = null;
        moveDir.x  = 0; moveDir.y  = 0;
        shootDir.x = 0; shootDir.y = 0;
        myAngle = 0; moveAngle = 0; lastTime = 0;
        stateBuffer.length = 0;
        _inputSeq = 0; _lastInputSend = 0;
        _pendingInputs.length = 0;
        _clientBullets.length = 0;
        _clientShootCd = 0;

        _dbgPktSent = 0; _dbgPktPs = 0; _dbgPktSentWindow = 0;
        _lastJoyMoveX = 0; _lastJoyMoveY = 0; _lastJoyAngle = null;
        for (const k in prevHp) delete prevHp[k];
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
        document.getElementById('gameover-title').textContent = '💀 ELIMINAT!';
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
        _playerDeathFx.length = 0;
        for (const k in _prevPlayerAlive) delete _prevPlayerAlive[k];
        _healthKits.clear();
        _kitPickupFx.length = 0;
        _kitDropAnim.clear();
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
        btn.textContent = `🔄 JOACA DIN NOU (${count}/${total})`;
    });

    socket.on('game-rematch', ({ isHost, playersMeta }) => {
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
        const maxAmmo     = Math.max(1, state.max || 10);
        const progressUnits = state.reloading
            ? Math.max(0, Math.min(maxAmmo, state.reloadProgress * maxAmmo))
            : Math.max(0, Math.min(maxAmmo, state.ammo));
        const gap  = 2;
        const segW = (width - gap * (maxAmmo - 1)) / maxAmmo;
        const fillColor = state.reloading ? '#ffd95a' : '#ffcc22';

        for (let i = 0; i < maxAmmo; i++) {
            const sx       = x + i * (segW + gap);
            const fillPart = Math.max(0, Math.min(1, progressUnits - i));
            ctx.fillStyle = '#00000070';
            ctx.beginPath(); ctx.roundRect(sx, y, segW, height, 1.5); ctx.fill();
            if (fillPart > 0) {
                ctx.fillStyle = fillColor;
                ctx.beginPath(); ctx.roundRect(sx, y, segW * fillPart, height, 1.5); ctx.fill();
            }
        }
    }

    // ---------- INTERPOLARE STATE ----------
    function getInterpolatedState() {
        if (stateBuffer.length === 0) return null;

        const renderTime = performance.now() - INTERP_DELAY_MS;

        // Find the two snapshots that bracket renderTime.
        // stateBuffer is oldest-first; scan backwards for the last one <= renderTime.
        let iOld = -1;
        for (let i = stateBuffer.length - 1; i >= 0; i--) {
            if (stateBuffer[i].t <= renderTime) { iOld = i; break; }
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

        const span = sNew.t - sOld.t;
        // t in [0,1] for normal interpolation; allow up to 1.5 for slight extrapolation
        const t = span > 0 ? Math.max(0, Math.min(1.0, (renderTime - sOld.t) / span)) : 0;

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

    // ---------- BUCLA DE RANDARE ----------
    let lastTime  = 0;
    function draw(timestamp) {
        rafId = requestAnimationFrame(draw);
        const _drawStart = performance.now();

        const dpr  = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const W    = canvas.width  / dpr;
        const H    = canvas.height / dpr;
        const ZOOM = Math.min(W / VIEW_W, H / VIEW_H);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const rState = getInterpolatedState();
        if (!rState) { lastTime = timestamp; return; }

        const dtSec = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : 0.016;
        lastTime = timestamp;

        // ── Local position prediction (runs every rAF frame) ─────────────────
        if (predX !== null && !_selfDead) {
            predX = Math.max(20, Math.min(ARENA_W - 20, predX + moveDir.x * predSpeed * dtSec));
            predY = Math.max(20, Math.min(ARENA_H - 20, predY + moveDir.y * predSpeed * dtSec));
        }

        // ── Client bullet spawn — instant visual feedback, always uses current myAngle ──
        _clientShootCd -= dtSec;
        if (isShooting && !_selfDead && !gameControl.countdownActive &&
            _clientShootCd <= 0 && !ammoState.reloading && ammoState.ammo > 0 && predX !== null &&
            aimStartTime !== null && performance.now() - aimStartTime >= 300) {
            const _bcdx = -Math.sin(myAngle), _bcdy = Math.cos(myAngle);
            _clientBullets.push({
                x: predX + _bcdx * 25, y: predY + _bcdy * 25,
                dx: _bcdx * 1000,      dy: _bcdy * 1000,
                spawnTime: performance.now()
            });
            _clientShootCd = 0.25; // SHOOT_CD
        }
        // Expire client bullets: lifetime + obstacle collision
        const _cbNow = performance.now();
        for (let _ci = _clientBullets.length - 1; _ci >= 0; _ci--) {
            const _cb = _clientBullets[_ci];
            if (_cbNow - _cb.spawnTime > 650) { _clientBullets.splice(_ci, 1); continue; }
            const _cbA = Math.min((_cbNow - _cb.spawnTime) / 1000, 0.60);
            const _cbPx = _cb.x + _cb.dx * _cbA, _cbPy = _cb.y + _cb.dy * _cbA;
            let _cbHit = false;
            for (let _oi = 0; _oi < _obstacles.length; _oi++) {
                const _o = _obstacles[_oi];
                if (Math.hypot(_cbPx - _o.x, _cbPy - _o.y) < _o.r + 6) {
                    _cbHit = true;
                    _obsShake[_oi] = performance.now();
                    break;
                }
            }
            if (!_cbHit) {
                for (const _zb of _zombies) {
                    if (_zb && _zb.hp >= 0 && Math.hypot(_cbPx - _zb.x, _cbPy - _zb.y) < 26) { _cbHit = true; break; }
                }
            }
            if (_cbHit) _clientBullets.splice(_ci, 1);
        }

        // ── Unified 60Hz input send ───────────────────────────────────────────
        // Sends one compact packet per server tick interval: move+angle+shoot bundled.
        // Inputs are recorded with their dt for CSP replay on server ack.
        const _nowI = performance.now();
        if (!gameEnded && !gameControl.countdownActive && !_selfDead && _nowI - _lastInputSend >= EMIT_MS) {
            _lastInputSend = _nowI;
            const seq = ++_inputSeq;
            socket.emit('input', {
                seq,
                dx: moveDir.x,  dy: moveDir.y,
                angle: myAngle,
                shooting: isShooting,
                sdx: isShooting ? -Math.sin(myAngle) : 0,
                sdy: isShooting ?  Math.cos(myAngle) : 0,
            });
            _dbgPktSent++;
            // Record for CSP replay (limit buffer to ~3s worth of inputs at 60Hz)
            if (predX !== null) {
                // dt = EMIT_MS/1000 (server tick duration), NOT dtSec (rAF frame time).
                // The server moves the player by speed * INTERVAL_MS/1000 per tick.
                // Storing rAF frame time (~16ms) caused the CSP replay to account for
                // only ~50% of the server's actual movement → constant 30Hz correction jitter.
                _pendingInputs.push({ seq, dx: moveDir.x, dy: moveDir.y, dt: EMIT_MS / 1000 });
                if (_pendingInputs.length > 180) _pendingInputs.shift();
            }
        }

        // ── Packets/sec counter ───────────────────────────────────────────────
        if (_nowI - _dbgPktSentWindow >= 1000) {
            _dbgPktPs = _dbgPktSent; _dbgPktSent = 0; _dbgPktSentWindow = _nowI;
        }

        const me = rState.players[socket.id];

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
            if (_specHpEl)   _specHpEl.textContent   = sp ? `❤ ${Math.ceil(Math.max(0, sp.hp))} / ${sp.maxHp}` : '';
        }

        const specTarget = isSpectating && spectateTargetId ? rState.players[spectateTargetId] : null;
        const camX = specTarget ? specTarget.x : (predX !== null ? predX : (me ? me.x : ARENA_W / 2));
        const camY = specTarget ? specTarget.y : (predY !== null ? predY : (me ? me.y : ARENA_H / 2));

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
        // Picteaza doar portiunea vizibila din arena (nu intreaga 2600x2600)
        ctx.fillStyle = '#4a7c2f';
        ctx.fillRect(
            Math.max(0, visLeft),  Math.max(0, visTop),
            Math.min(ARENA_W, visRight)  - Math.max(0, visLeft),
            Math.min(ARENA_H, visBottom) - Math.max(0, visTop)
        );

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
                if (_sa > 0.35) { delete _obsShake[_oi]; }
                else {
                    const _samp = 1.2 * (1 - _sa / 0.35);
                    _sox = Math.sin(_sa * 28 * Math.PI * 2) * _samp;
                }
            }
            const _ox = obs.x + _sox, _oy = obs.y + _soy;
            if (obs.type === 'tree') {
                const vr = obs.r * 1.15;
                ctx.fillStyle = '#1e5c0a';
                _drawConcavePoly(ctx, _ox, _oy, vr, 7, 0.68, obs.rot || 0);
                ctx.fill();
                ctx.strokeStyle = '#163d06';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.fillStyle = '#2e8a14';
                _drawConcavePoly(ctx, _ox, _oy, vr * 0.55, 7, 0.68, obs.rot || 0);
                ctx.fill();
                ctx.fillStyle = '#3db31a';
                _drawConcavePoly(ctx, _ox, _oy, vr * 0.3, 7, 0.68, obs.rot || 0);
                ctx.fill();
            } else {
                ctx.fillStyle = '#4a4a58';
                _drawHex(ctx, _ox, _oy, obs.r * 0.88, obs.rot || 0);
                ctx.fill();
                ctx.strokeStyle = '#2e2e3a';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.fillStyle = '#686875';
                _drawHex(ctx, _ox, _oy, obs.r * 0.58, obs.rot || 0);
                ctx.fill();
                ctx.fillStyle = '#82828f';
                _drawHex(ctx, _ox, _oy, obs.r * 0.32, obs.rot || 0);
                ctx.fill();
            }
        }

        // --- ZONA --- (intotdeauna vizibila)
        ctx.save();
        ctx.beginPath();
        ctx.rect(visLeft, visTop, visRight - visLeft, visBottom - visTop);
        if (_zone.r > 0) ctx.arc(_zone.cx, _zone.cy, _zone.r, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(200,0,0,0.28)';
        ctx.fill();
        if (_zone.r > 0) {
            ctx.beginPath();
            ctx.arc(_zone.cx, _zone.cy, _zone.r, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff3333';
            ctx.lineWidth = 4 / ZOOM;
            ctx.stroke();
        }
        ctx.restore();

        // --- INDICATOR TRAIECTORIE ---
        if ((isShooting || mouseActive) && me && me.alive && !gameEnded) {
            const dirX       = -Math.sin(myAngle);
            const dirY       =  Math.cos(myAngle);
            const TRAJ_START = 25;   // coincide cu spawn offset server-side
            const TRAJ_END   = 625;  // 25 + 600px (1000 px/s × 0.60s)
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth   = 2.5 / ZOOM;
            if (_lineDashZoom !== ZOOM) { _lineDashZoom = ZOOM; _lineDashArr = [6 / ZOOM, 24 / ZOOM]; }
            ctx.setLineDash(_lineDashArr);
            ctx.beginPath();
            ctx.moveTo(camX + dirX * TRAJ_START, camY + dirY * TRAJ_START);
            ctx.lineTo(camX + dirX * TRAJ_END,   camY + dirY * TRAJ_END);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }



        // --- GLOANTE ---
        // Server bullets: extrapolate forward from latest snapshot to current frame time.
        // Own bullets (socket.id) are skipped — _clientBullets handles them with no delay.
        const _bulletNow = performance.now();
        const _bulletAge = Math.min((_bulletNow - lastGameStateTime) / 1000, 0.05);
        // Enemy bullets (server state) — cu imaginea personajului care a tras
        ctx.fillStyle = '#ffffff';
        // Curata id-uri vechi din _srvBulletSeen
        if (_srvBulletSeen.size > 0) {
            const _curIds = new Set(rState.bullets.map(b => b.id));
            for (const _sid of _srvBulletSeen.keys()) { if (!_curIds.has(_sid)) _srvBulletSeen.delete(_sid); }
        }
        for (const b of rState.bullets) {
            if (b.ownerId === socket.id) continue;
            if (!_srvBulletSeen.has(b.id)) _srvBulletSeen.set(b.id, _bulletNow);
            const _bx = b.x + b.dx * _bulletAge;
            const _by = b.y + b.dy * _bulletAge;
            // Trail
            const _bAge  = (_bulletNow - _srvBulletSeen.get(b.id)) / 1000;
            const _bTrPx = Math.min(_bAge * 480, 110);
            if (_bTrPx > 4) {
                const _bSpd = Math.hypot(b.dx, b.dy) || 1;
                const _bNx = b.dx / _bSpd, _bNy = b.dy / _bSpd;
                const _bPx = -_bNy, _bPy = _bNx;
                const _bTailX = _bx - _bNx * _bTrPx, _bTailY = _by - _bNy * _bTrPx;
                const _bGrad = ctx.createLinearGradient(_bTailX, _bTailY, _bx, _by);
                _bGrad.addColorStop(0, 'rgba(255,140,0,0)');
                _bGrad.addColorStop(0.55, 'rgba(255,195,50,0.12)');
                _bGrad.addColorStop(1, 'rgba(255,225,90,0.32)');
                ctx.beginPath();
                ctx.moveTo(_bTailX, _bTailY);
                ctx.lineTo(_bx + _bPx * 3.5, _by + _bPy * 3.5);
                ctx.lineTo(_bx - _bPx * 3.5, _by - _bPy * 3.5);
                ctx.closePath();
                ctx.fillStyle = _bGrad;
                ctx.fill();
                // bright core line
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = 'rgba(255,240,160,0.7)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(_bTailX + _bNx * 6, _bTailY + _bNy * 6);
                ctx.lineTo(_bx, _by);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
            const _bEntry = playerImages[b.ownerId];
            const _bImg   = _bEntry?.bulletImg;
            const _bSz    = 38;
            if (_bImg && _bImg.complete && _bImg.naturalWidth) {
                ctx.save();
                ctx.translate(_bx, _by);
                ctx.rotate(Math.atan2(b.dy, b.dx));
                ctx.drawImage(_bImg, -_bSz / 2, -_bSz / 2, _bSz, _bSz);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(_bx, _by, b.radius || 6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Client bullets (ale mele, predicted) — cu imaginea mea; fade-out spre finalul traiectoriei
        const _myBEntry = playerImages[socket.id];
        for (const cb of _clientBullets) {
            const _cAgeFull = (_bulletNow - cb.spawnTime) / 1000;
            const _cAge     = Math.min(_cAgeFull, 0.60);
            const _cbx      = cb.x + cb.dx * _cAge;
            const _cby      = cb.y + cb.dy * _cAge;
            // fade-out intre 0.45s si 0.60s ca sa dispara lin, fara inghetare vizuala
            const _cAlpha   = _cAgeFull < 0.45 ? 1.0 : Math.max(0, 1 - (_cAgeFull - 0.45) / 0.15);
            // Trail
            const _cTrPx = Math.min(_cAgeFull * 480, 110);
            if (_cTrPx > 4) {
                const _cSpd = Math.hypot(cb.dx, cb.dy) || 1;
                const _cNx = cb.dx / _cSpd, _cNy = cb.dy / _cSpd;
                const _cPerpX = -_cNy, _cPerpY = _cNx;
                const _cTailX = _cbx - _cNx * _cTrPx, _cTailY = _cby - _cNy * _cTrPx;
                const _cGrad = ctx.createLinearGradient(_cTailX, _cTailY, _cbx, _cby);
                _cGrad.addColorStop(0, 'rgba(255,140,0,0)');
                _cGrad.addColorStop(0.55, `rgba(255,195,50,${0.12 * _cAlpha})`);
                _cGrad.addColorStop(1, `rgba(255,225,90,${0.32 * _cAlpha})`);
                ctx.beginPath();
                ctx.moveTo(_cTailX, _cTailY);
                ctx.lineTo(_cbx + _cPerpX * 3.5, _cby + _cPerpY * 3.5);
                ctx.lineTo(_cbx - _cPerpX * 3.5, _cby - _cPerpY * 3.5);
                ctx.closePath();
                ctx.fillStyle = _cGrad;
                ctx.fill();
                // bright core line
                ctx.globalAlpha = 0.55 * _cAlpha;
                ctx.strokeStyle = 'rgba(255,240,160,0.7)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(_cTailX + _cNx * 6, _cTailY + _cNy * 6);
                ctx.lineTo(_cbx, _cby);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
            const _cbImg    = _myBEntry?.bulletImg;
            const _cbSz     = 38;
            ctx.globalAlpha = _cAlpha;
            if (_cbImg && _cbImg.complete && _cbImg.naturalWidth) {
                ctx.save();
                ctx.translate(_cbx, _cby);
                ctx.rotate(Math.atan2(cb.dy, cb.dx));
                ctx.drawImage(_cbImg, -_cbSz / 2, -_cbSz / 2, _cbSz, _cbSz);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(_cbx, _cby, 6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // --- PASI ---
        const _fpNow = performance.now();
        for (let _fi = _footsteps.length - 1; _fi >= 0; _fi--) {
            const _f = _footsteps[_fi];
            const _fAge = (_fpNow - _f.t) / 2500;
            if (_fAge >= 1) { _footsteps.splice(_fi, 1); continue; }
            ctx.globalAlpha = (1 - _fAge) * 0.22;
            ctx.fillStyle = '#1a1008';
            ctx.beginPath();
            ctx.arc(_f.x, _f.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

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
            const _kPulse = 0.92 + 0.08 * Math.sin(_kitNow / 280);
            const _kHalf = 13 * _kPulse;
            ctx.save();
            ctx.translate(_kit.x, _kit.y + _kitYOff);
            ctx.beginPath(); ctx.roundRect(-_kHalf, -_kHalf, _kHalf * 2, _kHalf * 2, 4);
            ctx.fillStyle = '#cc1a1a'; ctx.fill();
            ctx.strokeStyle = '#7a0000'; ctx.lineWidth = 2; ctx.stroke();
            const _kArmL = _kHalf * 0.62, _kArmW = _kHalf * 0.28;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.roundRect(-_kArmW, -_kArmL, _kArmW * 2, _kArmL * 2, 1); ctx.fill();
            ctx.beginPath(); ctx.roundRect(-_kArmL, -_kArmW, _kArmL * 2, _kArmW * 2, 1); ctx.fill();
            ctx.restore();
        }

        // --- KIT PICKUP FX ---
        for (let _kfi = _kitPickupFx.length - 1; _kfi >= 0; _kfi--) {
            const _kf = _kitPickupFx[_kfi];
            const _kfAge = (performance.now() - _kf.startTime) / 1000;
            if (_kfAge > 0.7) { _kitPickupFx.splice(_kfi, 1); continue; }
            const _kfT = _kfAge / 0.7;
            // Kit se estompeaza si urca
            const _kfHalf = 13 * (1 - _kfT * 0.4);
            const _kfY = _kf.y - _kfT * 22;
            ctx.globalAlpha = 1 - _kfT;
            ctx.save();
            ctx.translate(_kf.x, _kfY);
            ctx.beginPath(); ctx.roundRect(-_kfHalf, -_kfHalf, _kfHalf * 2, _kfHalf * 2, 4);
            ctx.fillStyle = '#cc1a1a'; ctx.fill();
            const _kfArmL = _kfHalf * 0.62, _kfArmW = _kfHalf * 0.28;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.roundRect(-_kfArmW, -_kfArmL, _kfArmW * 2, _kfArmL * 2, 1); ctx.fill();
            ctx.beginPath(); ctx.roundRect(-_kfArmL, -_kfArmW, _kfArmL * 2, _kfArmW * 2, 1); ctx.fill();
            ctx.restore();
            // "+200" verde in world space (la fel ca damage numbers)
            ctx.globalAlpha = _kfT < 0.4 ? 1 : Math.max(0, 1 - (_kfT - 0.4) / 0.6);
            ctx.font = `bold ${Math.round(22 / ZOOM)}px Lexend, Arial`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000000bb';
            ctx.lineWidth = 3 / ZOOM;
            ctx.fillStyle = '#44ee55';
            const _kfTxtY = _kf.y - 28 - _kfT * 40;
            ctx.strokeText(`+${_kf.amount}`, _kf.x, _kfTxtY);
            ctx.fillText(`+${_kf.amount}`, _kf.x, _kfTxtY);
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
            for (const _sh of _pdf.shards) {
                const _sr = _sh.speed * _pdfAge;
                const _sx = _pdf.x + Math.cos(_sh.angle) * _sr;
                const _sy = _pdf.y + Math.sin(_sh.angle) * _sr;
                const _sSz = 8 * (1 - _pdfT);
                ctx.save();
                ctx.translate(_sx, _sy); ctx.rotate(_sh.rot + _sh.rotSpeed * _pdfAge);
                ctx.beginPath();
                ctx.moveTo(0, -_sSz * 1.2); ctx.lineTo(_sSz * 0.8, _sSz * 0.8); ctx.lineTo(-_sSz * 0.8, _sSz * 0.8);
                ctx.closePath();
                ctx.fillStyle = '#ffaa22'; ctx.fill();
                ctx.strokeStyle = '#cc6600'; ctx.lineWidth = 1; ctx.stroke();
                ctx.restore();
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
                ctx.fillStyle = '#5dff6a'; ctx.fill();
            }
            // Inel expandat (gros, vizibil)
            ctx.globalAlpha = (1 - _dfT) * 0.85;
            ctx.strokeStyle = '#3ddd44';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(_df.x, _df.y, 8 + _dfT * 70, 0, Math.PI * 2); ctx.stroke();
            // Al doilea inel mai subtire
            ctx.globalAlpha = (1 - _dfT) * 0.45;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(_df.x, _df.y, 8 + _dfT * 55, 0, Math.PI * 2); ctx.stroke();
            // Cioburi mari
            ctx.globalAlpha = Math.pow(1 - _dfT, 1.5);
            for (const _sh of _df.shards) {
                const _sr = _sh.speed * _dfAge;
                const _sx = _df.x + Math.cos(_sh.angle) * _sr;
                const _sy = _df.y + Math.sin(_sh.angle) * _sr;
                const _sRot = _sh.rot + _sh.rotSpeed * _dfAge;
                const _sSz = 9 * (1 - _dfT);
                ctx.save();
                ctx.translate(_sx, _sy); ctx.rotate(_sRot);
                ctx.beginPath();
                ctx.moveTo(0, -_sSz * 1.2);
                ctx.lineTo(_sSz * 0.8, _sSz * 0.8);
                ctx.lineTo(-_sSz * 0.8, _sSz * 0.8);
                ctx.closePath();
                ctx.fillStyle = '#2d9e35';
                ctx.fill();
                ctx.strokeStyle = '#1a5c20';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;

        // --- ZOMBI ---
        const _zbR = 16, _zbHP = 100;
        for (const _zb of _zombies) {
            if (!_zb || _zb.hp < 0) continue;
            const _zbx = _zb.x, _zby = _zb.y;
            if (_zbx + 70 < visLeft || _zbx - 70 > visRight || _zby + 70 < visTop || _zby - 70 > visBottom) continue;
            ctx.save();
            ctx.translate(_zbx, _zby);

            // Cerc rosu (ring) — in spatiu mondial, inainte de rotatie
            ctx.beginPath();
            ctx.arc(0, 0, _zbR + 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(233,69,96,0.10)';
            ctx.fill();
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.45;
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.rotate(_zb.angle);

            // Brate subțiri, scurte, apropiate
            ctx.fillStyle = '#1a5220';
            ctx.strokeStyle = '#0d3010';
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.roundRect(_zbR - 3, -8, 11, 4, 1); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.roundRect(_zbR - 3, 4, 11, 4, 1); ctx.fill(); ctx.stroke();

            // Corp exterior: octagon, verde inchis
            ctx.beginPath();
            for (let _oi = 0; _oi < 8; _oi++) {
                const _oa = (_oi / 8) * Math.PI * 2 - Math.PI / 8;
                _oi === 0 ? ctx.moveTo(Math.cos(_oa) * _zbR, Math.sin(_oa) * _zbR)
                          : ctx.lineTo(Math.cos(_oa) * _zbR, Math.sin(_oa) * _zbR);
            }
            ctx.closePath();
            ctx.fillStyle = '#1e6b22';
            ctx.fill();
            ctx.strokeStyle = '#123d14';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Corp interior: hexagon rutat, putin mai deschis
            const _zbIR = _zbR * 0.52;
            ctx.beginPath();
            for (let _ii = 0; _ii < 6; _ii++) {
                const _ia = (_ii / 6) * Math.PI * 2 + Math.PI / 6;
                _ii === 0 ? ctx.moveTo(Math.cos(_ia) * _zbIR, Math.sin(_ia) * _zbIR)
                          : ctx.lineTo(Math.cos(_ia) * _zbIR, Math.sin(_ia) * _zbIR);
            }
            ctx.closePath();
            ctx.fillStyle = '#27832e';
            ctx.fill();

            ctx.restore();

            // Bara de viata
            const _zhpRatio = Math.max(0, _zb.hp / _zbHP);
            const _zbW = 36, _zbH = 3;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath(); ctx.roundRect(_zbx - _zbW / 2, _zby - _zbR - 14, _zbW, _zbH, 2); ctx.fill();
            ctx.fillStyle = _zhpRatio > 0.5 ? '#44dd44' : _zhpRatio > 0.25 ? '#dddd22' : '#dd3333';
            ctx.beginPath(); ctx.roundRect(_zbx - _zbW / 2, _zby - _zbR - 14, _zbW * _zhpRatio, _zbH, 2); ctx.fill();
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
            _prevPlayerPos[pid] = { x: px, y: py };
            _footTimers[pid] = (_footTimers[pid] || 0) + _pDist;
            if (_footTimers[pid] >= 35 && _footsteps.length < 80) {
                _footTimers[pid] = 0;
                _footsteps.push({ x: px, y: py, t: performance.now() });
            }

            if (!isMe && (px + 80 < visLeft || px - 80 > visRight || py + 80 < visTop || py - 80 > visBottom)) continue;
            const sqSize = 90;
            const ringR  = sqSize / 2 + 8;
            const ringColor = isMe ? '#00ff88' : '#e94560';
            const ringFill  = isMe ? 'rgba(0,255,136,0.13)' : 'rgba(233,69,96,0.13)';

            // Ring: filled + stroked, drawn BEFORE the character so it appears behind
            ctx.save();
            ctx.translate(px, py);
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.fillStyle = ringFill;
            ctx.fill();
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.55;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.restore();

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(pangle);
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
            ctx.restore();

            // Flash + Nume: un singur save/restore
            const flashAge = flashTimers[player.id] !== undefined
                ? performance.now() - flashTimers[player.id] : Infinity;
            const barH = isMe ? 6 : 4;
            const ammoH = 6;
            const barW = isMe ? 70 : 52;
            ctx.save();
            ctx.translate(px, py);
            if (flashAge < 280) {
                ctx.globalAlpha = (1 - flashAge / 280) * 0.7;
                ctx.beginPath();
                ctx.arc(0, 0, sqSize / 2 + 2, 0, Math.PI * 2);
                ctx.fillStyle = '#ff2020';
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.font        = `bold ${isMe ? 14 : 12}px Lexend, Arial`;
            ctx.textAlign   = 'center';
            ctx.strokeStyle = '#000000cc';
            ctx.lineWidth   = 3;
            ctx.lineJoin    = 'round';
            ctx.fillStyle   = isMe ? '#00ff88' : '#ffffff';
            ctx.strokeText(player.name, 0, -ringR - (isMe ? 44 : 38));
            ctx.fillText(player.name,   0, -ringR - (isMe ? 44 : 38));
            ctx.restore();

            // Bara HP (toti jucatorii) — folosim latestHp pentru update instant, fara delay de interpolatie
            const hpRatio = Math.max(0, (latestHp[player.id] ?? player.hp) / player.maxHp);
            const barX    = px - barW / 2;
            const barY    = py - ringR - (isMe ? 32 : 28);
            ctx.fillStyle = '#00000070';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
            ctx.fillStyle = hpRatio > 0.5 ? '#00ff88' : hpRatio > 0.25 ? '#ff8c00' : '#e94560';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW * hpRatio, barH, 2); ctx.fill();

            if (isMe) {
                drawAmmoBar(ctx, barX, barY + barH + 4, barW, ammoH, ammoState);
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
            if (nowDN - damageNumbers[i].startTime >= 650) damageNumbers.splice(i, 1);
        }
        if (damageNumbers.length > 0) {
            ctx.font        = `bold ${Math.round(22 / ZOOM)}px Lexend, Arial`; // marime fixa — fara re-parse per numar
            ctx.textAlign   = 'center';
            ctx.strokeStyle = '#000000bb';
            ctx.lineWidth   = 3 / ZOOM;
            ctx.fillStyle   = '#ff4444';
            for (const dn of damageNumbers) {
                const t  = (nowDN - dn.startTime) / 650;
                ctx.globalAlpha = Math.max(0, 1 - t);
                const dnX = dn.x + dn.dir * t * 50;
                const dnY = dn.y - t * 35;
                ctx.strokeText(`-${dn.amount}`, dnX, dnY);
                ctx.fillText(`-${dn.amount}`,   dnX, dnY);
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // --- TIMER ZONA (screen space, proportional) ---
        if (!gameEnded) {
            if (gameControl.countdownEndTime) {
                _zoneTimerAlpha = Math.min(1, (performance.now() - gameControl.countdownEndTime) / 500);
            }
            if (_zoneTimerAlpha > 0) {
                ctx.save();
                ctx.scale(dpr, dpr);
                ctx.globalAlpha = _zoneTimerAlpha;
                ctx.textAlign = 'center';
                const _zFontSz = Math.round(Math.min(W, H) * 0.028);
                ctx.font = `bold ${_zFontSz}px Lexend, Arial`;
                const _zt = _zone.waitTimer;
                const _zLabel = _zt > 0
                    ? `Zona se restrange in ${Math.ceil(_zt)}s`
                    : (_zone.r > 0 ? 'Zona se restrange!' : 'Zona inchisa!');
                const _zColor = _zt > 0 ? '#ff8080' : '#ff2222';
                const _ztW = ctx.measureText(_zLabel).width + 24;
                const _ztH = _zFontSz + 12;
                const _ztX = W / 2, _ztY = Math.round(H * 0.07) + _zFontSz;
                ctx.fillStyle = 'rgba(0,0,0,0.58)';
                ctx.beginPath(); ctx.roundRect(_ztX - _ztW / 2, _ztY - _zFontSz, _ztW, _ztH, 7); ctx.fill();
                ctx.fillStyle = _zColor;
                ctx.fillText(_zLabel, _ztX, _ztY);
                ctx.restore();
            }
        }

        // --- VIGNETA ZONA (screen space, cand esti in afara) ---
        if (!gameEnded && _zone.r >= 0 && predX !== null) {
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

        // --- DEBUG OVERLAY (backtick to toggle) ---
        _dbgDrawMs = performance.now() - _drawStart;
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
                { text: `INTERP: buf ${stateBuffer.length}   age ${stateAgeMs}   delay ${INTERP_DELAY_MS}ms   cbul ${_clientBullets.length}`, color: '#cccccc' },
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
                    ? '<span class="wip-in-room">✓ în cameră</span>'
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
    if (btn) { btn.textContent = 'TRIMIS ✓'; btn.disabled = true; }
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
    initGame(currentNickname, char.img, stats, pendingRoom);
}


updateStatsUI();

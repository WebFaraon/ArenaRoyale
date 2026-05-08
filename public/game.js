// ============================================
// ARENA ROYALE - game.js
// ============================================

const ARENA_W = 2600;
const ARENA_H = 2600;
const VIEW_W  = 1300;
const VIEW_H  =  730;

// ---------- AUTH STATE ----------
let currentNickname = '';
let currentPassword = '';
let currentProfile  = null;

function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    document.getElementById('form-login').style.display    = isLogin ? 'flex' : 'none';
    document.getElementById('form-register').style.display = isLogin ? 'none' : 'flex';
}

function authSuccess(nickname, password, player) {
    currentNickname = nickname;
    currentPassword = password;
    currentProfile  = player;
    localStorage.setItem('ar_nickname', nickname);

    // Prioritate: DB dacă are valori salvate; altfel localStorage (fallback instant)
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
    prepopulateLobby();
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

    if (!nickname || !password) { errorEl.textContent = '⚠️ Completează toate câmpurile'; return; }

    btn.disabled = true;
    btnText.textContent = 'Se verifică...';
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
            btnText.textContent = 'INTRU ÎN JOC';
            return;
        }
        authSuccess(nickname, password, data.player);
    } catch {
        errorEl.textContent = '⚠️ Eroare de rețea. Încearcă din nou.';
        btn.disabled = false;
        btnText.textContent = 'INTRU ÎN JOC';
    }
}

async function doRegister() {
    const nickname = (document.getElementById('reg-nickname').value || '').trim();
    const password = document.getElementById('reg-password').value || '';
    const confirm  = document.getElementById('reg-confirm').value  || '';
    const errorEl  = document.getElementById('reg-error');
    const btn      = document.getElementById('reg-btn');
    const btnText  = btn.querySelector('.btn-text');

    if (!nickname || !password || !confirm) { errorEl.textContent = '⚠️ Completează toate câmpurile'; return; }
    if (password !== confirm) { errorEl.textContent = '⚠️ Parolele nu coincid'; return; }

    btn.disabled = true;
    btnText.textContent = 'Se creează...';
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
            btnText.textContent = 'CREEAZĂ CONT';
            return;
        }
        authSuccess(nickname, password, data.player);
    } catch {
        errorEl.textContent = '⚠️ Eroare de rețea. Încearcă din nou.';
        btn.disabled = false;
        btnText.textContent = 'CREEAZĂ CONT';
    }
}

// ---------- NAVIGARE & CAMERĂ ----------
let pendingRoom = null;

function prepopulateLobby() {
    // Numele în badge
    const nameDisplay = document.getElementById('char-name-display');
    if (nameDisplay) nameDisplay.textContent = currentNickname || 'JUCĂTOR';
    // Hidden input pentru compatibilitate cu joinGame()
    const nameInput = document.getElementById('input-name');
    if (nameInput) nameInput.value = currentNickname || '';

    if (currentProfile && currentProfile.avatar) {
        const preview     = document.getElementById('preview');
        const placeholder = document.getElementById('placeholder');
        if (preview) {
            preview.src = currentProfile.avatar;
            preview.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
    }

    updateStatsUI();
}

function leaveWaiting() {
    returnToLobby();
}

function returnToLobby() {
    // Distruge joystick-urile, event listener-ele și RAF din sesiunea anterioară
    // Fără asta, la jocul următor ar exista instanțe duplicate → joystick blocat
    if (window._gameCleanup) {
        window._gameCleanup();
        window._gameCleanup = null;
    }

    // Deconectează socket-ul — declanșează imediat 'disconnect' pe server
    // Server-ul curăță camera: o șterge dacă e goală, transferă host dacă mai sunt jucători
    if (window._gameSocket) {
        window._gameSocket.disconnect();
        window._gameSocket = null;
    }

    // Ascunde toate ecranele de joc
    ['screen-game', 'screen-gameover', 'screen-waiting'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // --- Reset complet sala de așteptare ---
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
    if (goMsg)   goMsg.textContent   = 'Ai fost eliminat din arenă';
    if (goStats) goStats.style.display = 'none';
    const rematchBtn = document.getElementById('btn-rematch');
    if (rematchBtn) { rematchBtn.disabled = false; rematchBtn.textContent = '🔄 JOACĂ DIN NOU'; }

    // --- Reset input cameră din lobby ---
    const codeInput = document.getElementById('room-code-input');
    if (codeInput) codeInput.value = '';
    const roomErrMsg = document.getElementById('room-error-msg');
    if (roomErrMsg) roomErrMsg.textContent = '';
    const errMsg = document.getElementById('error-msg');
    if (errMsg) errMsg.textContent = '';

    pendingRoom = null;

    // Revine la lobby cu sesiunea păstrată (fără re-login)
    document.getElementById('screen-lobby').style.display = 'flex';
    prepopulateLobby();
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
    status.textContent   = '⏳ Se încarcă...';
    tbody.innerHTML      = '';
    try {
        const res  = await fetch('/api/leaderboard');
        const data = await res.json();
        renderLeaderboardOverlay(data);
    } catch {
        status.textContent = '⚠️ Eroare la încărcare.';
    }
}

function renderLeaderboardOverlay(data) {
    const status = document.getElementById('lbo-status');
    const tbody  = document.getElementById('lbo-body');
    if (!data || data.length === 0) {
        tbody.innerHTML    = '';
        status.textContent = '🎮 Niciun jucător înregistrat încă.';
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

// Creează cameră nouă
function startCreate() {
    const errEl = document.getElementById('error-msg');
    const preview = document.getElementById('preview');
    if (!preview || !preview.src || preview.style.display === 'none') {
        errEl.textContent = '⚠️ Adaugă imaginea personajului tău!';
        return;
    }
    errEl.textContent = '';
    pendingRoom = { action: 'create' };
    joinGame();
}

// Intră cu cod
function startJoin() {
    const code  = (document.getElementById('room-code-input').value || '').trim().toUpperCase();
    const roomErr = document.getElementById('room-error-msg');
    const errEl   = document.getElementById('error-msg');
    if (code.length !== 5) {
        roomErr.textContent = '⚠️ Codul trebuie să aibă 5 litere.';
        return;
    }
    const preview = document.getElementById('preview');
    if (!preview || !preview.src || preview.style.display === 'none') {
        errEl.textContent = '⚠️ Adaugă imaginea personajului tău!';
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

    // Enter pe câmpurile de login
    ['login-nickname', 'login-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });

    // Enter pe câmpurile de register
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
    if (valHp)  valHp.textContent  = (500 + stats.hp  * 30) + ' HP';
    if (valDmg) valDmg.textContent = (10  + stats.dmg *  4) + ' DMG';
    if (valSpd) valSpd.textContent = (2.0 + stats.spd * 0.3).toFixed(1) + ' SPD';
    if (barHp)  barHp.style.width  = (stats.hp  / 10 * 100) + '%';
    if (barDmg) barDmg.style.width = (stats.dmg / 10 * 100) + '%';
    if (barSpd) barSpd.style.width = (stats.spd / 10 * 100) + '%';
    updateBuildType();
}

function updateBuildType() {
    const buildEl = document.getElementById('build-type');
    const max = Math.max(stats.hp, stats.dmg, stats.spd);
    let text = '';
    if (stats.hp === stats.dmg && stats.dmg === stats.spd) text = '⚖️ Build Echilibrat';
    else if (stats.hp  === max && stats.hp  >= 4) text = '🛡️ Tank — Rezistent dar lent';
    else if (stats.dmg === max && stats.dmg >= 4) text = '💥 Sniper — Lovești tare dar fragil';
    else if (stats.spd === max && stats.spd >= 4) text = '⚡ Runner — Super rapid dar slab';
    else text = '🎯 Build Mixt';
    buildEl.textContent = text;
}

// ---------- UPLOAD IMAGINE ----------
document.addEventListener('DOMContentLoaded', () => {
    const imgInput = document.getElementById('input-image');
    if (!imgInput) return;
    imgInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            const preview     = document.getElementById('preview');
            const placeholder = document.getElementById('placeholder');
            const img = new Image();
            img.onload = function() {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width  = 200; tempCanvas.height = 200;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.clearRect(0, 0, 200, 200);
                const srcSize = Math.min(img.width, img.height);
                const srcX = (img.width  - srcSize) / 2;
                const srcY = (img.height - srcSize) / 2;
                tempCtx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, 200, 200);
                const compressed = tempCanvas.toDataURL('image/png');
                if (preview)     { preview.src = compressed; preview.style.display = 'block'; }
                if (placeholder) { placeholder.style.display = 'none'; }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
});

// ---------- INTRA IN JOC ----------
function joinGame() {
    const name    = currentNickname;
    const preview = document.getElementById('preview');
    if (!name || !preview || !preview.src || preview.style.display === 'none') return;

    // Salvam avatarul in Supabase (fire and forget)
    if (currentNickname && currentPassword && preview.src) {
        fetch('/api/profile/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, password: currentPassword, avatar: preview.src })
        }).catch(() => {});
        fetch('/api/profile/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname: currentNickname, password: currentPassword, stat_hp: stats.hp, stat_dmg: stats.dmg, stat_spd: stats.spd })
        }).catch(() => {});
    }

    goFullscreen();
    document.getElementById('screen-lobby').style.display   = 'none';
    document.getElementById('screen-waiting').style.display = 'flex';
    initGame(name, preview.src, stats, pendingRoom);
}

// ---------- FULLSCREEN ----------
function goFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen)       el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
}

// ---------- ASSETS ----------
const bulletImg = new Image();
bulletImg.src = '/assets/bullets/ninja_bullet.png';

// ---------- INITIALIZARE ----------
function initGame(playerName, playerImage, playerStats, roomAction) {
    const canvas = document.getElementById('gameCanvas');
    const ctx    = canvas.getContext('2d');

    function resizeCanvas() {
        const vv   = window.visualViewport;
        const cssW = vv ? vv.width  : window.innerWidth;
        const cssH = vv ? vv.height : window.innerHeight;
        const dpr  = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width  = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);

    const socket = io();

    const playerData = { name: playerName, image: playerImage, stats: playerStats };

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
        document.getElementById('room-error-msg').textContent   = '⚠️ ' + msg;
        socket.disconnect();
    });

    const playerImages = {};
    socket.on('player-image', (data) => {
        if (!playerImages[data.id]) {
            const img = new Image();
            img.src = data.image;
            playerImages[data.id] = img;
        }
    });

    socket.on('waiting-room', (playerList) => {
        const grid = document.getElementById('waiting-players');
        grid.innerHTML = '';
        playerList.forEach(p => {
            const card = document.createElement('div');
            card.className = 'waiting-card';
            card.innerHTML = `
                <img src="${p.image}" onerror="this.style.background='#e94560';this.src=''">
                <span>${p.name}</span>
            `;
            grid.appendChild(card);
        });
        document.getElementById('waiting-count').textContent = playerList.length;
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
        showCountdown();
        document.getElementById('btn-rematch').onclick = () => {
            socket.emit('rematch');
            const btn = document.getElementById('btn-rematch');
            btn.disabled = true;
            btn.textContent = '⏳ Așteptând...';
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
    const joystickSize = Math.min(80, window.innerWidth * 0.18);

    const joystickLeft = nipplejs.create({
        zone: document.getElementById('zone-left'),
        mode: 'dynamic', color: '#ffffff', size: joystickSize
    });

    const joystickRight = nipplejs.create({
        zone: document.getElementById('zone-right'),
        mode: 'dynamic', color: '#e94560', size: joystickSize
    });

    let moveDir      = { x: 0, y: 0 };
    let shootDir     = { x: 0, y: 0 };
    let isShooting   = false;
    let aimStartTime = null;
    let gameEnded    = false;
    let myAngle      = 0;
    let moveAngle    = 0;

    let predX = null, predY = null, predSpeed = 132; // px/sec (actualizat din meta)
    const stateBuffer  = []; // [{t, players:{id:{x,y,angle,hp,maxHp,alive,kills,name}}, bullets:[], zone:{}}]
    const playerMeta   = {}; // {id: {speed, maxHp}} — static per rundă, trimis o dată
    // Aplică metadata trimisă de server înainte ca startGameLoop să fie apelat
    if (gameControl.pendingMeta) { Object.assign(playerMeta, gameControl.pendingMeta); delete gameControl.pendingMeta; }
    const hitEffects   = [];
    const prevHp         = {};
    const damageNumbers  = [];
    const obstacleShakes = {};
    const flashTimers    = {}; // {playerId: timestamp} — flash roșu la primirea damage-ului

    let mouseActive = false;

    let lastMoveEmit   = 0;
    let lastShootEmit  = 0;
    let lastRotateEmit = 0;
    const EMIT_MS      = 50;   // max 20 update-uri/sec — matching server tick rate
    const INTERP_DELAY = 60;   // randăm cu 60ms întârziere (un tick+) — mai puțin mismatch vizual

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
        // Trimite doar când direcția s-a schimbat (nu la fiecare tastă)
        if (moveDir.x !== lastSentMove.x || moveDir.y !== lastSentMove.y) {
            socket.emit('move', moveDir);
            lastSentMove.x = moveDir.x;
            lastSentMove.y = moveDir.y;
        }
    }

    // Handleri numiți — necesari pentru removeEventListener la cleanup
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
        const W  = canvas.width  / Math.min(window.devicePixelRatio || 1, 2);
        const H  = canvas.height / Math.min(window.devicePixelRatio || 1, 2);
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

    // Cleanup global: distrug joystick-urile, event listener-ele și RAF-ul
    // Apelat de returnToLobby() pentru a preveni instanțe duplicate la jocul următor
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

    // gs: [pArr, bArr, zArr]
    // pArr: [id, x, y, angle, hp, maxHp, alive, kills, name]
    // bArr: [id, x, y, dirX, dirY]
    // zArr: [x, y, radius, shrinking]
    socket.on('gs', ([pArr, bArr, zArr]) => {
        const now = performance.now();
        const entry = {
            t:       now,
            players: {},
            bullets: bArr.map(([id, x, y, dx, dy]) => ({ id, x, y, dx, dy, radius: 6 })),
            zone:    { x: zArr[0], y: zArr[1], radius: zArr[2], shrinking: !!zArr[3] }
        };

        pArr.forEach(([id, x, y, angle, hp, maxHp, alive, kills, name]) => {
            entry.players[id] = { id, x, y, angle, hp, maxHp, alive: !!alive, kills, name };
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
            if (newKills > prevKills) showKillNotif(newKills);
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
    });

    socket.on('obstacle-hit', ({ idx }) => {
        obstacleShakes[idx] = performance.now();
    });

    socket.on('damage-dealt', ({ amount, x, y }) => {
        damageNumbers.push({ amount, x, y, dir: Math.random() > 0.5 ? 1 : -1, startTime: performance.now() });
    });

    socket.on('kill-event', ({ killerName, victimName, byZone }) => {
        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        entry.textContent = byZone
            ? `☠️ ${victimName} a fost eliminat de zonă`
            : `${killerName} l-a eliminat pe ${victimName}`;
        killFeedEl.appendChild(entry);
        setTimeout(() => { if (entry.parentNode) entry.parentNode.removeChild(entry); }, 4000);
        while (killFeedEl.children.length > 5) killFeedEl.removeChild(killFeedEl.firstChild);
    });

    socket.on('eliminated', ({ placement, totalPlayers, killedBy, kills } = {}) => {
        gameEnded = true;
        moveDir.x = 0; moveDir.y = 0; isShooting = false; aimStartTime = null;
        socket.emit('move', { x: 0, y: 0 });
        socket.emit('stop-shoot');
        setTimeout(() => {
            const medals = { 2: '🥈', 3: '🥉' };
            const medal  = medals[placement] || '';
            document.getElementById('gameover-title').textContent =
                `${medal} LOC ${placement} DIN ${totalPlayers}`;
            document.getElementById('gameover-msg').textContent = killedBy
                ? `Eliminat de ${killedBy}`
                : 'Eliminat de zonă ☠️';
            document.getElementById('stat-round-kills').textContent = kills || 0;
            document.getElementById('round-stats-section').style.display = 'block';
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 2000);
    });

    socket.on('winner', ({ kills } = {}) => {
        gameEnded = true;
        moveDir.x = 0; moveDir.y = 0; isShooting = false; aimStartTime = null;
        socket.emit('move', { x: 0, y: 0 });
        socket.emit('stop-shoot');
        setTimeout(() => {
            document.getElementById('gameover-title').textContent = '🏆 LOC 1 — AI CÂȘTIGAT!';
            document.getElementById('gameover-msg').textContent   = 'Ești ultimul supraviețuitor!';
            document.getElementById('stat-round-kills').textContent = kills || 0;
            document.getElementById('round-stats-section').style.display = 'block';
            document.getElementById('screen-gameover').style.display = 'flex';
        }, 2000);
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
        for (const k in obstacleShakes) delete obstacleShakes[k];
        for (const k in flashTimers)    delete flashTimers[k];
        killFeedEl.innerHTML = '';
        myKillsEl.textContent = '0';
        document.getElementById('kill-notif').classList.remove('active');
        keysHeld.clear();
        document.getElementById('round-stats-section').style.display = 'none';
        document.getElementById('gameover-title').textContent = '💀 ELIMINAT!';
        document.getElementById('gameover-msg').textContent   = 'Ai fost eliminat din arenă';
    }
    gameControl.reset = resetForNewGame;

    socket.on('rematch-vote', ({ count, total }) => {
        const btn = document.getElementById('btn-rematch');
        btn.textContent = `🔄 JOACĂ DIN NOU (${count}/${total})`;
    });

    socket.on('game-rematch', ({ isHost, obstacles: newObs, playersMeta }) => {
        if (newObs) obstacles = newObs;
        if (playersMeta) Object.assign(playerMeta, playersMeta);
        resetForNewGame();
        const btn = document.getElementById('btn-rematch');
        btn.disabled    = false;
        btn.textContent = '🔄 JOACĂ DIN NOU';
        document.getElementById('screen-gameover').style.display = 'none';
        document.getElementById('screen-game').style.display     = 'none';
        document.getElementById('screen-waiting').style.display  = 'flex';
        document.getElementById('btn-start-game').style.display  = isHost ? 'block' : 'none';
        document.getElementById('waiting-sub-msg').style.display = isHost ? 'none'  : 'block';
    });

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
        if (!next) return prev; // folosim ultimul state dacă suntem în față

        const span = Math.max(next.t - prev.t, 1);
        const t    = Math.min((renderTime - prev.t) / span, 1);

        const players = {};
        for (const id in prev.players) {
            const p0 = prev.players[id];
            const p1 = next.players[id];
            if (p1) {
                // Interpolare unghi cu wrap corect (evită rotație 360° la schimbare semn)
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

        // Interpolează gloanțele după ID între prev și next (evită 120px salturi la 50ms)
        const nextBulletMap = {};
        for (const b of next.bullets) nextBulletMap[b.id] = b;

        const bullets = [];
        for (const b0 of prev.bullets) {
            const b1 = nextBulletMap[b0.id];
            if (b1) {
                bullets.push({ ...b1, x: b0.x + (b1.x - b0.x) * t, y: b0.y + (b1.y - b0.y) * t });
                delete nextBulletMap[b0.id];
            }
            // gloanțe moarte între prev→next dispar natural
        }
        // Gloanțe noi (nu existau în prev): le retragem cu un tick ca să apară din spawn,
        // nu teleportate deja 90px în față. Interpolarea normală le mișcă de acolo înainte.
        const tickSec = span / 1000;
        for (const id in nextBulletMap) {
            const b = nextBulletMap[id];
            bullets.push({
                ...b,
                x: b.x - b.dx * 1800 * tickSec,
                y: b.y - b.dy * 1800 * tickSec
            });
        }

        return { players, bullets, zone: next.zone };
    }

    // ---------- BUCLA DE RANDARE ----------
    let lastTime  = 0;
    function draw(timestamp) {
        rafId = requestAnimationFrame(draw);

        const dpr  = Math.min(window.devicePixelRatio || 1, 2);
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

        // Emit shoot after 0.5s aim delay
        if (isShooting && !gameEnded && !gameControl.countdownActive) {
            const nowShoot = performance.now();
            if (aimStartTime && nowShoot - aimStartTime >= 500 && nowShoot - lastShootEmit >= EMIT_MS) {
                socket.emit('shoot', shootDir);
                lastShootEmit = nowShoot;
            }
        }

        const me   = rState.players[socket.id];
        const camX = predX !== null ? predX : (me ? me.x : ARENA_W / 2);
        const camY = predY !== null ? predY : (me ? me.y : ARENA_H / 2);

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
        rState.bullets.forEach(bullet => {
            // dx/dy sunt direcție normalizată (nu viteza), deci atan2 direct
            const angle = Math.atan2(bullet.dy || 0, bullet.dx || 0);
            const size  = (bullet.radius || 6) * 6.5;
            ctx.save();
            ctx.translate(bullet.x, bullet.y);
            ctx.rotate(angle + Math.PI / 4);
            ctx.drawImage(bulletImg, -size / 2, -size / 2, size, size);
            ctx.restore();
        });

        // --- JUCATORI ---
        ctx.font      = 'bold 14px Rajdhani, Arial';
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
            const size = 90;
            const ringR = size * 0.5;
            const ringColor = isMe ? '#00ff88' : '#e94560';

            // Inel colorat sub sprite (fără rotație) — localizare imediată
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

            // Sprite jucător
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(pangle);
            const img = playerImages[player.id];
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                ctx.fillStyle = ringColor;
                ctx.fill();
            }
            ctx.restore();

            // Flash roșu când primește damage
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
            const barW   = isMe ? 70 : 52;
            const nameY  = py - ringR - 38;
            ctx.save();
            ctx.font        = `bold ${isMe ? 14 : 12}px Rajdhani, Arial`;
            ctx.textAlign   = 'center';
            ctx.strokeStyle = '#000000cc';
            ctx.lineWidth   = 3;
            ctx.lineJoin    = 'round';
            ctx.fillStyle   = isMe ? '#00ff88' : '#ffffff';
            ctx.strokeText(player.name, px, nameY);
            ctx.fillText(player.name,   px, nameY);
            ctx.restore();

            // Bara HP (toți jucătorii)
            const hpRatio = Math.max(0, player.hp / player.maxHp);
            const barX    = px - barW / 2;
            const barY    = py - ringR - 28;
            ctx.fillStyle = '#00000070';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
            ctx.fillStyle = hpRatio > 0.5 ? '#00ff88' : hpRatio > 0.25 ? '#ff8c00' : '#e94560';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW * hpRatio, barH, 2); ctx.fill();
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
            // Flash fill în centru (doar la impact)
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
            ctx.font         = `bold ${Math.round((22 + t * 8) / ZOOM)}px Rajdhani, Arial`;
            ctx.strokeStyle  = '#00000099';
            ctx.lineWidth    = 3 / ZOOM;
            ctx.fillStyle    = '#ff3333';
            const dnX = dn.x + dn.dir * t * 52;
            const dnY = dn.y - t * 22;
            ctx.strokeText(`-${dn.amount}`, dnX, dnY);
            ctx.fillText(`-${dn.amount}`,   dnX, dnY);
            ctx.restore();
        }

        ctx.restore();

        // --- TIMER ZONA ---
        if (rState && !rState.zone.shrinking && gameControl.zoneStartsAt && !gameControl.countdownActive) {
            const secsLeft = Math.ceil((gameControl.zoneStartsAt - Date.now()) / 1000);
            if (secsLeft > 0) {
                ctx.save();
                ctx.scale(dpr, dpr);
                const label = `⚠ Zona se pornește în ${secsLeft}s`;
                ctx.font      = `bold ${Math.max(13, W * 0.018)}px Orbitron, sans-serif`;
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
            ctx.font      = `bold ${Math.max(16, W * 0.022)}px Orbitron, sans-serif`;
            ctx.fillStyle = '#ff4444';
            ctx.fillText('CONEXIUNE PIERDUTĂ', W / 2, H / 2 + 4);
            ctx.font      = `${Math.max(12, W * 0.016)}px Rajdhani, sans-serif`;
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText('Serverul nu răspunde. Reîncarcă pagina.', W / 2, H / 2 + Math.max(24, W * 0.038));
            ctx.restore();
        }
    }

    draw();
}

updateStatsUI();

// ============================================
// ARENA ROYALE - game.js
// ============================================

const ARENA_W = 2000;
const ARENA_H = 2000;
const VIEW_W  = 1300;
const VIEW_H  =  730;

// ---------- SELECTIE CAMERA ----------
let pendingRoom = null; // { action: 'create' } | { action: 'join', code: 'XXXXX' }

function selectCreate() {
    pendingRoom = { action: 'create' };
    document.getElementById('screen-room').style.display  = 'none';
    document.getElementById('screen-lobby').style.display = 'flex';
}

function goBackToRoom() {
    document.getElementById('screen-lobby').style.display = 'none';
    document.getElementById('screen-room').style.display  = 'flex';
}

function selectJoin() {
    const code  = (document.getElementById('room-code-input').value || '').trim().toUpperCase();
    const errEl = document.getElementById('room-error-msg');
    if (code.length !== 5) {
        errEl.textContent = '⚠️ Codul trebuie să aibă 5 litere.';
        return;
    }
    errEl.textContent = '';
    pendingRoom = { action: 'join', code };
    document.getElementById('screen-room').style.display  = 'none';
    document.getElementById('screen-lobby').style.display = 'flex';
}

// Permite si Enter in input-ul de cod
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('room-code-input');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') selectJoin(); });
});

const MOVE_THRESHOLD  = 0.5;
const SHOOT_THRESHOLD = 0.25;

// ---------- STATISTICI ----------
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
}

function updateStatsUI() {
    const remaining = MAX_POINTS - pointsUsed();
    document.getElementById('points-display').textContent = remaining;
    document.querySelector('.points-left').style.color = remaining === 0 ? '#e94560' : '#00ff88';
    document.getElementById('val-hp').textContent  = stats.hp;
    document.getElementById('val-dmg').textContent = stats.dmg;
    document.getElementById('val-spd').textContent = stats.spd;
    document.getElementById('bar-hp').style.width  = (stats.hp  / 10 * 100) + '%';
    document.getElementById('bar-dmg').style.width = (stats.dmg / 10 * 100) + '%';
    document.getElementById('bar-spd').style.width = (stats.spd / 10 * 100) + '%';
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
document.getElementById('input-image').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const preview     = document.getElementById('preview');
        const placeholder = document.getElementById('placeholder');
        const img = new Image();
        img.onload = function() {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width  = 200;
            tempCanvas.height = 200;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.clearRect(0, 0, 200, 200);
            const srcSize = Math.min(img.width, img.height);
            const srcX    = (img.width  - srcSize) / 2;
            const srcY    = (img.height - srcSize) / 2;
            tempCtx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, 200, 200);
            const compressedSrc = tempCanvas.toDataURL('image/png');
            preview.src = compressedSrc;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// ---------- INTRA IN JOC ----------
function joinGame() {
    const name    = document.getElementById('input-name').value.trim();
    const errorEl = document.getElementById('error-msg');
    const preview = document.getElementById('preview');

    if (!name) {
        errorEl.textContent = '⚠️ Introdu un nume pentru personajul tău!';
        errorEl.style.animation = 'none';
        setTimeout(() => errorEl.style.animation = '', 10);
        return;
    }
    if (!preview.src || preview.style.display === 'none') {
        errorEl.textContent = '⚠️ Adaugă imaginea personajului tău!';
        errorEl.style.animation = 'none';
        setTimeout(() => errorEl.style.animation = '', 10);
        return;
    }
    errorEl.textContent = '';
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

// ---------- INITIALIZARE ----------
function initGame(playerName, playerImage, playerStats, roomAction) {
    const canvas = document.getElementById('gameCanvas');
    const ctx    = canvas.getContext('2d');

    function resizeCanvas() {
        const dpr     = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = Math.floor(window.innerWidth  * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        canvas.style.width  = window.innerWidth  + 'px';
        canvas.style.height = window.innerHeight + 'px';
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const socket = io();

    const playerData = { name: playerName, image: playerImage, stats: playerStats };

    if (roomAction.action === 'create') {
        socket.emit('create-room', playerData);
    } else {
        socket.emit('join-room', { code: roomAction.code, ...playerData });
    }

    // Raspuns la creare camera
    socket.on('room-created', ({ code }) => {
        document.getElementById('waiting-code-display').textContent = code;
        document.getElementById('btn-start-game').style.display     = 'block';
        document.getElementById('waiting-sub-msg').style.display    = 'none';
    });

    // Raspuns la intrare in camera
    socket.on('room-joined', ({ code }) => {
        document.getElementById('waiting-code-display').textContent = code;
    });

    // Daca devii host (hostul anterior a plecat)
    socket.on('host-transferred', () => {
        document.getElementById('btn-start-game').style.display  = 'block';
        document.getElementById('waiting-sub-msg').style.display = 'none';
    });

    // Eroare la join (cod invalid, joc inceput etc.)
    socket.on('room-error', (msg) => {
        // Ne intoarcem la ecranul de selectie camera cu eroarea
        document.getElementById('screen-waiting').style.display = 'none';
        document.getElementById('screen-room').style.display    = 'flex';
        document.getElementById('room-error-msg').textContent   = '⚠️ ' + msg;
        socket.disconnect();
    });

    // Imaginile jucatorilor
    const playerImages = {};
    socket.on('player-image', (data) => {
        if (!playerImages[data.id]) {
            const img = new Image();
            img.src = data.image;
            playerImages[data.id] = img;
        }
    });

    // ---------- SALA DE ASTEPTARE ----------
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

    socket.on('game-start', () => {
        document.getElementById('screen-waiting').style.display = 'none';
        document.getElementById('screen-game').style.display    = 'block';
        startGameLoop(socket, canvas, ctx, playerImages);
    });

    socket.on('game-reset', () => { location.reload(); });

    // Expunem startGame global (apelat din HTML)
    window._gameSocket = socket;
}

function startGame() {
    if (window._gameSocket) window._gameSocket.emit('start-game');
}

// ---------- BUCLA PRINCIPALA DE JOC ----------
function startGameLoop(socket, canvas, ctx, playerImages) {

    // ---------- JOYSTICK-URI ----------
    const joystickLeft = nipplejs.create({
        zone: document.getElementById('zone-left'),
        mode: 'dynamic', color: '#ffffff', size: 120
    });

    const joystickRight = nipplejs.create({
        zone: document.getElementById('zone-right'),
        mode: 'dynamic', color: '#e94560', size: 120
    });

    let moveDir    = { x: 0, y: 0 };
    let shootDir   = { x: 0, y: 0 };
    let isShooting = false;
    let myAngle    = 0;

    // Predictie client-side — pozitia locala nu asteapta server-ul
    let predX = null, predY = null, predSpeed = 3;

    // Throttle emit-uri joystick — max 20/sec (50ms) reduce freeze-urile
    let lastMoveEmit  = 0;
    let lastShootEmit = 0;
    const EMIT_MS = 50;

    joystickLeft.on('move', (evt, data) => {
        const force = data.force || 0;
        if (force >= MOVE_THRESHOLD) {
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) { moveDir.x = data.vector.x / len; moveDir.y = -data.vector.y / len; }
        } else {
            moveDir.x = 0; moveDir.y = 0;
        }
        if (!isShooting) {
            myAngle = Math.atan2(data.vector.y, -data.vector.x) + Math.PI / 2;
        }
        const now = performance.now();
        if (now - lastMoveEmit >= EMIT_MS) {
            socket.emit('move', moveDir);
            if (!isShooting) socket.emit('rotate', myAngle);
            lastMoveEmit = now;
        }
    });

    joystickLeft.on('end', () => {
        moveDir.x = 0; moveDir.y = 0;
        socket.emit('move', moveDir);
    });

    joystickRight.on('move', (evt, data) => {
        const force = data.force || 0;
        if (force >= SHOOT_THRESHOLD) {
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) { shootDir.x = data.vector.x / len; shootDir.y = -data.vector.y / len; }
            isShooting = true;
            myAngle = Math.atan2(data.vector.y, -data.vector.x) + Math.PI / 2;
            const now = performance.now();
            if (now - lastShootEmit >= EMIT_MS) {
                socket.emit('shoot', shootDir);
                socket.emit('rotate', myAngle);
                lastShootEmit = now;
            }
        } else {
            if (isShooting) { isShooting = false; socket.emit('stop-shoot'); }
        }
    });

    joystickRight.on('end', () => {
        isShooting = false;
        socket.emit('stop-shoot');
    });

    // ---------- STAREA JOCULUI ----------
    let gameState = null;

    socket.on('game-state', (state) => {
        gameState = state;
        const me = state.players.find(p => p.id === socket.id);
        if (me) {
            // Sincronizare viteza si reconciliere pozitie
            predSpeed = me.speed;
            if (predX === null) {
                predX = me.x; predY = me.y;
            } else if (Math.hypot(me.x - predX, me.y - predY) > 120) {
                // Daca ne-am deparat prea mult de server, snap inapoi
                predX = me.x; predY = me.y;
            }
            const hpPercent = (me.hp / me.maxHp) * 100;
            const hpBar     = document.getElementById('hp-bar-fill');
            hpBar.style.width      = hpPercent + '%';
            hpBar.style.background = hpPercent > 60 ? '#00ff88' : hpPercent > 30 ? '#ff8c00' : '#e94560';
        }
        document.getElementById('players-alive').textContent =
            state.players.filter(p => p.alive).length;
    });

    socket.on('eliminated', () => {
        document.getElementById('screen-gameover').style.display = 'flex';
    });

    socket.on('winner', () => {
        document.getElementById('gameover-title').textContent = '🏆 AI CÂȘTIGAT!';
        document.getElementById('gameover-msg').textContent   = 'Ești ultimul supraviețuitor!';
        document.getElementById('screen-gameover').style.display = 'flex';
    });

    // ---------- BUCLA DE RANDARE ----------
    function draw() {
        requestAnimationFrame(draw);

        const dpr  = Math.min(window.devicePixelRatio || 1, 2);
        const W    = canvas.width  / dpr;   // pixeli logici
        const H    = canvas.height / dpr;
        const ZOOM = Math.min(W / VIEW_W, H / VIEW_H);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!gameState) return;

        // --- PREDICTIE CLIENT-SIDE: miscam jucatorul local fara sa asteptam serverul ---
        if (predX !== null) {
            predX = Math.max(20, Math.min(ARENA_W - 20, predX + moveDir.x * predSpeed));
            predY = Math.max(20, Math.min(ARENA_H - 20, predY + moveDir.y * predSpeed));
        }

        const me   = gameState.players.find(p => p.id === socket.id);
        const camX = predX !== null ? predX : (me ? me.x : ARENA_W / 2);
        const camY = predY !== null ? predY : (me ? me.y : ARENA_H / 2);

        ctx.save();
        ctx.scale(dpr, dpr);                // corecție DPR — fix blur pe telefon
        ctx.translate(W / 2, H / 2);
        ctx.scale(ZOOM, ZOOM);
        ctx.translate(-camX, -camY);

        const visLeft   = camX - W / (2 * ZOOM);
        const visTop    = camY - H / (2 * ZOOM);
        const visRight  = visLeft + W / ZOOM;
        const visBottom = visTop  + H / ZOOM;

        // --- FUNDAL ---
        ctx.fillStyle = '#4a7c2f';
        ctx.fillRect(visLeft, visTop, W / ZOOM, H / ZOOM);

        // --- GRILA (un singur path — mult mai rapid) ---
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

        // --- MARGINILE HARTII ---
        ctx.strokeStyle = '#1a3a0a';
        ctx.lineWidth   = 8 / ZOOM;
        ctx.strokeRect(0, 0, ARENA_W, ARENA_H);

        // --- ZONA ---
        if (gameState.zone) {
            const zone = gameState.zone;
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

        // --- INDICATOR TRAIECTORIE ---
        if (isShooting && me && me.alive) {
            const dirX = -Math.sin(myAngle);
            const dirY =  Math.cos(myAngle);
            ctx.save();
            ctx.strokeStyle = '#ffffffaa';
            ctx.lineWidth   = 3 / ZOOM;
            ctx.setLineDash([12 / ZOOM, 8 / ZOOM]);
            ctx.beginPath();
            ctx.moveTo(camX + dirX * 50, camY + dirY * 50);
            ctx.lineTo(camX + dirX * 600, camY + dirY * 600);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(camX + dirX * 600, camY + dirY * 600, 8 / ZOOM, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff80';
            ctx.fill();
            ctx.restore();
        }

        // --- GLOANTE (fara shadowBlur — prea lent pe mobile) ---
        ctx.fillStyle = '#ffe020';
        gameState.bullets.forEach(bullet => {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.radius || 6, 0, Math.PI * 2);
            ctx.fill();
        });

        // --- JUCATORI ---
        ctx.font     = 'bold 14px Rajdhani, Arial';
        ctx.textAlign = 'center';
        gameState.players.forEach(player => {
            if (!player.alive) return;
            const isMe = player.id === socket.id;
            const px   = isMe && predX !== null ? predX : player.x;
            const py   = isMe && predY !== null ? predY : player.y;
            const size = 90;

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(player.angle || 0);
            const img = playerImages[player.id];
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                ctx.fillStyle = '#e94560';
                ctx.fill();
            }
            ctx.restore();

            // Numele — outline in loc de shadowBlur (mult mai rapid pe mobile)
            const nameY  = py - size / 2 - 26;
            ctx.strokeStyle = '#000000';
            ctx.lineWidth   = 3;
            ctx.lineJoin    = 'round';
            ctx.fillStyle   = isMe ? '#00ff88' : '#ffffff';
            ctx.strokeText(player.name, px, nameY);
            ctx.fillText(player.name,   px, nameY);

            // Bara HP
            const barW  = 70, barH = 6;
            const barX  = px - barW / 2;
            const barY  = py - size / 2 - 18;
            const hpRatio = player.hp / player.maxHp;
            ctx.fillStyle = '#00000060';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 3); ctx.fill();
            ctx.fillStyle = hpRatio > 0.5 ? '#00ff88' : hpRatio > 0.25 ? '#ff8c00' : '#e94560';
            ctx.beginPath(); ctx.roundRect(barX, barY, barW * hpRatio, barH, 3); ctx.fill();
        });

        ctx.restore();
    }

    draw();
}

updateStatsUI();
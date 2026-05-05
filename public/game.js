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
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
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

    // isShooting — true cand joystickul drept e apasat suficient
    // Folosit si pentru a afisa indicatorul de traiectorie
    let isShooting = false;

    // Unghiul curent al jucatorului nostru pentru indicator
    let myAngle = 0;

    joystickLeft.on('move', (evt, data) => {
        const force = data.force || 0;
        if (force >= MOVE_THRESHOLD) {
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) {
                moveDir.x =  data.vector.x / len;
                moveDir.y = -data.vector.y / len;
            }
        } else {
            moveDir = { x: 0, y: 0 };
        }
        socket.emit('move', moveDir);

        // Rotatie din miscare doar daca nu tragem
        if (!isShooting) {
            const angle = Math.atan2(data.vector.y, -data.vector.x) + Math.PI / 2;
            myAngle = angle;
            socket.emit('rotate', angle);
        }
    });

    joystickLeft.on('end', () => {
        moveDir = { x: 0, y: 0 };
        socket.emit('move', moveDir);
    });

    joystickRight.on('move', (evt, data) => {
        const force = data.force || 0;
        if (force >= SHOOT_THRESHOLD) {
            const len = Math.sqrt(data.vector.x ** 2 + data.vector.y ** 2);
            if (len > 0) {
                shootDir.x =  data.vector.x / len;
                shootDir.y = -data.vector.y / len;
            }
            isShooting = true;
            socket.emit('shoot', shootDir);

            // Joystickul de tragere are prioritate la rotatie
            const angle = Math.atan2(data.vector.y, -data.vector.x) + Math.PI / 2;
            myAngle = angle;
            socket.emit('rotate', angle);
        } else {
            isShooting = false;
            socket.emit('stop-shoot');
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
            const hpPercent = (me.hp / me.maxHp) * 100;
            const hpBar     = document.getElementById('hp-bar-fill');
            hpBar.style.width = hpPercent + '%';
            if (hpPercent > 60)      hpBar.style.background = '#00ff88';
            else if (hpPercent > 30) hpBar.style.background = '#ff8c00';
            else                     hpBar.style.background = '#e94560';
        }
        const alive = state.players.filter(p => p.alive).length;
        document.getElementById('players-alive').textContent = alive;
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
        const W    = canvas.width;
        const H    = canvas.height;
        const ZOOM = Math.min(W / VIEW_W, H / VIEW_H);
        ctx.clearRect(0, 0, W, H);
        if (!gameState) return;

        const me = gameState.players.find(p => p.id === socket.id);

        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(ZOOM, ZOOM);

        const worldX = me ? -me.x : -ARENA_W / 2;
        const worldY = me ? -me.y : -ARENA_H / 2;
        ctx.translate(worldX, worldY);

        const visLeft   = (me ? me.x : ARENA_W / 2) - W / (2 * ZOOM);
        const visTop    = (me ? me.y : ARENA_H / 2) - H / (2 * ZOOM);
        const visRight  = visLeft + W / ZOOM;
        const visBottom = visTop  + H / ZOOM;

        // --- FUNDAL VERDE ---
        ctx.fillStyle = '#4a7c2f';
        ctx.fillRect(visLeft, visTop, W / ZOOM, H / ZOOM);

        // --- GRILA ---
        ctx.strokeStyle = 'rgba(20, 50, 10, 0.25)';
        ctx.lineWidth   = 1 / ZOOM;
        const gridSize  = 50;
        const startGX   = Math.floor(visLeft / gridSize) * gridSize;
        const startGY   = Math.floor(visTop  / gridSize) * gridSize;
        for (let x = startGX; x < visRight;  x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, visTop); ctx.lineTo(x, visBottom); ctx.stroke();
        }
        for (let y = startGY; y < visBottom; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(visLeft, y); ctx.lineTo(visRight, y); ctx.stroke();
        }

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
        // Afisam doar cand jucatorul trage activ (isShooting = true)
        if (isShooting && me && me.alive) {
            // Calculam directia din unghiul curent
            // Folosim sin/cos pentru a obtine vectorul de directie
            // myAngle e unghiul in radiani trimis la server
            const dirX = -Math.sin(myAngle); // Negat pentru directia corecta
            const dirY =  Math.cos(myAngle);

            const startDist = 50;  // Incepe la marginea personajului
            const endDist   = 600; // Lungime mare — usor de vizat

            ctx.save();

            // Linia principala — alba semitransparenta
            ctx.strokeStyle = '#ffffffaa';
            ctx.lineWidth   = 3 / ZOOM;
            ctx.setLineDash([12 / ZOOM, 8 / ZOOM]);
            ctx.beginPath();
            ctx.moveTo(
                me.x + dirX * startDist,
                me.y + dirY * startDist
            );
            ctx.lineTo(
                me.x + dirX * endDist,
                me.y + dirY * endDist
            );
            ctx.stroke();

            // Punct final — cercul de tinta
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(
                me.x + dirX * endDist,
                me.y + dirY * endDist,
                8 / ZOOM,
                0, Math.PI * 2
            );
            ctx.fillStyle   = '#ffffff80';
            ctx.fill();

            ctx.restore();
        }

        // --- GLOANTE ---
        gameState.bullets.forEach(bullet => {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.radius || 6, 0, Math.PI * 2);
            ctx.fillStyle   = '#ffff00';
            ctx.shadowBlur  = 12;
            ctx.shadowColor = '#ffff00';
            ctx.fill();
            ctx.shadowBlur  = 0;
        });

        // --- JUCATORI ---
        gameState.players.forEach(player => {
            if (!player.alive) return;
            const size = 90;

            ctx.save();
            ctx.translate(player.x, player.y);
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

            // Bara HP (deasupra personajului)
            const barW    = 70;
            const barH    = 6;
            const barX    = player.x - barW / 2;
            const barY    = player.y - size / 2 - 18;

            // Numele (deasupra barei HP)
            ctx.fillStyle   = player.id === socket.id ? '#00ff88' : '#ffffff';
            ctx.font        = 'bold 14px Rajdhani, Arial';
            ctx.textAlign   = 'center';
            ctx.shadowBlur  = 6;
            ctx.shadowColor = '#000000';
            ctx.fillText(player.name, player.x, player.y - size / 2 - 26);
            ctx.shadowBlur  = 0;
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
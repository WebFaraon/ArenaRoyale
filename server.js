const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- CONSTANTE ----------
const ARENA_W             = 2000;
const ARENA_H             = 2000;
const TICK_RATE           = 60;
const BULLET_SPEED        = 40;
const BULLET_RADIUS       = 6;
const PLAYER_SIZE         = 60;
const ZONE_START_RADIUS   = 900;
const ZONE_END_RADIUS     = 80;
const ZONE_SHRINK_DURATION = 120000;

// ---------- ROOMURI ----------
const rooms = new Map(); // code -> room

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code;
    do {
        code = Array.from({ length: 5 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join('');
    } while (rooms.has(code));
    return code;
}

function newRoom(hostId) {
    return {
        hostId,
        players:     {},
        bullets:     [],
        gameStarted: false,
        gameLoop:    null,
        zone: {
            x:         ARENA_W / 2,
            y:         ARENA_H / 2,
            radius:    ZONE_START_RADIUS,
            shrinking: false,
            startTime: null
        }
    };
}

function getPlayerRoom(socketId) {
    for (const [code, room] of rooms) {
        if (room.players[socketId]) return { code, room };
    }
    return null;
}

function addPlayer(code, room, socket, data) {
    const maxHp  = 20 + data.stats.hp  * 20;
    const damage = 5  + data.stats.dmg * 5;
    const speed  = 3  + data.stats.spd * 0.5;

    room.players[socket.id] = {
        id: socket.id, name: data.name, image: data.image,
        x: Math.random() * (ARENA_W - 800) + 400,
        y: Math.random() * (ARENA_H - 800) + 400,
        angle: 0, size: PLAYER_SIZE,
        hp: maxHp, maxHp, damage, speed,
        moveDir:  { x: 0, y: 0 },
        shootDir: { x: 0, y: 0 },
        shooting: false, shootCooldown: 0, alive: true
    };

    // Trimitem imaginea noului jucator la toti din camera
    io.to(code).emit('player-image', { id: socket.id, image: data.image });
    // Trimitem imaginile existente catre noul jucator
    Object.values(room.players).forEach(p => {
        if (p.id !== socket.id) socket.emit('player-image', { id: p.id, image: p.image });
    });
}

function broadcastWaiting(code, room) {
    io.to(code).emit('waiting-room', Object.values(room.players).map(p => ({
        id: p.id, name: p.name, image: p.image
    })));
}

function startRoomLoop(code, room) {
    room.gameLoop = setInterval(() => {
        if (!room.gameStarted || !rooms.has(code)) return;
        const now = Date.now();

        Object.values(room.players).forEach(player => {
            if (!player.alive) return;

            let nx = player.x + player.moveDir.x * player.speed;
            let ny = player.y + player.moveDir.y * player.speed;
            player.x = Math.max(20, Math.min(ARENA_W - 20, nx));
            player.y = Math.max(20, Math.min(ARENA_H - 20, ny));

            if (room.zone.shrinking) {
                const dist = Math.hypot(player.x - room.zone.x, player.y - room.zone.y);
                if (dist > room.zone.radius) {
                    player.hp -= 1;
                    if (player.hp <= 0) eliminatePlayer(code, room, player);
                }
            }

            if (player.shooting && player.shootCooldown <= 0) {
                room.bullets.push({
                    ownerId: player.id,
                    x: player.x, y: player.y,
                    dx: player.shootDir.x * BULLET_SPEED,
                    dy: player.shootDir.y * BULLET_SPEED,
                    damage: player.damage,
                    radius: BULLET_RADIUS,
                    lifetime: 60
                });
                player.shootCooldown = 8;
            }
            if (player.shootCooldown > 0) player.shootCooldown--;
        });

        room.bullets = room.bullets.filter(b => {
            b.x += b.dx; b.y += b.dy; b.lifetime--;
            if (b.lifetime <= 0 || b.x < 0 || b.x > ARENA_W || b.y < 0 || b.y > ARENA_H)
                return false;
            for (const p of Object.values(room.players)) {
                if (p.id === b.ownerId || !p.alive) continue;
                if (Math.hypot(b.x - p.x, b.y - p.y) < PLAYER_SIZE / 2 + b.radius) {
                    p.hp -= b.damage;
                    if (p.hp <= 0) eliminatePlayer(code, room, p);
                    return false;
                }
            }
            return true;
        });

        if (room.zone.shrinking && room.zone.startTime) {
            const progress = Math.min((now - room.zone.startTime) / ZONE_SHRINK_DURATION, 1);
            room.zone.radius = ZONE_START_RADIUS - (ZONE_START_RADIUS - ZONE_END_RADIUS) * progress;
        }

        io.to(code).emit('game-state', {
            players: Object.values(room.players).map(p => ({
                id: p.id, name: p.name,
                x: p.x, y: p.y, angle: p.angle,
                size: p.size, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
                speed: p.speed
            })),
            bullets: room.bullets.map(b => ({ x: b.x, y: b.y, radius: b.radius })),
            zone: room.zone
        });

    }, 1000 / TICK_RATE);
}

function eliminatePlayer(code, room, player) {
    player.alive = false;
    player.hp    = 0;
    io.to(player.id).emit('eliminated');
    console.log(`[${code}] ${player.name} eliminat`);

    const alive = Object.values(room.players).filter(p => p.alive);
    if (alive.length === 1 && Object.keys(room.players).length > 1) {
        io.to(alive[0].id).emit('winner');
    }
    if (alive.length === 0) {
        setTimeout(() => closeRoom(code, room), 3000);
    }
}

function closeRoom(code, room) {
    if (room.gameLoop) clearInterval(room.gameLoop);
    io.to(code).emit('game-reset');
    rooms.delete(code);
    console.log(`[${code}] Camera inchisa`);
}

// ---------- CONEXIUNI ----------
io.on('connection', (socket) => {

    socket.on('create-room', (data) => {
        const code = generateCode();
        const room = newRoom(socket.id);
        rooms.set(code, room);
        socket.join(code);
        addPlayer(code, room, socket, data);
        socket.emit('room-created', { code });
        broadcastWaiting(code, room);
        console.log(`[${code}] Camera creata de ${data.name}`);
    });

    socket.on('join-room', (payload) => {
        const { code: rawCode, ...data } = payload;
        const code = (rawCode || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) {
            socket.emit('room-error', 'Cod invalid. Verifică și încearcă din nou.');
            return;
        }
        if (room.gameStarted) {
            socket.emit('room-error', 'Jocul a început deja în această cameră.');
            return;
        }
        socket.join(code);
        addPlayer(code, room, socket, data);
        socket.emit('room-joined', { code, isHost: false });
        broadcastWaiting(code, room);
        console.log(`[${code}] ${data.name} a intrat`);
    });

    socket.on('start-game', () => {
        const result = getPlayerRoom(socket.id);
        if (!result) return;
        const { code, room } = result;
        if (room.hostId !== socket.id || room.gameStarted) return;

        room.gameStarted = true;
        io.to(code).emit('game-start');
        console.log(`[${code}] Joc pornit cu ${Object.keys(room.players).length} jucatori`);

        setTimeout(() => {
            if (rooms.has(code)) {
                room.zone.shrinking = true;
                room.zone.startTime = Date.now();
            }
        }, 30000);

        startRoomLoop(code, room);
    });

    socket.on('move', (dir) => {
        const r = getPlayerRoom(socket.id);
        if (r && r.room.gameStarted && r.room.players[socket.id])
            r.room.players[socket.id].moveDir = dir;
    });

    socket.on('rotate', (angle) => {
        const r = getPlayerRoom(socket.id);
        if (r && r.room.players[socket.id])
            r.room.players[socket.id].angle = angle;
    });

    socket.on('shoot', (dir) => {
        const r = getPlayerRoom(socket.id);
        if (r && r.room.gameStarted && r.room.players[socket.id]) {
            r.room.players[socket.id].shootDir = dir;
            r.room.players[socket.id].shooting = true;
        }
    });

    socket.on('stop-shoot', () => {
        const r = getPlayerRoom(socket.id);
        if (r && r.room.players[socket.id])
            r.room.players[socket.id].shooting = false;
    });

    socket.on('disconnect', () => {
        const result = getPlayerRoom(socket.id);
        if (!result) return;
        const { code, room } = result;
        delete room.players[socket.id];

        if (Object.keys(room.players).length === 0) {
            closeRoom(code, room);
            return;
        }

        // Daca hostul a plecat, transferam la urmatorul jucator
        if (room.hostId === socket.id) {
            room.hostId = Object.keys(room.players)[0];
            io.to(room.hostId).emit('host-transferred');
        }

        if (!room.gameStarted) broadcastWaiting(code, room);
    });
});

// ---------- PORNIRE ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server pornit pe portul ${PORT}`));

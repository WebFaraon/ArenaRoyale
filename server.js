const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));

// ---------- SUPABASE ----------
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

if (!supabase) console.warn('[Supabase] Nu e configurat — statisticile nu se salvează.');

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
    const { nickname, password } = req.body || {};
    if (!nickname || !password)
        return res.json({ ok: false, error: 'Completează toate câmpurile' });
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(nickname))
        return res.json({ ok: false, error: 'Nickname: 3-15 caractere (litere, cifre, _)' });

    if (!supabase)
        return res.json({ ok: true, player: { nickname, avatar: null, kills_total: 0, wins_total: 0, games_played: 0, stat_hp: 0, stat_dmg: 0, stat_spd: 0 } });

    try {
        const { data: existing } = await supabase
            .from('players').select('*').eq('nickname', nickname).maybeSingle();

        if (!existing)
            return res.json({ ok: false, error: 'Nickname inexistent. Creează un cont mai întâi.' });

        const valid = await bcrypt.compare(password, existing.password_hash);
        if (!valid) return res.json({ ok: false, error: 'Parolă incorectă' });

        return res.json({ ok: true, player: {
            nickname: existing.nickname,
            avatar:   existing.avatar   || null,
            kills_total:  existing.kills_total  || 0,
            wins_total:   existing.wins_total   || 0,
            games_played: existing.games_played || 0,
            stat_hp:  existing.stat_hp  || 0,
            stat_dmg: existing.stat_dmg || 0,
            stat_spd: existing.stat_spd || 0
        }});
    } catch (err) {
        console.error('[Auth/Login] Error:', err);
        return res.json({ ok: false, error: 'Eroare server. Încearcă din nou.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { nickname, password } = req.body || {};
    if (!nickname || !password)
        return res.json({ ok: false, error: 'Completează toate câmpurile' });
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(nickname))
        return res.json({ ok: false, error: 'Nickname: 3-15 caractere (litere, cifre, _)' });
    if (password.length < 6)
        return res.json({ ok: false, error: 'Parola: minim 6 caractere' });
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
        return res.json({ ok: false, error: 'Parola trebuie să conțină litere și cifre' });

    if (!supabase)
        return res.json({ ok: true, player: { nickname, avatar: null, kills_total: 0, wins_total: 0, games_played: 0 } });

    try {
        const { data: existing } = await supabase
            .from('players').select('id').eq('nickname', nickname).maybeSingle();

        if (existing)
            return res.json({ ok: false, error: 'Nickname deja folosit. Alege altul sau loghează-te.' });

        const hash = await bcrypt.hash(password, 10);
        const { error } = await supabase
            .from('players')
            .insert({ nickname, password_hash: hash, kills_total: 0, wins_total: 0, games_played: 0 });
        if (error) {
            console.error('[Auth/Register] Insert error:', error);
            return res.json({ ok: false, error: 'Eroare la creare cont. Încearcă din nou.' });
        }
        return res.json({ ok: true, player: { nickname, avatar: null, kills_total: 0, wins_total: 0, games_played: 0 } });
    } catch (err) {
        console.error('[Auth/Register] Error:', err);
        return res.json({ ok: false, error: 'Eroare server. Încearcă din nou.' });
    }
});

app.post('/api/profile/avatar', async (req, res) => {
    const { nickname, password, avatar } = req.body || {};
    if (!nickname || !password || !avatar || !supabase) return res.json({ ok: false });
    try {
        const { data } = await supabase.from('players').select('password_hash').eq('nickname', nickname).single();
        if (!data) return res.json({ ok: false });
        const valid = await bcrypt.compare(password, data.password_hash);
        if (!valid) return res.json({ ok: false });
        await supabase.from('players').update({ avatar, updated_at: new Date().toISOString() }).eq('nickname', nickname);
        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false });
    }
});

app.post('/api/profile/stats', async (req, res) => {
    const { nickname, password, stat_hp, stat_dmg, stat_spd } = req.body || {};
    if (!nickname || !password || !supabase) return res.json({ ok: false });
    const hp  = Math.max(0, Math.min(10, Math.floor(+stat_hp  || 0)));
    const dmg = Math.max(0, Math.min(10, Math.floor(+stat_dmg || 0)));
    const spd = Math.max(0, Math.min(10, Math.floor(+stat_spd || 0)));
    if (hp + dmg + spd > 10) return res.json({ ok: false, error: 'Total depășit' });
    try {
        const { data } = await supabase.from('players').select('password_hash').eq('nickname', nickname).single();
        if (!data) return res.json({ ok: false });
        const valid = await bcrypt.compare(password, data.password_hash);
        if (!valid) return res.json({ ok: false });
        await supabase.from('players').update({ stat_hp: hp, stat_dmg: dmg, stat_spd: spd, updated_at: new Date().toISOString() }).eq('nickname', nickname);
        res.json({ ok: true });
    } catch { res.json({ ok: false }); }
});

app.get('/api/leaderboard', async (req, res) => {
    if (!supabase) return res.json([]);
    try {
        const { data } = await supabase.from('players')
            .select('nickname, kills_total, wins_total, games_played')
            .order('wins_total',   { ascending: false })
            .order('kills_total',  { ascending: false })
            .limit(50);
        res.json(data || []);
    } catch { res.json([]); }
});

// ---------- STAT HELPERS ----------
async function updatePlayerRoundEnd(socketId, nickname, killsThisRound, isWinner) {
    const basic = {
        killsThisRound: killsThisRound || 0,
        killsTotal: killsThisRound || 0,
        winsTotal:  isWinner ? 1 : 0,
        gamesPlayed: 1,
        killRate: (killsThisRound || 0).toFixed(1),
        isWinner
    };
    if (!supabase) { io.to(socketId).emit('round-stats', basic); return; }
    try {
        const { data } = await supabase.from('players')
            .select('kills_total, wins_total, games_played')
            .eq('nickname', nickname).maybeSingle();
        if (!data) { io.to(socketId).emit('round-stats', basic); return; }

        const newKills = (data.kills_total  || 0) + (killsThisRound || 0);
        const newWins  = (data.wins_total   || 0) + (isWinner ? 1 : 0);
        const newGames = (data.games_played || 0) + 1;

        await supabase.from('players').update({
            kills_total:  newKills,
            wins_total:   newWins,
            games_played: newGames,
            updated_at:   new Date().toISOString()
        }).eq('nickname', nickname);

        io.to(socketId).emit('round-stats', {
            killsThisRound: killsThisRound || 0,
            killsTotal:  newKills,
            winsTotal:   newWins,
            gamesPlayed: newGames,
            killRate:    newGames > 0 ? (newKills / newGames).toFixed(1) : '0.0',
            isWinner
        });
        broadcastLeaderboard();
    } catch (err) {
        console.error('[Stats] updatePlayerRoundEnd error:', err);
        io.to(socketId).emit('round-stats', basic);
    }
}

async function broadcastLeaderboard() {
    if (!supabase) return;
    try {
        const { data } = await supabase.from('players')
            .select('nickname, kills_total, wins_total, games_played')
            .order('wins_total',  { ascending: false })
            .order('kills_total', { ascending: false })
            .limit(50);
        io.emit('leaderboard-update', data || []);
    } catch (err) {
        console.error('[Supabase] broadcastLeaderboard error:', err);
    }
}

// ---------- CONSTANTE ----------
const ARENA_W             = 2600;
const ARENA_H             = 2600;
const TICK_RATE           = 20;          // 20 ticks/sec → 50ms interval
const BULLET_SPEED        = 1800;        // px/sec
const BULLET_RADIUS       = 6;
const PLAYER_SIZE         = 60;
const ZONE_START_RADIUS   = 1100;
const ZONE_END_RADIUS     = 80;
const ZONE_SHRINK_DURATION = 120000;
const BULLET_LIFE         = 0.333;       // secunde — range = 1800 × 0.333 ≈ 600px
const SHOOT_CD            = 0.25;        // secunde între focuri
const ZONE_DMG_S          = 48;          // HP/sec în afara zonei (era 0.8/tick × 60)
const VIEW_DSQ            = 1400 * 1400; // dist² max pentru gloanțe trimise per jucător

// ---------- ROOMURI ----------
const rooms = new Map();

function generateObstacles() {
    const obstacles = [];
    const count  = 22;
    const margin = 220;
    const minGap = 90;

    for (let attempt = 0; attempt < 600 && obstacles.length < count; attempt++) {
        const isTree = Math.random() < 0.6;
        const radius = isTree
            ? 42 + Math.floor(Math.random() * 18)
            : 28 + Math.floor(Math.random() * 18);
        const x = margin + radius + Math.random() * (ARENA_W - (margin + radius) * 2);
        const y = margin + radius + Math.random() * (ARENA_H - (margin + radius) * 2);
        if (obstacles.every(o => Math.hypot(x - o.x, y - o.y) >= radius + o.radius + minGap))
            obstacles.push({ type: isTree ? 'tree' : 'rock', x, y, radius });
    }
    return obstacles;
}

function spawnPos(obstacles) {
    for (let i = 0; i < 40; i++) {
        const x = 500 + Math.random() * (ARENA_W - 1000);
        const y = 500 + Math.random() * (ARENA_H - 1000);
        if (obstacles.every(o => Math.hypot(x - o.x, y - o.y) > o.radius + PLAYER_SIZE + 20))
            return { x, y };
    }
    return { x: 500 + Math.random() * (ARENA_W - 1000), y: 500 + Math.random() * (ARENA_H - 1000) };
}

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
        players:      {},
        bullets:      [],
        nextBulletId: 0,
        gameStarted:      false,
        gameEnded:        false,
        countdownActive:  false,
        rematchVotes: new Set(),
        obstacles:    [],
        gameLoop:     null,
        lastTick:     0,
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
    const s   = data.stats || {};
    const hp  = Math.min(10, Math.max(0, Math.floor(+s.hp  || 0)));
    const dmg = Math.min(10, Math.max(0, Math.floor(+s.dmg || 0)));
    const spd = Math.min(10, Math.max(0, Math.floor(+s.spd || 0)));
    const total = hp + dmg + spd;
    const scale = total > 10 ? 10 / total : 1;

    const maxHp  = 500 + Math.round(hp  * scale) * 40;
    const damage = 10  + Math.round(dmg * scale) * 4;
    const speed  = (2.5 + Math.round(spd * scale) * 0.3) * 60; // px/sec

    room.players[socket.id] = {
        id: socket.id, name: data.name, image: data.image,
        x: 500 + Math.random() * (ARENA_W - 1000),
        y: 500 + Math.random() * (ARENA_H - 1000),
        angle: 0, size: PLAYER_SIZE,
        hp: maxHp, maxHp, damage, speed,
        moveDir:  { x: 0, y: 0 },
        shootDir: { x: 0, y: 0 },
        shooting: false, shootCooldown: 0, alive: true, kills: 0
    };

    io.to(code).emit('player-image', { id: socket.id, image: data.image });
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
    room.lastTick = Date.now();
    room.gameLoop = setInterval(() => {
        try {
            if (!room.gameStarted || !rooms.has(code)) return;
            const now = Date.now();
            const dt  = Math.min((now - room.lastTick) / 1000, 0.1); // sec, max 100ms cap
            room.lastTick = now;

            Object.values(room.players).forEach(player => {
                if (!player.alive || room.gameEnded || room.countdownActive) return;

                player.x = Math.max(20, Math.min(ARENA_W - 20, player.x + player.moveDir.x * player.speed * dt));
                player.y = Math.max(20, Math.min(ARENA_H - 20, player.y + player.moveDir.y * player.speed * dt));

                const zd = Math.hypot(player.x - room.zone.x, player.y - room.zone.y);
                if (zd > room.zone.radius + 35) {
                    player.hp -= ZONE_DMG_S * dt;
                    if (player.hp <= 0) eliminatePlayer(code, room, player, null);
                }

                if (player.shootCooldown > 0) player.shootCooldown -= dt;
                if (player.shooting && player.shootCooldown <= 0) {
                    const SPAWN_OFFSET = 25;
                    room.bullets.push({
                        id:       room.nextBulletId++,
                        ownerId:  player.id,
                        x:        player.x + player.shootDir.x * SPAWN_OFFSET,
                        y:        player.y + player.shootDir.y * SPAWN_OFFSET,
                        dx:       player.shootDir.x * BULLET_SPEED,
                        dy:       player.shootDir.y * BULLET_SPEED,
                        damage:   player.damage,
                        radius:   BULLET_RADIUS,
                        lifetime: BULLET_LIFE
                    });
                    player.shootCooldown = SHOOT_CD;
                }

                for (const obs of room.obstacles) {
                    const ox = player.x - obs.x, oy = player.y - obs.y;
                    const od = Math.hypot(ox, oy);
                    const minD = PLAYER_SIZE / 2 + obs.radius;
                    if (od < minD && od > 0) {
                        player.x = obs.x + (ox / od) * minD;
                        player.y = obs.y + (oy / od) * minD;
                    }
                }

            });

            const expiredBullets = [];
            room.bullets = room.bullets.filter(b => {
                const prevX = b.x, prevY = b.y;
                b.x += b.dx * dt;
                b.y += b.dy * dt;
                b.lifetime -= dt;

                if (b.lifetime <= 0) {
                    if (b.x >= 0 && b.x <= ARENA_W && b.y >= 0 && b.y <= ARENA_H)
                        expiredBullets.push(b);
                    return false;
                }
                if (b.x < 0 || b.x > ARENA_W || b.y < 0 || b.y > ARENA_H)
                    return false;

                // Swept collision pentru obstacole ȘI jucători — un pas de 20px
                const moveLen = Math.hypot(b.x - prevX, b.y - prevY);
                const steps   = Math.max(1, Math.ceil(moveLen / 20));
                const hitR    = PLAYER_SIZE / 2 + b.radius;

                // Obstacole: swept (bullet poate traversa rocă dacă jucătorul e lipit de ea)
                let hitObsIdx = -1;
                for (let s = 1; s <= steps; s++) {
                    const bx = prevX + (b.x - prevX) * s / steps;
                    const by = prevY + (b.y - prevY) * s / steps;
                    const idx = room.obstacles.findIndex(o => Math.hypot(bx - o.x, by - o.y) < o.radius + b.radius);
                    if (idx >= 0) { hitObsIdx = idx; break; }
                }
                if (hitObsIdx >= 0) {
                    io.to(code).emit('obstacle-hit', { idx: hitObsIdx });
                    return false;
                }

                for (const p of Object.values(room.players)) {
                    if (p.id === b.ownerId || !p.alive) continue;

                    let hit = false;
                    for (let s = 1; s <= steps; s++) {
                        const bx = prevX + (b.x - prevX) * s / steps;
                        const by = prevY + (b.y - prevY) * s / steps;
                        if (Math.hypot(bx - p.x, by - p.y) < hitR) { hit = true; break; }
                    }

                    if (hit) {
                        p.hp -= b.damage;
                        io.to(b.ownerId).emit('damage-dealt', { amount: Math.round(b.damage), x: p.x, y: p.y });
                        if (p.hp <= 0) eliminatePlayer(code, room, p, b.ownerId);
                        else io.to(code).emit('bullet-hit', { x: b.x, y: b.y });
                        return false;
                    }
                }
                return true;
            });

            if (room.zone.shrinking && room.zone.startTime) {
                const progress = Math.min((now - room.zone.startTime) / ZONE_SHRINK_DURATION, 1);
                room.zone.radius = ZONE_START_RADIUS - (ZONE_START_RADIUS - ZONE_END_RADIUS) * progress;
            }

            // Compact per-socket broadcast cu proximity filtering pentru gloanțe
            const allPlayers = Object.values(room.players);
            const z = room.zone;
            const zArr = [Math.round(z.x), Math.round(z.y), Math.round(z.radius), z.shrinking ? 1 : 0];

            // pArr: [id, x, y, angle, hp, maxHp, alive, kills, name]
            const pArr = allPlayers.map(p => [
                p.id,
                Math.round(p.x), Math.round(p.y),
                +p.angle.toFixed(3),
                Math.round(p.hp),
                p.maxHp,
                p.alive ? 1 : 0,
                p.kills,
                p.name
            ]);

            allPlayers.forEach(recv => {
                // bArr: [id, x, y, dirX, dirY] — doar gloanțele din raza vizuală
                const bArr = [...room.bullets, ...expiredBullets]
                    .filter(b => (b.x - recv.x) ** 2 + (b.y - recv.y) ** 2 < VIEW_DSQ)
                    .map(b => [
                        b.id,
                        Math.round(b.x), Math.round(b.y),
                        +(b.dx / BULLET_SPEED).toFixed(3),
                        +(b.dy / BULLET_SPEED).toFixed(3)
                    ]);
                io.to(recv.id).emit('gs', [pArr, bArr, zArr]);
            });

        } catch (err) {
            console.error(`[${code}] Game loop error:`, err.stack || err);
        }
    }, 1000 / TICK_RATE);
}

function eliminatePlayer(code, room, player, killerId) {
    player.alive = false;
    player.hp    = 0;

    const killerPlayer = killerId ? room.players[killerId] : null;
    if (killerPlayer) killerPlayer.kills++;

    const alive        = Object.values(room.players).filter(p => p.alive);
    const totalPlayers = Object.keys(room.players).length;
    const placement    = alive.length + 1;

    io.to(player.id).emit('eliminated', {
        placement,
        totalPlayers,
        killedBy: killerPlayer ? killerPlayer.name : null,
        kills:    player.kills
    });

    if (killerPlayer) {
        io.to(code).emit('kill-event', { killerName: killerPlayer.name, victimName: player.name, byZone: false });
    } else {
        io.to(code).emit('kill-event', { victimName: player.name, byZone: true });
    }

    console.log(`[${code}] ${player.name} eliminat de ${killerPlayer ? killerPlayer.name : 'zona'} (loc ${placement}/${totalPlayers})`);

    if (alive.length === 1 && totalPlayers > 1) {
        const winner = alive[0];
        io.to(winner.id).emit('winner', { kills: winner.kills });
        room.gameEnded = true;
        if (room.gameLoop) { clearInterval(room.gameLoop); room.gameLoop = null; }

        updatePlayerRoundEnd(player.id, player.name, player.kills, false);
        updatePlayerRoundEnd(winner.id, winner.name, winner.kills, true);
    } else {
        updatePlayerRoundEnd(player.id, player.name, player.kills, false);
    }

    if (alive.length === 0) {
        room.gameEnded = true;
        if (room.gameLoop) { clearInterval(room.gameLoop); room.gameLoop = null; }
        setTimeout(() => { if (rooms.has(code) && room.gameEnded) closeRoom(code, room); }, 60000);
    }
}

function triggerRematch(code, room) {
    if (room.gameLoop) { clearInterval(room.gameLoop); room.gameLoop = null; }
    room.gameStarted  = false;
    room.gameEnded    = false;
    room.rematchVotes.clear();
    room.bullets      = [];
    room.nextBulletId = 0;
    room.zone = { x: ARENA_W / 2, y: ARENA_H / 2, radius: ZONE_START_RADIUS, shrinking: false, startTime: null };
    room.obstacles = generateObstacles();
    Object.values(room.players).forEach(p => {
        const pos = spawnPos(room.obstacles);
        p.x = pos.x; p.y = pos.y;
        p.hp = p.maxHp; p.alive = true; p.angle = 0; p.kills = 0;
        p.moveDir = { x: 0, y: 0 }; p.shootDir = { x: 0, y: 0 };
        p.shooting = false; p.shootCooldown = 0;
    });
    const rematchMeta = {};
    Object.values(room.players).forEach(p => { rematchMeta[p.id] = { speed: p.speed, maxHp: p.maxHp }; });
    Object.keys(room.players).forEach(pid => {
        io.to(pid).emit('game-rematch', { isHost: room.hostId === pid, obstacles: room.obstacles, playersMeta: rematchMeta });
    });
    broadcastWaiting(code, room);
    console.log(`[${code}] Rematch pornit`);
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

        room.gameStarted     = true;
        room.countdownActive = true;
        room.obstacles       = generateObstacles();

        Object.values(room.players).forEach(p => {
            const pos = spawnPos(room.obstacles);
            p.x = pos.x; p.y = pos.y;
        });

        const zoneStartsAt = Date.now() + 33000; // 3s countdown + 30s real play time
        const playersMeta = {};
        Object.values(room.players).forEach(p => { playersMeta[p.id] = { speed: p.speed, maxHp: p.maxHp }; });
        io.to(code).emit('game-start', { obstacles: room.obstacles, zoneStartsAt, playersMeta });
        console.log(`[${code}] Joc pornit cu ${Object.keys(room.players).length} jucatori`);

        setTimeout(() => {
            if (rooms.has(code)) room.countdownActive = false;
        }, 3000);

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

    socket.on('rematch', () => {
        const result = getPlayerRoom(socket.id);
        if (!result) return;
        const { code, room } = result;
        if (!room.gameEnded) return;
        room.rematchVotes.add(socket.id);
        const total = Object.keys(room.players).length;
        const count = room.rematchVotes.size;
        io.to(code).emit('rematch-vote', { count, total });
        if (count >= total) triggerRematch(code, room);
    });

    socket.on('disconnect', () => {
        const result = getPlayerRoom(socket.id);
        if (!result) return;
        const { code, room } = result;
        room.rematchVotes.delete(socket.id);
        delete room.players[socket.id];

        if (Object.keys(room.players).length === 0) {
            closeRoom(code, room);
            return;
        }

        if (room.hostId === socket.id) {
            room.hostId = Object.keys(room.players)[0];
            io.to(room.hostId).emit('host-transferred');
        }

        if (!room.gameStarted) broadcastWaiting(code, room);

        if (room.gameEnded) {
            const remaining = Object.keys(room.players).length;
            const votes     = room.rematchVotes.size;
            io.to(code).emit('rematch-vote', { count: votes, total: remaining });
            if (votes >= remaining && remaining > 0) triggerRematch(code, room);
        }
    });
});

// ---------- PORNIRE ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server pornit pe portul ${PORT}`));

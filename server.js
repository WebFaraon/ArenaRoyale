const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
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

// ---------- SESSION TOKENS ----------
// nickname → token  (in-memory; se goleste la restart server)
const sessionTokens = new Map();

if (!supabase) console.warn('[Supabase] Nu e configurat — statisticile nu se salveaza.');

// ---------- AUTH ----------
app.post('/api/auth/login', async (req, res) => {
    const { nickname, password } = req.body || {};
    if (!nickname || !password)
        return res.json({ ok: false, error: 'Completeaza toate campurile' });
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(nickname))
        return res.json({ ok: false, error: 'Nickname: 3-15 caractere (litere, cifre, _)' });

    if (!supabase)
        return res.json({ ok: true, player: { nickname, avatar: null, kills_total: 0, wins_total: 0, games_played: 0, stat_hp: 0, stat_dmg: 0, stat_spd: 0 } });

    try {
        const { data: existing } = await supabase
            .from('players').select('*').eq('nickname', nickname).maybeSingle();

        if (!existing)
            return res.json({ ok: false, error: 'Nickname inexistent. Creeaza un cont mai intai.' });

        const valid = await bcrypt.compare(password, existing.password_hash);
        if (!valid) return res.json({ ok: false, error: 'Parola incorecta' });

        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens.set(existing.nickname, token);

        // Reset misiuni zilnice daca e zi noua
        const today = new Date().toISOString().slice(0, 10);
        let missions;
        if (existing.mission_date !== today) {
            await supabase.from('players').update({
                mission_date: today,
                mission_kills: 0, mission_games: 0, mission_wins: 0,
                mission_kills_claimed: false, mission_games_claimed: false, mission_wins_claimed: false
            }).eq('nickname', nickname);
            missions = { kills: 0, games: 0, wins: 0, killsClaimed: false, gamesClaimed: false, winsClaimed: false };
        } else {
            missions = {
                kills: existing.mission_kills || 0, games: existing.mission_games || 0, wins: existing.mission_wins || 0,
                killsClaimed: !!existing.mission_kills_claimed, gamesClaimed: !!existing.mission_games_claimed, winsClaimed: !!existing.mission_wins_claimed
            };
        }

        let unlockedChars;
        try { unlockedChars = JSON.parse(existing.unlocked_characters || '["ninja"]'); }
        catch { unlockedChars = ['ninja']; }
        // Migrate old 'captain' id to 'ninja'
        if (unlockedChars.includes('captain')) {
            unlockedChars = unlockedChars.map(id => id === 'captain' ? 'ninja' : id);
        }
        if (!unlockedChars.includes('ninja')) unlockedChars.unshift('ninja');

        return res.json({ ok: true, token, player: {
            nickname: existing.nickname,
            avatar:   existing.avatar   || null,
            unlocked_characters: unlockedChars,
            kills_total:  existing.kills_total  || 0,
            wins_total:   existing.wins_total   || 0,
            games_played: existing.games_played || 0,
            stat_hp:  existing.stat_hp  || 0,
            stat_dmg: existing.stat_dmg || 0,
            stat_spd: existing.stat_spd || 0,
            xp:       existing.xp       || 0,
            coins:    existing.coins    ?? 1000,
            diamonds: existing.diamonds || 0,
            missions
        }});
    } catch (err) {
        console.error('[Auth/Login] Error:', err);
        return res.json({ ok: false, error: 'Eroare server. Incearca din nou.' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { nickname, password } = req.body || {};
    if (!nickname || !password)
        return res.json({ ok: false, error: 'Completeaza toate campurile' });
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(nickname))
        return res.json({ ok: false, error: 'Nickname: 3-15 caractere (litere, cifre, _)' });
    if (password.length < 6)
        return res.json({ ok: false, error: 'Parola: minim 6 caractere' });
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
        return res.json({ ok: false, error: 'Parola trebuie sa contina litere si cifre' });

    if (!supabase)
        return res.json({ ok: true, player: { nickname, avatar: null, kills_total: 0, wins_total: 0, games_played: 0 } });

    try {
        const { data: existing } = await supabase
            .from('players').select('id').eq('nickname', nickname).maybeSingle();

        if (existing)
            return res.json({ ok: false, error: 'Nickname deja folosit. Alege altul sau logheaza-te.' });

        const hash = await bcrypt.hash(password, 10);
        const { error } = await supabase
            .from('players')
            .insert({ nickname, password_hash: hash, kills_total: 0, wins_total: 0, games_played: 0, xp: 0, coins: 1000, diamonds: 0, unlocked_characters: '["ninja"]' });
        if (error) {
            console.error('[Auth/Register] Insert error:', error);
            return res.json({ ok: false, error: 'Eroare la creare cont. Incearca din nou.' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens.set(nickname, token);
        const today = new Date().toISOString().slice(0, 10);
        const missions = { kills: 0, games: 0, wins: 0, killsClaimed: false, gamesClaimed: false, winsClaimed: false };
        return res.json({ ok: true, token, player: { nickname, avatar: null, kills_total: 0, wins_total: 0, games_played: 0, xp: 0, coins: 1000, diamonds: 0, missions } });
    } catch (err) {
        console.error('[Auth/Register] Error:', err);
        return res.json({ ok: false, error: 'Eroare server. Incearca din nou.' });
    }
});

// ---------- CHARACTER UNLOCK ----------
const CHAR_DEFS = {
    zombie:     { level: 1,  coins: 150,  diamonds: 0  },
    robot:      { level: 1,  coins: 150,  diamonds: 0  },
    wizard:     { level: 2,  coins: 200,  diamonds: 0  },
    sheriff:    { level: 3,  coins: 250,  diamonds: 0  },
    pumpkin:    { level: 3,  coins: 300,  diamonds: 0  },
    forestelf:  { level: 4,  coins: 400,  diamonds: 0  },
    fire:       { level: 5,  coins: 500,  diamonds: 0  },
    tiger:      { level: 5,  coins: 500,  diamonds: 0  },
    shark:      { level: 6,  coins: 600,  diamonds: 0  },
    thunderbot: { level: 6,  coins: 650,  diamonds: 0  },
    werewolf:   { level: 6,  coins: 700,  diamonds: 0  },
    cyberbrain: { level: 7,  coins: 800,  diamonds: 0  },
    viking:     { level: 10, coins: 1800, diamonds: 0  },
    sungod:     { level: 10, coins: 2000, diamonds: 0  },
    ice:        { level: 10, coins: 0,    diamonds: 15 },
    magmagolem: { level: 12, coins: 2500, diamonds: 0  },
    royalking:  { level: 12, coins: 0,    diamonds: 20 },
    vampire:    { level: 15, coins: 0,    diamonds: 40 },
    samurai:    { level: 18, coins: 0,    diamonds: 60 },
    pharaoh:    { level: 20, coins: 0,    diamonds: 75 },
};

app.post('/api/characters/unlock', async (req, res) => {
    const { nickname, token, characterId } = req.body || {};
    if (!nickname || !token || !characterId || !supabase) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, error: 'Sesiune invalida' });
    const charDef = CHAR_DEFS[characterId];
    if (!charDef) return res.json({ ok: false, error: 'Personaj invalid' });
    try {
        const { data } = await supabase.from('players')
            .select('xp, coins, diamonds, unlocked_characters')
            .eq('nickname', nickname).single();
        if (!data) return res.json({ ok: false });
        const xp = data.xp || 0;
        let lvl = 1, inc = 100, thresh = 0;
        for (let n = 2; n <= 50; n++) { thresh += inc; if (xp >= thresh) lvl = n; else break; if (n >= 3) inc += 50; }
        if (lvl < charDef.level) return res.json({ ok: false, error: `Nivel insuficient (necesar LV ${charDef.level})` });
        const coins    = data.coins    ?? 1000;
        const diamonds = data.diamonds || 0;
        if (charDef.coins    > 0 && coins    < charDef.coins)    return res.json({ ok: false, error: 'Monede insuficiente' });
        if (charDef.diamonds > 0 && diamonds < charDef.diamonds) return res.json({ ok: false, error: 'Diamante insuficiente' });
        let unlocked;
        try { unlocked = JSON.parse(data.unlocked_characters || '["ninja"]'); } catch { unlocked = ['ninja']; }
        if (unlocked.includes(characterId)) return res.json({ ok: false, error: 'Deja deblocat' });
        unlocked.push(characterId);
        const newCoins    = coins    - charDef.coins;
        const newDiamonds = diamonds - charDef.diamonds;
        await supabase.from('players').update({
            coins: newCoins, diamonds: newDiamonds,
            unlocked_characters: JSON.stringify(unlocked),
            updated_at: new Date().toISOString()
        }).eq('nickname', nickname);
        res.json({ ok: true, coins: newCoins, diamonds: newDiamonds, unlocked_characters: unlocked });
    } catch (err) {
        console.error('[Characters/Unlock]', err);
        res.json({ ok: false, error: 'Eroare server' });
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
    if (hp + dmg + spd > 10) return res.json({ ok: false, error: 'Total depasit' });
    try {
        const { data } = await supabase.from('players').select('password_hash').eq('nickname', nickname).single();
        if (!data) return res.json({ ok: false });
        const valid = await bcrypt.compare(password, data.password_hash);
        if (!valid) return res.json({ ok: false });
        await supabase.from('players').update({ stat_hp: hp, stat_dmg: dmg, stat_spd: spd, updated_at: new Date().toISOString() }).eq('nickname', nickname);
        res.json({ ok: true });
    } catch { res.json({ ok: false }); }
});

const MISSION_DEFS = {
    kills: { goal: 5,  coins: 50,  diamonds: 0, col: 'mission_kills', claimedCol: 'mission_kills_claimed' },
    games: { goal: 3,  coins: 30,  diamonds: 0, col: 'mission_games', claimedCol: 'mission_games_claimed' },
    wins:  { goal: 1,  coins: 100, diamonds: 1, col: 'mission_wins',  claimedCol: 'mission_wins_claimed'  },
};

app.post('/api/missions/claim', async (req, res) => {
    const { nickname, token, missionId } = req.body || {};
    if (!nickname || !token || !missionId || !supabase) return res.json({ ok: false, error: 'Date invalide' });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, error: 'Sesiune invalida' });
    const def = MISSION_DEFS[missionId];
    if (!def) return res.json({ ok: false, error: 'Misiune inexistenta' });
    try {
        const { data } = await supabase.from('players')
            .select(`coins, diamonds, ${def.col}, ${def.claimedCol}, mission_date`)
            .eq('nickname', nickname).single();
        if (!data) return res.json({ ok: false, error: 'Cont negasit' });
        const today = new Date().toISOString().slice(0, 10);
        if (data.mission_date !== today) return res.json({ ok: false, error: 'Misiunile s-au resetat' });
        if (data[def.claimedCol]) return res.json({ ok: false, error: 'Deja revendicat' });
        if ((data[def.col] || 0) < def.goal) return res.json({ ok: false, error: 'Misiune nefinalizata' });
        const newCoins    = (data.coins    ?? 1000) + def.coins;
        const newDiamonds = (data.diamonds || 0)    + def.diamonds;
        await supabase.from('players').update({ coins: newCoins, diamonds: newDiamonds, [def.claimedCol]: true }).eq('nickname', nickname);
        res.json({ ok: true, coins: newCoins, diamonds: newDiamonds });
    } catch (err) {
        console.error('[Missions/Claim] Error:', err);
        res.json({ ok: false, error: 'Eroare server' });
    }
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
    const k = killsThisRound || 0;
    const earnedXP       = k * 10 + (isWinner ? 50 : 0);
    const earnedCoins    = k * 10 + (isWinner ? 50 : 0);
    const earnedDiamonds = isWinner ? 1 : 0;

    const basic = {
        killsThisRound: k, killsTotal: k, winsTotal: isWinner ? 1 : 0,
        gamesPlayed: 1, killRate: k.toFixed(1), isWinner,
        earnedXP, earnedCoins, earnedDiamonds,
        xp: earnedXP, coins: 1000 + earnedCoins, diamonds: earnedDiamonds
    };
    if (!supabase) { io.to(socketId).emit('round-stats', basic); return; }
    try {
        const { data } = await supabase.from('players')
            .select('kills_total, wins_total, games_played, xp, coins, diamonds, mission_date, mission_kills, mission_games, mission_wins, mission_kills_claimed, mission_games_claimed, mission_wins_claimed')
            .eq('nickname', nickname).maybeSingle();
        if (!data) { io.to(socketId).emit('round-stats', basic); return; }

        const newKills    = (data.kills_total  || 0) + k;
        const newWins     = (data.wins_total   || 0) + (isWinner ? 1 : 0);
        const newGames    = (data.games_played || 0) + 1;
        const newXP       = (data.xp           || 0) + earnedXP;
        const newCoins    = (data.coins        ?? 1000) + earnedCoins;
        const newDiamonds = (data.diamonds     || 0) + earnedDiamonds;

        // Misiuni zilnice — reset daca e zi noua
        const today = new Date().toISOString().slice(0, 10);
        const isNewDay = data.mission_date !== today;
        const mKills = (isNewDay ? 0 : (data.mission_kills || 0)) + k;
        const mGames = (isNewDay ? 0 : (data.mission_games || 0)) + 1;
        const mWins  = (isNewDay ? 0 : (data.mission_wins  || 0)) + (isWinner ? 1 : 0);
        const mKillsClaimed = isNewDay ? false : !!data.mission_kills_claimed;
        const mGamesClaimed = isNewDay ? false : !!data.mission_games_claimed;
        const mWinsClaimed  = isNewDay ? false : !!data.mission_wins_claimed;

        await supabase.from('players').update({
            kills_total:  newKills, wins_total: newWins, games_played: newGames,
            xp: newXP, coins: newCoins, diamonds: newDiamonds,
            mission_date: today,
            mission_kills: mKills, mission_games: mGames, mission_wins: mWins,
            mission_kills_claimed: mKillsClaimed, mission_games_claimed: mGamesClaimed, mission_wins_claimed: mWinsClaimed,
            updated_at: new Date().toISOString()
        }).eq('nickname', nickname);

        const missions = { kills: mKills, games: mGames, wins: mWins, killsClaimed: mKillsClaimed, gamesClaimed: mGamesClaimed, winsClaimed: mWinsClaimed };
        io.to(socketId).emit('round-stats', {
            killsThisRound: k, killsTotal: newKills, winsTotal: newWins,
            gamesPlayed: newGames,
            killRate: newGames > 0 ? (newKills / newGames).toFixed(1) : '0.0',
            isWinner, earnedXP, earnedCoins, earnedDiamonds,
            xp: newXP, coins: newCoins, diamonds: newDiamonds, missions
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
const BULLET_SPEED        = 1400;        // px/sec
const BULLET_RADIUS       = 6;
const PLAYER_SIZE         = 60;
const ZONE_START_RADIUS   = 1100;
const ZONE_END_RADIUS     = 80;
const ZONE_SHRINK_DURATION = 120000;
const BULLET_LIFE         = 0.428;       // secunde — range = 1400 × 0.428 ≈ 600px
const SHOOT_CD            = 0.25;        // secunde intre focuri
const AMMO_MAX            = 10;
const AMMO_RELOAD_TIME    = 3;           // secunde pentru reincarcarea completa
const ZOMBIE_COUNT        = 3;
const ZOMBIE_HP           = 200;
const ZOMBIE_SPEED        = 70;
const ZOMBIE_WANDER_SPEED = 36;
const ZOMBIE_RADIUS       = 24;
const ZOMBIE_AGGRO_RADIUS = 430;
const ZOMBIE_ATTACK_RANGE = 48;
const ZOMBIE_DAMAGE       = 20;
const ZOMBIE_ATTACK_CD    = 0.85;
const HEALTH_PICKUP_HEAL  = 200;
const ZONE_DMG_S          = 48;          // HP/sec in afara zonei (era 0.8/tick × 60)
const HP_REGEN_RATE       = 25;          // HP/sec dupa 6s fara damage
const HP_REGEN_DELAY      = 6000;        // ms de asteptat inainte de regen
const VIEW_DSQ            = 1400 * 1400; // dist² max pentru gloante trimise per jucator

const SPAWN_POINTS = Array.from({ length: 16 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 16;
    const r = 930;
    return {
        x: Math.round(ARENA_W / 2 + Math.cos(a) * r),
        y: Math.round(ARENA_H / 2 + Math.sin(a) * r)
    };
});

// ---------- FRIENDS ----------
async function getFriendNicknames(nickname) {
    if (!supabase) return [];
    const { data } = await supabase.from('friendships')
        .select('requester, target')
        .or(`requester.eq.${nickname},target.eq.${nickname}`)
        .eq('status', 'accepted');
    return (data || []).map(f => f.requester === nickname ? f.target : f.requester);
}

async function notifyFriendsPresence(nickname, event) {
    try {
        const friends = await getFriendNicknames(nickname);
        friends.forEach(friendNick => {
            const sid = connectedAccounts.get(friendNick);
            if (sid) io.to(sid).emit(event, { nickname });
        });
    } catch {}
}

app.post('/api/friends/search', async (req, res) => {
    const { nickname, token, query } = req.body || {};
    if (!nickname || !token || !query || !supabase) return res.json({ ok: false, players: [] });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, players: [] });
    try {
        const { data } = await supabase.from('players')
            .select('nickname, xp')
            .ilike('nickname', `%${query}%`)
            .neq('nickname', nickname)
            .limit(6);
        res.json({ ok: true, players: data || [] });
    } catch { res.json({ ok: false, players: [] }); }
});

app.post('/api/friends/request', async (req, res) => {
    const { nickname, token, target } = req.body || {};
    if (!nickname || !token || !target || !supabase) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, error: 'Sesiune invalida' });
    if (nickname === target) return res.json({ ok: false, error: 'Nu poti adauga propriul cont' });
    try {
        const { data: targetPlayer } = await supabase.from('players').select('nickname').eq('nickname', target).maybeSingle();
        if (!targetPlayer) return res.json({ ok: false, error: 'Jucatorul nu exista' });
        const { data: existing } = await supabase.from('friendships').select('id,status')
            .or(`and(requester.eq.${nickname},target.eq.${target}),and(requester.eq.${target},target.eq.${nickname})`)
            .maybeSingle();
        if (existing) {
            const msg = existing.status === 'accepted' ? 'Deja prieteni' : 'Cerere deja trimisa';
            return res.json({ ok: false, error: msg });
        }
        await supabase.from('friendships').insert({ requester: nickname, target, status: 'pending' });
        const sid = connectedAccounts.get(target);
        if (sid) io.to(sid).emit('friend-request-incoming', { from: nickname });
        res.json({ ok: true });
    } catch (err) { console.error('[Friends/Request]', err); res.json({ ok: false, error: 'Eroare server' }); }
});

app.post('/api/friends/respond', async (req, res) => {
    const { nickname, token, requester, action } = req.body || {};
    if (!nickname || !token || !requester || !supabase) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false });
    if (!['accept', 'reject'].includes(action)) return res.json({ ok: false });
    try {
        if (action === 'accept') {
            await supabase.from('friendships').update({ status: 'accepted' })
                .eq('requester', requester).eq('target', nickname).eq('status', 'pending');
            const sid = connectedAccounts.get(requester);
            if (sid) io.to(sid).emit('friend-accepted', { by: nickname });
            // Tell both sides current online status
            const mySid = connectedAccounts.get(nickname);
            if (sid) io.to(sid).emit('friend-online', { nickname });
            if (mySid) io.to(mySid).emit('friend-online', { nickname: requester });
        } else {
            await supabase.from('friendships').delete()
                .eq('requester', requester).eq('target', nickname).eq('status', 'pending');
        }
        res.json({ ok: true });
    } catch { res.json({ ok: false }); }
});

app.post('/api/friends/list', async (req, res) => {
    const { nickname, token } = req.body || {};
    if (!nickname || !token || !supabase) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false });
    try {
        const { data: rows } = await supabase.from('friendships').select('requester, target, status')
            .or(`requester.eq.${nickname},target.eq.${nickname}`);
        const friends = [], pendingIncoming = [], pendingOutgoing = [];
        const friendNicks = [];
        (rows || []).forEach(f => {
            if (f.status === 'accepted') {
                const nick = f.requester === nickname ? f.target : f.requester;
                friendNicks.push(nick);
                friends.push({ nickname: nick, online: connectedAccounts.has(nick) });
            } else if (f.status === 'pending') {
                if (f.target === nickname) pendingIncoming.push({ nickname: f.requester });
                else pendingOutgoing.push({ nickname: f.target });
            }
        });
        // Fetch XP for accepted friends
        if (friendNicks.length > 0) {
            const { data: playerRows } = await supabase.from('players')
                .select('nickname, xp').in('nickname', friendNicks);
            const xpMap = {};
            (playerRows || []).forEach(p => { xpMap[p.nickname] = p.xp || 0; });
            friends.forEach(f => { f.xp = xpMap[f.nickname] || 0; });
        }
        res.json({ ok: true, friends, pendingIncoming, pendingOutgoing });
    } catch { res.json({ ok: false }); }
});

// ---------- ROOMURI ----------
const rooms = new Map();
const connectedAccounts = new Map(); // nickname → socketId

function generateObstacles(protectedPoints = []) {
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
        const clearOfSpawns = protectedPoints.every(p => Math.hypot(x - p.x, y - p.y) >= radius + PLAYER_SIZE + 95);
        if (clearOfSpawns && obstacles.every(o => Math.hypot(x - o.x, y - o.y) >= radius + o.radius + minGap))
            obstacles.push({ type: isTree ? 'tree' : 'rock', x, y, radius });
    }
    return obstacles;
}

function shuffled(list) {
    const out = list.map(p => ({ ...p }));
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function assignSpawnPoints(players, obstacles) {
    const points = shuffled(SPAWN_POINTS);
    players.forEach((p, i) => {
        const pos = points[i] || spawnPos(obstacles);
        p.x = pos.x;
        p.y = pos.y;
    });
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

function spawnZombiePos(obstacles) {
    for (let i = 0; i < 120; i++) {
        const x = 420 + Math.random() * (ARENA_W - 840);
        const y = 420 + Math.random() * (ARENA_H - 840);
        const farFromSpawns = SPAWN_POINTS.every(p => Math.hypot(x - p.x, y - p.y) > 220);
        const farFromObstacles = obstacles.every(o => Math.hypot(x - o.x, y - o.y) > o.radius + ZOMBIE_RADIUS + 30);
        if (farFromSpawns && farFromObstacles) return { x, y };
    }
    return { x: ARENA_W / 2 + Math.random() * 400 - 200, y: ARENA_H / 2 + Math.random() * 400 - 200 };
}

function generateZombies(obstacles) {
    return Array.from({ length: ZOMBIE_COUNT }, (_, i) => {
        const pos = spawnZombiePos(obstacles);
        return {
            id: i,
            x: pos.x,
            y: pos.y,
            hp: ZOMBIE_HP,
            maxHp: ZOMBIE_HP,
            angle: 0,
            wanderAngle: Math.random() * Math.PI * 2,
            wanderUntil: 0,
            attackCooldown: 0
        };
    });
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
        zombies:      [],
        pickups:      [],
        nextBulletId: 0,
        nextZombieId: 0,
        nextPickupId: 0,
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
        id: socket.id, name: data.name, image: data.image, xp: data.xp || 0,
        x: 500 + Math.random() * (ARENA_W - 1000),
        y: 500 + Math.random() * (ARENA_H - 1000),
        angle: 0, size: PLAYER_SIZE,
        hp: maxHp, maxHp, damage, speed,
        moveDir:  { x: 0, y: 0 },
        shootDir: { x: 0, y: 0 },
        shooting: false, shootCooldown: 0,
        ammo: AMMO_MAX, reloading: false, reloadTimer: 0,
        alive: true, kills: 0, lastDamageTime: 0
    };

    io.to(code).emit('player-image', { id: socket.id, image: data.image });
    Object.values(room.players).forEach(p => {
        if (p.id !== socket.id) socket.emit('player-image', { id: p.id, image: p.image });
    });
}

function broadcastWaiting(code, room) {
    const players = Object.values(room.players).map(p => {
        // Calculeaza nivelul din XP (acelasi algoritm ca pe client)
        const xp = p.xp || 0;
        let lvl = 1, inc = 100, thresh = 0;
        for (let n = 2; n <= 50; n++) {
            thresh += inc;
            if (xp >= thresh) lvl = n; else break;
            if (n >= 3) inc += 50;
        }
        return { id: p.id, name: p.name, image: p.image, level: lvl };
    });
    Object.keys(room.players).forEach(pid => {
        io.to(pid).emit('waiting-room', { players, hostId: room.hostId });
    });
}

function startRoomLoop(code, room) {
    room.lastTick = Date.now();
    room.gameLoop = setInterval(() => {
        try {
            if (!room.gameStarted || !rooms.has(code)) return;
            const now = Date.now();
            const dt  = Math.min((now - room.lastTick) / 1000, 0.1); // sec, max 100ms cap
            room.lastTick = now;

            // Cache o singura data per tick — evita Object.values() repetat
            const allPlayers = Object.values(room.players);
            let zombieDied   = false;
            room.zombieTickCount = (room.zombieTickCount || 0) + 1;
            const doZombiePathfinding = (room.zombieTickCount % 2 === 0);

            allPlayers.forEach(player => {
                if (!player.alive || room.gameEnded || room.countdownActive) return;

                player.x = Math.max(20, Math.min(ARENA_W - 20, player.x + player.moveDir.x * player.speed * dt));
                player.y = Math.max(20, Math.min(ARENA_H - 20, player.y + player.moveDir.y * player.speed * dt));

                const zd = Math.hypot(player.x - room.zone.x, player.y - room.zone.y);
                if (zd > room.zone.radius - PLAYER_SIZE / 2) {
                    player.hp -= ZONE_DMG_S * dt;
                    player.lastDamageTime = now;
                    if (player.hp <= 0) eliminatePlayer(code, room, player, null);
                }

                if (player.hp < player.maxHp && (now - (player.lastDamageTime ?? 0)) > HP_REGEN_DELAY) {
                    player.hp = Math.min(player.maxHp, player.hp + HP_REGEN_RATE * dt);
                }

                if (player.shootCooldown > 0) player.shootCooldown -= dt;
                if (player.reloading) {
                    player.reloadTimer -= dt;
                    if (player.reloadTimer <= 0) {
                        player.reloading   = false;
                        player.reloadTimer = 0;
                        player.ammo        = AMMO_MAX;
                    }
                }
                if (player.ammo <= 0 && !player.reloading) {
                    player.reloading   = true;
                    player.reloadTimer = AMMO_RELOAD_TIME;
                    player.shooting    = false;
                }
                if (player.shooting && !player.reloading && player.shootCooldown <= 0 && player.ammo > 0) {
                    const dirLen = Math.hypot(player.shootDir.x || 0, player.shootDir.y || 0);
                    if (dirLen >= 0.1) {
                        const dirX = player.shootDir.x / dirLen;
                        const dirY = player.shootDir.y / dirLen;
                        const SPAWN_OFFSET = 25;
                        room.bullets.push({
                            id:       room.nextBulletId++,
                            ownerId:  player.id,
                            x:        player.x + dirX * SPAWN_OFFSET,
                            y:        player.y + dirY * SPAWN_OFFSET,
                            dx:       dirX * BULLET_SPEED,
                            dy:       dirY * BULLET_SPEED,
                            damage:   player.damage,
                            radius:   BULLET_RADIUS,
                            lifetime: BULLET_LIFE
                        });
                        player.ammo--;
                        player.shootCooldown = SHOOT_CD;
                        if (player.ammo <= 0) {
                            player.reloading   = true;
                            player.reloadTimer = AMMO_RELOAD_TIME;
                            player.shooting    = false;
                        }
                    }
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

            // Coliziune player-player: impinge jucatorii vii departe unii de altii
            const PLAYER_R = PLAYER_SIZE / 2;
            const aliveMov = allPlayers.filter(p => p.alive);
            for (let i = 0; i < aliveMov.length; i++) {
                for (let j = i + 1; j < aliveMov.length; j++) {
                    const a = aliveMov[i], b = aliveMov[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    const dist = Math.hypot(dx, dy);
                    const minD = PLAYER_R * 2;
                    if (dist < minD && dist > 0) {
                        const push = (minD - dist) * 0.5;
                        const nx = dx / dist, ny = dy / dist;
                        a.x = Math.max(20, Math.min(ARENA_W - 20, a.x + nx * push));
                        a.y = Math.max(20, Math.min(ARENA_H - 20, a.y + ny * push));
                        b.x = Math.max(20, Math.min(ARENA_W - 20, b.x - nx * push));
                        b.y = Math.max(20, Math.min(ARENA_H - 20, b.y - ny * push));
                    }
                }
            }

            // alivePlayers calculat o data dupa primul loop (unii pot fi eliminati de zona)
            const alivePlayers = allPlayers.filter(p => p.alive);

            room.zombies.forEach(z => {
                if (room.gameEnded || room.countdownActive || z.hp <= 0) return;
                if (z.attackCooldown > 0) z.attackCooldown -= dt;

                let target = null;
                let bestD = Infinity;
                alivePlayers.forEach(p => {
                    const d = Math.hypot(p.x - z.x, p.y - z.y);
                    if (d < bestD) { bestD = d; target = p; }
                });

                let dx = 0, dy = 0, speed = ZOMBIE_WANDER_SPEED;
                if (target && bestD <= ZOMBIE_AGGRO_RADIUS) {
                    dx = target.x - z.x;
                    dy = target.y - z.y;
                    speed = ZOMBIE_SPEED;
                    if (bestD <= ZOMBIE_ATTACK_RANGE && z.attackCooldown <= 0) {
                        target.hp -= ZOMBIE_DAMAGE;
                        target.lastDamageTime = now;
                        z.attackCooldown = ZOMBIE_ATTACK_CD;
                        io.to(target.id).emit('zombie-hit', { amount: ZOMBIE_DAMAGE, x: target.x, y: target.y });
                        if (target.hp <= 0) eliminatePlayer(code, room, target, null, 'Zombie');
                    }
                } else {
                    if (now > z.wanderUntil) {
                        z.wanderAngle = Math.random() * Math.PI * 2;
                        z.wanderUntil = now + 1200 + Math.random() * 1800;
                    }
                    dx = Math.cos(z.wanderAngle);
                    dy = Math.sin(z.wanderAngle);
                }

                // Angle-sweep pathfinding: ruleaza o data la 2 tick-uri (10Hz) — directia se cacheza
                const rawLen = Math.hypot(dx, dy);
                if (rawLen > 0) { dx /= rawLen; dy /= rawLen; }

                const baseAngle = Math.atan2(dy, dx);
                let finalAngle;

                if (doZombiePathfinding) {
                    finalAngle = baseAngle;
                    const CHECK_DIST = 58;
                    const MARGIN     = ZOMBIE_RADIUS + 10;
                    function isClear(angle) {
                        const cdx = Math.cos(angle), cdy = Math.sin(angle);
                        for (const obs of room.obstacles) {
                            const ox = obs.x - z.x, oy = obs.y - z.y;
                            const proj = ox * cdx + oy * cdy;
                            if (proj < 0 || proj > CHECK_DIST + obs.radius) continue;
                            const lx = ox - proj * cdx, ly = oy - proj * cdy;
                            if (Math.hypot(lx, ly) < obs.radius + MARGIN) return false;
                        }
                        return true;
                    }
                    if (!isClear(baseAngle)) {
                        let found = false;
                        for (let deg = 15; deg <= 105; deg += 15) {
                            const rad = deg * Math.PI / 180;
                            const L = isClear(baseAngle - rad);
                            const R = isClear(baseAngle + rad);
                            if (L || R) {
                                if (L && R) {
                                    const dL = Math.abs(baseAngle - rad - z.angle);
                                    const dR = Math.abs(baseAngle + rad - z.angle);
                                    finalAngle = dL < dR ? baseAngle - rad : baseAngle + rad;
                                } else {
                                    finalAngle = L ? baseAngle - rad : baseAngle + rad;
                                }
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            z.wanderAngle = (z.wanderAngle + Math.PI * 0.75) % (Math.PI * 2);
                            z.wanderUntil = now + 600;
                            finalAngle = z.wanderAngle;
                        }
                    }
                    z._cachedFinalAngle = finalAngle;
                } else {
                    finalAngle = z._cachedFinalAngle !== undefined ? z._cachedFinalAngle : baseAngle;
                }

                dx = Math.cos(finalAngle);
                dy = Math.sin(finalAngle);

                if (z.hp > 0) {
                    z.angle = finalAngle;
                    z.x = Math.max(35, Math.min(ARENA_W - 35, z.x + dx * speed * dt));
                    z.y = Math.max(35, Math.min(ARENA_H - 35, z.y + dy * speed * dt));
                }

                for (const obs of room.obstacles) {
                    const ox = z.x - obs.x, oy = z.y - obs.y;
                    const od = Math.hypot(ox, oy);
                    const minD = ZOMBIE_RADIUS + obs.radius;
                    if (od < minD && od > 0) {
                        z.x = obs.x + (ox / od) * minD;
                        z.y = obs.y + (oy / od) * minD;
                    }
                }
            });

            alivePlayers.forEach(player => {
                for (let i = room.pickups.length - 1; i >= 0; i--) {
                    const item = room.pickups[i];
                    if (player.hp >= player.maxHp) continue;
                    if (Math.hypot(player.x - item.x, player.y - item.y) > 48) continue;
                    const before = player.hp;
                    player.hp = Math.min(player.maxHp, player.hp + HEALTH_PICKUP_HEAL);
                    room.pickups.splice(i, 1);
                    io.to(code).emit('pickup-collected', {
                        id: item.id,
                        x: item.x,
                        y: item.y,
                        playerId: player.id,
                        heal: Math.round(player.hp - before)
                    });
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

                // Swept collision pentru obstacole SI jucatori — un pas de 20px
                const moveLen = Math.hypot(b.x - prevX, b.y - prevY);
                const steps   = Math.max(1, Math.ceil(moveLen / 20));
                const hitR    = PLAYER_SIZE / 2 + b.radius;

                // Obstacole: swept (bullet poate traversa roca daca jucatorul e lipit de ea)
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

                for (const z of room.zombies) {
                    if (z.hp <= 0) continue;

                    let hitZombie = false;
                    for (let s = 1; s <= steps; s++) {
                        const bx = prevX + (b.x - prevX) * s / steps;
                        const by = prevY + (b.y - prevY) * s / steps;
                        if (Math.hypot(bx - z.x, by - z.y) < ZOMBIE_RADIUS + b.radius) {
                            hitZombie = true;
                            break;
                        }
                    }

                    if (hitZombie) {
                        z.hp -= b.damage;
                        io.to(b.ownerId).emit('damage-dealt', { amount: Math.round(b.damage), x: z.x, y: z.y });
                        if (z.hp <= 0) {
                            zombieDied = true;
                            const item = { id: room.nextPickupId++, x: z.x, y: z.y, spawnedAt: now };
                            room.pickups.push(item);
                        } else {
                            io.to(code).emit('bullet-hit', { x: b.x, y: b.y });
                        }
                        return false;
                    }
                }

                for (const p of alivePlayers) {
                    if (p.id === b.ownerId) continue;

                    let hit = false;
                    for (let s = 1; s <= steps; s++) {
                        const bx = prevX + (b.x - prevX) * s / steps;
                        const by = prevY + (b.y - prevY) * s / steps;
                        if (Math.hypot(bx - p.x, by - p.y) < hitR) { hit = true; break; }
                    }

                    if (hit) {
                        p.hp -= b.damage;
                        p.lastDamageTime = now;
                        io.to(b.ownerId).emit('damage-dealt', { amount: Math.round(b.damage), x: p.x, y: p.y });
                        if (p.hp <= 0) eliminatePlayer(code, room, p, b.ownerId);
                        else io.to(code).emit('bullet-hit', { x: b.x, y: b.y });
                        return false;
                    }
                }
                return true;
            });
            if (zombieDied) room.zombies = room.zombies.filter(z => z.hp > 0);

            if (room.zone.shrinking && room.zone.startTime) {
                const progress = Math.min((now - room.zone.startTime) / ZONE_SHRINK_DURATION, 1);
                room.zone.radius = ZONE_START_RADIUS - (ZONE_START_RADIUS - ZONE_END_RADIUS) * progress;
            }

            // Compact per-socket broadcast cu proximity filtering pentru gloante
            const z = room.zone;
            const zArr = [Math.round(z.x), Math.round(z.y), Math.round(z.radius), z.shrinking ? 1 : 0];

            // pArr: [id, x, y, angle, hp, alive, kills]  — name/maxHp trimise o data la start
            const pArr = allPlayers.map(p => [
                p.id,
                Math.round(p.x), Math.round(p.y),
                +p.angle.toFixed(3),
                Math.round(p.hp),
                p.alive ? 1 : 0,
                p.kills
            ]);
            const zmbArr = room.zombies.map(z => [
                z.id,
                Math.round(z.x), Math.round(z.y),
                Math.round(z.hp),
                z.maxHp,
                +z.angle.toFixed(3)
            ]);
            const itemArr = room.pickups.map(item => [
                item.id,
                Math.round(item.x), Math.round(item.y)
            ]);

            allPlayers.forEach(recv => {
                // bArr: [id, x, y, dirX, dirY] — doar gloantele din raza vizuala
                const bArr = [...room.bullets, ...expiredBullets]
                    .filter(b => (b.x - recv.x) ** 2 + (b.y - recv.y) ** 2 < VIEW_DSQ)
                    .map(b => [
                        b.id,
                        Math.round(b.x), Math.round(b.y),
                        +(b.dx / BULLET_SPEED).toFixed(3),
                        +(b.dy / BULLET_SPEED).toFixed(3),
                        b.ownerId
                    ]);
                const reloadProgress = recv.reloading
                    ? Math.max(0, Math.min(1, 1 - recv.reloadTimer / AMMO_RELOAD_TIME))
                    : 1;
                const ammoArr = [recv.ammo, AMMO_MAX, recv.reloading ? 1 : 0, +reloadProgress.toFixed(3)];
                io.to(recv.id).emit('gs', [pArr, bArr, zArr, ammoArr, zmbArr, itemArr]);
            });

        } catch (err) {
            console.error(`[${code}] Game loop error:`, err.stack || err);
        }
    }, 1000 / TICK_RATE);
}

function eliminatePlayer(code, room, player, killerId, causeName = 'zona') {
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
        killedBy: killerPlayer ? killerPlayer.name : (causeName === 'zona' ? null : causeName),
        kills:    player.kills
    });

    if (killerPlayer) {
        io.to(code).emit('kill-event', { killerName: killerPlayer.name, victimName: player.name, byZone: false });
    } else if (causeName !== 'zona') {
        io.to(code).emit('kill-event', { killerName: causeName, victimName: player.name, byZone: false });
    } else {
        io.to(code).emit('kill-event', { victimName: player.name, byZone: true });
    }

    console.log(`[${code}] ${player.name} eliminat de ${killerPlayer ? killerPlayer.name : 'zona'} (loc ${placement}/${totalPlayers})`);

    if (alive.length === 1 && totalPlayers > 1) {
        const winner = alive[0];
        io.to(winner.id).emit('winner', { kills: winner.kills });
        io.to(code).emit('game-ended', { winnerName: winner.name });
        room.gameEnded = true;
        if (room.gameLoop) { clearInterval(room.gameLoop); room.gameLoop = null; }

        updatePlayerRoundEnd(player.id, player.name, player.kills, false);
        updatePlayerRoundEnd(winner.id, winner.name, winner.kills, true);
    } else {
        updatePlayerRoundEnd(player.id, player.name, player.kills, false);
    }

    if (alive.length === 0) {
        io.to(code).emit('game-ended', { winnerName: null });
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
    room.pickups      = [];
    room.nextPickupId = 0;
    room.zone = { x: ARENA_W / 2, y: ARENA_H / 2, radius: ZONE_START_RADIUS, shrinking: false, startTime: null };
    room.obstacles = generateObstacles(SPAWN_POINTS);
    room.zombies = generateZombies(room.obstacles);
    assignSpawnPoints(Object.values(room.players), room.obstacles);
    Object.values(room.players).forEach(p => {
        p.hp = p.maxHp; p.alive = true; p.angle = 0; p.kills = 0;
        p.moveDir = { x: 0, y: 0 }; p.shootDir = { x: 0, y: 0 };
        p.shooting = false; p.shootCooldown = 0;
        p.ammo = AMMO_MAX; p.reloading = false; p.reloadTimer = 0;
        p.lastDamageTime = 0;
    });
    const rematchMeta = {};
    Object.values(room.players).forEach(p => { rematchMeta[p.id] = { speed: p.speed, maxHp: p.maxHp, name: p.name }; });
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

    socket.on('authenticate', ({ nickname, token } = {}) => {
        if (!nickname || !token) return;
        if (sessionTokens.get(nickname) !== token) {
            socket.emit('force-logout', 'Sesiune invalida. Te rugam sa te reconectezi.');
            return;
        }
        const prev = connectedAccounts.get(nickname);
        if (prev && prev !== socket.id) {
            const prevSocket = io.sockets.sockets.get(prev);
            if (prevSocket) {
                prevSocket.emit('force-logout', 'Un alt dispozitiv s-a conectat la acest cont.');
                prevSocket.disconnect(true);
            }
        }
        connectedAccounts.set(nickname, socket.id);
        socket._nickname = nickname;
        // Notify friends this player is online + send back which friends are online
        notifyFriendsPresence(nickname, 'friend-online');
        getFriendNicknames(nickname).then(friends => {
            const online = friends.filter(n => connectedAccounts.has(n));
            if (online.length) socket.emit('friends-online-status', online);
        }).catch(() => {});
    });

    socket.on('create-room', (data) => {
        if (!socket._nickname) { socket.emit('room-error', 'Neautentificat.'); return; }
        data = { ...data, name: socket._nickname };
        const code = generateCode();
        const room = newRoom(socket.id);
        rooms.set(code, room);
        socket.join(code);
        addPlayer(code, room, socket, data);
        socket.emit('room-created', { code });
        broadcastWaiting(code, room);
        console.log(`[${code}] Camera creata de ${socket._nickname}`);
    });

    socket.on('join-room', (payload) => {
        if (!socket._nickname) { socket.emit('room-error', 'Neautentificat.'); return; }
        const { code: rawCode, ...data } = payload;
        data.name = socket._nickname;
        const code = (rawCode || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) {
            socket.emit('room-error', 'Cod invalid. Verifica si incearca din nou.');
            return;
        }
        if (room.gameStarted) {
            socket.emit('room-error', 'Jocul a inceput deja in aceasta camera.');
            return;
        }
        socket.join(code);
        addPlayer(code, room, socket, data);
        socket.emit('room-joined', { code, isHost: false });
        broadcastWaiting(code, room);
        console.log(`[${code}] ${socket._nickname} a intrat`);
    });

    socket.on('start-game', () => {
        const result = getPlayerRoom(socket.id);
        if (!result) return;
        const { code, room } = result;
        if (room.hostId !== socket.id || room.gameStarted) return;

        room.gameStarted     = true;
        room.countdownActive = true;
        room.obstacles       = generateObstacles(SPAWN_POINTS);
        room.zombies         = generateZombies(room.obstacles);
        room.pickups         = [];
        room.nextPickupId    = 0;

        assignSpawnPoints(Object.values(room.players), room.obstacles);
        Object.values(room.players).forEach(p => {
            p.ammo = AMMO_MAX; p.reloading = false; p.reloadTimer = 0;
            p.shooting = false; p.shootCooldown = 0;
        });

        const zoneStartsAt = Date.now() + 33000; // 3s countdown + 30s real play time
        const playersMeta = {};
        Object.values(room.players).forEach(p => { playersMeta[p.id] = { speed: p.speed, maxHp: p.maxHp, name: p.name }; });
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
        if (socket._nickname && connectedAccounts.get(socket._nickname) === socket.id) {
            connectedAccounts.delete(socket._nickname);
            notifyFriendsPresence(socket._nickname, 'friend-offline');
        }

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

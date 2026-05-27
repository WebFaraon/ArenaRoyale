require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const msgpackParser = require('socket.io-msgpack-parser');
const path    = require('path');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { parser: msgpackParser, transports: ['websocket'] });

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

    if (!supabase) {
        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens.set(nickname, token);
        return res.json({ ok: true, token, player: { nickname, avatar: null, kills_total: 0, wins_total: 0, games_played: 0, stat_hp: 0, stat_dmg: 0, stat_spd: 0 } });
    }

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
            .select('nickname, kills_total, wins_total, games_played, xp')
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

let _lbDebounceTimer = null;
async function broadcastLeaderboard() {
    if (!supabase || _lbDebounceTimer) return;
    _lbDebounceTimer = setTimeout(async () => {
        _lbDebounceTimer = null;
        try {
            const { data } = await supabase.from('players')
                .select('nickname, kills_total, wins_total, games_played, xp')
                .order('wins_total',  { ascending: false })
                .order('kills_total', { ascending: false })
                .limit(50);
            io.emit('leaderboard-update', data || []);
        } catch (err) {
            console.error('[Supabase] broadcastLeaderboard error:', err);
        }
    }, 10000);
}

// ---------- CONSTANTE ----------
const ARENA_W          = 2600;
const ARENA_H          = 2600;
const TICK_RATE        = 60;
const BULLET_SPEED     = 1000;
const BULLET_RADIUS    = 6;
const BULLET_LIFE      = 0.60;
const AIM_DELAY        = 0.3;
const SHOOT_CD         = 0.25;
const AMMO_MAX         = 10;
const AMMO_RELOAD_TIME = 3;
const PLAYER_SIZE      = 60;
const ZONE_INITIAL_R   = 1650;
const ZONE_WAIT        = 30;
const ZONE_SHRINK_RATE = 14;   // px/s → fully closed in ~125s
const ZONE_DMG         = 20;   // HP/s outside zone
const PLAYER_R         = PLAYER_SIZE / 2;
const HP_REGEN_RATE    = 25;
const HP_REGEN_DELAY   = 6000;
const ZOMBIE_COUNT      = 8;
const ZOMBIE_HP         = 100;
const ZOMBIE_R          = 20;
const ZOMBIE_PATROL_SPD = 30;
const ZOMBIE_CHASE_SPD  = 62;
const ZOMBIE_DETECT_R   = 320;
const ZOMBIE_ATTACK_R   = 55;
const ZOMBIE_ATTACK_DMG = 20;
const ZOMBIE_ATTACK_CD  = 1.0;
const ZOMBIE_PATROL_T   = 3.5;

const SPAWN_POINTS = Array.from({ length: 15 }, (_, i) => {
    const a = (i / 15) * Math.PI * 2;
    return { x: Math.round(ARENA_W / 2 + 900 * Math.cos(a)), y: Math.round(ARENA_H / 2 + 900 * Math.sin(a)) };
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
            const sid    = connectedAccounts.get(requester);
            const mySid  = connectedAccounts.get(nickname);
            // Fetch XP for both so clients can show correct level immediately
            const { data: profiles } = await supabase.from('players')
                .select('nickname, xp').in('nickname', [nickname, requester]);
            const xpMap = {};
            (profiles || []).forEach(p => { xpMap[p.nickname] = p.xp || 0; });
            // Tell requester: friend accepted with full profile snapshot
            if (sid) io.to(sid).emit('friend-accepted', {
                by: nickname,
                xp: xpMap[nickname] || 0,
                online: !!mySid
            });
            // Tell acceptor: new friend added with full profile snapshot
            if (mySid) io.to(mySid).emit('friend-added', {
                nickname: requester,
                xp: xpMap[requester] || 0,
                online: !!sid
            });
        } else {
            await supabase.from('friendships').delete()
                .eq('requester', requester).eq('target', nickname).eq('status', 'pending');
        }
        res.json({ ok: true });
    } catch { res.json({ ok: false }); }
});

app.post('/api/friends/remove', async (req, res) => {
    const { nickname, token, target } = req.body || {};
    if (!nickname || !token || !target || !supabase) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false });
    try {
        await supabase.from('friendships').delete()
            .or(`and(requester.eq.${nickname},target.eq.${target}),and(requester.eq.${target},target.eq.${nickname})`)
            .eq('status', 'accepted');
        const targetSid = connectedAccounts.get(target);
        if (targetSid) io.to(targetSid).emit('friend-removed', { by: nickname });
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

function randomSpawnPos() {
    return {
        x: 300 + Math.random() * (ARENA_W - 600),
        y: 300 + Math.random() * (ARENA_H - 600)
    };
}

function assignSpawnPositions(players, obstacles) {
    players.forEach(p => {
        let pos, attempts = 0;
        do {
            pos = randomSpawnPos();
            attempts++;
        } while (attempts < 60 && obstacles &&
            obstacles.some(o => Math.hypot(pos.x - o.x, pos.y - o.y) < o.r + PLAYER_R + 25));
        p.x = pos.x;
        p.y = pos.y;
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

function generateObstacles() {
    const obs = [];
    const MIN_GAP = 130;
    function place(type, count, rMin, rMax) {
        let attempts = 0, placed = 0;
        while (placed < count && attempts < count * 30) {
            attempts++;
            const r = Math.round(rMin + Math.random() * (rMax - rMin));
            const x = Math.round(220 + Math.random() * (ARENA_W - 440));
            const y = Math.round(220 + Math.random() * (ARENA_H - 440));
            let ok = true;
            for (const o of obs) {
                if (Math.hypot(x - o.x, y - o.y) < MIN_GAP + r + o.r) { ok = false; break; }
            }
            const rot = +(Math.random() * Math.PI * 2).toFixed(3);
            if (ok) { obs.push({ type, x, y, r, rot }); placed++; }
        }
    }
    place('tree', 26, 42, 62);
    place('rock', 16, 26, 42);
    return obs;
}

function generateZombies(obstacles) {
    const zombies = [];
    const margin = 200;
    let attempts = 0;
    while (zombies.length < ZOMBIE_COUNT && attempts < 600) {
        attempts++;
        const x = margin + Math.random() * (ARENA_W - margin * 2);
        const y = margin + Math.random() * (ARENA_H - margin * 2);
        const tooClose = obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.r + ZOMBIE_R + 40)
            || zombies.some(z => Math.hypot(x - z.x, y - z.y) < ZOMBIE_R * 4);
        if (tooClose) continue;
        zombies.push({
            id: zombies.length,
            x, y,
            angle: Math.random() * Math.PI * 2,
            hp: ZOMBIE_HP,
            alive: true,
            state: 'patrol',
            patrolTargetX: x,
            patrolTargetY: y,
            patrolTimer: Math.random() * ZOMBIE_PATROL_T,
            attackCooldown: 0
        });
    }
    return zombies;
}

function newRoom(hostId) {
    const _obs = generateObstacles();
    return {
        hostId,
        players:     {},
        _playerArr:  [],
        bullets:     [],
        nextBulletId: 0,
        obstacles:   _obs,
        zombies:     generateZombies(_obs),
        healthKits:  [],
        nextKitId:   0,
        zone: { cx: ARENA_W/2, cy: ARENA_H/2, r: ZONE_INITIAL_R, waitTimer: ZONE_WAIT, startDelay: 4 },
        gameStarted:     false,
        gameEnded:       false,
        countdownActive: false,
        rematchVotes: new Set(),
        gameLoop:    null,
        lastTick:    0,
        spawnIndex:  0,
    };
}

function getPlayerRoom(socketId) {
    for (const [code, room] of rooms) {
        if (room.players[socketId]) return { code, room };
    }
    return null;
}

// Cache O(1) — socket._roomCode setat la join/create
function fastGetRoom(socket) {
    const code = socket._roomCode;
    if (!code) return null;
    const room = rooms.get(code);
    if (!room || !room.players[socket.id]) return null;
    return { code, room };
}

function addPlayer(code, room, socket, data) {
    const s   = data.stats || {};
    const hp  = Math.min(10, Math.max(0, Math.floor(+s.hp  || 0)));
    const dmg = Math.min(10, Math.max(0, Math.floor(+s.dmg || 0)));
    const spd = Math.min(10, Math.max(0, Math.floor(+s.spd || 0)));
    const total = hp + dmg + spd;
    const scale = total > 10 ? 10 / total : 1;

    const maxHp  = 350 + Math.round(hp  * scale) * 40;
    const damage = 10  + Math.round(dmg * scale) * 2;
    const speed  = (2.0 + Math.round(spd * scale) * 0.2) * 60; // px/sec

    room.players[socket.id] = {
        id: socket.id, name: data.name, image: data.image, xp: data.xp || 0,
        x: SPAWN_POINTS[room.spawnIndex % SPAWN_POINTS.length].x,
        y: SPAWN_POINTS[(room.spawnIndex++) % SPAWN_POINTS.length].y,
        angle: 0, size: PLAYER_SIZE,
        hp: maxHp, maxHp, damage, speed,
        moveDir:  { x: 0, y: 0 },
        shootDir: { x: 0, y: 0 },
        shooting: false, shootCooldown: 0, aimTimer: 0,
        ammo: AMMO_MAX, reloading: false, reloadTimer: 0,
        alive: true, kills: 0, lastDamageTime: 0,
        lastAckSeq: 0,
        pendingAckSeq: 0
    };
    room._playerArr.push(room.players[socket.id]);

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
    const INTERVAL_MS = Math.round(1000 / TICK_RATE);
    room.lastTick = Date.now();

    const _pScratch       = [];
    const _bScratch       = [];
    const _aliveScratch   = [];
    const _expiredBullets = [];
    let _tpsCount = 0, _tpsWindowStart = Date.now();
    let expected = Date.now() + INTERVAL_MS;

    function tick() {
        const tickStart = Date.now();
        try {
            if (!room.gameStarted || !rooms.has(code)) return;
            const now = tickStart;
            const dt  = INTERVAL_MS / 1000;
            room.lastTick = now;

            const allPlayers = room._playerArr;

            allPlayers.forEach(player => {
                if (!player.alive || room.gameEnded || room.countdownActive) return;

                player.x = Math.max(20, Math.min(ARENA_W - 20, player.x + player.moveDir.x * player.speed * dt));
                player.y = Math.max(20, Math.min(ARENA_H - 20, player.y + player.moveDir.y * player.speed * dt));
                for (const obs of room.obstacles) {
                    const _od = Math.hypot(player.x - obs.x, player.y - obs.y);
                    const _om = obs.r + PLAYER_R;
                    if (_od < _om && _od > 0) {
                        player.x = obs.x + (player.x - obs.x) / _od * _om;
                        player.y = obs.y + (player.y - obs.y) / _od * _om;
                    }
                }

                if (player.hp < player.maxHp && (now - (player.lastDamageTime || 0)) > HP_REGEN_DELAY) {
                    player.hp = Math.min(player.maxHp, player.hp + HP_REGEN_RATE * dt);
                }

                if (player.shootCooldown > 0) player.shootCooldown -= dt;
                if (player.aimTimer > 0) player.aimTimer -= dt;
                if (player.reloading) {
                    player.reloadTimer -= dt;
                    if (player.reloadTimer <= 0) {
                        player.reloading = false; player.reloadTimer = 0; player.ammo = AMMO_MAX;
                    }
                }
                if (player.ammo <= 0 && !player.reloading) {
                    player.reloading = true; player.reloadTimer = AMMO_RELOAD_TIME; player.shooting = false;
                }
                if (player.shooting && !player.reloading && player.shootCooldown <= 0 && player.ammo > 0 && player.aimTimer <= 0) {
                    const dl = Math.hypot(player.shootDir.x || 0, player.shootDir.y || 0);
                    if (dl >= 0.1) {
                        const dx = player.shootDir.x / dl, dy = player.shootDir.y / dl;
                        room.bullets.push({
                            id: room.nextBulletId++, ownerId: player.id,
                            x: player.x + dx * 25, y: player.y + dy * 25,
                            dx: dx * BULLET_SPEED, dy: dy * BULLET_SPEED,
                            damage: player.damage, radius: BULLET_RADIUS, lifetime: BULLET_LIFE
                        });
                        player.ammo--;
                        player.shootCooldown = SHOOT_CD;
                        if (player.ammo <= 0) {
                            player.reloading = true; player.reloadTimer = AMMO_RELOAD_TIME; player.shooting = false;
                        }
                    }
                }

                if (player.pendingAckSeq > player.lastAckSeq) player.lastAckSeq = player.pendingAckSeq;
            });

            // Coliziune jucator-jucator
            _aliveScratch.length = 0;
            for (const p of allPlayers) { if (p.alive) _aliveScratch.push(p); }
            const alivePlayers = _aliveScratch;
            const _minD = PLAYER_R * 2, _minDSq = _minD * _minD;
            for (let i = 0; i < alivePlayers.length; i++) {
                for (let j = i + 1; j < alivePlayers.length; j++) {
                    const a = alivePlayers[i], b = alivePlayers[j];
                    const dx = a.x - b.x, dy = a.y - b.y;
                    if (Math.abs(dx) >= PLAYER_SIZE || Math.abs(dy) >= PLAYER_SIZE) continue;
                    const dSq = dx * dx + dy * dy;
                    if (dSq < _minDSq && dSq > 0) {
                        const d = Math.sqrt(dSq), push = (_minD - d) * 0.5, nx = dx / d, ny = dy / d;
                        a.x = Math.max(20, Math.min(ARENA_W - 20, a.x + nx * push));
                        a.y = Math.max(20, Math.min(ARENA_H - 20, a.y + ny * push));
                        b.x = Math.max(20, Math.min(ARENA_W - 20, b.x - nx * push));
                        b.y = Math.max(20, Math.min(ARENA_H - 20, b.y - ny * push));
                    }
                }
            }

            // Zona
            const zone = room.zone;
            if (zone.startDelay > 0) {
                zone.startDelay = Math.max(0, zone.startDelay - dt);
            } else if (zone.waitTimer > 0) {
                zone.waitTimer = Math.max(0, zone.waitTimer - dt);
            } else if (zone.r > 0) {
                zone.r = Math.max(0, zone.r - ZONE_SHRINK_RATE * dt);
            }
            for (const player of allPlayers) {
                if (!player.alive) continue;
                const _dz = Math.hypot(player.x - zone.cx, player.y - zone.cy);
                if (zone.r === 0 || _dz > zone.r) {
                    player.hp -= ZONE_DMG * dt;
                    player.lastDamageTime = now;
                    if (player.hp <= 0) eliminatePlayer(code, room, player, null);
                }
            }

            // Zombi AI
            for (const zombie of room.zombies) {
                if (!zombie.alive || room.countdownActive) continue;
                zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);

                // Gaseste cel mai aproape jucator viu
                let nearestPlayer = null, nearestDist = Infinity;
                for (const p of alivePlayers) {
                    const d = Math.hypot(p.x - zombie.x, p.y - zombie.y);
                    if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
                }

                // Tranzitii de stare
                if (nearestPlayer && nearestDist < ZOMBIE_DETECT_R) {
                    zombie.state = 'chase';
                } else if (nearestDist > ZOMBIE_DETECT_R * 1.4) {
                    zombie.state = 'patrol';
                }

                // Target de miscare
                let targetX, targetY;
                const speed = zombie.state === 'chase' ? ZOMBIE_CHASE_SPD : ZOMBIE_PATROL_SPD;
                if (zombie.state === 'chase' && nearestPlayer) {
                    targetX = nearestPlayer.x;
                    targetY = nearestPlayer.y;
                } else {
                    zombie.patrolTimer -= dt;
                    const distToTarget = Math.hypot(zombie.patrolTargetX - zombie.x, zombie.patrolTargetY - zombie.y);
                    if (zombie.patrolTimer <= 0 || distToTarget < 25) {
                        zombie.patrolTargetX = 200 + Math.random() * (ARENA_W - 400);
                        zombie.patrolTargetY = 200 + Math.random() * (ARENA_H - 400);
                        zombie.patrolTimer = ZOMBIE_PATROL_T + Math.random() * 2;
                    }
                    targetX = zombie.patrolTargetX;
                    targetY = zombie.patrolTargetY;
                }

                // Directie dorita
                let ddx = targetX - zombie.x, ddy = targetY - zombie.y;
                const dLen = Math.hypot(ddx, ddy);
                if (dLen > 0) { ddx /= dLen; ddy /= dLen; }

                // Repulsie obstacole (steering)
                for (const obs of room.obstacles) {
                    const od = Math.hypot(zombie.x - obs.x, zombie.y - obs.y);
                    const influence = obs.r + ZOMBIE_R + 55;
                    if (od < influence && od > 0) {
                        const str = (influence - od) / influence;
                        ddx += (zombie.x - obs.x) / od * str * 2.8;
                        ddy += (zombie.y - obs.y) / od * str * 2.8;
                    }
                }

                // Misca zombiul
                const moveLen = Math.hypot(ddx, ddy);
                if (moveLen > 0) {
                    zombie.x += (ddx / moveLen) * speed * dt;
                    zombie.y += (ddy / moveLen) * speed * dt;
                    zombie.angle = Math.atan2(ddy / moveLen, ddx / moveLen);
                }

                // Clamp arena
                zombie.x = Math.max(ZOMBIE_R, Math.min(ARENA_W - ZOMBIE_R, zombie.x));
                zombie.y = Math.max(ZOMBIE_R, Math.min(ARENA_H - ZOMBIE_R, zombie.y));

                // Push-out din obstacole
                for (const obs of room.obstacles) {
                    const od = Math.hypot(zombie.x - obs.x, zombie.y - obs.y);
                    const minD = obs.r + ZOMBIE_R;
                    if (od < minD && od > 0) {
                        zombie.x += (zombie.x - obs.x) / od * (minD - od);
                        zombie.y += (zombie.y - obs.y) / od * (minD - od);
                    }
                }

                // Separator zombi-jucator (zombiul nu intra in jucator)
                for (const p of alivePlayers) {
                    const pd = Math.hypot(zombie.x - p.x, zombie.y - p.y);
                    const minPD = ZOMBIE_R + PLAYER_R;
                    if (pd < minPD && pd > 0) {
                        zombie.x += (zombie.x - p.x) / pd * (minPD - pd);
                        zombie.y += (zombie.y - p.y) / pd * (minPD - pd);
                    }
                }

                // Atac jucatori in raza
                if (zombie.attackCooldown <= 0) {
                    for (const p of alivePlayers) {
                        if (Math.hypot(p.x - zombie.x, p.y - zombie.y) < ZOMBIE_ATTACK_R) {
                            p.hp -= ZOMBIE_ATTACK_DMG;
                            p.lastDamageTime = now;
                            zombie.attackCooldown = ZOMBIE_ATTACK_CD;
                            if (p.hp <= 0) eliminatePlayer(code, room, p, null);
                            break;
                        }
                    }
                }
            }

            // Gloante: miscare + coliziune cu jucatori
            _expiredBullets.length = 0;
            let _bKeep = 0;
            for (let bi = 0; bi < room.bullets.length; bi++) {
                const b = room.bullets[bi];
                const prevX = b.x, prevY = b.y;
                b.x += b.dx * dt; b.y += b.dy * dt; b.lifetime -= dt;
                let keep = true;
                if (b.lifetime <= 0 || b.x < 0 || b.x > ARENA_W || b.y < 0 || b.y > ARENA_H) {
                    if (b.lifetime <= 0 && b.x >= 0 && b.x <= ARENA_W && b.y >= 0 && b.y <= ARENA_H)
                        _expiredBullets.push(b);
                    keep = false;
                } else if (room.obstacles.some(o => Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.radius)) {
                    keep = false;
                } else {
                    // Coliziune glont-zombie
                    for (const zombie of room.zombies) {
                        if (!zombie.alive) continue;
                        if (Math.hypot(b.x - zombie.x, b.y - zombie.y) < ZOMBIE_R + b.radius) {
                            const _zPrevHp = zombie.hp;
                            zombie.hp -= b.damage;
                            io.to(b.ownerId).emit('hit', { amount: Math.round(Math.min(b.damage, _zPrevHp)), x: zombie.x, y: zombie.y });
                            if (zombie.hp <= 0) {
                                zombie.hp = 0; zombie.alive = false;
                                room.healthKits.push({ id: room.nextKitId++, x: zombie.x, y: zombie.y, spawnTime: now });
                            }
                            keep = false; break;
                        }
                    }
                }
                if (keep) {
                    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - prevX, b.y - prevY) / 20));
                    const hitR  = PLAYER_R + b.radius;
                    for (const p of alivePlayers) {
                        if (p.id === b.ownerId) continue;
                        let hit = false;
                        for (let s = 1; s <= steps; s++) {
                            const bx = prevX + (b.x - prevX) * s / steps;
                            const by = prevY + (b.y - prevY) * s / steps;
                            if (Math.hypot(bx - p.x, by - p.y) < hitR) { hit = true; break; }
                        }
                        if (hit) {
                            const _pPrevHp = p.hp;
                            p.hp -= b.damage; p.lastDamageTime = now;
                            io.to(b.ownerId).emit('hit', { amount: Math.round(Math.min(b.damage, _pPrevHp)), x: p.x, y: p.y });
                            if (p.hp <= 0) eliminatePlayer(code, room, p, b.ownerId);
                            keep = false; break;
                        }
                    }
                }
                if (keep) room.bullets[_bKeep++] = b;
            }
            room.bullets.length = _bKeep;

            _tpsCount++;
            if (now - _tpsWindowStart >= 2000) {
                const tps = Math.round(_tpsCount * 1000 / (now - _tpsWindowStart));
                _tpsCount = 0; _tpsWindowStart = now;
                io.to(code).emit('srv-stats', { tps, ents: allPlayers.length + room.bullets.length });
            }

            // Health kits: pickup + expiry
            room.healthKits = room.healthKits.filter(kit => {
                if (now - kit.spawnTime > 30000) return false;
                for (const p of alivePlayers) {
                    if (p.hp < p.maxHp && Math.hypot(p.x - kit.x, p.y - kit.y) < PLAYER_R + 22) {
                        const actualHeal = Math.min(200, p.maxHp - p.hp);
                        p.hp += actualHeal;
                        io.to(p.id).emit('kit-pickup', { amount: actualHeal, x: kit.x, y: kit.y });
                        return false;
                    }
                }
                return true;
            });

            _pScratch.length = 0;
            for (const p of allPlayers) {
                _pScratch.push([p.id, Math.round(p.x), Math.round(p.y), +p.angle.toFixed(3), Math.round(p.hp), p.alive ? 1 : 0, p.kills]);
            }
            _bScratch.length = 0;
            for (const b of room.bullets) {
                _bScratch.push([b.id, Math.round(b.x), Math.round(b.y), +(b.dx / BULLET_SPEED).toFixed(3), +(b.dy / BULLET_SPEED).toFixed(3), b.ownerId]);
            }
            for (const b of _expiredBullets) {
                _bScratch.push([b.id, Math.round(b.x), Math.round(b.y), +(b.dx / BULLET_SPEED).toFixed(3), +(b.dy / BULLET_SPEED).toFixed(3), b.ownerId]);
            }

            const _zScratch = [];
            for (const z of room.zombies) {
                _zScratch.push(Math.round(z.x), Math.round(z.y), +z.angle.toFixed(2), z.alive ? Math.round(z.hp) : -1);
            }
            const _kScratch = [];
            for (const k of room.healthKits) {
                _kScratch.push(k.id, Math.round(k.x), Math.round(k.y), Math.round((30000 - (now - k.spawnTime)) / 1000));
            }

            allPlayers.forEach(recv => {
                const reloadProgress = recv.reloading ? Math.max(0, Math.min(1, 1 - recv.reloadTimer / AMMO_RELOAD_TIME)) : 1;
                const ammoArr = [recv.ammo, AMMO_MAX, recv.reloading ? 1 : 0, +reloadProgress.toFixed(3), recv.lastAckSeq];
                const zoneArr = [Math.round(zone.cx), Math.round(zone.cy), Math.round(zone.r), +zone.waitTimer.toFixed(1)];
                io.to(recv.id).emit('gs', [_pScratch, _bScratch, ammoArr, tickStart, zoneArr, _zScratch, _kScratch]);
            });

        } catch (err) {
            console.error(`[${code}] Game loop error:`, err.stack || err);
        } finally {
            if (room.gameStarted && rooms.has(code) && !room.gameEnded) {
                expected += INTERVAL_MS;
                const remaining = expected - Date.now();
                // Hybrid: sleep with setTimeout until ~4ms before target, then
                // spin with setImmediate for sub-ms precision. Eliminates the
                // ~15ms Windows timer quantisation that causes visible stutter.
                if (remaining > 4) {
                    room.gameLoop = setTimeout(tick, remaining - 4);
                } else {
                    room.gameLoop = setImmediate(tick);
                }
            }
        }
    }

    expected = Date.now() + INTERVAL_MS;
    room.gameLoop = setImmediate(tick);
}

function eliminatePlayer(code, room, player, killerId) {
    player.alive = false;
    player.hp    = 0;

    const killerPlayer = killerId ? room.players[killerId] : null;
    if (killerPlayer) killerPlayer.kills++;

    // Use _playerArr cache — avoids Object.values()+filter() allocations
    let _aliveN = 0;
    for (const p of room._playerArr) { if (p.alive) _aliveN++; }
    const totalPlayers = room._playerArr.length;
    const placement    = _aliveN + 1;

    io.to(player.id).emit('eliminated', {
        placement, totalPlayers,
        killedBy: killerPlayer ? killerPlayer.name : null,
        kills:    player.kills
    });

    if (killerPlayer) {
        io.to(code).emit('kill-event', { killerName: killerPlayer.name, victimName: player.name, byZone: false, victimId: player.id });
    }

    console.log(`[${code}] ${player.name} eliminat de ${killerPlayer ? killerPlayer.name : '?'} (loc ${placement}/${totalPlayers})`);

    if (_aliveN === 1 && totalPlayers > 1) {
        let winner = null;
        for (const p of room._playerArr) { if (p.alive) { winner = p; break; } }
        io.to(winner.id).emit('winner', { kills: winner.kills });
        io.to(code).emit('game-ended', { winnerName: winner.name });
        room.gameEnded = true;
        if (room.gameLoop) { clearTimeout(room.gameLoop); clearImmediate(room.gameLoop); room.gameLoop = null; }

        updatePlayerRoundEnd(player.id, player.name, player.kills, false);
        updatePlayerRoundEnd(winner.id, winner.name, winner.kills, true);
    } else {
        updatePlayerRoundEnd(player.id, player.name, player.kills, false);
    }

    if (_aliveN === 0) {
        io.to(code).emit('game-ended', { winnerName: null });
        room.gameEnded = true;
        if (room.gameLoop) { clearTimeout(room.gameLoop); clearImmediate(room.gameLoop); room.gameLoop = null; }
        setTimeout(() => { if (rooms.has(code) && room.gameEnded) closeRoom(code, room); }, 60000);
    }
}

function triggerRematch(code, room) {
    if (room.gameLoop) { clearTimeout(room.gameLoop); clearImmediate(room.gameLoop); room.gameLoop = null; }
    room.gameStarted  = false;
    room.gameEnded    = false;
    room.rematchVotes.clear();
    room.bullets      = [];
    room.nextBulletId = 0;
    room.zone = { cx: ARENA_W / 2, cy: ARENA_H / 2, r: ZONE_INITIAL_R, waitTimer: ZONE_WAIT, startDelay: 4 };
    room.zombies = generateZombies(room.obstacles);
    room.healthKits = [];
    room.nextKitId  = 0;
    room.countdownActive = true;
    setTimeout(() => { if (rooms.has(code)) room.countdownActive = false; }, 3000);
    assignSpawnPositions(room._playerArr, room.obstacles);
    room._playerArr.forEach(p => {
        p.hp = p.maxHp; p.alive = true; p.angle = 0; p.kills = 0;
        p.moveDir = { x: 0, y: 0 }; p.shootDir = { x: 0, y: 0 };
        p.shooting = false; p.shootCooldown = 0; p.aimTimer = 0;
        p.ammo = AMMO_MAX; p.reloading = false; p.reloadTimer = 0;
        p.lastDamageTime = 0; p.lastAckSeq = 0; p.pendingAckSeq = 0;
    });
    const rematchMeta = {};
    room._playerArr.forEach(p => { rematchMeta[p.id] = { speed: p.speed, maxHp: p.maxHp, name: p.name }; });
    Object.keys(room.players).forEach(pid => {
        io.to(pid).emit('game-rematch', { isHost: room.hostId === pid, playersMeta: rematchMeta });
    });
    broadcastWaiting(code, room);
    console.log(`[${code}] Rematch pornit`);
}

function closeRoom(code, room) {
    if (room.gameLoop) { clearTimeout(room.gameLoop); clearImmediate(room.gameLoop); }
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

    socket.on('invite-friend', ({ targetNickname, roomCode } = {}) => {
        if (!socket._nickname || !targetNickname || !roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) { socket.emit('invite-result', { ok: false, msg: 'Camera nu mai exista.' }); return; }
        if (room.gameStarted) { socket.emit('invite-result', { ok: false, msg: 'Jocul a inceput deja.' }); return; }
        const targetSid = connectedAccounts.get(targetNickname);
        if (!targetSid) { socket.emit('invite-result', { ok: false, msg: `${targetNickname} nu este online.` }); return; }
        const targetSocket = io.sockets.sockets.get(targetSid);
        if (!targetSocket) { socket.emit('invite-result', { ok: false, msg: `${targetNickname} nu este disponibil.` }); return; }
        targetSocket.emit('room-invite', { from: socket._nickname, roomCode });
        socket.emit('invite-result', { ok: true, msg: `Invitatie trimisa lui ${targetNickname}!` });
    });

    socket.on('decline-invite', ({ from } = {}) => {
        if (!socket._nickname || !from) return;
        const fromSid = connectedAccounts.get(from);
        if (!fromSid) return;
        const fromSocket = io.sockets.sockets.get(fromSid);
        if (fromSocket) fromSocket.emit('invite-declined', { by: socket._nickname });
    });

    socket.on('create-room', (data) => {
        if (!socket._nickname) { socket.emit('room-error', 'Neautentificat.'); return; }
        data = { ...data, name: socket._nickname };
        const code = generateCode();
        const room = newRoom(socket.id);
        rooms.set(code, room);
        socket.join(code);
        socket._roomCode = code;
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
        socket._roomCode = code;
        addPlayer(code, room, socket, data);
        socket.emit('room-joined', { code, isHost: false });
        broadcastWaiting(code, room);
        console.log(`[${code}] ${socket._nickname} a intrat`);
    });

    socket.on('start-game', () => {
        const result = fastGetRoom(socket);
        if (!result) return;
        const { code, room } = result;
        if (room.hostId !== socket.id || room.gameStarted) return;

        room.gameStarted     = true;
        room.countdownActive = true;
        room.bullets         = [];
        room.nextBulletId    = 0;

        assignSpawnPositions(room._playerArr, room.obstacles);
        room._playerArr.forEach(p => {
            p.ammo = AMMO_MAX; p.reloading = false; p.reloadTimer = 0;
            p.shooting = false; p.shootCooldown = 0;
            p.lastAckSeq = 0; p.pendingAckSeq = 0;
        });

        const playersMeta = {};
        room._playerArr.forEach(p => { playersMeta[p.id] = { speed: p.speed, maxHp: p.maxHp, name: p.name }; });
        io.to(code).emit('game-start', { playersMeta, obstacles: room.obstacles });
        console.log(`[${code}] Joc pornit cu ${room._playerArr.length} jucatori`);

        setTimeout(() => {
            if (rooms.has(code)) room.countdownActive = false;
        }, 3000);

        startRoomLoop(code, room);
    });

    socket.on('input', (data) => {
        const r = fastGetRoom(socket);
        if (!r || !r.room.gameStarted || !r.room.players[socket.id]) return;
        const p = r.room.players[socket.id];
        if (!p.alive || r.room.gameEnded || r.room.countdownActive) return;
        if (data.dx !== undefined) {
            p.moveDir.x = Math.max(-1, Math.min(1, +data.dx || 0));
            p.moveDir.y = Math.max(-1, Math.min(1, +data.dy || 0));
        }
        if (data.angle !== undefined) p.angle = +data.angle || 0;
        if (data.shooting !== undefined) {
            const _wasShooting = p.shooting;
            p.shooting = !!data.shooting;
            if (p.shooting && !_wasShooting) p.aimTimer = AIM_DELAY;
            if (!p.shooting) p.aimTimer = 0;
            if (data.shooting && data.sdx !== undefined) {
                p.shootDir.x = +data.sdx || 0;
                p.shootDir.y = +data.sdy || 0;
            }
        }
        if (data.seq !== undefined) p.pendingAckSeq = +data.seq;
    });

    socket.on('rematch', () => {
        const result = fastGetRoom(socket);
        if (!result) return;
        const { code, room } = result;
        if (!room.gameEnded) return;
        room.rematchVotes.add(socket.id);
        const total = room._playerArr.length;
        const count = room.rematchVotes.size;
        io.to(code).emit('rematch-vote', { count, total });
        if (count >= total) triggerRematch(code, room);
    });

    socket.on('c-ping', (t) => socket.emit('c-pong', t));

    socket.on('disconnect', () => {
        if (socket._nickname && connectedAccounts.get(socket._nickname) === socket.id) {
            connectedAccounts.delete(socket._nickname);
            notifyFriendsPresence(socket._nickname, 'friend-offline');
        }

        const result = socket._roomCode
            ? fastGetRoom(socket)
            : getPlayerRoom(socket.id);
        socket._roomCode = null;
        if (!result) return;
        const { code, room } = result;
        room.rematchVotes.delete(socket.id);
        const _leavingP = room.players[socket.id];
        if (_leavingP) {
            const _pidx = room._playerArr.indexOf(_leavingP);
            if (_pidx !== -1) room._playerArr.splice(_pidx, 1);
        }
        delete room.players[socket.id];

        if (room._playerArr.length === 0) {
            closeRoom(code, room);
            return;
        }

        if (room.hostId === socket.id) {
            room.hostId = room._playerArr[0].id;
            io.to(room.hostId).emit('host-transferred');
        }

        if (!room.gameStarted) broadcastWaiting(code, room);

        if (room.gameEnded) {
            const remaining = room._playerArr.length;
            const votes     = room.rematchVotes.size;
            io.to(code).emit('rematch-vote', { count: votes, total: remaining });
            if (votes >= remaining && remaining > 0) triggerRematch(code, room);
        }
    });
});

// ---------- PORNIRE ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server pornit pe portul ${PORT}`));

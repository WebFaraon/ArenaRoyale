require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const msgpackParser = require('socket.io-msgpack-parser');
const path    = require('path');
const fs      = require('fs');
const Passwords = require('./auth-hash');            // bcrypt (native when it loads, else bcryptjs), cost 10
const crypto  = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { firstBulletHit } = require('./game-physics');
const Missions = require('./missions');
const ARShared = require('./public/combat-shared');
const ARNet = require('./public/netproto');           // the state packet, protocol 2 (shared with the client)
const { createGsWriter } = require('./server-gs');
const notepack = require('notepack.io');             // the encoder socket.io-msgpack-parser uses
const GS = createGsWriter(notepack, 7);               // 7 shared elements + the client's own row
// PERF=1: per-second game loop stats to perf.jsonl (tools/perf-probe.js); nothing runs without it
const PERF = process.env.PERF === '1' ? require('./tools/perf-probe') : null;

const app    = express();
const server = http.createServer(app);
// Game traffic: WebSocket only (no HTTP polling, no transport upgrade), no per-message compression (it
// costs CPU and latency for ~0.3-1 KB packets sent 59 times a second), Nagle off on every TCP socket
// (ws does it for WebSockets too) so small packets leave at once.
server.on('connection', s => s.setNoDelay(true));
const io     = new Server(server, {
    parser: msgpackParser,
    transports: ['websocket'],
    allowUpgrades: false,
    perMessageDeflate: false,
    httpCompression: false,
    pingInterval: 10000,   // ping la fiecare 10s (default 25s)
    pingTimeout:  60000,   // asteapta pong 60s (default 20s) — tolereaza iOS throttling
    connectTimeout: 45000,
});

// ---------- EVENT LOOP LAG LOG ----------
// Always on, almost free: a 25 ms timer (it measures how late it fires, so any block longer than LAG_LOG_MS shows) notices when the event loop was blocked (a GC pause, a slow handler, the
// host taking the CPU away) and writes one line to the log when it was blocked for more than LAG_LOG_MS (25).
// Rate limited: one line per LAG_LOG_EVERY_S (5) seconds, the stalls in between are counted in the next line.
// LAG_LOG=0 turns it off. The line says when it ended, how long it lasted, what the server was doing (rooms,
// players, zombies) and whether a GC pause overlapped it, which tells a GC from a stall of the machine.
{
    const LAG_MS = +process.env.LAG_LOG_MS || 25, EVERY_MS = (+process.env.LAG_LOG_EVERY_S || 5) * 1000, STEP = 25;
    if (process.env.LAG_LOG !== '0') {
        const gcs = [];   // [start, end] of recent GC pauses (performance.now clock)
        try {
            new PerformanceObserver(list => { for (const e of list.getEntries()) gcs.push([e.startTime, e.startTime + e.duration]); while (gcs.length > 40) gcs.shift(); }).observe({ entryTypes: ['gc'] });
        } catch (e) { /* no gc entries on this runtime */ }
        let last = performance.now(), lastLog = -Infinity, held = 0, heldWorst = 0;
        const report = (endedAt, lag, wallIso) => {
            let rooms = 0, players = 0, zombies = 0;
            for (const r of (globalThis.__arRooms ? globalThis.__arRooms.values() : [])) {
                if (!r.gameStarted || r.gameEnded) continue;
                rooms++; players += r._playerArr.length;
                for (const z of r.zombies) if (z.alive) zombies++;
            }
            const from = endedAt - lag - STEP;
            let gc = 0; for (const [a, b] of gcs) if (b >= from && a <= endedAt) gc += b - a;
            const near = [];
            for (const q of _recentReq) { if (q.e >= from - 5 && q.e <= endedAt + 150 && q.s <= endedAt && !near.includes(q.label)) near.push(q.label); }
            const more = held ? ' | +' + held + ' earlier stall' + (held > 1 ? 's' : '') + ' not logged (worst ' + heldWorst.toFixed(0) + ' ms)' : '';
            held = 0; heldWorst = 0;
            console.warn('[LAG] ' + wallIso + ' event loop blocked ' + lag.toFixed(0) + ' ms | rooms ' + rooms + ', players ' + players + ', zombies ' + zombies +
                ' | gc ' + (gc ? gc.toFixed(1) + ' ms' : 'none') + ' | rss ' + (process.memoryUsage.rss() / 1048576).toFixed(0) + ' MB' + (near.length ? ' | near: ' + near.slice(0, 3).join(', ') : '') + more);
        };
        const iv = setInterval(() => {
            const now = performance.now(), lag = now - last - STEP;
            last = now;
            if (lag < LAG_MS) return;
            if (now - lastLog < EVERY_MS) { held++; if (lag > heldWorst) heldWorst = lag; return; }
            lastLog = now;
            const iso = new Date().toISOString();
            setTimeout(() => report(now, lag, iso), 20);   // the GC entry of a pause reaches the observer a moment later
        }, STEP);
        if (iv.unref) iv.unref();
    }
}

// ---------- SLOW LOG ----------
// [SLOW] <route> <ms>: work that held the event loop (a socket handler, a bcryptjs hash) for more than SLOW_LOG_MS (25),
// or an /api request that took unusually long as a whole (SLOW_REQ_MS, 400; that includes waiting on Supabase).
// One line per label every SLOW_LOG_EVERY_S (5) seconds, the rest counted in the next line, like [LAG]. SLOW_LOG=0 turns it off.
// Only fixed labels are logged: the method and path (no query string), the socket event name. Never a body, a password or a token.
// The last requests are also kept in a small ring so a [LAG] line can name the ones around it.
const SLOW_MS = +process.env.SLOW_LOG_MS || 25, SLOW_REQ_MS = +process.env.SLOW_REQ_MS || 400, SLOW_EVERY_MS = (+process.env.SLOW_LOG_EVERY_S || 5) * 1000;
const _slowLast = new Map(), _slowHeld = new Map(), _recentReq = [];
function slowLog(label, ms, note) {
    if (process.env.SLOW_LOG === '0') return;
    const now = Date.now(), last = _slowLast.get(label) || 0;
    if (now - last < SLOW_EVERY_MS) { const h = _slowHeld.get(label) || { n: 0, worst: 0 }; h.n++; if (ms > h.worst) h.worst = ms; _slowHeld.set(label, h); return; }
    _slowLast.set(label, now);
    const h = _slowHeld.get(label); _slowHeld.delete(label);
    console.warn('[SLOW] ' + label + ' ' + Math.round(ms) + ' ms' + (note ? ' (' + note + ')' : '') + (h ? ' | +' + h.n + ' more (worst ' + Math.round(h.worst) + ' ms)' : ''));
}
// A password hash or check, timed. The JavaScript fallback holds the loop for its whole duration; the native one does not.
async function hashOp(route, op, ...args) {
    const t = performance.now();
    try { return await Passwords[op](...args); }
    finally {
        const ms = performance.now() - t;
        if (Passwords.native ? ms >= SLOW_REQ_MS : ms >= SLOW_MS) slowLog(route + ' bcrypt.' + op, ms, Passwords.native ? 'nativ, neobisnuit de lent' : 'bcryptjs: blocheaza bucla');
    }
}

app.use(express.json({ limit: '5mb' }));
app.use('/api', (req, res, next) => {
    const t = performance.now(), label = req.method + ' ' + req.originalUrl.split('?')[0];
    res.on('finish', () => {
        const e = performance.now();
        _recentReq.push({ label, s: t, e }); if (_recentReq.length > 64) _recentReq.shift();
        if (e - t >= SLOW_REQ_MS) slowLog(label, e - t, 'cerere lunga, include asteptari');
    });
    next();
});

// ---------- STATIC FILES + CACHE BUSTING ----------
// BUILD is a hash of everything in public/, taken at start: it changes exactly when a served file changes.
// The HTML pages carry it (<meta name="ar-build">, ?v=BUILD on their local scripts, styles and images) and
// are always revalidated; JS adds it to the URLs it builds (arAsset in ui-fx.js). A file asked for with
// the current ?v= is cached for a year; anything else is revalidated every time (ETag -> 304), so a
// browser never mixes old and new files after a deploy.
const PUBLIC_DIR = path.join(__dirname, 'public');
const BUILD = (() => {
    const h = crypto.createHash('sha1');
    (function walk(dir) {
        for (const name of fs.readdirSync(dir).sort()) {
            const p = path.join(dir, name);
            if (fs.statSync(p).isDirectory()) { walk(p); continue; }
            h.update(path.relative(PUBLIC_DIR, p).split(path.sep).join('/') + '\0');
            h.update(fs.readFileSync(p));
        }
    })(PUBLIC_DIR);
    return h.digest('hex').slice(0, 10);
})();
// src="..." / href="..." of a local file (not a page link, not socket.io's own script, not a template)
const ASSET_ATTR = /\b(src|href)="((?!https?:|\/\/|\/socket\.io\/)[^"?#$]+\.(?:js|css|json|png|svg|webp|jpe?g|mp3|ico))"/g;
const _stampedHtml = new Map();
function stampedHtml(file) {
    if (!_stampedHtml.has(file)) {
        const html = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8')
            .replace(/<head>/i, '<head>\n    <meta name="ar-build" content="' + BUILD + '">')
            .replace(ASSET_ATTR, (_m, attr, url) => attr + '="' + url + '?v=' + BUILD + '"');
        _stampedHtml.set(file, html);
    }
    return _stampedHtml.get(file);
}
const sendPage = file => (req, res) => { res.set('Cache-Control', 'no-cache'); res.type('html').send(stampedHtml(file)); };
app.get(['/', '/index.html'], sendPage('index.html'));
app.get(['/leaderboard', '/leaderboard.html'], sendPage('leaderboard.html'));
app.get('/admin.html', sendPage('admin.html'));
app.get('/api/build', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ build: BUILD }); });
app.use(express.static(PUBLIC_DIR, {
    index: false,
    setHeaders: res => res.setHeader('Cache-Control', res.req.query.v === BUILD ? 'public, max-age=31536000, immutable' : 'no-cache'),
}));

// ---------- SUPABASE ----------
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

// ---------- SESSION TOKENS ----------
// nickname → token  (in-memory; se goleste la restart server)
const sessionTokens = new Map();

// Who is asking: a logged-in client proves it with the session token issued at login/register (an in-memory check, no
// hashing). The password is still accepted, for pages loaded before this change (the build check reloads them on their
// next connect). Hashing is the expensive part: keep it off the routes a player hits on every match.
async function authenticated(route, nickname, token, password) {
    if (token) return typeof token === 'string' && sessionTokens.get(nickname) === token;
    if (!password || !supabase) return false;
    const { data } = await supabase.from('players').select('password_hash').eq('nickname', nickname).single();
    return !!data && await hashOp(route, 'compare', password, data.password_hash);
}

if (!supabase) console.warn('[Supabase] Nu e configurat — statisticile nu se salveaza.');

// ---------- SKINS ----------
// One list for client and server: public/data/skins.json (the client fetches the same file).
const SKIN_DATA    = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data', 'skins.json'), 'utf8'));
const SKINS        = new Map(SKIN_DATA.skins.map(s => [s.id, s]));
const DEFAULT_SKIN = SKIN_DATA.defaultSkin;
// Testing only: UNLOCK_ALL=1 in the environment (local .env) gives every skin to everyone. Off when unset.
const UNLOCK_ALL_FOR_TESTING = process.env.UNLOCK_ALL === '1';
if (UNLOCK_ALL_FOR_TESTING) console.warn('[Skins] UNLOCK_ALL=1: toate skinurile sunt deblocate pentru toti jucatorii (doar pentru teste).');
// Ids of the old set that also exist in the new one and carry over to whoever owned them. Ninja is
// left out on purpose: it was the old free default, so it does not carry over.
const LEGACY_CARRY = new Set(['robot', 'wizard', 'tiger', 'viking', 'samurai', 'pharaoh']);
// nickname → Set of owned skin ids; filled at login, updated on unlock (in-memory, like sessionTokens)
const ownedSkins = new Map();
// Without Supabase (local runs) the chosen skin lives here, so it survives a page refresh
const memAvatars = new Map();

function parseUnlocked(raw) {
    try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
// A stored unlocked_characters list predates the new set when it has no DEFAULT_SKIN in it. From such a
// list only LEGACY_CARRY ids count; its other old ids stay in the database for the refund script.
function isLegacyList(list) { return !list.includes(DEFAULT_SKIN); }
function ownedFromList(list) {
    const legacy = isLegacyList(list);
    const owned = new Set([DEFAULT_SKIN]);
    for (const id of list) if (SKINS.has(id) && (!legacy || LEGACY_CARRY.has(id))) owned.add(id);
    return owned;
}
function ownsSkin(nickname, id) {
    if (!SKINS.has(id)) return false;
    return UNLOCK_ALL_FOR_TESTING || id === DEFAULT_SKIN || !!ownedSkins.get(nickname)?.has(id);
}
function ownedSkinList(nickname) {
    return UNLOCK_ALL_FOR_TESTING ? [...SKINS.keys()] : [...(ownedSkins.get(nickname) || [DEFAULT_SKIN])];
}
// players.avatar holds a skin id; older rows hold the old image URL (/images/characters/<id>.png)
function skinFromAvatar(avatar, nickname) {
    const s = String(avatar || '');
    const m = s.match(/\/images\/characters\/([A-Za-z0-9_]+)\.png$/);
    const id = m ? m[1].toLowerCase() : s;
    return ownsSkin(nickname, id) ? id : DEFAULT_SKIN;
}

// ---------- DAILY MISSIONS (missions.js) ----------
// Stored as JSON in players.missions_state. Until that column exists (run
// supabase-migration-missions.sql once) or without Supabase, missions live in memory only.
const missionStore = new Map(); // nickname -> state
let missionsColumn = true;
function _missingColumn(error) { return error && /missions_state/.test(error.message || ''); }
function _noColumn() {
    if (!missionsColumn) return;
    missionsColumn = false;
    console.warn('[Missions] Coloana players.missions_state lipseste: misiunile se pastreaza doar in memorie. Ruleaza supabase-migration-missions.sql in Supabase.');
}
async function loadMissions(nickname) {
    if (supabase && missionsColumn) {
        const { data, error } = await supabase.from('players').select('missions_state').eq('nickname', nickname).maybeSingle();
        if (error) { if (_missingColumn(error)) _noColumn(); else throw error; }
        else {
            const s = Missions.normalize(data && data.missions_state, nickname);
            missionStore.set(nickname, s);
            return s;
        }
    }
    const s = Missions.normalize(missionStore.get(nickname), nickname);
    missionStore.set(nickname, s);
    return s;
}
async function saveMissions(nickname, state) {
    missionStore.set(nickname, state);
    if (supabase && missionsColumn) {
        const { error } = await supabase.from('players').update({ missions_state: JSON.stringify(state) }).eq('nickname', nickname);
        if (_missingColumn(error)) _noColumn();
    }
}
async function missionsForLogin(nickname) {
    try {
        const s = await loadMissions(nickname);
        await saveMissions(nickname, s);
        return Missions.toClient(s);
    } catch (err) {
        console.error('[Missions] load error:', err);
        return Missions.toClient(Missions.freshState(nickname));
    }
}

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
        if (!ownedSkins.has(nickname)) ownedSkins.set(nickname, new Set([DEFAULT_SKIN]));
        const skin = skinFromAvatar(memAvatars.get(nickname), nickname);
        return res.json({ ok: true, token, player: { nickname, avatar: skin, skin, unlocked_characters: ownedSkinList(nickname), kills_total: 0, wins_total: 0, games_played: 0, stat_hp: 0, stat_dmg: 0, stat_spd: 0, missions: await missionsForLogin(nickname), weapon_stats: sanitizeWeaponStats(weaponStatsMem.get(nickname)),
            owned_weapon_skins: ownedWeaponSkinList(nickname), equipped_weapon_skins: equippedWeaponSkinMap(nickname) } });
    }

    try {
        const { data: existing } = await supabase
            .from('players').select('*').eq('nickname', nickname).maybeSingle();

        if (!existing)
            return res.json({ ok: false, error: 'Nickname inexistent. Creeaza un cont mai intai.' });

        const valid = await hashOp('POST /api/auth/login', 'compare', password, existing.password_hash);
        if (!valid) return res.json({ ok: false, error: 'Parola incorecta' });

        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens.set(existing.nickname, token);

        // Misiuni zilnice: sase din pool, alese pe zi (missions.js)
        const missions = await missionsForLogin(existing.nickname);

        // Skins: what the stored list grants in the new set, and the chosen skin as an id. An old image
        // URL in players.avatar is turned into its id (or the default) and written back once.
        ownedSkins.set(existing.nickname, ownedFromList(parseUnlocked(existing.unlocked_characters)));
        const skin = skinFromAvatar(existing.avatar, existing.nickname);
        loadWeaponSkinsFromRow(existing.nickname, existing);
        if (skin !== existing.avatar) {
            supabase.from('players').update({ avatar: skin }).eq('nickname', existing.nickname)
                .then(({ error }) => { if (error) console.error('[Auth/Login] avatar update:', error.message); });
        }

        return res.json({ ok: true, token, player: {
            nickname: existing.nickname,
            avatar:   skin,
            skin,
            unlocked_characters: ownedSkinList(existing.nickname),
            kills_total:  existing.kills_total  || 0,
            wins_total:   existing.wins_total   || 0,
            games_played: existing.games_played || 0,
            stat_hp:  existing.stat_hp  || 0,
            stat_dmg: existing.stat_dmg || 0,
            stat_spd: existing.stat_spd || 0,
            xp:       existing.xp       || 0,
            coins:    existing.coins    ?? 1000,
            diamonds: existing.diamonds || 0,
            missions,
            // totals per weapon ('weapon_stats' is not in the row until the migration ran)
            weapon_stats: sanitizeWeaponStats('weapon_stats' in existing ? existing.weapon_stats : weaponStatsMem.get(existing.nickname)),
            // weapon skins (WEAPON SKINS): ids owned, and the skin on each weapon that has one
            owned_weapon_skins:    ownedWeaponSkinList(existing.nickname),
            equipped_weapon_skins: equippedWeaponSkinMap(existing.nickname),
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

    if (!supabase) {
        ownedSkins.set(nickname, new Set([DEFAULT_SKIN]));
        weaponSkinMem.delete(nickname);
        return res.json({ ok: true, player: { nickname, avatar: DEFAULT_SKIN, skin: DEFAULT_SKIN, unlocked_characters: ownedSkinList(nickname), kills_total: 0, wins_total: 0, games_played: 0, missions: await missionsForLogin(nickname), owned_weapon_skins: ownedWeaponSkinList(nickname), equipped_weapon_skins: {} } });
    }

    try {
        const { data: existing } = await supabase
            .from('players').select('id').eq('nickname', nickname).maybeSingle();

        if (existing)
            return res.json({ ok: false, error: 'Nickname deja folosit. Alege altul sau logheaza-te.' });

        const hash = await hashOp('POST /api/auth/register', 'hash', password);
        const { error } = await supabase
            .from('players')
            .insert({ nickname, password_hash: hash, kills_total: 0, wins_total: 0, games_played: 0, xp: 0, coins: 1000, diamonds: 0, avatar: DEFAULT_SKIN, unlocked_characters: JSON.stringify([DEFAULT_SKIN]) });
        if (error) {
            console.error('[Auth/Register] Insert error:', error);
            return res.json({ ok: false, error: 'Eroare la creare cont. Incearca din nou.' });
        }
        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens.set(nickname, token);
        const missions = await missionsForLogin(nickname);
        ownedSkins.set(nickname, new Set([DEFAULT_SKIN]));
        weaponSkinMem.delete(nickname);
        return res.json({ ok: true, token, player: { nickname, avatar: DEFAULT_SKIN, skin: DEFAULT_SKIN, unlocked_characters: ownedSkinList(nickname), kills_total: 0, wins_total: 0, games_played: 0, xp: 0, coins: 1000, diamonds: 0, missions, owned_weapon_skins: ownedWeaponSkinList(nickname), equipped_weapon_skins: {} } });
    } catch (err) {
        console.error('[Auth/Register] Error:', err);
        return res.json({ ok: false, error: 'Eroare server. Incearca din nou.' });
    }
});

// ---------- SKIN UNLOCK ----------
// Prices and levels come from public/data/skins.json. Season skins are not sold in the shop.
// TODO: grant season skins (rarity "season", shop: false) through admin or code — there is no path for it yet.
app.post('/api/characters/unlock', async (req, res) => {
    const { nickname, token, characterId } = req.body || {};
    if (!nickname || !token || !characterId) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, error: 'Sesiune invalida' });
    const skin = SKINS.get(characterId);
    if (!skin) return res.json({ ok: false, error: 'Skin invalid' });
    if (!skin.shop) return res.json({ ok: false, error: 'Skinul nu se poate cumpara din magazin' });
    if (!supabase) return res.json({ ok: false, error: 'Cumpararea are nevoie de baza de date' });
    try {
        const { data } = await supabase.from('players')
            .select('xp, coins, diamonds, unlocked_characters')
            .eq('nickname', nickname).single();
        if (!data) return res.json({ ok: false });
        let list = parseUnlocked(data.unlocked_characters);
        if (ownedFromList(list).has(characterId)) return res.json({ ok: false, error: 'Deja deblocat' });
        const xp = data.xp || 0;
        let lvl = 1, inc = 100, thresh = 0;
        for (let n = 2; n <= 50; n++) { thresh += inc; if (xp >= thresh) lvl = n; else break; if (n >= 3) inc += 50; }
        if (lvl < skin.level) return res.json({ ok: false, error: `Nivel insuficient (necesar LV ${skin.level})` });
        const coins    = data.coins    ?? 1000;
        const diamonds = data.diamonds || 0;
        if (skin.coins    > 0 && coins    < skin.coins)    return res.json({ ok: false, error: 'Monede insuficiente' });
        if (skin.diamonds > 0 && diamonds < skin.diamonds) return res.json({ ok: false, error: 'Diamante insuficiente' });
        // A legacy list becomes a new-set list here (it gains DEFAULT_SKIN). Keep its old ids for the refund
        // script and the ids that carry over; drop new-set ids it never really owned (the old free ninja).
        if (isLegacyList(list)) list = [DEFAULT_SKIN, ...list.filter(id => !SKINS.has(id) || LEGACY_CARRY.has(id))];
        list.push(characterId);
        const newCoins    = coins    - skin.coins;
        const newDiamonds = diamonds - skin.diamonds;
        await supabase.from('players').update({
            coins: newCoins, diamonds: newDiamonds,
            unlocked_characters: JSON.stringify(list),
            updated_at: new Date().toISOString()
        }).eq('nickname', nickname);
        ownedSkins.set(nickname, ownedFromList(list));
        res.json({ ok: true, coins: newCoins, diamonds: newDiamonds, unlocked_characters: ownedSkinList(nickname) });
    } catch (err) {
        console.error('[Characters/Unlock]', err);
        res.json({ ok: false, error: 'Eroare server' });
    }
});

// The chosen skin, saved as its id. Only a skin the player owns is accepted.
app.post('/api/profile/avatar', async (req, res) => {
    const { nickname, token, password, avatar } = req.body || {};
    if (!nickname || !(token || password) || !avatar) return res.json({ ok: false });
    if (!ownsSkin(nickname, avatar)) return res.json({ ok: false, error: 'Skin indisponibil' });
    if (!supabase) { memAvatars.set(nickname, avatar); return res.json({ ok: true }); }
    try {
        if (!(await authenticated('POST /api/profile/avatar', nickname, token, password))) return res.json({ ok: false });
        await supabase.from('players').update({ avatar, updated_at: new Date().toISOString() }).eq('nickname', nickname);
        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: false });
    }
});

// Totals per weapon for one account (public, like the leaderboard)
app.get('/api/weapon-stats', async (req, res) => {
    const nickname = String(req.query.nickname || '');
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(nickname)) return res.json({ ok: false, error: 'nickname' });
    try { res.json({ ok: true, nickname, weaponStats: await loadWeaponStats(nickname) }); }
    catch (err) { console.error('[WeaponStats] read error:', err.message || err); res.json({ ok: false }); }
});

// The HP / DMG / SPD points of the lobby build (0-10 each, 10 in total), saved on the account so the build follows it
// to another device. Needs players.stat_hp / stat_dmg / stat_spd (supabase-migration-stat-points.sql).
let _statPointsMissingLogged = false;
app.post('/api/profile/stats', async (req, res) => {
    const { nickname, token, password, stat_hp, stat_dmg, stat_spd } = req.body || {};
    if (!nickname || !(token || password) || !supabase) return res.json({ ok: false });
    const hp  = Math.max(0, Math.min(10, Math.floor(+stat_hp  || 0)));
    const dmg = Math.max(0, Math.min(10, Math.floor(+stat_dmg || 0)));
    const spd = Math.max(0, Math.min(10, Math.floor(+stat_spd || 0)));
    if (hp + dmg + spd > 10) return res.json({ ok: false, error: 'Total depasit' });
    try {
        if (!(await authenticated('POST /api/profile/stats', nickname, token, password))) return res.json({ ok: false });
        const { error } = await supabase.from('players').update({ stat_hp: hp, stat_dmg: dmg, stat_spd: spd, updated_at: new Date().toISOString() }).eq('nickname', nickname);
        if (error) {
            // Not saved: say so. Until the migration has run the columns do not exist: that one is logged once, anything else every time.
            if (/stat_(hp|dmg|spd)/.test(error.message || '')) {
                if (!_statPointsMissingLogged) { _statPointsMissingLogged = true; console.error('[Stats] Coloanele players.stat_hp/stat_dmg/stat_spd lipsesc: punctele HP/DMG/SPD nu se salveaza pe cont (raman in browser). Ruleaza supabase-migration-stat-points.sql in Supabase. (' + error.message + ')'); }
            } else console.error('[Profile/Stats] update esuat pentru ' + nickname + ':', error.message);
            return res.json({ ok: false });
        }
        res.json({ ok: true });
    } catch (err) { console.error('[Profile/Stats] Error:', err); res.json({ ok: false }); }
});

app.post('/api/missions/claim', async (req, res) => {
    const { nickname, token, missionId } = req.body || {};
    if (!nickname || !token || !missionId) return res.json({ ok: false, error: 'Date invalide' });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, error: 'Sesiune invalida' });
    try {
        const state = await loadMissions(nickname);
        const r = Missions.claim(state, missionId);
        if (!r.ok) return res.json(r);
        if (!supabase) {
            await saveMissions(nickname, state);
            return res.json({ ok: true, coins: null, diamonds: null, rewardCoins: r.coins, rewardDiamonds: r.diamonds, missions: Missions.toClient(state) });
        }
        const { data } = await supabase.from('players').select('coins, diamonds').eq('nickname', nickname).single();
        if (!data) return res.json({ ok: false, error: 'Cont negasit' });
        const newCoins    = (data.coins    ?? 1000) + r.coins;
        const newDiamonds = (data.diamonds || 0)    + r.diamonds;
        await supabase.from('players').update({ coins: newCoins, diamonds: newDiamonds }).eq('nickname', nickname);
        await saveMissions(nickname, state);
        res.json({ ok: true, coins: newCoins, diamonds: newDiamonds, rewardCoins: r.coins, rewardDiamonds: r.diamonds, missions: Missions.toClient(state) });
    } catch (err) {
        console.error('[Missions/Claim] Error:', err);
        res.json({ ok: false, error: 'Eroare server' });
    }
});

// Test accounts (the live checks after a deploy) never show on the leaderboard. TEST_ACCOUNTS in .env
// overrides the list (comma separated).
const HIDDEN_FROM_LEADERBOARD = (process.env.TEST_ACCOUNTS || 'qa_live_test').split(',').map(s => s.trim()).filter(s => /^[a-zA-Z0-9_]{3,15}$/.test(s));
function leaderboardQuery() {
    let q = supabase.from('players').select('nickname, kills_total, wins_total, games_played, xp');
    if (HIDDEN_FROM_LEADERBOARD.length) q = q.not('nickname', 'in', '(' + HIDDEN_FROM_LEADERBOARD.join(',') + ')');
    return q.order('wins_total', { ascending: false }).order('kills_total', { ascending: false }).limit(50);
}

app.get('/api/leaderboard', async (req, res) => {
    if (!supabase) return res.json([]);
    try {
        const { data } = await leaderboardQuery();
        res.json(data || []);
    } catch { res.json([]); }
});

// ---------- WEAPON STATS ----------
// Per player and weapon: kills (players), zombieKills, damage (dealt, to players and zombies), shots (bullets
// fired: a shotgun blast is 5) and hits (bullets that hit a player or a zombie). A bullet carries the id of
// the weapon that fired it and that weapon gets the credit, whatever the shooter holds when it lands.
// Counted in memory during a match (player.ws); never written per event. When the player's match ends
// (BR: eliminated or winner, PvE: end of the game) the counts are added to the account's totals in the same
// write as the other round stats; what comes in after that (a bullet still in the air) or from a player
// who leaves early is added on its own at the next flush point (game end, disconnect, rematch).
// Totals: players.weapon_stats (jsonb, supabase-migration-weapon-stats.sql). Without that column, or
// without Supabase, they are kept in memory (lost on restart) and the server says so once.
const MELEE_WEAPON    = 'fists';  // the fist hit to come: counted like a gun when it exists
const WS_FIELDS       = ['kills', 'zombieKills', 'damage', 'shots', 'hits'];
const WS_MAX          = 2e9;     // keeps every value an exact integer
const weaponStatsMem  = new Map(); // nickname -> totals, while the column / Supabase is missing
let weaponStatsColumn = true;
// Only known weapon ids, only whole non-negative numbers; anything else is dropped
function sanitizeWeaponStats(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const id of Object.keys(raw)) {
        if (!STAT_WEAPON_IDS.has(id)) continue;
        const r = raw[id];
        if (!r || typeof r !== 'object') continue;
        const e = {}; let any = false;
        for (const f of WS_FIELDS) { const v = Math.round(Number(r[f])); e[f] = Number.isFinite(v) && v > 0 ? Math.min(v, WS_MAX) : 0; if (e[f]) any = true; }
        if (any) out[id] = e;
    }
    return out;
}
function addWeaponStats(total, round) {
    const out = sanitizeWeaponStats(total);
    for (const [id, r] of Object.entries(sanitizeWeaponStats(round))) {
        const e = out[id] || (out[id] = { kills: 0, zombieKills: 0, damage: 0, shots: 0, hits: 0 });
        for (const f of WS_FIELDS) e[f] = Math.min(WS_MAX, e[f] + r[f]);
    }
    return out;
}
const hasWeaponStats = ws => Object.keys(sanitizeWeaponStats(ws)).length > 0;
// The counters of one weapon for a player in the current match
function wsFor(p, weaponId) {
    const id = STAT_WEAPON_IDS.has(weaponId) ? weaponId : DEFAULT_WEAPON;
    return p.ws[id] || (p.ws[id] = { kills: 0, zombieKills: 0, damage: 0, shots: 0, hits: 0 });
}
// Hands over what the player counted so far and starts again from zero (no count is ever written twice)
function takeWeaponStats(p) { const ws = p.ws; p.ws = {}; return ws; }
function _weaponStatsMissing(error) { return !!error && /weapon_stats/.test(error.message || ''); }
function _noWeaponStatsColumn() {
    if (!weaponStatsColumn) return;
    weaponStatsColumn = false;
    console.warn('[WeaponStats] Coloana players.weapon_stats lipseste: statisticile pe arme se pastreaza doar in memorie. Ruleaza supabase-migration-weapon-stats.sql in Supabase.');
}
async function loadWeaponStats(nickname) {
    if (supabase && weaponStatsColumn) {
        const { data, error } = await supabase.from('players').select('weapon_stats').eq('nickname', nickname).maybeSingle();
        if (!error) return sanitizeWeaponStats(data && data.weapon_stats);
        if (_weaponStatsMissing(error)) _noWeaponStatsColumn(); else throw error;
    }
    return sanitizeWeaponStats(weaponStatsMem.get(nickname));
}
// Writes for one account run one after the other, so two close together cannot overwrite each other
const _statWrites = new Map();
function serialStatWrite(nickname, fn) {
    const run = (_statWrites.get(nickname) || Promise.resolve()).then(fn, fn);
    const done = run.catch(() => {});
    _statWrites.set(nickname, done);
    done.then(() => { if (_statWrites.get(nickname) === done) _statWrites.delete(nickname); });
    return run;
}
// Weapon counts on their own (left early, a late bullet, a rematch): one read, one write
function addWeaponStatsOnly(nickname, roundWs) {
    if (!hasWeaponStats(roundWs)) return Promise.resolve();
    return serialStatWrite(nickname, async () => {
        const total = addWeaponStats(await loadWeaponStats(nickname), roundWs);
        if (supabase && weaponStatsColumn) {
            const { error } = await supabase.from('players').update({ weapon_stats: total }).eq('nickname', nickname);
            if (!error) return total;
            if (_weaponStatsMissing(error)) _noWeaponStatsColumn(); else throw error;
        }
        weaponStatsMem.set(nickname, total);
        return total;
    }).catch(err => console.error('[WeaponStats] save error:', err.message || err));
}
// What a player still has counted goes to the totals (the DB work starts after the current tick)
function flushWeaponStats(p) {
    const ws = takeWeaponStats(p);
    if (hasWeaponStats(ws)) setImmediate(() => addWeaponStatsOnly(p.name, ws));
}
// The end of a player's match: round stats, missions and weapon totals, in one write (after the tick)
function endPlayerRound(p, isWinner, info) {
    const ws = takeWeaponStats(p), id = p.id, name = p.name, kills = p.kills;
    setImmediate(() => updatePlayerRoundEnd(id, name, kills, isWinner, { ...info, ws }));
}
// Weapon missions read the same counts: BR player kills and PvE zombie kills per weapon
function missionWeaponKills(rs, ws, mode) {
    rs.wk = {}; rs.bwk = {}; rs.pwk = {};
    for (const [w, e] of Object.entries(sanitizeWeaponStats(ws))) {
        if (mode === 'br' && e.kills) { rs.bwk[w] = e.kills; rs.wk[w] = e.kills; }
        if (mode === 'pve' && e.zombieKills) { rs.pwk[w] = e.zombieKills; rs.wk[w] = (rs.wk[w] || 0) + e.zombieKills; }
    }
}

// ---------- STAT HELPERS ----------
// info: { mode: 'br' | 'pve', rs: per-round stats (missions.newRoundStats), wave: PvE wave reached,
//         ws: the player's weapon counts for this match (see WEAPON STATS) }
function updatePlayerRoundEnd(socketId, nickname, killsThisRound, isWinner, info = {}) {
    return serialStatWrite(nickname, () => _updatePlayerRoundEnd(socketId, nickname, killsThisRound, isWinner, info));
}
async function _updatePlayerRoundEnd(socketId, nickname, killsThisRound, isWinner, info = {}) {
    const k = killsThisRound || 0;
    if (info.rs) missionWeaponKills(info.rs, info.ws, info.mode || 'br');
    let missions;
    try {
        const ms = Missions.applyRound(await loadMissions(nickname), { mode: info.mode || 'br', rs: info.rs, wave: info.wave, isWinner });
        await saveMissions(nickname, ms);
        missions = Missions.toClient(ms);
    } catch (err) { console.error('[Missions] round update error:', err); }
    const earnedXP       = k * 10 + (isWinner ? 50 : 0);
    const earnedCoins    = k * 10 + (isWinner ? 50 : 0);
    const earnedDiamonds = isWinner ? 1 : 0;

    const basic = {
        killsThisRound: k, killsTotal: k, winsTotal: isWinner ? 1 : 0,
        gamesPlayed: 1, killRate: k.toFixed(1), isWinner,
        earnedXP, earnedCoins, earnedDiamonds,
        xp: earnedXP, coins: 1000 + earnedCoins, diamonds: earnedDiamonds, missions
    };
    if (!supabase) {
        basic.weaponStats = addWeaponStats(weaponStatsMem.get(nickname), info.ws);
        weaponStatsMem.set(nickname, basic.weaponStats);
        const unlocked = weaponSkinsToUnlock(weaponSkinsOf(nickname).owned, basic.weaponStats);
        for (const id of unlocked) weaponSkinState(nickname).owned.add(id);
        io.to(socketId).emit('round-stats', basic);
        emitWeaponSkinsUnlocked(socketId, nickname, unlocked);
        return;
    }
    try {
        // the columns of migrations that have not run are left out (each is logged once)
        const STAT_COLS = 'kills_total, wins_total, games_played, xp, coins, diamonds';
        const statCols = () => STAT_COLS + (weaponStatsColumn ? ', weapon_stats' : '') + (weaponSkinsColumn ? ', owned_weapon_skins' : '');
        let { data, error } = await supabase.from('players').select(statCols()).eq('nickname', nickname).maybeSingle();
        for (let i = 0; i < 2 && error; i++) {
            if (_weaponStatsMissing(error)) _noWeaponStatsColumn();
            else if (_weaponSkinsMissing(error)) _noWeaponSkinsColumn();
            else break;
            ({ data, error } = await supabase.from('players').select(statCols()).eq('nickname', nickname).maybeSingle());
        }
        if (!data) {
            if (hasWeaponStats(info.ws)) addWeaponStatsOnly(nickname, info.ws);
            io.to(socketId).emit('round-stats', basic);
            return;
        }
        const weaponTotals = addWeaponStats(weaponStatsColumn ? data.weapon_stats : weaponStatsMem.get(nickname), info.ws);
        // unlock skins reached with these totals (also by a player who was past the threshold already)
        const ownedNow = weaponSkinsColumn && 'owned_weapon_skins' in data
            ? sanitizeOwnedWeaponSkins(data.owned_weapon_skins) : [...weaponSkinsOf(nickname).owned];
        const unlocked = weaponSkinsToUnlock(new Set(ownedNow), weaponTotals);

        const newKills    = (data.kills_total  || 0) + k;
        const newWins     = (data.wins_total   || 0) + (isWinner ? 1 : 0);
        const newGames    = (data.games_played || 0) + 1;
        const newXP       = (data.xp           || 0) + earnedXP;
        const newCoins    = (data.coins        ?? 1000) + earnedCoins;
        const newDiamonds = (data.diamonds     || 0) + earnedDiamonds;

        const row = {
            kills_total:  newKills, wins_total: newWins, games_played: newGames,
            xp: newXP, coins: newCoins, diamonds: newDiamonds,
            updated_at: new Date().toISOString()
        };
        if (weaponStatsColumn) row.weapon_stats = weaponTotals;
        if (weaponSkinsColumn && unlocked.length) row.owned_weapon_skins = ownedNow.concat(unlocked);
        let { error: upErr } = await supabase.from('players').update(row).eq('nickname', nickname);
        for (let i = 0; i < 2 && upErr; i++) {
            if (_weaponStatsMissing(upErr)) { _noWeaponStatsColumn(); delete row.weapon_stats; }
            else if (_weaponSkinsMissing(upErr)) { _noWeaponSkinsColumn(); delete row.owned_weapon_skins; }
            else break;
            ({ error: upErr } = await supabase.from('players').update(row).eq('nickname', nickname));
        }
        if (!weaponStatsColumn) weaponStatsMem.set(nickname, weaponTotals);
        // what the account owns now (without the columns: in memory only)
        const unlockedNow = upErr ? [] : unlocked;
        weaponSkinState(nickname).owned = new Set(ownedNow.concat(unlockedNow));

        io.to(socketId).emit('round-stats', {
            killsThisRound: k, killsTotal: newKills, winsTotal: newWins,
            gamesPlayed: newGames,
            killRate: newGames > 0 ? (newKills / newGames).toFixed(1) : '0.0',
            isWinner, earnedXP, earnedCoins, earnedDiamonds,
            xp: newXP, coins: newCoins, diamonds: newDiamonds, missions,
            weaponStats: weaponTotals
        });
        emitWeaponSkinsUnlocked(socketId, nickname, unlockedNow);
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
            const { data } = await leaderboardQuery();
            io.emit('leaderboard-update', data || []);
        } catch (err) {
            console.error('[Supabase] broadcastLeaderboard error:', err);
        }
    }, 10000);
}

// ---------- CONSTANTE ----------
const ARENA_W          = 2600;
const ARENA_H          = 2600;
const TICK_RATE        = ARShared.TICK_RATE; // exactly 60 ticks/s (startRoomLoop)

// ---------- WEAPONS ----------
// One source for every gun: public/data/weapons.json (stats, fire mode, loadout, art; the client loads
// the same file). The server refuses to start when the file has a problem (ARShared.checkWeapons).
const WEAPON_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data', 'weapons.json'), 'utf8'));
{
    const errs = ARShared.checkWeapons(WEAPON_DATA);
    if (errs.length) throw new Error('public/data/weapons.json: ' + errs.join('; '));
}
const WEAPON_RULES   = WEAPON_DATA.rules; // aimDelay, reloadDelay, bulletRadius: the same for every gun
const DEFAULT_WEAPON = WEAPON_DATA.defaultWeapon;
// id -> how the gun fires (fireMode, bulletSpeed, bulletLife, shootCd, ammoMax, reloadRate, pellets, spread, burstCount, burstDelay)
const WEAPON_STATS   = {};
// id -> loadout base values and growth per point (HP/DMG/SPD)
const WEAPON_LOADOUT = {};
for (const [id, w] of Object.entries(WEAPON_DATA.weapons)) {
    WEAPON_STATS[id]   = ARShared.weaponStats(w);
    WEAPON_LOADOUT[id] = w.loadout;
}
// Where each gun's bullets start and how long they live (weapons.json "muzzle", public/combat-shared.js):
// the same numbers the client predicts with. The range from the player centre stays what it was when
// bullets started 25 units out.
const SERVER_DT = 1 / TICK_RATE; // the dt of every tick (startRoomLoop), = ARShared.TICK_S
const GUN_FIRE = {};
for (const [id, ws] of Object.entries(WEAPON_STATS)) {
    const muzzle = ARShared.muzzleDistance(WEAPON_DATA.weapons[id]);
    GUN_FIRE[id] = { muzzle, life: ARShared.bulletLife(ws.bulletLife, ws.bulletSpeed, muzzle) };
}
// Weapon ids the weapon stats accept (WEAPON STATS): the guns in weapons.json and the fists
const STAT_WEAPON_IDS = new Set([...Object.keys(WEAPON_STATS), MELEE_WEAPON]);

// ---------- WEAPON SKINS ----------
// One list for client and server: public/data/weapon-skins.json (ARShared.weaponSkins works out the
// prices: a skin without its own price costs what its rarity costs). A skin only changes how a gun looks.
// Per account: players.owned_weapon_skins (ids, bought or unlocked) and players.equipped_weapon_skins
// ({ weaponId: skinId }; a weapon not in it has no skin, "default"), supabase-migration-weapon-skins.sql.
// Without those columns, or without Supabase, owned and equipped skins live in memory only and purchases
// are refused, so no money is ever taken for a skin a restart would lose; the server says so once.
// Unlock skins ("unlock": { kills }) are never sold: a round-end save adds them once the account's kills
// with that weapon (weapon_stats) reach the threshold. UNLOCK_ALL=1 gives every skin to everyone.
const WEAPON_SKIN_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data', 'weapon-skins.json'), 'utf8'));
{
    const errs = ARShared.checkWeaponSkins(WEAPON_SKIN_DATA, Object.keys(WEAPON_STATS));
    if (errs.length) throw new Error('public/data/weapon-skins.json: ' + errs.join('; '));
}
const WEAPON_SKINS   = new Map(ARShared.weaponSkins(WEAPON_SKIN_DATA).map(s => [s.id, s]));
const NO_WEAPON_SKIN = 'default';
const NO_SKIN_STATE  = Object.freeze({ owned: new Set(), equipped: Object.freeze({}) });
const weaponSkinMem  = new Map(); // nickname -> { owned: Set of ids, equipped: { weaponId: skinId } }, filled at login
let weaponSkinsColumn = true;
function _weaponSkinsMissing(error) { return !!error && /owned_weapon_skins|equipped_weapon_skins/.test(error.message || ''); }
function _noWeaponSkinsColumn() {
    if (!weaponSkinsColumn) return;
    weaponSkinsColumn = false;
    console.warn('[WeaponSkins] Coloanele players.owned_weapon_skins / equipped_weapon_skins lipsesc: skin-urile de arme se pastreaza doar in memorie si nu se pot cumpara. Ruleaza supabase-migration-weapon-skins.sql in Supabase.');
}
// Stored values: only known ids, each once; only a skin of that same weapon on a weapon
function sanitizeOwnedWeaponSkins(raw) {
    let a = raw;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
    return Array.isArray(a) ? [...new Set(a.filter(id => typeof id === 'string' && WEAPON_SKINS.has(id)))] : [];
}
function sanitizeEquippedWeaponSkins(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [w, id] of Object.entries(raw)) { const s = typeof id === 'string' && WEAPON_SKINS.get(id); if (s && s.weapon === w) out[w] = id; }
    return out;
}
const weaponSkinsOf = nickname => weaponSkinMem.get(nickname) || NO_SKIN_STATE;
function weaponSkinState(nickname) { // the entry to change
    let s = weaponSkinMem.get(nickname);
    if (!s) { s = { owned: new Set(), equipped: {} }; weaponSkinMem.set(nickname, s); }
    return s;
}
function ownsWeaponSkin(nickname, id) {
    return WEAPON_SKINS.has(id) && (UNLOCK_ALL_FOR_TESTING || weaponSkinsOf(nickname).owned.has(id));
}
function ownedWeaponSkinList(nickname) {
    return UNLOCK_ALL_FOR_TESTING ? [...WEAPON_SKINS.keys()] : [...weaponSkinsOf(nickname).owned];
}
// The skin a player's weapon shows: the equipped one while it is still theirs, otherwise none
function equippedWeaponSkin(nickname, weaponId) {
    const id = weaponSkinsOf(nickname).equipped[weaponId];
    return id && WEAPON_SKINS.get(id).weapon === weaponId && ownsWeaponSkin(nickname, id) ? id : NO_WEAPON_SKIN;
}
function equippedWeaponSkinMap(nickname) {
    const out = {};
    for (const w of Object.keys(WEAPON_STATS)) { const id = equippedWeaponSkin(nickname, w); if (id !== NO_WEAPON_SKIN) out[w] = id; }
    return out;
}
// At login, from the account's row ('owned_weapon_skins' is not in it until the migration ran)
function loadWeaponSkinsFromRow(nickname, row) {
    if (!weaponSkinsColumn) return;
    if (!('owned_weapon_skins' in row)) { _noWeaponSkinsColumn(); return; }
    weaponSkinMem.set(nickname, { owned: new Set(sanitizeOwnedWeaponSkins(row.owned_weapon_skins)), equipped: sanitizeEquippedWeaponSkins(row.equipped_weapon_skins) });
}
async function loadWeaponSkins(nickname) {
    if (supabase && weaponSkinsColumn) {
        const { data, error } = await supabase.from('players').select('owned_weapon_skins, equipped_weapon_skins').eq('nickname', nickname).maybeSingle();
        if (!error) return { owned: sanitizeOwnedWeaponSkins(data && data.owned_weapon_skins), equipped: sanitizeEquippedWeaponSkins(data && data.equipped_weapon_skins) };
        if (_weaponSkinsMissing(error)) _noWeaponSkinsColumn(); else throw error;
    }
    const s = weaponSkinsOf(nickname);
    return { owned: [...s.owned], equipped: { ...s.equipped } };
}
// Unlock skins an account has earned with these weapon totals and does not own yet
function weaponSkinsToUnlock(owned, weaponTotals) {
    if (UNLOCK_ALL_FOR_TESTING) return [];
    const out = [];
    for (const s of WEAPON_SKINS.values()) {
        if (s.unlock && !owned.has(s.id) && ((weaponTotals[s.weapon] && weaponTotals[s.weapon].kills) || 0) >= s.unlock.kills) out.push(s.id);
    }
    return out;
}
// The lobby's "skin deblocat" notice
function emitWeaponSkinsUnlocked(socketId, nickname, ids) {
    if (!ids.length) return;
    console.log(`[WeaponSkins] ${nickname} a deblocat ${ids.join(', ')}`);
    io.to(socketId).emit('weapon-skin-unlocked', {
        skins: ids.map(id => { const s = WEAPON_SKINS.get(id); return { id, weapon: s.weapon, name: s.name, rarity: s.rarity }; }),
        owned: ownedWeaponSkinList(nickname),
    });
}
// q filtered on col being v (null-safe: a column that was never set is NULL)
const whereSame = (q, col, v) => (v === null || v === undefined) ? q.is(col, null) : q.eq(col, v);
const WEAPON_SKIN_NEEDS_MIGRATION = 'Skin-urile de arme nu se pot cumpara inca (lipseste migrarea bazei de date)';
// One purchase, run in the account's write queue (serialStatWrite): a second click waits for the first and
// then finds the skin owned. The money and the skin go in one update, and only if the money is still what
// was read (a reward or another purchase in between makes it read again), so it is never spent twice.
async function _buyWeaponSkin(nickname, skin) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase.from('players')
            .select('coins, diamonds, owned_weapon_skins').eq('nickname', nickname).maybeSingle();
        if (error) {
            if (_weaponSkinsMissing(error)) { _noWeaponSkinsColumn(); return { ok: false, error: WEAPON_SKIN_NEEDS_MIGRATION }; }
            throw error;
        }
        if (!data) return { ok: false, error: 'Cont negasit' };
        const owned = sanitizeOwnedWeaponSkins(data.owned_weapon_skins);
        weaponSkinState(nickname).owned = new Set(owned);
        if (owned.includes(skin.id)) return { ok: false, error: 'Deja detinut', owned: ownedWeaponSkinList(nickname) };
        const coins    = data.coins    ?? 1000;
        const diamonds = data.diamonds || 0;
        const cCost = skin.price.coins || 0, dCost = skin.price.diamonds || 0;
        if (coins    < cCost) return { ok: false, error: 'Monede insuficiente' };
        if (diamonds < dCost) return { ok: false, error: 'Diamante insuficiente' };
        const list = owned.concat(skin.id);
        let q = supabase.from('players').update({
            coins: coins - cCost, diamonds: diamonds - dCost,
            owned_weapon_skins: list, updated_at: new Date().toISOString(),
        }).eq('nickname', nickname);
        q = whereSame(whereSame(q, 'coins', data.coins), 'diamonds', data.diamonds);
        const { data: changed, error: upErr } = await q.select('nickname');
        if (upErr) {
            if (_weaponSkinsMissing(upErr)) { _noWeaponSkinsColumn(); return { ok: false, error: WEAPON_SKIN_NEEDS_MIGRATION }; }
            throw upErr;
        }
        if (changed && changed.length) {
            weaponSkinState(nickname).owned = new Set(list);
            console.log(`[WeaponSkins] ${nickname} a cumparat ${skin.id} (${cCost ? cCost + ' monede' : dCost + ' diamante'})`);
            return { ok: true, skinId: skin.id, coins: coins - cCost, diamonds: diamonds - dCost, owned: ownedWeaponSkinList(nickname) };
        }
        // the money changed after it was read: read it again
    }
    return { ok: false, error: 'Incearca din nou' };
}

app.post('/api/weapon-skins/buy', async (req, res) => {
    const { nickname, token, skinId } = req.body || {};
    if (!nickname || !token || !skinId) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, error: 'Sesiune invalida' });
    const skin = typeof skinId === 'string' && WEAPON_SKINS.get(skinId);
    if (!skin) return res.json({ ok: false, error: 'Skin invalid' });
    if (skin.unlock) return res.json({ ok: false, error: `Skinul nu se cumpara: se deblocheaza la ${skin.unlock.kills} de killuri cu ${WEAPON_DATA.weapons[skin.weapon].name}` });
    if (ownsWeaponSkin(nickname, skin.id)) return res.json({ ok: false, error: 'Deja detinut', owned: ownedWeaponSkinList(nickname) });
    if (!supabase) return res.json({ ok: false, error: 'Cumpararea are nevoie de baza de date' });
    if (!weaponSkinsColumn) return res.json({ ok: false, error: WEAPON_SKIN_NEEDS_MIGRATION });
    try { res.json(await serialStatWrite(nickname, () => _buyWeaponSkin(nickname, skin))); }
    catch (err) {
        console.error('[WeaponSkins/Buy]', err.message || err);
        res.json({ ok: false, error: 'Eroare server' });
    }
});

// skinId "default" takes the skin off. Only a skin the account owns, only on its own weapon.
app.post('/api/weapon-skins/equip', async (req, res) => {
    const { nickname, token, weapon, skinId } = req.body || {};
    if (!nickname || !token || !weapon || !skinId) return res.json({ ok: false });
    if (sessionTokens.get(nickname) !== token) return res.json({ ok: false, error: 'Sesiune invalida' });
    if (typeof weapon !== 'string' || !Object.hasOwn(WEAPON_STATS, weapon)) return res.json({ ok: false, error: 'Arma invalida' });
    if (skinId !== NO_WEAPON_SKIN) {
        const skin = typeof skinId === 'string' && WEAPON_SKINS.get(skinId);
        if (!skin) return res.json({ ok: false, error: 'Skin invalid' });
        if (skin.weapon !== weapon) return res.json({ ok: false, error: 'Skinul nu e pentru arma asta' });
        if (!ownsWeaponSkin(nickname, skin.id)) return res.json({ ok: false, error: 'Nu detii skinul' });
    }
    try {
        const equipped = await serialStatWrite(nickname, async () => {
            const next = { ...weaponSkinsOf(nickname).equipped };
            if (skinId === NO_WEAPON_SKIN) delete next[weapon]; else next[weapon] = skinId;
            if (supabase && weaponSkinsColumn) {
                const { error } = await supabase.from('players').update({ equipped_weapon_skins: next }).eq('nickname', nickname);
                if (error) { if (_weaponSkinsMissing(error)) _noWeaponSkinsColumn(); else throw error; }
            }
            weaponSkinState(nickname).equipped = next;
            return equippedWeaponSkinMap(nickname);
        });
        res.json({ ok: true, equipped });
    } catch (err) {
        console.error('[WeaponSkins/Equip]', err.message || err);
        res.json({ ok: false, error: 'Eroare server' });
    }
});

// What an account owns and has on each weapon (?dev=weapons)
app.get('/api/weapon-skins', async (req, res) => {
    const nickname = String(req.query.nickname || '');
    if (!/^[a-zA-Z0-9_]{3,15}$/.test(nickname)) return res.json({ ok: false, error: 'nickname' });
    try {
        const s = await loadWeaponSkins(nickname);
        res.json({ ok: true, nickname, owned: UNLOCK_ALL_FOR_TESTING ? [...WEAPON_SKINS.keys()] : s.owned, equipped: s.equipped, unlockAll: UNLOCK_ALL_FOR_TESTING });
    } catch (err) { console.error('[WeaponSkins] read error:', err.message || err); res.json({ ok: false }); }
});
const PLAYER_SIZE      = 60;
const ZONE_INITIAL_R   = 1650;
const ZONE_WAIT        = 30;
const ZONE_SHRINK_RATE = 14;   // px/s → fully closed in ~125s
const ZONE_DMG         = 30;   // HP/s outside zone
const PLAYER_R         = PLAYER_SIZE / 2;
const HP_REGEN_RATE    = 8;
const HP_REGEN_DELAY   = 8000;
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

// ---------- PvE ----------
const PVE_BASE_X         = Math.round(ARENA_W / 2);
const PVE_BASE_Y         = Math.round(ARENA_H / 2);
const PVE_BASE_HP        = 1000;
const PVE_BASE_R         = 85;
const PVE_BASE_ATTACK_R  = 95;
const PVE_BREAK_DURATION = 15;
const PVE_TOTAL_WAVES    = 10;
// [normal, runner, tank] per wave
const PVE_WAVES = [
    [8,  0, 0],
    [10, 2, 0],
    [12, 4, 0],
    [10, 4, 2],
    [12, 6, 2],
    [14, 6, 3],
    [14, 8, 4],
    [16, 8, 5],
    [16,10, 5],
    [20,12, 6],
];
const PVE_ZOMBIE_DEFS = {
    normal: { hp: 100, chaseSpd: 62,  patrolSpd: 30, dmg: 20, attackR: 55, attackCd: 1.0, coinsMin: 1, coinsMax: 3, baseDmg: 15, r: 20 },
    runner: { hp: 50,  chaseSpd: 130, patrolSpd: 60, dmg: 10, attackR: 50, attackCd: 0.7, coinsMin: 2, coinsMax: 3, baseDmg: 8,  r: 16 },
    tank:   { hp: 400, chaseSpd: 35,  patrolSpd: 20, dmg: 40, attackR: 65, attackCd: 1.5, coinsMin: 5, coinsMax: 9, baseDmg: 35, r: 28 },
};
const PVE_TYPE_IDX = { normal: 0, runner: 1, tank: 2 };
// Fiecare upgrade: cost = baseCost + count * costInc, max = maxUses
const PVE_UPGRADE_DEFS = {
    dmg:  { baseCost: 6,  costInc: 4, maxUses: 5, apply: (p, n) => { p.damage  = Math.round(p.baseDamage  * (1 + n * 0.05)); } },
    spd:  { baseCost: 5,  costInc: 3, maxUses: 4, apply: (p, n) => { p.speed   = Math.round(p.baseSpeed   * (1 + n * 0.04)); } },
    hp:   { baseCost: 7,  costInc: 4, maxUses: 5, apply: (p, n) => { p.maxHp   = p.baseMaxHp + n * 15; p.hp = Math.min(p.hp + 15, p.maxHp); } },
    ammo: { baseCost: 4,  costInc: 2, maxUses: 4, apply: (p, n) => { p.ammoMax = Math.round(p.baseAmmoMax * (1 + n * 0.12)); } },
};
function pveUpgradeCost(type, count) {
    const d = PVE_UPGRADE_DEFS[type];
    return d ? d.baseCost + count * d.costInc : 999;
}

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
globalThis.__arRooms = rooms; // read by the event loop lag log
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

function generateObstacles(mode = 'br') {
    const obs = [];
    const MIN_GAP = 130;
    const PVE_CLEAR_R = 290; // raza libera in jurul bazei in PvE
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
            if (ok && mode === 'pve' && Math.hypot(x - PVE_BASE_X, y - PVE_BASE_Y) < PVE_CLEAR_R + r) ok = false;
            const rot = +(Math.random() * Math.PI * 2).toFixed(3);
            if (ok) { obs.push({ type, x, y, r, rot }); placed++; }
        }
    }
    place('tree', 26, 42, 62);
    place('rock', 16, 26, 42);
    return obs;
}

function generateZombies(obstacles, playerPositions = []) {
    const zombies = [];
    const margin = 200;
    const MIN_PLAYER_DIST = 350;
    let attempts = 0;
    while (zombies.length < ZOMBIE_COUNT && attempts < 800) {
        attempts++;
        const x = margin + Math.random() * (ARENA_W - margin * 2);
        const y = margin + Math.random() * (ARENA_H - margin * 2);
        const tooClose = obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.r + ZOMBIE_R + 40)
            || zombies.some(z => Math.hypot(x - z.x, y - z.y) < ZOMBIE_R * 4)
            || playerPositions.some(p => Math.hypot(x - p.x, y - p.y) < MIN_PLAYER_DIST);
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

// Creeaza un singur zombi la marginea mapei
function createPveZombie(type, id) {
    const def = PVE_ZOMBIE_DEFS[type];
    const angle    = Math.random() * Math.PI * 2;
    const spawnDist = 1050 + Math.random() * 150; // 1050-1200px de centru, langa margine
    const x = Math.max(def.r + 20, Math.min(ARENA_W - def.r - 20, PVE_BASE_X + Math.cos(angle) * spawnDist));
    const y = Math.max(def.r + 20, Math.min(ARENA_H - def.r - 20, PVE_BASE_Y + Math.sin(angle) * spawnDist));
    return {
        id, x, y,
        angle: Math.atan2(PVE_BASE_Y - y, PVE_BASE_X - x),
        hp: def.hp, maxHp: def.hp,
        alive: true, type,
        state: 'chase',
        patrolTargetX: PVE_BASE_X, patrolTargetY: PVE_BASE_Y,
        patrolTimer: 0, attackCooldown: Math.random() * 0.5,
    };
}

// Returneaza primul batch de zombi si populeaza room.pveSpawnQueue cu restul
const PVE_BATCH_SIZE   = 10; // zombi per mini-wave
const PVE_BATCH_DELAY  = 8;  // secunde intre mini-wave-uri

function prepareAndSpawnWave(room, waveIndex) {
    const wc = PVE_WAVES[waveIndex] || [8, 0, 0];
    const types = [
        ...Array(wc[0]).fill('normal'),
        ...Array(wc[1]).fill('runner'),
        ...Array(wc[2]).fill('tank'),
    ];
    // Shuffle
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
    }
    // Split in batch-uri de maxim PVE_BATCH_SIZE
    const batches = [];
    for (let i = 0; i < types.length; i += PVE_BATCH_SIZE) {
        batches.push(types.slice(i, i + PVE_BATCH_SIZE));
    }
    const firstBatch = batches[0] || [];
    room.pveSpawnQueue = batches.slice(1);
    room.pveSpawnTimer = PVE_BATCH_DELAY;
    return firstBatch.map((type, i) => createPveZombie(type, i));
}

function assignPveSpawnPositions(players) {
    players.forEach((p, i) => {
        const angle = (i / Math.max(players.length, 1)) * Math.PI * 2 + Math.PI / 4;
        p.x = Math.round(PVE_BASE_X + Math.cos(angle) * 240);
        p.y = Math.round(PVE_BASE_Y + Math.sin(angle) * 240);
    });
}

function startPveWave(code, room) {
    if (!rooms.has(code) || room.gameEnded || room.pveWaveActive) return;
    room.pveWave++;
    room.pveWaveActive = true;
    room.pveWaveBreak  = false;
    room.pveBreakTimer = 0;
    room.pveSkipVotes.clear();
    // Respawn jucatori langa baza cu ammo plin
    room._playerArr.forEach((p, i) => {
        const angle = (i / Math.max(room._playerArr.length, 1)) * Math.PI * 2 + Math.PI / 4;
        p.x = Math.round(PVE_BASE_X + Math.cos(angle) * 240);
        p.y = Math.round(PVE_BASE_Y + Math.sin(angle) * 240);
        p.ammo = p.ammoMax; p.reloading = false; p.reloadProgress = 0; p.lastShotTime = 0;
        p.hp = p.maxHp; p.alive = true;
        p.shooting = false; p.needsReleaseToShoot = false; p.hasReleasedSinceEmpty = true;
        p.shootCooldown = 0; p.aimTimer = 0; p.burstRemaining = 0; p.burstTimer = 0;
        p.moveDir.x = 0; p.moveDir.y = 0;
    });
    room.zombies = prepareAndSpawnWave(room, room.pveWave - 1);
    io.to(code).emit('pve-wave-start', { wave: room.pveWave, total: PVE_TOTAL_WAVES, batches: room.pveSpawnQueue.length + 1 });
}

function pveVictory(code, room) {
    if (room.gameEnded) return;
    room.gameEnded = true;
    if (room.gameLoop) { clearTimeout(room.gameLoop); clearImmediate(room.gameLoop); room.gameLoop = null; }
    io.to(code).emit('pve-end', { result: 'victory', wavesCleared: room.pveWave });
    room._playerArr.forEach(p => endPlayerRound(p, true, { mode: 'pve', rs: p.rs, wave: room.pveWave }));
    setTimeout(() => { if (rooms.has(code) && room.gameEnded) closeRoom(code, room); }, 60000);
    console.log(`[${code}] PvE Victorie!`);
}

function pveDefeat(code, room) {
    if (room.gameEnded) return;
    room.gameEnded = true;
    if (room.gameLoop) { clearTimeout(room.gameLoop); clearImmediate(room.gameLoop); room.gameLoop = null; }
    io.to(code).emit('pve-end', { result: 'defeat', wavesCleared: room.pveWave > 0 ? room.pveWave - 1 : 0 });
    room._playerArr.forEach(p => endPlayerRound(p, false, { mode: 'pve', rs: p.rs, wave: room.pveWave }));
    setTimeout(() => { if (rooms.has(code) && room.gameEnded) closeRoom(code, room); }, 60000);
    console.log(`[${code}] PvE Infrangere (baza distrusa la wave ${room.pveWave})`);
}

// ---------- MAP SEASON ----------
// The look of the trees and rocks (public/data/map-objects.json: seasons, sprites in public/images/map/<season>/).
// One setting for the whole server: MAP_SEASON in the environment (.env), default "vara". Sent to the client with
// game-start; it changes only the sprites, never the obstacles (positions, sizes, collisions).
const MAP_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data', 'map-objects.json'), 'utf8'));
{
    const errs = ARShared.checkMapObjects(MAP_DATA);
    if (errs.length) throw new Error('public/data/map-objects.json: ' + errs.join('; '));
}
const MAP_SEASONS = MAP_DATA.seasons;
const MAP_SEASON = (() => {
    const want = String(process.env.MAP_SEASON || MAP_SEASONS[0]).trim().toLowerCase();
    if (MAP_SEASONS.includes(want)) return want;
    console.warn('[Map] MAP_SEASON="' + want + '" nu exista (' + MAP_SEASONS.join(', ') + '): folosesc "' + MAP_SEASONS[0] + '".');
    return MAP_SEASONS[0];
})();
{
    // a missing sprite is not fatal (the client draws the old vector look for it), but it is worth knowing
    const missing = ARShared.MAP_OBJECT_IDS.filter(id => !fs.existsSync(path.join(__dirname, 'public', 'images', 'map', MAP_SEASON, id + '.png')));
    if (missing.length) console.warn('[Map] Lipsesc sprite-uri pentru sezonul "' + MAP_SEASON + '": ' + missing.join(', ') + ' (se deseneaza varianta veche)');
}

function newRoom(hostId, mode = 'br') {
    const _obs = generateObstacles(mode);
    return {
        hostId, mode, season: MAP_SEASON,
        players:     {},
        _playerArr:  [],
        bullets:     [],
        nextBulletId: 0,
        obstacles:   _obs,
        zombies:     mode === 'pve' ? [] : generateZombies(_obs),
        healthKits:  [],
        nextKitId:   0,
        zone: { cx: ARENA_W/2, cy: ARENA_H/2, r: ZONE_INITIAL_R, waitTimer: ZONE_WAIT, startDelay: 4 },
        base: mode === 'pve' ? { x: PVE_BASE_X, y: PVE_BASE_Y, hp: PVE_BASE_HP, maxHp: PVE_BASE_HP, r: PVE_BASE_R } : null,
        pveWave: 0, pveWaveActive: false, pveWaveBreak: false, pveBreakTimer: 0, pveSkipVotes: new Set(),
        pveSpawnQueue: [], pveSpawnTimer: 0,
        nextSlot: 0,   // players are named by a small number in the state packet (netproto.js)
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

    const weapon = typeof data.weapon === 'string' && Object.hasOwn(WEAPON_STATS, data.weapon) ? data.weapon : DEFAULT_WEAPON;
    const _wl = WEAPON_LOADOUT[weapon];
    const _ws = WEAPON_STATS[weapon];

    const maxHp  = _wl.baseHp  + Math.round(hp  * scale) * _wl.hpPer;
    const damage = _wl.baseDmg + Math.round(dmg * scale) * _wl.dmgPer;
    const speed  = (_wl.baseSpd + Math.round(spd * scale) * _wl.spdPer) * 60;

    // The skin is an id from public/data/skins.json; one the account does not own becomes the default.
    // data.name is the authenticated socket's nickname (set by create-room / join-room).
    const skin = ownsSkin(data.name, data.skin) ? data.skin : DEFAULT_SKIN;
    // The weapon skin is never taken from the client: the one the account has equipped on this weapon
    const weaponSkin = equippedWeaponSkin(data.name, weapon);

    room.players[socket.id] = {
        id: socket.id, slot: room.nextSlot++, name: data.name, skin, xp: data.xp || 0, weapon, weaponSkin,
        x: SPAWN_POINTS[room.spawnIndex % SPAWN_POINTS.length].x,
        y: SPAWN_POINTS[(room.spawnIndex++) % SPAWN_POINTS.length].y,
        angle: 0, size: PLAYER_SIZE,
        hp: maxHp, maxHp, damage, speed,
        moveDir:  { x: 0, y: 0 },
        shootDir: { x: 0, y: 0 },
        shooting: false, shootCooldown: 0, aimTimer: 0, needsReleaseToShoot: false, hasReleasedSinceEmpty: false,
        burstRemaining: 0, burstTimer: 0, burstDx: 0, burstDy: 0, burstWeapon: null, inputQ: [],
        ws: {}, // weapon stats of this match (WEAPON STATS)
        ammo: _ws.ammoMax, ammoMax: _ws.ammoMax,
        reloading: false, reloadProgress: 0, lastShotTime: 0,
        weaponReloadRate: _ws.reloadRate, bulletSpeed: _ws.bulletSpeed,
        alive: true, kills: 0, lastDamageTime: 0, rs: Missions.newRoundStats(),
        lastAckSeq: 0, pendingAckSeq: 0,
        coins: 0,
        lastInputAt: 0, stalled: false, backlogged: false, nextKeepAt: 0,   // slow client detection (STALL_MS)
        baseMaxHp: maxHp, baseDamage: damage, baseSpeed: speed, baseAmmoMax: _ws.ammoMax,
        pveUpgrades: { dmg: 0, spd: 0, hp: 0, ammo: 0 },
    };
    room._playerArr.push(room.players[socket.id]);

    io.to(code).emit('player-image', { id: socket.id, skin, weapon, weaponSkin });
    Object.values(room.players).forEach(p => {
        if (p.id !== socket.id) socket.emit('player-image', { id: p.id, skin: p.skin, weapon: p.weapon || DEFAULT_WEAPON, weaponSkin: p.weaponSkin });
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
        return { id: p.id, name: p.name, skin: p.skin, level: lvl };
    });
    Object.keys(room.players).forEach(pid => {
        io.to(pid).emit('waiting-room', { players, hostId: room.hostId });
    });
}

const _pveZombieRadius = (z) => (PVE_ZOMBIE_DEFS[z.type] || PVE_ZOMBIE_DEFS.normal).r;
const _brZombieRadius  = () => ZOMBIE_R;
const _r3 = (v) => Math.round(v * 1000) / 1000; // 3 decimals without toFixed string allocation
const _r1 = (v) => Math.round(v * 10) / 10;

// ---------- INPUTS ----------
// Clients send one input per server tick (game.js: one per state packet received). They are queued on
// arrival and applied by the game loop one per tick, in order, so each input moves the player exactly one
// tick, as the client's prediction replays it. After a tick at most one input is left waiting: the rest of
// a burst (a network pause) is applied in that same tick, so the delay never exceeds one tick and no
// queue can build up whatever the client's frame rate. Past INPUT_QUEUE_MAX the oldest is applied at once.
const INPUT_QUEUE_MAX = 6;
const STALL_MS = 500, KEEPALIVE_MS = 100, BACKLOG_BYTES = 65536;   // see the slow clients block in startRoomLoop
function applyInput(p, data) {
    if (data.dx !== undefined) {
        p.moveDir.x = Math.max(-1, Math.min(1, +data.dx || 0));
        p.moveDir.y = Math.max(-1, Math.min(1, +data.dy || 0));
    }
    if (data.angle !== undefined) p.angle = +data.angle || 0;
    if (data.shooting !== undefined) {
        const _wasShooting = p.shooting;
        if (!data.shooting) p.hasReleasedSinceEmpty = true;
        if (p.needsReleaseToShoot && p.hasReleasedSinceEmpty && !!data.shooting && p.ammo > 0) {
            p.needsReleaseToShoot = false;
            p.hasReleasedSinceEmpty = false;
        }
        p.shooting = p.needsReleaseToShoot ? false : !!data.shooting;
        if (p.shooting && !_wasShooting) p.aimTimer = WEAPON_RULES.aimDelay;
        if (!p.shooting) p.aimTimer = 0;
        if (data.shooting && data.sdx !== undefined) {
            p.shootDir.x = +data.sdx || 0;
            p.shootDir.y = +data.sdy || 0;
        }
    }
    if (data.seq !== undefined) p.pendingAckSeq = +data.seq;
}

function startRoomLoop(code, room) {
    // Ticks are due every 1000/60 ms on a monotonic clock; each one advances the world by exactly
    // SERVER_DT. A late tick runs as soon as possible and the ones after it catch up (one per event loop
    // turn, so inputs still get in between); more than MAX_CATCHUP behind, the backlog is dropped.
    const INTERVAL_MS = 1000 / TICK_RATE;
    const MAX_CATCHUP = 10;
    // Windows timers are ~15 ms coarse, so there the loop sleeps until 4 ms before the tick and spins for the rest.
    // Linux timers are 1 ms precise: a plain timer is enough, and the spin (LOOP_SPIN=1 forces it) cost ~20% of a CPU per room.
    const SPIN = process.env.LOOP_SPIN ? process.env.LOOP_SPIN === '1' : process.platform === 'win32';
    room.lastTick = Date.now();

    const _pScratch       = [];
    const _bScratch       = [];
    const _aliveScratch   = [];
    const _expiredBullets = [];
    const _zScratch       = [];
    const _kScratch       = [];
    // Reused per tick by the bullet sweep (no allocation per bullet)
    const _hitTargets = { obstacles: null, zombies: null, zombieRadius: null, players: null, playerRadius: PLAYER_R, ownerId: null, hitPlayers: true };
    const _hitOut     = { kind: 0, target: null, t: -1 };
    let _tpsCount = 0, _tpsWindowStart = Date.now();
    // Simulation clock: every tick advances the world by exactly INTERVAL_MS, whenever it actually runs.
    // Sent with each state packet so clients place snapshots on it (game.js interpolation).
    let tickNo = 0;
    let next = performance.now() + INTERVAL_MS; // when the next tick is due

    function tick(lateMs) {
        const tickStart = Date.now();
        if (PERF) PERF.tickStart(room, lateMs);
        try {
            if (!room.gameStarted || !rooms.has(code)) return;
            const now = tickStart;
            const dt  = SERVER_DT;
            room.lastTick = now;

            const allPlayers = room._playerArr;

            allPlayers.forEach(player => {
                if (!player.alive || room.gameEnded || room.countdownActive) { player.inputQ.length = 0; return; }
                if (room.pveWaveBreak) { player.moveDir.x = 0; player.moveDir.y = 0; player.shooting = false; player.inputQ.length = 0; return; }

                // inputs: one per tick in arrival order; any beyond one more waiting are applied now as
                // well, so an input never waits more than one tick (no queue can build up)
                let _applied = 0;
                while (player.inputQ.length && (_applied === 0 || player.inputQ.length > 1)) {
                    applyInput(player, player.inputQ.shift()); _applied++;
                }
                if (PERF) PERF.applied(room, player.id, _applied);

                player.x = Math.max(20, Math.min(ARENA_W - 20, player.x + player.moveDir.x * player.speed * dt));
                player.y = Math.max(20, Math.min(ARENA_H - 20, player.y + player.moveDir.y * player.speed * dt));
                const _obsList = room.obstacles;
                for (let oi = 0; oi < _obsList.length; oi++) {
                    const obs = _obsList[oi];
                    const _ox = player.x - obs.x, _oy = player.y - obs.y;
                    const _om = obs.r + PLAYER_R;
                    const _odSq = _ox * _ox + _oy * _oy;
                    if (_odSq >= _om * _om || _odSq === 0) continue; // cheap reject, no sqrt
                    const _od = Math.sqrt(_odSq);
                    player.x = obs.x + _ox / _od * _om;
                    player.y = obs.y + _oy / _od * _om;
                }
                if (room.base) {
                    const _bd = Math.hypot(player.x - room.base.x, player.y - room.base.y);
                    const _bm = room.base.r + PLAYER_R;
                    if (_bd < _bm && _bd > 0) {
                        player.x = room.base.x + (player.x - room.base.x) / _bd * _bm;
                        player.y = room.base.y + (player.y - room.base.y) / _bd * _bm;
                    }
                }

                if (player.hp < player.maxHp && (now - (player.lastDamageTime || 0)) > HP_REGEN_DELAY) {
                    player.hp = Math.min(player.maxHp, player.hp + HP_REGEN_RATE * dt);
                }

                if (player.shootCooldown > 0) player.shootCooldown -= dt;
                if (player.aimTimer > 0) player.aimTimer -= dt;

                // Reload progresiv per-weapon
                const _pAmmoMax = player.ammoMax;
                if (player.ammo < _pAmmoMax && (!player.shooting || player.ammo === 0)) {
                    const idleSec = (now - player.lastShotTime) / 1000;
                    if (idleSec >= WEAPON_RULES.reloadDelay) {
                        player.reloading = true;
                        player.reloadProgress += player.weaponReloadRate * dt;
                        while (player.reloadProgress >= 1.0 && player.ammo < _pAmmoMax) {
                            player.reloadProgress -= 1.0;
                            player.ammo++;
                        }
                        if (player.ammo >= _pAmmoMax) {
                            player.reloadProgress = 0; player.reloading = false;
                            player.needsReleaseToShoot = false; player.hasReleasedSinceEmpty = true;
                        }
                    }
                } else if (player.ammo >= _pAmmoMax) {
                    player.reloading = false; player.reloadProgress = 0;
                } else {
                    player.reloading = false; // trage activ — pauza reload, progresul se pastreaza
                }

                // Burst continuation — glonturile 2+3 dintr-o rafala
                if (player.burstRemaining > 0) {
                    player.burstTimer -= dt;
                    if (player.burstTimer <= 0) {
                        // the rest of a burst belongs to the weapon that started it
                        const _bw     = player.burstWeapon || player.weapon;
                        const _bwsCur = WEAPON_STATS[_bw] || WEAPON_STATS[DEFAULT_WEAPON];
                        const _bfire  = GUN_FIRE[_bw] || GUN_FIRE[DEFAULT_WEAPON];
                        wsFor(player, _bw).shots++;
                        // from the muzzle where the player is now; the hit test starts at the centre (sx, sy)
                        room.bullets.push({
                            id: room.nextBulletId++, ownerId: player.id, os: player.slot, weapon: _bw,
                            x: player.x + player.burstDx * _bfire.muzzle, y: player.y + player.burstDy * _bfire.muzzle,
                            sx: player.x, sy: player.y,
                            dx: player.burstDx * player.bulletSpeed,
                            dy: player.burstDy * player.bulletSpeed,
                            damage: player.damage, radius: WEAPON_RULES.bulletRadius,
                            lifetime: _bfire.life, speed: player.bulletSpeed
                        });
                        player.burstRemaining--;
                        if (player.burstRemaining > 0) {
                            player.burstTimer += _bwsCur.burstDelay; // keep the sub-tick remainder
                        } else {
                            player.burstRemaining = 0;
                            player.shootCooldown = _bwsCur.shootCd + Math.min(0, player.burstTimer);
                            player.lastShotTime  = now;
                            if (_bwsCur.fireMode === 'semi') { player.needsReleaseToShoot = true; player.hasReleasedSinceEmpty = false; }
                            if (player.ammo === 0) { player.shooting = false; player.needsReleaseToShoot = true; player.hasReleasedSinceEmpty = false; }
                        }
                    }
                }

                // Tragere — intrerupe reload-ul dar pastreaza progresul partial
                if (player.shooting && player.shootCooldown <= 0 && player.ammo > 0 && player.aimTimer <= 0 && player.burstRemaining === 0) {
                    const dl = Math.hypot(player.shootDir.x || 0, player.shootDir.y || 0);
                    if (dl >= 0.1) {
                        const dx = player.shootDir.x / dl, dy = player.shootDir.y / dl;
                        const _bspd = player.bulletSpeed;
                        const _wsCur = WEAPON_STATS[player.weapon] || WEAPON_STATS[DEFAULT_WEAPON];
                        const _fire  = GUN_FIRE[player.weapon] || GUN_FIRE[DEFAULT_WEAPON];
                        const _blife = _fire.life;
                        const _mx = player.x + dx * _fire.muzzle, _my = player.y + dy * _fire.muzzle;
                        const _pellets = _wsCur.pellets;
                        const _spread = _wsCur.spread;
                        for (let _pi = 0; _pi < _pellets; _pi++) {
                            const _ang = _pellets === 1 ? 0 : -_spread / 2 + _pi * _spread / (_pellets - 1);
                            const _cos = Math.cos(_ang), _sin = Math.sin(_ang);
                            const _pdx = dx * _cos - dy * _sin;
                            const _pdy = dx * _sin + dy * _cos;
                            room.bullets.push({
                                id: room.nextBulletId++, ownerId: player.id, os: player.slot, weapon: player.weapon,
                                x: _mx, y: _my, sx: player.x, sy: player.y,
                                dx: _pdx * _bspd, dy: _pdy * _bspd,
                                damage: player.damage, radius: WEAPON_RULES.bulletRadius, lifetime: _blife,
                                speed: _bspd
                            });
                        }
                        wsFor(player, player.weapon).shots += _pellets; // every pellet is a shot
                        player.ammo--;
                        player.reloading = false;
                        player.lastShotTime = now;
                        if (_wsCur.fireMode === 'burst') {
                            player.burstRemaining = _wsCur.burstCount - 1;
                            player.burstTimer     = _wsCur.burstDelay + Math.min(0, player.shootCooldown);
                            player.burstDx = dx; player.burstDy = dy; player.burstWeapon = player.weapon;
                        } else {
                            // += keeps the part of a tick the timer overshot (it is <= 0 here), so the
                            // average rate is exactly shootCd instead of being rounded up to whole
                            // ticks (SMG fired every 136 ms instead of 120 when ticks were 17 ms).
                            player.shootCooldown = Math.min(0, player.shootCooldown) + _wsCur.shootCd;
                            if (_wsCur.fireMode === 'semi') { player.needsReleaseToShoot = true; player.hasReleasedSinceEmpty = false; }
                            if (player.ammo === 0) { player.shooting = false; player.needsReleaseToShoot = true; player.hasReleasedSinceEmpty = false; }
                        }
                    }
                }

                if (player.pendingAckSeq > player.lastAckSeq) player.lastAckSeq = player.pendingAckSeq;
            });
            if (PERF) PERF.mark(room, 'players');

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

            if (PERF) PERF.mark(room, 'pvp');

            // Zona (BR only)
            const zone = room.zone;
            if (room.mode !== 'pve') {
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
            }

            if (PERF) PERF.mark(room, 'zone');

            // Zombi AI — BR
            if (room.mode !== 'pve') {
                for (const zombie of room.zombies) {
                    if (!zombie.alive || room.countdownActive) continue;
                    zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);

                    let nearestPlayer = null, nearestDist = Infinity;
                    for (const p of alivePlayers) {
                        const d = Math.hypot(p.x - zombie.x, p.y - zombie.y);
                        if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
                    }

                    if (nearestPlayer && nearestDist < ZOMBIE_DETECT_R) {
                        zombie.state = 'chase';
                    } else if (nearestDist > ZOMBIE_DETECT_R * 1.4) {
                        zombie.state = 'patrol';
                    }

                    let targetX, targetY;
                    const speed = zombie.state === 'chase' ? ZOMBIE_CHASE_SPD : ZOMBIE_PATROL_SPD;
                    if (zombie.state === 'chase' && nearestPlayer) {
                        targetX = nearestPlayer.x; targetY = nearestPlayer.y;
                    } else {
                        zombie.patrolTimer -= dt;
                        const distToTarget = Math.hypot(zombie.patrolTargetX - zombie.x, zombie.patrolTargetY - zombie.y);
                        if (zombie.patrolTimer <= 0 || distToTarget < 25) {
                            zombie.patrolTargetX = 200 + Math.random() * (ARENA_W - 400);
                            zombie.patrolTargetY = 200 + Math.random() * (ARENA_H - 400);
                            zombie.patrolTimer = ZOMBIE_PATROL_T + Math.random() * 2;
                        }
                        targetX = zombie.patrolTargetX; targetY = zombie.patrolTargetY;
                    }

                    let ddx = targetX - zombie.x, ddy = targetY - zombie.y;
                    const dLen = Math.hypot(ddx, ddy);
                    if (dLen > 0) { ddx /= dLen; ddy /= dLen; }

                    for (const obs of room.obstacles) {
                        const od = Math.hypot(zombie.x - obs.x, zombie.y - obs.y);
                        const influence = obs.r + ZOMBIE_R + 55;
                        if (od < influence && od > 0) {
                            const str = (influence - od) / influence;
                            ddx += (zombie.x - obs.x) / od * str * 2.8;
                            ddy += (zombie.y - obs.y) / od * str * 2.8;
                        }
                    }

                    const moveLen = Math.hypot(ddx, ddy);
                    if (moveLen > 0) {
                        zombie.x += (ddx / moveLen) * speed * dt;
                        zombie.y += (ddy / moveLen) * speed * dt;
                        zombie.angle = Math.atan2(ddy / moveLen, ddx / moveLen);
                    }

                    zombie.x = Math.max(ZOMBIE_R, Math.min(ARENA_W - ZOMBIE_R, zombie.x));
                    zombie.y = Math.max(ZOMBIE_R, Math.min(ARENA_H - ZOMBIE_R, zombie.y));

                    for (const obs of room.obstacles) {
                        const od = Math.hypot(zombie.x - obs.x, zombie.y - obs.y);
                        const minD = obs.r + ZOMBIE_R;
                        if (od < minD && od > 0) {
                            zombie.x += (zombie.x - obs.x) / od * (minD - od);
                            zombie.y += (zombie.y - obs.y) / od * (minD - od);
                        }
                    }

                    for (const p of alivePlayers) {
                        const pd = Math.hypot(zombie.x - p.x, zombie.y - p.y);
                        const minPD = ZOMBIE_R + PLAYER_R;
                        if (pd < minPD && pd > 0) {
                            zombie.x += (zombie.x - p.x) / pd * (minPD - pd);
                            zombie.y += (zombie.y - p.y) / pd * (minPD - pd);
                        }
                    }

                    // Separare zombi-zombi (BR)
                    for (const z2 of room.zombies) {
                        if (!z2.alive || z2 === zombie) continue;
                        const sd = Math.hypot(zombie.x - z2.x, zombie.y - z2.y);
                        const minSD = ZOMBIE_R * 1.6;
                        if (sd < minSD && sd > 0) {
                            const push = (minSD - sd) * 0.25;
                            zombie.x += (zombie.x - z2.x) / sd * push;
                            zombie.y += (zombie.y - z2.y) / sd * push;
                        }
                    }

                    if (zombie.attackCooldown <= 0) {
                        for (const p of alivePlayers) {
                            if (Math.hypot(p.x - zombie.x, p.y - zombie.y) < ZOMBIE_ATTACK_R) {
                                p.hp -= ZOMBIE_ATTACK_DMG;
                                p.lastDamageTime = now;
                                zombie.attackCooldown = ZOMBIE_ATTACK_CD;
                                if (p.hp <= 0) eliminatePlayer(code, room, p, 'zombie');
                                break;
                            }
                        }
                    }
                }
            }

            // Zombi AI — PvE
            if (room.mode === 'pve' && !room.countdownActive) {
                for (const zombie of room.zombies) {
                    if (!zombie.alive) continue;
                    zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);
                    const def = PVE_ZOMBIE_DEFS[zombie.type] || PVE_ZOMBIE_DEFS.normal;

                    let nearestPlayer = null, nearestDist = Infinity;
                    for (const p of alivePlayers) {
                        const d = Math.hypot(p.x - zombie.x, p.y - zombie.y);
                        if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
                    }

                    const chasingPlayer = nearestPlayer && nearestDist < ZOMBIE_DETECT_R;
                    zombie.targetingBase = !chasingPlayer;
                    const targetX = chasingPlayer ? nearestPlayer.x : PVE_BASE_X;
                    const targetY = chasingPlayer ? nearestPlayer.y : PVE_BASE_Y;
                    const speed   = def.chaseSpd;

                    let ddx = targetX - zombie.x, ddy = targetY - zombie.y;
                    const dLen = Math.hypot(ddx, ddy);
                    if (dLen > 0) { ddx /= dLen; ddy /= dLen; }

                    for (const obs of room.obstacles) {
                        const _ox = zombie.x - obs.x, _oy = zombie.y - obs.y;
                        const influence = obs.r + def.r + 55;
                        const _oSq = _ox*_ox + _oy*_oy;
                        if (_oSq >= influence*influence) continue;
                        const od = Math.sqrt(_oSq);
                        if (od > 0) {
                            const str = (influence - od) / influence;
                            ddx += _ox / od * str * 2.8;
                            ddy += _oy / od * str * 2.8;
                        }
                    }

                    const moveLen = Math.hypot(ddx, ddy);
                    if (moveLen > 0) {
                        zombie.x += (ddx / moveLen) * speed * dt;
                        zombie.y += (ddy / moveLen) * speed * dt;
                        zombie.angle = Math.atan2(ddy / moveLen, ddx / moveLen);
                    }

                    zombie.x = Math.max(def.r, Math.min(ARENA_W - def.r, zombie.x));
                    zombie.y = Math.max(def.r, Math.min(ARENA_H - def.r, zombie.y));

                    for (const obs of room.obstacles) {
                        const _ox2 = zombie.x - obs.x, _oy2 = zombie.y - obs.y;
                        const minD = obs.r + def.r;
                        const _oSq2 = _ox2*_ox2 + _oy2*_oy2;
                        if (_oSq2 >= minD*minD) continue;
                        const od2 = Math.sqrt(_oSq2);
                        if (od2 > 0) { zombie.x += _ox2 / od2 * (minD - od2); zombie.y += _oy2 / od2 * (minD - od2); }
                    }

                    for (const p of alivePlayers) {
                        const _px = zombie.x - p.x, _py = zombie.y - p.y;
                        const minPD = def.r + PLAYER_R;
                        const _pSq = _px*_px + _py*_py;
                        if (_pSq >= minPD*minPD) continue;
                        const pd = Math.sqrt(_pSq);
                        if (pd > 0) { zombie.x += _px / pd * (minPD - pd); zombie.y += _py / pd * (minPD - pd); }
                    }

                    // Coliziune rigida cu baza (PvE)
                    if (room.base) {
                        const _bbd = Math.hypot(zombie.x - room.base.x, zombie.y - room.base.y);
                        const _bbm = room.base.r + def.r;
                        if (_bbd < _bbm && _bbd > 0) {
                            zombie.x = room.base.x + (zombie.x - room.base.x) / _bbd * _bbm;
                            zombie.y = room.base.y + (zombie.y - room.base.y) / _bbd * _bbm;
                        }
                    }

                    // Separare zombi-zombi (PvE) — broad phase cu squared dist
                    for (const z2 of room.zombies) {
                        if (!z2.alive || z2 === zombie) continue;
                        const def2 = PVE_ZOMBIE_DEFS[z2.type] || PVE_ZOMBIE_DEFS.normal;
                        const _sdx = zombie.x - z2.x, _sdy = zombie.y - z2.y;
                        const minSD = (def.r + def2.r) * 0.9;
                        if (_sdx*_sdx + _sdy*_sdy >= minSD*minSD) continue;
                        const sd = Math.sqrt(_sdx*_sdx + _sdy*_sdy);
                        if (sd > 0) {
                            const push = (minSD - sd) * 0.25;
                            zombie.x += _sdx / sd * push;
                            zombie.y += _sdy / sd * push;
                        }
                    }

                    if (zombie.attackCooldown <= 0) {
                        let attacked = false;
                        for (const p of alivePlayers) {
                            if (Math.hypot(p.x - zombie.x, p.y - zombie.y) < def.attackR) {
                                p.hp -= def.dmg; p.lastDamageTime = now;
                                zombie.attackCooldown = def.attackCd;
                                if (p.hp <= 0) eliminatePlayer(code, room, p, 'zombie');
                                attacked = true; break;
                            }
                        }
                        if (!attacked && zombie.targetingBase && room.base && Math.hypot(zombie.x - room.base.x, zombie.y - room.base.y) < room.base.r + def.r + 8) {
                            room.base.hp = Math.max(0, room.base.hp - def.baseDmg);
                            zombie.attackCooldown = def.attackCd;
                            if (room.base.hp <= 0) { pveDefeat(code, room); return; }
                        }
                    }
                }

                // Wave break countdown
                if (room.pveWaveBreak) {
                    room.pveBreakTimer -= dt;
                    if (room.pveBreakTimer <= 0 && room.pveWave < PVE_TOTAL_WAVES) {
                        startPveWave(code, room);
                    }
                }

                // Sub-wave spawning (urmatoarele batch-uri)
                if (room.pveWaveActive && !room.pveWaveBreak && room.pveSpawnQueue.length > 0) {
                    room.pveSpawnTimer -= dt;
                    if (room.pveSpawnTimer <= 0) {
                        const nextBatch = room.pveSpawnQueue.shift();
                        const startId   = room.zombies.length;
                        nextBatch.forEach((type, i) => room.zombies.push(createPveZombie(type, startId + i)));
                        room.pveSpawnTimer = PVE_BATCH_DELAY;
                        io.to(code).emit('pve-subwave', { remaining: room.pveSpawnQueue.length });
                    }
                }

                // Wave completion check — toate batch-urile spawnate SI toti morti
                if (room.pveWaveActive && !room.pveWaveBreak && room.pveSpawnQueue.length === 0 && room.zombies.length > 0) {
                    let aliveZ = 0;
                    for (const z of room.zombies) if (z.alive) aliveZ++;
                    if (aliveZ === 0) {
                        room.pveWaveActive = false;
                        if (room.pveWave >= PVE_TOTAL_WAVES) {
                            pveVictory(code, room); return;
                        }
                        room.pveWaveBreak  = true;
                        room.pveBreakTimer = PVE_BREAK_DURATION;
                        room.pveSkipVotes.clear();
                        room._playerArr.forEach(p => { p.moveDir.x = 0; p.moveDir.y = 0; p.shooting = false; });
                        io.to(code).emit('pve-wave-break', { wave: room.pveWave, nextWave: room.pveWave + 1, timer: PVE_BREAK_DURATION });
                    }
                }
            }

            if (PERF) PERF.mark(room, 'zombies');

            // Gloante: miscare + coliziune continua (swept). Pe segmentul parcurs in acest tick
            // se cauta PRIMUL lucru atins (obstacol, zombi sau jucator); glontul se opreste acolo.
            // Asa un glont rapid nu mai poate sari peste un zombi mic sau trece printr-un obstacol,
            // iar un glont care a ucis pe cineva nu mai continua spre cel din spate.
            _expiredBullets.length = 0;
            _hitTargets.obstacles = room.obstacles;
            _hitTargets.zombies   = room.zombies;
            _hitTargets.zombieRadius = room.mode === 'pve' ? _pveZombieRadius : _brZombieRadius;
            _hitTargets.players   = alivePlayers;
            _hitTargets.hitPlayers = room.mode !== 'pve'; // no friendly fire in PvE
            let _bKeep = 0;
            for (let bi = 0; bi < room.bullets.length; bi++) {
                const b = room.bullets[bi];
                const _step = b.lifetime < dt ? Math.max(0, b.lifetime) : dt;
                const x1 = b.x + b.dx * _step, y1 = b.y + b.dy * _step;
                b.lifetime -= dt;
                _hitTargets.ownerId = b.ownerId;
                // first tick: from the shooter's centre, so a bullet cannot start past a wall or an enemy
                // pressed against the shooter (the muzzle is up to 107 units out)
                const hit = firstBulletHit(b.sx, b.sy, x1, y1, b.radius, _hitTargets, _hitOut);
                let keep = true;
                if (hit.kind === 1) {
                    keep = false;
                } else if (hit.kind === 2) {
                    const zombie = hit.target;
                    const _zPrevHp = zombie.hp;
                    zombie.hp -= b.damage;
                    const _zOwner = room.players[b.ownerId];
                    if (_zOwner && _zOwner.rs) _zOwner.rs.dmg += Math.min(b.damage, _zPrevHp);
                    const _zws = _zOwner ? wsFor(_zOwner, b.weapon) : null;
                    if (_zws) { _zws.hits++; _zws.damage += Math.min(b.damage, _zPrevHp); }
                    io.to(b.ownerId).emit('hit', { amount: Math.round(Math.min(b.damage, _zPrevHp)), x: zombie.x, y: zombie.y, bid: b.id });
                    if (zombie.hp <= 0) {
                        zombie.hp = 0; zombie.alive = false;
                        if (_zws) _zws.zombieKills++; // weapon missions read this (missionWeaponKills)
                        if (_zOwner && _zOwner.rs) {
                            _zOwner.rs.zKills++;
                            if (room.mode === 'pve') _zOwner.rs.pveKills++;
                        }
                        if (room.mode === 'pve') {
                            const def = PVE_ZOMBIE_DEFS[zombie.type] || PVE_ZOMBIE_DEFS.normal;
                            const killer = room.players[b.ownerId];
                            if (killer) {
                                const earned = def.coinsMin + Math.floor(Math.random() * (def.coinsMax - def.coinsMin + 1));
                                killer.coins += earned;
                                io.to(killer.id).emit('pve-coins', { coins: killer.coins, earned, x: zombie.x, y: zombie.y });
                            }
                        } else {
                            room.healthKits.push({ id: room.nextKitId++, x: zombie.x, y: zombie.y, spawnTime: now });
                        }
                    }
                    keep = false;
                } else if (hit.kind === 3) {
                    const p = hit.target;
                    const _pPrevHp = p.hp;
                    p.hp -= b.damage; p.lastDamageTime = now;
                    const _pOwner = room.players[b.ownerId];
                    if (_pOwner && _pOwner.rs) _pOwner.rs.dmg += Math.min(b.damage, _pPrevHp);
                    if (_pOwner) { const _pws = wsFor(_pOwner, b.weapon); _pws.hits++; _pws.damage += Math.min(b.damage, _pPrevHp); }
                    io.to(b.ownerId).emit('hit', { amount: Math.round(Math.min(b.damage, _pPrevHp)), x: p.x, y: p.y, bid: b.id });
                    if (p.hp <= 0) eliminatePlayer(code, room, p, b.ownerId, b.weapon);
                    keep = false;
                } else {
                    b.x = x1; b.y = y1;
                    b.sx = x1; b.sy = y1;
                    const inside = b.x >= 0 && b.x <= ARENA_W && b.y >= 0 && b.y <= ARENA_H;
                    if (b.lifetime <= 0 || !inside) {
                        if (b.lifetime <= 0 && inside) _expiredBullets.push(b);
                        keep = false;
                    }
                }
                if (keep) room.bullets[_bKeep++] = b;
            }
            room.bullets.length = _bKeep;
            if (PERF) PERF.mark(room, 'bullets');

            _tpsCount++;
            if (now - _tpsWindowStart >= 2000) {
                const tps = Math.round(_tpsCount * 1000 / (now - _tpsWindowStart));
                _tpsCount = 0; _tpsWindowStart = now;
                io.to(code).emit('srv-stats', { tps, ents: allPlayers.length + room.bullets.length });
            }

            // Health kits: pickup + expiry (in place, no new array per tick)
            {
                const kits = room.healthKits;
                const pickR = PLAYER_R + 22, pickRSq = pickR * pickR;
                let kKeep = 0;
                for (let ki = 0; ki < kits.length; ki++) {
                    const kit = kits[ki];
                    let gone = now - kit.spawnTime > 30000;
                    if (!gone) {
                        for (const p of alivePlayers) {
                            const kx = p.x - kit.x, ky = p.y - kit.y;
                            if (p.hp < p.maxHp && kx * kx + ky * ky < pickRSq) {
                                const actualHeal = Math.min(200, p.maxHp - p.hp);
                                p.hp += actualHeal;
                                if (p.rs) p.rs.kits++;
                                io.to(p.id).emit('kit-pickup', { amount: actualHeal, x: kit.x, y: kit.y });
                                gone = true;
                                break;
                            }
                        }
                    }
                    if (!gone) kits[kKeep++] = kit;
                }
                kits.length = kKeep;
            }
            if (PERF) PERF.mark(room, 'kits');

            // ── State packet (public/netproto.js, protocol 2) ──
            // What every client shares is packed and encoded ONCE per tick; each client then gets its own small row
            // appended (server-gs.js). Positions travel as quarter pixels, players are named by their slot number,
            // only live zombies are listed (one missing from the packet has died: game.js).
            ARNet.packPlayers(_pScratch, allPlayers);
            ARNet.packBullets(_bScratch, room.bullets, false);
            ARNet.packBullets(_bScratch, _expiredBullets, true);
            ARNet.packZombies(_zScratch, room.zombies, PVE_TYPE_IDX);
            ARNet.packKits(_kScratch, room.healthKits, now);
            if (PERF) PERF.mark(room, 'snapshot');
            tickNo++;
            const _shared = GS.begin([tickNo, _pScratch, _bScratch, _zScratch, _kScratch, ARNet.packZone(zone), ARNet.packPve(room)]);
            let _sentBytes = 0;
            // Slow clients: the newest state only, never a queue of old ones. A client is skipped this tick when
            //  - its connection has more than BACKLOG_BYTES waiting to be written (it is not reading fast enough), or
            //  - it stopped answering: every client sends one input per state packet it receives, so no input for
            //    STALL_MS means it is not receiving (a stalled phone or WiFi, a frozen tab). It then gets one packet
            //    every KEEPALIVE_MS, so the first thing it sees on coming back is the latest state.
            // (Dead players, the countdown and PvE breaks send no inputs: those are not counted as silence.)
            for (const p of allPlayers) {
                let silentSkip = false;
                if (!p.alive || room.countdownActive || room.pveWaveBreak || room.gameEnded || !p.lastInputAt) {
                    if (p.lastInputAt) p.lastInputAt = tickStart;
                    p.stalled = false;
                } else {
                    const silent = tickStart - p.lastInputAt;
                    if (silent > STALL_MS) {
                        if (!p.stalled) { p.stalled = true; p.nextKeepAt = tickStart + KEEPALIVE_MS; console.log('[' + code + '] ' + p.name + ': nu mai raspunde de ' + silent + ' ms, primeste doar ultima stare'); }
                        silentSkip = true;
                    } else if (p.stalled) { p.stalled = false; console.log('[' + code + '] ' + p.name + ': raspunde din nou'); }
                }
                const sock = io.sockets.sockets.get(p.id);
                if (!sock) continue;
                const ws = sock.conn && sock.conn.transport && sock.conn.transport.socket, raw = ws && ws._socket;
                if (raw && raw.writableLength > BACKLOG_BYTES) {
                    if (!p.backlogged) { p.backlogged = true; console.log('[' + code + '] ' + p.name + ': conexiune lenta (' + raw.writableLength + ' B in asteptare), primeste doar ultima stare'); }
                    continue;
                } else if (p.backlogged) { p.backlogged = false; console.log('[' + code + '] ' + p.name + ': conexiunea s-a eliberat'); }
                if (silentSkip) {
                    if (tickStart < p.nextKeepAt) continue;
                    p.nextKeepAt = tickStart + KEEPALIVE_MS;
                }
                const n = GS.send(sock, _shared, ARNet.packOwn(p));
                if (n) _sentBytes = n;
            }
            if (PERF) {
                PERF.mark(room, 'emit');
                PERF.tickEnd(room, code, _sentBytes, allPlayers.map(p => p.id), () => {
                    let zAlive = 0;
                    for (const z of room.zombies) if (z.alive) zAlive++;
                    return {
                        mode: room.mode,
                        zone: room.mode === 'pve' ? null : { startDelay: _r1(zone.startDelay), wait: _r1(zone.waitTimer), r: Math.round(zone.r), shrinking: zone.startDelay <= 0 && zone.waitTimer <= 0 && zone.r > 0 },
                        pve: room.mode === 'pve' ? { wave: room.pveWave, active: !!room.pveWaveActive, break: !!room.pveWaveBreak, queued: (room.pveSpawnQueue || []).length } : null,
                        n: { players: allPlayers.length, zAlive, zTotal: room.zombies.length, bullets: room.bullets.length, kits: room.healthKits.length },
                    };
                });
            }

        } catch (err) {
            console.error(`[${code}] Game loop error:`, err.stack || err);
        }
    }

    function loop() {
        if (!room.gameStarted || !rooms.has(code) || room.gameEnded) return;
        const now = performance.now();
        if (now - next > INTERVAL_MS * MAX_CATCHUP) next = now;   // far behind (a long stall): drop the backlog
        if (now >= next) { tick(now - next); next += INTERVAL_MS; }
        if (!room.gameStarted || !rooms.has(code) || room.gameEnded) return;
        const remaining = next - performance.now();
        if (SPIN) {
            // sleep with setTimeout until ~4 ms before the tick is due, then spin with setImmediate for sub-ms precision
            room.gameLoop = remaining > 4 ? setTimeout(loop, remaining - 4) : setImmediate(loop);
        } else {
            // never early (one wake-up per tick), at most ~1 ms late; the accumulator keeps the average exact
            room.gameLoop = setTimeout(loop, Math.max(1, Math.ceil(remaining)));
        }
    }

    next = performance.now() + INTERVAL_MS;
    room.gameLoop = setImmediate(loop);
}

// weaponId: the weapon of the bullet that made the kill (credited in the killer's weapon stats)
function eliminatePlayer(code, room, player, killerId, weaponId) {
    player.alive = false;
    player.hp    = 0;

    const isZombieKill  = killerId === 'zombie';
    const killerPlayer  = (killerId && !isZombieKill) ? room.players[killerId] : null;
    if (killerPlayer) {
        killerPlayer.kills++;
        wsFor(killerPlayer, weaponId || killerPlayer.weapon).kills++; // weapon missions read this too
        if (killerPlayer.rs && room.mode === 'br') killerPlayer.rs.brKills++;
    }

    // Use _playerArr cache — avoids Object.values()+filter() allocations
    let _aliveN = 0;
    for (const p of room._playerArr) { if (p.alive) _aliveN++; }
    const totalPlayers = room._playerArr.length;
    const placement    = _aliveN + 1;

    io.to(player.id).emit('eliminated', {
        placement, totalPlayers,
        killedBy: killerPlayer ? killerPlayer.name : (isZombieKill ? 'zombie' : null),
        kills:    player.kills
    });

    if (killerPlayer) {
        io.to(code).emit('kill-event', { killerName: killerPlayer.name, victimName: player.name, byZone: false, victimId: player.id });
    } else if (isZombieKill) {
        io.to(code).emit('kill-event', { killerName: 'Zombi', victimName: player.name, byZone: false, victimId: player.id });
    }

    const killerLabel = killerPlayer ? killerPlayer.name : (isZombieKill ? 'zombi' : 'zona');
    console.log(`[${code}] ${player.name} eliminat de ${killerLabel} (loc ${placement}/${totalPlayers})`);

    if (room.mode === 'pve') return; // respawns next wave; stats are saved once, at pveVictory / pveDefeat

    if (_aliveN === 1 && totalPlayers > 1) {
        let winner = null;
        for (const p of room._playerArr) { if (p.alive) { winner = p; break; } }
        io.to(winner.id).emit('winner', { kills: winner.kills });
        io.to(code).emit('game-ended', { winnerName: winner.name });
        room.gameEnded = true;
        if (room.gameLoop) { clearTimeout(room.gameLoop); clearImmediate(room.gameLoop); room.gameLoop = null; }

        endPlayerRound(player, false, { mode: 'br', rs: player.rs });
        endPlayerRound(winner, true, { mode: 'br', rs: winner.rs });
        for (const p of room._playerArr) flushWeaponStats(p); // late bullets of players eliminated earlier
    } else {
        endPlayerRound(player, false, { mode: 'br', rs: player.rs });
    }

    if (_aliveN === 0) {
        io.to(code).emit('game-ended', { winnerName: null });
        room.gameEnded = true;
        for (const p of room._playerArr) flushWeaponStats(p);
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
    room.pveSkipVotes.clear();
    room.pveSpawnQueue = []; room.pveSpawnTimer = 0;
    room.pveWave = 0; room.pveWaveActive = false; room.pveWaveBreak = false; room.pveBreakTimer = 0;
    setTimeout(() => { if (rooms.has(code)) room.countdownActive = false; }, 3700);
    assignSpawnPositions(room._playerArr, room.obstacles);
    room.zombies = generateZombies(room.obstacles, room._playerArr);
    room._playerArr.forEach(p => {
        // Reset PvE upgrades si stats la valorile de baza
        p.damage  = p.baseDamage  || p.damage;
        p.speed   = p.baseSpeed   || p.speed;
        p.maxHp   = p.baseMaxHp   || p.maxHp;
        p.ammoMax = p.baseAmmoMax || p.ammoMax;
        p.pveUpgrades = { dmg: 0, spd: 0, hp: 0, ammo: 0 };
        p.coins = 0;
        flushWeaponStats(p); // anything not saved yet from the last match
        p.hp = p.maxHp; p.alive = true; p.angle = 0; p.kills = 0; p.rs = Missions.newRoundStats();
        p.moveDir = { x: 0, y: 0 }; p.shootDir = { x: 0, y: 0 };
        p.shooting = false; p.shootCooldown = 0; p.aimTimer = 0; p.needsReleaseToShoot = false; p.hasReleasedSinceEmpty = false;
        p.burstRemaining = 0; p.burstTimer = 0; p.burstDx = 0; p.burstDy = 0;
        p.ammo = p.ammoMax; p.reloading = false; p.reloadProgress = 0; p.lastShotTime = 0;
        p.lastDamageTime = 0; p.lastAckSeq = 0; p.pendingAckSeq = 0;
    });
    const rematchMeta = {};
    room._playerArr.forEach(p => {
        p.weaponSkin = equippedWeaponSkin(p.name, p.weapon); // may have been equipped in between
        rematchMeta[p.id] = { slot: p.slot, speed: p.speed, maxHp: p.maxHp, name: p.name, weapon: p.weapon || DEFAULT_WEAPON, weaponSkin: p.weaponSkin };
    });
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
    // every handler registered below is timed: one that holds the loop for more than SLOW_LOG_MS is logged as [SLOW] socket <event>
    const _sockOn = socket.on.bind(socket);
    socket.on = (ev, fn) => _sockOn(ev, function (...a) {
        const t = performance.now();
        try { return fn.apply(this, a); }
        finally { const ms = performance.now() - t; if (ms >= SLOW_MS) slowLog('socket ' + ev, ms, 'handler'); }
    });
    // the page build this server serves: a client on another build reloads (game.js _checkBuild)
    socket.emit('build', BUILD);

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
        if (data && data.proto !== ARNet.PROTO) { socket.emit('proto-mismatch', ARNet.PROTO); socket.emit('room-error', 'Versiune veche a jocului. Pagina se reincarca.'); return; }
        data = { ...data, name: socket._nickname };
        const mode = data.mode === 'pve' ? 'pve' : 'br';
        const code = generateCode();
        const room = newRoom(socket.id, mode);
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
        if (data.proto !== ARNet.PROTO) { socket.emit('proto-mismatch', ARNet.PROTO); socket.emit('room-error', 'Versiune veche a jocului. Pagina se reincarca.'); return; }
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

        if (room.mode === 'pve') {
            assignPveSpawnPositions(room._playerArr);
            room.zombies = [];
            room.base = { x: PVE_BASE_X, y: PVE_BASE_Y, hp: PVE_BASE_HP, maxHp: PVE_BASE_HP, r: PVE_BASE_R };
            room.pveWave = 0; room.pveWaveActive = false; room.pveWaveBreak = false; room.pveBreakTimer = 0;
        } else {
            assignSpawnPositions(room._playerArr, room.obstacles);
            room.zombies = generateZombies(room.obstacles, room._playerArr);
        }
        room._playerArr.forEach(p => {
            p.ammo = p.ammoMax; p.reloading = false; p.reloadProgress = 0; p.lastShotTime = 0;
            p.shooting = false; p.shootCooldown = 0; p.needsReleaseToShoot = false; p.hasReleasedSinceEmpty = false;
            p.burstRemaining = 0; p.burstTimer = 0; p.burstDx = 0; p.burstDy = 0;
            p.lastAckSeq = 0; p.pendingAckSeq = 0; p.coins = 0; p.lastInputAt = 0; p.stalled = false;
        });

        const playersMeta = {};
        room._playerArr.forEach(p => {
            p.weaponSkin = equippedWeaponSkin(p.name, p.weapon); // may have been equipped while waiting
            playersMeta[p.id] = { slot: p.slot, speed: p.speed, maxHp: p.maxHp, name: p.name, weapon: p.weapon || DEFAULT_WEAPON, weaponSkin: p.weaponSkin };
        });
        io.to(code).emit('game-start', { playersMeta, obstacles: room.obstacles, mode: room.mode, season: room.season });
        console.log(`[${code}] Joc pornit cu ${room._playerArr.length} jucatori (${room.mode})`);

        setTimeout(() => {
            if (rooms.has(code)) room.countdownActive = false;
            if (rooms.has(code) && room.mode === 'pve') startPveWave(code, room);
        }, 3700);

        startRoomLoop(code, room);
    });

    socket.on('input', (data) => {
        const r = fastGetRoom(socket);
        if (!r || !r.room.gameStarted || !r.room.players[socket.id]) return;
        const p = r.room.players[socket.id];
        if (!p.alive || r.room.gameEnded || r.room.countdownActive) return;
        if (r.room.pveWaveBreak) return;
        p.lastInputAt = Date.now();
        if (PERF) PERF.input(r.room, socket.id);
        if (!data || typeof data !== 'object') return;
        // applied by the game loop, one per tick (see INPUT_QUEUE_MAX)
        p.inputQ.push(data);
        if (p.inputQ.length > INPUT_QUEUE_MAX) applyInput(p, p.inputQ.shift());
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

    socket.on('pve-skip', () => {
        const r = fastGetRoom(socket);
        if (!r || r.room.mode !== 'pve' || !r.room.pveWaveBreak) return;
        const { code, room } = r;
        room.pveSkipVotes.add(socket.id);
        const total = room._playerArr.length;
        const votes = room.pveSkipVotes.size;
        io.to(code).emit('pve-skip-status', { votes, total });
        if (votes >= total) startPveWave(code, room);
    });

    socket.on('buy-upgrade', ({ type } = {}) => {
        const r = fastGetRoom(socket);
        if (!r || r.room.mode !== 'pve' || !r.room.pveWaveBreak) return;
        const p = r.room.players[socket.id];
        if (!p) return;
        const def = PVE_UPGRADE_DEFS[type];
        if (!def) { socket.emit('upgrade-result', { ok: false }); return; }
        const count = p.pveUpgrades[type] || 0;
        if (count >= def.maxUses) { socket.emit('upgrade-result', { ok: false, reason: 'max' }); return; }
        const cost = pveUpgradeCost(type, count);
        if (p.coins < cost) { socket.emit('upgrade-result', { ok: false }); return; }
        p.coins -= cost;
        p.pveUpgrades[type] = count + 1;
        def.apply(p, count + 1);
        socket.emit('upgrade-result', { ok: true, type, coins: p.coins, upgCounts: { ...p.pveUpgrades }, newMaxHp: p.maxHp });
    });

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
        if (_leavingP) flushWeaponStats(_leavingP); // left early: the weapon counts so far still count
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

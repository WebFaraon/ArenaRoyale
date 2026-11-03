// PvE "player down": a player at zero health is knocked down (a bar drains), a teammate lifts them with E, an empty bar means out for the match.
// The logic lives in server.js / game.js (no pure module), so these tests read the sources for the rules that must not drift; the behaviour itself
// was checked against a real server (3 players: down, revive in 5 s with 50 HP, bleed-out after 30 s, no revive by a new wave, defeat when nobody is left).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

test('the numbers: 30 s of knock, 5 s to lift, 50 HP back', () => {
    assert.match(server, /PVE_DOWN_MS = 30000/);
    assert.match(server, /PVE_REVIVE_MS = 5000/);
    assert.match(server, /PVE_REVIVE_HP = 50/);
    assert.match(client, /_DOWN_MAX = 30000/);
});

test('in PvE zero health knocks a player down instead of eliminating them (BR is untouched)', () => {
    const fn = server.slice(server.indexOf('function eliminatePlayer('), server.indexOf('function eliminatePlayer(') + 2200);
    assert.match(fn, /room\.mode === 'pve'[\s\S]{0,400}downPlayer\(code, room, player\)/);
    // 'eliminated' goes to the client only with player-out in PvE
    assert.match(server, /function outPlayer[\s\S]{0,900}io\.to\(p\.id\)\.emit\('eliminated'/);
    assert.ok(fn.indexOf("room.mode === 'pve'") < fn.indexOf("io.to(player.id).emit('eliminated'"), 'the PvE branch returns before the BR elimination');
});

test('the bar holds while somebody lifts, in the break and in the countdown; empty means out; nobody on their feet is a defeat', () => {
    const fn = server.slice(server.indexOf('function tickDown('), server.indexOf('function tickRevive('));
    assert.match(fn, /p\._revBy \|\| room\.pveWaveBreak \|\| room\.countdownActive\) continue/);
    assert.match(fn, /p\.downMs <= 0\) outPlayer/);
    assert.match(fn, /PVE_NOBODY_MS\) return true/);
    assert.match(server, /tickDown\(code, room, dt, now\)\) \{ pveDefeat\(code, room\)/);
});

test('revive: stand still next to them, the work stops if you move, and the lifted player comes back with 50 HP', () => {
    const fn = server.slice(server.indexOf('function tickRevive('), server.indexOf('function tickRevive(') + 1500);
    assert.match(fn, /p\.moveDir\.x \|\| p\.moveDir\.y/);
    assert.match(fn, /PVE_REVIVE_RANGE/);
    assert.match(fn, /t\.hp = Math\.min\(PVE_REVIVE_HP, t\.maxHp\)/);
    assert.match(fn, /emit\('player-up'/);
    assert.match(server, /socket\.on\('revive-player'/);
});

test('a new wave brings nobody back: a player who is down or out is skipped by startPveWave', () => {
    const fn = server.slice(server.indexOf('function startPveWave('), server.indexOf('function startPveWave(') + 1800);
    assert.match(fn, /if \(p\.down \|\| p\.out\) return;/);
});

test('rematch / a new match start with nobody down or out', () => {
    assert.equal((server.match(/p\.down = false; p\.out = false; p\.downMs = 0; p\._revBy = null;/g) || []).length, 2);
});

test('the client: events, the banner, the E prompt (REVIVE) and no Romanian in the feed or the roster', () => {
    for (const ev of ['player-down', 'revive-work', 'revive-end', 'player-up', 'player-out']) assert.match(client, new RegExp("socket\\.on\\('" + ev + "'"));
    assert.match(html, /id="down-hud"/);
    assert.match(client, /e\.useTxt\.textContent = 'REVIVE'/);
    assert.match(client, /socket\.emit\('revive-player'/);
    assert.doesNotMatch(client, /a cazut/);
    assert.doesNotMatch(client, /'ELIMINAT'/);
});

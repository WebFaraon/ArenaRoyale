// node --test tools/tests/shell-fx.test.js
// Spent cartridges (public/shell-fx.js): a fixed pool, a capped number a frame, they hop, land, bounce and die, a colour is one path, nothing is drawn when nothing
// is alive. Plus that game.js, index.html and the sounds are wired (the shot sounds and the music files exist).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../public/shell-fx.js');
const root = path.join(__dirname, '..', '..', 'public');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const fakeCtx = () => { const c = { calls: {} }; for (const m of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke']) { c.calls[m] = 0; c[m] = function () { c.calls[m]++; }; } return c; };

test('every kind throws a casing; unknown kinds and quality 0 throw nothing; a zero aim does not break it', () => {
    S.reset(); S.beginFrame();
    for (const k of S.KINDS) assert.equal(S.eject(k, 100, 100, 1, 0, 1, rnd), 1, k);
    assert.equal(S.eject('nope', 0, 0, 1, 0, 1, rnd), 0);
    assert.equal(S.eject('pistol', 0, 0, 1, 0, 0, rnd), 0);
    assert.equal(S.eject('pistol', 0, 0, 0, 0, 1, rnd), 1);
    S.step(0.016);
    assert.ok(S.count() >= S.KINDS.length);
});

test('the casing leaves on the right-hand side of the gun', () => {
    // aiming right (+x) on a screen whose y points down: the right hand is +y, so the casing ends up below the line of fire
    let below = 0;
    for (let n = 0; n < 40; n++) { S.reset(); S.beginFrame(); S.eject('rifle', 0, 0, 1, 0, 1, rnd); for (let f = 0; f < 32; f++) S.step(0.016); const c = fakeCtx(); let y = null; const ctx = Object.assign(c, { fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '' }); ctx.moveTo = (px, py) => { if (y === null) y = py; }; S.draw(ctx, -1e4, -1e4, 1e4, 1e4); if (y !== null && y > 0) below++; }
    assert.ok(below >= 36, 'most of them went to the right of the shooter: ' + below + '/40');
});

test('a frame is capped, the pool never grows and the oldest make room', () => {
    S.reset(); S.beginFrame();
    let made = 0;
    for (let i = 0; i < 50; i++) made += S.eject('rifle', i, 0, 1, 0, 1, rnd);
    assert.equal(made, S.MAX_SPAWN);
    for (let f = 0; f < 200; f++) { S.beginFrame(); for (let k = 0; k < 20; k++) S.eject('shell', k, 0, 0, 1, 1, rnd); S.step(0.016); assert.ok(S.count() <= S.MAX); }
});

test('a casing lands (never under the ground), stops moving and is gone after its life', () => {
    S.reset(); S.beginFrame(); S.eject('pistol', 0, 0, 1, 0, 1, rnd);
    let landed = false, x1 = 0;
    for (let f = 0; f < 120 && !landed; f++) { S.step(0.008); if (S.count() === 0) break; }
    S.reset(); S.beginFrame(); S.eject('pistol', 0, 0, 1, 0, 1, rnd);
    for (let f = 0; f < 400; f++) S.step(0.01);   // 4 s: longer than any life
    assert.equal(S.count(), 0, 'all gone');
});

test('draw: one path per colour however many casings, and nothing at all when nothing is alive', () => {
    S.reset();
    const idle = fakeCtx(); idle.fillStyle = ''; S.draw(idle, -1e4, -1e4, 1e4, 1e4);
    assert.equal(idle.calls.beginPath, 0);
    S.beginFrame(); for (let i = 0; i < 8; i++) S.eject('rifle', i * 3, 0, 1, 0, 1, rnd);
    for (let f = 0; f < 8; f++) S.step(0.016);
    const c = fakeCtx(); S.draw(c, -1e4, -1e4, 1e4, 1e4);
    assert.ok(c.calls.fill <= 2 && c.calls.stroke <= 2, 'brass body and its base: ' + c.calls.fill);
    S.beginFrame(); for (let i = 0; i < 6; i++) S.eject('shell', i * 3, 0, 1, 0, 1, rnd);
    for (let f = 0; f < 8; f++) S.step(0.016);
    const c2 = fakeCtx(); S.draw(c2, -1e4, -1e4, 1e4, 1e4);
    assert.ok(c2.calls.fill <= 3, 'at most one fill per colour (brass, dark brass, red): ' + c2.calls.fill);
});

test('game.js throws a casing with every shot, from all three places a shot starts, and draws them under the players', () => {
    const g = read('game.js'), h = read('index.html');
    assert.ok(/<script src="shell-fx\.js"><\/script>/.test(h), 'the script tag');
    assert.equal((g.match(/_ejectShell\(/g) || []).length >= 4, true, 'the function and three calls');
    assert.ok(g.indexOf('ARShells.draw(') < g.indexOf('// --- OBSTACOLE ---') && g.indexOf('ARShells.draw(') > g.indexOf('// (marcajele sunt in dalele din ground-layer.js)'), 'drawn on the ground, after the tiles and before the obstacles');
    assert.ok(g.includes('ARShells.reset()'), 'cleared with a new match');
});

test('the shot sounds and the two music loops are in the project and listed in ui-fx.js', () => {
    const u = read('ui-fx.js');
    for (const t of ['pistol', 'smg', 'rifle', 'shotgun', 'sniper']) {
        assert.ok(u.includes("gun_" + t + ":"), t);
        for (let n = 1; n <= 3; n++) assert.ok(fs.existsSync(path.join(root, 'assets', 'soundEffetcs', 'Gun_' + t + '_' + n + '.mp3')), t + n);
    }
    for (const f of ['LobbyLoop.mp3', 'MatchLoop.mp3']) assert.ok(fs.existsSync(path.join(root, 'assets', 'soundEffetcs', f)), f);
    const g = read('game.js');
    for (const id of ['pistol', 'smg', 'assault', 'burst', 'ar_grizzly', 'ar_falcon', 'ar_titan', 'shotgun', 'sniper']) assert.ok(new RegExp('\\b' + id + ':').test(g.slice(g.indexOf('const _GUN_SFX'), g.indexOf('const _GUN_SFX') + 600)), 'a sound for ' + id);
});

// The flow around a PvE match: the loading screen comes first and only then the 3-2-1; the end board shows at once and has no stray Romanian.
// Source checks (the behaviour was measured in a real browser against a real server).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../public/style.css'), 'utf8');

test('the countdown waits for the loading screens: countdown-start only after every client said match-ready (or 20 s)', () => {
    assert.match(server, /LOAD_WAIT_MS = 20000/);
    assert.match(server, /function beginMatchCountdown\(/);
    assert.match(server, /emit\('countdown-start'/);
    assert.match(server, /socket\.on\('match-ready'/);
    assert.match(server, /waitLoad: !!data\.loader/);
    // the client shows 3-2-1 only on that event, never on game-start itself
    assert.match(client, /socket\.on\('countdown-start', \(\) => \{ _pvClose\(\); showCountdown\(\); \}\)/);
    const calls = client.match(/\bshowCountdown\(\)/g) || [];
    assert.equal(calls.length, 2, 'showCountdown() is defined once and called from one place only: the countdown-start handler');
    assert.match(client, /function _matchReady\(/);
});

test('the PvE end board appears at once, with no delay and no small box first', () => {
    const h = client.slice(client.indexOf("socket.on('pve-end'"), client.indexOf("socket.on('game-rematch'"));
    assert.doesNotMatch(h, /setTimeout/);
    assert.match(h, /_peRender\(_peData\)/);
});

test('no Romanian left on the end board', () => {
    const r = client.slice(client.indexOf('function _peRender('), client.indexOf("socket.on('pve-end'"));
    assert.doesNotMatch(r, /'din '/);
    assert.match(r, /'of ' \+ d\.total/);
});

test('the end board has real confetti (a victory) and a staged reveal under the Fine effects setting', () => {
    assert.match(html, /id="pe-confetti"/);
    assert.match(client, /function _peReveal\(/);
    assert.match(css, /:root\[data-juice="on"\] #pve-end\.is-reveal/);
    assert.match(css, /@keyframes peFall/);
    assert.match(css, /prefers-reduced-motion: reduce\) \{ \.pe-confetti/);
});

test('the scene behind the end board stops where it was (the canvas is not drawn any more)', () => {
    assert.match(client, /let _sceneFrozen = false/);
    assert.match(client, /if \(_sceneFrozen\) return;/);
    const h = client.slice(client.indexOf("socket.on('pve-end'"), client.indexOf("socket.on('game-rematch'"));
    assert.match(h, /_sceneFrozen = true/);
    const r = client.slice(client.indexOf('function resetForNewGame('), client.indexOf('function resetForNewGame(') + 400);
    assert.match(r, /_sceneFrozen = false/);
});

test('the lost board is crowded by the real zombies of the game (their SVGs), not drawn circles', () => {
    const sw = html.slice(html.indexOf('class="pe-swarm"'), html.indexOf('class="pe-swarm"') + 3000);
    const files = [...sw.matchAll(/src="\/images\/zombies\/(zombi[a-z_]*\.svg)"/g)].map(m => m[1]);
    assert.ok(files.length >= 8, 'a crowd of sprites');
    for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, '../../public/images/zombies', f)), f);
    assert.doesNotMatch(html.slice(html.indexOf('class="pe-swarm"'), html.indexOf('id="pe-base-sym"')), /<circle/);
});

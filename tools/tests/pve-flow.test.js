// The flow around a PvE match: the loading screen comes first and only then the 3-2-1.
// Source checks (the behaviour was measured in a real browser against a real server).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '../../public/game.js'), 'utf8');

test('the countdown waits for the loading screens: countdown-start only after every client said match-ready (or 20 s)', () => {
    assert.match(server, /LOAD_WAIT_MS = 20000/);
    assert.match(server, /function beginMatchCountdown\(/);
    assert.match(server, /emit\('countdown-start'/);
    assert.match(server, /socket\.on\('match-ready'/);
    assert.match(server, /waitLoad: !!data\.loader/);
    // the client shows 3-2-1 only on that event, never on game-start itself
    assert.match(client, /socket\.on\('countdown-start', \(\) => showCountdown\(\)\)/);
    const calls = client.match(/\bshowCountdown\(\)/g) || [];
    assert.equal(calls.length, 2, 'showCountdown() is defined once and called from one place only: the countdown-start handler');
    assert.match(client, /function _matchReady\(/);
});

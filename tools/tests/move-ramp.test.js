// node --test tools/tests/move-ramp.test.js
// The short acceleration / deceleration ramp of the players ("Efecte fine"): v += (target - v) * k per step, x += v * dt.
// Server (tick), the client's replay of unconfirmed inputs and its frame-level prediction must agree, so the ramp is an exponential
// whose steps compose exactly: stepping 60 Hz ticks or one big step over the same time gives the same velocity.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../public/combat-shared.js');

const TICK = S.TICK_S;

test('the ramp is short: a quarter of a second reaches the speed, a stop takes about as long', () => {
    let v = 0;
    for (let i = 0; i < 15; i++) v += (300 - v) * S.MOVE_K_TICK;          // 0.25 s
    assert.ok(v > 295 && v <= 300, 'reached the speed: ' + v);
    for (let i = 0; i < 15; i++) v += (0 - v) * S.MOVE_K_TICK;
    assert.ok(v < 5, 'stopped: ' + v);
    // 40 ms (the time constant) covers 63% of the way
    assert.ok(Math.abs(S.moveK(S.MOVE_TAU) - 0.632) < 0.001);
});

test('steps compose exactly: ticks, frames and one big step end at the same velocity', () => {
    const run = (dts) => { let v = 0; for (const dt of dts) v += (250 - v) * S.moveK(dt); return v; };
    const ticks = run(Array(12).fill(TICK));
    const frames = run([0.007, 0.0093, 0.0141, 0.0127, 0.0059, 0.0145, 0.0165, 0.0165, 0.0165, 0.0165, 0.0165, 0.0165].map((x, i, a) => i === 11 ? 12 * TICK - a.slice(0, 11).reduce((s, y) => s + y, 0) : x));
    const one = run([12 * TICK]);
    assert.ok(Math.abs(ticks - one) < 1e-9, 'ticks vs one step');
    assert.ok(Math.abs(frames - one) < 1e-9, 'frames vs one step');
    assert.equal(S.moveK(0), 0);
    assert.ok(S.moveK(10) > 0.999999 && S.moveK(10) <= 1);
    assert.ok(Math.abs(S.MOVE_K_TICK - S.moveK(TICK)) < 1e-12);
});

test('a client that replays the unconfirmed inputs from the acked velocity lands where the server is', () => {
    // server: 40 ticks of input (right, then up, then nothing)
    const inputs = [];
    for (let i = 0; i < 40; i++) inputs.push(i < 20 ? { x: 1, y: 0 } : i < 30 ? { x: 0, y: -1 } : { x: 0, y: 0 });
    const step = (st, m) => { st.vx += (m.x * 200 - st.vx) * S.MOVE_K_TICK; st.vy += (m.y * 200 - st.vy) * S.MOVE_K_TICK; st.x += st.vx * TICK; st.y += st.vy * TICK; };
    const srv = { x: 0, y: 0, vx: 0, vy: 0 };
    let acked = null;
    inputs.forEach((m, i) => { step(srv, m); if (i === 24) acked = { ...srv }; });   // the server has confirmed up to tick 24
    const cli = { ...acked };
    inputs.slice(25).forEach(m => step(cli, m));                                      // the client replays the rest from the acked state
    assert.ok(Math.hypot(cli.x - srv.x, cli.y - srv.y) < 1e-9);
    assert.ok(Math.hypot(cli.vx - srv.vx, cli.vy - srv.vy) < 1e-9);
});

test('the server and the client use the ramp, and the velocity is cleared where a player stops being steered', () => {
    const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
    const game = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'game.js'), 'utf8');
    assert.ok(/player\.vx \+= \(/.test(server) && /ARShared\.MOVE_K_TICK/.test(server), 'server tick uses the ramp');
    assert.ok((server.match(/\.vx = 0/g) || []).length >= 4, 'velocity zeroed on death, wave break, wave start, end and rematch');
    assert.ok(/ARShared\.moveK\(/.test(game) && /_resetMoveV\(\)/.test(game), 'client predicts with the ramp and resets it with the pending inputs');
});

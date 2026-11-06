// node --test tools/tests/exploder.test.js
// The exploder, animated in pieces (both arms with a stick of dynamite in each fist, the head, the bundle on it, the face): its pieces (public/images/zombies/exploder) are up to date and
// stack into the whole picture, the client's pivots, fuses and picture frame are the ones of the generator, and it still goes off on touch on the real server (the server is not touched).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { io: Client } = require('../perf-harness/node_modules/socket.io-client');
const msgpackParser = require('../perf-harness/node_modules/socket.io-msgpack-parser');
const ARNet = require('../../public/netproto.js');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const T = { exploder: 4 };

async function withServer(fn, extraEnv) {
    const port = 4180 + Math.floor(Math.random() * 30);
    const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, PORT: String(port), SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '', LAG_LOG: '0', PERF: '', ...extraEnv }, stdio: 'ignore' });
    try {
        let up = false;
        for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/api/build`); up = true; } catch (e) { await sleep(250); } }
        assert.ok(up, 'server started');
        await fn(`http://127.0.0.1:${port}`);
    } finally { child.kill(); }
}

// opts.sandbox (default true); opts.vote: the level to vote for when the vote comes up (a normal PvE match)
async function client(base, nick, opts = {}) {
    const lj = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = Client(base, { parser: msgpackParser, transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise(r => s.on('connect', r));
    s.emit('authenticate', { nickname: nick, token: lj.token });
    const c = { s, ev: {}, at: {}, zombies: [], me: null, hp: null };
    for (const name of ['boom', 'struct-add', 'struct-hp', 'countdown-start']) s.on(name, (d) => { (c.ev[name] = c.ev[name] || []).push(d); (c.at[name] = c.at[name] || []).push(Date.now()); });
    if (opts.vote) s.on('pve-vote-start', () => s.emit('pve-vote', { id: opts.vote }));
    s.on('gs2', (d) => {
        const z = d[3], out = [];
        for (let i = 0; i + 5 < z.length; i += 6) out.push([z[i], z[i + 5], z[i + 1] / 4, z[i + 2] / 4]);   // id, type, x, y
        c.zombies = out;
        if (d[1].length >= 6) { c.me = { x: d[1][1] / 4, y: d[1][2] / 4 }; c.hp = d[1][4]; }
        s.emit('input', { seq: 1, dx: 0, dy: 0, angle: 0, shooting: false });
    });
    s.emit('create-room', { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, weapon: 'smg', mode: 'pve', sandbox: opts.sandbox !== false, xp: 0, proto: ARNet.PROTO });
    await new Promise(r => s.once('room-created', r));
    s.emit('start-game');
    for (let i = 0; i < 80 && !c.ev['countdown-start']; i++) await sleep(100);
    await sleep(3900);   // the 3-2-1
    return c;
}
const countOf = (c, idx) => c.zombies.filter(z => z[1] === idx).length;

test('the exploder exists as separate pieces (both arms, head, bundle, face) in public/images/zombies/exploder: up to date, same viewBox, and stacked they are exactly the whole sprite', () => {
    const B = require('../../tools/catalog/sprites-exploder.js');
    const dir = path.join(__dirname, '../../public/images/zombies/exploder');
    const files = B.exploderPartFiles();
    for (const n of Object.keys(files)) assert.equal(fs.readFileSync(path.join(dir, n), 'utf8'), files[n], n + ' is up to date: run node tools/catalog/sprites-exploder.js');
    const inner = s => s.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const whole = fs.readFileSync(path.join(__dirname, '../../public/images/zombies/zombi_exploder.svg'), 'utf8');
    assert.equal(whole, B.exploder(), 'the whole sprite is up to date');
    const stacked = B.EXPLODER_ORDER.map(k => { const s = fs.readFileSync(path.join(dir, k + '.svg'), 'utf8'); assert.ok(s.includes('viewBox="' + B.EXPLODER_VIEW + '"'), k + ' shares the viewBox'); return inner(s); }).join('');
    assert.equal(stacked, inner(whole), 'the pieces stacked in order give the whole sprite');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'parts.json'), 'utf8'));
    assert.deepEqual(m.order, B.EXPLODER_ORDER);
    for (const k of m.order) assert.ok(Number.isFinite(m.pivots[k].x) && Number.isFinite(m.pivots[k].y), k + ' has a pivot');
    // each arm holds a stick of dynamite with a red body and a lit fuse (a yellow ball)
    for (const k of ['armL', 'armR']) { const s = fs.readFileSync(path.join(dir, k + '.svg'), 'utf8'); assert.ok(s.includes('#E8403A') && s.includes('#FFD84A'), k + ' holds dynamite'); }
});

test('the client draws the exploder from those pieces: the same parts, pivots, fuses and picture frame as parts.json', () => {
    const B = require('../../tools/catalog/sprites-exploder.js');
    const art = fs.readFileSync(path.join(__dirname, '../../public/arena-art.js'), 'utf8');
    const mm = art.match(/EXP_SET\s*=\s*makePieceSet\('exploder', \[([^\]]*)\], (\{[^}]*\}), 4,/);
    assert.ok(mm, 'EXP_SET is in arena-art.js, for the type 4');
    assert.deepEqual(mm[1].split(',').map(x => x.trim().replace(/'/g, '')), B.EXPLODER_ORDER, 'the same parts in the same order');
    const piv = eval('(' + mm[2] + ')');
    for (const k of B.EXPLODER_ORDER) assert.deepEqual(piv[k], [B.EXPLODER_PIVOTS[k].x, B.EXPLODER_PIVOTS[k].y], 'the pivot of ' + k);
    const fm = art.match(/EXP_FUSE\s*=\s*(\{[^}]*\})/);
    assert.ok(fm, 'EXP_FUSE is in arena-art.js');
    assert.deepEqual(eval('(' + fm[1] + ')'), B.EXPLODER_FUSES, 'the fuses are where the generator put them');
    const row = art.match(/\{ id: 'zombi_exploder', view: (\[[^\]]*\])/);
    assert.ok(row, 'the exploder has its row in ZOMBIE_ART');
    assert.deepEqual(eval(row[1]), B.EXPLODER_VIEW.split(' ').map(Number), 'the picture frame is the one of the pieces');
});

test('the exploder still goes off on touch (a barricade it reaches): the server is the one it had', async () => {
    await withServer(async (base) => {
        const c = await client(base, 'exp_a');
        const px = c.me.x, py = c.me.y;
        let wy = py;
        for (const dy of [0, -130, 130, -260, 260]) {
            c.s.emit('place-struct', { x: px + 130, y: py + dy, o: 1 });
            await sleep(300);
            if (c.ev['struct-add']) { wy = py + dy; break; }
        }
        assert.ok(c.ev['struct-add'], 'a barricade stands');
        c.s.emit('sandbox-spawn', { type: 'exploder', x: px + 130 + 17 + 18 + 30, y: wy });
        for (let i = 0; i < 80 && !(c.ev['boom'] && c.ev['boom'].length); i++) await sleep(100);
        assert.ok(c.ev['boom'] && c.ev['boom'].length >= 1, 'it went off: ' + JSON.stringify(c.ev['boom']));
        assert.ok(!c.zombies.some(z => z[1] === 4), 'and it is gone');
        c.s.close();
    });
});

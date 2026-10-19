// Decompose a real gs packet by component (encoded with the same notepack the server uses)
const { io } = require('socket.io-client'); const parser = require('socket.io-msgpack-parser');
const np = require('../../node_modules/notepack.io');
const PORT = +process.argv[2] || 3101, N = +process.argv[3] || 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const bots = []; let code;
  for (let i = 0; i < N; i++) {
    const nick = 'sz' + N + '_' + i; const j = await (await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = io(`http://127.0.0.1:${PORT}`, { parser, transports: ['websocket'], reconnection: false, forceNew: true });
    await new Promise(r => s.on('connect', r)); s.emit('authenticate', { nickname: nick, token: j.token });
    bots.push(s);
  }
  const data = { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, mode: 'br', xp: 0 };
  code = await new Promise(r => { bots[0].once('room-created', ({ code }) => r(code)); bots[0].emit('create-room', data); });
  for (let i = 1; i < N; i++) { bots[i].emit('join-room', { code, ...data }); await sleep(20); }
  await sleep(300); bots[0].emit('start-game'); await sleep(4500);
  let best = null, ms = 0; const start = Date.now();
  const cnts = []; let t = 0;
  bots.forEach((s, i) => {
    s.on('gs', pk => { if (i !== 0) return; const nb = pk[1].length; if (!best || nb > best[1].length) best = pk; });
    let tt = 0; s.on('gs', () => { tt++; if (tt % 90 === 1) { const a = Math.random() * 6.28; s._dx = Math.cos(a); s._dy = Math.sin(a); } if (tt % 40 === 1) { s._ang = Math.random() * 6.28; s._sh = Math.random() < 0.8; } s.emit('input', { seq: tt, dx: s._dx || 0, dy: s._dy || 0, angle: s._ang || 0, shooting: !!s._sh, sdx: s._sh ? -Math.sin(s._ang) : 0, sdy: s._sh ? Math.cos(s._ang) : 0 }); });
  });
  await sleep(25000);
  const [P, B, PR, ST, Z, ZB, K, PV, TN] = best;
  const sz = v => np.encode(v).length;
  const rows = [['players (rows)', sz(P), P.length + ' rows'], ['bullets', sz(B), B.length + ' bullets'], ['private rows (all players)', sz(PR), PR.length / 7 + ' rows'], ['tickStart (float64 Date.now)', sz(ST), ''], ['zone', sz(Z), ''], ['zombies', sz(ZB), ZB.length / 6 + ' zombies'], ['kits', sz(K), K.length / 4 + ' kits'], ['pve', sz(PV), ''], ['tickNo', sz(TN), '']];
  const total = sz(['gs', best]);
  console.log('TOTAL encoded gs bytes:', total, ' (players', P.length, 'bullets', B.length, ')');
  for (const [n, b, c] of rows) console.log(n.padEnd(32), String(b).padStart(5), 'B', (b / total * 100).toFixed(0).padStart(3) + '%', c);
  console.log('per player row:', (sz(P) / P.length).toFixed(1), 'B; per private row:', (sz(PR) / (PR.length / 7)).toFixed(1), 'B; per bullet:', B.length ? (sz(B) / B.length).toFixed(1) : '-', 'B');
  console.log('sample player row', JSON.stringify(P[0]), 'priv', JSON.stringify(PR.slice(0, 7)), 'bullet', JSON.stringify(B[0]));
  bots.forEach(s => s.disconnect()); process.exit(0);
})();

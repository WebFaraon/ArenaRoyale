// Decompose a real gs2 packet (protocol 3) by component, encoded with the same notepack the server uses.
// node sizes.js [port] [players]
const { io } = require('socket.io-client'); const parser = require('socket.io-msgpack-parser');
const np = require('../../node_modules/notepack.io');
const PORT = +process.argv[2] || 3100, N = +process.argv[3] || 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const bots = []; let code;
  for (let i = 0; i < N; i++) {
    const nick = 'sz' + N + '_' + i; const j = await (await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = io(`http://127.0.0.1:${PORT}`, { parser, transports: ['websocket'], reconnection: false, forceNew: true });
    await new Promise(r => s.on('connect', r)); s.emit('authenticate', { nickname: nick, token: j.token });
    bots.push(s);
  }
  const data = { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, mode: 'br', xp: 0, proto: require('../../public/netproto').PROTO };
  code = await new Promise(r => { bots[0].once('room-created', ({ code }) => r(code)); bots[0].emit('create-room', data); });
  for (let i = 1; i < N; i++) { bots[i].emit('join-room', { code, ...data }); await sleep(20); }
  await sleep(300); bots[0].emit('start-game'); await sleep(4500);
  let best = null;
  bots.forEach((s, i) => {
    s.on('gs2', pk => { if (i !== 0) return; if (!best || pk[2].length > best[2].length) best = pk; });
    let tt = 0; s.on('gs2', () => { tt++; if (tt % 90 === 1) { const a = Math.random() * 6.28; s._dx = Math.cos(a); s._dy = Math.sin(a); } if (tt % 40 === 1) { s._ang = Math.random() * 6.28; s._sh = Math.random() < 0.8; } s.emit('input', { seq: tt, dx: s._dx || 0, dy: s._dy || 0, angle: s._ang || 0, shooting: !!s._sh, sdx: s._sh ? -Math.sin(s._ang) : 0, sdy: s._sh ? Math.cos(s._ang) : 0 }); });
  });
  await sleep(25000);
  const [T, P, B, Z, K, ZN, PV, OWN] = best;
  const sz = v => np.encode(v).length;
  const total = sz({ type: 2, data: ['gs2', best], nsp: '/' });
  const rows = [['tick', sz(T), ''], ['players (flat)', sz(P), P.length / 6 + ' players'], ['bullets (flat)', sz(B), B.length / 6 + ' bullets'], ['zombies (flat)', sz(Z), Z.length / 6 + ' zombies'], ['kits', sz(K), K.length / 4 + ' kits'], ['zone', sz(ZN), ''], ['pve', sz(PV), ''], ['own row', sz(OWN), '']];
  console.log('TOTAL on the wire (one client):', total, 'B  (players', P.length / 6, 'bullets', B.length / 6, ')');
  for (const [n, b, c] of rows) console.log(n.padEnd(20), String(b).padStart(5), 'B', (b / total * 100).toFixed(0).padStart(3) + '%', c);
  console.log('per player', (sz(P) / (P.length / 6)).toFixed(1), 'B, per bullet', B.length ? (sz(B) / (B.length / 6)).toFixed(1) : '-', 'B');
  bots.forEach(s => s.disconnect()); process.exit(0);
})();

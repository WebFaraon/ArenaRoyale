// One client stops reading for 4 s (a stalled phone/WiFi), the rest play. What does the server send when it resumes?
const { io } = require('socket.io-client'); const parser = require('socket.io-msgpack-parser');
const PORT = +process.argv[2] || 3100, N = 10, sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const bots = [];
  for (let i = 0; i < N; i++) {
    const nick = 'sl_' + i; const j = await (await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) })).json();
    const s = io(`http://127.0.0.1:${PORT}`, { parser, transports: ['websocket'], reconnection: false, forceNew: true });
    await new Promise(r => s.on('connect', r)); s.emit('authenticate', { nickname: nick, token: j.token }); bots.push(s);
  }
  const data = { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, mode: 'br', xp: 0, proto: require('../../public/netproto').PROTO };
  const code = await new Promise(r => { bots[0].once('room-created', ({ code }) => r(code)); bots[0].emit('create-room', data); });
  for (let i = 1; i < N; i++) { bots[i].emit('join-room', { code, ...data }); await sleep(20); }
  await sleep(300); bots[0].emit('start-game'); await sleep(4500);
  const slow = bots[N - 1]; const log = []; let resumeAt = 0, bytes = 0;
  bots.forEach((s, i) => { let t = 0; s.on('gs2', pk => { t++; if (i === N - 1) log.push([performance.now(), pk[0]]); s.emit('input', { seq: t, dx: 0, dy: 0, angle: 0, shooting: false }); }); });
  slow.io.engine.on('data', d => { bytes += d.byteLength !== undefined ? d.byteLength : d.length; });
  await sleep(3000);
  const sock = slow.io.engine.transport.ws._socket; // the raw TCP socket under ws
  const before = log.length; sock.pause(); const pauseAt = performance.now();
  await sleep(4000);
  const rssBefore = 0; sock.resume(); resumeAt = performance.now();
  await sleep(1500);
  const after = log.filter(l => l[0] >= resumeAt); const first = after[0], last = after[after.length - 1];
  const burst = after.filter(l => l[0] < resumeAt + 150);
  const tickBefore = log.filter(l => l[0] < pauseAt).slice(-1)[0][1];
  console.log('ticks received in the first 150 ms after resume:', burst.length, '| tick numbers', burst[0] && burst[0][1], '->', burst.length && burst[burst.length - 1][1], '| last tick before pause', tickBefore);
  console.log('=> stale packets delivered (server queued, did not skip):', burst.length, 'of ~', Math.round(4000 / 16.67), 'sent while stalled');
  process.exit(0);
})();

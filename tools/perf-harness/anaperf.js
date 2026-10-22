// node anaperf.js perf.jsonl ROOM  -> aggregate per room across seconds
const fs = require('fs');
const [,, file, room] = process.argv;
const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => !room || l.room === room);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const p = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const mx = a => Math.max(...a);
const g = f => lines.map(f);
const SEC = ['players','pvp','zone','zombies','bullets','kits','snapshot','emit'];
console.log('room', room, 'seconds', lines.length, 'players', lines[0] && lines[0].n.players, 'avg bullets', (g(l=>l.n.bullets).reduce((a,b)=>a+b,0)/lines.length).toFixed(1), 'zombies', lines[0].n.zAlive);
console.log('tickMs   p50(med of p50) %s | p95(med) %s | worst p95 %s | max %s', med(g(l=>l.tickMs.p50)), med(g(l=>l.tickMs.p95)), mx(g(l=>l.tickMs.p95)), mx(g(l=>l.tickMs.max)));
for (const s of SEC) console.log('  %s avg %s max %s', s.padEnd(9), (g(l=>l.sec[s].avg).reduce((a,b)=>a+b,0)/lines.length).toFixed(3), mx(g(l=>l.sec[s].max)));
console.log('emit interval ms: p50 %s p95(med) %s max %s, ticks>25ms/s (med) %s, total>25 %s', med(g(l=>l.emitIntervalMs.p50)), med(g(l=>l.emitIntervalMs.p95)), mx(g(l=>l.emitIntervalMs.max)), med(g(l=>l.emitIntervalMs.over25)), g(l=>l.emitIntervalMs.over25).reduce((a,b)=>a+b,0));
console.log('late ms: p95(med) %s max %s', med(g(l=>l.lateMs.p95)), mx(g(l=>l.lateMs.max)));
console.log('event loop ms: p50 %s, p99(med) %s, p99 worst %s, max %s', med(g(l=>l.eldMs.p50)), med(g(l=>l.eldMs.p99)), mx(g(l=>l.eldMs.p99)), mx(g(l=>l.eldMs.max)));
console.log('gc per sec n(med) %s total ms/s(med) %s, max single %s', med(g(l=>l.gcMs.n)), med(g(l=>l.gcMs.total)), mx(g(l=>l.gcMs.max)));
console.log('packet bytes avg(med) %s max %s', med(g(l=>l.bytes.avg)), mx(g(l=>l.bytes.max)));

// Re-create what the game draws for ENEMY bullets (latest snapshot + wall-clock age, capped 50 ms) from the recorded
// packet arrivals and frame times; measure the apparent speed along each bullet's path.
const fs = require('fs'); const r = JSON.parse(fs.readFileSync(process.argv[2]));
const gs = r.gsLog; const frames = r.pos.map(p => p[0]);
let gi = -1; const series = new Map(); // bullet id -> [{t, along}]
for (const t of frames) {
  while (gi + 1 < gs.length && gs[gi + 1][0] <= t) gi++;
  if (gi < 0) continue;
  const [ta, tick, bullets] = gs[gi];
  const age = Math.min((t - ta) / 1000, 0.05);
  for (const b of bullets) {
    const x = b[1] + b[3] * age, y = b[2] + b[4] * age;   // dx,dy are px/s (the x1000/x1000 round trip)
    let s = series.get(b[0]); if (!s) series.set(b[0], s = { vx: b[3], vy: b[4], pts: [] });
    s.pts.push([t, x, y]);
  }
}
let n = 0, back = 0, big = 0, zero = 0, ratios = [];
for (const s of series.values()) {
  const L = Math.hypot(s.vx, s.vy); if (L < 100 || s.pts.length < 20) continue; const ux = s.vx / L, uy = s.vy / L;
  for (let i = 1; i < s.pts.length; i++) {
    const dt = (s.pts[i][0] - s.pts[i - 1][0]) / 1000; if (dt <= 0 || dt > 0.05) continue;
    const along = ((s.pts[i][1] - s.pts[i - 1][1]) * ux + (s.pts[i][2] - s.pts[i - 1][2]) * uy) / dt; // px/s
    const ratio = along / L; n++; ratios.push(ratio);
    if (along < -1) back++; if (ratio > 1.5) big++; if (Math.abs(along) < 1) zero++;
  }
}
const srt = ratios.slice().sort((a, b) => a - b), p = q => srt[Math.floor(srt.length * q)];
const m = ratios.reduce((a, b) => a + b, 0) / ratios.length, sd = Math.sqrt(ratios.reduce((a, b) => a + (b - m) ** 2, 0) / ratios.length);
console.log(`${process.argv[2].split(/[\/]/).pop()} hz=${r.args.HZ}: bullets tracked ${series.size}, frame-steps ${n}`);
console.log(`  apparent speed / true speed: p5 ${p(.05).toFixed(2)} p50 ${p(.5).toFixed(2)} p95 ${p(.95).toFixed(2)} CV ${(sd / m).toFixed(2)} | frames moving BACKWARD ${(back / n * 100).toFixed(1)}% | frames at a standstill ${(zero / n * 100).toFixed(1)}% | frames >1.5x speed ${(big / n * 100).toFixed(1)}%`);

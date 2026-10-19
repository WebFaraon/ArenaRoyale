// Enemy bullets as drawn, per frame, from a `br.js --pos` run whose page has window.__arBullets (G2 onwards).
// node ana_bullets_rows.js run.json
const fs = require('fs'); const r = JSON.parse(fs.readFileSync(process.argv[2]));
const series = new Map();
for (const row of r.pos) {
    let i = 0; const t = row[i++]; i += 2; const nz = row[i++]; i += nz * 2; const np = row[i++]; i += np * 3; const nb = row[i++];
    if (nb > 0) for (let k = 0; k < nb; k++) { const id = row[i++], x = row[i++], y = row[i++]; let s = series.get(id); if (!s) series.set(id, s = []); s.push([t, x, y]); }
}
let n = 0, back = 0, big = 0, still = 0; const ratios = [];
for (const s of series.values()) {
    if (s.length < 20) continue;
    const dt0 = (s[s.length - 1][0] - s[0][0]) / 1000, ex = s[s.length - 1][1] - s[0][1], ey = s[s.length - 1][2] - s[0][2], L = Math.hypot(ex, ey); if (L < 50) continue;
    const ux = ex / L, uy = ey / L, mean = L / dt0;
    for (let i = 1; i < s.length; i++) {
        const dt = (s[i][0] - s[i - 1][0]) / 1000; if (dt <= 0 || dt > 0.05) continue;
        const along = ((s[i][1] - s[i - 1][1]) * ux + (s[i][2] - s[i - 1][2]) * uy) / dt, ratio = along / mean;
        n++; ratios.push(ratio); if (along < -1) back++; if (ratio > 1.5) big++; if (Math.abs(along) < 1) still++;
    }
}
const srt = ratios.slice().sort((a, b) => a - b), p = q => srt[Math.floor(srt.length * q)];
const m = ratios.reduce((a, b) => a + b, 0) / ratios.length, sd = Math.sqrt(ratios.reduce((a, b) => a + (b - m) ** 2, 0) / ratios.length);
console.log(`${process.argv[2].split(/[\/]/).pop()} hz=${r.args.HZ}: bullets ${series.size}, frame-steps ${n} | speed/mean p5 ${p(.05).toFixed(2)} p50 ${p(.5).toFixed(2)} p95 ${p(.95).toFixed(2)} CV ${(sd / m).toFixed(2)} | BACKWARD ${(back / n * 100).toFixed(1)}% | standstill ${(still / n * 100).toFixed(1)}% | >1.5x ${(big / n * 100).toFixed(1)}%`);

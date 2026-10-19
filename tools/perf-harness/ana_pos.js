// node ana_pos.js file.json -> smoothness of rendered motion (zombies, other players, own camera)
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2])); const rows = r.pos;
const hz = r.args.HZ;
function parse(row) { let i = 0; const t = row[i++]; const me = [row[i++], row[i++]]; const nz = row[i++]; const z = []; for (let k = 0; k < nz; k++) z.push([row[i++], row[i++]]); const np = row[i++]; const pl = []; for (let k = 0; k < np; k++) pl.push([row[i++], row[i++], row[i++]]); let nb = row[i++]; const bl = []; if (nb > 0) for (let k = 0; k < nb; k++) bl.push([row[i++], row[i++], row[i++]]); return { t, me, z, pl, bl, nb }; }
const F = rows.map(parse);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
// tracks: list of per-frame [x,y] sequences, following nearest neighbour
function tracksOf(getList) {
    const tracks = []; let prev = null; let open = [];
    for (let f = 0; f < F.length; f++) {
        const cur = getList(F[f]);
        if (prev && cur.length === prev.length) { for (let k = 0; k < cur.length; k++) open[k].push([F[f].t, cur[k][0], cur[k][1], cur[k][2]]); }
        else { for (const o of open) if (o.length > 30) tracks.push(o); open = cur.map(c => [[F[f].t, c[0], c[1], c[2]]]); }
        prev = cur;
    }
    for (const o of open) if (o.length > 30) tracks.push(o);
    return tracks;
}
function analyse(tracks, label, minSpeed = 15) {
    const win = 0.5; // s
    let nFrames = 0, still = 0, cvs = [], devs = [], jumps = [], speeds = [], updHz = [];
    for (const tr of tracks) {
        // per frame displacement
        const d = [], dt = [];
        for (let i = 1; i < tr.length; i++) { d.push(Math.hypot(tr[i][1] - tr[i - 1][1], tr[i][2] - tr[i - 1][2])); dt.push((tr[i][0] - tr[i - 1][0]) / 1000); }
        // windows of ~win seconds
        let i0 = 0;
        while (i0 < d.length) {
            let i1 = i0, T = 0, D = 0; while (i1 < d.length && T < win) { T += dt[i1]; D += d[i1]; i1++; }
            if (T < win * 0.9) break;
            const v = D / T; // mean px/s in the window
            if (v >= minSpeed && v < 400) {
                speeds.push(v);
                const dev = []; let nStill = 0, changes = 0; let lastX = null;
                for (let k = i0; k < i1; k++) { const vi = d[k] / dt[k]; dev.push(vi / v); if (d[k] < 1e-6) nStill++; }
                // coefficient of variation of per-frame velocity
                const m = dev.reduce((a, b) => a + b, 0) / dev.length; const sd = Math.sqrt(dev.reduce((a, b) => a + (b - m) * (b - m), 0) / dev.length);
                cvs.push(sd / (m || 1)); still += nStill; nFrames += dev.length;
                for (const x of dev) jumps.push(x);
                // position updates per second inside the window
                let upd = 0; for (let k = i0; k < i1; k++) if (d[k] > 1e-6) upd++; updHz.push(upd / T);
            }
            i0 = i1;
        }
    }
    if (!cvs.length) { console.log(label.padEnd(18), 'no moving tracks'); return; }
    console.log(label.padEnd(18), 'tracks', tracks.length, 'windows', cvs.length, '| speed med', med(speeds).toFixed(0), 'px/s',
        '| CV of per-frame velocity: med', med(cvs).toFixed(2), 'p90', pct(cvs, .9).toFixed(2),
        '| frames with NO movement', (still / nFrames * 100).toFixed(0) + '%',
        '| frames w/ velocity >2x mean', (jumps.filter(x => x > 2).length / jumps.length * 100).toFixed(1) + '%',
        '| distinct updates/s', med(updHz).toFixed(0));
}
const dtAll = []; for (let i = 1; i < F.length; i++) dtAll.push(F[i].t - F[i - 1].t);
console.log(`${process.argv[2].split(/[\/]/).pop()} hz=${hz} frames=${F.length} dt p50 ${med(dtAll).toFixed(2)} p99 ${pct(dtAll, .99).toFixed(1)}`);
analyse(tracksOf(f => f.z), 'zombies');
analyse(tracksOf(f => f.pl), 'remote players');
analyse(tracksOf(f => [f.me]), 'own camera (pred)');

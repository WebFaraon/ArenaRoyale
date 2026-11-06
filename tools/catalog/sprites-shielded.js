// The shielded zombie (a riot shield held out in front) as separate pieces, to animate it: both arms, the head and the shield with the two hands that grip it. The head and the shield
// are the ones of the picture the game had (public/images/zombies/zombi_shielded.svg); the arms are new: before, they hung straight down behind the shield where nothing showed,
// now they reach from the shoulders to the hands on the edge of the shield, so that when the shield is thrust forward the arms stretch with it.
// All the pieces share the viewBox, and stacked in order (back to front) they are exactly the whole picture, which this file writes too.
//
//   node tools/catalog/sprites-shielded.js     writes public/images/zombies/shielded/{armL,armR,head,shield}.svg + parts.json and the whole picture zombi_shielded.svg
//
// In the game (public/arena-art.js, drawShieldedSprite) the zombie is 24 units across: `disc` 38.5 of this picture = r 24.
const INK = '#0B0F1A';
const r1 = n => Math.round(n * 10) / 10;
const rect = (x, y, w, h, rx, fill, sw = 0, extra = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}${extra ? ' ' + extra : ''}/>`;
const path = (d, fill, sw = 0) => `<path d="${d}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''}/>`;
const svg = (vb, inner) => { const [x, y, w, h] = vb.split(' ').map(Number); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w * 2}" height="${h * 2}">${inner}</svg>`; };

const SHIELDED_VIEW = '-70 -52.5 140 140';
const SHIELDED_ORDER = ['armL', 'armR', 'head', 'shield'];
const SHIELDED_PIVOTS = {
  armL: { x: -28, y: 8, note: 'left shoulder (inside the head): the arm stretches with the shield and swings a little with the walk' },
  armR: { x: 28, y: 8, note: 'right shoulder: the other side' },
  head: { x: 0, y: 0, note: 'centre of the head: sways with the steps, lunges into the bash' },
  shield: { x: 0, y: 46, note: 'the middle of the shield: it is pulled back for the wind-up, thrust forward for the bash, and sways with the walk' },
};

function shieldedPieces() {
  const G = '#7C9A78', GL = '#A7C4A2', CUFF = '#5C6B80';
  // an arm: from the shoulder (hidden under the head) down and a little outward to the hand on the edge of the shield; a torn sleeve in the middle. Drawn straight, then tilted
  // 11 degrees about the shoulder (28, 8) so that it ends under the hand at (38, 50)
  const arm = s => { const X = s * 28 - 7;
    return `<g transform="rotate(${r1(-s * 11)} ${s * 28} 8)">` + rect(X, 8, 14, 46, 7, G, 3.4) + rect(X + 1.6, 10, 5.4, 40, 2.6, GL, 0, 'opacity=".7"') + path(`M${X} 22 h14 v11 l-3.5 -3 l-3.5 4 l-3.5 -4 l-3.5 3 Z`, CUFF, 2.6) + '</g>'; };
  const head = [
    "<circle cx=\"0\" cy=\"0\" r=\"36\" fill=\"#4F6A52\"/>",
    "<circle cx=\"-3.2\" cy=\"-3.6\" r=\"33.8\" fill=\"#7C9A78\"/>",
    "<circle cx=\"-14\" cy=\"-8\" r=\"5\" fill=\"#6A8667\" opacity=\".8\"/>",
    "<circle cx=\"12\" cy=\"-13\" r=\"4\" fill=\"#6A8667\" opacity=\".8\"/>",
    "<path d=\"M-12 -30 q4 -6 8 0 q4 -6 8 0 q3 6 -2 9 q-5 3 -10 0 q-6 -3 -4 -9z\" fill=\"#E88AA0\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    "<ellipse cx=\"-13\" cy=\"-16.9\" rx=\"8.3\" ry=\"3.6\" transform=\"rotate(-35 -13 -16.9)\" fill=\"#fff\" opacity=\".35\"/>",
    "<circle cx=\"0\" cy=\"0\" r=\"36\" fill=\"none\" stroke=\"#0B0F1A\" stroke-width=\"5\"/>",
    "<circle cx=\"-10.8\" cy=\"14\" r=\"6\" fill=\"#FF3B3B\" opacity=\".35\"/>",
    "<circle cx=\"-10.8\" cy=\"14\" r=\"4\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
    "<circle cx=\"-10.1\" cy=\"13.3\" r=\"1.1\" fill=\"#FFD0D0\"/>",
    "<circle cx=\"10.8\" cy=\"14\" r=\"6\" fill=\"#FF3B3B\" opacity=\".35\"/>",
    "<circle cx=\"10.8\" cy=\"14\" r=\"4\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
    "<circle cx=\"10.1\" cy=\"13.3\" r=\"1.1\" fill=\"#FFD0D0\"/>",
  ].join('');
  const shield = [
    "<path d=\"M-40 40 Q0 24 40 40 L36 64 Q0 52 -36 64 Z\" fill=\"#6F8197\" stroke=\"#0B0F1A\" stroke-width=\"4\" stroke-linejoin=\"round\"/>",
    "<path d=\"M-36 43 Q0 28 36 43 L34.5 51 Q0 36 -34.5 51 Z\" fill=\"#9FB4CC\"/>",
    "<path d=\"M-35 55 Q0 41 35 55 L34 60 Q0 47 -34 60 Z\" fill=\"#FF9F1C\" stroke=\"#0B0F1A\" stroke-width=\"1.8\"/>",
    "<circle cx=\"-28\" cy=\"41.9\" r=\"1.9\" fill=\"#E9EEF5\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
    "<circle cx=\"-14\" cy=\"37.5\" r=\"1.9\" fill=\"#E9EEF5\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
    "<circle cx=\"0\" cy=\"36\" r=\"1.9\" fill=\"#E9EEF5\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
    "<circle cx=\"14\" cy=\"37.5\" r=\"1.9\" fill=\"#E9EEF5\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
    "<circle cx=\"28\" cy=\"41.9\" r=\"1.9\" fill=\"#E9EEF5\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
    "<path d=\"M-30 45 Q-12 36 4 36\" fill=\"none\" stroke=\"#fff\" stroke-width=\"2.4\" stroke-linecap=\"round\" opacity=\".5\"/>",
    "<circle cx=\"-38\" cy=\"52\" r=\"7.6\" fill=\"#7C9A78\" stroke=\"#0B0F1A\" stroke-width=\"3.2\"/>",
    "<circle cx=\"-36.6\" cy=\"50.4\" r=\"5\" fill=\"#A7C4A2\"/>",
    "<circle cx=\"38\" cy=\"52\" r=\"7.6\" fill=\"#7C9A78\" stroke=\"#0B0F1A\" stroke-width=\"3.2\"/>",
    "<circle cx=\"36.6\" cy=\"50.4\" r=\"5\" fill=\"#A7C4A2\"/>",
  ].join('');
  return { armL: arm(-1), armR: arm(1), head, shield };
}
function shielded() { const p = shieldedPieces(); return svg(SHIELDED_VIEW, SHIELDED_ORDER.map(k => p[k]).join('')); }
const shieldedPartFiles = () => { const p = shieldedPieces(); const f = {}; SHIELDED_ORDER.forEach(k => { f[k + '.svg'] = svg(SHIELDED_VIEW, p[k]); }); f['parts.json'] = JSON.stringify({ view: SHIELDED_VIEW.split(' ').map(Number), order: SHIELDED_ORDER, pivots: SHIELDED_PIVOTS }, null, 2); return f; };

module.exports = { shielded, shieldedPieces, shieldedPartFiles, SHIELDED_ORDER, SHIELDED_PIVOTS, SHIELDED_VIEW };

if (require.main === module) {
  const fs = require('fs'), path_ = require('path');
  const out = path_.join(__dirname, '..', '..', 'public', 'images', 'zombies');
  fs.writeFileSync(path_.join(out, 'zombi_shielded.svg'), shielded());
  const dir = path_.join(out, 'shielded'); fs.mkdirSync(dir, { recursive: true });
  const f = shieldedPartFiles(); for (const n of Object.keys(f)) fs.writeFileSync(path_.join(dir, n), f[n]);
  console.log('wrote zombi_shielded.svg, shielded/' + Object.keys(f).join(', shielded/'));
}

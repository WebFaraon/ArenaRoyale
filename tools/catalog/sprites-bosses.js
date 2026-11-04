// The three final bosses of Survival PvE (Brood Mother, Colossus, Reaper) and the egg the Brood Mother throws, drawn in the grammar of the game's zombies
// (public/images/zombies): seen from above, facing down, two arms reaching down, a round head, ink outline #0B0F1A, a darker lip under every form and a soft
// highlight, flat colours. They are much more detailed than the common zombies: they are rare and the whole screen looks at them.
//
//   node tools/catalog/sprites-bosses.js          writes public/images/zombies/boss_{brood,colossus,reaper}.svg + boss_egg.svg, the Brood Mother as separate pieces
//                                                 (public/images/zombies/brood/{sac,feelers,armL,armR,head}.svg + parts.json) and the contact sheet bsheet.html
//
// `view` / `disc` below are what ZOMBIE_ART (public/arena-art.js) needs once a boss goes into the game (see CLAUDE.md, "Cum se adaugă un zombi nou").
const INK = '#0B0F1A';
const r1 = n => Math.round(n * 10) / 10;
const circ = (x, y, r, fill, sw = 0, stroke = INK, extra = '') => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}"` : ''} ${extra}/>`;
const ell = (x, y, rx, ry, fill, sw = 0, stroke = INK, extra = '') => `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}"` : ''} ${extra}/>`;
const rect = (x, y, w, h, rx, fill, sw = 0, stroke = INK, extra = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}"` : ''} ${extra}/>`;
const poly = (pts, fill, sw = 3, stroke = INK, extra = '') => `<polygon points="${pts.map(p => r1(p[0]) + ',' + r1(p[1])).join(' ')}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"` : ''} ${extra}/>`;
const path = (d, fill, sw = 3, stroke = INK, extra = '') => `<path d="${d}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : ''} ${extra}/>`;
const line = (x1, y1, x2, y2, c, w, extra = '') => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${extra}/>`;
const svg = (vb, inner) => { const [x, y, w, h] = vb.split(' ').map(Number); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w * 2}" height="${h * 2}">${inner}</svg>`; };
const g = (tf, inner) => `<g transform="${tf}">${inner}</g>`;
const mirror = fn => fn(-1) + fn(1);
const PI = Math.PI;
// an irregular chunk (a stone, a plate): n points round (cx, cy), radius r with a fixed wobble
const chunk = (cx, cy, r, n, rot = 0, sq = 1) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * PI / n, k = 1 + 0.16 * Math.sin(i * 2.7 + rot * 3) - 0.08 * (i % 2); return [cx + r * k * Math.cos(a), cy + r * k * sq * Math.sin(a)]; });

// ---------- BROOD MOTHER: a bloated purple queen. A swollen brood sac on her back with a puckered mouth that flings the eggs out (the eggs are not on her:
// she throws them round as she walks to the base), a big head with a crest of bone plates, six eyes and no mouth, two heavy clawed arms and a pair of feelers.
// Like every zombie of the game, seen from above: no mouth is drawn, only the eyes show on the face.
function broodPieces() {
  const D = '#4B3260', M = '#7C58A0', L = '#B994D6', LL = '#D9C0EE', SAC = '#E9A8C9', SACD = '#A6558A', BONE = '#F4EAD2', BONED = '#CDBB94', YEL = '#FFE75B', GRN = '#B8FF4D';
  // the brood sac behind the head: a swollen segmented abdomen (three bands that grow smaller), a glowing soft belly in the middle and, on top, the puckered mouth
  // the eggs fly out of
  const band = (cy, rx, ry, c1, c2) => ell(0, cy, rx, ry, D, 6) + ell(0, cy - 1, rx - 4.5, ry - 4.5, c1) + ell(0, cy - 3, rx - 10, ry - 10, c2, 0, INK, 'opacity=".9"');
  const sac = band(-52, 56, 40, '#6A4890', '#8A64B0') + band(-70, 46, 33, '#7C58A0', '#9D77C2') + band(-86, 34, 24, '#8A64B0', '#B38ED2') +
    // ridges between the bands and rows of knobs along them
    [-52, -70].map(y => path(`M${-48 + (y === -70 ? 6 : 0)} ${y - 18} Q0 ${y - 30} ${48 - (y === -70 ? 6 : 0)} ${y - 18}`, 'none', 2.4, D)).join('') +
    [-40, -24, -8, 8, 24, 40].map((x, i) => circ(x, -30 - Math.abs(x) * 0.16 - 8 + (i % 2), 3, '#D9C0EE', 1.6)).join('') +
    // a glowing patch of thin skin on the belly (something moves in it), and glare
    ell(0, -62, 20, 15, '#E9A8C9', 3) + ell(0, -62, 12, 9, '#FFD6EA', 0, INK, 'opacity=".75"') + [[-6, -62, 3.4], [5, -58, 2.6]].map(([x, y, r]) => circ(x, y, r, '#C97AA8', 0, INK, 'opacity=".8"')).join('') +
    ell(-24, -92, 14, 5, '#fff', 0, INK, 'opacity=".4" transform="rotate(-25 -24 -92)"') +
    // the puckered mouth on top
    ell(0, -106, 17, 10, D, 4.4) + ell(0, -106, 12.5, 6.6, '#2A1236', 2.6) + ell(0, -106.5, 7.4, 3.4, GRN, 0, INK, 'opacity=".9"') + ell(0, -106.5, 3.4, 1.6, '#FFFFD0') +
    [-1, 1].map(s => path(`M${s * 17} -106 q${s * 6} -3 ${s * 9} -9`, 'none', 3, D)).join('');
  // small bone plates on the shoulders of the sac
  const scutes = [-1, 1].map(s => [0, 1].map(i => path(`M${s * (52 - i * 2)} ${-44 - i * 22} q${s * 12} -2 ${s * 13} ${-11} q${s * -9} ${-3} ${s * -15} ${5}`, BONE, 3) + path(`M${s * (53 - i * 2)} ${-47 - i * 22} q${s * 6} -2 ${s * 7} -6`, 'none', 1.4, BONED)).join('')).join('');
  // the clawed arms: thick, with skin folds, a bony bracer and three curved claws
  const arm = s => {
    const x = s * 42, L = 56, X = x - 15;
    return rect(X, 8, 30, L, 15, D, 5) + rect(X + 3, 11, 10, L - 8, 5, M, 0, INK, 'opacity=".95"') + rect(X + 4, 12, 6, L - 14, 3, LL, 0, INK, 'opacity=".5"') +
      [18, 30, 42].map(y => path(`M${X + 2} ${y} q15 6 26 0`, 'none', 2, D)).join('') +
      path(`M${X - 1} 10 h32 v14 q-16 8 -32 0 Z`, BONE, 3.4) + [0, 1, 2].map(i => line(X + 6 + i * 10, 14, X + 6 + i * 10, 22, BONED, 1.8)).join('') +
      circ(x, 8 + L, 19, D, 5) + circ(x - 3, 8 + L - 3, 13, M) + circ(x - 6, 8 + L - 7, 6, L, 0, INK, 'opacity=".8"') +
      // knuckle studs and three claws
      [-8, 0, 8].map(d => circ(x + d, 8 + L + 2, 2, BONE, 1.2)).join('') +
      [-1, 0, 1].map(i => { const cx = x + i * 10, y = 8 + L + 14; return path(`M${cx - 3.6} ${y} Q${cx - 4.2} ${y + 9} ${cx} ${y + 17} Q${cx + 4.2} ${y + 9} ${cx + 3.6} ${y} Z`, BONE, 2.6); }).join('');
  };
  // feelers: two curved horns of bone with glowing tips, rising from the crest
  const feelers = mirror(s => path(`M${s * 40} -30 q${s * 18} -18 ${s * 12} -40 q${s * -2} 14 ${s * -16} 30 Z`, BONE, 3.2) + path(`M${s * 42} -34 q${s * 10} -12 ${s * 10} -26`, 'none', 1.6, BONED));
  // the head
  const head = circ(0, 0, 58, D, 0) + circ(-4, -4, 54, M) + circ(-9, -9, 46, L, 0, INK, 'opacity=".5"') +
    // a crest of three bony plates across the brow, with studs
    path('M-48 -14 Q-36 -52 0 -54 Q36 -52 48 -14 L42 -6 Q30 -36 0 -38 Q-30 -36 -42 -6 Z', BONE, 3.8) + path('M-36 -22 Q-22 -42 0 -44 Q22 -42 36 -22', 'none', 1.8, BONED) +
    [-34, -17, 0, 17, 34].map((x, i) => circ(x, -28 + Math.abs(x) * 0.34 - (x === 0 ? 8 : 0) + (i % 2 ? 2 : 0), 2.6, BONED, 1.4)).join('') +
    // pustules and skin spots
    [[-30, -6, 6, 5], [34, -10, 7, 5], [-44, 12, 4, 3], [46, 14, 5, 4]].map(([x, y, a, b]) => ell(x, y, a, b, D, 0, INK, 'opacity=".55"') + ell(x - 1, y - 1, a * 0.5, b * 0.5, LL, 0, INK, 'opacity=".5"')).join('') +
    // six eyes: two big, four small
    [[-19, 31, 9], [19, 31, 9]].map(([x, y, r]) => circ(x, y, r + 5, YEL, 0, INK, 'opacity=".28"') + circ(x, y, r, YEL, 3) + circ(x - 3, y - 3, 2.4, '#fff')).join('') +
    [[-8, 17, 4.6], [8, 17, 4.6], [-33, 38, 4.2], [33, 38, 4.2]].map(([x, y, r]) => circ(x, y, r, YEL, 2.4) + circ(x - 1, y - 1, 1.1, '#fff')).join('') +
    // no mouth (from above only the eyes show): folds of skin round the lower face
    mirror(s => path(`M${s * 44} 4 q${s * 10} 18 ${s * 2} 38`, 'none', 3.4, D) + path(`M${s * 36} 12 q${s * 6} 14 ${s * 2} 28`, 'none', 2, D, 'opacity=".7"')) +
    // no mouth: the lower face is left plain, with a few skin folds at the sides
    mirror(s => path(`M${s * 46} 22 q${s * 4} 14 ${s * -2} 26`, 'none', 3, D, 'opacity=".6"')) +
    // veins on the forehead and cheeks
    [[-14, -30, -22, -18, -30, -10], [14, -30, 22, -18, 30, -10], [-4, -34, -2, -24, -8, -16], [4, -34, 2, -24, 8, -16]].map(([a, b, c, d, e, f]) => path(`M${a} ${b} Q${c} ${d} ${e} ${f}`, 'none', 1.8, D, 'opacity=".55"')).join('') +
    ell(-26, -26, 14, 5, '#fff', 0, INK, 'opacity=".4" transform="rotate(-35 -26 -26)"') + circ(0, 0, 58, 'none', 7);
  // the pieces, in drawing order (back to front). They share one coordinate system and one viewBox, so stacked at the same origin they give exactly the whole sprite,
  // and each can be turned about its own pivot (see BROOD_PIVOTS) to animate it
  return { sac: sac + scutes, feelers, armL: arm(-1), armR: arm(1), head };
}
const BROOD_VIEW = '-104 -124 208 250';
const BROOD_ORDER = ['sac', 'feelers', 'armL', 'armR', 'head'];
// pivots in the shared coordinates: where each piece is joined to the rest (the point to rotate / squash about), plus the usual swing
const BROOD_PIVOTS = {
  sac: { x: 0, y: -30, note: 'joint behind the head: breathes (scale ~1.0-1.05) and sways a few degrees' },
  feelers: { x: 0, y: -30, note: 'both horns hinge at the crest: wiggle +-8 degrees, opposite phases' },
  armL: { x: -42, y: 14, note: 'left shoulder: swings +-25 degrees as she walks' },
  armR: { x: 42, y: 14, note: 'right shoulder: swings +-25 degrees, opposite phase' },
  head: { x: 0, y: 0, note: 'centre of the head: bobs 2-3 units, turns +-6 degrees' },
};
function brood() { const p = broodPieces(); return svg(BROOD_VIEW, BROOD_ORDER.map(k => p[k]).join('')); }
// one SVG per piece, same viewBox as the whole (public/images/zombies/brood/<piece>.svg) + the manifest with order and pivots
const broodPartFiles = () => { const p = broodPieces(); const f = {}; BROOD_ORDER.forEach(k => { f[k + '.svg'] = svg(BROOD_VIEW, p[k]); }); f['parts.json'] = JSON.stringify({ view: BROOD_VIEW.split(' ').map(Number), order: BROOD_ORDER, pivots: BROOD_PIVOTS }, null, 2) + '\n'; return f; };

// ---------- A SMALL COLOSSUS: the Colossus calls eight of them when it is down to a quarter of its health. The same stone and lava, but stubby: a round dome of rock plates with a heavy
// brow and two molten eyes in the lower half (no mouth), a few boulders behind the head, two short stone arms with boulder fists. In pieces (crown, both arms, head) to animate it.
function colossusMiniPieces() {
  const D = '#3E382F', M = '#7A705D', M2 = '#5E5644', L = '#B5AB93', LAVA = '#FF7A1F', HOT = '#FFD34D', RED = '#D9421A';
  const crack = (pts, w = 3) => path('M' + pts.map(p => p.join(' ')).join(' L'), 'none', w, RED) + path('M' + pts.map(p => p.join(' ')).join(' L'), 'none', w - 1.4, LAVA);
  const bolt = (x, y, r = 1.8) => circ(x, y, r, L, 1.1) + circ(x - r * 0.3, y - r * 0.3, r * 0.35, '#fff', 0, INK, 'opacity=".7"');
  const crown = [[-30, -22, 12, 6, 0.4], [-14, -36, 13, 6, 1.1], [0, -41, 15, 7, 0.2], [14, -36, 13, 6, 2.2], [30, -22, 12, 6, 0.9]].map(([x, y, r, n, rot]) =>
    poly(chunk(x, y, r, n, rot, 0.92), M, 3.4) + poly(chunk(x - 1, y - 1, r * 0.68, n, rot, 0.92), L, 0) + path(`M${r1(x - r * 0.5)} ${r1(y + r * 0.2)} q${r1(r * 0.5)} ${r1(r * 0.3)} ${r1(r)} 0`, 'none', 1.2, D)).join('');
  const arm = s => {
    const x = s * 38, y0 = 10, L0 = 30, fy = y0 + L0 + 10;
    return rect(x - 11, y0, 22, L0 + 2, 8, D, 4) + rect(x - 8, y0 + 2, 16, L0 - 3, 6, M) + rect(x - 7, y0 + 4, 5, L0 - 9, 2.5, L, 0, INK, 'opacity=".6"') + crack([[x + 4, y0 + 5], [x + 1, y0 + 13], [x + 5, y0 + 19]], 2.2) +
      poly([[x - 12, y0 + L0 - 12], [x + 12, y0 + L0 - 12], [x + 13, y0 + L0], [x - 13, y0 + L0]], D, 3) + poly([[x - 9, y0 + L0 - 10], [x + 9, y0 + L0 - 10], [x + 10, y0 + L0 - 2], [x - 10, y0 + L0 - 2]], M2, 0) + line(x - 8, y0 + L0 - 6, x + 8, y0 + L0 - 6, LAVA, 1.8) +
      poly(chunk(x, fy, 15, 8, s * 0.5, 0.9), D, 4) + poly(chunk(x - 1, fy - 2, 12.5, 8, s * 0.5, 0.9), M) + poly(chunk(x - 4, fy - 6, 6, 6, s * 1.1, 0.9), L, 0, INK, 'opacity=".7"') +
      crack([[x - 8, fy - 4], [x, fy + 1], [x + 7, fy - 5]], 2.4) + circ(x, fy + 1, 4.2, RED, 1.6) + circ(x, fy + 1, 2.6, LAVA) + circ(x - 0.6, fy + 0.4, 1, HOT);
  };
  const head = circ(0, 0, 30, D) + circ(-2, -3, 27.5, M) + circ(-5, -6, 22, L, 0, INK, 'opacity=".4"') +
    [0, 1, 2, 3, 4].map(i => { const a = i * 2 * PI / 5 + 0.4; return path(`M${r1(8 * Math.cos(a))} ${r1(8 * Math.sin(a))} L${r1(28 * Math.cos(a))} ${r1(28 * Math.sin(a))}`, 'none', 2, D); }).join('') +
    Array.from({ length: 7 }, (_, i) => { const a = PI + 0.3 + i * (PI - 0.6) / 6; return bolt(26 * Math.cos(a), -2 + 26 * Math.sin(a), 1.7); }).join('') +
    circ(0, -11, 7, D, 2.6) + circ(0, -11, 5, RED) + circ(0, -11, 3.4, LAVA) + circ(-0.6, -11.6, 1.4, HOT) +
    crack([[-22, -8], [-17, -12], [-15, -19]], 2.2) + crack([[21, -12], [17, -17], [18, -23]], 2.2) +
    poly([[-22, 3], [-17, -1], [17, -1], [22, 3], [19, 10], [-19, 10]], D, 3) + poly([[-19, 3], [-16, 1], [16, 1], [19, 3], [17, 7], [-17, 7]], M2, 0) + bolt(-17, 5, 1.5) + bolt(17, 5, 1.5) +
    [-1, 1].map(sg => circ(sg * 11, 18, 8, LAVA, 0, INK, 'opacity=".3"') + circ(sg * 11, 18, 5.6, RED, 2) + circ(sg * 11, 18, 3.8, LAVA) + circ(sg * 11 - sg * 0.8, 17.2, 1.5, HOT)).join('') +
    ell(-11, -17, 8, 3, '#fff', 0, INK, 'opacity=".35" transform="rotate(-35 -11 -17)"') + circ(0, 0, 30, 'none', 4.4);
  return { crown, armL: arm(-1), armR: arm(1), head };
}
const COLOSSUS_MINI_VIEW = '-64 -64 128 144';
const COLOSSUS_MINI_ORDER = ['crown', 'armL', 'armR', 'head'];
const COLOSSUS_MINI_PIVOTS = {
  crown: { x: 0, y: -14, note: 'the boulders behind the head: heave a little with each step' },
  armL: { x: -38, y: 12, note: 'left shoulder: swings with the step, rises for the blow' },
  armR: { x: 38, y: 12, note: 'right shoulder: opposite phase' },
  head: { x: 0, y: 0, note: 'centre of the dome: sinks into each step, leans into the blow' },
};
function colossusMini() { const p = colossusMiniPieces(); return svg(COLOSSUS_MINI_VIEW, COLOSSUS_MINI_ORDER.map(k => p[k]).join('')); }
const colossusMiniPartFiles = () => { const p = colossusMiniPieces(); const f = {}; COLOSSUS_MINI_ORDER.forEach(k => { f[k + '.svg'] = svg(COLOSSUS_MINI_VIEW, p[k]); }); f['parts.json'] = JSON.stringify({ view: COLOSSUS_MINI_VIEW.split(' ').map(Number), order: COLOSSUS_MINI_ORDER, pivots: COLOSSUS_MINI_PIVOTS }, null, 2) + '\n'; return f; };

// ---------- COLOSSUS: a giant of stone and lava. A dome of rock plates ringed with bolts and glowing seams, a heavy brow and molten eyes between cheek plates (no mouth: from above
// only the eyes show), a crown of rounded boulders behind the head with magma glowing between them, layered pauldrons, stone-braced arms and two boulder fists with lava in
// their cracks. Every step crushes what is in its way.
function colossusPieces() {
  const D = '#3E382F', M = '#6F6757', M2 = '#58513F', L = '#A89F88', LL = '#CFC7B1', LAVA = '#FF7A1F', HOT = '#FFD34D', RED = '#D9421A';
  const crack = (pts, w = 4.6) => path('M' + pts.map(p => p.join(' ')).join(' L'), 'none', w, RED) + path('M' + pts.map(p => p.join(' ')).join(' L'), 'none', w - 2.2, LAVA) + path('M' + pts.map(p => p.join(' ')).join(' L'), 'none', 1.2, HOT);
  const bolt = (x, y, r = 2.4) => circ(x, y, r, L, 1.4) + circ(x - r * 0.3, y - r * 0.3, r * 0.35, LL);
  // a crown of rounded boulders behind the head: heavy stone lumps of different sizes with strata lines
  const crown = [[-58, -34, 20, 7, 0.4], [-34, -58, 23, 7, 1.1], [0, -70, 27, 8, 0.2], [34, -58, 23, 7, 2.2], [58, -34, 20, 6, 0.9], [-12, -50, 18, 6, 1.7], [18, -50, 17, 6, 2.6]].map(([x, y, r, n, rot]) =>
    poly(chunk(x, y, r, n, rot, 0.92), M, 4.4) + poly(chunk(x - 2, y - 2, r * 0.7, n, rot, 0.92), L, 0) + path(`M${x - r * 0.5} ${y + r * 0.2} q${r * 0.5} ${r * 0.3} ${r} 0`, 'none', 1.6, D) + path(`M${x - r * 0.4} ${y - r * 0.25} q${r * 0.4} ${r * 0.2} ${r * 0.8} 0`, 'none', 1.2, D, 'opacity=".6"')).join('');
  // pauldrons: two stacked plates each, rivet rows, lava in the joint and a crack
  const paulS = s => poly([[s * 40, -8], [s * 80, -22], [s * 96, 12], [s * 82, 36], [s * 46, 32]], D, 5) + poly([[s * 42, -10], [s * 78, -22], [s * 91, 10], [s * 78, 30], [s * 48, 28]], M, 0) + poly([[s * 46, -10], [s * 76, -20], [s * 82, -4], [s * 56, 6]], L, 0, INK, 'opacity=".7"') +
    poly([[s * 50, 10], [s * 84, 2], [s * 90, 24], [s * 58, 34]], D, 4) + poly([[s * 52, 10], [s * 82, 4], [s * 86, 20], [s * 58, 30]], M2, 0) + crack([[s * 58, 8], [s * 68, 13], [s * 76, 8]], 3.4) +
    [0, 1, 2, 3].map(i => bolt(s * (52 + i * 9), -12 + i * 3 + 0.5 * i * i, 2.2)).join('') + crack([[s * 70, -16], [s * 74, -6], [s * 68, 2]], 2.6);
  // arms: stone limbs in segments, a stone bracer with bolts and a lava inlay, and a boulder fist with knuckle ridges, lava cracks and drips
  const arm = s => {
    const x = s * 58, L0 = 57, y0 = 16, fy = y0 + L0 + 16, fx = x;
    return rect(x - 19, y0, 38, L0 + 4, 13, D, 5) + rect(x - 15, y0 + 3, 30, L0 - 2, 11, M) + rect(x - 13, y0 + 5, 11, L0 - 8, 5, L, 0, INK, 'opacity=".7"') +
      [y0 + 14, y0 + 30].map(y => path(`M${x - 18} ${y} q18 7 36 0`, 'none', 2.6, D)).join('') + crack([[x + 9, y0 + 8], [x + 3, y0 + 18], [x + 11, y0 + 28]], 3.2) +
      // the bracer: a stone band with bolts and a molten stripe
      poly([[x - 21, y0 + L0 - 22], [x + 21, y0 + L0 - 22], [x + 24, y0 + L0 - 2], [x - 24, y0 + L0 - 2]], D, 4.4) + poly([[x - 18, y0 + L0 - 19], [x + 18, y0 + L0 - 19], [x + 20, y0 + L0 - 5], [x - 20, y0 + L0 - 5]], M2, 0) + line(x - 16, y0 + L0 - 12, x + 16, y0 + L0 - 12, RED, 4.2) + line(x - 16, y0 + L0 - 12, x + 16, y0 + L0 - 12, LAVA, 2) +
      bolt(x - 15, y0 + L0 - 16) + bolt(x + 15, y0 + L0 - 16) +
      poly(chunk(fx, fy, 33, 9, s * 0.5, 0.9), D, 5.2) + poly(chunk(fx - 1, fy - 2, 29, 9, s * 0.5, 0.9), M) + poly(chunk(fx - 8, fy - 9, 15, 7, s * 1.1, 0.9), L, 0, INK, 'opacity=".75"') +
      // knuckle ridges
      [-14, 0, 14].map(d => path(`M${fx + d - 6} ${fy + 22} q6 -8 12 0`, M2, 2.6)).join('') +
      crack([[fx - 18, fy - 6], [fx - 4, fy + 2], [fx + 4, fy - 10], [fx + 20, fy - 4]], 4) + crack([[fx - 2, fy + 2], [fx - 8, fy + 18]], 3) + circ(fx, fy, 9, RED, 2.6) + circ(fx, fy, 5.6, LAVA) + circ(fx - 1, fy - 1, 2.4, HOT);
  };
  // the dome: a round head of rock plates, a ring of bolts and an armour band, a glowing seam from the core, a heavy brow, cheek plates and molten eyes
  const head = circ(0, 0, 58, D) + circ(-4, -5, 54, M) + circ(-9, -10, 44, L, 0, INK, 'opacity=".45"') +
    // plates: seams radiating from the middle, with lava in them
    [0, 1, 2, 3, 4, 5].map(i => { const a = i * PI / 3 + 0.5; return path(`M${r1(14 * Math.cos(a))} ${r1(14 * Math.sin(a))} L${r1(56 * Math.cos(a))} ${r1(56 * Math.sin(a))}`, 'none', 3, D) + path(`M${r1(26 * Math.cos(a + 0.05))} ${r1(26 * Math.sin(a + 0.05))} L${r1(52 * Math.cos(a + 0.05))} ${r1(52 * Math.sin(a + 0.05))}`, 'none', 1.5, RED); }).join('') +
    // the armour band round the dome: an arc of stone with bolts
    path('M-50 -4 A50 50 0 0 1 50 -4', 'none', 7, D) + path('M-50 -4 A50 50 0 0 1 50 -4', 'none', 3.6, M2) + Array.from({ length: 9 }, (_, i) => { const a = PI + 0.25 + i * (PI - 0.5) / 8; return bolt(50 * Math.cos(a), -4 + 50 * Math.sin(a), 2.2); }).join('') +
    circ(0, -18, 15, D, 4) + circ(0, -18, 11.4, RED) + circ(0, -18, 8, LAVA) + circ(-1.2, -19.2, 3.4, HOT) + crack([[0, -4], [0, 6]], 3) +
    crack([[-46, -16], [-36, -22], [-30, -34]], 3.6) + crack([[42, -24], [34, -32], [36, -46]], 3.6) + crack([[-42, 24], [-32, 32], [-36, 44]], 3) + crack([[40, 28], [32, 38], [38, 46]], 3) +
    // the brow: a heavy slab with chamfered ends, then the cheek plates and the molten eyes
    poly([[-44, 6], [-36, -2], [36, -2], [44, 6], [40, 17], [-40, 17]], D, 4.4) + poly([[-40, 6], [-34, 1], [34, 1], [40, 6], [36, 12], [-36, 12]], M2, 0) + poly([[-34, 2], [34, 2], [30, 5], [-30, 5]], L, 0, INK, 'opacity=".7"') + bolt(-34, 9, 2) + bolt(34, 9, 2) +
    mirror(s => poly([[s * 40, 18], [s * 52, 22], [s * 44, 46], [s * 30, 48], [s * 34, 28]], D, 4) + poly([[s * 40, 21], [s * 48, 24], [s * 42, 42], [s * 33, 43], [s * 36, 29]], M, 0) + path(`M${s * 40} 24 L${s * 36} 38`, 'none', 1.6, D)) +
    // the nose ridge and a chin slab (no mouth: a plain plate with a lava seam from the core down it)
    poly([[-6, 18], [6, 18], [9, 40], [-9, 40]], D, 3.6) + poly([[-4, 20], [4, 20], [6, 38], [-6, 38]], M2, 0) + poly([[-22, 46], [22, 46], [16, 56], [-16, 56]], D, 3.6) + poly([[-18, 47], [18, 47], [13, 54], [-13, 54]], M2, 0) + crack([[0, 40], [0, 54]], 2.6) +
    [-1, 1].map(s => circ(s * 21, 28, 14, LAVA, 0, INK, 'opacity=".3"') + circ(s * 21, 28, 9, RED, 3) + circ(s * 21, 28, 6.2, LAVA) + circ(s * 21 - s * 1.2, 26.8, 2.6, HOT)).join('') +
    ell(-22, -34, 13, 5, '#fff', 0, INK, 'opacity=".35" transform="rotate(-35 -22 -34)"') + circ(0, 0, 58, 'none', 7);
  // the pieces, in drawing order (back to front), in one coordinate system and one viewBox: stacked at the same origin they give exactly the whole sprite, and each can be
  // turned about its own pivot (COLOSSUS_PIVOTS) to animate it
  return { crown, pauL: paulS(-1), pauR: paulS(1), armL: arm(-1), armR: arm(1), head };
}
const COLOSSUS_VIEW = '-104 -104 208 232';
const COLOSSUS_ORDER = ['crown', 'pauL', 'pauR', 'armL', 'armR', 'head'];
const COLOSSUS_PIVOTS = {
  crown: { x: 0, y: -20, note: 'the boulders behind the head: heave a little with each step and rock a few degrees' },
  pauL: { x: -58, y: 18, note: 'left shoulder plates: follow the arm at about a third of its swing' },
  pauR: { x: 58, y: 18, note: 'right shoulder plates: the same, opposite phase' },
  armL: { x: -58, y: 20, note: 'left shoulder: swings +-30 degrees with the step, rises for the blow' },
  armR: { x: 58, y: 20, note: 'right shoulder: opposite phase' },
  head: { x: 0, y: 0, note: 'centre of the dome: sinks 2-4 units with each step, leans into the blow' },
};
function colossus() { const p = colossusPieces(); return svg(COLOSSUS_VIEW, COLOSSUS_ORDER.map(k => p[k]).join('')); }
// one SVG per piece (public/images/zombies/colossus/<piece>.svg) + the manifest with order and pivots
const colossusPartFiles = () => { const p = colossusPieces(); const f = {}; COLOSSUS_ORDER.forEach(k => { f[k + '.svg'] = svg(COLOSSUS_VIEW, p[k]); }); f['parts.json'] = JSON.stringify({ view: COLOSSUS_VIEW.split(' ').map(Number), order: COLOSSUS_ORDER, pivots: COLOSSUS_PIVOTS }, null, 2) + '\n'; return f; };
function ellipsePulse() { return ''; }

// ---------- REAPER: a hooded wraith in a ragged cloak. A bone mask with sockets full of cold soul fire in the hood, a long scythe in one hand and a skeletal hand with a soul
// flame in the other, chains with little skulls across the chest and wisps drifting round it.
function reaper() {
  const D = '#12142B', M = '#2A2F5E', L = '#4C5499', LL = '#7B84CC', BONE = '#EDE6CF', BONED = '#BDB394', SOUL = '#4DF2D2', SOULD = '#14B59A', STEEL = '#C9D4E3', STEELD = '#7F8CA6';
  // the ragged cloak spread behind and round the hood: torn cloth tails with slightly hollow sides (not spikes), folds running into the hood
  // (symmetric about the vertical axis; the opening of the cloak, at the bottom, is covered by the arms)
  const N = 9, LENS = [82, 76, 86, 78, 94, 78, 86, 76, 82], SPAN = 2 * PI - 0.9, tails = Array.from({ length: N }, (_, i) => [-PI / 2 + (i - (N - 1) / 2) * SPAN / (N - 1), LENS[i]]);
  let cd = '', cd2 = '';
  tails.forEach(([a, len], i) => { const w = 0.3, A = [58 * Math.cos(a - w), 58 * Math.sin(a - w)], B = [58 * Math.cos(a + w), 58 * Math.sin(a + w)], T = [len * Math.cos(a + 0.07 * (i < 4 ? 1 : i > 4 ? -1 : 0)), len * Math.sin(a + 0.07 * (i < 4 ? 1 : i > 4 ? -1 : 0)) * 0.92];
    const Ca = [(A[0] + T[0]) / 2 * 0.92, (A[1] + T[1]) / 2 * 0.92], Cb = [(B[0] + T[0]) / 2 * 0.92, (B[1] + T[1]) / 2 * 0.92];
    cd += (i ? ' L' : 'M') + r1(A[0]) + ' ' + r1(A[1]) + ' Q' + r1(Ca[0]) + ' ' + r1(Ca[1]) + ' ' + r1(T[0]) + ' ' + r1(T[1]) + ' Q' + r1(Cb[0]) + ' ' + r1(Cb[1]) + ' ' + r1(B[0]) + ' ' + r1(B[1]);
    cd2 += (i ? ' L' : 'M') + r1(A[0] * 0.9) + ' ' + r1(A[1] * 0.9) + ' Q' + r1(Ca[0] * 0.88) + ' ' + r1(Ca[1] * 0.88) + ' ' + r1(T[0] * 0.84) + ' ' + r1(T[1] * 0.84) + ' Q' + r1(Cb[0] * 0.88) + ' ' + r1(Cb[1] * 0.88) + ' ' + r1(B[0] * 0.9) + ' ' + r1(B[1] * 0.9); });
  const cloak = path(cd + ' Z', D, 5) + path(cd2 + ' Z', M, 0) +
    tails.map(([a, len]) => path(`M${r1(52 * Math.cos(a))} ${r1(52 * Math.sin(a))} Q${r1(66 * Math.cos(a + 0.12))} ${r1(66 * Math.sin(a + 0.12))} ${r1((len - 12) * Math.cos(a))} ${r1((len - 12) * Math.sin(a) * 0.92)}`, 'none', 2, L, 'opacity=".65"')).join('') +
    tails.map(([a, len]) => circ((len - 6) * Math.cos(a), (len - 6) * Math.sin(a) * 0.92, 1.8, '#04050F', 0, INK, 'opacity=".6"')).join('');
  // sleeves + skeletal hands
  const sleeve = x => rect(x - 12, 8, 24, 60, 11, D, 5) + rect(x < 0 ? x - 9 : x + 1, 11, 8, 50, 4, L, 0, INK, 'opacity=".6"') + path(`M${x - 12} 68 l3 12 l5 -9 l4 11 l5 -11 l4 9 l3 -12 Z`, D, 3.2);
  const sleeveL = sleeve(-36), sleeveR = sleeve(36);
  // a skeletal hand: a round palm and three identical straight fingers, the same on both sides
  const hand = (x, y) => circ(x, y, 9, BONE, 3.2) + [-1, 0, 1].map(i => { const cx = x + i * 6.4; return path(`M${cx - 2.4} ${y + 6} L${cx - 2.4} ${y + 21} Q${cx} ${y + 25} ${cx + 2.4} ${y + 21} L${cx + 2.4} ${y + 6} Z`, BONE, 2.6); }).join('');
  // chains with small skulls across the chest, below the hood
  const chains = path('M-34 46 Q0 70 34 46', 'none', 3.4, '#8A93AB') + path('M-34 46 Q0 70 34 46', 'none', 1.2, '#D6DCE8') +
    [-20, 0, 20].map(x => { const y = 46 + 24 * (1 - Math.pow(x / 34, 2)) * 0.62 + 4; return circ(x, y + 4, 5.4, BONE, 2.6) + circ(x - 2, y + 3, 1.6, INK) + circ(x + 2, y + 3, 1.6, INK); }).join('');
  // the hood: a round dark cowl, a lighter rim of folds, and the opening with a bone mask and soul fire in the sockets
  const hood = circ(0, 0, 52, D) + circ(-3, -4, 49, M) + circ(-6, -8, 40, L, 0, INK, 'opacity=".55"') +
    path('M-44 -8 Q-30 -46 0 -48 Q30 -46 44 -8', 'none', 3, D) + [-24, -8, 10, 26].map((x, i) => path(`M${x} ${-44 + (i % 2) * 3} Q${x + (i % 2 ? 6 : -6)} -22 ${x * 0.8} -4`, 'none', 2.2, D, 'opacity=".75"')).join('') +
    // the opening: seen from above only a dark slit low on the front of the hood shows, with two soul-fire eyes in it (no skull, no face)
    path('M-33 14 Q-28 4 0 3 Q28 4 33 14 Q33 38 0 46 Q-33 38 -33 14 Z', '#04050F', 4.4) +
    [-1, 1].map(s => circ(s * 16, 25, 12, SOUL, 0, INK, 'opacity=".25"') + circ(s * 16, 25, 6, SOUL, 2.4) + circ(s * 16 - s * 1.5, 23.4, 2, '#E9FFFA')).join('') +
    // silver trim along the rim of the hood with small runes of soul fire
    path('M-47 -4 Q-34 -44 0 -46 Q34 -44 47 -4', 'none', 3.2, '#8A93AB') + path('M-47 -4 Q-34 -44 0 -46 Q34 -44 47 -4', 'none', 1.2, '#D6DCE8') + [-36, -24, -12, 0, 12, 24, 36].map((x, i) => circ(x, -43 + Math.abs(x) * 0.34 + (x === 0 ? 0 : 0), i % 2 ? 1.5 : 2.1, SOUL, 0.8)).join('') +
    circ(0, 0, 52, 'none', 6.4) + ell(-22, -30, 13, 5, '#fff', 0, INK, 'opacity=".25" transform="rotate(-35 -22 -30)"');
  return svg('-100 -100 200 206', cloak + sleeveL + sleeveR + hand(-36, 74) + hand(36, 74) + chains + hood);
}

// the egg the Brood Mother throws round: cream shell with speckles, a crack with the small thing inside, a faint green glow
function egg() {
  return svg('-30 -36 60 72',
    ell(0, 2, 26, 32, '#8E6D2E', 0, INK, 'opacity=".25"') + ell(0, 0, 22, 28, '#CDBB94', 4.4) + ell(-2, -2, 19, 25, '#F4EAD2') + ell(-7, -11, 6, 10, '#fff', 0, INK, 'opacity=".55" transform="rotate(-20 -7 -11)"') +
    [[-8, 8, 2.6], [8, -4, 2.2], [4, 14, 2], [-4, -16, 1.8], [11, 8, 1.6]].map(([x, y, r]) => circ(x, y, r, '#D6C48A', 0, INK, 'opacity=".9"')).join('') +
    path('M-4 -22 L2 -14 L-3 -8 L4 0 L-1 6', 'none', 2.6, '#7C5E2C') + circ(0, 12, 12, '#B8FF4D', 0, INK, 'opacity=".18"'));
}

// what hatches from the Brood Mother's eggs: small, fast and fragile. The same grammar as the zombies of the game, in her purple: a round body, two stubby arms
// with bone claws, a bone tuft on the brow, two yellow eyes low on the face (no mouth, no pupils).
function hatchling() {
  const D = '#4B3260', M = '#7C58A0', L = '#B994D6', BONE = '#F4EAD2', BONED = '#CDBB94', YEL = '#FFE75B';
  const arm = s => rect(s * 14 - 6, 12, 12, 20, 6, D, 3.4) + rect(s * 14 - 3.6, 14, 4.6, 14, 2.3, M, 0) +
    [-1, 0, 1].map(i => path(`M${s * 14 + i * 4 - 1.6} 30 Q${s * 14 + i * 4 - 2} 36 ${s * 14 + i * 4} 40 Q${s * 14 + i * 4 + 2} 36 ${s * 14 + i * 4 + 1.6} 30 Z`, BONE, 1.8)).join('');
  const head = circ(0, 0, 24, D, 0) + circ(-1.6, -1.8, 22, M) + circ(-4, -5, 17, L, 0, INK, 'opacity=".5"') +
    path('M-14 -10 Q-8 -24 0 -24 Q8 -24 14 -10 L10 -8 Q6 -17 0 -17 Q-6 -17 -10 -8 Z', BONE, 2.6) +
    [[-8, 6], [8, 6]].map(([x, y]) => circ(x, y, 7.4, YEL, 0, INK, 'opacity=".28"') + circ(x, y, 4.6, YEL, 2.4) + circ(x - 1.3, y - 1.4, 1.2, '#fff')).join('') +
    ell(-9, -11, 5.4, 2.2, '#fff', 0, INK, 'opacity=".4" transform="rotate(-35 -9 -11)"') + circ(0, 0, 24, 'none', 4);
  return svg('-44 -36 88 88', arm(-1) + arm(1) + head);
}

const BOSSES = {
  brood: { svg: brood, file: 'boss_brood.svg', view: '-104 -124 208 250' },
  colossus: { svg: colossus, file: 'boss_colossus.svg', view: '-104 -104 208 232' },
  reaper: { svg: reaper, file: 'boss_reaper.svg', view: '-100 -100 200 206' },
  egg: { svg: egg, file: 'boss_egg.svg', view: '-30 -36 60 72' },
  hatchling: { svg: hatchling, file: 'zombi_hatchling.svg', view: '-44 -36 88 88' },
  colossusMini: { svg: colossusMini, file: 'zombi_colossus_mini.svg', view: '-64 -64 128 144' },
};
module.exports = { brood, colossus, reaper, egg, hatchling, BOSSES, broodPieces, broodPartFiles, BROOD_ORDER, BROOD_PIVOTS, BROOD_VIEW, colossusPieces, colossusPartFiles, COLOSSUS_ORDER, COLOSSUS_PIVOTS, COLOSSUS_VIEW, colossusMini, colossusMiniPieces, colossusMiniPartFiles, COLOSSUS_MINI_ORDER, COLOSSUS_MINI_PIVOTS, COLOSSUS_MINI_VIEW };

if (require.main === module) {
  const fs = require('fs'), path_ = require('path');
  const out = path_.join(__dirname, '..', '..', 'public', 'images', 'zombies');
  for (const k of Object.keys(BOSSES)) fs.writeFileSync(path_.join(out, BOSSES[k].file), BOSSES[k].svg());
  const cell = k => `<div style="text-align:center"><div style="font:700 13px sans-serif;color:#fff">${k}</div><div style="width:${k === 'egg' ? 150 : 420}px;height:${k === 'egg' ? 150 : 460}px;background:repeating-linear-gradient(90deg,#4E8F43 0 64px,#468439 64px 128px);display:grid;place-items:center">${BOSSES[k].svg().replace(/ width="[^"]*" height="[^"]*"/, ' width="100%" height="100%"')}</div></div>`;
  fs.writeFileSync(path_.join(__dirname, 'bsheet.html'), `<body style="margin:0;background:#111;display:flex;gap:12px;padding:12px;align-items:flex-start">${Object.keys(BOSSES).map(cell).join('')}</body>`);
  const pd = path_.join(out, 'brood'); fs.mkdirSync(pd, { recursive: true });
  const pf = broodPartFiles(); for (const n of Object.keys(pf)) fs.writeFileSync(path_.join(pd, n), pf[n]);
  console.log('wrote brood/' + Object.keys(pf).join(', brood/'));
  const cd = path_.join(out, 'colossus'); fs.mkdirSync(cd, { recursive: true });
  const cf = colossusPartFiles(); for (const n of Object.keys(cf)) fs.writeFileSync(path_.join(cd, n), cf[n]);
  console.log('wrote colossus/' + Object.keys(cf).join(', colossus/'));
  const md = path_.join(out, 'colossus_mini'); fs.mkdirSync(md, { recursive: true });
  const mf = colossusMiniPartFiles(); for (const n of Object.keys(mf)) fs.writeFileSync(path_.join(md, n), mf[n]);
  console.log('wrote colossus_mini/' + Object.keys(mf).join(', colossus_mini/'));
  console.log('wrote', Object.keys(BOSSES).map(k => BOSSES[k].file).join(', '));
}

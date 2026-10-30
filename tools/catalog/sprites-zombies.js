// Top-down zombie sprites for the new zombie ideas, in the grammar of the game's own (public/images/zombies): two arms reaching down, a round head
// (dark rim, lighter face, ink outline 5), exposed bits and stitches, glowing red eyes; each one adds what makes it different.
const INK = '#0B0F1A';
const r1 = n => Math.round(n * 10) / 10;
const wrapZ = (inner, vb = '-70 -52.5 140 140') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;
const circ = (x, y, r, fill, sw = 0, stroke = INK, extra = '') => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}"` : ''} ${extra}/>`;
const rect = (x, y, w, h, rx, fill, sw = 2.4, stroke = INK) => `<rect x="${r1(x)}" y="${r1(y)}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const poly = (pts, fill, sw = 2.4, stroke = INK) => `<polygon points="${pts.map(p => r1(p[0]) + ',' + r1(p[1])).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const path = (d, fill, sw = 2.4, stroke = INK, extra = '') => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const line = (x1, y1, x2, y2, c, w) => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
const rotg = (deg, inner, cx = 0, cy = 0) => `<g transform="rotate(${deg} ${cx} ${cy})">${inner}</g>`;

function arms(o) {
  const w = o.armW || 12, L = o.armL || [64, 70], x = o.armX || 17, dark = o.arm[0], light = o.arm[1], hand = o.hand || o.arm[0], handL = o.handLight || light;
  const one = (side, len) => { const cx = side * x, X = cx - w / 2;
    return rect(X, 6, w, len, w / 2, dark, 3.4) + `<rect x="${r1(X + 1.4)}" y="8" width="${r1(w * 0.42)}" height="${len - 6}" rx="2.4" fill="${light}" opacity=".7"/>` +
      (o.cuff === false ? '' : path(`M${X} 6 h${w} v14 l-3 -4 l-3 5 l-3 -5 l-3 4 Z`, o.cuffColor || '#5C6B80', 2.6)) +
      (o.noHand ? '' : circ(cx, 6 + len, w * 0.72, hand, 3.2) + circ(cx - 1.4, 6 + len - 1.7, w * 0.48, handL) + [-4.6, 0, 4.6].map(d => circ(cx + d, 6 + len + w * 0.6, 2.4, hand, 2)).join('')); };
  return one(-1, L[0]) + one(1, L[1]);
}
function head(o) {
  const r = o.r || 36, d = o.c[0], l = o.c[1];
  const spots = (o.spots === false) ? '' : `<ellipse cx="${r * 0.33}" cy="${-r * 0.33}" rx="8" ry="6" fill="${o.spot || d}" opacity=".6"/><ellipse cx="${-r * 0.39}" cy="${r * 0.22}" rx="5" ry="4" fill="${o.spot || d}" opacity=".6"/>`;
  const stitch = o.stitch === false ? '' : [0, 1, 2, 3].map(i => line(-r * 0.66 + i * 3.5, -r * 0.1 + i * 4.4, -r * 0.5 + i * 3.5, r * 0.04 + i * 4.4, INK, 1.6)).join('') + line(-r * 0.66, -r * 0.1, -r * 0.28, r * 0.38, INK, 1.8);
  return circ(0, 0, r, d) + circ(-r * 0.09, -r * 0.1, r - 2.2, l) + spots + (o.mid || '') + stitch +
    `<ellipse cx="${r1(-r * 0.36)}" cy="${r1(-r * 0.47)}" rx="${r1(r * 0.23)}" ry="${r1(r * 0.1)}" transform="rotate(-35 ${r1(-r * 0.36)} ${r1(-r * 0.47)})" fill="#fff" opacity=".35"/>` + circ(0, 0, r, 'none', o.rim || 5);
}
function eyes(o) {
  const x = o.eyeX || 10.8, y = o.eyeY || 18, rr = o.eyeR || 4, c = o.eye || '#FF3B3B';
  const e = s => circ(s * x, y, rr * 1.5, c, 0, INK, 'opacity=".35"') + circ(s * x, y, rr, c, 1.6) + circ(s * x - s * 0.7, y - 0.7, rr * 0.28, '#FFD0D0');
  return e(-1) + e(1);
}
function Z(o) { return wrapZ((o.back || '') + arms(o) + (o.behind || '') + head(o) + (o.front || '') + (o.noEyes ? '' : eyes(o)) + (o.top || ''), o.vb); }

const teeth = (n, r, r2, w, col = '#F4F1E4', start = 0) => Array.from({ length: n }, (_, i) => { const a = start + i * 2 * Math.PI / n; const bx = r * Math.cos(a), by = r * Math.sin(a), tx = r2 * Math.cos(a), ty = r2 * Math.sin(a), nx = -Math.sin(a) * w, ny = Math.cos(a) * w; return poly([[bx + nx, by + ny], [tx, ty], [bx - nx, by - ny]], col, 1.1); }).join('');

const SP = {
  // Jammer: a radio dish on its head and signal rings round it; it blinds the towers near it
  jammer: () => Z({ vb: '-72 -66 144 158', c: ['#3E5870', '#6C8BA8'], arm: ['#6C8BA8', '#9DB8CF'], eye: '#38E1FF', r: 34,
    back: [0, 1, 2].map(i => `<circle r="${44 + i * 8}" fill="none" stroke="#38E1FF" stroke-width="2" stroke-dasharray="${5 + i * 2} 6" opacity="${0.75 - i * 0.2}"/>`).join(''),
    front: line(0, -14, 0, -42, INK, 5.4) + line(0, -14, 0, -42, '#C9D4E3', 2.4) + circ(0, -44, 4, '#38E1FF', 2) + path('M-18 -12 Q0 -38 18 -12 Z', '#C9D4E3', 3) + path('M-12 -12 Q0 -28 12 -12', 'none', 1.4, '#7F93A8') + circ(0, -14, 3, '#FF4B5C', 1.6) }),
  // Looter: a sack on its back and a bandit mask; it steals coins and runs
  looter: () => Z({ vb: '-70 -68 140 160', c: ['#9B7B3C', '#D9B56A'], arm: ['#D9B56A', '#F1D894'], eye: '#FFF3C4', eyeY: 17, r: 33, stitch: false,
    back: circ(0, -33, 19, '#8A5A2B', 3.4) + circ(-2, -36, 15, '#B4793B') + path('M-8 -49 L0 -44 L8 -49 Q0 -55 -8 -49 Z', '#6B4220', 2.4) + circ(0, -36, 6, '#FFC72E', 2) + circ(0, -36, 3.2, 'none', 1.4, '#A87B10'),
    front: rect(-26, 8, 52, 17, 6, '#1B1F2A', 2.6) + path('M26 15 l10 -3 l-3 8 Z', '#1B1F2A', 2),
    top: circ(30, 78, 6, '#FFC72E', 2.4) + circ(30, 78, 3.2, 'none', 1.4, '#A87B10') }),
  // Leech: small and wet, a ring of teeth for a face; it latches onto a turret and drains it
  leech: () => Z({ c: ['#7A2E4C', '#C45A82'], arm: ['#C45A82', '#E88AB0'], eye: '#FFE7A8', r: 28, eyeY: 12, eyeX: 9, eyeR: 3.2, spots: false, stitch: false, armW: 9, armL: [70, 62], armX: 15, cuff: false,
    front: circ(0, 15, 12.5, '#2A0E1A', 3) + teeth(12, 8.2, 12, 2.6) + circ(0, 15, 5, '#E0457A', 1.8) + [-1, 1].map(s => path(`M${s * 12} -14 q${s * 8} 8 ${s * 4} 20`, 'none', 2, '#E88AB0')).join('') + circ(-8, -8, 3, '#fff', 0, INK, 'opacity=".5"') }),
  // Grappler: a chain and a hook, thrown at a player to drag them in
  grappler: () => Z({ vb: '-70 -52 140 160', c: ['#7A5A3C', '#C9A27F'], arm: ['#C9A27F', '#E5C9A8'], eye: '#FF3B3B', r: 35, armL: [58, 66],
    back: [0, 1, 2, 3, 4].map(i => `<ellipse cx="${34 + i * 3}" cy="${80 + i * 11}" rx="4.2" ry="6" transform="rotate(${i % 2 ? 20 : -20} ${34 + i * 3} ${80 + i * 11})" fill="#9AA6B8" stroke="${INK}" stroke-width="2.2"/>`).join(''),
    front: rect(-30, 6, 60, 14, 5, '#6B4F36', 2.6) + circ(-14, 13, 2.2, '#C9D4E3', 1) + circ(14, 13, 2.2, '#C9D4E3', 1),
    top: path('M25 86 q0 -9 9 -9 q9 0 9 9 v8 l5 -6 l-3 13 l-12 -2 Z', '#C9D4E3', 3) + circ(34, 82, 2.4, '#0B0F1A') }),
  // Mimic: a chest of coins that looks like loot until you get close
  mimic: () => wrapZ(
    rect(-34, -26, 68, 56, 10, '#8A5A2B', 4) + rect(-31, -23, 62, 24, 8, '#B4793B', 0) + rect(-34, -4, 68, 5, 0, '#6B4220', 2.4) +
    rect(-26, -30, 8, 64, 2, '#C9D4E3', 2.4) + rect(18, -30, 8, 64, 2, '#C9D4E3', 2.4) + circ(0, -3, 6.2, '#C9D4E3', 2.4) + circ(0, -3, 2.6, '#FF3B3B', 1.2) +
    [[-14, -14], [8, -16], [-2, -10]].map(([x, y]) => circ(x, y, 5.6, '#FFC72E', 2) + circ(x, y, 2.8, 'none', 1.2, '#A87B10')).join('') +
    path('M-33 31 l5 11 l5 -9 l5 11 l5 -9 l5 11 l5 -9 l5 11 l5 -9 l5 11 l5 -9 l5 9', '#F4F1E4', 2.4) + circ(-12, 12, 3.8, '#FF3B3B', 1.6) + circ(12, 12, 3.8, '#FF3B3B', 1.6) + circ(-12.8, 11.2, 1.1, '#FFD0D0') + circ(11.2, 11.2, 1.1, '#FFD0D0') +
    `<g transform="translate(40 -30)">${circ(0, 0, 5.4, '#FFC72E', 2)}${circ(0, 0, 2.8, 'none', 1.2, '#A87B10')}</g>`, '-56 -46 112 112'),
  // Berserker: red, thick arms, a headband; it goes wild when it is hurt
  berserker: () => Z({ vb: '-70 -66 140 156', c: ['#9A3A2E', '#E0705B'], arm: ['#E0705B', '#F6A08E'], eye: '#FFB02E', r: 38, armW: 17, armX: 20, armL: [60, 66], cuff: false, cuffColor: '#F4F1E4',
    mid: path('M-38 -6 Q0 -22 38 -6 L38 4 Q0 -10 -38 4 Z', '#F4F1E4', 2.6) + circ(0, -9, 5, '#D9473A', 1.6) + path('M36 -3 l16 -6 l-6 8 l10 4 l-14 2 Z', '#F4F1E4', 2),
    top: [[-30, -42], [0, -50], [30, -42]].map(([x, y]) => `<g opacity=".8">${path(`M${x} ${y} q-4 -6 0 -10 q4 -4 2 -9`, 'none', 2.4, '#fff')}</g>`).join('') + [-16, 16].map(x => rect(x - 6, 52, 12, 5, 2, '#F4F1E4', 1.4)).join('') }),
  // Necromancer: a purple robe, a staff with a skull; it raises the dead
  necromancer: () => Z({ vb: '-70 -54 140 168', c: ['#5C7A70', '#B3D1C7'], arm: ['#4A2F78', '#7E57B8'], eye: '#7CFF7C', r: 32, armW: 14, cuffColor: '#2A1B48',
    back: path('M-42 -6 Q-36 -42 0 -44 Q36 -42 42 -6 L46 36 Q0 22 -46 36 Z', '#4A2F78', 4) + path('M-30 -6 Q-26 -32 0 -34 Q26 -32 30 -6', '#7E57B8', 0),
    mid: path('M-34 -4 Q-30 -34 0 -38 Q30 -34 34 -4 Q0 -14 -34 -4 Z', '#3A2460', 3), spots: false, stitch: false,
    front: '', top: line(34, 20, 36, 92, '#8A6A3C', 4.6) + line(34, 20, 36, 92, '#C9A06A', 2) + circ(36, 96, 9.6, '#E9F5E1', 3) + circ(32.4, 95, 2.8, '#1B1F2A') + circ(39.6, 95, 2.8, '#1B1F2A') + path('M34 101 l2 3 l2 -3', 'none', 1.6, INK) + circ(36, 96, 14, 'none', 2, '#7CFF7C', 'opacity=".55"') }),
  // Herald: a banner and a horn; the zombies round it hit harder and run faster
  herald: () => Z({ vb: '-70 -68 140 164', c: ['#9A7A2E', '#E3BC59'], arm: ['#E3BC59', '#F5DA8E'], eye: '#FF6B3B', r: 35,
    back: line(0, -22, 0, -62, '#8A6A3C', 4.6) + line(0, -22, 0, -62, '#C9A06A', 2) + path('M0 -62 L30 -56 Q20 -50 30 -42 L0 -46 Z', '#D9473A', 3) + circ(14, -52, 3.4, '#FFC72E', 1.4),
    front: path('M-34 -10 Q-18 -34 0 -26 Q18 -34 34 -10 L34 -2 Q18 -22 0 -14 Q-18 -22 -34 -2 Z', '#9AA6B8', 3) + [-24, 24].map(x => poly([[x - 8, -2], [x, -18], [x + 8, -2]], '#C9D4E3', 2.4)).join(''),
    top: path('M20 66 q16 -2 24 10 q4 8 -4 14 q-8 4 -14 -4 q-4 -6 -8 -4 Z', '#C79A3B', 3) + circ(40, 86, 6.4, '#F5DA8E', 2) }),
  // Ram: a log with an iron ram's head; it charges a wall in a straight line
  ram: () => Z({ c: ['#4A3626', '#8A6A4C'], arm: ['#8A6A4C', '#B4906E'], eye: '#FF3B3B', r: 37, armX: 24, armL: [48, 48], noHand: true, cuff: false,
    behind: rect(-14, 10, 28, 84, 9, '#8A5A2B', 4) + [30, 52, 74].map(y => rect(-16, y, 32, 7, 2, '#9AA6B8', 2.4)).join('') +
      path('M-18 92 Q-20 108 0 116 Q20 108 18 92 Z', '#9AA6B8', 3.4) + path('M-17 94 q-14 -6 -12 -20 q6 6 12 8 Z', '#C9D4E3', 3) + path('M17 94 q14 -6 12 -20 q-6 6 -12 8 Z', '#C9D4E3', 3),
    front: path('M-34 -10 Q0 -40 34 -10 L30 0 Q0 -26 -30 0 Z', '#9AA6B8', 3) + poly([[-34, -8], [-48, -22], [-40, 2]], '#C9D4E3', 2.4) + poly([[34, -8], [48, -22], [40, 2]], '#C9D4E3', 2.4) + circ(-24, 12, 7, '#8A6A4C', 3) + circ(24, 12, 7, '#8A6A4C', 3),
    vb: '-70 -60 140 180' }),
  // Leaper: lean and coiled, motion lines above; it jumps over the walls
  leaper: () => Z({ vb: '-70 -64 140 148', c: ['#6E8A1E', '#B5D23E'], arm: ['#B5D23E', '#D9EE82'], eye: '#FFF36B', r: 30, eyeY: 14, eyeR: 4.4, armW: 10, armX: 30, armL: [44, 44], stitch: false,
    back: `<ellipse cx="0" cy="-8" rx="46" ry="40" fill="#000" opacity=".16"/>` + [-18, 0, 18].map(x => path(`M${x} -40 q-4 -10 0 -20`, 'none', 3, '#fff', 'opacity=".55"')).join(''),
    mid: '', front: [-1, 1].map(s => path(`M${s * 20} 12 q${s * 18} -4 ${s * 26} 14 q${s * -8} -2 ${s * -14} 4`, '#6E8A1E', 2.6)).join(''),
    top: poly([[-16, 16], [-10, 22], [-16, 24]], '#fff', 1.6) + poly([[16, 16], [10, 22], [16, 24]], '#fff', 1.6) }),
  // Gargoyle: stone wings; it flies over the walls and the ground blasts do not reach it
  gargoyle: () => Z({ c: ['#5E6674', '#B3B9C5'], arm: ['#9AA2B0', '#C9CFDA'], eye: '#FF9F1C', r: 31, armW: 11, armL: [44, 44], armX: 15, cuff: false, stitch: false,
    back: [-1, 1].map(s => path(`M${s * 22} -6 Q${s * 52} -36 ${s * 74} -8 Q${s * 64} -4 ${s * 66} 12 Q${s * 54} 2 ${s * 48} 18 Q${s * 40} 6 ${s * 30} 16 Z`, '#7F8794', 3.6) + [0, 1, 2].map(i => line(s * 24, -4, s * (50 + i * 8), -22 + i * 18, INK, 1.8)).join('')).join(''),
    front: [-1, 1].map(s => poly([[s * 16, -26], [s * 28, -50], [s * 10, -34]], '#C9CFDA', 2.6)).join('') + path('M-6 -8 l5 8 l-3 6', 'none', 1.8, '#3E4452') }),
  // Slime: a blob that leaves a sticky trail behind it
  slime: () => Z({ vb: '-70 -78 140 160', c: ['#4E8F1E', '#9EDB5A'], arm: ['#9EDB5A', '#C9F08F'], eye: '#FFF36B', r: 33, armW: 10, armL: [50, 44], cuff: false, stitch: false, spot: '#6BB23A',
    back: [[-26, -50, 16], [8, -62, 22], [34, -46, 14], [-6, -42, 18], [-40, -34, 9], [44, -64, 8]].map(([x, y, r]) => circ(x, y, r, 'rgba(158,219,90,.55)', 2.2, '#4E8F1E')).join(''),
    front: [[-14, -14, 5], [16, -8, 3.4], [6, -22, 2.6]].map(([x, y, r]) => circ(x, y, r, 'rgba(255,255,255,.35)')).join('') + path('M-12 34 q-3 14 0 22 q3 -8 0 -22', '#9EDB5A', 2.2) + path('M14 34 q-3 10 0 16 q3 -6 0 -16', '#9EDB5A', 2.2) }),
  // Brood Mother: a bloated queen with egg sacs on her back; she lays eggs that must be broken
  brood: () => Z({ c: ['#5A3F6E', '#A27BB5'], arm: ['#A27BB5', '#C9A8DA'], eye: '#FFE75B', r: 56, vb: '-92 -98 184 206', eyeY: 22, eyeX: 20, eyeR: 6, armW: 18, armX: 38, armL: [50, 54], cuff: false, rim: 7, stitch: false, spot: '#7E5A92',
    back: [[-58, -28], [-62, 8], [58, -32], [62, 6], [-30, -66], [32, -68]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="17" ry="21" fill="#F4E8B0" stroke="${INK}" stroke-width="3.6"/><circle cx="${x - 4}" cy="${y - 5}" r="3.6" fill="#E3D07A"/><circle cx="${x + 5}" cy="${y + 6}" r="2.6" fill="#E3D07A"/>`).join(''),
    front: [-1, 1].map(s => path(`M${s * 12} 40 q${s * 10} 16 ${s * 22} 8 q${s * -6} -8 ${s * -10} -14`, '#F4F1E4', 2.8)).join('') + [[-24, -18, 6], [24, -18, 6], [-10, -32, 4.6], [10, -32, 4.6]].map(([x, y, r]) => circ(x, y, r, '#FFE75B', 2) + circ(x, y, 2, INK)).join('') +
      poly([[-14, -52], [0, -70], [14, -52]], '#C9A8DA', 3) + poly([[-34, -46], [-30, -66], [-18, -50]], '#C9A8DA', 3) + poly([[34, -46], [30, -66], [18, -50]], '#C9A8DA', 3) }),
  // Colossus: a giant of stone and lava; every step crushes what is in its way
  colossus: () => Z({ c: ['#4A4438', '#8C8472'], arm: ['#6E6652', '#A39B86'], eye: '#FF7A1F', r: 52, vb: '-96 -78 192 214', eyeY: 22, eyeX: 20, eyeR: 7, armW: 26, armX: 46, armL: [58, 64], cuff: false, noHand: true, rim: 7, stitch: false, spots: false,
    mid: [[-30, -20, -12, -4], [8, -34, 16, -14], [-6, 6, 10, 24], [24, 10, 34, 30], [-36, 12, -26, 28]].map(([a, b, c, d]) => path(`M${a} ${b} L${c} ${d}`, 'none', 4.4, '#FF7A1F')).join('') + [[-30, -20, -12, -4], [8, -34, 16, -14]].map(([a, b, c, d]) => line(a, b, c, d, '#FFD34D', 1.6)).join(''),
    behind: [-1, 1].map(s => poly(Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4 + 0.3, r = 26 + (i % 2) * 5; return [s * 46 + r * Math.cos(a), 6 + (s < 0 ? 58 : 64) + 10 + r * Math.sin(a)]; }), '#8C8472', 4.2) + circ(s * 46, 6 + (s < 0 ? 58 : 64) + 10, 8, '#FF7A1F', 2.6)).join(''),
    front: [[-40, -34], [-14, -50], [14, -50], [40, -34]].map(([x, y], i) => poly([[x - 12, y + 6], [x, y - 14 - (i % 2) * 6], [x + 12, y + 6]], '#6E6652', 3.4)).join('') }),
};
module.exports = SP;
if (require.main === module) {
  const fs = require('fs'), names = Object.keys(SP);
  fs.writeFileSync('zsheet.html', `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(5,200px);gap:10px;padding:10px;width:1060px">${names.map(k => `<div><div style="font:700 12px sans-serif;color:#fff">${k}</div><div style="width:200px;height:200px;background:repeating-linear-gradient(90deg,#4E8F43 0 48px,#468439 48px 96px);display:grid;place-items:center">${SP[k]().replace('<svg ', '<svg width="190" height="190" ')}</div></div>`).join('')}</body>`);
}

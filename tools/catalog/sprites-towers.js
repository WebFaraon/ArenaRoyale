// Top-down toy-block sprites for the new tower ideas: same grammar as the game's own (soft shadow, dark base disc with a lighter face, ink outline 3.8,
// an inner ring, six bolts, a highlight arc), one centrepiece per tower that grows over the three levels.
const INK = '#0B0F1A';
const r1 = n => Math.round(n * 10) / 10;
const P = (x, y) => `${r1(x)},${r1(y)}`;
const wrap = inner => `<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const shadow = (rx = 33, ry = 31) => `<g opacity=".22"><ellipse cx="7" cy="10" rx="${rx}" ry="${ry}" fill="#000"/></g>`;
function base(dark, light, mid, o = {}) {
  const bolts = [0, 60, 120, 180, 240, 300].map(a => `<circle cx="${r1(25.2 * Math.cos(a * Math.PI / 180))}" cy="${r1(25.2 * Math.sin(a * Math.PI / 180))}" r="2.1" fill="#C9D4E3" stroke="${INK}" stroke-width="1.3"/>`).join('');
  return shadow() + `<circle r="31" fill="${dark}"/><circle cx="-2.4" cy="-2.8" r="28.6" fill="${light}"/><circle r="31" fill="none" stroke="${INK}" stroke-width="3.8"/>` +
    (o.noInner ? '' : `<circle r="20" fill="${dark}" stroke="${INK}" stroke-width="2.6"/><circle cx="-1.2" cy="-1.4" r="17.4" fill="${mid}"/>`) + bolts +
    `<path d="M-26 -8 A27 27 0 0 1 -8 -26" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>`;
}
const circ = (x, y, r, fill, sw = 0, stroke = INK, extra = '') => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}"` : ''} ${extra}/>`;
const rect = (x, y, w, h, rx, fill, sw = 2, stroke = INK) => `<rect x="${r1(x)}" y="${r1(y)}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const poly = (pts, fill, sw = 2, stroke = INK) => `<polygon points="${pts.map(p => P(p[0], p[1])).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const gearPts = (teeth, ro, ri, rot = 0) => { const out = []; for (let i = 0; i < teeth; i++) { const a = rot + i * 2 * Math.PI / teeth, w = Math.PI / teeth * 0.5; [[a - w, ri], [a - w * 0.55, ro], [a + w * 0.55, ro], [a + w, ri]].forEach(([t, r]) => out.push([r * Math.cos(t), r * Math.sin(t)])); } return out; };
const rot = (deg, inner) => `<g transform="rotate(${deg})">${inner}</g>`;

const S = {
  // Gravity Well: a dark whirl that drags the horde to one spot
  gravity: n => wrap(base('#2E2257', '#6A4FB0', '#41307A') + circ(0, 0, 14.5, '#150B2E', 2.8) +
    [0, 120, 240].map(a => rot(a, `<path d="M0 -3.2 C 6 -3.2 12 -6.5 11 -12.5" fill="none" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M0 -3.2 C 6 -3.2 12 -6.5 11 -12.5" fill="none" stroke="#C9A8FF" stroke-width="2.2" stroke-linecap="round"/>`)).join('') +
    circ(0, 0, 3.6, '#F1E6FF', 1.6) + (n >= 2 ? [30, 150, 270].map(a => circ(21 * Math.cos(a * Math.PI / 180), 21 * Math.sin(a * Math.PI / 180), 2.8, '#B994FF', 1.4)).join('') : '') +
    (n >= 3 ? `<circle r="26.4" fill="none" stroke="#D9C4FF" stroke-width="1.6" stroke-dasharray="2 4" opacity=".8"/>` : '')),
  // Thumper: a piston plate and shock chevrons going out
  thumper: n => wrap(base('#5A4524', '#B8924F', '#7A5F33') + rect(-12, -12, 24, 24, 5, '#8A8F99', 3) + rect(-7, -7, 14, 14, 3, '#FF9F1C', 2) + circ(0, 0, 2.2, '#FFF3C4', 1.2) +
    [0, 90, 180, 270].map(a => rot(a, Array.from({ length: n }, (_, i) => poly([[-4.6, -15.5 - 4.4 * i], [0, -21.5 - 4.4 * i], [4.6, -15.5 - 4.4 * i]], i === n - 1 ? '#FFD34D' : '#FFB02E', 1.7)).join(''))).join('')),
  // Warp Gate: a portal ring, with the twin gates showing up as more levels
  warp: n => wrap(base('#4D1A47', '#B04BA3', '#722D69') + circ(0, 0, 14, '#1A0818', 3) + `<circle r="10.8" fill="none" stroke="#FF8CF0" stroke-width="3"/>` +
    `<path d="M0 0 m-1 0 a1 1 0 1 1 2 0 a3 3 0 1 1 -6 0 a5.4 5.4 0 1 1 10.8 0" fill="none" stroke="#FFD1FA" stroke-width="1.8" stroke-linecap="round"/>` + circ(-5, -4, 1, '#fff') + circ(5, 5, 1, '#fff') +
    (n >= 2 ? [200, 340].map(a => circ(22 * Math.cos(a * Math.PI / 180), 22 * Math.sin(a * Math.PI / 180) + 2, 3.8, '#1A0818', 1.6, '#FF8CF0')).join('') : '') +
    (n >= 3 ? Array.from({ length: 8 }, (_, i) => rot(i * 45, `<line x1="0" y1="-16.6" x2="0" y2="-19.4" stroke="#FFD1FA" stroke-width="1.8" stroke-linecap="round"/>`)).join('') : '')),
  // Railgun: a long twin rail with glowing coils, pointing down like the machine gun head
  rail: n => { const L = 26 + n * 5; return wrap(base('#323B49', '#7A8699', '#4E5A6C') +
    rect(-5.8, 4, 3.4, L, 1.5, '#B9C6D6', 2.2) + rect(2.4, 4, 3.4, L, 1.5, '#B9C6D6', 2.2) +
    Array.from({ length: n + 1 }, (_, i) => rect(-8.4, 10 + i * ((L - 10) / (n + 1)), 16.8, 3.2, 1.5, '#2FD5F5', 1.4)).join('') +
    circ(0, 4 + L + 1.5, 2.6, '#BFF6FF', 1.4) + rect(-10.5, -10.5, 21, 21, 6, '#4E5A6C', 3.2) + circ(0, 0, 4, '#2FD5F5', 1.8) + circ(-1, -1.2, 1.4, '#fff')); },
  // Pylon Fence: two hazard pylons and the laser between them
  pylon: n => { const beams = Array.from({ length: n }, (_, i) => { const y = (i - (n - 1) / 2) * 6.4; const d = `M-15 ${y} L-9 ${r1(y - 3)} L-3 ${r1(y + 3)} L3 ${r1(y - 3)} L9 ${r1(y + 3)} L15 ${y}`; return `<path d="${d}" fill="none" stroke="rgba(255,75,92,.35)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#FF4B5C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`; }).join('');
    const pyl = x => `<g transform="translate(${x} 0)"><g opacity=".22"><ellipse cx="4" cy="6" rx="14" ry="13" fill="#000"/></g>${circ(0, 0, 13, '#E8C21F', 3.2)}<circle r="13" fill="none" stroke="${INK}" stroke-width="3.2" stroke-dasharray="4 4" opacity=".55"/>${circ(0, 0, 8, '#2A2D33', 2.2)}${circ(0, 0, 3.4, '#FF4B5C', 1.4)}${circ(-1, -1.2, 1.1, '#fff')}</g>`;
    return wrap(`<g transform="scale(1.14)">${pyl(-29) + pyl(29) + beams}</g>`); },
  // Overclock Core: a gear that spins up the turrets near it
  overclock: n => wrap(base('#12474B', '#31B7B0', '#1E6F72') + poly(gearPts(8, 15.5, 11.8), '#D7FF4A', 2.4) + circ(0, 0, 6, '#1E3A3A', 2.2) +
    (n >= 3 ? poly([[1.6, -4.6], [-2.8, 0.8], [0.2, 0.8], [-1.6, 4.8], [3, -1], [0, -1]], '#EFFFA8', 1.2) : circ(0, 0, 2.4, '#EFFFA8')) +
    (n >= 2 ? [45, 135, 225, 315].map(a => rot(a, `<path d="M0 -18.5 l2.4 -3.4 l-1 0 l1.6 -3.2" fill="none" stroke="#EFFFA8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)).join('') : '')),
  // War Banner: a flag seen from above, one more star for every level
  banner: n => { const stars = Array.from({ length: n }, (_, i) => circ(2 + i * 5.6 - (n - 1) * 2.8 + 3, -1.5 + (i % 2 ? 1.6 : 0), 1.9, '#D9473A', 1)).join('');
    return wrap(base('#5B1823', '#C23B4D', '#7E2231') + `<g transform="translate(-4 0) scale(1.22)"><path d="M-6 -11 C 2 -15, 8 -7, 18 -11 L18 9 C 8 5, 2 13, -6 9 Z" fill="#F5F0E1" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` + `<path d="M-6 -11 C 2 -15, 8 -7, 18 -11 L18 -6 C 8 -2, 2 -10, -6 -6 Z" fill="#D9473A" opacity=".85"/>` + stars + circ(-9, -1, 4.2, '#C9D4E3', 2) + circ(-9, -1, 1.5, '#0B0F1A') + `</g>`); },
  // Shield Dome: a glass dome with a lattice over a small emitter
  dome: n => wrap(base('#154348', '#59C4CC', '#27777E') +
    `<circle r="27.6" fill="rgba(190,255,255,.22)" stroke="#E6FFFF" stroke-width="1.8" opacity=".9"/>` + (n >= 2 ? `<circle r="20.4" fill="none" stroke="#E6FFFF" stroke-width="1.4" stroke-dasharray="3 3" opacity=".85"/>` : '') +
    (n >= 3 ? Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 + Math.PI / 6, cx = 15 * Math.cos(a), cy = 15 * Math.sin(a); return poly(Array.from({ length: 6 }, (_, k) => [cx + 6 * Math.cos(k * Math.PI / 3), cy + 6 * Math.sin(k * Math.PI / 3)]), 'rgba(255,255,255,.12)', 1.1, 'rgba(230,255,255,.8)'); }).join('') : '') +
    poly(Array.from({ length: 8 }, (_, k) => [8 * Math.cos(k * Math.PI / 4 + Math.PI / 8), 8 * Math.sin(k * Math.PI / 4 + Math.PI / 8)]), '#0E2A2E', 2.6) + circ(0, 0, 3.4, '#BFFCFF', 1.2) + `<path d="M-19 -13 A23 23 0 0 1 -9 -21" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>`),
  // Mint: a stack of coins, one more for every level
  mint: n => { const coin = (x, y, k) => `${circ(x, y, 10, '#FFC72E', 2.6)}<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#A87B10" stroke-width="2"/>${circ(x - 2.6, y - 3, 1.6, '#FFF3C4')}`;
    return wrap(base('#1D4E34', '#3FA86A', '#2A7A48') + Array.from({ length: n }, (_, i) => coin(r1((n - 1 - i) * 4 - 2 * (n - 1) / 1 + 2), r1((n - 1 - i) * 3.4 - 1.7 * (n - 1) + 1), i)).join('') +
      (n >= 2 ? poly([[17, -16], [18.6, -12], [22.6, -10.4], [18.6, -8.8], [17, -4.8], [15.4, -8.8], [11.4, -10.4], [15.4, -12]], '#FFF3C4', 1.2) : '')); },
  // Revival Altar: a glowing pad with wings, for the ones who fell
  altar: n => { const wing = s => Array.from({ length: n }, (_, i) => `<path d="M${s * 4} ${2 - i * 2.4} C ${s * 14} ${-3 - i * 4}, ${s * 19} ${-11 - i * 4}, ${s * 21} ${-16 - i * 3.4} C ${s * 13} ${-14 - i * 3.6}, ${s * 9} ${-10 - i * 3}, ${s * 4} ${-6 - i * 2.4} Z" fill="${i === 0 ? '#fff' : '#E9E4FA'}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`).reverse().join('');
    return wrap(base('#524B6E', '#E4DEF5', '#B3ABD0') + circ(0, 2, 13, '#8E86B3', 2.6) + wing(-1) + wing(1) + `<circle cx="0" cy="2" r="9.4" fill="none" stroke="#FFE79A" stroke-width="2.8"/>` + circ(0, 2, 4.2, '#FFE79A', 1.8) + circ(-1, 0.8, 1.4, '#fff') + [45, 135, 225, 315].map(a => circ(18.5 * Math.cos(a * Math.PI / 180), 2 + 18.5 * Math.sin(a * Math.PI / 180), 1.6, '#FFE79A', 1)).join('')); },
  // Heavy Mount: a seat and a gun the player takes over; one more barrel per level
  mount: n => { const xs = n === 1 ? [0] : n === 2 ? [-3.8, 3.8] : [-6.8, 0, 6.8];
    return wrap(base('#2B2F36', '#5E6674', '#3F4550') + `<circle r="24.5" fill="none" stroke="#FF7A1F" stroke-width="2" stroke-dasharray="6 4"/>` +
      xs.map(x => rect(x - 1.9, 6, 3.8, 24 + n * 2, 1.5, '#8E9AB0', 2.2) + circ(x, 30 + n * 2, 1.7, '#FF9F1C', 1)).join('') +
      rect(-10, -13, 20, 17, 6, '#3F4550', 3.2) + circ(0, -4.4, 5.4, '#8E9AB0', 2) + rect(11, -5, 9, 12, 2, '#FF7A1F', 2) + circ(-12.5, 4, 2.4, '#C9D4E3', 1.4) + circ(12.5, 4 + 6, 0.01, 'none')); },
  // Saw Ring: blades spinning round a hub; one more blade per level
  saw: n => { const N = n + 2; return wrap(base('#323640', '#6A7080', '#444A58') + Array.from({ length: N }, (_, i) => { const a = i * 2 * Math.PI / N - Math.PI / 2, x = 20.5 * Math.cos(a), y = 20.5 * Math.sin(a);
      return `<line x1="0" y1="0" x2="${r1(x)}" y2="${r1(y)}" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><line x1="0" y1="0" x2="${r1(x)}" y2="${r1(y)}" stroke="#9AA6B8" stroke-width="2" stroke-linecap="round"/><g transform="translate(${r1(x)} ${r1(y)})">${poly(gearPts(9, 8.6, 6.1, i), '#E8EEF5', 1.8)}${circ(0, 0, 2.2, '#FF7A1F', 1.2)}</g>`; }).join('') +
    poly(Array.from({ length: 6 }, (_, k) => [7 * Math.cos(k * Math.PI / 3), 7 * Math.sin(k * Math.PI / 3)]), '#8E9AB0', 2.4) + circ(0, 0, 2.6, '#FF9F1C', 1.4)); },
};
module.exports = S;
if (require.main === module) {
  const fs = require('fs');
  const names = Object.keys(S);
  const cells = names.map(k => `<div style="display:flex;flex-direction:column;gap:4px"><div style="font:700 12px sans-serif;color:#fff">${k}</div><div style="display:flex;gap:6px">${[1, 2, 3].map(n => `<div style="width:150px;height:150px;background:repeating-linear-gradient(90deg,#4E8F43 0 48px,#468439 48px 96px);display:grid;place-items:center">${S[k](n).replace('<svg ', '<svg width="130" height="130" ')}</div>`).join('')}</div></div>`).join('');
  fs.writeFileSync('sheet.html', `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(2,auto);gap:14px;padding:14px;width:1000px">${cells}</body>`);
}

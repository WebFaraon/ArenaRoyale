// The "Generator" map object (a portable power generator), drawn in the grammar of the "Obiecte Arena" sheet: seen from above, ink outline #0B0F1A (thick: it is a big object),
// three tones per piece (a dark base, the main tone shifted up-left, a light edge), a white sheen up-left and a soft shadow down-right. It is a machine, so it has one version
// for all seasons (unlike trees and rocks).
//
//   node tools/catalog/sprites-generator.js     writes public/images/map/generator.svg and the preview sheet tools/catalog/gsheet.html (git-ignored)
//
// Not loaded by the game yet. To place it on the map the usual way: one entry in public/data/map-objects.json (`visualRadius` ~ 52, frame = viewBox / 2), a solid circle for
// collisions of about that size and random positions chosen like the trees and rocks.
const INK = '#0B0F1A';
const r1 = n => Math.round(n * 10) / 10;
const circ = (x, y, r, fill, sw = 0, extra = '') => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''} ${extra}/>`;
const rect = (x, y, w, h, rx, fill, sw = 0, extra = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''} ${extra}/>`;
const poly = (pts, fill, sw = 0, extra = '') => `<polygon points="${pts.map(p => r1(p[0]) + ',' + r1(p[1])).join(' ')}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : ''} ${extra}/>`;
const path = (d, fill, sw = 0, stroke = INK, extra = '') => `<path d="${d}" fill="${fill}"${sw ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : ''} ${extra}/>`;
const ell = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${fill}" ${extra}/>`;
const bolt = (x, y, r = 2.2) => circ(x, y, r, '#C9D4E3', 1.3) + circ(x - r * 0.3, y - r * 0.3, r * 0.35, '#fff', 0, 'opacity=".8"');

function generator() {
  const Y = '#F2B31C', YD = '#B8770A', YL = '#FFD866', ST = '#8A93AB', STD = '#5C6678', STL = '#C9D4E3', RED = '#E5384B', REDD = '#B01F31', GRN = '#3FD17A', PL = '#2A2F3C', PL2 = '#3B4256';
  const W = 86, H = 60, hw = W / 2, hh = H / 2;

  // soft shadow down-right (the same direction for every object of the map)
  const shadow = `<g opacity=".2">${rect(-hw + 8, -hh + 11, W, H, 12, '#000')}</g>`;

  // rubber feet peeking out of the four corners of the frame
  const feet = [[-hw + 2, -hh + 1], [hw - 14, -hh + 1], [-hw + 2, hh - 9], [hw - 14, hh - 9]].map(([x, y]) => rect(x, y, 12, 8, 3, '#2E3442', 2.6)).join('');

  // the roll cage: a steel tube round the machine (ink, steel, a light line on the up-left part)
  const cage = rect(-hw, -hh, W, H, 13, 'none', 9) + rect(-hw, -hh, W, H, 13, 'none', 0, `stroke="${ST}" stroke-width="5"`) +
    path(`M${-hw - 1} ${hh - 14} V${-hh + 13} Q${-hw - 1} ${-hh - 1} ${-hw + 13} ${-hh - 1} H${hw - 16}`, 'none', 1.8, STL, 'opacity=".95"');

  // a dark base plate under the housing (no grass shows through the cage)
  const base = rect(-hw + 2, -hh + 2, W - 4, H - 4, 11, '#2E3442');

  // the housing: dark yellow base, the main tone moved up-left, an edge of light, then the ink outline
  const bw = 74, bh = 48, bx = -bw / 2, by = -bh / 2;
  const housing = rect(bx, by, bw, bh, 8, YD) + rect(bx + 0.5, by + 0.5, bw - 4.4, bh - 4.4, 6.5, Y) + rect(bx + 3, by + 2.6, bw - 18, 4.6, 2.3, YL, 0, 'opacity=".75"') + rect(bx, by, bw, bh, 8, 'none', 3.8);

  // the fan grille on the left: a dark well, six blades, a hub and a grille ring
  const fx = -20, fy = 1, fr = 15.5;
  const blades = Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 - 0.3; const p = (rr, da) => [fx + rr * Math.cos(a + da), fy + rr * Math.sin(a + da)]; const [x0, y0] = p(2.6, 0), [x1, y1] = p(12.4, -0.34), [x2, y2] = p(12.4, 0.46); return poly([[x0, y0], [x1, y1], [x2, y2]], STL, 1.5); }).join('');
  const fan = circ(fx, fy, fr + 3, STD, 3.4) + circ(fx - 1.2, fy - 1.4, fr + 1.2, ST) + circ(fx, fy, fr - 1.4, '#1B2030') + blades + circ(fx, fy, 4.2, ST, 2.2) + circ(fx - 1, fy - 1, 1.5, '#fff', 0, 'opacity=".8"') +
    circ(fx, fy, fr - 2.4, 'none', 0, `stroke="${STL}" stroke-width="1.6" opacity=".9"`) + circ(fx, fy, fr + 3, 'none', 3.4);

  // the badge on the right: a dark plate with a lightning bolt
  const badge = rect(0, -19, 26, 16, 4, PL, 2.8) + rect(1, -18, 24, 14, 3, PL2) +
    poly([[14.6, -17], [7.4, -9.6], [12.4, -9.6], [10, -4.2], [18.6, -11.6], [13.6, -11.6], [17, -17]], '#FFE14D', 1.7);

  // the control panel: a gauge, two buttons and a green LED
  const panel = rect(-3, 3, 44, 19, 4, PL, 2.8) + rect(-2, 4, 42, 17, 3, PL2) +
    circ(7, 12.5, 7, '#E9EFF6', 2.4) + path('M7 12.5 L11 8.6', 'none', 1.9, RED) + circ(7, 12.5, 1.4, INK) +
    circ(21, 8.6, 3.4, RED, 1.6) + circ(21, 17, 3.4, STL, 1.6) + circ(33, 12.8, 3.2, GRN, 1.5) + circ(33, 12.8, 6.4, GRN, 0, 'opacity=".28"');

  // the fuel cap (red, with a notch) on the top right and the exhaust pipe sticking out of the top edge over the fan
  const fuel = circ(32, -13, 6.4, REDD, 2.8) + circ(31.2, -13.8, 4.9, RED) + path('M28.6 -13 H35.4', 'none', 0, INK, 'stroke-width="1.6"') + circ(29.4, -15.6, 1.2, '#fff', 0, 'opacity=".7"');
  const pipe = rect(-25, -hh - 6, 10, 12, 3, STD, 2.8) + rect(-24.4, -hh - 5.4, 7, 10, 2.5, ST) + ell(-20, -hh - 5, 3.6, 1.8, '#1B2030') + ell(-20, -hh - 5, 3.6, 1.8, 'none', `stroke="${INK}" stroke-width="1.5"`);

  // the pull-start grip on the right edge: a red handle on a short rope
  const grip = path(`M${hw - 2} -4 Q${hw + 5} -4 ${hw + 6} 3`, 'none', 2.8, INK) + path(`M${hw - 2} -4 Q${hw + 5} -4 ${hw + 6} 3`, 'none', 1.2, '#D9C29A') + rect(hw + 1, 2, 9, 5.4, 2.4, RED, 2.4) + rect(hw + 2.4, 3, 5, 1.5, 0.8, '#fff', 0, 'opacity=".5"');

  const bolts = [[-hw + 6, -hh + 6], [hw - 6, -hh + 6], [-hw + 6, hh - 6], [hw - 6, hh - 6]].map(([x, y]) => bolt(x, y)).join('');
  const sheen = ell(-32, -19, 9, 3.2, '#fff', 'transform="rotate(-30 -32 -19)" opacity=".45"');

  return shadow + feet + base + cage + housing + fan + badge + panel + fuel + pipe + grip + bolts + sheen;
}

const VIEW = '-56 -48 112 96'; // frame radius ~56 around the pivot (the centre of the image = the position in the world)
const svg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" width="336" height="288">${generator()}</svg>`;

module.exports = { generator, svg, VIEW };

if (require.main === module) {
  const fs = require('fs'), path_ = require('path');
  const out = path_.join(__dirname, '..', '..', 'public', 'images', 'map');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path_.join(out, 'generator.svg'), svg());
  // a preview sheet: the sprite large, and on grass next to a player (body radius 36, to scale) and a medium rock-sized reference circle
  const player = (x, y) => `<g transform="translate(${x} ${y}) scale(.85)">${[-26.3, 26.3].map(hx => `<circle cx="${hx}" cy="39" r="9.4" fill="#2F6BFF" stroke="${INK}" stroke-width="3.2"/>`).join('')}<circle cx="0" cy="0" r="36" fill="#1B3FB0"/><circle cx="-3.3" cy="-3.6" r="34" fill="#2F6BFF"/><circle cx="0" cy="0" r="36" fill="none" stroke="${INK}" stroke-width="5"/></g>`;
  const stage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200" width="780" height="300"><rect width="520" height="200" fill="#58993F"/>${[0, 120, 240, 360, 480].map(x => `<rect x="${x + 60}" width="60" height="200" fill="#529439"/>`).join('')}<g transform="translate(150 100)">${generator()}</g>${player(300, 110)}<g transform="translate(420 100) scale(.9)">${generator()}</g></svg>`;
  fs.writeFileSync(path_.join(__dirname, 'gsheet.html'), `<body style="margin:0;background:#111;padding:12px;display:flex;gap:16px;align-items:flex-start"><div style="background:#58993F">${svg()}</div>${stage}</body>`);
  console.log('wrote public/images/map/generator.svg');
}

// The three first zombies of the game (the normal one, the runner and the tank) as separate pieces, to animate them: both arms and the head. Their pictures are exactly the
// ones the game had (public/images/zombies/zombi.svg, zombi_rapid.svg, zombi_tanc.svg), cut where the arms end and the head begins: each piece has the viewBox of its whole picture,
// and stacked in order (back to front: armL, armR, head) they are exactly that picture, which this file writes again (so they cannot drift apart; a test checks it).
// The arms start under the head (the shoulder), so when an arm is turned or stretched about its shoulder the join never shows.
//
//   node tools/catalog/sprites-basezombies.js     writes public/images/zombies/{normal,runner,tank}/{armL,armR,head}.svg + parts.json, and zombi.svg, zombi_rapid.svg, zombi_tanc.svg
//
// In the game (public/arena-art.js, drawBasicSprite) a zombie is `r` units across (20, 16, 28): `disc` of the picture (38.5, 29.95, 49.2) = r.
const svg = (vb, inner) => { const [x, y, w, h] = vb.split(' ').map(Number); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w * 2}" height="${h * 2}">${inner}</svg>`; };

const ORDER = ['armL', 'armR', 'head'];
const ZOMBIES = {
  normal: {
    file: 'zombi', vb: '-70 -52.5 140 140',
    pivots: { armL: { x: -17, y: 8, note: 'left shoulder (under the head)' }, armR: { x: 17, y: 8, note: 'right shoulder' }, head: { x: 0, y: 0, note: 'centre of the head' } },
    armL: [
      "<rect x=\"-23\" y=\"6\" width=\"12\" height=\"64\" rx=\"6\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"3.4\"/>",
      "<rect x=\"-21.6\" y=\"8\" width=\"5.04\" height=\"58\" rx=\"2.4000000000000004\" fill=\"#A9D873\" opacity=\".7\"/>",
      "<path d=\"M-23 6 h12 v14 l-3 -4 l-3 5 l-3 -5 l-3 4 Z\" fill=\"#5C6B80\" stroke=\"#0B0F1A\" stroke-width=\"2.6\" stroke-linejoin=\"round\"/>",
      "<circle cx=\"-17.0\" cy=\"70.0\" r=\"8.6\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"3.2\"/>",
      "<circle cx=\"-18.4\" cy=\"68.3\" r=\"5.8\" fill=\"#A9D873\"/>",
      "<circle cx=\"-21.6\" cy=\"77.4\" r=\"2.4\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
      "<circle cx=\"-17.0\" cy=\"77.4\" r=\"2.4\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
      "<circle cx=\"-12.4\" cy=\"77.4\" r=\"2.4\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    ].join(''),
    armR: [
      "<rect x=\"11\" y=\"6\" width=\"12\" height=\"70\" rx=\"6\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"3.4\"/>",
      "<rect x=\"12.4\" y=\"8\" width=\"5.04\" height=\"64\" rx=\"2.4000000000000004\" fill=\"#A9D873\" opacity=\".7\"/>",
      "<path d=\"M11 6 h12 v14 l-3 -4 l-3 5 l-3 -5 l-3 4 Z\" fill=\"#5C6B80\" stroke=\"#0B0F1A\" stroke-width=\"2.6\" stroke-linejoin=\"round\"/>",
      "<circle cx=\"17.0\" cy=\"76.0\" r=\"8.6\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"3.2\"/>",
      "<circle cx=\"15.6\" cy=\"74.3\" r=\"5.8\" fill=\"#A9D873\"/>",
      "<circle cx=\"12.4\" cy=\"83.4\" r=\"2.4\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
      "<circle cx=\"17.0\" cy=\"83.4\" r=\"2.4\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
      "<circle cx=\"21.6\" cy=\"83.4\" r=\"2.4\" fill=\"#7FB24F\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    ].join(''),
    head: [
      "<circle cx=\"0.0\" cy=\"0.0\" r=\"36.0\" fill=\"#4F7A3A\"/>",
      "<circle cx=\"-3.2\" cy=\"-3.6\" r=\"33.8\" fill=\"#7FB24F\"/>",
      "<ellipse cx=\"12\" cy=\"-12\" rx=\"8\" ry=\"6\" fill=\"#5F8F3E\" opacity=\".8\"/>",
      "<ellipse cx=\"-14\" cy=\"8\" rx=\"5\" ry=\"4\" fill=\"#5F8F3E\" opacity=\".8\"/>",
      "<path d=\"M-12 -30 q4 -6 8 0 q4 -6 8 0 q3 6 -2 9 q-5 3 -10 0 q-6 -3 -4 -9z\" fill=\"#E88AA0\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
      "<path d=\"M-8 -27 q3 2 5 0 q3 2 5 0\" fill=\"none\" stroke=\"#B5566E\" stroke-width=\"1.4\" stroke-linecap=\"round\"/>",
      "<line x1=\"-24\" y1=\"-4\" x2=\"-10\" y2=\"14\" stroke=\"#0B0F1A\" stroke-width=\"1.8\" stroke-linecap=\"round\"/>",
      "<line x1=\"-23.1\" y1=\"-2.5\" x2=\"-17.9\" y2=\"3.5\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<line x1=\"-19.6\" y1=\"2\" x2=\"-14.4\" y2=\"8\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<line x1=\"-16.1\" y1=\"6.5\" x2=\"-10.9\" y2=\"12.5\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<ellipse cx=\"-12.959999999999999\" cy=\"-16.919999999999998\" rx=\"8.280000000000001\" ry=\"3.6\" transform=\"rotate(-35 -12.959999999999999 -16.919999999999998)\" fill=\"#fff\" opacity=\".35\"/>",
      "<circle cx=\"0.0\" cy=\"0.0\" r=\"36.0\" fill=\"none\" stroke=\"#0B0F1A\" stroke-width=\"5.0\"/>",
      "<circle cx=\"-10.8\" cy=\"18.0\" r=\"6.1\" fill=\"#FF3B3B\" opacity=\".35\"/>",
      "<circle cx=\"-10.8\" cy=\"18.0\" r=\"4.0\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
      "<circle cx=\"-11.5\" cy=\"17.3\" r=\"1.1\" fill=\"#FFD0D0\"/>",
      "<circle cx=\"10.8\" cy=\"18.0\" r=\"6.1\" fill=\"#FF3B3B\" opacity=\".35\"/>",
      "<circle cx=\"10.8\" cy=\"18.0\" r=\"4.0\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
      "<circle cx=\"10.1\" cy=\"17.3\" r=\"1.1\" fill=\"#FFD0D0\"/>",
    ].join(''),
  },
  runner: {
    file: 'zombi_rapid', vb: '-60 -45 120 120',
    pivots: { armL: { x: -13, y: 7, note: 'left shoulder (under the head)' }, armR: { x: 13, y: 7, note: 'right shoulder' }, head: { x: 0, y: 0, note: 'centre of the head' } },
    armL: [
      "<rect x=\"-17.5\" y=\"5.1\" width=\"9\" height=\"58\" rx=\"4.5\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"2.8899999999999997\"/>",
      "<rect x=\"-16.31\" y=\"6.8\" width=\"3.78\" height=\"52.9\" rx=\"1.8\" fill=\"#D7E77A\" opacity=\".7\"/>",
      "<circle cx=\"-13.0\" cy=\"63.1\" r=\"6.5\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"2.72\"/>",
      "<circle cx=\"-14.1\" cy=\"61.8\" r=\"4.3\" fill=\"#D7E77A\"/>",
      "<circle cx=\"-16.4\" cy=\"68.7\" r=\"1.8\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"1.7\"/>",
      "<circle cx=\"-13.0\" cy=\"68.7\" r=\"1.8\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"1.7\"/>",
      "<circle cx=\"-9.6\" cy=\"68.7\" r=\"1.8\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"1.7\"/>",
    ].join(''),
    armR: [
      "<rect x=\"8.5\" y=\"5.1\" width=\"9\" height=\"52\" rx=\"4.5\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"2.8899999999999997\"/>",
      "<rect x=\"9.69\" y=\"6.8\" width=\"3.78\" height=\"46.9\" rx=\"1.8\" fill=\"#D7E77A\" opacity=\".7\"/>",
      "<circle cx=\"13.0\" cy=\"57.1\" r=\"6.5\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"2.72\"/>",
      "<circle cx=\"11.9\" cy=\"55.8\" r=\"4.3\" fill=\"#D7E77A\"/>",
      "<circle cx=\"9.6\" cy=\"62.7\" r=\"1.8\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"1.7\"/>",
      "<circle cx=\"13.0\" cy=\"62.7\" r=\"1.8\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"1.7\"/>",
      "<circle cx=\"16.4\" cy=\"62.7\" r=\"1.8\" fill=\"#B0C94A\" stroke=\"#0B0F1A\" stroke-width=\"1.7\"/>",
    ].join(''),
    head: [
      "<circle cx=\"0.0\" cy=\"0.0\" r=\"28.0\" fill=\"#7E9330\"/>",
      "<circle cx=\"-2.5\" cy=\"-2.8\" r=\"26.3\" fill=\"#B0C94A\"/>",
      "<g stroke=\"#7E9330\" stroke-width=\"2.2\" stroke-linecap=\"round\">",
      "<path d=\"M-14 -18 l6 6\"/>",
      "<path d=\"M10 -20 l-4 7\"/>",
      "<path d=\"M14 4 l6 2\"/>",
      "</g>",
      "<line x1=\"6\" y1=\"-6\" x2=\"18\" y2=\"10\" stroke=\"#0B0F1A\" stroke-width=\"1.8\" stroke-linecap=\"round\"/>",
      "<line x1=\"7.4\" y1=\"-3.666666666666667\" x2=\"12.6\" y2=\"2.333333333333333\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<line x1=\"11.4\" y1=\"1.666666666666666\" x2=\"16.6\" y2=\"7.666666666666666\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<ellipse cx=\"-10.08\" cy=\"-13.16\" rx=\"6.44\" ry=\"2.8000000000000003\" transform=\"rotate(-35 -10.08 -13.16)\" fill=\"#fff\" opacity=\".35\"/>",
      "<circle cx=\"0.0\" cy=\"0.0\" r=\"28.0\" fill=\"none\" stroke=\"#0B0F1A\" stroke-width=\"3.9\"/>",
      "<circle cx=\"-8.4\" cy=\"14.0\" r=\"4.8\" fill=\"#FF7A1A\" opacity=\".35\"/>",
      "<circle cx=\"-8.4\" cy=\"14.0\" r=\"3.1\" fill=\"#FF7A1A\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
      "<circle cx=\"-9.0\" cy=\"13.4\" r=\"0.8\" fill=\"#FFD0D0\"/>",
      "<circle cx=\"8.4\" cy=\"14.0\" r=\"4.8\" fill=\"#FF7A1A\" opacity=\".35\"/>",
      "<circle cx=\"8.4\" cy=\"14.0\" r=\"3.1\" fill=\"#FF7A1A\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
      "<circle cx=\"7.8\" cy=\"13.4\" r=\"0.8\" fill=\"#FFD0D0\"/>",
    ].join(''),
  },
  tank: {
    file: 'zombi_tanc', vb: '-90 -67.5 180 180',
    pivots: { armL: { x: -24, y: 10, note: 'left shoulder (under the head)' }, armR: { x: 24, y: 10, note: 'right shoulder' }, head: { x: 0, y: 0, note: 'centre of the head' } },
    armL: [
      "<rect x=\"-33\" y=\"7.199999999999999\" width=\"18\" height=\"66\" rx=\"9\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"4.08\"/>",
      "<rect x=\"-31.32\" y=\"9.6\" width=\"7.56\" height=\"58.8\" rx=\"3.6\" fill=\"#8FA88A\" opacity=\".7\"/>",
      "<path d=\"M-33 7.199999999999999 h18 v16.8 l-4.5 -4.8 l-4.5 6 l-4.5 -6 l-4.5 4.8 Z\" fill=\"#5E636D\" stroke=\"#0B0F1A\" stroke-width=\"3.12\" stroke-linejoin=\"round\"/>",
      "<circle cx=\"-24.0\" cy=\"73.2\" r=\"13.0\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"3.84\"/>",
      "<circle cx=\"-26.2\" cy=\"70.7\" r=\"8.6\" fill=\"#8FA88A\"/>",
      "<circle cx=\"-30.8\" cy=\"84.4\" r=\"3.6\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"2.4\"/>",
      "<circle cx=\"-24.0\" cy=\"84.4\" r=\"3.6\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"2.4\"/>",
      "<circle cx=\"-17.2\" cy=\"84.4\" r=\"3.6\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"2.4\"/>",
    ].join(''),
    armR: [
      "<rect x=\"15\" y=\"7.199999999999999\" width=\"18\" height=\"62\" rx=\"9\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"4.08\"/>",
      "<rect x=\"16.68\" y=\"9.6\" width=\"7.56\" height=\"54.8\" rx=\"3.6\" fill=\"#8FA88A\" opacity=\".7\"/>",
      "<path d=\"M15 7.199999999999999 h18 v16.8 l-4.5 -4.8 l-4.5 6 l-4.5 -6 l-4.5 4.8 Z\" fill=\"#5E636D\" stroke=\"#0B0F1A\" stroke-width=\"3.12\" stroke-linejoin=\"round\"/>",
      "<circle cx=\"24.0\" cy=\"69.2\" r=\"13.0\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"3.84\"/>",
      "<circle cx=\"21.8\" cy=\"66.7\" r=\"8.6\" fill=\"#8FA88A\"/>",
      "<circle cx=\"17.2\" cy=\"80.4\" r=\"3.6\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"2.4\"/>",
      "<circle cx=\"24.0\" cy=\"80.4\" r=\"3.6\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"2.4\"/>",
      "<circle cx=\"30.8\" cy=\"80.4\" r=\"3.6\" fill=\"#6B8566\" stroke=\"#0B0F1A\" stroke-width=\"2.4\"/>",
    ].join(''),
    head: [
      "<circle cx=\"0.0\" cy=\"0.0\" r=\"46.0\" fill=\"#435940\"/>",
      "<circle cx=\"-4.1\" cy=\"-4.6\" r=\"43.2\" fill=\"#6B8566\"/>",
      "<path d=\"M-30 -18 Q0 -46 30 -18 L24 -8 Q0 -30 -24 -8 Z\" fill=\"#8A929E\" stroke=\"#0B0F1A\" stroke-width=\"3\"/>",
      "<circle cx=\"-18.0\" cy=\"-20.0\" r=\"2.4\" fill=\"#C9D4E3\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
      "<circle cx=\"0.0\" cy=\"-28.0\" r=\"2.4\" fill=\"#C9D4E3\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
      "<circle cx=\"18.0\" cy=\"-20.0\" r=\"2.4\" fill=\"#C9D4E3\" stroke=\"#0B0F1A\" stroke-width=\"1.2\"/>",
      "<polygon points=\"-34,-4 -46,-14 -38,6\" fill=\"#C9D4E3\" stroke=\"#0B0F1A\" stroke-width=\"2.4\" stroke-linejoin=\"round\"/>",
      "<polygon points=\"34,-4 46,-14 38,6\" fill=\"#C9D4E3\" stroke=\"#0B0F1A\" stroke-width=\"2.4\" stroke-linejoin=\"round\"/>",
      "<line x1=\"-18\" y1=\"6\" x2=\"4\" y2=\"26\" stroke=\"#0B0F1A\" stroke-width=\"1.8\" stroke-linecap=\"round\"/>",
      "<line x1=\"-15.1\" y1=\"8\" x2=\"-9.9\" y2=\"14\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<line x1=\"-9.6\" y1=\"13\" x2=\"-4.4\" y2=\"19\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<line x1=\"-4.1\" y1=\"18\" x2=\"1.1\" y2=\"24\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
      "<ellipse cx=\"-16.56\" cy=\"-21.619999999999997\" rx=\"10.58\" ry=\"4.6000000000000005\" transform=\"rotate(-35 -16.56 -21.619999999999997)\" fill=\"#fff\" opacity=\".35\"/>",
      "<circle cx=\"0.0\" cy=\"0.0\" r=\"46.0\" fill=\"none\" stroke=\"#0B0F1A\" stroke-width=\"6.4\"/>",
      "<circle cx=\"-13.8\" cy=\"23.0\" r=\"7.8\" fill=\"#FF3B3B\" opacity=\".35\"/>",
      "<circle cx=\"-13.8\" cy=\"23.0\" r=\"5.1\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
      "<circle cx=\"-14.7\" cy=\"22.1\" r=\"1.4\" fill=\"#FFD0D0\"/>",
      "<circle cx=\"13.8\" cy=\"23.0\" r=\"7.8\" fill=\"#FF3B3B\" opacity=\".35\"/>",
      "<circle cx=\"13.8\" cy=\"23.0\" r=\"5.1\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
      "<circle cx=\"12.9\" cy=\"22.1\" r=\"1.4\" fill=\"#FFD0D0\"/>",
    ].join(''),
  },
};

const pieces = id => { const z = ZOMBIES[id]; return { armL: z.armL, armR: z.armR, head: z.head }; };
const whole = id => svg(ZOMBIES[id].vb, ORDER.map(k => ZOMBIES[id][k]).join(''));
const partFiles = id => { const z = ZOMBIES[id], f = {}; ORDER.forEach(k => { f[k + '.svg'] = svg(z.vb, z[k]); }); f['parts.json'] = JSON.stringify({ view: z.vb.split(' ').map(Number), order: ORDER, pivots: z.pivots }, null, 2); return f; };

module.exports = { ZOMBIES, ORDER, pieces, whole, partFiles };

if (require.main === module) {
  const fs = require('fs'), path_ = require('path');
  const out = path_.join(__dirname, '..', '..', 'public', 'images', 'zombies');
  for (const id of Object.keys(ZOMBIES)) {
    fs.writeFileSync(path_.join(out, ZOMBIES[id].file + '.svg'), whole(id));
    const dir = path_.join(out, id); fs.mkdirSync(dir, { recursive: true });
    const f = partFiles(id); for (const n of Object.keys(f)) fs.writeFileSync(path_.join(dir, n), f[n]);
    console.log('wrote ' + ZOMBIES[id].file + '.svg, ' + id + '/' + Object.keys(f).join(', ' + id + '/'));
  }
}

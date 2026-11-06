// The exploder (a zombie that goes off on touch) as separate pieces, to animate its walk: both arms (each now holds a stick of dynamite, with a lit fuse), the head, the bundle of
// dynamite strapped to it (it can jiggle on its own) and the face (the highlight, the outline and the eyes, which must stay on top of the bundle).
// The head, the bundle and the face, and the arms and hands, are the ones of the picture the game had (public/images/zombies/zombi_exploder.svg); what is new is the stick in each
// hand, and the viewBox, taller (the sticks reach further forward than the hands did). All the pieces share the viewBox, and stacked in order (back to front) they are exactly
// the whole picture, which this file writes too.
//
//   node tools/catalog/sprites-exploder.js     writes public/images/zombies/exploder/{armL,armR,head,bundle,face}.svg + parts.json and the whole picture zombi_exploder.svg
//
// In the game (public/arena-art.js, drawExploderSprite) the zombie is 18 units across: `disc` 38.5 of this picture = r 18.
const INK = '#0B0F1A';
const r1 = n => Math.round(n * 10) / 10;
const rect = (x, y, w, h, rx, fill, sw = 0, extra = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}${extra ? ' ' + extra : ''}/>`;
const path = (d, fill, sw = 0, extra = '') => `<path d="${d}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : ''}${extra ? ' ' + extra : ''}/>`;
const circ = (x, y, r, fill, sw = 0) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${fill}"${sw ? ` stroke="${INK}" stroke-width="${sw}"` : ''}/>`;
const svg = (vb, inner) => { const [x, y, w, h] = vb.split(' ').map(Number); return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w * 2}" height="${h * 2}">${inner}</svg>`; };

const EXPLODER_VIEW = '-70 -52.5 140 180';
const EXPLODER_ORDER = ['armL', 'armR', 'head', 'bundle', 'face'];
// where the lit fuse of each stick is, in the picture's units (the game puts a flickering glow there); the head's own fuse is the one of the bundle (the old code: FUSE_PX / FUSE_PY)
const STICK = { armL: { cx: -17, hy: 70, deg: -8, side: -1 }, armR: { cx: 17, hy: 76, deg: 8, side: 1 } };
const fuseTip = k => { const s = STICK[k], x = s.cx + s.side * 9, y = s.hy + 40, a = s.deg * Math.PI / 180, dx = x - s.cx, dy = y - s.hy;
  return [r1(s.cx + dx * Math.cos(a) - dy * Math.sin(a)), r1(s.hy + dx * Math.sin(a) + dy * Math.cos(a))]; };
const EXPLODER_PIVOTS = {
  armL: { x: -17, y: 6, note: 'left shoulder: the arm reaches and draws back with the steps, the dynamite in its hand with it' },
  armR: { x: 17, y: 6, note: 'right shoulder: the other way round' },
  head: { x: 0, y: 0, note: 'centre of the body: sways with the steps' },
  bundle: { x: 0, y: 0, note: 'the dynamite strapped to the head: follows the head and jiggles a little on its own' },
  face: { x: 0, y: 0, note: 'the highlight, the outline and the eyes: exactly the head, drawn over the bundle' },
};
const EXPLODER_FUSES = { armL: fuseTip('armL'), armR: fuseTip('armR'), head: [-26.4, -19.9] };

function exploderPieces() {
  const RED = '#E8403A', REDL = '#FF8C86', REDD = '#B02A25', BAND = '#5A4636';
  // a stick of dynamite held in a fist, tilted a little inwards, its fuse lit at the far end (towards where it looks)
  const stick = k => { const s = STICK[k], x = s.cx - 6, y = s.hy - 4, f = s.side;
    return `<g transform="rotate(${s.deg} ${s.cx} ${s.hy})">` + rect(x, y, 12, 40, 3.4, RED, 2.2) + rect(x + 1.8, y + 2, 3, 34, 1.5, REDL, 0, 'opacity=".7"') +
      rect(x - 0.7, y + 12, 13.4, 4.4, 1, BAND, 1.6) + rect(x - 0.7, y + 26, 13.4, 4.4, 1, BAND, 1.6) + rect(x + 0.4, y + 35, 11.2, 5.4, 2, REDD, 1.8) +
      path(`M${s.cx} ${s.hy + 36} q${f * 3} 5 ${f * 9} 4`, 'none', 2) + circ(s.cx + f * 9, s.hy + 40, 3.8, '#FFD84A', 1.5) + circ(s.cx + f * 9, s.hy + 40, 1.6, '#FFFFFF') + '</g>'; };
  const armBody = { L: [
    "<rect x=\"-23\" y=\"6\" width=\"12\" height=\"64\" rx=\"6\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"3.4\"/>",
    "<rect x=\"-21.6\" y=\"8\" width=\"5.04\" height=\"58\" rx=\"2.4000000000000004\" fill=\"#F7A862\" opacity=\".7\"/>",
    "<path d=\"M-23 6 h12 v14 l-3 -4 l-3 5 l-3 -5 l-3 4 Z\" fill=\"#5C6B80\" stroke=\"#0B0F1A\" stroke-width=\"2.6\" stroke-linejoin=\"round\"/>",
  ], R: [
    "<rect x=\"11\" y=\"6\" width=\"12\" height=\"70\" rx=\"6\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"3.4\"/>",
    "<rect x=\"12.4\" y=\"8\" width=\"5.04\" height=\"64\" rx=\"2.4000000000000004\" fill=\"#F7A862\" opacity=\".7\"/>",
    "<path d=\"M11 6 h12 v14 l-3 -4 l-3 5 l-3 -5 l-3 4 Z\" fill=\"#5C6B80\" stroke=\"#0B0F1A\" stroke-width=\"2.6\" stroke-linejoin=\"round\"/>",
  ] };
  const hand = { L: [
    "<circle cx=\"-17.0\" cy=\"70.0\" r=\"8.6\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"3.2\"/>",
    "<circle cx=\"-18.4\" cy=\"68.3\" r=\"5.8\" fill=\"#F7A862\"/>",
    "<circle cx=\"-21.6\" cy=\"77.4\" r=\"2.4\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    "<circle cx=\"-17.0\" cy=\"77.4\" r=\"2.4\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    "<circle cx=\"-12.4\" cy=\"77.4\" r=\"2.4\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
  ], R: [
    "<circle cx=\"17.0\" cy=\"76.0\" r=\"8.6\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"3.2\"/>",
    "<circle cx=\"15.6\" cy=\"74.3\" r=\"5.8\" fill=\"#F7A862\"/>",
    "<circle cx=\"12.4\" cy=\"83.4\" r=\"2.4\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    "<circle cx=\"17.0\" cy=\"83.4\" r=\"2.4\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    "<circle cx=\"21.6\" cy=\"83.4\" r=\"2.4\" fill=\"#E2773A\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
  ] };
  const armL = armBody.L.join('') + stick('armL') + hand.L.join('');
  const armR = armBody.R.join('') + stick('armR') + hand.R.join('');
  const head = [
    "<circle cx=\"0.0\" cy=\"0.0\" r=\"36.0\" fill=\"#A84A1C\"/>",
    "<circle cx=\"-3.2\" cy=\"-3.6\" r=\"33.8\" fill=\"#E2773A\"/>",
    "<ellipse cx=\"12\" cy=\"-12\" rx=\"8\" ry=\"6\" fill=\"#C4602A\" opacity=\".8\"/>",
    "<ellipse cx=\"-14\" cy=\"8\" rx=\"5\" ry=\"4\" fill=\"#C4602A\" opacity=\".8\"/>",
    "<path d=\"M-12 -30 q4 -6 8 0 q4 -6 8 0 q3 6 -2 9 q-5 3 -10 0 q-6 -3 -4 -9z\" fill=\"#F2C14B\" stroke=\"#0B0F1A\" stroke-width=\"2\"/>",
    "<path d=\"M-8 -27 q3 2 5 0 q3 2 5 0\" fill=\"none\" stroke=\"#B8862A\" stroke-width=\"1.4\" stroke-linecap=\"round\"/>",
    "<line x1=\"-24\" y1=\"-4\" x2=\"-10\" y2=\"14\" stroke=\"#0B0F1A\" stroke-width=\"1.8\" stroke-linecap=\"round\"/>",
    "<line x1=\"-23.1\" y1=\"-2.5\" x2=\"-17.9\" y2=\"3.5\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
    "<line x1=\"-19.6\" y1=\"2\" x2=\"-14.4\" y2=\"8\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
    "<line x1=\"-16.1\" y1=\"6.5\" x2=\"-10.9\" y2=\"12.5\" stroke=\"#0B0F1A\" stroke-width=\"1.6\" stroke-linecap=\"round\"/>",
  ].join('');
  const bundle = "<g transform=\"rotate(-28)\"><rect x=\"-34\" y=\"-9\" width=\"68\" height=\"18\" rx=\"4\" fill=\"#5A4636\" stroke=\"#0B0F1A\" stroke-width=\"2.4\"/><rect x=\"-27\" y=\"-17\" width=\"12\" height=\"34\" rx=\"5\" fill=\"#E8403A\" stroke=\"#0B0F1A\" stroke-width=\"2.2\"/><rect x=\"-6\" y=\"-17\" width=\"12\" height=\"34\" rx=\"5\" fill=\"#E8403A\" stroke=\"#0B0F1A\" stroke-width=\"2.2\"/><rect x=\"15\" y=\"-17\" width=\"12\" height=\"34\" rx=\"5\" fill=\"#E8403A\" stroke=\"#0B0F1A\" stroke-width=\"2.2\"/><rect x=\"-25\" y=\"-15\" width=\"3\" height=\"30\" rx=\"1.5\" fill=\"#FF8C86\" opacity=\".7\"/><rect x=\"-4\" y=\"-15\" width=\"3\" height=\"30\" rx=\"1.5\" fill=\"#FF8C86\" opacity=\".7\"/><rect x=\"17\" y=\"-15\" width=\"3\" height=\"30\" rx=\"1.5\" fill=\"#FF8C86\" opacity=\".7\"/><path d=\"M-21 -17 q-2 -10 6 -12\" fill=\"none\" stroke=\"#0B0F1A\" stroke-width=\"2\" stroke-linecap=\"round\"/><circle cx=\"-14\" cy=\"-30\" r=\"4.2\" fill=\"#FFD84A\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/><circle cx=\"-14\" cy=\"-30\" r=\"1.8\" fill=\"#FFFFFF\"/></g>";
  const face = [
    "<ellipse cx=\"-12.959999999999999\" cy=\"-16.919999999999998\" rx=\"8.280000000000001\" ry=\"3.6\" transform=\"rotate(-35 -12.959999999999999 -16.919999999999998)\" fill=\"#fff\" opacity=\".35\"/>",
    "<circle cx=\"0.0\" cy=\"0.0\" r=\"36.0\" fill=\"none\" stroke=\"#0B0F1A\" stroke-width=\"5.0\"/>",
    "<circle cx=\"-10.8\" cy=\"18.0\" r=\"6.1\" fill=\"#FF3B3B\" opacity=\".35\"/>",
    "<circle cx=\"-10.8\" cy=\"18.0\" r=\"4.0\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
    "<circle cx=\"-11.5\" cy=\"17.3\" r=\"1.1\" fill=\"#FFD0D0\"/>",
    "<circle cx=\"10.8\" cy=\"18.0\" r=\"6.1\" fill=\"#FF3B3B\" opacity=\".35\"/>",
    "<circle cx=\"10.8\" cy=\"18.0\" r=\"4.0\" fill=\"#FF3B3B\" stroke=\"#0B0F1A\" stroke-width=\"1.6\"/>",
    "<circle cx=\"10.1\" cy=\"17.3\" r=\"1.1\" fill=\"#FFD0D0\"/>",
  ].join('');
  return { armL, armR, head, bundle, face };
}
function exploder() { const p = exploderPieces(); return svg(EXPLODER_VIEW, EXPLODER_ORDER.map(k => p[k]).join('')); }
const exploderPartFiles = () => { const p = exploderPieces(); const f = {}; EXPLODER_ORDER.forEach(k => { f[k + '.svg'] = svg(EXPLODER_VIEW, p[k]); }); f['parts.json'] = JSON.stringify({ view: EXPLODER_VIEW.split(' ').map(Number), order: EXPLODER_ORDER, pivots: EXPLODER_PIVOTS, fuses: EXPLODER_FUSES }, null, 2); return f; };

module.exports = { exploder, exploderPieces, exploderPartFiles, EXPLODER_ORDER, EXPLODER_PIVOTS, EXPLODER_VIEW, EXPLODER_FUSES };

if (require.main === module) {
  const fs = require('fs'), path_ = require('path');
  const out = path_.join(__dirname, '..', '..', 'public', 'images', 'zombies');
  fs.writeFileSync(path_.join(out, 'zombi_exploder.svg'), exploder());
  const dir = path_.join(out, 'exploder'); fs.mkdirSync(dir, { recursive: true });
  const f = exploderPartFiles(); for (const n of Object.keys(f)) fs.writeFileSync(path_.join(dir, n), f[n]);
  console.log('wrote zombi_exploder.svg, exploder/' + Object.keys(f).join(', exploder/'));
}

// The five chests of the lobby as SVG files, drawn exactly as in the "Obiecte Arena" artifact (the "Chest-uri in lobby" section): Wooden, Silver, Golden, Diamond,
// Mythical. For every one it writes public/images/chests/<id>.svg (the whole chest) and the same drawing cut in two at the lid line, <id>_lid.svg and <id>_body.svg
// (same viewBox, so they sit exactly on each other): the opening animation lifts the lid and lets the light out from between them.
//   node tools/build-chest-art.js
'use strict';
const fs = require('fs'), path = require('path');
const OUT = "#0B0F1A";
function circ(x, y, r, f, extra) { return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + f + '"' + (extra || "") + '/>'; }
function chest(c, opt) {
  opt = opt || {};
  var s = '';
  if (!opt.ghost) s += '<g opacity=".25"><ellipse cx="0" cy="30" rx="30" ry="5" fill="#000"/></g>';
  var sw = opt.ghost ? 3 : 3.6, st = opt.ghost ? c.line : OUT;
  // corp
  s += '<rect x="-28" y="-2" width="56" height="30" rx="4" fill="' + c.dark + '" stroke="' + st + '" stroke-width="' + sw + '"' + (opt.ghost ? ' stroke-dasharray="5 4"' : '') + '/>';
  s += '<rect x="-25" y="1" width="50" height="22" rx="2.5" fill="' + c.base + '"/>';
  // capac boltit
  s += '<path d="M-28 -2 V-12 Q-28 -28 0 -28 Q28 -28 28 -12 V-2 Z" fill="' + c.dark + '" stroke="' + st + '" stroke-width="' + sw + '" stroke-linejoin="round"' + (opt.ghost ? ' stroke-dasharray="5 4"' : '') + '/>';
  s += '<path d="M-25 -4 V-12 Q-25 -25 0 -25 Q25 -25 25 -12 V-4 Z" fill="' + c.lid + '"/>';
  // benzi metalice
  [-16, 16].forEach(function (x) { s += '<rect x="' + (x - 3.5) + '" y="-27" width="7" height="55" rx="1.5" fill="' + c.band + '"' + (opt.ghost ? '' : ' stroke="' + OUT + '" stroke-width="2"') + '/>'; });
  s += '<rect x="-28" y="-4" width="56" height="5" fill="' + c.band + '"' + (opt.ghost ? '' : ' stroke="' + OUT + '" stroke-width="2"') + '/>';
  // lacat
  s += '<rect x="-6.5" y="-6" width="13" height="15" rx="3" fill="' + c.lock + '"' + (opt.ghost ? '' : ' stroke="' + OUT + '" stroke-width="2.2"') + '/><circle cx="0" cy="1" r="2.2" fill="' + (opt.ghost ? c.dark : OUT) + '"/>';
  if (!opt.ghost) s += '<ellipse cx="-14" cy="-19" rx="7" ry="2.4" transform="rotate(-15 -14 -19)" fill="#fff" opacity=".4"/>';
  return s;
}
var CH_GHOST = { dark: "#2A3140", base: "#323a4a", lid: "#353e4f", band: "#3E4757", lock: "#465061", line: "#4E596B" };
var CH_WOOD = { dark: "#8F5A1E", base: "#C98A3D", lid: "#D99A48", band: "#8A929E", lock: "#FFC53D" };
function cShadow(rx) { return '<ellipse cx="0" cy="31" rx="' + rx + '" ry="5" fill="#000" opacity=".25"/>'; }
function cHl(x, y) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="7" ry="2.4" transform="rotate(-15 ' + x + ' ' + y + ')" fill="#fff" opacity=".42"/>'; }
function sk(w) { return ' stroke="' + OUT + '" stroke-width="' + w + '" stroke-linejoin="round"'; }
function spark(x, y, r, f) { return '<path d="M' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + (f || '#fff') + '"/>'; }

function silverChest() {
  var s = cShadow(31);
  // corp (aceeasi constructie ca la Wooden: dreptunghi, contur gros OUT)
  s += '<rect x="-28" y="-2" width="56" height="30" rx="4" fill="#56637A"' + sk(3.6) + '/><rect x="-25" y="1" width="50" height="22" rx="2.5" fill="#A7B4C6"/><rect x="-25" y="1" width="50" height="4" fill="#C9D4E2"/>';
  // capac drept, laturi verticale, fara perspectiva
  s += '<path d="M-28 -2 V-17 Q-28 -28 -17 -28 H17 Q28 -28 28 -17 V-2 Z" fill="#56637A"' + sk(3.6) + '/><path d="M-25 -4 V-17 Q-25 -25 -16 -25 H16 Q25 -25 25 -17 V-4 Z" fill="#B9C5D5"/><path d="M-25 -17 Q-25 -25 -16 -25 H16 Q25 -25 25 -17 V-14 H-25 Z" fill="#E3EAF3"/>';
  // benzi de otel (ca la Wooden)
  [-16, 16].forEach(function (x) { s += '<rect x="' + (x - 3.5) + '" y="-27" width="7" height="55" rx="1.5" fill="#7C8AA0" stroke="' + OUT + '" stroke-width="2"/>'; });
  s += '<rect x="-28" y="-4" width="56" height="5" fill="#7C8AA0" stroke="' + OUT + '" stroke-width="2"/>';
  [-23, -9, 9, 23].forEach(function (x) { s += circ(x, -1.5, 1.4, "#DCE4EE"); });
  [-16, 16].forEach(function (x) { s += circ(x, -21, 1.4, "#DCE4EE") + circ(x, 22, 1.4, "#DCE4EE"); });
  // lacat-scut
  s += '<path d="M-7 -8 H7 V2 Q7 9 0 12 Q-7 9 -7 2 Z" fill="#35C8FF"' + sk(2.2) + '/><path d="M-4.5 -5.5 H0 V9 Q-4.5 7 -4.5 2 Z" fill="#9BE6FF" opacity=".8"/>' + circ(0, 0, 2, OUT) + '<rect x="-1" y="0" width="2" height="5" fill="' + OUT + '"/>';
  return s + cHl(-15, -20);
}
function goldenChest() {
  var s = cShadow(32);
  s += circ(-22, 27, 5, "#A8661A", sk(2.6)) + circ(22, 27, 5, "#A8661A", sk(2.6));
  s += '<polygon points="-28,-2 28,-2 25,26 -25,26" fill="#A8661A"' + sk(3.6) + '/><polygon points="-25,1 25,1 22.6,23 -22.6,23" fill="#F2B33D"/><polygon points="-25,1 25,1 24.5,6 -24.5,6" fill="#FFD978"/>';
  s += '<rect x="-23.5" y="16" width="47" height="3" fill="#C27F22"/>';
  s += '<path d="M-21 6 q7 0 7 6 q0 4 -4 4" fill="none" stroke="#A8661A" stroke-width="2.2" stroke-linecap="round"/><path d="M21 6 q-7 0 -7 6 q0 4 4 4" fill="none" stroke="#A8661A" stroke-width="2.2" stroke-linecap="round"/>';
  s += '<path d="M-30 -2 V-10 Q-30 -32 0 -32 Q30 -32 30 -10 V-2 Z" fill="#A8661A"' + sk(3.6) + '/><path d="M-27 -5 V-10 Q-27 -29 0 -29 Q27 -29 27 -10 V-5 Z" fill="#FFCF5A"/>';
  s += '<path d="M-14 -5 V-12 Q-14 -26 0 -29 Q14 -26 14 -12 V-5" fill="none" stroke="#D9962B" stroke-width="2.2"/>';
  s += '<polygon points="-9,-29 -10,-40 -4.5,-35 0,-42 4.5,-35 10,-40 9,-29" fill="#FFCF5A"' + sk(2.4) + '/>' + circ(0, -33.5, 2.1, "#E5384B") + circ(-10, -40, 1.4, "#fff") + circ(10, -40, 1.4, "#fff") + circ(0, -42, 1.4, "#fff");
  s += '<rect x="-31" y="-5" width="62" height="6" rx="2" fill="#D9962B"' + sk(2) + '/>';
  [-23, -15, 15, 23].forEach(function (x) { s += circ(x, -2, 1.5, "#FFF3C4"); });
  s += circ(0, 2, 8.5, "#FFCF5A", sk(2.4)) + circ(0, 2, 5, "#E5384B") + circ(-1.6, 0.4, 1.6, "#fff", ' opacity=".75"');
  return s + cHl(-15, -21) + spark(29, -25, 3.5) + spark(-31, 14, 2.6);
}
function diamondChest() {
  var s = '<circle cx="0" cy="-2" r="36" fill="#8FE3FF" opacity=".16"/>' + cShadow(31);
  s += '<polygon points="-28,-2 28,-2 28,19 20,28 -20,28 -28,19" fill="#17507E"' + sk(3.6) + '/>';
  s += '<polygon points="-25,1 25,1 25,18 18.5,25 -18.5,25 -25,18" fill="#3FA9E8"/><polygon points="-25,1 -8,1 -14,25 -18.5,25 -25,18" fill="#6CCBF5"/><polygon points="8,1 25,1 25,18 18.5,25 14,25" fill="#2A86C9"/>';
  s += '<polygon points="-30,-2 -30,-13 -19,-25 19,-25 30,-13 30,-2" fill="#17507E"' + sk(3.6) + '/>';
  s += '<polygon points="-27,-5 -27,-12 -17.5,-22 -6,-22 -10,-5" fill="#8FE3FF"/><polygon points="-10,-5 -6,-22 6,-22 10,-5" fill="#5CC0F2"/><polygon points="10,-5 6,-22 17.5,-22 27,-12 27,-5" fill="#2E8FD4"/>';
  s += '<polygon points="-13,-35 -9,-28 -13,-22 -17,-28" fill="#8FE3FF"' + sk(2.2) + '/><polygon points="13,-35 17,-28 13,-22 9,-28" fill="#5CC0F2"' + sk(2.2) + '/>';
  s += '<polygon points="0,-43 7,-32 0,-23 -7,-32" fill="#BFF1FF"' + sk(2.4) + '/><polygon points="0,-43 0,-23 -7,-32" fill="#fff" opacity=".55"/>';
  s += '<rect x="-31" y="-5" width="62" height="6" rx="1.5" fill="#E6F2FF"' + sk(2) + '/>';
  s += '<polygon points="0,-9 8.5,2 0,13 -8.5,2" fill="#BFF1FF"' + sk(2.4) + '/><polygon points="0,-4 4.5,2 0,8 -4.5,2" fill="#35C8FF"/><polygon points="0,-4 0,8 -4.5,2" fill="#9BE6FF"/>';
  return s + spark(-31, -24, 4.2) + spark(31, 10, 3.2) + spark(25, -34, 3) + spark(-24, 22, 2.4);
}
function mythicChest() {
  var s = '<defs><radialGradient id="mythAura"><stop offset="0" stop-color="#B66BFF" stop-opacity=".6"/><stop offset="1" stop-color="#B66BFF" stop-opacity="0"/></radialGradient></defs>';
  s += '<circle cx="0" cy="-4" r="40" fill="url(#mythAura)"/>' + cShadow(31);
  // coarne
  s += '<path d="M-24 -17 Q-40 -24 -37 -42 Q-31 -30 -17 -26 Z" fill="#E9DDF7"' + sk(2.6) + '/><path d="M24 -17 Q40 -24 37 -42 Q31 -30 17 -26 Z" fill="#E9DDF7"' + sk(2.6) + '/>';
  s += '<path d="M-27 -2 H27 Q33 12 25 28 H-25 Q-33 12 -27 -2 Z" fill="#2A0F4A"' + sk(3.6) + '/><path d="M-24 1 H24 Q29 12 22.5 25 H-22.5 Q-29 12 -24 1 Z" fill="#6B2BC4"/><path d="M-24 1 H24 L25 5 H-25 Z" fill="#9A5CF0"/>';
  var runes = '<path d="M-20 9 L-17 15 L-14 9 M-17 15 V20" /><path d="M13 9 H20 M16.5 9 V20 M13 15 H20"/>';
  s += '<g fill="none" stroke="#3DFFC9" stroke-width="4" stroke-linecap="round" opacity=".3">' + runes + '</g><g fill="none" stroke="#3DFFC9" stroke-width="1.8" stroke-linecap="round">' + runes + '</g>';
  s += '<path d="M-30 -2 V-10 Q-30 -30 0 -30 Q30 -30 30 -10 V-2 Z" fill="#2A0F4A"' + sk(3.6) + '/><path d="M-27 -5 V-10 Q-27 -27 0 -27 Q27 -27 27 -10 V-5 Z" fill="#8A44E0"/>';
  s += '<path d="M-18 -8 Q-18 -22 0 -24 Q18 -22 18 -8" fill="none" stroke="#B57CFF" stroke-width="2"/>';
  s += '<polygon points="-12,-28 -9,-35 -6,-29" fill="#E9DDF7"' + sk(2) + '/><polygon points="6,-29 9,-35 12,-28" fill="#E9DDF7"' + sk(2) + '/><polygon points="-3.5,-29.5 0,-40 3.5,-29.5" fill="#E9DDF7"' + sk(2) + '/>';
  s += '<rect x="-31" y="-5" width="62" height="6" rx="2" fill="#1A0830"' + sk(2) + '/>';
  [-24, -16, 16, 24].forEach(function (x) { s += circ(x, -2, 1.5, "#FF5BD6"); });
  s += circ(0, 2, 13, "#3DFFC9", ' opacity=".22"');
  s += '<path d="M-11 2 Q0 -9 11 2 Q0 13 -11 2 Z" fill="#E9DDF7"' + sk(2.4) + '/>' + circ(0, 2, 4.4, "#3DFFC9") + '<ellipse cx="0" cy="2" rx="1.3" ry="3.4" fill="' + OUT + '"/>' + circ(-1.6, 0.4, 1, "#fff");
  s += circ(-34, 6, 2, "#3DFFC9") + circ(34, -4, 2.4, "#FF5BD6") + circ(30, 24, 1.6, "#3DFFC9") + circ(-30, 24, 1.4, "#FF5BD6");
  return s + cHl(-14, -20) + spark(-27, -34, 3.4, "#FFD6F7") + spark(28, -33, 2.6, "#C9FFF0");
}

const CHESTS = { wooden: () => chest(CH_WOOD), silver: silverChest, golden: goldenChest, diamond: diamondChest, mythical: mythicChest };
const VB = '-46 -50 92 90';            // the whole drawing, the aura and the crown included
const LID_Y = -2;                      // the lid line: what is above it is the lid
const svg = (inner, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB}" width="368" height="360"><defs>${defs}</defs>${inner}</svg>\n`;
const dir = path.join(__dirname, '..', 'public', 'images', 'chests');
fs.mkdirSync(dir, { recursive: true });
for (const [id, draw] of Object.entries(CHESTS)) {
    const art = draw();
    // the mythic chest has its own <defs> (the aura gradient): it goes in every file that uses it
    const defs = (art.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0].replace(/^<defs>|<\/defs>$/g, '');
    const inner = art.replace(/<defs>[\s\S]*?<\/defs>/, '');
    // the aura behind the diamond and the mythical chest is one round shape: it stays whole in the body file and is not in the lid file
    const aura = (inner.match(/^<circle[^>]*(?:opacity="\.16"|mythAura)[^>]*\/>/) || [''])[0], rest = inner.slice(aura.length);
    fs.writeFileSync(path.join(dir, id + '.svg'), svg(inner, defs));
    fs.writeFileSync(path.join(dir, id + '_lid.svg'), svg(`<clipPath id="c"><rect x="-60" y="-60" width="120" height="${LID_Y + 60}"/></clipPath><g clip-path="url(#c)">${rest}</g>`, defs));
    fs.writeFileSync(path.join(dir, id + '_body.svg'), svg(`${aura}<clipPath id="c"><rect x="-60" y="${LID_Y}" width="120" height="${60 - LID_Y}"/></clipPath><g clip-path="url(#c)">${rest}</g>`, defs));
}
console.log('chests written to', dir);

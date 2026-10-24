// The stroke rule of the weapon skins' art (public/images/weapons/skins/{svg,icons}/*.svg), checked and fixed by this file.
//   node tools/skin-strokes.js check [files...]   lists every stroke that breaks the rule (exit 1 if any)
//   node tools/skin-strokes.js fix   [files...]   rewrites the stroke widths so every skin follows it
// With no files: every svg in public/images/weapons/skins/svg and icons.
//
// One look for all the skins, whatever their rarity: two weights for every ink line, the same on every part of every skin.
//   OUTLINE 2.8   the ink outline of a shape wide enough to show its fill inside it (SMALL = 9 across in every direction), and the ink
//                 edge of a part drawn as a thick line (an ink line under a coloured line of the same path, the coloured one 3 or more wide:
//                 the ink shows OUTLINE on each side of it)
//   DETAIL  1.4   every other line: seams, grain, veins, teeth, highlights, the outline of a shape too small for 2.8 (a rivet, an eye, a
//                 thin strip), and the edge of a thin line (a cable, a barrel: DETAIL on each side)
// A shape that already has one of the two weights keeps it. A coloured line wider than 3 with no ink under it is a part (a glow, a
// band), not a detail line: its width stays; a coloured line under a narrower one is a halo and keeps the width it had round it.
// Widths are what you see, so a group scaled by scale(k) is allowed: the number written is divided by k. Pure: used by
// tools/tests/skin-strokes.test.js, no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');

const OUTLINE = 2.8, DETAIL = 1.4, SMALL = 9, WIDE = 3, INK = '#0B0F1A', EPS = 0.06;
const DRAWABLE = new Set(['rect', 'path', 'polygon', 'polyline', 'circle', 'ellipse', 'line']);
const GEOM = {
    rect: ['x', 'y', 'width', 'height'], path: ['d'], polygon: ['points'], polyline: ['points'],
    circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'],
};

function parse(svg) {
    const nodes = [], re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(svg))) {
        const attrs = {};
        for (const a of m[3].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
        nodes.push({ close: !!m[1], tag: m[2], attrs, start: m.index, end: m.index + m[0].length, self: !!m[4], raw: m[0] });
    }
    return nodes;
}
const scaleOf = t => { const m = /scale\(\s*([\d.]+)(?:[ ,]+([\d.]+))?\s*\)/.exec(t || ''); return m ? parseFloat(m[1]) : 1; };

// every drawable with what it inherits (stroke, stroke-width, fill) and the scale of its groups
function analyse(svg) {
    const nodes = parse(svg), stack = [{ stroke: undefined, sw: undefined, fill: undefined, k: 1 }], out = [];
    for (const n of nodes) {
        if (n.close) { if (n.tag === 'g' && stack.length > 1) stack.pop(); continue; }
        const top = stack[stack.length - 1];
        if (n.tag === 'g' || n.tag === 'svg') {
            if (n.tag === 'g') {
                const a = n.attrs;
                stack.push({ stroke: a.stroke !== undefined ? a.stroke : top.stroke, sw: a['stroke-width'] !== undefined ? parseFloat(a['stroke-width']) : top.sw,
                    fill: a.fill !== undefined ? a.fill : top.fill, k: top.k * scaleOf(a.transform) });
            }
            continue;
        }
        if (!DRAWABLE.has(n.tag)) continue;
        const a = n.attrs, k = top.k * scaleOf(a.transform);
        const stroke = a.stroke !== undefined ? a.stroke : top.stroke;
        const fill = n.tag === 'line' ? 'none' : (a.fill !== undefined ? a.fill : (top.fill !== undefined ? top.fill : '#000'));
        const sw = a['stroke-width'] !== undefined ? parseFloat(a['stroke-width']) : (top.sw !== undefined ? top.sw : 1);
        out.push({ node: n, stroke: stroke && stroke !== 'none' ? stroke : null, fill, sw, k, kind: null, target: null });
    }
    // an ink line right under a coloured line of the same path is the ink edge of a thick line: the pair
    // (a coloured line right under a narrower one of the same path is a halo, a glow round a line: it keeps the width it had round it)
    for (let i = 0; i < out.length - 1; i++) {
        const u = out[i], t = out[i + 1];
        if (!u.stroke || u.fill !== 'none' || !t.stroke || t.fill !== 'none' || u.kind) continue;
        if (u.node.tag !== t.node.tag || t.stroke.toUpperCase() === INK || t.stroke === u.stroke) continue;
        if (!(t.sw * t.k < u.sw * u.k)) continue;
        if (!GEOM[u.node.tag].every(g => u.node.attrs[g] === t.node.attrs[g])) continue;
        if (u.stroke.toUpperCase() === INK) { u.kind = 'edge'; u.pairTop = t; t.kind = 'core'; }
        else { u.kind = 'halo'; u.pairTop = t; }
    }
    for (const e of out) {
        if (!e.stroke || e.kind) continue;
        if (e.stroke.toUpperCase() === INK && e.fill !== 'none') {
            const now = e.sw * e.k;
            e.kind = Math.abs(now - OUTLINE) < EPS ? 'outline' : Math.abs(now - DETAIL) < EPS ? 'detail' : shortSide(e.node) * e.k >= SMALL ? 'outline' : 'detail';
        }
        else if (e.fill === 'none' && e.sw * e.k >= WIDE) e.kind = 'part';
        else e.kind = 'detail';
    }
    for (const e of out) {
        if (e.kind === 'outline') e.target = OUTLINE;
        else if (e.kind === 'detail') e.target = DETAIL;
        else if (e.kind === 'part') e.target = null;
        else if (e.kind === 'halo') e.target = null;               // set just below, from its top line
        else if (e.kind === 'core') e.target = null;                     // the coloured line keeps its width: it is the part
        else if (e.kind === 'edge') {
            const core = e.pairTop.sw * e.pairTop.k;
            // a thin line (a cable, a barrel) gets the detail weight on each side, a real part the outline on each side
            e.target = core < WIDE ? core + 2 * DETAIL : core + 2 * OUTLINE;
        }
    }
    for (const e of out) {
        if (e.kind !== 'halo') continue;
        const t = e.pairTop, topNow = t.sw * t.k, topTarget = t.target === null ? topNow : t.target;
        e.target = topTarget + (e.sw * e.k - topNow);
    }
    return out;
}

// the shortest side of a shape's box, in its own units (a path: the box of its points, curve control points included)
function pathBox(d) {
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const num = () => parseFloat(toks[i++]);
    const pt = (px, py) => { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; };
    while (i < toks.length) {
        if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
        const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
        if (C === 'Z') { x = sx; y = sy; continue; }
        const n = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7 }[C];
        if (!n) break;
        const v = Array.from({ length: n }, num);
        if (v.some(Number.isNaN)) break;
        if (C === 'H') x = rel ? x + v[0] : v[0];
        else if (C === 'V') y = rel ? y + v[0] : v[0];
        else {
            for (let j = 0; j + 1 < (C === 'A' ? 0 : n); j += 2) pt(rel ? x + v[j] : v[j], rel ? y + v[j + 1] : v[j + 1]);
            const ex = C === 'A' ? v[5] : v[n - 2], ey = C === 'A' ? v[6] : v[n - 1];
            x = rel ? x + ex : ex; y = rel ? y + ey : ey;
            if (C === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
        }
        pt(x, y);
    }
    return x1 < x0 ? 0 : Math.min(x1 - x0, y1 - y0);
}
function shortSide(n) {
    const a = n.attrs, f = k => parseFloat(a[k]), t = n.tag;
    if (t === 'rect') return Math.min(f('width'), f('height'));
    if (t === 'circle') return 2 * f('r');
    if (t === 'ellipse') return 2 * Math.min(f('rx'), f('ry'));
    if (t === 'polygon') {
        const p = (a.points || '').trim().split(/[ ,]+/).map(Number), xs = p.filter((_, j) => j % 2 === 0), ys = p.filter((_, j) => j % 2 === 1);
        return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }
    if (t === 'path') return pathBox(a.d || '');
    return 0;
}

function check(svg) {
    const bad = [];
    for (const e of analyse(svg)) {
        if (e.target === null) continue;
        const have = e.sw * e.k;
        if (Math.abs(have - e.target) > EPS) bad.push({ tag: e.node.tag, kind: e.kind, have: +have.toFixed(2), want: +e.target.toFixed(2), at: e.node.start });
    }
    return bad;
}

function fix(svg) {
    const els = analyse(svg).filter(e => e.target !== null && Math.abs(e.sw * e.k - e.target) > EPS);
    // rewrite from the end so the offsets stay valid
    for (const e of els.sort((a, b) => b.node.start - a.node.start)) {
        const w = +(e.target / e.k).toFixed(3);
        let raw = e.node.raw;
        raw = /stroke-width="[^"]*"/.test(raw) ? raw.replace(/stroke-width="[^"]*"/, `stroke-width="${w}"`)
            : raw.replace(/(\/?)>$/, ` stroke-width="${w}"$1>`);
        svg = svg.slice(0, e.node.start) + raw + svg.slice(e.node.end);
    }
    return { svg, changed: els.length };
}

const SKIN_DIR = path.join(__dirname, '../public/images/weapons/skins');
function allFiles() {
    return ['svg', 'icons'].flatMap(d => fs.readdirSync(path.join(SKIN_DIR, d)).filter(f => f.endsWith('.svg')).map(f => path.join(SKIN_DIR, d, f)));
}

if (require.main === module) {
    const [cmd, ...rest] = process.argv.slice(2);
    const files = rest.length ? rest : allFiles();
    let bad = 0;
    for (const f of files) {
        const svg = fs.readFileSync(f, 'utf8');
        if (cmd === 'check') {
            const b = check(svg);
            if (b.length) { bad += b.length; console.log(path.relative(process.cwd(), f) + ': ' + b.length + ' (' + [...new Set(b.map(x => x.kind + ' ' + x.have + '->' + x.want))].slice(0, 6).join(', ') + ')'); }
        } else if (cmd === 'fix') {
            const r = fix(svg);
            if (r.changed) { fs.writeFileSync(f, r.svg); console.log(path.relative(process.cwd(), f) + ': ' + r.changed + ' strokes'); }
        } else { console.log('usage: node tools/skin-strokes.js check|fix [files]'); process.exit(2); }
    }
    if (cmd === 'check') { console.log(bad ? bad + ' strokes break the rule' : 'every stroke follows the rule'); process.exit(bad ? 1 : 0); }
}
module.exports = { OUTLINE, DETAIL, analyse, check, fix, allFiles, SKIN_DIR };

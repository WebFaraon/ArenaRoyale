// node --test tools/tests/skin-strokes.test.js
// The stroke rule of the weapon skins (tools/skin-strokes.js): two weights for every ink line, on every part of every skin.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const T = require('../skin-strokes.js');

test('every skin svg and icon follows the stroke rule', () => {
    const files = T.allFiles();
    assert.ok(files.length >= 70, 'found ' + files.length + ' files');
    const bad = [];
    for (const f of files) for (const b of T.check(fs.readFileSync(f, 'utf8'))) bad.push(f.split('/').pop() + ' ' + b.kind + ' ' + b.have + ' -> ' + b.want);
    assert.deepEqual(bad.slice(0, 10), []);
});

const wrap = inner => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 0 80 144">' + inner + '</svg>';

test('a big shape takes the outline, a small one the detail weight', () => {
    const svg = wrap('<rect x="-8" y="20" width="16" height="30" fill="#fff" stroke="#0B0F1A" stroke-width="2"/><circle cx="0" cy="60" r="2" fill="#fff" stroke="#0B0F1A" stroke-width="2"/>');
    const r = T.fix(svg);
    assert.equal(r.changed, 2);
    assert.match(r.svg, /width="16" height="30" fill="#fff" stroke="#0B0F1A" stroke-width="2.8"/);
    assert.match(r.svg, /r="2" fill="#fff" stroke="#0B0F1A" stroke-width="1.4"/);
    assert.equal(T.check(r.svg).length, 0);
});

test('a shape that already has one of the two weights keeps it', () => {
    const svg = wrap('<rect x="-8" y="20" width="16" height="2" fill="#fff" stroke="#0B0F1A" stroke-width="2.8"/><circle cx="0" cy="60" r="12" fill="#fff" stroke="#0B0F1A" stroke-width="1.4"/>');
    assert.equal(T.fix(svg).changed, 0);
});

test('a group scale is taken into account: the width you see is the rule', () => {
    const svg = wrap('<g transform="translate(0 58) scale(1.25)"><rect x="-8" y="-15" width="16" height="30" fill="#fff" stroke="#0B0F1A" stroke-width="2.8"/></g>');
    const r = T.fix(svg);
    assert.match(r.svg, /stroke-width="2.24"/);   // 2.24 x 1.25 = 2.8
    assert.equal(T.check(r.svg).length, 0);
});

test('an ink line under a coloured line: the ink shows the outline on each side of a part, the detail weight on each side of a thin line', () => {
    const part = wrap('<path d="M0 20 L0 60" fill="none" stroke="#0B0F1A" stroke-width="5" stroke-linecap="round"/><path d="M0 20 L0 60" fill="none" stroke="#E5384B" stroke-width="4" stroke-linecap="round"/>');
    assert.match(T.fix(part).svg, /stroke="#0B0F1A" stroke-width="9.6"/);        // 4 + 2 x 2.8
    const thin = wrap('<path d="M0 20 L0 60" fill="none" stroke="#0B0F1A" stroke-width="5" stroke-linecap="round"/><path d="M0 20 L0 60" fill="none" stroke="#E5384B" stroke-width="2" stroke-linecap="round"/>');
    assert.match(T.fix(thin).svg, /stroke="#0B0F1A" stroke-width="4.8"/);        // 2 + 2 x 1.4
});

test('a coloured line under a narrower one is a halo and keeps its extra width; fix is idempotent', () => {
    const svg = wrap('<path d="M0 20 L0 60" fill="none" stroke="#FF7A1A" stroke-width="2.6"/><path d="M0 20 L0 60" fill="none" stroke="#FFD23F" stroke-width="1"/>');
    const once = T.fix(svg);
    assert.match(once.svg, /stroke="#FF7A1A" stroke-width="3"/);                 // 1.4 + (2.6 - 1)
    assert.equal(T.fix(once.svg).changed, 0);
});

test('a group stroke is inherited by the lines inside it', () => {
    const svg = wrap('<g stroke="#fff" stroke-width="1.8"><line x1="-6" y1="10" x2="6" y2="10"/><line x1="-6" y1="14" x2="6" y2="14"/></g>');
    const r = T.fix(svg);
    assert.equal(r.changed, 2);
    assert.equal((r.svg.match(/stroke-width="1.4"/g) || []).length, 2);
});

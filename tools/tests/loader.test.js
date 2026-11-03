// node --test tools/tests/loader.test.js
// The loading screen (public/loader.js): the tracker that adds up the parts of the work, the easing of the bar, and that the page and
// the game are wired to it (the DOM part is looked at in a browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../../public/loader.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', '..', 'public', f), 'utf8');

test('the tracker adds the parts by weight and is done only when every part is', () => {
    const t = L.createTracker();
    assert.equal(t.value(), 1, 'nothing to do: nothing to wait for');
    t.add('map', 3, 'Loading the arena'); t.add('guns', 1, 'Loading weapons');
    assert.equal(t.value(), 0); assert.equal(t.done(), false);
    t.set('map', 0.5);
    assert.ok(Math.abs(t.value() - 0.375) < 1e-9);
    t.set('map', 1);
    assert.ok(Math.abs(t.value() - 0.75) < 1e-9); assert.equal(t.done(), false);
    assert.equal(t.pending(), 'Loading weapons');
    t.set('guns', 1);
    assert.equal(t.value(), 1); assert.equal(t.done(), true); assert.equal(t.pending(), '');
});

test('a part never goes back, and bad numbers do not break the bar', () => {
    const t = L.createTracker();
    t.add('a', 1); t.set('a', 0.6); t.set('a', 0.2);
    assert.equal(t.value(), 0.6);
    for (const bad of [NaN, -4, undefined, 'x']) { t.set('a', bad); assert.equal(t.value(), 0.6, String(bad)); }
    t.set('a', 7); assert.equal(t.value(), 1);
    t.set('nope', 1);   // a part that was never added is ignored
    assert.equal(t.size(), 1);
    t.add('a', 5);      // adding twice keeps the first
    assert.equal(t.value(), 1);
});

test('the label is the part with the most work left', () => {
    const t = L.createTracker();
    t.add('map', 4, 'Loading the arena'); t.add('skins', 2, 'Loading skins'); t.add('fonts', 1, 'Loading fonts');
    t.set('map', 0.9);
    assert.equal(t.pending(), 'Loading skins');   // 2 left against 0.4 and 1
});

test('the bar eases towards the real value: it moves every frame, never goes back and never passes it', () => {
    let v = 0; const target = 0.8;
    for (let i = 0; i < 400; i++) {
        const n = L.ease(v, target, 1 / 60);
        assert.ok(n >= v && n <= target + 1e-12);
        v = n;
    }
    assert.ok(Math.abs(v - target) < 1e-6);
    assert.equal(L.ease(0.9, 0.5, 0.016), 0.9, 'a value that went down is not shown going down');
    assert.ok(L.ease(0, 0.001, 0.016) <= 0.001);
    assert.ok(L.ease(0, 1, 1 / 60) > 0.05, 'a first step is visible');
});

test('the page has the loading screen, the new wordmark and no grey lanes; the scripts are in order', () => {
    const html = read('index.html'), css = read('style.css');
    assert.ok(/id="ar-loader"/.test(html) && /class="ld-fill"/.test(html) && /class="ld-pct"/.test(html));
    assert.ok(/<symbol id="wm-blastridge"/.test(html) && /<use href="#wm-blastridge"\/>/.test(html));
    assert.ok(!/auth-lanes/.test(html) && !/auth-lanes/.test(css), 'the lines behind the logo are gone');
    assert.ok(html.indexOf('loader.js') > 0 && html.indexOf('loader.js') < html.indexOf('game.js'), 'loader.js before game.js');
    assert.ok(/<link rel="preload" href="\/images\/map\/vara\/copac_mic\.png"/.test(html), 'the backdrop sprites are preloaded');
    assert.ok(fs.existsSync(path.join(__dirname, '..', '..', 'public', 'images', 'blastridge-logo-256.png')));
    assert.ok(!/blastridge-logo\.png/.test(html), 'the pages use the small copy of the logo');
});

test('the game waits for the backdrop and for the match: sprites, skins, guns and the first frames', () => {
    const game = read('public/game.js'.replace('public/', '')), art = read('arena-art.js');
    assert.ok(/ARLoader\.boot\.set\('field', 1\)/.test(game), 'the backdrop reports to the boot screen');
    assert.ok(/_matchLoad = _beginMatchLoad\(data, playerImages, \(\) => _matchReady\(socket\)\)/.test(game), 'a match starts behind the loading screen and tells the server when it is gone (the 3-2-1 waits for it)');
    for (const part of ["'map'", "'zombies'", "'guns'", "'skins'", "'warm'"]) assert.ok(game.includes('ld.add(' + part), 'part ' + part);
    assert.ok(/_warmPlayerSprites\(/.test(game) && /_ld\.set\('warm'/.test(game), 'the game loop reports the warm-up');
    assert.ok(/_gunsProgress[\s\S]*?_gunLook\(w, sk\)/.test(game), 'the equipped weapon skin sprite is waited for, not the base gun');
    for (const f of ['lobbyProgress', 'mapProgress', 'zombieProgress']) assert.ok(new RegExp(f + ': ' + f).test(art), f);
});

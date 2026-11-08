// node --test tools/tests/chests.test.js
// public/chests.js: the types and their times, the gem price, the odds at the end of a match (every row adds up to 100, the places and waves that earn no chest,
// the shape of the odds the player asked for) and the slots.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../public/chests.js');

const MIN = 60000, HOUR = 60 * MIN;
// a deterministic random source for the tests
function seeded(seed) { let h = seed >>> 0; return () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9E3779B9) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }; }

test('five chests, each with its own waiting time, rarities in order', () => {
    assert.deepEqual(C.TYPES.map(t => t.id), ['wooden', 'silver', 'golden', 'diamond', 'mythical']);
    assert.deepEqual(C.TYPES.map(t => t.rarity), ['common', 'rare', 'epic', 'legendary', 'mythic']);
    assert.deepEqual(C.TYPES.map(t => t.ms), [30 * MIN, 3 * HOUR, 8 * HOUR, 12 * HOUR, 24 * HOUR]);
    assert.equal(C.SLOTS, 4);
    assert.ok(C.TYPES.every(t => C.CONTENT[t.id].length >= 2), 'every chest has cards');
});

test('gems: one for every started 10 minutes that are left, at least one while there is time, none when it is ready', () => {
    assert.equal(C.gemCost(0), 0);
    assert.equal(C.gemCost(1), 1);
    assert.equal(C.gemCost(10 * MIN), 1);
    assert.equal(C.gemCost(10 * MIN + 1), 2);
    assert.equal(C.gemCost(24 * HOUR), 144);
    assert.equal(C.gemCost(30 * MIN), 3);
});

test('status and time left: waiting is the whole time, opening counts down on the real clock, ready at the end', () => {
    const c = { id: 1, type: 'silver', got: 0, startedAt: null, readyAt: null };
    assert.equal(C.statusOf(c, 5), 'waiting'); assert.equal(C.remaining(c, 5), 3 * HOUR);
    c.startedAt = 1000; c.readyAt = 1000 + 3 * HOUR;
    assert.equal(C.statusOf(c, 1000 + HOUR), 'opening'); assert.equal(C.remaining(c, 1000 + HOUR), 2 * HOUR);
    assert.equal(C.statusOf(c, 1000 + 3 * HOUR), 'ready'); assert.equal(C.remaining(c, 1000 + 10 * HOUR), 0, 'time passes while nobody is connected');
});

test('every row of the odds adds up to 100 and the shares only grow towards the rarer chests', () => {
    const rows = [...Object.values(C.BR_DROP), ...C.PVE_DROP];
    for (const r of rows) {
        assert.equal(r.w.length, 5);
        assert.ok(Math.abs(r.w.reduce((a, b) => a + b, 0) - 100) < 1e-9, 'adds up to 100: ' + r.w);
        assert.ok(r.chance > 0 && r.chance <= 1);
    }
    for (const r of rows) assert.ok(r.w[4] <= 3, 'a mythical chest is 3% or less');
    // a better place: more chances, less wooden, more of the rarer ones
    for (let p = 5; p > 1; p--) {
        const a = C.BR_DROP[p], b = C.BR_DROP[p - 1];
        assert.ok(b.chance > a.chance && b.w[0] < a.w[0] && b.w[3] >= a.w[3] && b.w[4] >= a.w[4], 'place ' + (p - 1) + ' is better than ' + p);
    }
    for (let i = 1; i < C.PVE_DROP.length; i++) assert.ok(C.PVE_DROP[i].chance > C.PVE_DROP[i - 1].chance && C.PVE_DROP[i].w[0] < C.PVE_DROP[i - 1].w[0]);
});

test('a match that went badly earns no chest: BR below the 5th place, PvE below wave 10', () => {
    assert.equal(C.dropFor('br', { players: 20, placement: 6 }), null);
    assert.equal(C.dropFor('br', { players: 20, placement: 20 }), null);
    assert.equal(C.dropFor('br', {}), null);
    assert.equal(C.dropFor('br', { players: 20, placement: 1 }), C.BR_DROP[1]);
    assert.ok(C.dropFor('br', { players: 20, placement: 5 }));
    assert.equal(C.dropFor('pve', { wave: 9 }), null);
    assert.equal(C.dropFor('pve', { wave: 1 }), null);
    assert.ok(C.dropFor('pve', { wave: 10 }));
    assert.equal(C.dropFor('pve', { wave: 20, victory: true }), C.PVE_DROP[C.PVE_DROP.length - 1], 'a victory is the top row');
    assert.equal(C.dropFor('pve', { wave: 20, victory: false }), C.PVE_DROP[3], 'falling at wave 20 is not a victory');
    assert.equal(C.dropFor('x', {}), null);
});

test('about wave 15 the golden chest is the likeliest, and a win gives the rare ones the best chance', () => {
    const mid = C.dropFor('pve', { wave: 15 }).w;
    assert.equal(mid.indexOf(Math.max(...mid)), 2, 'golden is the biggest share in the middle of the run');
    const win = C.dropFor('br', { players: 20, placement: 1 });
    assert.ok(win.w[4] > 0 && win.w[4] <= 3);
    assert.equal(C.BR_DROP[5].w[4], 0, 'no mythical chest from a 5th place');
});

test('rolling: the shares come out about as the table says, the chance too, and the same random numbers give the same chest', () => {
    const rng = seeded(7), N = 40000, counts = {}; let drops = 0;
    for (let i = 0; i < N; i++) { const t = C.rollChest('br', { players: 20, placement: 1 }, rng); if (t) { drops++; counts[t] = (counts[t] || 0) + 1; } }
    assert.ok(Math.abs(drops / N - 0.85) < 0.01, 'chance ' + drops / N);
    C.TYPES.forEach((t, i) => assert.ok(Math.abs((counts[t.id] || 0) / drops - C.BR_DROP[1].w[i] / 100) < 0.012, t.id + ' ' + (counts[t.id] || 0) / drops));
    assert.equal(C.rollChest('br', { players: 20, placement: 9 }, seeded(1)), null);
    const a = C.rollChest('pve', { wave: 15 }, seeded(99)), b = C.rollChest('pve', { wave: 15 }, seeded(99));
    assert.equal(a, b);
});

test('the cards: coins and gems inside the ranges, a skin card names only its rarity, and wooden gives coins only', () => {
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) {
        for (const t of C.TYPES) {
            const cards = C.rollCards(t.id, rng), spec = C.CONTENT[t.id];
            assert.equal(cards.length, spec.length);
            cards.forEach((c, k) => {
                if (spec[k].coins) { assert.equal(c.kind, 'coins'); assert.ok(c.amount >= spec[k].coins[0] && c.amount <= spec[k].coins[1]); }
                else if (spec[k].gems) { assert.equal(c.kind, 'gems'); assert.ok(c.amount >= spec[k].gems[0] && c.amount <= spec[k].gems[1]); }
                else { assert.equal(c.kind, 'skin'); assert.equal(c.rarity, spec[k].skin); }
            });
        }
    }
    assert.ok(C.rollCards('wooden', rng).every(c => c.kind === 'coins'));
    assert.deepEqual(C.CONTENT.silver.filter(c => c.skin).map(c => c.skin), ['common']);
    assert.deepEqual(C.CONTENT.golden.filter(c => c.skin).map(c => c.skin), ['rare']);
    assert.deepEqual(C.CONTENT.diamond.filter(c => c.skin).map(c => c.skin), ['epic']);
    assert.deepEqual(C.CONTENT.mythical.filter(c => c.skin).map(c => c.skin), ['legendary']);
    assert.ok(C.CONTENT.wooden.concat(C.CONTENT.silver).every(c => !c.gems), 'gems only from the golden chest up: they stay hard to get');
});

test('slots: always four, junk is dropped, one chest opening at a time is how the server counts', () => {
    assert.equal(C.normalizeSlots(null).length, 4);
    assert.deepEqual(C.normalizeSlots('nope'), [null, null, null, null]);
    const s = C.normalizeSlots([{ id: 3, type: 'golden', got: 5, startedAt: 7, readyAt: 9 }, { type: 'plastic' }, null, 5, 'x']);
    assert.equal(s.length, 4); assert.equal(s[0].type, 'golden'); assert.equal(s[1], null); assert.equal(s[3], null);
    const slots = [{ id: 1, type: 'wooden', startedAt: 0, readyAt: 100 }, null, { id: 2, type: 'silver', startedAt: null, readyAt: null }, null];
    assert.equal(C.openingSlot(slots, 50), 0); assert.equal(C.openingSlot(slots, 150), -1, 'a ready chest is not opening');
    assert.equal(C.freeSlot(slots), 1); assert.equal(C.isFull(slots), false);
    assert.equal(C.isFull([{ type: 'wooden' }, { type: 'wooden' }, { type: 'wooden' }, { type: 'wooden' }]), true);
});

test('Battle Royale: a chest only from a match that started with at least 8 players (friends in a small room cannot hand each other chests)', () => {
    assert.equal(C.BR_MIN_PLAYERS, 8);
    for (const n of [1, 2, 3, 7]) { assert.equal(C.dropFor('br', { players: n, placement: 1 }), null, n + ' players'); assert.equal(C.rollChest('br', { players: n, placement: 1 }, () => 0), null); }
    assert.equal(C.dropFor('br', { players: 8, placement: 1 }), C.BR_DROP[1]);
    assert.equal(C.dropFor('br', { placement: 1 }), null, 'no player count: no chest');
    assert.equal(C.dropFor('br', { players: 'x', placement: 1 }), null);
});

test('PvE level: the chance x0.5 on the easy level, x1 on the medium one, x1.3 on the hard one (never above 1); the easy level cannot drop Diamond or Mythical', () => {
    const base = C.dropFor('pve', { wave: 15 });
    assert.equal(C.dropFor('pve', { wave: 15, diff: 'colossus' }), base, 'the medium level is the table as it is');
    assert.equal(C.dropFor('pve', { wave: 15, diff: 'nope' }), base);
    const easy = C.dropFor('pve', { wave: 15, diff: 'brood' }), hard = C.dropFor('pve', { wave: 15, diff: 'reaper' });
    assert.ok(Math.abs(easy.chance - base.chance * 0.5) < 1e-9); assert.ok(Math.abs(hard.chance - base.chance * 1.3) < 1e-9);
    assert.deepEqual(easy.w.slice(3), [0, 0]); assert.equal(easy.w[2], base.w[2] + base.w[3] + base.w[4]);
    assert.deepEqual(hard.w, base.w, 'the hard level changes the chance, not the shares');
    for (const diff of ['brood', 'colossus', 'reaper']) for (const wave of [10, 13, 15, 18]) for (const victory of [false, true]) {
        const d = C.dropFor('pve', { wave, victory, diff });
        assert.ok(d.chance <= 1 && Math.abs(d.w.reduce((a, b) => a + b, 0) - 100) < 1e-9 && d.w[4] <= 3, diff + ' ' + wave);
    }
    assert.equal(C.dropFor('pve', { wave: 20, victory: true, diff: 'reaper' }).chance, 1, 'capped at 1');
    assert.equal(C.dropFor('pve', { wave: 9, diff: 'reaper' }), null, 'below wave 10 nothing, on any level');
    // rolled: the easy level never gives a diamond or a mythical chest
    const rng = seeded(11);
    for (let i = 0; i < 5000; i++) { const t = C.rollChest('pve', { wave: 20, victory: true, diff: 'brood' }, rng); assert.ok(t !== 'diamond' && t !== 'mythical'); }
});

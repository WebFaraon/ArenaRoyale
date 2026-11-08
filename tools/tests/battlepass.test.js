// node --test tools/tests/battlepass.test.js
// public/battlepass.js: 30 tiers of the same XP, the two tracks and the rules the player asked for (a Blast Tier reward at every tier, one exclusive Season skin
// at tier 1 and the last tier, the free track ends with one Season skin and does not pay at every tier), XP from missions, claiming.
const test = require('node:test');
const assert = require('node:assert/strict');
const BP = require('../../public/battlepass.js');
const skins = require('../../public/data/skins.json').skins;
const wskins = require('../../public/data/weapon-skins.json').skins;

test('30 tiers, every one 1000 XP: tier 1 is open from the start and the last tier needs 29,000', () => {
    assert.equal(BP.TIERS, 30); assert.equal(BP.XP_PER_TIER, 1000);
    assert.equal(BP.tierOf(0), 1); assert.equal(BP.tierOf(999), 1); assert.equal(BP.tierOf(1000), 2);
    assert.equal(BP.tierOf(6640), 7); assert.equal(BP.tierOf(29000), 30); assert.equal(BP.tierOf(999999), 30);
    assert.equal(BP.intoTier(6640), 640); assert.equal(BP.intoTier(999999), 1000);
    for (let t = 1; t < 30; t++) assert.equal(BP.tierOf(t * 1000) - BP.tierOf(t * 1000 - 1), 1, 'the same step at tier ' + t);
});

test('Blast Tier pays at every tier, the free track only at some', () => {
    for (let t = 1; t <= 30; t++) assert.ok(Object.keys(BP.BLAST[t]).length, 'Blast Tier, tier ' + t);
    const free = Object.keys(BP.FREE).map(Number);
    assert.ok(free.length > 0 && free.length < 30, 'the free track has gaps: ' + free.length);
    assert.ok(free.includes(30), 'and ends with a reward');
    assert.ok(Object.keys(BP.FREE).length < Object.keys(BP.BLAST).length);
});

test('the Season skins: one free at the end of the free track, one exclusive at tier 1 of Blast Tier, the others at 10 and 20, Golazo at the end', () => {
    const season = skins.filter(s => s.rarity === 'season').map(s => s.id).sort();
    assert.equal(season.length, 4);
    const given = [];
    for (const [track, table] of Object.entries(BP.TRACKS)) for (const [t, r] of Object.entries(table)) if (r.charSkin) given.push({ track, tier: +t, id: r.charSkin });
    assert.deepEqual(given.map(g => g.id).sort(), season, 'every Season skin is handed out exactly once');
    assert.deepEqual(given.filter(g => g.track === 'free').map(g => g.tier), [30], 'only one in the free track, at tier 30');
    assert.deepEqual(given.filter(g => g.track === 'blast').map(g => g.tier).sort((a, b) => a - b), [1, 10, 20]);
    assert.deepEqual(BP.BLAST[30], { weaponSkin: 'sg_golazo' });
    assert.ok(wskins.find(s => s.id === 'sg_golazo' && s.season), 'Golazo is a Season skin of Boomer');
    // nothing else than Season skins is a skin reward
    for (const g of given) assert.equal(skins.find(s => s.id === g.id).rarity, 'season');
});

test('gems stay rare: a handful over the whole pass', () => {
    let gems = 0;
    for (const table of Object.values(BP.TRACKS)) for (const r of Object.values(table)) gems += r.diamonds || 0;
    assert.ok(gems > 0 && gems <= 20, 'gems in the pass: ' + gems);
});

test('XP of a mission by what it pays: 100 simple, 200 a weapon in a mode, 350 hard; the six missions of a day come to about one tier', () => {
    const { POOL } = require('../../missions.js');
    for (const m of POOL) {
        const xp = BP.xpForMission(m.coins);
        if (m.slot === 'hard') assert.equal(xp, 350, m.id);
        if (m.slot === 'modeweapon') assert.equal(xp, 200, m.id);
        if (m.slot === 'general' || m.slot === 'weapon') assert.equal(xp, 100, m.id);
    }
    // any day: general + br + pve + weapon + modeweapon + hard
    const slots = ['general', 'br', 'pve', 'weapon', 'modeweapon', 'hard'];
    const min = slots.reduce((s, sl) => s + Math.min(...POOL.filter(m => m.slot === sl).map(m => BP.xpForMission(m.coins))), 0);
    const max = slots.reduce((s, sl) => s + Math.max(...POOL.filter(m => m.slot === sl).map(m => BP.xpForMission(m.coins))), 0);
    assert.ok(min >= 900 && max >= 1000, `a day gives ${min} to ${max} XP`);
});

test('claiming: only tiers reached, Blast Tier only when bought, once each', () => {
    const bp = BP.normalize({ xp: 5000 });   // tier 6
    assert.equal(BP.canClaim(bp, 'free', 3).ok, true);
    assert.equal(BP.canClaim(bp, 'free', 9).error, 'Tier not reached yet');
    assert.equal(BP.canClaim(bp, 'free', 4).error, 'No such reward', 'a free tier without a reward');
    assert.equal(BP.canClaim(bp, 'blast', 1).error, 'Blast Tier is locked');
    assert.equal(BP.canClaim(bp, 'vip', 1).ok, false); assert.equal(BP.canClaim(bp, 'free', 1.5).ok, false);
    bp.blast = true; assert.equal(BP.canClaim(bp, 'blast', 1).ok, true, 'buying gives the tiers already passed');
    bp.claimed.free.push(3); assert.equal(BP.canClaim(bp, 'free', 3).error, 'Already claimed');
    const list = BP.claimable(bp);
    assert.equal(list.filter(x => x.track === 'blast').length, 6); assert.equal(list.filter(x => x.track === 'free').length, 1, 'free: 6 is the other one, 3 is claimed');
});

test('normalize keeps only what exists', () => {
    const bp = BP.normalize({ xp: -5, blast: 'yes', claimed: { free: [3, 3, 4, 99, 'x'], blast: [1, 2] } });
    assert.deepEqual(bp, { xp: 0, blast: false, claimed: { free: [3], blast: [1, 2] } });
    assert.deepEqual(BP.normalize(null), { xp: 0, blast: false, claimed: { free: [], blast: [] } });
});

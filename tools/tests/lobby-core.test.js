// node --test tools/tests/lobby-core.test.js
// lobby-core.js: what the account keeps (chests, Battle Pass, inbox) as pure functions on a `work` object: one chest opening at a time, gems to skip, a
// duplicate skin turning into coins, rewards given once, nothing changed when an answer is a refusal.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../lobby-core.js');
const C = require('../../public/chests.js');
const BP = require('../../public/battlepass.js');

const MIN = 60000, HOUR = 60 * MIN;
const seeded = seed => { let h = seed >>> 0; return () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9E3779B9) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }; };
const catalog = {
    pools: { common: [{ kind: 'char', id: 'c1' }], rare: [{ kind: 'char', id: 'r1' }, { kind: 'weapon', id: 'w1' }], epic: [{ kind: 'weapon', id: 'e1' }], legendary: [{ kind: 'char', id: 'l1' }] },
    info: (kind, id) => ({ c1: { name: 'Common One', rarity: 'common', coins: 205 }, r1: { name: 'Rare One', rarity: 'rare', coins: 500 }, w1: { name: 'Weapon One', rarity: 'rare', coins: 0 }, e1: { name: 'Epic One', rarity: 'epic', coins: 0 }, l1: { name: 'Legend One', rarity: 'legendary', coins: 0 }, referee: { name: 'Referee', rarity: 'season', coins: 0 }, sg_golazo: { name: 'Golazo', rarity: 'epic', coins: 0 } })[id],
};
const fresh = (extra = {}) => ({ coins: 1000, diamonds: 0, chars: new Set(['rookie']), wskins: new Set(), lobby: L.normalizeLobby(null), ...extra });
const snap = w => JSON.stringify({ c: w.coins, d: w.diamonds, ch: [...w.chars], ws: [...w.wskins], l: w.lobby });

test('a new account: four empty slots, no Battle Pass XP, an empty inbox', () => {
    const w = fresh();
    assert.deepEqual(w.lobby.slots, [null, null, null, null]);
    assert.deepEqual(w.lobby.bp, { xp: 0, blast: false, claimed: { free: [], blast: [] } });
    assert.deepEqual(w.lobby.inbox, []);
});

test('a chest goes into the first free slot; with all four taken nothing is lost and nothing is added', () => {
    const w = fresh();
    for (let i = 0; i < 4; i++) { const r = L.grantChest(w, 'wooden', 1000); assert.equal(r.ok, true); assert.equal(r.slot, i); }
    const before = snap(w);
    const r = L.grantChest(w, 'mythical', 2000);
    assert.equal(r.ok, false); assert.equal(r.full, true);
    assert.equal(snap(w), before);
    assert.equal(L.grantChest(fresh(), 'plastic', 1).ok, false);
    assert.deepEqual(w.lobby.slots.map(c => c.id), [1, 2, 3, 4], 'every chest has its own id');
});

test('only one chest opens at a time; its time runs on the clock; it opens free when the time is up', () => {
    const w = fresh();
    L.grantChest(w, 'silver', 0); L.grantChest(w, 'wooden', 0);
    let r = L.startChest(w, 0, 1000);
    assert.equal(r.ok, true); assert.equal(w.lobby.slots[0].readyAt, 1000 + 3 * HOUR);
    r = L.startChest(w, 1, 2000); assert.equal(r.ok, false); assert.match(r.error, /already opening/);
    assert.equal(L.startChest(w, 0, 3000).ok, false, 'the one that is opening cannot be started again');
    assert.equal(L.startChest(w, 3, 3000).ok, false, 'an empty slot'); assert.equal(L.startChest(w, 9, 3000).ok, false); assert.equal(L.startChest(w, 'x', 3000).ok, false);
    // not ready: refused, nothing changes
    const before = snap(w);
    r = L.openChest(w, 0, 1000 + HOUR, {}, seeded(1), catalog);
    assert.equal(r.ok, false); assert.equal(snap(w), before);
    // ready, hours later and nobody connected: free
    r = L.openChest(w, 0, 1000 + 40 * HOUR, {}, seeded(1), catalog);
    assert.equal(r.ok, true); assert.equal(r.paid, 0); assert.equal(w.lobby.slots[0], null); assert.equal(w.diamonds, r.cards.filter(c => c.kind === 'gems').reduce((a, c) => a + c.amount, 0));
    // the slot is free: the next chest can start
    assert.equal(L.startChest(w, 1, 1000 + 40 * HOUR).ok, true);
});

test('another chest while one is opening is opened at once for gems, by the time it still needs', () => {
    const w = fresh({ diamonds: 20 });
    L.grantChest(w, 'wooden', 0); L.grantChest(w, 'silver', 0);
    L.startChest(w, 1, 0);   // the silver one is opening
    const before = snap(w);
    let r = L.openChest(w, 0, 0, {}, seeded(2), catalog); assert.equal(r.ok, false, 'not without paying');
    assert.equal(snap(w), before);
    r = L.openChest(w, 0, 0, { instant: true }, seeded(2), catalog);   // a wooden chest: 30 min = 3 gems
    assert.equal(r.ok, true); assert.equal(r.paid, 3);
    assert.equal(w.lobby.slots[0], null);
    assert.ok(w.lobby.slots[1], 'the one that was opening is still there');
    // the opening one can be sped up too: 2 h 59 min left = 18 gems
    w.diamonds = 20;
    r = L.openChest(w, 1, 1 * MIN, { instant: true }, seeded(3), catalog);
    assert.equal(r.paid, C.gemCost(3 * HOUR - MIN)); assert.equal(r.paid, 18);
});

test('not enough gems: refused, with the price, and nothing changes', () => {
    const w = fresh({ diamonds: 2 });
    L.grantChest(w, 'golden', 0);
    const before = snap(w);
    const r = L.openChest(w, 0, 0, { instant: true }, seeded(4), catalog);
    assert.equal(r.ok, false); assert.equal(r.error, 'Not enough gems'); assert.equal(r.cost, 48);
    assert.equal(snap(w), before);
});

test('a chest gives its cards: coins and gems added, a new skin owned, the chest gone', () => {
    const w = fresh({ coins: 0 });
    L.grantChest(w, 'golden', 0);
    const r = L.openChest(w, 0, 99 * HOUR, { instant: true }, seeded(5), catalog);   // it was never started: still openable for gems? no gems -> see below
    assert.equal(r.ok, false, 'a chest that was never started cannot be opened for free');
    w.diamonds = 100;
    const r2 = L.openChest(w, 0, 0, { instant: true }, seeded(5), catalog);
    assert.equal(r2.ok, true);
    const coins = r2.cards.find(c => c.kind === 'coins'), gems = r2.cards.find(c => c.kind === 'gems'), skin = r2.cards.find(c => c.kind === 'skin');
    assert.ok(coins.amount >= 250 && coins.amount <= 500);
    assert.ok(gems.amount >= 1 && gems.amount <= 2);
    assert.equal(skin.rarity, 'rare'); assert.equal(skin.duplicate, 0);
    assert.equal(w.coins, coins.amount); assert.equal(w.diamonds, 100 - 48 + gems.amount);
    assert.ok(skin.skinKind === 'char' ? w.chars.has(skin.id) : w.wskins.has(skin.id));
});

test('a skin already owned becomes coins: its own coin price, or what its rarity gives', () => {
    // silver: a common skin; own it already: 205 coins (its price)
    let w = fresh({ coins: 0, diamonds: 100, chars: new Set(['rookie', 'c1']) });
    L.grantChest(w, 'silver', 0);
    let r = L.openChest(w, 0, 0, { instant: true }, seeded(6), catalog);
    const skin = r.cards.find(c => c.kind === 'skin');
    assert.equal(skin.id, 'c1'); assert.equal(skin.duplicate, 205);
    assert.equal(w.coins, r.cards.filter(c => c.kind === 'coins').reduce((a, c) => a + c.amount, 0) + 205);
    // diamond chest: epic weapon skin e1 owned, no coin price: the rarity's coins
    w = fresh({ coins: 0, diamonds: 1000, wskins: new Set(['e1']) });
    L.grantChest(w, 'diamond', 0);
    r = L.openChest(w, 0, 0, { instant: true }, seeded(7), catalog);
    const e = r.cards.find(c => c.kind === 'skin');
    assert.equal(e.duplicate, C.DUP_COINS.epic); assert.ok(w.wskins.has('e1'));
});

test('a pool that is empty turns the skin card into coins instead of nothing', () => {
    const w = fresh({ coins: 0, diamonds: 1000 });
    L.grantChest(w, 'mythical', 0);
    const r = L.openChest(w, 0, 0, { instant: true }, seeded(8), { ...catalog, pools: { ...catalog.pools, legendary: [] } });
    assert.equal(r.ok, true); assert.ok(r.cards.every(c => c.kind !== 'skin')); assert.ok(r.cards.some(c => c.amount === C.DUP_COINS.legendary));
});

test('Battle Pass: XP adds up, tiers are claimed once, Blast Tier is locked until bought and then also gives the tiers passed', () => {
    const w = fresh({ coins: 0 });
    assert.deepEqual(L.addXp(w, 2500), { ok: true, xp: 2500, tier: 3, tiersGained: 2 });
    assert.equal(L.claimTier(w, 'free', 3, catalog).ok, true); assert.equal(w.coins, 100);
    const before = snap(w);
    assert.equal(L.claimTier(w, 'free', 3, catalog).error, 'Already claimed');
    assert.equal(L.claimTier(w, 'free', 6, catalog).error, 'Tier not reached yet');
    assert.equal(L.claimTier(w, 'blast', 1, catalog).error, 'Blast Tier is locked');
    assert.equal(snap(w), before);
    assert.equal(L.buyBlast(w).ok, true); assert.equal(L.buyBlast(w).ok, false);
    const r = L.claimTier(w, 'blast', 1, catalog);   // tier 1 of Blast Tier: the exclusive skin, available at once
    assert.equal(r.ok, true); assert.ok(w.chars.has('goalkeeper'));
    assert.equal(r.cards[0].kind, 'skin'); assert.equal(r.cards[0].duplicate, 0);
    assert.equal(L.claimTier(w, 'blast', 2, catalog).ok, true); assert.equal(L.claimTier(w, 'blast', 3, catalog).ok, true);
    assert.equal(L.claimTier(w, 'blast', 4, catalog).error, 'Tier not reached yet');
    // the end of the pass: the free Season skin and Golazo
    L.addXp(w, 99999);
    assert.equal(L.claimTier(w, 'free', 30, catalog).ok, true); assert.ok(w.chars.has('referee'));
    assert.equal(L.claimTier(w, 'blast', 30, catalog).ok, true); assert.ok(w.wskins.has('sg_golazo'));
});

test('inbox: a message with a reward is claimed once and cannot be deleted before; one without is read and deleted', () => {
    const w = fresh({ coins: 0 });
    const a = L.inboxAdd(w, { title: 'Welcome', text: 'Hi' }, 10).message, b = L.inboxAdd(w, { title: 'Gift', text: 'For you', reward: { coins: 300, diamonds: 2, junk: 1 } }, 20).message;
    assert.equal(a.reward, null); assert.deepEqual(b.reward, { coins: 300, diamonds: 2 });
    assert.equal(L.inboxClaim(w, a.id, catalog).error, 'Nothing to claim');
    assert.equal(L.inboxDelete(w, b.id).error, 'Claim the reward first');
    const r = L.inboxClaim(w, b.id, catalog);
    assert.equal(r.ok, true); assert.equal(w.coins, 300); assert.equal(w.diamonds, 2);
    assert.equal(L.inboxClaim(w, b.id, catalog).error, 'Already claimed'); assert.equal(w.coins, 300);
    assert.equal(L.inboxRead(w, a.id).ok, true); assert.equal(w.lobby.inbox[0].read, true);
    assert.equal(L.inboxDelete(w, b.id).ok, true); assert.equal(L.inboxDelete(w, a.id).ok, true); assert.deepEqual(w.lobby.inbox, []);
    assert.equal(L.inboxDelete(w, 999).ok, false);
});

test('the inbox keeps the last 50: the oldest message that needs nothing goes first, an unclaimed reward stays', () => {
    const w = fresh();
    L.inboxAdd(w, { title: 'Reward', reward: { coins: 5 } }, 1);
    for (let i = 0; i < 60; i++) L.inboxAdd(w, { title: 'm' + i }, 2 + i);
    assert.equal(w.lobby.inbox.length, L.INBOX_MAX);
    assert.equal(w.lobby.inbox[0].title, 'Reward', 'the unclaimed reward is kept');
    assert.equal(w.lobby.inbox[1].title, 'm11');
});

test('the lobby state survives a round trip through JSON, and junk becomes a clean state', () => {
    const w = fresh({ diamonds: 50 });
    L.grantChest(w, 'diamond', 5); L.startChest(w, 0, 10); L.addXp(w, 1234); L.inboxAdd(w, { title: 't', reward: { coins: 1 } }, 3);
    const again = L.normalizeLobby(JSON.stringify(w.lobby));
    assert.deepEqual(again, w.lobby);
    assert.deepEqual(L.normalizeLobby('not json'), L.normalizeLobby(null));
    assert.deepEqual(L.normalizeLobby({ slots: 5, bp: 'x', inbox: [1, null, { id: 'z' }] }).inbox, []);
    const pub = L.publicLobby(w, 77);
    assert.equal(pub.now, 77); assert.equal(pub.slots.length, 4); assert.equal(pub.inbox[0].title, 't'); assert.deepEqual(Object.keys(pub.slots[0]).sort(), ['id', 'readyAt', 'startedAt', 'type']);
});

test('the end of a match: no chest for a bad one, none while the four slots are taken, a chest into the first free slot otherwise', () => {
    const always = () => 0;   // the lowest roll: it drops, and it is a wooden chest
    let w = fresh();
    assert.deepEqual(L.matchChest(w, 'br', { players: 20, placement: 12 }, always, 1), { ok: true, notEligible: true });
    assert.deepEqual(L.matchChest(w, 'pve', { wave: 4, victory: false }, always, 1), { ok: true, notEligible: true });
    assert.deepEqual(w.lobby.slots, [null, null, null, null]);
    assert.deepEqual(L.matchChest(w, 'br', { players: 2, placement: 1 }, always, 1), { ok: true, notEligible: true }, 'a small room gives no chest');
    let r = L.matchChest(w, 'br', { players: 20, placement: 3 }, always, 1);
    assert.equal(r.ok, true); assert.equal(r.chest.type, 'wooden'); assert.equal(r.slot, 0);
    assert.equal(L.matchChest(w, 'br', { players: 20, placement: 3 }, () => 0.999999, 1).none, true, 'a roll above the chance: no chest this time');
    for (let i = 0; i < 3; i++) L.matchChest(w, 'pve', { wave: 12 }, always, 1);
    const before = snap(w);
    r = L.matchChest(w, 'pve', { wave: 20, victory: true }, always, 2);
    assert.deepEqual(r, { ok: true, full: true }); assert.equal(snap(w), before, 'full: nothing is given, nothing is lost');
    w.lobby.slots[2] = null;
    r = L.matchChest(w, 'pve', { wave: 20, victory: true }, always, 3);
    assert.equal(r.slot, 2);
});

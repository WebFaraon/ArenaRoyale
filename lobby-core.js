// What an account keeps besides its coins: the chests (4 slots), the Battle Pass and the inbox. Pure, only on the server: server.js reads the account's row into a
// `work` object, one of these functions changes it, and server.js writes it back in one update (so a chest and what comes out of it are saved together).
// tools/tests/lobby-core.test.js tests it.
//
//   work = { coins, diamonds, chars: Set of owned character skin ids, wskins: Set of owned weapon skin ids,
//            lobby: { slots: [chest|null x4], nextChest, bp: { xp, blast, claimed }, inbox: [message], nextMsg } }
//   catalog = { pools: { common|rare|epic|legendary: [{ kind: 'char'|'weapon', id }] }, info(kind, id) -> { name, rarity, coins } | null }
// Every function answers { ok: true, ... } and changes `work`, or { ok: false, error } and leaves it as it was.
'use strict';
const Chests = require('./public/chests.js');
const BP = require('./public/battlepass.js');

const INBOX_MAX = 50;

function normalizeLobby(raw) {
    let s = raw;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch { s = null; } }
    s = s && typeof s === 'object' ? s : {};
    const slots = Chests.normalizeSlots(s.slots);
    let nextChest = Math.max(1, Math.floor(+s.nextChest) || 1);
    for (const c of slots) if (c) { if (!c.id) c.id = nextChest; if (c.id >= nextChest) nextChest = c.id + 1; }
    const inbox = (Array.isArray(s.inbox) ? s.inbox : []).filter(m => m && typeof m === 'object' && Number.isInteger(m.id) && m.id > 0).slice(-INBOX_MAX).map(m => ({
        id: m.id, ts: +m.ts || 0, title: String(m.title || '').slice(0, 60), text: String(m.text || '').slice(0, 300),
        reward: m.reward && typeof m.reward === 'object' ? sanitizeReward(m.reward) : null, claimed: m.claimed === true, read: m.read === true,
    }));
    let nextMsg = Math.max(1, Math.floor(+s.nextMsg) || 1);
    for (const m of inbox) if (m.id >= nextMsg) nextMsg = m.id + 1;
    return { slots, nextChest, bp: BP.normalize(s.bp), inbox, nextMsg };
}
function sanitizeReward(r) {
    const out = {};
    if (Number.isInteger(r.coins) && r.coins > 0) out.coins = r.coins;
    if (Number.isInteger(r.diamonds) && r.diamonds > 0) out.diamonds = r.diamonds;
    if (typeof r.charSkin === 'string') out.charSkin = r.charSkin;
    if (typeof r.weaponSkin === 'string') out.weaponSkin = r.weaponSkin;
    return out;
}

// ---- skins ----
const owns = (work, kind, id) => (kind === 'char' ? work.chars : work.wskins).has(id);
function giveSkin(work, kind, id) { (kind === 'char' ? work.chars : work.wskins).add(id); }

// One card of a chest or of a reward, as the client shows it
//   { kind: 'coins', amount } | { kind: 'gems', amount } | { kind: 'skin', skinKind, id, name, rarity, duplicate: coins (0 = new) }
function applySkin(work, catalog, skinKind, id, rarity) {
    const info = catalog.info(skinKind, id) || { name: id, rarity, coins: 0 };
    const card = { kind: 'skin', skinKind, id, name: info.name, rarity: info.rarity || rarity, duplicate: 0 };
    if (owns(work, skinKind, id)) {
        card.duplicate = info.coins > 0 ? info.coins : (Chests.DUP_COINS[card.rarity] || 0);
        work.coins += card.duplicate;
    } else giveSkin(work, skinKind, id);
    return card;
}

// ---- chests ----
function grantChest(work, type, now) {
    const L = work.lobby;
    if (!Chests.isType(type)) return { ok: false, error: 'No such chest' };
    const i = Chests.freeSlot(L.slots);
    if (i < 0) return { ok: false, full: true, error: 'All the slots are full' };
    L.slots[i] = { id: L.nextChest++, type, got: now, startedAt: null, readyAt: null };
    return { ok: true, slot: i, chest: L.slots[i] };
}
// The end of a match (mode 'br': info.placement; 'pve': info.wave, info.victory): a chest drops by how it went (Chests.dropFor / rollChest) and goes into a free slot.
// { ok: true, notEligible } a match that earns nothing; { ok: true, full } it could have, but all four slots are taken (nothing is lost, nothing is given);
// { ok: true, none } not this time; { ok: true, chest, slot } a chest.
function matchChest(work, mode, info, rng, now) {
    if (!Chests.dropFor(mode, info)) return { ok: true, notEligible: true };
    if (Chests.isFull(work.lobby.slots)) return { ok: true, full: true };
    const type = Chests.rollChest(mode, info, rng);
    if (!type) return { ok: true, none: true };
    const g = grantChest(work, type, now);
    return g.ok ? { ok: true, chest: g.chest, slot: g.slot } : g;
}
function startChest(work, slot, now) {
    const L = work.lobby, c = L.slots[slot];
    if (!Number.isInteger(slot) || slot < 0 || slot >= Chests.SLOTS || !c) return { ok: false, error: 'No chest there' };
    if (Chests.statusOf(c, now) !== 'waiting') return { ok: false, error: 'It is already opening' };
    if (Chests.openingSlot(L.slots, now) >= 0) return { ok: false, error: 'Another chest is already opening' };
    c.startedAt = now; c.readyAt = now + Chests.BY_ID[c.type].ms;
    return { ok: true, chest: c };
}
// Opens the chest in `slot`: free when its time is up, for gems (Chests.gemCost of what is left) with opts.instant. Rolls the cards and gives them.
function openChest(work, slot, now, opts, rng, catalog) {
    const L = work.lobby, c = L.slots[slot];
    if (!Number.isInteger(slot) || slot < 0 || slot >= Chests.SLOTS || !c) return { ok: false, error: 'No chest there' };
    const status = Chests.statusOf(c, now);
    let paid = 0;
    if (status !== 'ready') {
        if (!(opts && opts.instant)) return { ok: false, error: 'It is not ready yet' };
        paid = Chests.gemCost(Chests.remaining(c, now));
        if (work.diamonds < paid) return { ok: false, error: 'Not enough gems', cost: paid };
    }
    work.diamonds -= paid;
    const cards = [];
    for (const card of Chests.rollCards(c.type, rng)) {
        if (card.kind === 'coins') { work.coins += card.amount; cards.push(card); }
        else if (card.kind === 'gems') { work.diamonds += card.amount; cards.push(card); }
        else {
            const pool = catalog.pools[card.rarity] || [];
            const pick = pool.length ? pool[Math.floor(rng() * pool.length)] : null;
            if (!pick) { const coins = Chests.DUP_COINS[card.rarity] || 0; work.coins += coins; cards.push({ kind: 'coins', amount: coins }); }
            else cards.push(applySkin(work, catalog, pick.kind, pick.id, card.rarity));
        }
    }
    L.slots[slot] = null;
    return { ok: true, type: c.type, cards, paid };
}

// ---- Battle Pass ----
function addXp(work, xp) {
    const bp = work.lobby.bp, before = BP.tierOf(bp.xp);
    bp.xp += Math.max(0, Math.floor(xp) || 0);
    return { ok: true, xp: bp.xp, tier: BP.tierOf(bp.xp), tiersGained: BP.tierOf(bp.xp) - before };
}
function giveReward(work, catalog, reward) {
    const cards = [];
    if (reward.coins) { work.coins += reward.coins; cards.push({ kind: 'coins', amount: reward.coins }); }
    if (reward.diamonds) { work.diamonds += reward.diamonds; cards.push({ kind: 'gems', amount: reward.diamonds }); }
    if (reward.charSkin) cards.push(applySkin(work, catalog, 'char', reward.charSkin, 'epic'));
    if (reward.weaponSkin) cards.push(applySkin(work, catalog, 'weapon', reward.weaponSkin, 'epic'));
    return cards;
}
function claimTier(work, track, tier, catalog) {
    const bp = work.lobby.bp, can = BP.canClaim(bp, track, tier);
    if (!can.ok) return can;
    bp.claimed[track].push(tier); bp.claimed[track].sort((a, b) => a - b);
    return { ok: true, track, tier, cards: giveReward(work, catalog, BP.TRACKS[track][tier]) };
}
function buyBlast(work) {
    const bp = work.lobby.bp;
    if (bp.blast) return { ok: false, error: 'You already have Blast Tier' };
    bp.blast = true;
    return { ok: true };
}

// ---- inbox ----
function inboxAdd(work, msg, now) {
    const L = work.lobby;
    const m = { id: L.nextMsg++, ts: now, title: String(msg.title || '').slice(0, 60), text: String(msg.text || '').slice(0, 300), reward: msg.reward ? sanitizeReward(msg.reward) : null, claimed: false, read: false };
    if (m.reward && !Object.keys(m.reward).length) m.reward = null;
    L.inbox.push(m);
    while (L.inbox.length > INBOX_MAX) {   // the oldest one that needs nothing goes first
        const i = L.inbox.findIndex(x => !x.reward || x.claimed);
        L.inbox.splice(i >= 0 ? i : 0, 1);
    }
    return { ok: true, message: m };
}
const findMsg = (work, id) => work.lobby.inbox.find(m => m.id === id);
function inboxClaim(work, id, catalog) {
    const m = findMsg(work, id);
    if (!m) return { ok: false, error: 'No such message' };
    if (!m.reward) return { ok: false, error: 'Nothing to claim' };
    if (m.claimed) return { ok: false, error: 'Already claimed' };
    m.claimed = true; m.read = true;
    return { ok: true, id, cards: giveReward(work, catalog, m.reward) };
}
function inboxRead(work, id) { const m = findMsg(work, id); if (!m) return { ok: false, error: 'No such message' }; m.read = true; return { ok: true }; }
function inboxDelete(work, id) {
    const L = work.lobby, i = L.inbox.findIndex(m => m.id === id);
    if (i < 0) return { ok: false, error: 'No such message' };
    if (L.inbox[i].reward && !L.inbox[i].claimed) return { ok: false, error: 'Claim the reward first' };
    L.inbox.splice(i, 1);
    return { ok: true };
}

// What the client gets (times are the server's clock: `now` goes with it, the client keeps the difference)
function publicLobby(work, now) {
    const L = work.lobby;
    return {
        now, coins: work.coins, diamonds: work.diamonds,
        slots: L.slots.map(c => c && { id: c.id, type: c.type, startedAt: c.startedAt, readyAt: c.readyAt }),
        bp: { xp: L.bp.xp, blast: L.bp.blast, claimed: L.bp.claimed },
        inbox: L.inbox.slice().reverse(),   // the newest first
    };
}

module.exports = { INBOX_MAX, normalizeLobby, sanitizeReward, grantChest, matchChest, startChest, openChest, addXp, claimTier, buyBlast, giveReward, inboxAdd, inboxClaim, inboxRead, inboxDelete, publicLobby };

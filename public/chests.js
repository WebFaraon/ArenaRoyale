// Chests (ARChests): pure, no DOM, no server: the server and the client load the same file (UMD), tools/tests/chests.test.js tests it.
//
// A chest is { id, type, got, startedAt, readyAt }: it waits in one of 4 slots, one at a time can be opening, and the time is the real clock (readyAt is a
// timestamp the server keeps, so it runs while nobody is logged in). A chest still waiting can be opened at once for gems (1 gem for every started 10 minutes
// that are left), and so can the one that is opening. What is inside is rolled when it is opened, not when it drops.
// The numbers (times, odds, what is inside) are provisional: they are all in this file.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ARChests = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const MIN = 60 * 1000, HOUR = 60 * MIN;
    const SLOTS = 4;
    const GEM_MS = 10 * MIN;   // one gem for every started 10 minutes that are left

    // rarity = the colours of the game (common ... mythic); ms = how long it takes to open
    const TYPES = [
        { id: 'wooden',   name: 'Wooden',   rarity: 'common',    ms: 30 * MIN },
        { id: 'silver',   name: 'Silver',   rarity: 'rare',      ms: 3 * HOUR },
        { id: 'golden',   name: 'Golden',   rarity: 'epic',      ms: 8 * HOUR },
        { id: 'diamond',  name: 'Diamond',  rarity: 'legendary', ms: 12 * HOUR },
        { id: 'mythical', name: 'Mythical', rarity: 'mythic',    ms: 24 * HOUR },
    ];
    const BY_ID = Object.fromEntries(TYPES.map(t => [t.id, t]));
    const isType = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id);

    // What is inside: a list of cards, revealed one by one (the best last). { coins: [min, max] } and { gems: [min, max] } are rolled with an even chance
    // between the two; { skin: rarity } is one skin of that rarity (a character skin or a weapon skin, both pools together; the Season skins and the
    // mythic weapon skins are not in chests).
    const CONTENT = {
        wooden:   [{ coins: [60, 120] }, { coins: [60, 120] }],
        silver:   [{ coins: [120, 250] }, { coins: [120, 250] }, { skin: 'common' }],
        golden:   [{ coins: [250, 500] }, { gems: [1, 2] }, { skin: 'rare' }],
        diamond:  [{ coins: [500, 900] }, { gems: [2, 4] }, { skin: 'epic' }],
        mythical: [{ coins: [900, 1500] }, { gems: [5, 10] }, { skin: 'legendary' }],
    };

    // A skin that is already owned turns into coins: its own coin price when it has one, otherwise what its rarity gets here
    // (the epic and legendary skins are priced in gems, which stay hard to get, so they give coins instead; the legendary number is a placeholder).
    const DUP_COINS = { common: 205, rare: 640, epic: 2400, legendary: 7200 };

    // Odds at the end of a match. A match that went badly gives no chest (the coins and the XP of the match still come). Each row: the chance that a chest
    // drops at all, then the share of each type among the chests that drop: [wooden, silver, golden, diamond, mythical] (per cent, 100 in all).
    const BR_DROP = {   // by the place the player finished in (1 = the winner); 6th and below: none
        5: { chance: 0.30, w: [70, 25, 5, 0, 0] },
        4: { chance: 0.40, w: [58, 30, 10, 2, 0] },
        3: { chance: 0.50, w: [45, 32, 17, 5.5, 0.5] },
        2: { chance: 0.65, w: [32, 33, 22, 12, 1] },
        1: { chance: 0.85, w: [20, 30, 28, 19, 3] },
    };
    const PVE_DROP = [   // by the wave reached (a victory counts as the top row); below wave 10: none
        { from: 10, chance: 0.30, w: [70, 25, 5, 0, 0] },
        { from: 13, chance: 0.40, w: [55, 32, 11, 2, 0] },
        { from: 15, chance: 0.50, w: [25, 30, 33, 11, 1] },   // the middle of the run: the most likely chest is the golden one
        { from: 18, chance: 0.65, w: [20, 27, 32, 19, 2] },
        { from: 21, chance: 0.90, w: [12, 22, 30, 33, 3] },   // 21 = the match was won
    ];

    // A Battle Royale match gives chests only when it started with at least this many players (two friends in a room cannot hand each other chests)
    const BR_MIN_PLAYERS = 8;
    // The level of a PvE match changes the odds: the chance is multiplied (never above 1) and on the easy level the two rarest chests cannot drop (their share goes to Golden)
    const PVE_LEVEL = { brood: { mult: 0.5, easy: true }, colossus: { mult: 1 }, reaper: { mult: 1.3 } };

    // { chance, w } for a finished match, or null when it earns no chest
    // info: BR { placement (1 = winner), players (how many started) }; PvE { wave: wave reached, victory, diff: 'brood' | 'colossus' | 'reaper' }
    function dropFor(mode, info) {
        info = info || {};
        if (mode === 'br') return (+info.players >= BR_MIN_PLAYERS && BR_DROP[Math.floor(+info.placement)]) || null;
        if (mode === 'pve') {
            const wave = info.victory ? 21 : Math.floor(+info.wave) || 0;
            let row = null;
            for (const r of PVE_DROP) if (wave >= r.from) row = r;
            const lv = row && PVE_LEVEL[info.diff];
            if (!lv || (lv.mult === 1 && !lv.easy)) return row;
            const w = row.w.slice();
            if (lv.easy) { w[2] += w[3] + w[4]; w[3] = 0; w[4] = 0; }
            return { from: row.from, chance: Math.min(1, row.chance * lv.mult), w };
        }
        return null;
    }
    function pickWeighted(w, rng) {
        let total = 0; for (const x of w) total += x;
        let r = rng() * total;
        for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0 && w[i] > 0) return i; }
        for (let i = w.length - 1; i >= 0; i--) if (w[i] > 0) return i;
        return 0;
    }
    // the type that drops (a chest id) or null; rng returns [0, 1)
    function rollChest(mode, info, rng) {
        const d = dropFor(mode, info);
        if (!d || !(rng() < d.chance)) return null;
        return TYPES[pickWeighted(d.w, rng)].id;
    }

    const between = (lo, hi, rng) => lo + Math.floor(rng() * (hi - lo + 1));
    // the cards of a chest; a skin card is only { kind: 'skin', rarity } here, the server picks the skin (it knows what exists and what is owned)
    function rollCards(type, rng) {
        return (CONTENT[type] || []).map(c => c.coins ? { kind: 'coins', amount: between(c.coins[0], c.coins[1], rng) }
            : c.gems ? { kind: 'gems', amount: between(c.gems[0], c.gems[1], rng) }
            : { kind: 'skin', rarity: c.skin });
    }

    // ---- slots and time ----
    const statusOf = (c, now) => c.readyAt == null ? 'waiting' : (now >= c.readyAt ? 'ready' : 'opening');
    const remaining = (c, now) => c.readyAt == null ? BY_ID[c.type].ms : Math.max(0, c.readyAt - now);
    const gemCost = ms => ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / GEM_MS));
    const openingSlot = (slots, now) => slots.findIndex(c => c && statusOf(c, now) === 'opening');
    const freeSlot = slots => { for (let i = 0; i < SLOTS; i++) if (!slots[i]) return i; return -1; };
    const isFull = slots => freeSlot(slots) < 0;

    // a stored list of slots (any junk) -> exactly SLOTS entries, each a valid chest or null
    function normalizeSlots(raw) {
        const out = [];
        for (let i = 0; i < SLOTS; i++) {
            const c = Array.isArray(raw) ? raw[i] : null;
            out.push(c && isType(c.type) ? {
                id: Math.floor(+c.id) || 0, type: c.type, got: +c.got || 0,
                startedAt: c.readyAt != null && isFinite(+c.startedAt) ? +c.startedAt : null,
                readyAt: c.readyAt != null && isFinite(+c.readyAt) ? +c.readyAt : null,
            } : null);
        }
        return out;
    }

    return { SLOTS, GEM_MS, TYPES, BY_ID, isType, CONTENT, DUP_COINS, BR_DROP, PVE_DROP, BR_MIN_PLAYERS, PVE_LEVEL, dropFor, rollChest, rollCards, statusOf, remaining, gemCost, openingSlot, freeSlot, isFull, normalizeSlots };
});

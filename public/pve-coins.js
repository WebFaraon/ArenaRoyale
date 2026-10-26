// ============================================
// ARENA ROYALE - pve-coins.js
// PvE coins on the ground. A zombie that dies drops its coins (the same 1-3 / 2-3 / 5-9 as before, one small coin each) around where
// it fell; they lie there until a living player touches them, and whoever touches one gets it. Not in the gs2 packet: the server
// sends 'coin-drops' when a zombie dies and 'coin-taken' when coins are taken or time out (server.js), the client keeps the list
// (game.js). Pure (no DOM, no game state): server.js requires it, the browser loads it as window.ARPveCoins,
// tools/tests/pve-coins.test.js tests it.
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARPveCoins = api;
})(this, function () {
    'use strict';

    const TTL_MS = 40000;        // a coin nobody takes goes after this long
    const BLINK_MS = 8000;       // and blinks for the last of it (client)
    const LAND_MS = 380;         // the hop from the zombie to its place (client)
    const PICK_EXTRA = 26;       // a coin is taken when it is within player radius + this (a light magnet: it was 12)
    const MAGNET_R = 120;        // a landed coin this near a player (centre to coin) drifts in to them (attract)
    const MAGNET_MIN = 150, MAGNET_MAX = 420;   // the speed of the pull, from the edge of the reach to the player
    const MAX_COINS = 160;       // on the ground in a room at once: the oldest go first
    const COIN_CLEAR = 10;       // a coin is kept this far from a tree, rock or the base

    // n places around (ox, oy), 16-52 units out, never inside an obstacle (blockers: a circle {x, y, r} or a rectangle {x, y, hw, hh},
    // the PvE barricades) and inside the arena. A coin that finds no free spot in a few tries stays by the zombie. rng() in [0, 1).
    function scatter(ox, oy, n, blockers, arenaW, arenaH, rng) {
        const out = [];
        for (let i = 0; i < n; i++) {
            let x = ox, y = oy, ok = false;
            for (let t = 0; t < 8 && !ok; t++) {
                const a = rng() * Math.PI * 2, d = 16 + rng() * 36;
                x = Math.round(ox + Math.cos(a) * d); y = Math.round(oy + Math.sin(a) * d);
                x = Math.max(24, Math.min(arenaW - 24, x)); y = Math.max(24, Math.min(arenaH - 24, y));
                ok = true;
                for (let b = 0; b < blockers.length; b++) {
                    const o = blockers[b], dx = x - o.x, dy = y - o.y;
                    if (o.hw !== undefined) {   // a barricade: not on it, not hugging it
                        if (Math.abs(dx) < o.hw + COIN_CLEAR && Math.abs(dy) < o.hh + COIN_CLEAR) { ok = false; break; }
                        continue;
                    }
                    const rr = o.r + COIN_CLEAR;
                    if (dx * dx + dy * dy < rr * rr) { ok = false; break; }
                }
            }
            if (!ok) { x = Math.round(ox); y = Math.round(oy); }
            out.push([x, y]);
        }
        return out;
    }

    // One tick: coins within pickRSq of a living player are taken (by the first one that reaches them), the ones older than ttl go.
    // coins: [{ id, x, y, t }], compacted in place. out.taken: flat [coinId, player, coinId, player, ...]; out.gone: ids that timed out.
    function step(coins, players, pickRSq, now, ttl, out) {
        out.taken.length = 0; out.gone.length = 0;
        let keep = 0;
        for (let i = 0; i < coins.length; i++) {
            const c = coins[i];
            if (now - c.t > ttl) { out.gone.push(c.id); continue; }
            let taker = null;
            for (let k = 0; k < players.length; k++) {
                const p = players[k], dx = p.x - c.x, dy = p.y - c.y;
                if (dx * dx + dy * dy < pickRSq) { taker = p; break; }
            }
            if (taker) out.taken.push(c.id, taker);
            else coins[keep++] = c;
        }
        coins.length = keep;
    }

    // The wave is over and the break panel is about to cover the pitch: every coin still on the ground goes to the living player
    // nearest to it (the same flat out.taken as step), and the list is emptied. Nobody alive: nobody is paid (out.taken stays empty).
    function sweep(coins, players, out) {
        out.taken.length = 0; out.gone.length = 0;
        if (players.length) {
            for (let i = 0; i < coins.length; i++) {
                const c = coins[i];
                let best = null, bd = Infinity;
                for (let k = 0; k < players.length; k++) {
                    const p = players[k], dx = p.x - c.x, dy = p.y - c.y, d = dx * dx + dy * dy;
                    if (d < bd) { bd = d; best = p; }
                }
                out.taken.push(c.id, best);
            }
        } else {
            for (let i = 0; i < coins.length; i++) out.gone.push(coins[i].id);
        }
        coins.length = 0;
    }

    // The magnet: a landed coin within MAGNET_R of the nearest living player drifts towards them, faster the nearer it gets (MAGNET_MIN..MAGNET_MAX
    // units a second), until it is within the pickup distance and step() takes it. It is the SERVER that moves the coins (the real position is
    // the one it takes at, whether the player stands still or not); the clients get the new positions in 'coin-mv'. moved: the coins that
    // moved this call are pushed to it. Coins still in the hop from the zombie (landMs after the drop) stay put.
    function attract(coins, players, dt, now, pickR, moved) {
        for (let i = 0; i < coins.length; i++) {
            const c = coins[i];
            if (now - c.t < LAND_MS) continue;
            let best = null, bd = MAGNET_R * MAGNET_R;
            for (let k = 0; k < players.length; k++) {
                const p = players[k], dx = p.x - c.x, dy = p.y - c.y, d2 = dx * dx + dy * dy;
                if (d2 < bd) { bd = d2; best = p; }
            }
            if (!best) continue;
            const d = Math.sqrt(bd);
            if (d <= pickR * 0.5) continue;   // inside the pickup range: step() takes it this very tick
            const speed = MAGNET_MIN + (MAGNET_MAX - MAGNET_MIN) * (1 - d / MAGNET_R);
            const mv = Math.min(speed * dt, d);
            c.x += (best.x - c.x) / d * mv; c.y += (best.y - c.y) / d * mv;
            moved.push(c);
        }
    }

    // Keeps at most `max` coins, dropping the oldest; returns the ids dropped
    function trim(coins, max) {
        if (coins.length <= max) return [];
        return coins.splice(0, coins.length - max).map(function (c) { return c.id; });
    }

    return { TTL_MS: TTL_MS, BLINK_MS: BLINK_MS, LAND_MS: LAND_MS, PICK_EXTRA: PICK_EXTRA, MAGNET_R: MAGNET_R, MAGNET_MIN: MAGNET_MIN, MAGNET_MAX: MAGNET_MAX, MAX_COINS: MAX_COINS, scatter: scatter, step: step, sweep: sweep, trim: trim, attract: attract };
});

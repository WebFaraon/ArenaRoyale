// ============================================
// ARENA ROYALE - combat-shared.js
// Values and formulas the server (require) and the browser (<script>, window.ARShared) must agree on
// exactly: the player's visual scale and where a bullet starts and how long it lives.
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARShared = api;
})(this, function () {
    'use strict';

    // How big a player looks in the match, relative to the art (body radius 36, frame 100 units).
    // Reglabil intre 0.8 si 0.9. It scales the skin, hands, highlight, hit flash, ring, label positions,
    // the gun sprites and the muzzle (so also where bullets start); the hitbox (30) does not change.
    const PLAYER_VISUAL_SCALE = 0.85;

    // Server tick length in seconds (server.js TICK_RATE 60 -> INTERVAL_MS 17)
    const TICK_S = 0.017;

    // Bullets used to start 25 units in front of the player centre. Ranges are kept as they were then.
    const LEGACY_MUZZLE = 25;

    // Distance from the player centre to the muzzle (public/data/weapons.json "muzzle"; x is 0 for every gun)
    function muzzleDistance(weapon) {
        return weapon.muzzle[1] * PLAYER_VISUAL_SCALE;
    }

    // Ticks the server used to move a bullet of lifetime `life` (it subtracted dt and dropped the
    // bullet once the lifetime reached 0, after that tick's move)
    function legacyTicks(life, dt) {
        let l = life, n = 0;
        do { l -= dt; n++; } while (l > 0);
        return n;
    }

    // Lifetime of a bullet starting at the muzzle, so its farthest point from the player centre is the
    // same as before: 25 + speed × (ticks × dt) = muzzle + speed × life. The server moves the bullet by
    // only the lifetime left on its last tick, which makes this exact.
    function bulletLife(oldLife, speed, muzzleDist, dt) {
        return legacyTicks(oldLife, dt) * dt - (muzzleDist - LEGACY_MUZZLE) / speed;
    }

    return { PLAYER_VISUAL_SCALE, TICK_S, LEGACY_MUZZLE, muzzleDistance, legacyTicks, bulletLife };
});

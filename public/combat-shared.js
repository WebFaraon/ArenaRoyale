// ============================================
// ARENA ROYALE - combat-shared.js
// Values and formulas the server (require) and the browser (<script>, window.ARShared) must agree on
// exactly: the player's visual scale, where a bullet starts and how long it lives, and how a gun fires
// (its numbers live in public/data/weapons.json).
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

    // Server ticks: exactly 60 per second (server.js runs them on an accumulator clock)
    const TICK_RATE = 60;
    const TICK_S = 1 / TICK_RATE;
    // The tick the game used before (17 ms): bullet ranges are still worked out from it (bulletLife)
    const LEGACY_TICK_S = 0.017;

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
    // same as before: 25 + speed × (ticks × 17 ms) = muzzle + speed × life. Worked out with the old 17 ms
    // tick whatever the tick is now; the server moves a bullet by only the lifetime left on its last
    // tick, so the range is exact at any tick length.
    function bulletLife(oldLife, speed, muzzleDist) {
        return legacyTicks(oldLife, LEGACY_TICK_S) * LEGACY_TICK_S - (muzzleDist - LEGACY_MUZZLE) / speed;
    }

    // Bullet velocities in the server's gs packet are divided by this, rounded, and multiplied back
    // by the client (a wire format constant, not a gun's speed)
    const NET_BULLET_SPEED = 1000;

    // How a gun fires, from its public/data/weapons.json entry. fireMode decides the trigger:
    //   "auto"  : fires while the trigger is held, one shot every shootCd
    //   "burst" : each shot is burst.count bullets burst.delay apart, then shootCd
    //   "semi"  : one shot per press (supported by the fire code; no gun uses it now)
    // One shot is `pellets` bullets fanned over `spread` radians (1 and 0 unless the gun sets them).
    function weaponStats(w) {
        const burst = w.fireMode === 'burst';
        return {
            fireMode: w.fireMode,
            bulletSpeed: w.bulletSpeed, bulletLife: w.bulletLife, shootCd: w.shootCd,
            ammoMax: w.ammoMax, reloadRate: w.reload.rounds / w.reload.seconds,
            pellets: w.pellets || 1, spread: w.spread || 0,
            burstCount: burst ? w.burst.count : 1, burstDelay: burst ? w.burst.delay : 0,
        };
    }

    // Problems in weapons.json (empty list = fine); the server refuses to start with any
    function checkWeapons(data) {
        const errs = [], num = (v, min) => typeof v === 'number' && isFinite(v) && v >= min;
        const classes = new Set((data.classes || []).map(c => c.id));
        if (!data.weapons || !data.weapons[data.defaultWeapon]) errs.push('defaultWeapon is not a weapon');
        const r = data.rules || {};
        if (!num(r.aimDelay, 0) || !num(r.reloadDelay, 0) || !num(r.bulletRadius, 0)) errs.push('rules: aimDelay, reloadDelay, bulletRadius');
        if (!data.sprite || !Array.isArray(data.sprite.topLeft) || !Array.isArray(data.sprite.size)) errs.push('sprite: topLeft, size');
        for (const [id, w] of Object.entries(data.weapons || {})) {
            const bad = k => errs.push(id + ': ' + k);
            if (!classes.has(w.class)) bad('class');
            if (!['auto', 'burst', 'semi'].includes(w.fireMode)) bad('fireMode');
            if (typeof w.fireModeLabel !== 'string' || !w.fireModeLabel) bad('fireModeLabel');
            if (w.fireMode === 'burst' && !(w.burst && Number.isInteger(w.burst.count) && w.burst.count >= 2 && num(w.burst.delay, 0.001))) bad('burst {count >= 2, delay}');
            for (const k of ['bulletSpeed', 'bulletLife', 'shootCd']) if (!num(w[k], 0.001)) bad(k);
            if (!Number.isInteger(w.ammoMax) || w.ammoMax < 1) bad('ammoMax');
            if (!(w.reload && num(w.reload.rounds, 0.001) && num(w.reload.seconds, 0.001))) bad('reload {rounds, seconds}');
            if (w.pellets !== undefined && !(Number.isInteger(w.pellets) && w.pellets >= 1 && num(w.spread, 0))) bad('pellets / spread');
            if (w.cameraZoom !== undefined && !num(w.cameraZoom, 0.5)) bad('cameraZoom');
            const l = w.loadout || {};
            for (const k of ['baseHp', 'baseDmg', 'baseSpd', 'hpPer', 'dmgPer', 'spdPer']) if (!num(l[k], 0)) bad('loadout.' + k);
            if (!Array.isArray(w.muzzle) || !Array.isArray(w.hands)) bad('muzzle / hands');
        }
        return errs;
    }

    return { PLAYER_VISUAL_SCALE, TICK_RATE, TICK_S, LEGACY_TICK_S, LEGACY_MUZZLE, NET_BULLET_SPEED, muzzleDistance, legacyTicks, bulletLife, weaponStats, checkWeapons };
});

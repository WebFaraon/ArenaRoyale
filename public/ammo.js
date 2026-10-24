// ============================================
// ARENA ROYALE - ammo.js
// The classic magazine, one file for both ends (the server runs the real thing, the browser predicts with the same
// rules, tools/tests/ammo.test.js checks it). A gun has a magazine (the rounds ready to fire) and a reserve (the
// rounds left in your pocket). R, or the trigger held on an empty magazine, starts a reload of `reloadSeconds`; when
// it ends the missing rounds move from the reserve into the magazine. No shot leaves during a reload.
//
// State: any object with { ammo, ammoMax, reserve, reloading, reloadProgress } (the server's player, the client's
// ammoState). Every function changes it in place and allocates nothing: they run on every tick.
//   ammo, ammoMax   rounds in the magazine / its size (a PvE upgrade can grow it)
//   reserve         rounds in the reserve: no ceiling, boxes and purchases keep adding (only the magazine has a size)
//   reloading       a reload is running; reloadProgress is 0..1
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARAmmo = api;
})(this, function () {
    'use strict';

    // a shot can leave
    function canFire(s) { return !s.reloading && s.ammo > 0; }

    // R would do something: the magazine is not full and there is something to put in it
    function canReload(s) { return !s.reloading && s.ammo < s.ammoMax && s.reserve > 0; }

    // Starts a reload (R). False when there is nothing to do (full magazine, empty reserve, already reloading).
    function startReload(s) {
        if (!canReload(s)) return false;
        s.reloading = true; s.reloadProgress = 0;
        return true;
    }

    // The trigger is held on an empty magazine: reload by itself. True when it started one.
    function autoReload(s, triggerHeld) {
        return triggerHeld && s.ammo <= 0 ? startReload(s) : false;
    }

    function cancelReload(s) { s.reloading = false; s.reloadProgress = 0; }

    // The reload ends: the missing rounds come out of the reserve (as many as it has). Returns how many moved.
    function finishReload(s) {
        const take = Math.min(s.ammoMax - s.ammo, s.reserve);
        if (take > 0) { s.ammo += take; s.reserve -= take; }
        cancelReload(s);
        return take;
    }

    // dt seconds of an `seconds`-long reload. True on the tick it finishes.
    function stepReload(s, dt, seconds) {
        if (!s.reloading) return false;
        s.reloadProgress += dt / seconds;
        if (s.reloadProgress < 1) return false;
        finishReload(s);
        return true;
    }

    // Spends up to n rounds of the magazine (a shot is 1 whatever its pellets, a burst bullet is 1 each); returns how many
    function spend(s, n) {
        const k = Math.min(n === undefined ? 1 : n, s.ammo);
        if (k > 0) s.ammo -= k;
        return k;
    }

    // An ammo box, a purchase: n rounds into the reserve, which has no ceiling; returns how many went in
    function addReserve(s, n) {
        const add = Math.max(0, n);
        s.reserve += add;
        return add;
    }

    // Full magazine and the gun's starting reserve: a new match, a revived player
    function refill(s, reserveStart) {
        s.ammo = s.ammoMax; s.reserve = reserveStart; cancelReload(s);
    }

    // A bigger magazine (the PvE AMMO upgrade). The rounds you have stay; the next reload fills the new size.
    function setMagazine(s, ammoMax) { s.ammoMax = ammoMax; }

    return { canFire, canReload, startReload, autoReload, cancelReload, finishReload, stepReload, spend, addReserve, refill, setMagazine };
});

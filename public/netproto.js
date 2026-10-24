// ============================================
// ARENA ROYALE - netproto.js
// The per-tick state packet, protocol 3 ('gs2'). One file for both ends: the server (require) packs, the browser
// (window.ARNet) and the tests unpack, so the two can never drift apart.
//
// Packet (one msgpack array): [tick, players, bullets, zombies, kits, zone, pve, own]
//   everything but `own` is the same for every client of the room and is encoded once per tick;
//   `own` is the receiving client's private row and is appended per client (see server-gs.js)
//   tick     simulation tick number; the server time of the snapshot is tick x tick length
//   players  flat, 6 numbers each: slot, x*4, y*4, angle*1000, hp, kills*2 + alive
//   bullets  flat, 6 each: id, x*4, y*4, vx, vy (px/s), owner slot
//   zombies  flat, 6 each: id, x*4, y*4, angle*100, hp, type            (live ones only, ascending id)
//   kits     flat, 5 each: id, x, y, seconds left, kind (KIT_HEAL medkit / KIT_AMMO box of ammo)
//   zone     [radius, wait seconds*10]    (the centre never moves: the middle of the arena)
//   pve      null, or [base hp, base max hp, wave, break (0/1), break seconds*10]
//   own      [ammo, ammo max, reload (0 = not reloading, else 1 + percent done), ack seq, coins, reserve]
// Positions travel as whole numbers of quarter pixels: as many bytes as whole pixels (anything up to 16383 is 3
// bytes in msgpack), 4x the precision. Players are named by a small number (their slot in the room, sent once in
// playersMeta) instead of their 20-character socket id, which was ~55% of the old packet.
// Version 1 ('gs', the first packet of this game) is gone; version 2 had 4-number kits and no reserve in the own row.
// Client and server must agree on PROTO.
// ============================================
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ARNet = api;
})(this, function () {
    'use strict';

    const PROTO = 3;
    const KIT_HEAL = 0, KIT_AMMO = 1;   // kinds of kit on the ground
    const EVENT = 'gs2';
    const PQ = 4;            // positions are sent x4
    const AQ = 1000;         // player angle
    const ZAQ = 100;         // zombie angle
    const TQ = 10;           // timers (zone wait, PvE break)

    // ---------- server side: fill flat arrays (reused every tick) ----------
    // players: objects with slot, x, y, angle, hp, kills, alive
    function packPlayers(out, players) {
        out.length = 0;
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            out.push(p.slot, Math.round(p.x * PQ), Math.round(p.y * PQ), Math.round(p.angle * AQ), Math.round(p.hp), p.kills * 2 + (p.alive ? 1 : 0));
        }
        return out;
    }
    // bullets: objects with id, x, y, dx, dy, os (owner slot); appended to `out` (call packBullets twice to add the expired ones)
    function packBullets(out, bullets, append) {
        if (!append) out.length = 0;
        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i];
            out.push(b.id, Math.round(b.x * PQ), Math.round(b.y * PQ), Math.round(b.dx), Math.round(b.dy), b.os);
        }
        return out;
    }
    function packZombies(out, zombies, typeIdx) {
        out.length = 0;
        for (let i = 0; i < zombies.length; i++) {
            const z = zombies[i];
            if (!z.alive) continue;
            out.push(z.id, Math.round(z.x * PQ), Math.round(z.y * PQ), Math.round(z.angle * ZAQ), Math.round(z.hp), typeIdx[z.type] || 0);
        }
        return out;
    }
    function packKits(out, kits, now) {
        out.length = 0;
        for (let i = 0; i < kits.length; i++) {
            const k = kits[i];
            out.push(k.id, Math.round(k.x), Math.round(k.y), Math.round((30000 - (now - k.spawnTime)) / 1000), k.type === KIT_AMMO ? KIT_AMMO : KIT_HEAL);
        }
        return out;
    }
    function packZone(zone) { return [Math.round(zone.r), Math.round(zone.waitTimer * TQ)]; }
    function packPve(room) {
        return room.mode === 'pve' && room.base
            ? [Math.round(room.base.hp), room.base.maxHp, room.pveWave, room.pveWaveBreak ? 1 : 0, Math.round(room.pveBreakTimer * TQ)]
            : null;
    }
    // The receiving client's own row. p: ammo, ammoMax, reloading, reloadProgress, lastAckSeq, coins, reserve
    function packOwn(p) {
        const reload = p.reloading ? 1 + Math.round(Math.min(1, p.reloadProgress || 0) * 100) : 0;
        return [p.ammo, p.ammoMax, reload, p.lastAckSeq, p.coins || 0, p.reserve || 0];
    }

    // ---------- client side ----------
    // fn(slot, x, y, angle, hp, alive, kills) for every player row
    function eachPlayer(flat, fn) {
        for (let i = 0; i < flat.length; i += 6) {
            const f = flat[i + 5];
            fn(flat[i], flat[i + 1] / PQ, flat[i + 2] / PQ, flat[i + 3] / AQ, flat[i + 4], f & 1, f >> 1);
        }
    }
    // Bullets as the game keeps them: { id, x, y, dx, dy, ownerId }; slotToId maps a slot to the socket id
    function bullets(flat, slotToId, radius) {
        const out = new Array(flat.length / 6);
        for (let i = 0, k = 0; i < flat.length; i += 6, k++) {
            out[k] = { id: flat[i], x: flat[i + 1] / PQ, y: flat[i + 2] / PQ, dx: flat[i + 3], dy: flat[i + 4], ownerId: slotToId[flat[i + 5]], radius };
        }
        return out;
    }
    // Own row -> { ammo, max, reloading, reloadProgress, ack, coins, reserve }
    function own(row, out) {
        out.ammo = row[0]; out.max = row[1];
        out.reloading = row[2] > 0; out.reloadProgress = row[2] > 0 ? (row[2] - 1) / 100 : 1;
        out.ack = row[3]; out.coins = row[4]; out.reserve = row[5];
        return out;
    }

    return { PROTO, KIT_HEAL, KIT_AMMO, EVENT, PQ, AQ, ZAQ, TQ, packPlayers, packBullets, packZombies, packKits, packZone, packPve, packOwn, eachPlayer, bullets, own };
});

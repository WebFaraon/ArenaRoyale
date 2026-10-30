// node --test tools/tests/pve-spawn.test.js
// pveFreeSpot of server.js (read as text, the server is not a module): where a player who fell comes back by the base at the start of a wave. It must be a place
// that is clear of the trees, the rocks, the base, the barricades and the turrets, even when the walls the players built cover the usual ring.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ARStructs = require('../../public/structures.js');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const i0 = src.indexOf('function pveFreeSpot'), fn = src.slice(i0, src.indexOf('\n}\n', i0) + 2);
const num = (n) => +new RegExp('const ' + n + '\\s*=\\s*(\\d+)').exec(src)[1];
const C = { PLAYER_R: num('PLAYER_SIZE') / 2, ARENA_W: num('ARENA_W'), ARENA_H: num('ARENA_H'), PVE_BASE_R: num('PVE_BASE_R') };
C.PVE_BASE_X = Math.round(C.ARENA_W / 2); C.PVE_BASE_Y = Math.round(C.ARENA_H / 2);   // as in server.js
const pveFreeSpot = new Function('ARStructs', 'PLAYER_R', 'ARENA_W', 'ARENA_H', 'PVE_BASE_X', 'PVE_BASE_Y', 'PVE_BASE_R', fn + '\nreturn pveFreeSpot;')(ARStructs, C.PLAYER_R, C.ARENA_W, C.ARENA_H, C.PVE_BASE_X, C.PVE_BASE_Y, C.PVE_BASE_R);

const R = C.PLAYER_R, T = ARStructs.TURRET.r;
const clearOf = (room, x, y, m) => !room.obstacles.some(o => Math.hypot(x - o.x, y - o.y) < o.r + R + m)
    && !room.structs.some(b => ARStructs.distToRect(x, y, b) < R + m) && !room.turrets.some(t => Math.hypot(x - t.x, y - t.y) < T + R + m)
    && Math.hypot(x - C.PVE_BASE_X, y - C.PVE_BASE_Y) >= C.PVE_BASE_R + R + m;

test('an empty field: the spot is on the ring of 240 round the base, at the angle asked for', () => {
    const room = { obstacles: [], structs: [], turrets: [] }, s = pveFreeSpot(room, Math.PI / 4);
    assert.ok(Math.abs(Math.hypot(s.x - C.PVE_BASE_X, s.y - C.PVE_BASE_Y) - 240) < 1);
    assert.ok(Math.abs(Math.atan2(s.y - C.PVE_BASE_Y, s.x - C.PVE_BASE_X) - Math.PI / 4) < 0.01);
});

test('walls and turrets all over the ring: the spot is still clear of every one of them, by a good margin', () => {
    const room = { obstacles: [{ x: C.PVE_BASE_X + 300, y: C.PVE_BASE_Y, r: 40 }], structs: [], turrets: [] };
    // a ring of barricades and turrets at 240 from the base, as a player might have built
    let id = 1;
    for (let k = 0; k < 24; k++) {
        const a = k * Math.PI / 12, x = Math.round(C.PVE_BASE_X + Math.cos(a) * 240), y = Math.round(C.PVE_BASE_Y + Math.sin(a) * 240);
        if (k % 3) room.structs.push({ id: id++, k: 'b', x, y, o: k % 2, t: 0, hp: 300, maxHp: 300 });
        else room.turrets.push({ id: id++, k: 't', kd: 'mg', x, y, t: 0 });
    }
    for (let i = 0; i < 4; i++) {
        const s = pveFreeSpot(room, i * Math.PI / 2 + Math.PI / 4);
        assert.ok(clearOf(room, s.x, s.y, 16), 'player ' + i + ' at ' + s.x + ',' + s.y + ' is clear');
    }
});

test('the server puts a player back only when they fell: a living one stays where the last wave left them', () => {
    assert.match(src, /if \(!p\.alive\) \{\s*const angle = [^\n]*pveFreeSpot\(room, angle\);/);
});

// node --test tools/tests/pve-end.test.js
// The end of a PvE match: what it pays (pve-rewards.js, the numbers of the end board), the mission box (missions.roundNote) and the board the server
// builds for everybody (pveEndBoard of server.js, read as text: the server is not a module). Also that the three places that count stay in the server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../../pve-rewards.js');
const Missions = require('../../missions.js');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

test('a full run: 15 a wave, 1 per 4 zombies, 100 for the win; every threshold of diamonds', () => {
    const r = R.compute({ wavesCleared: 20, victory: true, kills: 512 });
    assert.deepEqual(r.lines.map(l => l.coins), [300, 128, 100]);
    assert.equal(r.coins, 528);
    assert.equal(r.gems, 7);                                  // 1 + 1 + 2 + 3
    assert.equal(r.xp, 20 * 10 + 51 + 100);
    assert.ok(r.milestones.every(m => m.got));
});

test('a loss pays by the waves held, no win bonus, and keeps the thresholds it reached', () => {
    const r = R.compute({ wavesCleared: 11, victory: false, kills: 268 });
    assert.equal(r.coins, 165 + 67);
    assert.equal(r.lines[2].coins, 0);
    assert.equal(r.gems, 2);                                  // waves 5 and 10
    assert.deepEqual(r.milestones.filter(m => m.got).map(m => m.wave), [5, 10]);
    assert.equal(r.xp, 110 + 26);
});

test('the base falls in wave 1 with nobody having killed anything: nothing is paid', () => {
    const r = R.compute({ wavesCleared: 0, victory: false, kills: 0 });
    assert.deepEqual([r.coins, r.gems, r.xp], [0, 0, 0]);
});

test('a bad number cannot pay more than a full run', () => {
    for (const bad of [-5, NaN, undefined, 'x', Infinity]) {
        const r = R.compute({ wavesCleared: bad, victory: false, kills: bad });
        assert.deepEqual([r.coins, r.gems, r.xp], [0, 0, 0], String(bad));
    }
    assert.equal(R.compute({ wavesCleared: 999, victory: true, kills: 0 }).wavesCleared, 20);
});

test('the zombies fall in four families, an unknown one counts as normal', () => {
    assert.deepEqual(['normal', 'ghoul'].map(R.kindOf), ['normal', 'normal']);
    assert.deepEqual(['runner', 'stalker'].map(R.kindOf), ['runner', 'runner']);
    assert.deepEqual(['tank', 'brute', 'summoner', 'shielded'].map(R.kindOf), ['heavy', 'heavy', 'heavy', 'heavy']);
    assert.deepEqual(['spitter', 'exploder', 'screamer', 'minion'].map(R.kindOf), ['special', 'special', 'special', 'special']);
    assert.equal(R.kindOf('nope'), 'normal');
    // every type of the server is in a family on purpose
    const defs = /const PVE_ZOMBIE_DEFS = \{([\s\S]*?)\n\};/.exec(src)[1];
    for (const t of [...defs.matchAll(/^    (\w+): \{/gm)].map(m => m[1])) assert.ok(t in R.KIND_OF, 'type ' + t + ' has a family');
});

test('the mission box: one that this round finished (the richest), else the one that moved furthest, else nothing', () => {
    const state = Missions.freshState('tester', '2026-10-27');
    const ids = state.list.map(e => e.id);
    const before = new Map(state.list.map(e => [e.id, e.prog]));
    assert.equal(Missions.roundNote(before, state), null, 'nothing moved');
    // move two missions: one to the goal, one half way
    const [a, b] = state.list.slice(0, 2);
    const goalOf = id => Missions.POOL.find(m => m.id === id).goal;
    a.prog = Math.ceil(goalOf(a.id) / 2); b.prog = goalOf(b.id);
    const note = Missions.roundNote(before, state);
    assert.equal(note.id, b.id); assert.equal(note.done, true);
    assert.ok(note.coins >= 0 && ids.includes(note.id));
    // nothing finished: the furthest along
    b.prog = 0; a.prog = Math.ceil(goalOf(a.id) / 2);
    const n2 = Missions.roundNote(before, state);
    assert.equal(n2.id, a.id); assert.equal(n2.done, false); assert.ok(n2.prog < n2.goal);
    // a claimed mission is never shown
    a.claimed = true;
    assert.equal(Missions.roundNote(before, state), null);
});

// ----- the board of the server -----
const i0 = src.indexOf('function pveEndBoard'), fn = src.slice(i0, src.indexOf('\n}\n', i0) + 2);
const PVE_BASE_HP = +/const PVE_BASE_HP\s*=\s*(\d+)/.exec(src)[1];
const pveEndBoard = new Function('PveRewards', 'PVE_BASE_HP', fn + '\nreturn pveEndBoard;')(R, PVE_BASE_HP);
const mkRoom = (over) => ({
    pveWave: 12, pveT0: Date.now() - 83000, base: { hp: 0, maxHp: 1500 }, pveKinds: { normal: 10, runner: 4, heavy: 2, special: 1 },
    _playerArr: [
        { id: 'a', name: 'SSS', slot: 0, kills: 9, pveTot: { dmg: 120.6, coins: 55 } },
        { id: 'b', name: 'Alex', slot: 1, kills: 12, pveTot: { dmg: 40, coins: 70 } },
    ], ...over });

test('a lost match: the wave it fell in does not count, the team table, the MVP, the family totals and the time', () => {
    const b = pveEndBoard(mkRoom(), false);
    assert.equal(b.result, 'defeat'); assert.equal(b.wavesCleared, 11); assert.equal(b.wave, 12); assert.equal(b.total, 20);
    assert.equal(b.mvp, 'b');
    assert.deepEqual(b.team[0], { id: 'a', name: 'SSS', slot: 0, kills: 9, dmg: 121, coins: 55 });
    assert.equal(b.zombies, 17);
    assert.deepEqual(b.base, { hp: 0, max: 1500 });
    assert.ok(Math.abs(b.timeSec - 83) <= 1);
});

test('a won match: all the waves, nobody killed anything: no MVP', () => {
    const room = mkRoom({ base: { hp: 640.4, maxHp: 1500 } }); room._playerArr.forEach(p => { p.kills = 0; });
    const b = pveEndBoard(room, true);
    assert.equal(b.result, 'victory'); assert.equal(b.wavesCleared, 20); assert.equal(b.mvp, null); assert.equal(b.base.hp, 640);
});

test('the server counts the same things the board shows', () => {
    assert.ok(/function hurtPlayer[\s\S]*?pveTot\.dmg/.test(src), 'damage taken from the blast and the base-side hits');
    assert.ok(/p\.hp -= def\.dmg;/.test(src) && /const d = Math\.min\(def\.dmg, Math\.max\(0, p\.hp\)\); p\.wv\.dmg \+= d; p\.pveTot\.dmg \+= d;/.test(src), 'damage taken from a melee hit');
    assert.ok(/p\.pveTot\.coins \+= p\._coinGot/.test(src), 'coins picked up');
    assert.equal((src.match(/room\.pveKinds\[PveRewards\.kindOf\(zombie\.type\)\]\+\+/g) || []).length, 2, 'a kill by a bullet and a kill by a turret');
    assert.ok(/pveFinish\(code, room, true\)/.test(src) && /pveFinish\(code, room, false\)/.test(src));
    assert.ok(/info\.reward \? info\.reward\.coins/.test(src), 'the account is paid what the board shows');
});

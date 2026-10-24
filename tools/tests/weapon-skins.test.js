// node --test tools/tests/weapon-skins.test.js
// public/data/weapon-skins.json against public/combat-shared.js: the real file is valid, prices come from the rarity,
// a season skin (handed out by the season, not sold) has no price.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../../public/combat-shared.js');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data', f), 'utf8'));
const skins = read('weapon-skins.json'), weapons = read('weapons.json');

test('the real weapon-skins.json is valid', () => {
    assert.deepEqual(S.checkWeaponSkins(skins, Object.keys(weapons.weapons)), []);
});

test('weaponSkins: a price from the rarity, none for unlock and season skins', () => {
    const by = Object.fromEntries(S.weaponSkins(skins).map(s => [s.id, s]));
    assert.deepEqual(by.sn_railgun.price, skins.prices.epic);
    assert.equal(by.sn_frost.price, null);                 // unlocked by kills
    assert.ok(by.sg_golazo.season && by.sg_golazo.price === null && by.sg_golazo.unlock === null);
    assert.equal(by.sn_railgun.season, false);
});

test('checkWeaponSkins: a season skin takes neither a price nor an unlock', () => {
    const mk = extra => ({ rarities: ['epic'], prices: { epic: { diamonds: 40 } }, skins: [{ id: 'aa_s', weapon: 'smg', name: 'S', rarity: 'epic', ...extra }] });
    assert.deepEqual(S.checkWeaponSkins(mk({ season: true }), ['smg']), []);
    assert.equal(S.checkWeaponSkins(mk({ season: true, price: { diamonds: 5 } }), ['smg']).length, 1);
    assert.equal(S.checkWeaponSkins(mk({ season: true, unlock: { kills: 5 } }), ['smg']).length, 1);
    assert.equal(S.checkWeaponSkins(mk({ season: 'yes' }), ['smg']).length, 1);
});

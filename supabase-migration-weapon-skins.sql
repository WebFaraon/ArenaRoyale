-- Weapon skins (server.js "WEAPON SKINS", public/data/weapon-skins.json):
--   owned_weapon_skins:    the skin ids the account owns, bought or unlocked, e.g. ["sn_frost", "pi_lava"]
--   equipped_weapon_skins: the skin on each weapon, e.g. { "sniper": "sn_frost" }; a weapon that is not
--                          in it has no skin ("default")
-- The server writes both; a purchase takes the money and adds the skin in the same update.
-- Run once in the Supabase SQL editor. Until these columns exist the server refuses weapon skin
-- purchases (no money is taken), keeps equipped and unlocked skins in memory only (lost when it
-- restarts) and logs that once; nothing else is affected.
alter table players add column if not exists owned_weapon_skins    jsonb not null default '[]'::jsonb;
alter table players add column if not exists equipped_weapon_skins jsonb not null default '{}'::jsonb;

-- Only a JSON list / object may be stored there (the server writes nothing else; this guards manual edits)
alter table players drop constraint if exists players_owned_weapon_skins_is_array;
alter table players add constraint players_owned_weapon_skins_is_array check (jsonb_typeof(owned_weapon_skins) = 'array');
alter table players drop constraint if exists players_equipped_weapon_skins_is_object;
alter table players add constraint players_equipped_weapon_skins_is_object check (jsonb_typeof(equipped_weapon_skins) = 'object');

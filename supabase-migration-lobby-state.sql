-- Chests, Battle Pass and inbox (server.js "CHESTS, BATTLE PASS, INBOX", lobby-core.js): one JSON text per account,
--   { slots: [4 x chest|null], nextChest, bp: { xp, blast, claimed: { free: [tiers], blast: [tiers] } }, inbox: [messages], nextMsg }
-- The server writes it together with coins, diamonds and the skins in ONE update, so a chest and what came out of it are saved together.
-- Run once in the Supabase SQL editor. Until this column exists the server keeps chests, Battle Pass and inbox in memory only (they are lost when it
-- restarts) and logs that once; nothing else is affected.
alter table players add column if not exists lobby_state text;

-- The HP / DMG / SPD points of the old lobby build are gone (everybody has the same HP, the damage is the gun's). stat_hp, stat_dmg and stat_spd
-- (supabase-migration-stat-points.sql) are no longer read or written: they can stay, or be dropped later.

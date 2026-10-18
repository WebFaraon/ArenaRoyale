-- Weapon stats (server.js "WEAPON STATS"): totals per weapon for each account, e.g.
--   { "assault": { "kills": 12, "zombieKills": 40, "damage": 5300, "shots": 900, "hits": 410 }, ... }
-- Keys are weapon ids from public/data/weapons.json plus "fists"; every value is a whole number >= 0.
-- The server adds a match's counts in one write when the player's match ends.
-- Run once in the Supabase SQL editor. Until this column exists the server keeps weapon totals in
-- memory only (lost when it restarts) and logs that once; nothing else is affected.
alter table players add column if not exists weapon_stats jsonb not null default '{}'::jsonb;

-- Only a JSON object may be stored there (the server writes nothing else; this guards manual edits)
alter table players drop constraint if exists players_weapon_stats_is_object;
alter table players add constraint players_weapon_stats_is_object check (jsonb_typeof(weapon_stats) = 'object');

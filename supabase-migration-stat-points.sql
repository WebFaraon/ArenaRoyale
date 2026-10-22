-- Stat points (server.js POST /api/profile/stats, the "build" panel in the lobby): the HP / DMG / SPD points a
-- player spends, 0-10 each and at most 10 in total, saved on the account so the build follows it to another device.
-- Run once in the Supabase SQL editor. Until these columns exist the server cannot save the points: it logs that once,
-- answers ok: false, and the lobby keeps using the copy in the browser (localStorage "ar_stats"); nothing else is affected.
-- Existing accounts start at 0 / 0 / 0 (no points saved yet), which the lobby treats as "use the browser's copy".
alter table players add column if not exists stat_hp  integer not null default 0;
alter table players add column if not exists stat_dmg integer not null default 0;
alter table players add column if not exists stat_spd integer not null default 0;

-- The server clamps each value to 0-10 and refuses a total over 10; this guards manual edits
alter table players drop constraint if exists players_stat_points_range;
alter table players add constraint players_stat_points_range
    check (stat_hp between 0 and 10 and stat_dmg between 0 and 10 and stat_spd between 0 and 10);
alter table players drop constraint if exists players_stat_points_total;
alter table players add constraint players_stat_points_total check (stat_hp + stat_dmg + stat_spd <= 10);

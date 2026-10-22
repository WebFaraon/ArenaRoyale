-- Daily missions (missions.js): six missions per player per day, drawn from a varied pool.
-- Run once in the Supabase SQL editor. Until this column exists the server keeps mission
-- progress in memory only (it survives until the server restarts).
alter table players add column if not exists missions_state text;

-- The old fixed mission columns (mission_date, mission_kills, mission_games, mission_wins and
-- their *_claimed flags) are no longer read or written. They can stay, or be dropped later.

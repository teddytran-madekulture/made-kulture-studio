-- 18+ / mature-content flag for a whole casting: shows an 18+ badge on the board
-- + detail and blurs the mood board behind a "reveal, I'm over 18" gate.
-- Per-image 18+ lives inside the mood_board jsonb as {url, mature} — no column.
alter table castings add column if not exists mature boolean not null default false;

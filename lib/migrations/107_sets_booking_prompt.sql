-- 107_sets_booking_prompt.sql — per-set prep question at checkout (2026-09-15)
--
-- booking_prompt: the question shown ABOVE THE EXISTING NOTES BOX when this set
-- is chosen, e.g. Set C → "White wall or red backdrop?", The Watering Hole →
-- "Water level — low or high?". NULL ⇒ the generic notes label, unchanged.
--
-- WHY a column and not a hardcoded map: Teddy needs to reword these himself as
-- sets change (the red backdrop sometimes needs repainting, which is the whole
-- reason he needs the answer at BOOKING time and not from the 24h reminder or
-- the 15-minute wrap-up text — both are far too late to touch up paint).
--
-- ⚠️ Deliberately OPTIONAL. It reuses the notes field instead of adding a step,
-- so it cannot block checkout. Teddy's call: "that's better for now than
-- nothing." If skipped answers become a problem the next move is a real
-- required choice (radio buttons), which is a bigger change.
--
-- ⚠️ RUN BY HAND in the Supabase SQL editor — migrations here do NOT run on a
-- Vercel deploy, so this goes BEFORE the push.
alter table sets add column if not exists booking_prompt text;

-- ⚠️ PostgREST caches the schema; a new column is invisible to writes until this fires.
notify pgrst, 'reload schema';

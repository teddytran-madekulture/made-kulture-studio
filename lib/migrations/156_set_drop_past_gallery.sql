-- 156_set_drop_past_gallery.sql — "Shot on <drop>" gallery (2026-10-09).
-- Photos customers shot on this set in previous years, each with a credit line.
-- [{ "url": "...", "credit": "Photo: Jane Doe @janedoe" }, ...]. Separate from
-- `gallery` (the concept/mood images) so the two never mix on the page.
-- ⚠️ Only work Teddy has permission to post (e.g. collabs on the MK Instagram).
alter table set_drops add column if not exists past_gallery jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';

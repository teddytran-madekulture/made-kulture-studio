-- ============================================
-- Migration 070 — Site image originals + focal point
-- ============================================
-- Lets the admin RE-CROP a site photo (hero, set tiles, studio photo) anytime
-- without re-uploading, and nudge how the photo sits inside its frame:
--   original_url — the full uploaded photo, kept so the cropper can reopen on it
--   focal        — CSS object-position (e.g. '50% 100%') for the on-page crop

alter table site_images add column if not exists original_url text;
alter table site_images add column if not exists focal        text;

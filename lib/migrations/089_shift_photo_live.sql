-- 089 · Closeout photos: record whether the shot came from the in-app live camera.
--
-- The worker page used to open the device's file picker, so a closeout photo
-- could be any image on the phone — including an old one of an already-tidy set.
-- Capture now happens in-page from a live camera stream, and this column records
-- which path a photo came through.
--
--   true  — frame grabbed from the live camera in the app (no gallery involved)
--   false — came through the file-picker fallback (no camera, or access denied);
--           EXIF-checked server-side and flagged on the admin shift board
--   null  — predates this build; unknown, and deliberately not claimed as live

alter table shift_photos
  add column if not exists captured_live boolean;

comment on column shift_photos.captured_live is
  'true = shot in the app''s live camera; false = file-picker fallback (flagged in admin); null = predates the live-camera build';

-- Writes 400 with a "schema cache" error right after a column is added unless
-- PostgREST is told to re-read the schema. Test a WRITE after running this,
-- not just a read.
notify pgrst, 'reload schema';

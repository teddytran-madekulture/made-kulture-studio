-- ============================================
-- Migration 069 — Set galleries + real photos + refreshed copy
-- ============================================
-- Mirrors the equipment/props pattern (see migration 030): adds a `gallery`
-- column to sets, points every set at the real photos now living in
-- /public/images/sets, and rewrites the customer-facing descriptions in a
-- richer voice. Photos are .webp (pulled from the live madekulture.com site).
-- Rendered by app/sets/[slug]/page.tsx (hero = photo_url, grid = gallery[1..]).

-- 1. Gallery column (ordered list of image paths; gallery[0] == hero) ---------
alter table sets add column if not exists gallery text[] default '{}';

-- 2. Photos + refreshed copy, per set ----------------------------------------

update sets set
  photo_url='/images/sets/set-a.webp',
  gallery=ARRAY[
    '/images/sets/set-a/1.webp','/images/sets/set-a/2.webp','/images/sets/set-a/3.webp',
    '/images/sets/set-a/4.webp','/images/sets/set-a/5.webp','/images/sets/set-a/6.webp',
    '/images/sets/set-a/7.webp','/images/sets/set-a/8.webp','/images/sets/set-a/9.webp',
    '/images/sets/set-a/10.webp'],
  description='Set A pairs raw white cinderblock with smooth plaster walls and floods the room with daylight through oversized windows. At 12 by 15 feet it is the studio''s most flexible white-room look — clean enough for commercial and e-comm, textured enough for editorial and portraiture. Style it bare for a minimalist frame or build it out with props; the natural light does most of the work either way.'
where slug='set-a';

update sets set
  photo_url='/images/sets/set-b.webp',
  gallery=ARRAY['/images/sets/set-b/1.webp'],
  description='Set B gives you two backdrops in one footprint: a textured faux-brush wall on one side and clean, dual-tone smooth walls on the other. At 12 by 14 feet it is built for shoots that need variety without resetting — pivot from a moody textured frame to a crisp color-blocked one in the same session. A workhorse for lookbooks, brand content, and portraits.'
where slug='set-b';

update sets set
  photo_url='/images/sets/set-c.webp',
  gallery=ARRAY['/images/sets/set-c/1.webp'],
  description='Set C anchors a clean white room with a bold 8''6" by 20'' seamless red vinyl sweep. When a concept calls for saturated, high-impact color that fills the frame, this is the set — the vinyl reads deep and cinematic under the right light and wipes clean for glossy floor reflections. 12 by 14 feet of pure statement backdrop.'
where slug='set-c';

-- Set D: no photos yet. Clear the broken hero, keep gallery empty, refresh copy.
update sets set
  photo_url=null,
  gallery='{}',
  description='Set D leans raw and industrial — exposed bare cinderblock, a single smooth colored accent wall, and a poured concrete floor. At 12 by 15 feet it is the go-to for streetwear, music, and any concept that wants grit over gloss.'
where slug='set-d';

update sets set
  photo_url='/images/sets/concrete.webp',
  gallery=ARRAY[
    '/images/sets/concrete/1.webp','/images/sets/concrete/2.webp','/images/sets/concrete/3.webp',
    '/images/sets/concrete/4.webp','/images/sets/concrete/5.webp','/images/sets/concrete/6.webp',
    '/images/sets/concrete/7.webp','/images/sets/concrete/8.webp','/images/sets/concrete/9.webp',
    '/images/sets/concrete/10.webp'],
  description='Concrete is all texture and reflection — faux concrete walls, a full-length mirror wall, and black rubber floors. The mirror doubles the space and opens up angles you cannot get anywhere else in the studio, which is why it is a favorite for fashion, fitness, and beauty. 12 by 16 feet of clean industrial edge.'
where slug='concrete';

update sets set
  photo_url='/images/sets/vintage.webp',
  gallery=ARRAY[
    '/images/sets/vintage/1.webp','/images/sets/vintage/2.webp','/images/sets/vintage/3.webp',
    '/images/sets/vintage/4.webp','/images/sets/vintage/5.webp','/images/sets/vintage/6.webp'],
  description='Vintage is a warm, lived-in set full of nostalgic character — the kind of space that makes a shoot feel like a memory. At 12 by 16 feet it is made for retro editorials, lifestyle stories, and heritage brand campaigns that call for patina and mood rather than a blank wall.'
where slug='vintage';

update sets set
  photo_url='/images/sets/cottage.webp',
  gallery=ARRAY[
    '/images/sets/cottage/1.webp','/images/sets/cottage/2.webp','/images/sets/cottage/3.webp',
    '/images/sets/cottage/4.webp','/images/sets/cottage/5.webp','/images/sets/cottage/6.webp'],
  description='Cottage trades hard studio edges for something softer — slate-toned walls over light faux-wood floors that read cozy and intimate on camera. At 12 by 16 feet it is a natural fit for beauty brands, soft lifestyle content, and any concept built around warmth and comfort.'
where slug='cottage';

update sets set
  photo_url='/images/sets/watering-hole.webp',
  gallery=ARRAY[
    '/images/sets/watering-hole/1.webp','/images/sets/watering-hole/2.webp','/images/sets/watering-hole/3.webp',
    '/images/sets/watering-hole/4.webp','/images/sets/watering-hole/5.webp','/images/sets/watering-hole/6.webp',
    '/images/sets/watering-hole/7.webp','/images/sets/watering-hole/8.webp','/images/sets/watering-hole/9.webp'],
  description='The Watering Hole is the studio''s signature set — a shallow black reflective pool that turns still water into a dramatic, mirror-like frame. Shoot standing in it, along the edge, or use the surrounding deck; the reflections and depth create imagery that is hard to find anywhere else in Houston. Booked with a 2-hour minimum.'
where slug='watering-hole';

update sets set
  photo_url='/images/sets/studio-one.webp',
  gallery=ARRAY[
    '/images/sets/studio-one/1.webp','/images/sets/studio-one/2.webp','/images/sets/studio-one/3.webp',
    '/images/sets/studio-one/4.webp','/images/sets/studio-one/5.webp','/images/sets/studio-one/6.webp',
    '/images/sets/studio-one/7.webp','/images/sets/studio-one/8.webp','/images/sets/studio-one/9.webp',
    '/images/sets/studio-one/10.webp','/images/sets/studio-one/11.webp','/images/sets/studio-one/12.webp',
    '/images/sets/studio-one/13.webp','/images/sets/studio-one/14.webp'],
  description='Studio One is the raw one — a large, open warehouse space with exposed structure, weathered surfaces, and an unpolished, dilapidated atmosphere. No seamless and no styling, just character and room to move, which makes it ideal for big productions, music videos, and gritty editorial concepts that need scale and texture.'
where slug='studio-one';

-- ============================================
-- Migration 008 — Make the customer-facing set pages fully DB-driven
-- ============================================
-- Adds the presentation fields the marketing pages need (slug, photo, dims,
-- ordering, grouping, accent gradient) and backfills every customer-facing set
-- with the rich copy that previously lived hardcoded in app/sets/page.tsx and
-- app/book/page.tsx. After this runs, /sets and /book read from the DB, so the
-- admin Sets Manager is the single source of truth.

-- 1. New columns -------------------------------------------------------------
alter table sets add column if not exists slug            text;
alter table sets add column if not exists photo_url       text;
alter table sets add column if not exists dimensions      text;
alter table sets add column if not exists sort_order      int  default 100;
alter table sets add column if not exists category        text default 'standard'; -- 'standard' | 'premium'
alter table sets add column if not exists accent_gradient text;

-- 2. Backfill the 10 customer-facing sets ------------------------------------
-- Slugs MUST match the existing booking / availability / Acuity maps.

update sets set
  slug='set-a', dimensions='12 × 15 ft', photo_url='/images/sets/set-a.jpg',
  sort_order=1, category='standard',
  accent_gradient='linear-gradient(135deg, #1c1c1c 0%, #2a2a2a 100%)',
  description='White cinderblock walls meet smooth plaster in a versatile space flooded with natural light from large windows. A blank canvas that works for editorial, commercial, and portrait work alike.',
  features='{"Cinderblock","Smooth Walls","Large Windows","Natural Light"}'
where name='Set A';

update sets set
  slug='set-b', dimensions='12 × 14 ft', photo_url='/images/sets/set-b.jpg',
  sort_order=2, category='standard',
  accent_gradient='linear-gradient(135deg, #0f1a1a 0%, #1a2a1e 100%)',
  description='Textured faux brush walls on one side, clean duo-color smooth walls on the other. Two distinct looks in one set — ideal for shoots that need variety without changing locations.',
  features='{"Faux Brush Walls","Duo Color","Two Looks","Textured"}'
where name='Set B';

update sets set
  slug='set-c', dimensions='12 × 14 ft', photo_url='/images/sets/set-c.jpg',
  sort_order=3, category='standard',
  accent_gradient='linear-gradient(135deg, #1a0808 0%, #2a0f0f 100%)',
  description='Clean white walls anchored by a striking 8''6" × 20'' seamless red vinyl backdrop. When you need a bold, saturated statement background that commands the frame.',
  features='{"White Walls","Red Vinyl Backdrop","20ft Seamless","Bold Color"}'
where name='Set C';

update sets set
  slug='set-d', dimensions='12 × 15 ft', photo_url='/images/sets/set-d.jpg',
  sort_order=4, category='standard',
  accent_gradient='linear-gradient(135deg, #141414 0%, #1e1e1e 100%)',
  description='Raw bare cinderblock walls, a single smooth colored accent wall, and concrete floors. Gritty and industrial — perfect for streetwear, music, and anything that needs an edge.',
  features='{"Bare Cinderblock","Colored Wall","Concrete Floor","Industrial"}'
where name='Set D';

update sets set
  slug='concrete', dimensions='12 × 16 ft', photo_url='/images/sets/concrete.jpg',
  sort_order=5, category='standard',
  accent_gradient='linear-gradient(135deg, #111418 0%, #1a1e22 100%)',
  description='Faux concrete walls, a full mirror wall, and rubber black floors. The mirror opens up the space and creates unique angles — a favorite for fashion, fitness, and beauty work.',
  features='{"Faux Concrete","Mirror Wall","Black Rubber Floor","Fashion"}'
where name='Concrete';

update sets set
  slug='vintage', dimensions='12 × 16 ft', photo_url='/images/sets/vintage.jpg',
  sort_order=6, category='standard',
  accent_gradient='linear-gradient(135deg, #1a1408 0%, #261e0e 100%)',
  description='A warm, character-rich aesthetic loaded with nostalgic details. Bring your retro editorial concepts, lifestyle shoots, or vintage brand campaigns to life in this one-of-a-kind set.',
  features='{"Vintage Aesthetic","Warm Tones","Character","Lifestyle"}'
where name='Vintage';

update sets set
  slug='cottage', dimensions='12 × 16 ft', photo_url='/images/sets/cottage.jpg',
  sort_order=7, category='standard',
  accent_gradient='linear-gradient(135deg, #0e1412 0%, #161e18 100%)',
  description='Slate-toned walls paired with light brown faux wood flooring create a cozy, intimate atmosphere. Great for beauty brands, soft lifestyle content, and any concept that calls for warmth.',
  features='{"Slate Walls","Faux Wood Floor","Cozy","Beauty"}'
where name='Cottage';

update sets set
  slug='studio-one', dimensions='Large open space', photo_url='/images/sets/studio-one.jpg',
  sort_order=8, category='standard',
  accent_gradient='linear-gradient(135deg, #161210 0%, #1e1a16 100%)',
  description='A large open area with a raw, dilapidated warehouse aesthetic — exposed structure, weathered surfaces, and a gritty industrial atmosphere. No polish. Just character.',
  features='{"Industrial","Warehouse Aesthetic","Open Space","Raw","Dilapidated"}'
where name='Studio One';

update sets set
  slug='watering-hole', dimensions='12 × 16 × 13 ft', photo_url='/images/sets/watering-hole.jpg',
  sort_order=9, category='premium',
  accent_gradient='linear-gradient(135deg, #040e12 0%, #081820 100%)',
  description='A shallow black reflective pool with dramatic depth. Shoot in the water, on the edge, or use the surrounding space — the visual possibilities are unlike anything else in Houston. 2-hour minimum.',
  features='{"Black Pool","Water Reflections","Dramatic","Unique"}'
where name='The Watering Hole';

update sets set
  slug='the-tank', dimensions='12 × 16 ft', photo_url='/images/sets/the-tank.jpg',
  sort_order=10, category='premium',
  accent_gradient='linear-gradient(135deg, #06121a 0%, #0a1f2a 100%)',
  description='A dedicated pool set for water-based concepts — submersion, reflections, and waterline shots. A distinct look from The Watering Hole. 2-hour minimum.',
  features='{"Pool","Water","Dramatic","Unique"}'
where name='The Tank';

-- 3. Auto-slug any remaining rows (promo / seasonal sets) so admin can flip
--    them on later. Lowercase, strip apostrophes, non-alnum -> hyphen, trim.
update sets
set slug = trim(both '-' from
            regexp_replace(
              regexp_replace(lower(name), '''', '', 'g'),
              '[^a-z0-9]+', '-', 'g'))
where slug is null;

-- 4. Enforce uniqueness now that every row has a slug.
create unique index if not exists sets_slug_key on sets (slug);

-- Equipment galleries + attach the organized photos to existing items.
-- Images live in public/images/equipment/<slug>/N.jpg (committed to the repo).

-- 1) Gallery column (multiple photos per item, like props)
alter table equipment add column if not exists gallery text[] default '{}';

-- 2) Attach photos to the 7 existing items (image_url = hero = gallery[0])
update equipment set
  image_url = '/images/equipment/canon-eos-r5/1.jpg',
  gallery = ARRAY['/images/equipment/canon-eos-r5/1.jpg','/images/equipment/canon-eos-r5/2.jpg','/images/equipment/canon-eos-r5/3.jpg']
where name = 'Canon EOS R5';

update equipment set
  image_url = '/images/equipment/amaran-200x-bi-color-led-monolight/1.jpg',
  gallery = ARRAY['/images/equipment/amaran-200x-bi-color-led-monolight/1.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/2.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/3.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/4.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/5.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/6.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/7.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/8.jpg','/images/equipment/amaran-200x-bi-color-led-monolight/9.jpg']
where name = 'Amaran 200x Bi-Color LED Monolight';

update equipment set
  image_url = '/images/equipment/aputure-ls-300x-bi-color-led-monolight/1.jpg',
  gallery = ARRAY['/images/equipment/aputure-ls-300x-bi-color-led-monolight/1.jpg']
where name = 'Aputure LS 300x Bi-Color LED Monolight';

update equipment set
  image_url = '/images/equipment/aputure-ls-c300d-ii-daylight-led-monolight/1.jpg',
  gallery = ARRAY['/images/equipment/aputure-ls-c300d-ii-daylight-led-monolight/1.jpg','/images/equipment/aputure-ls-c300d-ii-daylight-led-monolight/2.jpg','/images/equipment/aputure-ls-c300d-ii-daylight-led-monolight/3.jpg','/images/equipment/aputure-ls-c300d-ii-daylight-led-monolight/4.jpg','/images/equipment/aputure-ls-c300d-ii-daylight-led-monolight/5.jpg','/images/equipment/aputure-ls-c300d-ii-daylight-led-monolight/6.jpg']
where name = 'Aputure LS C300d II Daylight LED Monolight';

update equipment set
  image_url = '/images/equipment/flashpoint-xplor-400-pro/1.jpg',
  gallery = ARRAY['/images/equipment/flashpoint-xplor-400-pro/1.jpg','/images/equipment/flashpoint-xplor-400-pro/2.jpg']
where name = 'Flashpoint XPLOR 400 Pro';

update equipment set
  image_url = '/images/equipment/aputure-spotlight-mount-36-lens/1.jpg',
  gallery = ARRAY['/images/equipment/aputure-spotlight-mount-36-lens/1.jpg','/images/equipment/aputure-spotlight-mount-36-lens/2.jpg','/images/equipment/aputure-spotlight-mount-36-lens/3.jpg','/images/equipment/aputure-spotlight-mount-36-lens/4.jpg']
where name = 'Aputure Spotlight Mount with 36° Lens';

update equipment set
  image_url = '/images/equipment/christie-hd6k-m-projector/1.jpg',
  gallery = ARRAY['/images/equipment/christie-hd6k-m-projector/1.jpg']
where name = 'Christie HD6K-M Projector';

-- 3) New item: 4ft RGB Battery LED Tube Light ($15)
insert into equipment (name, rate, category, quantity, description, image_url, gallery, is_available, sort_order)
select
  '4ft RGB Battery LED Tube Light', 15, 'lighting', 1,
  '4ft RGB battery-powered LED tube light. Full-color (RGB) with adjustable white, cordless and mountable anywhere for accents, backgrounds, and creative color effects.',
  '/images/equipment/4ft-rgb-battery-led-tube-light/1.jpg',
  ARRAY['/images/equipment/4ft-rgb-battery-led-tube-light/1.jpg','/images/equipment/4ft-rgb-battery-led-tube-light/2.jpg','/images/equipment/4ft-rgb-battery-led-tube-light/3.jpg'],
  true, 0
where not exists (select 1 from equipment where name = '4ft RGB Battery LED Tube Light');

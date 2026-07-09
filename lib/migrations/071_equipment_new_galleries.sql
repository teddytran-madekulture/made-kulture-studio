-- 071_equipment_new_galleries.sql
-- Attach newly added Rental Gear photos to 8 existing equipment rows (were gallery-empty).
-- Images live in public/images/equipment/<slug>/N.<ext> (committed to the repo).

update equipment set
  image_url = '/images/equipment/amaran-300c-300w-rgbww-led-light/1.webp',
  gallery = ARRAY['/images/equipment/amaran-300c-300w-rgbww-led-light/1.webp','/images/equipment/amaran-300c-300w-rgbww-led-light/2.webp','/images/equipment/amaran-300c-300w-rgbww-led-light/3.webp','/images/equipment/amaran-300c-300w-rgbww-led-light/4.webp','/images/equipment/amaran-300c-300w-rgbww-led-light/5.webp','/images/equipment/amaran-300c-300w-rgbww-led-light/6.webp']
  where name = 'Amaran 300c 300W RGBWW LED Light';

update equipment set
  image_url = '/images/equipment/aputure-amaran-f22c/1.webp',
  gallery = ARRAY['/images/equipment/aputure-amaran-f22c/1.webp','/images/equipment/aputure-amaran-f22c/2.webp','/images/equipment/aputure-amaran-f22c/3.webp','/images/equipment/aputure-amaran-f22c/4.webp','/images/equipment/aputure-amaran-f22c/5.webp','/images/equipment/aputure-amaran-f22c/6.webp','/images/equipment/aputure-amaran-f22c/7.webp']
  where name = 'Aputure Amaran F22C';

update equipment set
  image_url = '/images/equipment/aputure-amaran-pt4c-2-light-kit/1.webp',
  gallery = ARRAY['/images/equipment/aputure-amaran-pt4c-2-light-kit/1.webp','/images/equipment/aputure-amaran-pt4c-2-light-kit/2.webp','/images/equipment/aputure-amaran-pt4c-2-light-kit/3.webp','/images/equipment/aputure-amaran-pt4c-2-light-kit/4.webp']
  where name = 'Aputure Amaran PT4c 2 Light Kit';

update equipment set
  image_url = '/images/equipment/aputure-ls-600d-daylight-led-monolight/1.webp',
  gallery = ARRAY['/images/equipment/aputure-ls-600d-daylight-led-monolight/1.webp','/images/equipment/aputure-ls-600d-daylight-led-monolight/2.webp','/images/equipment/aputure-ls-600d-daylight-led-monolight/3.webp','/images/equipment/aputure-ls-600d-daylight-led-monolight/4.webp','/images/equipment/aputure-ls-600d-daylight-led-monolight/5.webp']
  where name = 'Aputure LS 600d Daylight LED Monolight';

update equipment set
  image_url = '/images/equipment/flashpoint-xplor-100-pro-battery-monolight/1.jpg',
  gallery = ARRAY['/images/equipment/flashpoint-xplor-100-pro-battery-monolight/1.jpg','/images/equipment/flashpoint-xplor-100-pro-battery-monolight/2.jpg','/images/equipment/flashpoint-xplor-100-pro-battery-monolight/3.jpg','/images/equipment/flashpoint-xplor-100-pro-battery-monolight/4.jpg','/images/equipment/flashpoint-xplor-100-pro-battery-monolight/5.jpg','/images/equipment/flashpoint-xplor-100-pro-battery-monolight/6.jpg']
  where name = 'Flashpoint XPLOR 100 Pro Battery Monolight';

update equipment set
  image_url = '/images/equipment/profoto-2x-d1-air-500w-studio-kit/1.jpg',
  gallery = ARRAY['/images/equipment/profoto-2x-d1-air-500w-studio-kit/1.jpg','/images/equipment/profoto-2x-d1-air-500w-studio-kit/2.jpg','/images/equipment/profoto-2x-d1-air-500w-studio-kit/3.jpg','/images/equipment/profoto-2x-d1-air-500w-studio-kit/4.jpg']
  where name = 'Profoto 2x D1 Air 500w Studio Kit';

update equipment set
  image_url = '/images/equipment/adj-entourage-1400w-haze-machine/1.webp',
  gallery = ARRAY['/images/equipment/adj-entourage-1400w-haze-machine/1.webp','/images/equipment/adj-entourage-1400w-haze-machine/2.webp','/images/equipment/adj-entourage-1400w-haze-machine/3.webp']
  where name = 'ADJ Entourage 1400W Haze Machine';

update equipment set
  image_url = '/images/equipment/antari-ice-101-ice-fog-machine/1.jpg',
  gallery = ARRAY['/images/equipment/antari-ice-101-ice-fog-machine/1.jpg','/images/equipment/antari-ice-101-ice-fog-machine/2.jpg','/images/equipment/antari-ice-101-ice-fog-machine/3.jpg','/images/equipment/antari-ice-101-ice-fog-machine/4.jpg','/images/equipment/antari-ice-101-ice-fog-machine/5.jpg']
  where name = 'ANTARI ICE-101 Ice Fog Machine';

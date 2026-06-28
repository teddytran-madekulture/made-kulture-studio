-- ============================================
-- Migration 006 — Equipment descriptions
-- ============================================
-- Accurate, original descriptions for the current gear catalog (shown on the
-- /gear page and as hover hints in the booking picker). Edit anytime in the
-- admin Equipment manager. Matched by name; only fills rows that exist.

update equipment set description = 'Powerful 600W daylight-balanced (5600K) LED point-source. Punches through large spaces and big modifiers — a go-to key light for video and photo.' where name = 'Aputure LS 600d Daylight LED Monolight';
update equipment set description = '300W daylight (5600K) LED with bright, accurate output and near-silent cooling. Versatile key or fill for portraits, interviews, and product work.' where name = 'Aputure LS C300d II Daylight LED Monolight';
update equipment set description = '300W bi-color (2700–6500K) LED — dial warm to cool on set without gels. A reliable all-around key/fill light.' where name = 'Aputure LS 300x Bi-Color LED Monolight';
update equipment set description = 'Flexible 2x2ft RGBWW LED mat. Soft, wraparound light with full color control; bends and mounts almost anywhere for creative setups.' where name = 'Aputure Amaran F22C';
update equipment set description = 'Pair of 4ft RGBWW LED pixel tubes for accents, backgrounds, and effects. Full color, app/DMX controllable.' where name = 'Aputure Amaran PT4c 2 Light Kit';
update equipment set description = '300W full-color (RGBWW) LED point-source. Bright key light with built-in color and effects — from clean daylight to deep saturated hues.' where name = 'Amaran 300c 300W RGBWW LED Light';
update equipment set description = '200W bi-color (2700–6500K) LED. Compact, dependable key/fill — one is already included free with every set rental.' where name = 'Amaran 200x Bi-Color LED Monolight';
update equipment set description = 'Two 500Ws Profoto D1 strobes with built-in Air wireless. Crisp, fast flash for high-end studio photography; works with a wide range of modifiers.' where name = 'Profoto 2x D1 Air 500w Studio Kit';
update equipment set description = '400Ws battery-powered strobe (Godox AD400 Pro) with TTL and high-speed sync. Portable, consistent flash for photo on or off a stand.' where name = 'Flashpoint XPLOR 400 Pro';
update equipment set description = 'Pocket-sized 100Ws battery strobe with TTL/HSS. Lightweight accent or grab-and-go key light.' where name = 'Flashpoint XPLOR 100 Pro Battery Monolight';
update equipment set description = 'Optical spotlight attachment (36° lens) for Aputure LS lights. Creates hard, focused beams and projected shapes/gobos.' where name = 'Aputure Spotlight Mount with 36° Lens';
update equipment set description = '1400W haze machine for atmospheric haze that reveals light beams. Haze fluid included. Available for full-warehouse or solo bookings only.' where name = 'ADJ Entourage 1400W Haze Machine';
update equipment set description = 'Low-lying ice fog machine for a thick fog that hugs the floor. Includes 2.5L fluid (ice/dry ice not included). Full-warehouse or solo bookings only.' where name = 'ANTARI ICE-101 Ice Fog Machine';
update equipment set description = '6,000-lumen professional projector for large-scale projection, custom backdrops, and immersive light effects.' where name = 'Christie HD6K-M Projector';
update equipment set description = '45MP full-frame mirrorless body with 8K video. Pro stills and video camera available for in-studio rental.' where name = 'Canon EOS R5';

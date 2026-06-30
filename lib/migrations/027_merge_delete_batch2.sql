-- 027: merge batch 2 + delete white-angel-wings
insert into props (name,category,image_url,is_active,sort_order,slug,gallery) values ('Oriental Art Panels','Misc','/images/props/oriental-art-panel-pair.jpg',true,500,'oriental-art-panels','["/images/props/oriental-art-panel-pair.jpg", "/images/props/oriental-art-panel-single.jpg"]'::jsonb);
delete from props where slug in ('oriental-art-panel-pair','oriental-art-panel-single');
insert into props (name,category,image_url,is_active,sort_order,slug,gallery) values ('Rattan Lantern','Misc','/images/props/rattan-lantern-with-handle.jpg',true,500,'rattan-lantern','["/images/props/rattan-lantern-with-handle.jpg", "/images/props/rattan-ball-lantern.jpg"]'::jsonb);
delete from props where slug in ('rattan-lantern-with-handle','rattan-ball-lantern');
insert into props (name,category,image_url,is_active,sort_order,slug,gallery) values ('Rattan Folding Screen','Misc','/images/props/rattan-folding-screen.jpg',true,500,'rattan-screen','["/images/props/rattan-folding-screen.jpg", "/images/props/rattan-folding-screen/2.jpg", "/images/props/rattan-folding-screen/3.jpg", "/images/props/tall-wicker-case.jpg"]'::jsonb);
delete from props where slug in ('rattan-folding-screen','tall-wicker-case');
insert into props (name,category,image_url,is_active,sort_order,slug,gallery) values ('Vintage Cameras','Misc','/images/props/vintage-box-camera.jpg',true,500,'vintage-cameras','["/images/props/vintage-box-camera.jpg", "/images/props/vintage-bellows-camera-2.jpg", "/images/props/vintage-folding-camera-1.jpg", "/images/props/vintage-press-camera-3.jpg", "/images/props/vintage-press-camera-3/2.jpg"]'::jsonb);
delete from props where slug in ('vintage-box-camera','vintage-bellows-camera-2','vintage-folding-camera-1','vintage-press-camera-3');
insert into props (name,category,image_url,is_active,sort_order,slug,gallery) values ('Wood Folding Screen','Misc','/images/props/wood-folding-screen-2.jpg',true,500,'wood-folding-screen','["/images/props/wood-folding-screen-2.jpg", "/images/props/wood-louvered-folding-screen-1.jpg", "/images/props/wood-louvered-folding-screen-1/2.jpg", "/images/props/wood-louvered-folding-screen-1/3.jpg"]'::jsonb);
delete from props where slug in ('wood-folding-screen-2','wood-louvered-folding-screen-1');
insert into props (name,category,image_url,is_active,sort_order,slug,gallery) values ('Wooden Phonograph Box','Misc','/images/props/wooden-lap-desk.jpg',true,500,'wooden-phonograph','["/images/props/wooden-lap-desk.jpg", "/images/props/wooden-phonograph-box.jpg", "/images/props/wooden-phonograph-box/2.jpg"]'::jsonb);
delete from props where slug in ('wooden-lap-desk','wooden-phonograph-box');
insert into props (name,category,image_url,is_active,sort_order,slug,gallery) values ('Woven Rattan Box','Misc','/images/props/woven-rattan-box.jpg',true,500,'woven-box','["/images/props/woven-rattan-box.jpg", "/images/props/wicker-basket-ottoman.jpg"]'::jsonb);
delete from props where slug in ('woven-rattan-box','wicker-basket-ottoman');
delete from props where slug in ('white-angel-wings');

-- Portfolio moderation: let admins soft-archive (hide) an image without deleting
-- it. Hidden images are removed from public profiles but kept in the DB/storage
-- so they can be restored. Permanent removal is a separate DELETE.
alter table portfolio_images add column if not exists hidden boolean not null default false;
create index if not exists portfolio_images_hidden_idx on portfolio_images (hidden);

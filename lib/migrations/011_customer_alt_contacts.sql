-- ============================================
-- Migration 011 — Keep alternate emails/phones when merging duplicates
-- ============================================
-- When two customer records are merged, any email or phone that differs from
-- the primary is preserved here instead of being lost. The merged profile then
-- shows every known way to reach that person, and search can match them.

alter table customers add column if not exists alt_emails text[] not null default '{}';
alter table customers add column if not exists alt_phones text[] not null default '{}';

create index if not exists customers_alt_emails_idx on customers using gin (alt_emails);
create index if not exists customers_alt_phones_idx on customers using gin (alt_phones);

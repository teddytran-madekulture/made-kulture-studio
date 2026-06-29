-- ============================================
-- Migration 012 — Keep alternate names when merging duplicates
-- ============================================
-- Like alt_emails / alt_phones: when merging, any name that differs from the
-- primary is preserved here (stage name, maiden name, nickname, spelling
-- variant) instead of being lost. Search matches these too.

alter table customers add column if not exists alt_names text[] not null default '{}';

create index if not exists customers_alt_names_idx on customers using gin (alt_names);

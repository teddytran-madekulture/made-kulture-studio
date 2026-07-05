-- ============================================
-- Migration 062 — Branded email templates for marketing campaigns
-- ============================================
-- Campaigns can now be composed from a picked template + editable field values
-- (template_id + template_data). body_html stays for legacy/custom-HTML sends and
-- becomes nullable since template campaigns render their HTML at send time.

alter table marketing_campaigns add column if not exists template_id   text;
alter table marketing_campaigns add column if not exists template_data jsonb;
alter table marketing_campaigns alter column body_html drop not null;

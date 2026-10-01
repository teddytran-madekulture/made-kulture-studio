-- ============================================
-- Migration 130 — Door code lives on the check-in page (2026-10-01)
-- ============================================
-- Texts and emails no longer carry the code; the guest taps CHECK IN on
-- /checkin/<token> at the studio and the code appears (lib/igloohome.ts
-- doorCodeLinkLine). Arrivals follow lib/arrival.ts: ONE owner push per
-- booking, from the door or the kiosk (whichever is first), never the phone.

-- When the guest revealed the code on their phone (the tap also counts as a
-- check-in — Teddy: people slip in behind each other, so this is the trace).
alter table bookings add column if not exists code_revealed_at timestamptz;
-- How the booking was FIRST checked in: 'phone' | 'door' | 'kiosk' | 'desk'.
-- ATLAS shows every signal separately; this is just the first.
alter table bookings add column if not exists checked_in_via text;
-- First time the booking's own code opened a door (the igloohome webhook).
alter table bookings add column if not exists door_entered_at timestamptz;
-- The one-arrival-push claim: door and kiosk both try to take it; whoever
-- does sends the push. Phone check-in never claims it.
alter table bookings add column if not exists arrival_alerted_at timestamptz;

-- June's existing door_codes entry says codes are "texted and emailed when
-- they book" and that an extension texts a new one. Both are now wrong, so the
-- two sentences are replaced in place (one entry, no contradiction).
update agent_kb set content = replace(replace(content,
  'Every booking gets its own door code(s), texted and emailed when they book.',
  'Every booking gets its own door code(s). The code is NOT in the confirmation text or email: when the guest arrives they open the check-in link from their confirmation text (or their account page), tap CHECK IN, and the code appears on that page. The button opens 30 minutes before the booked start time. No signal at the door? They can reply CODE to the confirmation text and the code is texted back (only while their session is live or starts within 30 minutes). June must never read a door code out herself.'),
  'If they extended their session, a NEW code was texted to them — the old one stops at the original end time, so make sure they are using the most recent text.',
  'If they extended their session, a NEW code was issued — the old one stops at the original end time. The check-in page always shows the current code, so they should reopen their check-in link.')
where topic = 'door_codes';

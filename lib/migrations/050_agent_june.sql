-- ============================================
-- Migration 050 — June, the customer service agent (Phase 1: website chat)
-- ============================================
-- Tables are accessed ONLY through API routes (service role), so RLS is enabled
-- with no public policies. Spec: Customer_Service_Agent_Spec.md.

create table if not exists agent_conversations (
  id              uuid primary key default gen_random_uuid(),
  token           text unique not null,              -- widget bearer token (localStorage)
  channel         text not null default 'web',       -- web | sms | instagram (future)
  status          text not null default 'open',      -- open | needs_teddy | closed
  human_takeover  boolean not null default false,    -- true = June is silent, Teddy is typing
  auth_user_id    uuid,                              -- set when the visitor is logged in
  visitor_name    text,
  visitor_email   text,
  page            text,                              -- path where the chat started
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table if not exists agent_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references agent_conversations(id) on delete cascade,
  role            text not null,                     -- user | agent | teddy | system
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists agent_messages_convo_idx on agent_messages (conversation_id, created_at);

create table if not exists agent_kb (
  id         uuid primary key default gen_random_uuid(),
  topic      text not null,
  content    text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table agent_conversations enable row level security;
alter table agent_messages      enable row level security;
alter table agent_kb            enable row level security;

-- Kill switch (Admin → Inbox). June also requires ANTHROPIC_API_KEY in env.
insert into studio_settings (key, value)
select 'cs_agent_enabled', 'true'
where not exists (select 1 from studio_settings where key = 'cs_agent_enabled');

-- ── Knowledge base seed (edit rows anytime; June only states what's in here) ──
insert into agent_kb (topic, content) values
('hours_location', 'Shared studio hours: Monday–Sunday, 9am–10pm. Address: 4825 Gulf Freeway, Houston TX 77023. Outside-hours bookings are available on request at the full warehouse rate.'),
('booking_basics', 'All bookings are made online through the website. Two options: (1) Shared Studio — book one individual set during shared hours, up to 5 people per set; (2) Full Studio Buyout — the entire warehouse for private productions, up to 30 people. Bookings must be made at least 48 hours in advance. Guests may arrive 15 minutes early; all setup and breakdown must happen within the booked time. Set reservations are for that specific set only — no switching sets mid-session. Going more than 15 minutes over is automatically charged an additional hour.'),
('sets_pricing', 'Sets ($/hour): Set A $40 (12x15'' white cinderblock + smooth walls, large windows) · Set B $40 (12x14'' faux brush walls, duo color smooth walls) · Set C $40 (12x14'' white walls with 8''6"x20'' seamless red vinyl backdrop) · Set D $40 (12x15'' bare cinderblock, single smooth colored wall, concrete floor) · Concrete $40 (12x16'' faux concrete walls, mirror wall, rubber black floors) · Vintage $40 (12x16'' vintage aesthetic) · Cottage $40 (12x16'' slate walls, light brown faux wood flooring) · The Watering Hole $75, 2-hour minimum (12x16x13 shallow black pool) · Studio One $65 (large open dilapidated warehouse aesthetic). Full studio buyout rate: check the booking page (set by admin). For live availability use the availability check.'),
('whats_included', 'Every set includes one Amaran 200x LED light. Extra lights can be added for $25 each. Props are included with standard rental — first come, first serve during shared hours; all props must be returned to their original locations before the session ends.'),
('equipment', 'In-studio equipment rentals (per session): Aputure LS 600d $70 · LS C300d II $50 · LS 300x $50 · Amaran F22C $50 · Amaran PT4c 2-light kit $50 · Amaran 300c $35 · Amaran 200x $25 · Profoto 2x D1 Air 500w kit $150 · Flashpoint XPLOR 400 Pro $30 · XPLOR 100 Pro $20 · Aputure Spotlight Mount 36° $25 · Haze machine $60 (fluid included) · Ice fog machine $65 (ice not included) · Christie HD6K-M projector $150 · Canon EOS R5 $65 · 4ft RGB battery LED tube $15. Equipment is in-studio only; for off-site rentals see Sharegrid.'),
('guest_limits', 'Individual set: up to 5 people total on premises for your booking — this includes photographers, models, stylists, assistants, clients, and children. Full studio buyout: up to 30 people. Extra guests are not allowed on premises even if they are not on set.'),
('cancellation', 'Full refund if cancelled 48+ hours before the booking start time. No refund for cancellations within 48 hours of the booking. Additional time can be added during a session if no booking follows on that set.'),
('rules', 'Nudity: not allowed during shared bookings unless your party is the only booking (full buyout recommended). Audio: the studio is not soundproofed and sits near the I-45 freeway — full buyout recommended for audio recording. Fog/haze effects: full warehouse or solo bookings only. Studio blackout for controlled lighting/projector: primarily full buyouts or solo bookings. Messy concepts (paint, fake blood, glitter, smoke bombs, excessive oils) must be pre-approved — text (832) 408-1631. Cleaning fee: minimum $150 for non-compliance with cleanup rules. Children are allowed, but shared-space conditions may not be appropriate for them.'),
('parking_climate', 'Limited parking in front; street parking in the rear. Only higher vehicles (SUVs, trucks, vans without tow hitches) can use the steep ramp to Studio One without undercarriage damage. Climate: no central A/C — large fans for cooling and a natural gas heater for warmth; partial A/C has been added in ongoing Phase 3 upgrades (new roof, makeup vanity, changing areas).'),
('contact_escalation', 'For anything June cannot answer, custom requests, refund questions, or approvals: text (832) 408-1631 (text only). Instagram: @madekulture. June can also flag the conversation for Teddy directly.');

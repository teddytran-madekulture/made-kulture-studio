# Made Kulture

## Brand Overview
Made Kulture is a Houston-based creative studio rental space located at 4825 Gulf Freeway, Houston TX 77023. It operates as an open shared warehouse studio designed for photographers, videographers, content creators, brands, and production teams. The studio's ethos centers on providing a creative, collaborative environment where artists can shoot alongside peers or book private productions depending on the scale of their project.

## What It Does
Made Kulture provides rentable studio sets, full warehouse buyouts, and in-studio equipment rentals. Sets are designed as blank canvases that clients can style and customize with available props. The space serves individual creators and large production teams alike.

## Services

### Studio Space Rental
- **Shared Studio (Single Set)** — Book one individual set during shared business hours. Up to 5 people per set. Sets can be customized with available props.
- **Full Studio Buyout (Production Space)** — Reserve the entire warehouse for larger productions requiring privacy and creative freedom. Accommodates up to 30 people.

### Sets & Pricing
| Set | Rate | Description |
|---|---|---|
| Set A | $40/hr | 12x15' white cinderblock and smooth walls, large windows |
| Set B | $40/hr | 12x14' faux brush walls and duo color smooth walls |
| Set C | $40/hr | 12x14' white walls with 8'6"x20' seamless red vinyl backdrop |
| Set D | $40/hr | 12x15' bare cinderblock, single smooth colored wall, concrete floor |
| Concrete | $40/hr | 12x16' faux concrete walls, mirror wall, rubber black floors |
| Vintage | $40/hr | 12x16' vintage aesthetic |
| Cottage | $40/hr | 12x16' slate walls, light brown faux wood flooring |
| The Watering Hole | $75/hr (2hr min) | 12x16x13 shallow black pool |
| Studio One | $65/hr | Large open dilapidated warehouse aesthetic |

### Equipment Rental
All equipment is available for in-studio rental only. For off-site rentals visit Sharegrid.

**Lighting**
- Aputure LS 600d Daylight LED Monolight — $70
- Aputure LS C300d II Daylight LED Monolight — $50
- Aputure LS 300x Bi-Color LED Monolight — $50
- Aputure Amaran F22C — $50
- Aputure Amaran PT4c 2 Light Kit — $50
- Amaran 300c 300W RGBWW LED Light — $35
- Amaran 200x Bi-Color LED Monolight — $25
- Profoto 2x D1 Air 500w Studio Kit — $150
- Flashpoint XPLOR 400 Pro (Godox AD400 Pro) — $30
- Flashpoint XPLOR 100 Pro Battery Monolight — $20

**Light Modifiers**
- Aputure Spotlight Mount with 36° Lens — $25

**Special Effects**
- ADJ Entourage 1400W Haze Machine — $60 (haze fluid included)
- ANTARI ICE-101 Ice Fog Machine + 2.5L fluid — $65 (ice/dry ice not included)
- Christie HD6K-M Projector — $150

**Camera**
- Canon EOS R5 — $65

## Operations

### Hours & Location
- **Hours:** Monday–Sunday, 9am–10pm (shared studio)
- **Address:** 4825 Gulf Freeway, Houston TX 77023

### Contact
- **Phone:** (832) 408-1631 — text message only
- **Instagram:** https://www.instagram.com/madekulture/
- **Website:** https://madekulture.com
- **Sharegrid (off-site rentals):** https://www.sharegrid.com/p/teddy_tran2

### Booking
- Single set bookings and full studio buyouts are handled online via the website
- Separate booking flows exist for individual sets vs. entire studio rental

## Studio Rules & FAQ

### Booking Policy
- All bookings must be made at least 48 hours in advance
- Bookings start on the hour and run in 30-minute increments with a 1-hour minimum — e.g. 1:00–2:30 (some sets have longer minimums)
- Your set unlocks at your booked start time — guests cannot enter early; arriving a few minutes early to be ready is encouraged. All setup and breakdown must happen within your booked time
- Set reservations are for that specific set only — changing sets mid-session is not allowed
- Overages past 15 minutes are charged an additional hour
- Outside-hours bookings are available upon request at the full warehouse rate

### Cancellation Policy
- Full refund if cancelled 48+ hours before booking start time
- No refund for cancellations within 48 hours of the booking

### Guest Limits
- Individual set: up to 5 people total (includes photographers, models, stylists, assistants, clients, children, etc.)
- Full studio buyout: up to 30 people
- Extra guests are not allowed on premises even if not on the set

### Set Amenities
- Each set includes one Amaran 200x LED light
- Additional lights can be added for $25 each
- Props are included with standard rental — first come first serve during shared hours
- All props must be returned to original locations before session ends

### Rules & Restrictions
- **Nudity:** Not allowed during shared bookings unless your party is the only booking
- **Audio:** Studio is not soundproofed and sits near the I-45 freeway — full buyout recommended for audio recording
- **Effects (fog/haze):** Not allowed during shared bookings; available for full warehouse or solo bookings only
- **Studio Blackout:** Available for controlled lighting or projector use — primarily for full buyouts or solo bookings
- **Messy concepts** (paint, fake blood, glitter, smoke bombs, excessive oils, etc.) must be pre-approved
- **Cleaning fee:** Minimum $150 charge for non-compliance with cleanup rules
- **Children:** Allowed but shared space conditions and other productions may not be appropriate

### Parking
- Limited parking at the front; street parking available in the rear
- Only higher vehicles (SUVs, trucks, vans without tow hitches) can access Studio One via the steep ramp without undercarriage damage

### Climate
- No central A/C — large fans for cooling, natural gas heater for warmth
- Phase 3 upgrades include partial A/C (in progress)

### Adding Time
- Additional time can be booked during your session if no booking follows yours on that set

### Current Upgrades (Phase 3 — Ongoing)
- New roof installed (no more leaks, cooler temps)
- Partial air conditioning added
- Makeup vanity and changing areas added
- Structural and safety improvements underway
- New rates took effect January 2026

## Notes
<!-- Add personal context here — e.g. relationship to the studio, how it connects to Salt Kisses shoots, preferred sets, equipment you use regularly, etc. -->

## Folder Structure
```
Made Kulture/
├── CLAUDE.md                          — this file
├── 01 Daily Logs/                     — session logs written by Claude
│   └── [C] YYYY-MM-DD.md
├── Finances/                          — bookkeeping + taxes
│   ├── 2025 Taxes/                    — Statements/ Payroll/ Output/ + README (2025 Square gross $120,071 + W-2 $35,380 logged; awaiting statements)
│   └── Sales_Tax_Notes.md             — TX sales-tax plan (space rental exempt / equipment taxable; not yet collecting)
├── made-kulture-studio/               — Next.js booking website (live on Vercel)
│   ├── app/                           — App Router pages & API routes (incl. /props, /gear, admin/props/new, /signup, /welcome onboarding, /account/directory, /account/castings, /account/messages, /admin/roles, /admin/signups; APIs: /api/roles(+/suggest), /api/directory(+/[id]), /api/castings(+/[id]/{participants,interest,team-messages,invite}), /api/follow, /api/follows/[id], /api/messages, /api/bookings/[id]/ics, /api/cron/{session-reminder,reminders,auto-checkout}, /api/short-notice/[token], /api/admin/{signups,role-suggestions,short-notice-requests})
│   ├── lib/site-images.ts             — editable hero/set/studio-photo image slots; getSiteImages() reads Supabase 'site' bucket at render (API /api/admin/site-images; migration 063; page.tsx force-dynamic + fetchCache no-store so uploads go live instantly)
│   ├── lib/site-settings.ts           — home page layout knobs (hero_height_vh); getSiteSettings() (API /api/admin/site-settings; migration 064)
│   ├── lib/site-content.ts            — site CMS: schema registry (CONTENT_PAGES) of editable text fields per page + defaults; getPageContent() (API /api/admin/site-content; migration 065)
│   ├── app/admin/website/             — WEBSITE WORKSPACE (own sidebar: components/WebsiteShell.tsx; separate from admin ops): /home = unified page editor (photos + hero-height slider + text, grouped Hero/Sets/Studio/CTA/Footer), /equipment + /props = catalog managers (components/CatalogManager.tsx, extracted from dashboard). /admin/content + /admin/homepage redirect to /admin/website/home. Admin sidebars show one "Website Editor →" link; dashboard STUDIO nav = "Products & Pricing" (sets view) only. Home hero = fixed vh + JS scale-to-fit so content never clips (mobile untouched)
│   ├── lib/igloohome.ts               — igloohome API: OAuth + per-booking algoPIN door codes on BOTH doors (front DBX211001490 + back DBX216004654; createBookingPin/createBackDoorPin; env IGLOOHOME_DEVICE_ID / IGLOOHOME_DEVICE_ID_BACK; migration 081 = bookings.door_code_back)
│   ├── lib/coverage.ts                — coverage drift, all DERIVED at read time (no columns): a shift's linked booking cancelled/moved, a booking now running past the end of coverage (chain-aware `uncovered_tail`), a closeout missing a set's photo. `notifyCoverageGap()` pushes on a real staffing gap; wired into the extension, staff add-time + admin reschedule paths. Surfaces on /admin/shifts as CHANGED AFTER CLOSEOUT / NEEDS ATTENTION + one-click STAFF THE GAP
│   ├── lib/exif.ts                    — dependency-free JPEG APP1/TIFF reader for DateTimeOriginal (read as America/Chicago wall time). Backstop on the closeout-photo FALLBACK path: hard-rejects a photo taken >24h before clock-in; no EXIF = unknown, never old
│   ├── lib/player-rev.ts              — JUKEBOX_PLAYER_REV + PLAYER_RELOAD_KEY. The music tablets watch this instead of the git SHA, so unrelated deploys no longer reload them mid-song. ⚠️ BUMP IT when changing app/jukebox/player/page.tsx or the APIs it depends on
│   ├── lib/calendar.ts                — Google Calendar + .ics link builders
│   ├── lib/gcal.ts                    — service-account sync of bookings → madekulture Google Calendar (toggle: Admin → Sets; setup: GCal_Sync_Setup.md)
│   ├── lib/agent/june.ts              — June, front-desk AI agent (Claude API tool loop; KB in agent_kb; widget components/JuneChatWidget.tsx; inbox /admin/inbox with KNOWLEDGE+TOURS tabs; API /api/agent/chat + /api/admin/{inbox,kb,tours,push,badge}; spec: Customer_Service_Agent_Spec.md)
│   ├── lib/agent/gmail.ts             — June email channel (delegated Gmail as june@; poller /api/cron/agent-email; drafts approved in inbox; setup: June_Email_Setup.md). 2026-07-29: multipart/mixed send w/ attachments + CC/BCC, inbound attachment extraction (Gmail POINTERS only — Google stores the bytes), fetchAttachment()
│   ├── lib/agent/email-send.ts        — shared outbound tail for BOTH send paths (June's draft + your own reply): collect staged attachments → pull bytes → hand to Gmail → link rows → delete the staged objects. Gmail's Sent copy is the record; the email-media bucket is staging, not an archive
│   ├── app/api/admin/vision-test/     — DIAGNOSTIC: can the model actually see a given inbound image? Reports real byte size, base64-vs-URL branch, whether the signed URL is publicly fetchable, Anthropic status + raw error body, and what the model saw. ⚠️ June vision is UNRESOLVED as of 2026-07-29 — use this, don't debug it through 5-minute email cycles
│   ├── lib/push.ts + components/AdminPwa.tsx — admin PWA ("MK Admin" installable, /admin scope) + web push to Teddy (drafts, escalations, tours, bookings, extensions) + icon badge
│   ├── lib/extensions.ts              — confirm-and-pay time charging (/extend/[token]); pairs Square card with verified owner; refreshes door code. TWO KINDS: `extend` (future time — moves end_time, blocked by a booking behind them) and `overage` (time ALREADY used — charges only, NEVER moves end_time). Half-hour granularity. Triggered by June's kiosk tool, the wrap-up cron, and admin (POST /api/admin/bookings/[id]/extension). No card on file → the confirm page shows a Square card field and saves it. ⚠️ Prices via per-customer overrides, so it can disagree with the dashboard's own SET_RATES math on a discounted booking — label admin buttons by DURATION and report the amount from the response
│   ├── app/kiosk/                     — in-studio tablet kiosk (Fire HD 10 + Fully Kiosk): check-in numpad, Ask June (kiosk persona + studio_layout KB), GET THE TEAM; luxury charcoal/champagne style = June house style
│   ├── app/tour/ + app/tour-admin/    — free 30-min tour request→approve flow (open-hours slots + custom requests; TOURS tab; cancel links both sides)
│   ├── app/admin/stack/               — Services & Stack reference page (all 18 external services, costs, Bitwarden pointers)
│   ├── lib/migrations/                — 031 short_notice_requests · 032 bookings.door_code · 033 signup/directory · 034 creator_profiles+portfolios · 035 portfolio_moderation · 036 messaging · 037 castings · 038–039 account_type · 040–041 notify_email/sms · 042 session_reminder_sent_at · 044 casting_participants.role · 045 follows · 046 casting team channel (casting_messages+casting_reads) · 047 casting expiry/mood_board/pin + casting-media bucket · 048 castings.mature · 049 gcal sync (bookings.gcal_event_id + gcal_sync_enabled) · 050 June agent (agent_conversations/messages/kb + cs_agent_enabled) · 051 June email channel (gmail thread cols + pg_cron poll; setup: June_Email_Setup.md) · 052 push_subscriptions (admin PWA web push) · 053 tour_requests + tours KB · 054 tour cancel_token · 055 extension_requests (self-serve session extensions) · 056 delegated_payments (someone-else-pays) · 057 customer_credits (non-expiring store credit) · 058 staff_password_resets · 059 promo_codes(+redemptions) · 060 marketing (campaigns+suppressions) · 061 marketing_analytics (events + suppression campaign_id) · 062 email_templates (campaigns.template_id/template_data) · 063 site_images (home photo slots) · 064 site_settings (hero_height_vh) · 065 site_content (per-page editable text) · 066 review_requests (bookings review_* stamps + pg_cron "review-requests" every 30 min — RUN live 2026-07-05) · 077 short-notice timed window · 078–079 Plus memberships + renew cron · 081 bookings.door_code_back · 082–083 onboarding modules · 084 shifts · 085 shift clock + shift_photos + shift-media bucket · 086 shift_reviews · 087 shifts.booking_id · 088 payroll (square_team_member_id, timecard cols, per-class toggles) · 089 shift_photos.captured_live (live-camera vs file-picker — RUN live 2026-07-25) · 090 email_attachments + agent_messages.cc_emails/bcc_emails + email-media bucket (RUN live 2026-07-29) · 091 overtime charging (extension_requests.hours int→numeric so 30 min works, + kind extend|overage, created_by, paid_new_card)
│   ├── app/globals.css                — ⚠️ sets `body { zoom: 1.25 }` on desktop (min-width 769px). Chrome's zoom scales RENDERED px but NOT CSS lengths, so raw `vh`/`vw` paints 25% too big — a 90vh modal overflows the window, a 100vh page scrolls with nothing there. USE `var(--vh-full)` / `calc(90 * var(--svh))` / `calc(92 * var(--svw))` instead (defined there; plain vh/vw on mobile). Raw vw inside clamp() for display type is fine and deliberately left alone. Swept app-wide 2026-07-29 (commit 4502626)
│   ├── tsconfig.check.json            — SCOPED typecheck config (whole-app tsc on the E: mount is unusably slow). Edit its "files" list to the changed import graph, then: node node_modules/typescript/bin/tsc -p tsconfig.check.json
│   ├── app/api/cron/review-requests/  — post-session Google-review ask (SMS+email 2-3h after checkout, 90-day/customer cap, email follow-up if unclicked; click-tracked via /review/[bookingId]; settings card in Admin → Settings → Emails; TOGGLED OFF until fall 2026 — see memory)
│   ├── app/sitemap.ts + app/robots.ts + app/sets/[slug]/ — SEO: LocalBusiness JSON-LD in layout, per-page metadata, per-set landing pages
│   ├── lib/email-templates.ts         — branded responsive email templates (hero/feature/promo/plain) + compliance shell; used by marketing send + live preview
│   ├── lib/marketing.ts               — audience segments, signed unsubscribe token, Resend batch sender (from MARKETING_FROM = news.madekulture.com); analytics via /api/webhooks/resend
│   ├── app/api/webhooks/resend/route.ts — Resend delivery/open/click/bounce webhook → marketing_events (Svix-verified when RESEND_WEBHOOK_SECRET set)
│   ├── components/AdminShell.tsx       — persistent shared admin sidebar (mobile-responsive, off-canvas) on all /admin pages except dashboard(has own)+login
│   ├── components/                     — incl. CastingTeamChannel (realtime crew chat), MoodBoard (casting refs + 18+), PortfolioManager, RolePicker, ImageCropper
│   ├── lib/linkify.tsx                 — clickable URLs in DMs + team channel
│   ├── public/images/props/           — optimized prop hero + gallery images (<slug>.jpg + <slug>/N.jpg)
│   ├── public/images/equipment/       — optimized equipment gallery images (<slug>/N.jpg)
│   ├── public/images/sets/            — studio set photos (add real photos here)
│   ├── scripts/backup/                — pull-latest-backup.ps1 + backup-workspace.ps1 (Windows)
│   ├── .github/workflows/db-backup.yml — daily automated Supabase DB backup
│   └── .env.local                     — local env vars (needs OPENAI_API_KEY for AI prop features)
├── Props/                             — editable source images for the props directory
│   ├── <Category>/<slug>/1.jpg…       — Bench/Chairs/Sofas/Tables/Fitness/Misc → per-prop folders
│   ├── PROPS_INDEX.csv                — every prop: category, slug, name, photo count
│   ├── WORKFLOW_pull-site-props-down.md / WORKFLOW_local-drive-resync.md — the two sync workflows
│   └── README.md                      — folder structure + "re-sync props" workflow
├── Equipment/                         — editable source images for the /gear equipment page
│   └── <Category>/<item>/N.jpg        — Camera/Lighting/Light Modifier/Projector → per-item folders
├── Backup_and_Security_Runbook.md      — DB backup + local pull + 2FA runbook
├── Made Kulture - Privacy Policy.md
├── Made Kulture - Terms and Conditions.md
├── MK_Guest_Pricing_Model.xlsx         — editable guest-capacity pricing model
├── Guest_Limit_Implementation_Map.md   — guest-limit build spec
├── Twilio_TollFree_Resubmission_Kit.md — toll-free SMS verification fix notes
├── Marketing_Agent_KB.md               — marketing agent (June's sibling) KB + operating spec
├── Launch_Campaign_Package.md          — new-site launch: email + IG sequence + Creative Directory invite
├── Launch_Video_Plan.md                — launch reel storyboard + AI tool workflow (Higgsfield hybrid)
├── Positioning_Why_We_Win_in_the_AI_Age.md — AI-age moat / brand narrative (feeds marketing agent)
├── Funding_Plan_and_Tracker.md         — buildout funding: program tracker + application fact sheet
├── Marketing Assets/Launch Carousel/   — on-brand IG carousel mockups (slide-1..6.png)
├── Smart_Lock_Integration_Spec.md      — igloohome Deadbolt Go + per-booking algoPIN door codes
├── Frontdesk_Ops_System_Spec.md        — staff console architecture + 5-phase plan
├── Frontdesk_Phase1_Deploy.md          — Phase 1 (staff logins/roles/audit) deploy + test
├── Frontdesk_Phase2_Deploy.md          — Phase 2 (/desk workflow) deploy + test
└── Frontdesk_Phase3_Deploy.md          — Phase 3 (Square Register; shelved) deploy notes
```

## Active Project: Booking Website
- **Live URL:** https://made-kulture-studio.vercel.app
- **Vercel project:** made-kulture/made-kulture-studio
- **Stack:** Next.js 14, TypeScript, Supabase (Postgres), Square (payments), Twilio (SMS)
- **Admin dashboard:** /admin (password: see ADMIN_PASSWORD env var)

## Prop Workflows (two directions — don't confuse them)
- **"pull site props down"** → run `Props/WORKFLOW_pull-site-props-down.md`. Supabase → local `Props/` folder. Use after adding/editing/deleting/cleaning props on the website. Always show a diff (esp. deletions) before changing the drive.
- **"resync props" / "local drive resync"** → run `Props/WORKFLOW_local-drive-resync.md`. Local `Props/` folder → Supabase + repo web images. Default to only the slugs Teddy names; full resync only on explicit request.
- Both are documented step-by-step in the linked files, including trigger phrases and safety rules.
-- Seed the 10 orientation modules (v1) from the finalized curriculum
-- (MK_Onboarding_Modules.md). Idempotent: re-running is a no-op per (slug, version).
-- retake_on_miss = true on house-rules, access, and safety.

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('welcome', 'Welcome & How the Studio Works',
$body$Made Kulture is a Houston shared-warehouse creative studio at 4825 Gulf Freeway, open Mon–Sun 9am–10pm for shared bookings. You'll support **shared single-set** rentals (multiple clients at once) and **full buyouts** (one client, whole warehouse).

You are the studio's presence when Teddy isn't on-site: keep it running smoothly, clean, on-time, and by the rules.

**Reaching Teddy:** call him directly. He lives across the street — if you can't reach him by phone in an emergency, go get him.$body$,
1, '{attendant,sanitation,intern,freelancer}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":false,"questions":[
{"id":"q1","prompt":"What are the standard shared hours?","type":"single","options":["Mon–Fri, 9–5","Mon–Sun, 9am–10pm","24/7","Weekends only"],"answer":[1]},
{"id":"q2","prompt":"How do you reach Teddy with an urgent question?","type":"single","options":["Email only","Call him directly; if unreachable in an emergency, go to his place across the street","Wait for him to check in","Post in a group chat"],"answer":[1]},
{"id":"q3","prompt":"You may let a client into their set before their booked start time.","type":"boolean","options":["True","False"],"answer":[1]}
]}$quiz$::jsonb, 1, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('sets', 'The Sets & The Space',
$body$Know every set by name and how it should look when idle (photo-ready, props home, backdrops clean, floor swept). A booking is for **that set only** — clients don't roam between sets.

Sets A, B, C, D, Concrete, Vintage, Cottage are $40/hr. **Set C** has the red vinyl seamless. **The Watering Hole** ($75/hr, 2-hr min) is the shallow black pool — **owner-managed:** Teddy handles it and it is **not offered when he's off-site.** **Studio One** ($65/hr) is reached by a steep ramp.$body$,
1, '{attendant,sanitation,intern}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":false,"questions":[
{"id":"q1","prompt":"Which set has the red vinyl seamless backdrop?","type":"single","options":["Set A","Set C","Concrete","Cottage"],"answer":[1]},
{"id":"q2","prompt":"Who handles The Watering Hole, and when is it available?","type":"single","options":["Any worker, anytime","Teddy handles it; not offered when he's off-site","Front desk only","Interns"],"answer":[1]},
{"id":"q3","prompt":"A client who booked Set B may also shoot a few frames in Set D during their session.","type":"boolean","options":["True","False"],"answer":[1]}
]}$quiz$::jsonb, 2, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('house-rules', 'House Rules & How to Enforce Them',
$body$**Guest limits:** single set = 5 people total (everyone counts, including children); buyout = 30. **Nudity:** shared only if that party is the only booking. **Audio:** not soundproofed — recommend a buyout. **Effects (fog/haze):** buyout/solo only. **Messy concepts** must be pre-approved — there's no approval flag in the app yet, so if you don't have confirmation, **text/call Teddy before allowing it.** **Cleaning fee:** $150 minimum for not following cleanup rules.

Enforce calmly, early, and factually. Escalate anything you can't resolve to Teddy.$body$,
1, '{attendant,intern,freelancer}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":true,"questions":[
{"id":"q1","prompt":"How many total people are allowed on a single-set booking?","type":"single","options":["3","5","10","30"],"answer":[1]},
{"id":"q2","prompt":"A shared-hours client wants to run a haze machine. Allowed?","type":"single","options":["Yes","No — buyout/solo only","Only in Set C","Only after 8pm"],"answer":[1]},
{"id":"q3","prompt":"You see a messy setup and can't tell if it was approved. What do you do?","type":"single","options":["Allow it","Refuse outright","Text/call Teddy to confirm before allowing it","Charge extra and allow it"],"answer":[2]}
]}$quiz$::jsonb, 3, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('access', 'Access, Security & Closing Up',
$body$Both doors are on igloohome smart locks. Each booking gets a **per-booking code that works on both doors.** A set **unlocks at the booked start time — no early entry.** Your shift code auto-expires; don't share it. **There is no separate alarm** — security is the locks.

**Close-up checklist:** (1) everything cleaned, reset, organized — props home, sets photo-ready; (2) set lights off, add-on lights returned; (3) gas heat off (owner-managed — only if directed); (4) fans/AC off; (5) jukebox/speakers off, tablets charging; (6) trash out; (7) both doors confirmed locked.$body$,
1, '{attendant,sanitation}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":true,"questions":[
{"id":"q1","prompt":"When does a client's set unlock?","type":"single","options":["30 minutes early","At the booked start time","When they arrive","Anytime that day"],"answer":[1]},
{"id":"q2","prompt":"The per-booking code works on both the front and back doors.","type":"boolean","options":["True","False"],"answer":[0]},
{"id":"q3","prompt":"What's the first item on the close-up checklist?","type":"single","options":["Lock the doors","Everything cleaned, reset, and organized","Turn off the heat","Take out the trash"],"answer":[1]}
]}$quiz$::jsonb, 4, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('equipment', 'Equipment Handling',
$body$Equipment is rented through the booking. Each time: (1) check the booking to see what's rented, (2) pull it from the shelves in the employee area, (3) **verify the kit is complete before handing it over,** (4) help with setup and breakdown to protect the gear, (5) take it back or break it down at the end.

**You must know how to operate each piece** — hands-on training is part of this module. Every set includes one Amaran 200x; extras are $25 each. All gear is **in-studio rental only.** Add-ons are charged at the kiosk → text or print a Square receipt.$body$,
1, '{attendant,intern}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":false,"questions":[
{"id":"q1","prompt":"Before handing gear to a client, what must you confirm?","type":"single","options":["Their ID","That the full kit is present/complete","Their payment plan","Nothing"],"answer":[1]},
{"id":"q2","prompt":"A client wants to add a light mid-shoot. How do you handle it?","type":"single","options":["Give it free","Add and charge it at the kiosk, then text/print a Square receipt","Tell them no","It's not possible"],"answer":[1]},
{"id":"q3","prompt":"A client may take the Canon R5 off-site for a shoot.","type":"boolean","options":["True","False"],"answer":[1]}
]}$quiz$::jsonb, 5, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('cleaning', 'Cleaning & Set Reset Standards',
$body$Props return to their **home/original locations**; the next client expects the set as designed. Reset per set: props home, floor swept/mopped, backdrop wiped/undamaged, trash gone, no client belongings, lights back to the included config.

**Closeout photo:** after your final touch-up, take a wide "after" photo of each used set matched to its reference look — it's your proof of work and the studio's evidence in a cleaning-fee dispute. Low on supplies? **Text Teddy.** The $150 cleaning fee is what a clean handoff prevents.$body$,
1, '{attendant,sanitation,intern,freelancer}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":false,"questions":[
{"id":"q1","prompt":"Where do props go at the end of a session?","type":"single","options":["Into storage","Back to their home/original locations","Wherever there's room","Left as-is"],"answer":[1]},
{"id":"q2","prompt":"When do you take the closeout photo?","type":"single","options":["Before the client arrives","After your final touch-up, showing a photo-ready set","Mid-shoot","Only if there's a mess"],"answer":[1]},
{"id":"q3","prompt":"You're low on paper towels. What do you do?","type":"single","options":["Ignore it","Text Teddy","Buy them yourself","Close the restroom"],"answer":[1]}
]}$quiz$::jsonb, 6, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('restroom', 'Restroom & Deep Sanitation',
$body$Restroom routine: (1) toilet — bowl, seat, base, flush handle; (2) sink & faucet; (3) mirror; (4) floor sweep + mop; (5) trash + new liner; (6) restock TP, soap, paper towels; (7) high-touch wipe — door handle, light switch, lock.

Products/PPE: studio-approved disinfectant + gloves. **Cadence:** start of shift, midday, end of shift, plus any time it needs it. Record it with the checklist + photo proof.$body$,
1, '{sanitation}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":false,"questions":[
{"id":"q1","prompt":"How often are restrooms + high-touch surfaces sanitized?","type":"single","options":["Once a week","Start of shift, midday, end of shift, plus as-needed","Only when visibly dirty","Never"],"answer":[1]},
{"id":"q2","prompt":"How do you record a completed restroom clean?","type":"single","options":["Nothing needed","Checklist + photo proof in the app","Text a coworker","Write it on paper"],"answer":[1]},
{"id":"q3","prompt":"Gloves are used when sanitizing.","type":"boolean","options":["True","False"],"answer":[0]}
]}$quiz$::jsonb, 7, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('attendant', 'Attendant Duties & Guest Service',
$body$Be visible and available, keep common areas organized, and keep a light eye on bookings without hovering. Greet clients, confirm the right set, set rule expectations. Bookings are **set-specific.**

**Adding time:** check the calendar for a booking following them on that set — if clear, add time and charge at the kiosk (then text/print a receipt); if a booking follows, no extension. **Overages:** don't silently auto-charge — give a heads-up as the end nears and handle any overage per Teddy's direction. Tools: kiosk (counter computer), jukebox, shift checklist. Escalate what you can't resolve.$body$,
1, '{attendant}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":false,"questions":[
{"id":"q1","prompt":"When can a client add time to their session?","type":"single","options":["Always","Only if no booking follows them on that set","Never","Only on buyouts"],"answer":[1]},
{"id":"q2","prompt":"A booking is running over. What do you do?","type":"single","options":["Silently charge an extra hour","Give a heads-up and handle the overage per Teddy's direction","Lock them out","Ignore it"],"answer":[1]},
{"id":"q3","prompt":"A client may move to a different open set mid-session.","type":"boolean","options":["True","False"],"answer":[1]}
]}$quiz$::jsonb, 8, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('safety', 'Safety & Emergencies',
$body$**Emergencies:** anything life-threatening or a fire → **call 911 first, then call Teddy.** Everything else → call Teddy (reply within a few minutes; if he's home and unreachable, go get him). Report incidents with what/when/who + a photo if there's damage.

**Heat:** gas heat runs off a Nest thermostat inside the rolling wall between Set C and Set D — **owner-managed, don't operate unless directed.** **Ramp:** Studio One's steep ramp is only for higher vehicles (SUVs, trucks, vans without tow hitches). First-aid kit + fire extinguisher are at the register. Haze cuts visibility/affects breathing — buyout/solo only, ventilate.$body$,
1, '{attendant,sanitation,intern,freelancer}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":true,"questions":[
{"id":"q1","prompt":"What's the order for a fire or serious injury?","type":"single","options":["Call Teddy first","Call 911 first, then call Teddy","Wait and see","Post online"],"answer":[1]},
{"id":"q2","prompt":"Who operates the gas heat (Nest)?","type":"single","options":["Any worker","Teddy — owner-managed; don't touch unless directed","Front desk","Clients"],"answer":[1]},
{"id":"q3","prompt":"Which vehicles can use the Studio One ramp?","type":"single","options":["Any car","Higher vehicles — SUVs, trucks, vans without tow hitches","Sedans only","None"],"answer":[1]}
]}$quiz$::jsonb, 9, true)
on conflict (slug, version) do nothing;

insert into onboarding_modules (slug, title, body, version, required_for, quiz, sort_order, active) values
('clock-in', 'Clock-In, Checklists & Getting Paid',
$body$Claim only shifts you can reliably show up for. **Clock in** at your start time (kiosk/app) — that opens your checklist and starts your shift record. Complete checklist items and capture required photo proof. **Clock out** closes the checklist — you can't clock out with required closeout photos missing.

Approved hours flow into **Square Payroll** (W-2); Square issues pay and your year-end W-2 automatically. You and the studio leave a short review each shift — **no-shows/late cancels lower your reliability score,** which affects which shifts you can claim.$body$,
1, '{attendant,sanitation,intern,freelancer}'::worker_class[],
$quiz${"pass_pct":80,"retake_on_miss":false,"questions":[
{"id":"q1","prompt":"How do you start a shift?","type":"single","options":["Just show up","Clock in at the kiosk/app at your start time","Text Teddy","Sign a paper sheet"],"answer":[1]},
{"id":"q2","prompt":"What happens to your reliability score if you no-show?","type":"single","options":["Nothing","It drops, limiting which shifts you can claim","It goes up","You're paid double"],"answer":[1]},
{"id":"q3","prompt":"You can clock out with required closeout photos missing.","type":"boolean","options":["True","False"],"answer":[1]}
]}$quiz$::jsonb, 10, true)
on conflict (slug, version) do nothing;

# Deploy — guest surcharge fix + guest booking access

Migrations 100 and 101, and the code that uses them.

---

## 🔴 ORDER IS NOT OPTIONAL: migrations FIRST, then push

Migrations in this project do **not** run as part of a Vercel deploy — they are run
by hand in the Supabase SQL editor. So the code and the schema move separately,
and here the code cannot survive without the schema.

**If the code deploys before migration 100 runs, every website booking charges the
customer's card and then fails to create the booking.**

That isn't a guess about the failure mode:

- `app/api/bookings/route.ts` takes the Square payment at **step 9** (line ~623)
  and inserts the booking at **step 11** (line ~669).
- The insert now includes `guest_surcharge_amount`. Against a database without
  that column, Postgres rejects the insert.
- The error path is `console.error(...)` then **`continue`** — it does not refund
  and does not stop. Card charged, no booking row, nothing on the calendar.

The admin dashboard would break the same way (its bookings query selects the new
column, so PostgREST 400s the whole list).

Running the migrations first is safe in the other direction: both only ADD
nullable columns, which the currently-deployed code neither reads nor writes.

---

## Step 1 — migration 100 (guest surcharge)

Supabase → project `vvaftjcjydxdlkojnrfm` → SQL Editor → paste
`lib/migrations/100_guest_surcharge_column.sql` → Run.

It opens with a **preview SELECT** that buckets every existing booking into what
the backfill is about to do. Read it before scrolling on:

| bucket | meaning |
|---|---|
| `no surcharge (will set 0)` | member, or nothing added later — safe |
| `guest surcharge (will set)` | residual exactly matches the hours — safe |
| `UNKNOWN (left null)` | contaminated by a later extension/add-charge, or no `base_amount` |

A large UNKNOWN count is expected and fine. Those rows keep today's behaviour
(member rate) rather than getting a guessed surcharge charged to a real card.

The `do $$` block prints a `NOTICE` afterwards with the three counts.

## Step 2 — migration 101 (guest manage token)

Same place, `lib/migrations/101_booking_manage_token.sql`. Backfills a token onto
every existing booking, so Mendel's Sept 5 booking gets one even though it was
made before this shipped.

## Step 3 — confirm the schema actually changed

```sql
select column_name
from information_schema.columns
where table_name = 'bookings'
  and column_name in ('guest_surcharge_amount', 'manage_token');
```

Both rows must come back. If they don't, **stop — do not push.**

Both migrations end with `notify pgrst, 'reload schema'`, which matters: without
it PostgREST keeps its cached table shape and writes 400 while reads look fine.

## Step 4 — push

From Windows (the sandbox can't write to `.git`). Nothing is committed yet —
everything is still working-tree changes.

```
git add -A
git commit -m "Guest surcharge on extensions + guest booking access via manage link"
git push
```

---

## After it's live

1. **Make yourself a guest booking** a few days out — signed OUT, so it takes the
   surcharge path. Check the confirmation email has the **"View or change my
   booking"** button, and that `/manage/<token>` opens.
2. **Move it** from that page. Confirm the time changes, the price does not, and a
   new door code arrives.
3. **Then Mendel.** Resend his confirmation from the booking detail panel, and let
   him try 7pm → 4pm himself. He's outside 48 hours, so he should be able to.

If you'd rather just move his booking yourself: open the edit modal, change the
start to 4pm, keep the end the same distance away, confirm **DIFFERENCE reads
"No change"**, save — then use **SEND THIS CODE TO THE CUSTOMER**, because his old
code doesn't start until 7pm.

⚠️ The edit modal will now show guest bookings at **$50/hr** instead of $40. That's
correct, not a regression.

---

## What is NOT verified

- Neither migration has been executed — there's no Postgres in the sandbox.
- No part of this has run against a real booking, card, door lock or email.
- The pricing arithmetic **has** been tested in isolation: a guest extension
  prices at $50 (was $40), a same-length move still comes out to exactly $0
  difference, and a negotiated per-customer rate still overrides both.

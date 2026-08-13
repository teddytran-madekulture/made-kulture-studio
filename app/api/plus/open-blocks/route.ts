// GET /api/plus/open-blocks?date=YYYY-MM-DD
//
// Blocks an active Plus member may book INSTANTLY inside the 48-hour advance
// window — the hours the studio is already open because a confirmed shoot is
// running. See lib/plus-open-windows.ts for why this is the rule.
//
// ⚠️ This route is DISPLAY ONLY. The booking POST recomputes the same blocks
// from the database and refuses anything that does not fit. Never treat a
// response from here as permission.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { plusActive } from '@/lib/short-notice'
import {
  openWindowsFrom, instantBlocksForSet, BLOCKING_STATUSES, PLUS_LEAD_MS,
  type BookingRow,
} from '@/lib/plus-open-windows'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NAME_TO_SLUG: Record<string, string> = {
  'Set A': 'set-a', 'Set B': 'set-b', 'Set C': 'set-c', 'Set D': 'set-d',
  'Concrete': 'concrete', 'Vintage': 'vintage', 'Cottage': 'cottage',
  'The Watering Hole': 'watering-hole', 'The Tank': 'the-tank', 'Studio One': 'studio-one',
}

const centralDateOf = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(ms))

// Houston-local decimal hour, e.g. 17.5 = 5:30 PM. Matches what BookClient's
// time grid speaks. ⚠️ Derived through Intl, never by slicing the ISO string —
// stored timestamps come back in UTC (see lib/booking-times.ts).
function centralDecimal(ms: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date(ms))
  const h = Number(p.find(x => x.type === 'hour')?.value ?? 0)
  const m = Number(p.find(x => x.type === 'minute')?.value ?? 0)
  return (h === 24 ? 0 : h) + m / 60
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date=YYYY-MM-DD required' }, { status: 400 })
  }

  // ⚠️ Identity comes from the VERIFIED session, never from a query param or
  // body field. Trusting a supplied email would let anyone borrow a member's
  // access by typing their address.
  const session = createServerClient()
  const { data: { user } } = await session.auth.getUser()
  const email = user?.email?.toLowerCase().trim()
  if (!email) return NextResponse.json({ plus: false, sets: {} })

  const { data: cust } = await admin
    .from('customers').select('pricing_overrides').eq('email', email).maybeSingle()
  if (!plusActive(cust?.pricing_overrides ?? null)) {
    return NextResponse.json({ plus: false, sets: {} })
  }

  // Generous UTC superset of the Houston day; filtered precisely below.
  const windowStart = new Date(`${date}T00:00:00-07:00`).toISOString()
  const windowEnd   = new Date(`${date}T23:59:59+01:00`).toISOString()

  const [{ data: bookings, error: bErr }, { data: sets, error: sErr }] = await Promise.all([
    admin.from('bookings')
      .select('start_time, end_time, set_id, status')
      .lt('start_time', windowEnd).gt('end_time', windowStart),
    admin.from('sets').select('id, name, min_hours').eq('is_active', true).order('name'),
  ])
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const rows = (bookings ?? []) as BookingRow[]
  const open = openWindowsFrom(rows)
  const now  = Date.now()

  const out: Record<string, { id: string; name: string; minHours: number; blocks: any[] }> = {}
  for (const s of sets ?? []) {
    const minHours = Math.max(1, s.min_hours ?? 1)
    const mine = rows.filter(b => b.set_id === s.id && BLOCKING_STATUSES.includes(b.status))
    const blocks = instantBlocksForSet(open, mine, minHours, now, PLUS_LEAD_MS)
      // Houston-local day only — a block bleeding past midnight belongs to the
      // next date, and bookings may not span days anyway (visit continuity).
      .filter(i => centralDateOf(i.start) === date && centralDateOf(i.end - 1) === date)
      .map(i => ({
        startHour: centralDecimal(i.start),
        endHour:   centralDecimal(i.end),
        startISO:  new Date(i.start).toISOString(),
        endISO:    new Date(i.end).toISOString(),
      }))
    const slug = NAME_TO_SLUG[s.name] ?? s.name.toLowerCase().replace(/\s+/g, '-')
    // `id` is included so the booking page can match on whatever it holds —
    // it carries set UUIDs, not slugs.
    out[slug] = { id: s.id, name: s.name, minHours, blocks }
  }

  return NextResponse.json({ date, plus: true, leadHours: PLUS_LEAD_MS / 3600000, sets: out })
}

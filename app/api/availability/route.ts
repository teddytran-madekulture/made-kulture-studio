import { NextRequest, NextResponse } from 'next/server'
import { centralOffset } from '@/lib/booking-times'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLUG_TO_NAME: Record<string, string> = {
  'set-a':         'Set A',
  'set-b':         'Set B',
  'set-c':         'Set C',
  'set-d':         'Set D',
  'concrete':      'Concrete',
  'vintage':       'Vintage',
  'cottage':       'Cottage',
  'watering-hole': 'The Watering Hole',
  'the-tank':      'The Tank',
  'studio-one':    'Studio One',
}

const NAME_TO_SLUG: Record<string, string> = {
  'Set A':             'set-a',
  'Set B':             'set-b',
  'Set C':             'set-c',
  'Set D':             'set-d',
  'Concrete':          'concrete',
  'Vintage':           'vintage',
  'Cottage':           'cottage',
  'The Watering Hole': 'watering-hole',
  'The Tank':          'the-tank',
  'Studio One':        'studio-one',
}

// Extract time in Houston local time as decimal hours (e.g. 11.5 = 11:30)
function cdhTime(dateStr: string): number {
  const d = new Date(dateStr)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  return (h === 24 ? 0 : h) + m / 60
}

// GET /api/availability?date=YYYY-MM-DD            → all sets
// GET /api/availability?set_id=uuid&date=YYYY-MM-DD → single set (existing)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const set_id = searchParams.get('set_id')
  const date   = searchParams.get('date')

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  const dayStart = `${date}T00:00:00${centralOffset(date, 0)}`
  const dayEnd   = `${date}T23:59:59${centralOffset(date, 23)}`

  // ── Single set (existing behaviour) ────────────────────────────────────────
  if (set_id) {
    // set_id may be a UUID or a slug (e.g. "set-a") — resolve to UUID if needed
    const isUUID = /^[0-9a-f-]{36}$/i.test(set_id)
    let resolvedId = set_id

    if (!isUUID) {
      const name = SLUG_TO_NAME[set_id]
      if (name) {
        const { data: setRow } = await supabase.from('sets').select('id').eq('name', name).single()
        if (!setRow) return NextResponse.json({ booked: [] })
        resolvedId = setRow.id
      } else {
        return NextResponse.json({ booked: [] })
      }
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('start_time, end_time')
      .eq('set_id', resolvedId)
      .neq('status', 'cancelled')
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ⚠️ A full-warehouse buyout occupies THIS set too, but its row has
    // set_id NULL, so the query above cannot see it -- `.eq('set_id', ...)`
    // never matches a NULL. Without this second query the grid renders a
    // buyout's hours as free on every set, which is exactly how two website
    // bookings were sold inside a confirmed 2-6pm buyout on 2026-08-22.
    // The all-sets branch below has always done this; only this branch, the
    // one CHECKOUT actually calls, was missing it.
    const { data: buyouts, error: buyoutErr } = await supabase
      .from('bookings')
      .select('start_time, end_time')
      .is('set_id', null)
      .neq('status', 'cancelled')
      .lt('start_time', dayEnd)     // overlap, not "starts today": an overnight
      .gt('end_time', dayStart)     // buyout still occupies this morning
    if (buyoutErr) return NextResponse.json({ error: buyoutErr.message }, { status: 500 })

    const dayStartMs = Date.parse(dayStart)
    const dayEndMs   = Date.parse(dayEnd)
    const booked = [
      ...(data || []).map(b => ({ start: cdhTime(b.start_time), end: cdhTime(b.end_time) })),
      // Clamp to the day so a buyout spilling over midnight cannot emit an end
      // that sorts before its start and paint the grid nonsense.
      ...(buyouts || []).map(b => ({
        start: Date.parse(b.start_time) <= dayStartMs ? 0  : cdhTime(b.start_time),
        end:   Date.parse(b.end_time)   >= dayEndMs   ? 24 : cdhTime(b.end_time),
      })),
    ]
    return NextResponse.json({ booked })
  }

  // ── All sets ───────────────────────────────────────────────────────────────
  const { data: sets, error: setsError } = await supabase
    .from('sets')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (setsError) return NextResponse.json({ error: setsError.message }, { status: 500 })

  const setIds = (sets ?? []).map(s => s.id)

  // Fetch individual set bookings and full-studio buyouts in parallel
  const [{ data: bookings, error: bookingsError }, { data: buyouts, error: buyoutsError }] =
    await Promise.all([
      supabase
        .from('bookings')
        .select('start_time, end_time, set_id')
        .in('set_id', setIds)
        .neq('status', 'cancelled')
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd),
      supabase
        .from('bookings')
        .select('start_time, end_time')
        .is('set_id', null)
        .neq('status', 'cancelled')
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd),
    ])

  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 })
  if (buyoutsError)  return NextResponse.json({ error: buyoutsError.message },  { status: 500 })

  // Full-studio slots block every set
  const fullStudioSlots = (buyouts ?? []).map(b => ({
    start: cdhTime(b.start_time),
    end:   cdhTime(b.end_time),
  }))

  // Group individual booked slots by set slug
  const result: Record<string, { name: string; bookedSlots: { start: number; end: number }[] }> = {}

  for (const set of (sets ?? [])) {
    const slug = NAME_TO_SLUG[set.name] ?? set.name.toLowerCase().replace(/\s+/g, '-')
    const slots = (bookings ?? [])
      .filter(b => b.set_id === set.id)
      .map(b => ({
        start: cdhTime(b.start_time),
        end:   cdhTime(b.end_time),
      }))
    result[slug] = { name: set.name, bookedSlots: slots }
  }

  return NextResponse.json({ sets: result, fullStudioSlots })
}

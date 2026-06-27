import { NextRequest, NextResponse } from 'next/server'
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

// GET /api/availability?date=YYYY-MM-DD            → all sets
// GET /api/availability?set_id=uuid&date=YYYY-MM-DD → single set (existing)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const set_id = searchParams.get('set_id')
  const date   = searchParams.get('date')

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  const dayStart = `${date}T00:00:00-05:00`
  const dayEnd   = `${date}T23:59:59-05:00`

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

    const booked = (data || []).map(b => ({
      start: new Date(b.start_time).getHours(),
      end:   new Date(b.end_time).getHours(),
    }))
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

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('start_time, end_time, set_id')
    .in('set_id', setIds)
    .neq('status', 'cancelled')
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd)

  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 })

  // Group booked slots by set slug
  const result: Record<string, { name: string; bookedSlots: { start: number; end: number }[] }> = {}

  for (const set of (sets ?? [])) {
    const slug = NAME_TO_SLUG[set.name] ?? set.name.toLowerCase().replace(/\s+/g, '-')
    const slots = (bookings ?? [])
      .filter(b => b.set_id === set.id)
      .map(b => ({
        start: new Date(b.start_time).getHours(),
        end:   new Date(b.end_time).getHours(),
      }))
    result[slug] = { name: set.name, bookedSlots: slots }
  }

  return NextResponse.json({ sets: result })
}

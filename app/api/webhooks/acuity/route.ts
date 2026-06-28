import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndAlertFlaggedCustomer } from '@/lib/flagged-customer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Set name mapping ─────────────────────────────────────────────────────────
// Maps Acuity appointment type names (lowercased) → Supabase set names.
// Update these keys to match whatever your Acuity appointment types are called.
const ACUITY_TYPE_TO_SET: Record<string, string | null> = {
  'set a':             'Set A',
  'set b':             'Set B',
  'set c':             'Set C',
  'set d':             'Set D',
  'concrete':          'Concrete',
  'vintage':           'Vintage',
  'cottage':           'Cottage',
  'watering hole':     'The Watering Hole',
  'the watering hole': 'The Watering Hole',
  'studio one':        'Studio One',
  // Full buyout — no specific set, set null
  'full studio':          null,
  'full buyout':          null,
  'studio buyout':        null,
  'all warehouse access': null,
}

async function resolveSet(
  appointmentType: string
): Promise<{ setId: string | null; setName: string }> {
  const key = appointmentType.toLowerCase().trim()

  // 1. Exact map match
  if (key in ACUITY_TYPE_TO_SET) {
    const name = ACUITY_TYPE_TO_SET[key]
    if (!name) return { setId: null, setName: 'Full Studio Buyout' }
    const { data } = await supabase.from('sets').select('id').eq('name', name).single()
    return { setId: data?.id ?? null, setName: name }
  }

  // 2. Partial match against map keys — handles combo types like
  //    "Studio One + PMI Smoke Ninja Pro..." → Studio One
  for (const [mapKey, mapName] of Object.entries(ACUITY_TYPE_TO_SET)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      if (!mapName) return { setId: null, setName: 'Full Studio Buyout' }
      const { data } = await supabase.from('sets').select('id').eq('name', mapName).single()
      return { setId: data?.id ?? null, setName: mapName }
    }
  }

  // 3. Fuzzy fallback — search Supabase by partial name
  //    (resolves promo/seasonal sets that exist as rows, e.g. "The Yard")
  const { data } = await supabase
    .from('sets')
    .select('id, name')
    .ilike('name', `%${appointmentType.trim()}%`)
    .limit(1)
    .single()

  if (data) return { setId: data.id, setName: data.name }

  // 4. Unrecognized type — store without a set
  console.warn(`[Acuity webhook] Unrecognized appointment type: "${appointmentType}"`)
  return { setId: null, setName: appointmentType }
}

// ─── Optional: verify Acuity webhook signature ────────────────────────────────
// Uncomment once you've added ACUITY_USER_ID and ACUITY_API_KEY to your env vars.
// Acuity verification works by calling their API to confirm the appointment exists.
//
// async function verifyAcuityAppointment(id: string): Promise<boolean> {
//   const credentials = Buffer.from(
//     `${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`
//   ).toString('base64')
//   const res = await fetch(`https://acuityscheduling.com/api/v1/appointments/${id}`, {
//     headers: { Authorization: `Basic ${credentials}` },
//   })
//   return res.ok
// }

// ─── Parse Acuity payload ─────────────────────────────────────────────────────
// Acuity sends application/x-www-form-urlencoded. Some integrations send JSON.
async function parsePayload(req: NextRequest): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return req.json()
  }
  const text = await req.text()
  const params = new URLSearchParams(text)
  const result: Record<string, string> = {}
  params.forEach((val, key) => { result[key] = val })
  return result
}

// ─── Parse Acuity datetime fields into ISO strings ────────────────────────────
// Acuity provides:
//   datetime  — ISO 8601 start: "2026-06-27T10:00:00-0500"
//   endTime   — human-readable end time: "12:00pm"
//   date      — human-readable date: "June 27, 2026"
//   duration  — duration in minutes (fallback for end time)
function parseTimes(
  datetime: string,
  endTime?: string,
  date?: string,
  durationMins?: number
): { start: string; end: string } | null {
  try {
    const start = new Date(datetime)
    if (isNaN(start.getTime())) return null

    // Try parsing date + endTime string
    if (date && endTime) {
      const end = new Date(`${date} ${endTime}`)
      if (!isNaN(end.getTime())) {
        return { start: start.toISOString(), end: end.toISOString() }
      }
    }

    // Fallback: use duration
    if (durationMins && durationMins > 0) {
      const end = new Date(start.getTime() + durationMins * 60_000)
      return { start: start.toISOString(), end: end.toISOString() }
    }

    return null
  } catch {
    return null
  }
}

// ─── POST /api/webhooks/acuity ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const payload = await parsePayload(req)

    // Log raw payload on first run — useful for confirming field names
    console.log('[Acuity webhook] received:', JSON.stringify(payload))

    const {
      id: acuityId,
      action,
      type: appointmentType,
      firstName,
      lastName,
      email,
      phone,
      datetime,
      date,
      endTime,
      duration,
      notes,
      price,
      paid,
    } = payload

    if (!acuityId || !action) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
    }

    // ── Optional verification (uncomment to enable) ──────────────────────────
    // const valid = await verifyAcuityAppointment(acuityId)
    // if (!valid) return NextResponse.json({ error: 'Appointment not found in Acuity' }, { status: 401 })

    // ── Cancellation ─────────────────────────────────────────────────────────
    if (action === 'cancelled') {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('acuity_appointment_id', acuityId)

      if (error) console.error('[Acuity webhook] cancel error:', error)
      return NextResponse.json({ ok: true, action: 'cancelled' })
    }

    // ── Ignore unknown actions ────────────────────────────────────────────────
    if (!['scheduled', 'rescheduled', 'changed'].includes(action)) {
      return NextResponse.json({ ok: true, action: 'ignored' })
    }

    // ── Resolve set ───────────────────────────────────────────────────────────
    const { setId, setName } = await resolveSet(appointmentType ?? '')

    // ── Parse times ───────────────────────────────────────────────────────────
    const durationMins = duration ? parseInt(duration) : undefined
    const times = datetime ? parseTimes(datetime, endTime, date, durationMins) : null

    if (!times) {
      console.error('[Acuity webhook] Could not parse datetime:', { datetime, endTime, date })
      return NextResponse.json({ error: 'Could not parse appointment time' }, { status: 422 })
    }

    // ── Upsert customer ───────────────────────────────────────────────────────
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
    let customerId: string | undefined

    if (email) {
      const { data: customer } = await supabase
        .from('customers')
        .upsert(
          { email, name: fullName, phone: phone ?? '' },
          { onConflict: 'email' }
        )
        .select('id')
        .single()
      customerId = customer?.id
    }

    // ── Upsert booking ────────────────────────────────────────────────────────
    const totalAmount   = price ? parseFloat(price) : 0
    const hours         = durationMins ? durationMins / 60 : 0
    const baseAmount    = hours > 0 ? totalAmount : 0 // all amount is base for Acuity bookings

    const bookingRow = {
      acuity_appointment_id: acuityId,
      set_id:                setId,
      customer_id:           customerId ?? null,
      start_time:            times.start,
      end_time:              times.end,
      status:                'confirmed' as const,
      payment_status:        paid === 'yes' ? 'paid' as const : 'unpaid' as const,
      base_amount:           baseAmount,
      extras_amount:         0,
      total_amount:          totalAmount,
      source:                'acuity' as const,
      notes:                 notes ?? null,
      guest_count:           1,
    }

    const { error: upsertError } = await supabase
      .from('bookings')
      .upsert(bookingRow, { onConflict: 'acuity_appointment_id' })

    if (upsertError) {
      console.error('[Acuity webhook] booking upsert error:', upsertError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Alert owner if customer is flagged (non-blocking)
    if (customerId && action === 'scheduled') {
      const startDate = new Date(times.start)
      const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const endDate = new Date(times.end)
      const endStr  = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      checkAndAlertFlaggedCustomer(supabase, customerId, {
        customerName:  fullName || email || 'Unknown',
        customerEmail: email || '',
        setName,
        date:      dateStr,
        startTime: timeStr,
        endTime:   endStr,
      }).catch(err => console.error('[Acuity webhook] flagged customer check error:', err))
    }

    console.log(`[Acuity webhook] ${action} — ${setName} at ${times.start}`)
    return NextResponse.json({ ok: true, action, setName })

  } catch (err) {
    console.error('[Acuity webhook] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

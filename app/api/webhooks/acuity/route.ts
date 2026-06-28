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

// ─── Fetch full appointment from the Acuity API ───────────────────────────────
// Acuity webhooks only POST { action, id, calendarID, appointmentTypeID } — NOT
// the appointment details. So we call back to the API with the id to get the
// full record (datetime, type, customer, price, etc.).
async function fetchAcuityAppointment(id: string): Promise<any | null> {
  const userId = process.env.ACUITY_USER_ID
  const apiKey = process.env.ACUITY_API_KEY
  if (!userId || !apiKey) {
    console.error('[Acuity webhook] Missing ACUITY_USER_ID / ACUITY_API_KEY env vars')
    return null
  }
  const credentials = Buffer.from(`${userId}:${apiKey}`).toString('base64')
  try {
    const res = await fetch(`https://acuityscheduling.com/api/v1/appointments/${id}`, {
      headers: { Authorization: `Basic ${credentials}` },
    })
    if (!res.ok) {
      console.error(`[Acuity webhook] appointment fetch failed: ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error('[Acuity webhook] appointment fetch error:', err)
    return null
  }
}

// ─── POST /api/webhooks/acuity ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const payload = await parsePayload(req)
    console.log('[Acuity webhook] received:', JSON.stringify(payload))

    const acuityId  = payload.id
    const rawAction = (payload.action ?? '').toLowerCase()

    if (!acuityId || !rawAction) {
      return NextResponse.json({ error: 'Missing id or action' }, { status: 400 })
    }

    // ── Cancellation ─────────────────────────────────────────────────────────
    // Acuity sends "canceled" (one l); accept both spellings to be safe.
    if (rawAction.includes('cancel')) {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('acuity_appointment_id', String(acuityId))
      if (error) console.error('[Acuity webhook] cancel error:', error)
      return NextResponse.json({ ok: true, action: 'cancelled' })
    }

    // ── Ignore actions we don't sync ──────────────────────────────────────────
    if (!['scheduled', 'rescheduled', 'changed'].includes(rawAction)) {
      return NextResponse.json({ ok: true, action: 'ignored' })
    }

    // ── Fetch full appointment details from Acuity ────────────────────────────
    const apt = await fetchAcuityAppointment(acuityId)
    if (!apt || !apt.id) {
      console.error('[Acuity webhook] could not fetch appointment', acuityId)
      // Return 200 so Acuity doesn't spam retries; the error is logged for review.
      return NextResponse.json({ ok: false, reason: 'appointment-fetch-failed' })
    }

    // Appointment may have been canceled between the hook and our fetch.
    if (apt.canceled) {
      await supabase.from('bookings').update({ status: 'cancelled' }).eq('acuity_appointment_id', String(acuityId))
      return NextResponse.json({ ok: true, action: 'cancelled' })
    }

    // ── Resolve set ───────────────────────────────────────────────────────────
    const { setId, setName } = await resolveSet(apt.type ?? '')

    // ── Parse times ───────────────────────────────────────────────────────────
    const durationMins = apt.duration ? parseInt(apt.duration) : undefined
    const times = apt.datetime ? parseTimes(apt.datetime, apt.endTime, apt.date, durationMins) : null

    if (!times) {
      console.error('[Acuity webhook] Could not parse datetime:', { datetime: apt.datetime, endTime: apt.endTime, date: apt.date })
      return NextResponse.json({ error: 'Could not parse appointment time' }, { status: 422 })
    }

    // ── Upsert customer ───────────────────────────────────────────────────────
    const fullName = [apt.firstName, apt.lastName].filter(Boolean).join(' ').trim()
    let customerId: string | undefined

    if (apt.email) {
      const { data: customer } = await supabase
        .from('customers')
        .upsert(
          { email: apt.email, name: fullName, phone: apt.phone ?? '' },
          { onConflict: 'email' }
        )
        .select('id')
        .single()
      customerId = customer?.id
    }

    // ── Upsert booking ────────────────────────────────────────────────────────
    const totalAmount = apt.price ? parseFloat(apt.price) : 0

    const bookingRow = {
      acuity_appointment_id: String(acuityId),
      set_id:                setId,
      customer_id:           customerId ?? null,
      start_time:            times.start,
      end_time:              times.end,
      status:                'confirmed' as const,
      payment_status:        apt.paid === 'yes' ? 'paid' as const : 'unpaid' as const,
      base_amount:           totalAmount,
      extras_amount:         0,
      total_amount:          totalAmount,
      source:                'acuity' as const,
      notes:                 apt.notes ?? null,
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
    if (customerId && rawAction === 'scheduled') {
      const startDate = new Date(times.start)
      const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const endDate = new Date(times.end)
      const endStr  = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      checkAndAlertFlaggedCustomer(supabase, customerId, {
        customerName:  fullName || apt.email || 'Unknown',
        customerEmail: apt.email || '',
        setName,
        date:      dateStr,
        startTime: timeStr,
        endTime:   endStr,
      }).catch(err => console.error('[Acuity webhook] flagged customer check error:', err))
    }

    console.log(`[Acuity webhook] ${rawAction} — ${setName} at ${times.start}`)
    return NextResponse.json({ ok: true, action: rawAction, setName })

  } catch (err) {
    console.error('[Acuity webhook] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

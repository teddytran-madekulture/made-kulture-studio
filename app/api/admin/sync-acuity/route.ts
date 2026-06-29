import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Same mapping as the webhook handler
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
  'the tank':          'The Tank',
  'tank':              'The Tank',
  'studio one':        'Studio One',
  // Full warehouse buyout aliases → no specific set
  'full studio':         null,
  'full buyout':         null,
  'studio buyout':       null,
  'all warehouse access': null,
}

async function resolveSet(appointmentType: string): Promise<{ setId: string | null; setName: string }> {
  const key = appointmentType.toLowerCase().trim()

  // Exact map match
  if (key in ACUITY_TYPE_TO_SET) {
    const name = ACUITY_TYPE_TO_SET[key]
    if (!name) return { setId: null, setName: 'Full Studio Buyout' }
    const { data } = await supabase.from('sets').select('id').eq('name', name).single()
    return { setId: data?.id ?? null, setName: name }
  }

  // Partial match against map keys
  for (const [mapKey, mapName] of Object.entries(ACUITY_TYPE_TO_SET)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      if (!mapName) return { setId: null, setName: 'Full Studio Buyout' }
      const { data } = await supabase.from('sets').select('id').eq('name', mapName).single()
      return { setId: data?.id ?? null, setName: mapName }
    }
  }

  // Fuzzy fallback in Supabase
  const { data } = await supabase
    .from('sets')
    .select('id, name')
    .ilike('name', `%${appointmentType.trim()}%`)
    .limit(1)
    .single()

  if (data) return { setId: data.id, setName: data.name }

  return { setId: null, setName: appointmentType }
}

// GET /api/admin/sync-acuity?password=XXX&minDate=YYYY-MM-DD&maxDate=YYYY-MM-DD
export async function GET(req: NextRequest) {
  // Auth check
  const { searchParams } = new URL(req.url)
  const password = searchParams.get('password')
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const minDate = searchParams.get('minDate') ?? new Date().toISOString().split('T')[0]
  const maxDate = searchParams.get('maxDate') ?? '2027-12-31'
  const dryRun  = searchParams.get('dryRun') === 'true'

  // Fetch from Acuity
  const credentials = Buffer.from(
    `${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`
  ).toString('base64')

  const acuityRes = await fetch(
    `https://acuityscheduling.com/api/v1/appointments?minDate=${minDate}&maxDate=${maxDate}&max=500&canceled=false`,
    { headers: { Authorization: `Basic ${credentials}` } }
  )

  if (!acuityRes.ok) {
    const text = await acuityRes.text()
    return NextResponse.json({ error: `Acuity API error: ${acuityRes.status} ${text}` }, { status: 500 })
  }

  const appointments: any[] = await acuityRes.json()

  // Also fetch appointment types so we can log what types exist
  const typesRes = await fetch(
    `https://acuityscheduling.com/api/v1/appointment-types`,
    { headers: { Authorization: `Basic ${credentials}` } }
  )
  const appointmentTypes = typesRes.ok ? await typesRes.json() : []

  const results = {
    totalFetched: appointments.length,
    appointmentTypes: appointmentTypes.map((t: any) => ({ id: t.id, name: t.name })),
    synced:  [] as any[],
    skipped: [] as any[],
    errors:  [] as any[],
  }

  if (dryRun) {
    // Just show what we'd sync
    results.synced = appointments.map((apt: any) => ({
      id:       apt.id,
      type:     apt.type,
      datetime: apt.datetime,
      endTime:  apt.endTime,
      date:     apt.date,
      duration: apt.duration,
      name:     `${apt.firstName} ${apt.lastName}`.trim(),
      canceled: apt.canceled,
    }))
    return NextResponse.json(results)
  }

  // Sync each appointment
  for (const apt of appointments) {
    try {
      if (apt.canceled) {
        // Mark cancelled in Supabase if it exists
        await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('acuity_appointment_id', String(apt.id))
        results.skipped.push({ id: apt.id, reason: 'canceled' })
        continue
      }

      const { setId, setName } = await resolveSet(apt.type ?? '')

      // Parse times
      const start = new Date(apt.datetime)
      if (isNaN(start.getTime())) {
        results.errors.push({ id: apt.id, reason: 'invalid datetime', datetime: apt.datetime })
        continue
      }

      let end: Date
      const durationMins = apt.duration ? parseInt(apt.duration) : 0
      if (apt.date && apt.endTime) {
        const parsed = new Date(`${apt.date} ${apt.endTime}`)
        end = isNaN(parsed.getTime())
          ? new Date(start.getTime() + durationMins * 60_000)
          : parsed
      } else if (durationMins > 0) {
        end = new Date(start.getTime() + durationMins * 60_000)
      } else {
        results.errors.push({ id: apt.id, reason: 'cannot determine end time' })
        continue
      }

      // Upsert customer
      const fullName = `${apt.firstName ?? ''} ${apt.lastName ?? ''}`.trim()
      let customerId: string | undefined
      if (apt.email) {
        const { data: customer } = await supabase
          .from('customers')
          .upsert({ email: apt.email, name: fullName, phone: apt.phone ?? '' }, { onConflict: 'email' })
          .select('id')
          .single()
        customerId = customer?.id
      }

      // Upsert booking
      const totalAmount = apt.price ? parseFloat(apt.price) : 0
      const hours = durationMins / 60

      const { error: upsertErr } = await supabase
        .from('bookings')
        .upsert({
          acuity_appointment_id: String(apt.id),
          set_id:         setId,
          customer_id:    customerId ?? null,
          start_time:     start.toISOString(),
          end_time:       end.toISOString(),
          status:         'confirmed',
          payment_status: apt.paid === 'yes' ? 'paid' : 'unpaid',
          base_amount:    totalAmount,
          extras_amount:  0,
          total_amount:   totalAmount,
          source:         'acuity',
          notes:          apt.notes ?? null,
          guest_count:    null, // Acuity doesn't capture party size — unknown
        }, { onConflict: 'acuity_appointment_id' })

      if (upsertErr) {
        results.errors.push({ id: apt.id, error: upsertErr.message })
      } else {
        results.synced.push({
          id:      apt.id,
          type:    apt.type,
          setName,
          start:   start.toISOString(),
          end:     end.toISOString(),
        })
      }
    } catch (err: any) {
      results.errors.push({ id: apt.id, error: err.message })
    }
  }

  return NextResponse.json(results)
}

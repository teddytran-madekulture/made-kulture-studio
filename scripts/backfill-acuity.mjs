/**
 * One-time backfill: import existing Acuity appointments → Supabase
 * Run from made-kulture-studio/:  node scripts/backfill-acuity.mjs
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ─────────────────────────────────────────────────────────────────────
const ACUITY_USER_ID  = '19320006'
const ACUITY_API_KEY  = '063c46285092612ea7047c8f2a50f67c'
const SUPABASE_URL    = 'https://vvaftjcjydxdlkojnrfm.supabase.co'
const SUPABASE_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2YWZ0amNqeWR4ZGxrb2pucmZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk2MjU1OSwiZXhwIjoyMDk0NTM4NTU5fQ.D-aEtkA8Ip25QMFFpE9SOqRMjQVnmmr71c-Hrzn7FPY'

// Acuity appointment type name (lowercase) → Supabase set name
// null = full studio buyout (no specific set)
const TYPE_TO_SET = {
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
  'full studio':       null,
  'full studio buyout':null,
  'all warehouse access':             null,
  'all warehouse access + cleaning fee': null,
  'set a + aputure spotlight':        'Set A',
  'set a + flashpoint ad100':         'Set A',
  'the watering hole + 10x10\' gray screen w/8000 ansi lumen rear projector(only available during full warehouse rental or when the studio is empty)': 'The Watering Hole',
  'studio one + 10x18\' gray screen w/6000 ansi lumen rear projector(only available during full warehouse rental or when the studio is empty)': 'Studio One',
  'the tank': 'The Tank',
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Acuity returns endTime as "4:30pm" — combine with the date from startIso
function resolveEndTime(startIso, endTimeStr) {
  if (!endTimeStr || endTimeStr.includes('T')) return endTimeStr // already full ISO

  // Extract date and tz offset from start: "2024-05-14T14:00:00-0500"
  const m = startIso.match(/^(\d{4}-\d{2}-\d{2})T[\d:]+(([+-]\d{2}:?\d{2})|Z)?/)
  const datePart = m ? m[1] : startIso.split('T')[0]
  const tzPart   = m ? (m[2] ?? '') : ''

  // Parse "4:30pm" → hours/minutes
  const t = endTimeStr.match(/^(\d+):(\d+)\s*(am|pm)$/i)
  if (!t) return null

  let h = parseInt(t[1], 10)
  const min = t[2]
  if (t[3].toLowerCase() === 'pm' && h !== 12) h += 12
  if (t[3].toLowerCase() === 'am' && h === 12) h = 0

  return `${datePart}T${String(h).padStart(2, '0')}:${min}:00${tzPart}`
}

// ── Fetch all upcoming appointments from Acuity ────────────────────────────────
async function fetchAppointments() {
  const auth = Buffer.from(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`).toString('base64')
  // minDate = 30 days ago to catch any recent ones; max=500 for pagination
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const url   = `https://acuityscheduling.com/api/v1/appointments?minDate=${since}&max=500&direction=ASC`

  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
  if (!res.ok) throw new Error(`Acuity ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  // Ensure "The Tank" exists in sets
  await supabase.from('sets').upsert({
    name: 'The Tank',
    description: 'Pool set',
    rate_per_hour: 75,
    min_hours: 2,
    capacity: 5,
    features: ['{}'],
    is_active: true,
  }, { onConflict: 'name' })

  // Load sets once
  const { data: sets, error: setsErr } = await supabase.from('sets').select('id, name')
  if (setsErr) throw setsErr
  const setByName = Object.fromEntries(sets.map(s => [s.name, s.id]))

  const appts = await fetchAppointments()
  console.log(`\nFetched ${appts.length} appointments from Acuity\n`)

  let ok = 0, skipped = 0, errors = 0

  for (const appt of appts) {
    const typeKey = (appt.type || '').toLowerCase().trim()

    // Unknown type — log and skip
    if (!(typeKey in TYPE_TO_SET)) {
      console.warn(`⚠  Unknown type "${appt.type}" (id ${appt.id}) — add it to TYPE_TO_SET if needed`)
      skipped++
      continue
    }

    const setName = TYPE_TO_SET[typeKey]
    const setId   = setName ? setByName[setName] ?? null : null

    // Upsert customer (email is unique key)
    let customerId = null
    if (appt.email) {
      const { data: cust, error: custErr } = await supabase
        .from('customers')
        .upsert({
          name:  `${appt.firstName ?? ''} ${appt.lastName ?? ''}`.trim() || 'Unknown',
          email: appt.email.toLowerCase(),
          phone: appt.phone || 'N/A',
        }, { onConflict: 'email' })
        .select('id')
        .single()

      if (custErr) console.warn(`  Customer error (${appt.email}): ${custErr.message}`)
      else customerId = cust.id
    }

    // Amounts
    const price = parseFloat(appt.price || '0')
    const paid  = parseFloat(appt.paid  || '0')
    const payStatus = paid >= price && price > 0 ? 'paid'
                    : paid > 0                   ? 'partially_paid'
                    :                              'unpaid'

    const bookingData = {
      customer_id:           customerId,
      set_id:                setId,
      start_time:            appt.datetime,
      end_time:              resolveEndTime(appt.datetime, appt.endTime),
      guest_count:           1,
      status:                appt.canceled ? 'cancelled' : 'confirmed',
      payment_status:        payStatus,
      base_amount:           price || 0,
      extras_amount:         0,
      total_amount:          price || 0,
      source:                'acuity',
      acuity_appointment_id: String(appt.id),
      notes:                 appt.notes || null,
    }

    // Check if already exists, then insert or update
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('acuity_appointment_id', String(appt.id))
      .maybeSingle()

    const { error: bErr } = existing
      ? await supabase.from('bookings').update(bookingData).eq('id', existing.id)
      : await supabase.from('bookings').insert(bookingData)

    if (bErr) {
      console.error(`✗  Appt ${appt.id} (${appt.type}): ${bErr.message}`)
      errors++
    } else {
      const label = setName ?? 'Full Studio'
      console.log(`✓  ${label.padEnd(18)} ${appt.datetime}  ${appt.firstName} ${appt.lastName}`)
      ok++
    }
  }

  console.log(`\n─────────────────────────────────────`)
  console.log(`Done: ${ok} imported, ${skipped} skipped (unknown type), ${errors} errors`)
}

main().catch(err => { console.error(err); process.exit(1) })

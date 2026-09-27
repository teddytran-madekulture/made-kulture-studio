// GET /api/admin/visit-history            → PREVIEW (writes nothing)
// GET /api/admin/visit-history?apply=1    → write customer_prior_visits
//
// One-time (re-runnable) import of visit history from BEFORE the Acuity sync
// began, so the calendar's FIRST VISIT / REGULAR tags reflect people who have
// been coming for years. Built 2026-09-27. See migration 108 for why this is a
// per-email count rather than imported bookings.
//
// Admin-authed (the same cookie as the dashboard), so it is run by opening the
// URL in a browser where you are signed in to admin.
//
// ⚠️ The CUTOFF is read from the data, not hard-coded: the earliest Acuity-sourced
// booking already in the table. Anything before it is history we lack; anything
// on or after it is already counted by lib/visits.ts. Counting both would double.
//
// ⚠️ One VISIT = one customer on one calendar day. Acuity stores a multi-set
// booking as several appointments at the same time, and lib/visits.ts counts
// one order as one visit — this has to match or regulars get inflated.
//
// ⚠️ Acuity is read month by month. A single call returns at most `max` rows with
// no paging cursor, so one big window could silently truncate — the same class
// of bug as the 1,000-row PostgREST cap. A month that comes back FULL is reported
// as an error rather than trusted.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { ACUITY_TYPE_TO_SET } from '@/lib/acuity-set-map'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 300

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const HISTORY_START = '2019-01-01'   // before the studio opened; empty months are cheap
const MONTH_MAX = 1000               // Acuity rows per call; a month hitting this is flagged

function setLabel(type: string | null | undefined): string | null {
  const t = String(type ?? '').toLowerCase()
  if (!t) return null
  // Longest alias first, so 'the watering hole' beats 'watering hole'.
  const keys = Object.keys(ACUITY_TYPE_TO_SET).sort((a, b) => b.length - a.length)
  for (const k of keys) if (t.includes(k)) return ACUITY_TYPE_TO_SET[k] ?? 'Full Studio'
  return String(type).trim() || null
}

function monthWindows(fromISO: string, toISO: string): { min: string; max: string }[] {
  const out: { min: string; max: string }[] = []
  const d = new Date(fromISO + 'T00:00:00Z')
  const end = new Date(toISO + 'T00:00:00Z')
  while (d < end) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    const last = new Date(Math.min(next.getTime() - 86_400_000, end.getTime() - 86_400_000))
    out.push({ min: d.toISOString().slice(0, 10), max: last.toISOString().slice(0, 10) })
    d.setTime(next.getTime())
  }
  return out
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const apply = req.nextUrl.searchParams.get('apply') === '1'

  // Cutoff: the earliest Acuity booking already in our table.
  const { data: first, error: cutErr } = await db
    .from('bookings').select('start_time').eq('source', 'acuity')
    .order('start_time', { ascending: true }).limit(1)
  if (cutErr) return NextResponse.json({ error: `Could not read cutoff: ${cutErr.message}` }, { status: 500 })
  if (!first?.length) return NextResponse.json({ error: 'No Acuity bookings in the table, so there is no cutoff to import up to.' }, { status: 400 })
  const cutoffISO = new Date(first[0].start_time).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  const auth = 'Basic ' + Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString('base64')
  const windows = monthWindows(HISTORY_START, cutoffISO)

  const errors: string[] = []
  const appts: any[] = []
  // A few months at a time — polite to Acuity, fast enough for the time limit.
  for (let i = 0; i < windows.length; i += 4) {
    const batch = windows.slice(i, i + 4)
    const results = await Promise.all(batch.map(async w => {
      const url = `https://acuityscheduling.com/api/v1/appointments?minDate=${w.min}&maxDate=${w.max}&max=${MONTH_MAX}&canceled=false&direction=ASC`
      try {
        const r = await fetch(url, { headers: { Authorization: auth }, cache: 'no-store' })
        if (!r.ok) { errors.push(`${w.min}: Acuity ${r.status}`); return [] }
        const rows = await r.json()
        if (!Array.isArray(rows)) { errors.push(`${w.min}: unexpected response`); return [] }
        if (rows.length >= MONTH_MAX) errors.push(`${w.min}: month returned ${rows.length} rows (the limit), may be incomplete`)
        return rows
      } catch (e: any) { errors.push(`${w.min}: ${e?.message ?? 'fetch failed'}`); return [] }
    }))
    for (const rows of results) appts.push(...rows)
  }

  // Group into visits: one per email per Central calendar day.
  type Agg = { days: Map<string, { at: string; set: string | null }>; name: string }
  const byEmail = new Map<string, Agg>()
  let noEmail = 0
  for (const a of appts) {
    if (a.canceled) continue
    const email = String(a.email ?? '').trim().toLowerCase()
    if (!email) { noEmail++; continue }
    const at = String(a.datetime ?? '')
    const t = Date.parse(at)
    if (!Number.isFinite(t)) continue
    // Only history strictly before the cutoff day — the rest is already counted.
    const day = new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    if (day >= cutoffISO) continue
    let agg = byEmail.get(email)
    if (!agg) { agg = { days: new Map(), name: `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() }; byEmail.set(email, agg) }
    if (!agg.days.has(day)) agg.days.set(day, { at: new Date(t).toISOString(), set: setLabel(a.type) })
  }

  const rows = Array.from(byEmail.entries()).map(([email, agg]) => {
    const visits = Array.from(agg.days.values()).sort((x, y) => Date.parse(x.at) - Date.parse(y.at))
    const last = visits[visits.length - 1]
    return { email, name: agg.name, visits: visits.length, first_visit: visits[0].at, last_visit: last.at, last_set: last.set }
  }).sort((a, b) => b.visits - a.visits)

  const summary = {
    mode: apply ? 'APPLIED' : 'PREVIEW (nothing written, add ?apply=1 to save)',
    cutoff: cutoffISO,
    monthsRead: windows.length,
    appointmentsRead: appts.length,
    appointmentsWithoutEmail: noEmail,
    customers: rows.length,
    totalVisits: rows.reduce((s, r) => s + r.visits, 0),
    errors,
    top25: rows.slice(0, 25).map(r => ({ name: r.name, visits: r.visits, last: r.last_visit.slice(0, 10), lastSet: r.last_set })),
  }

  if (!apply) return NextResponse.json(summary)

  // Refuse to write a partial picture. Undercounting would stamp FIRST VISIT on
  // regulars; better to fix the error and re-run.
  if (errors.length) return NextResponse.json({ ...summary, mode: 'NOT APPLIED: fix the errors above and re-run' }, { status: 409 })

  const now = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(({ name, ...r }) => ({ ...r, source: 'acuity', imported_at: now }))
    const { error } = await db.from('customer_prior_visits').upsert(chunk, { onConflict: 'email' })
    if (error) return NextResponse.json({ ...summary, mode: `FAILED at row ${i}: ${error.message}` }, { status: 500 })
  }
  // Read back — a write that "succeeds" into nothing is the classic silent failure here.
  const { count, error: cErr } = await db.from('customer_prior_visits').select('email', { count: 'exact', head: true })
  return NextResponse.json({ ...summary, storedRows: cErr ? `could not verify: ${cErr.message}` : count })
}

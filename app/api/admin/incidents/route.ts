// Account standing — incidents (migration 109). Admin only.
//   GET   ?customerId= | ?bookingId=   → one customer's meter + record
//   GET   (no params)                  → recent incidents across everyone
//   POST  { customerId|bookingId, category, severity, occurredOn, details, feeCents?, notify? }
//   PATCH { incidentId, voidReason }            → void (never delete)
//   PATCH { customerId, suspendedUntil|null }   → dated suspension / lift it
//
// ⚠️ supabase-js does not throw: every write below reads `error` and `.select()`s
// the row back, so a no-op can never be reported as success.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import {
  loadStandingConfig, computeStanding, severityAtLeast, SEVERITIES, LEVEL_LABEL, LEVEL_MEANING, type Severity,
} from '@/lib/standing'
import { sendIncidentNoticeEmail } from '@/lib/email'
import { centralDateStr } from '@/lib/booking-times'
import { lateChangeMeter, METER_LABEL } from '@/lib/late-change-meter'
import { findAuthUserIdByEmail } from '@/lib/auth-user'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const INC_COLS = 'id, customer_id, booking_id, occurred_on, category, severity, points, details, photo_urls, fee_cents, logged_by, customer_notified_at, voided_at, void_reason, created_at'

async function customerFor(q: { customerId?: string | null; bookingId?: string | null }) {
  let id = q.customerId ?? null
  if (!id && q.bookingId) {
    const { data } = await db.from('bookings').select('customer_id').eq('id', q.bookingId).maybeSingle()
    id = data?.customer_id ?? null
  }
  if (!id) return null
  const { data } = await db.from('customers').select('id, name, email, banned, suspended_until').eq('id', id).maybeSingle()
  return data ?? null
}

async function meter(customer: any) {
  const config = await loadStandingConfig(db)
  const { data: incidents, error } = await db.from('customer_incidents').select(INC_COLS)
    .eq('customer_id', customer.id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const standing = computeStanding(incidents ?? [], customer, config)
  // Private bucket → 10-minute signed URLs, never public ones.
  const withPhotos = await Promise.all((incidents ?? []).map(async (i: any) => {
    const paths: string[] = Array.isArray(i.photo_urls) ? i.photo_urls : []
    if (!paths.length) return { ...i, photos: [] }
    const { data } = await db.storage.from('incident-photos').createSignedUrls(paths, 600)
    return { ...i, photos: (data ?? []).map((d: any) => ({ path: d.path, url: d.signedUrl })).filter((x: any) => x.url) }
  }))
  // Booking flexibility (late-change meter) — shown under standing so the owner
  // can see it without opening the customer's own account page (2026-10-04).
  // Separate system: it never adds standing points. lateChangeMeter fails open
  // (green) on a read error, and an account lookup failure only drops the
  // by-account read — the by-email read still runs.
  let authUserId: string | null = null
  try { authUserId = await findAuthUserIdByEmail(db, customer.email) } catch (e) { console.error('[incidents] auth lookup failed (non-fatal):', e) }
  const fm = await lateChangeMeter(db, { authUserId, email: customer.email })
  const flex = { ...fm, label: METER_LABEL[fm.level] }
  return { customer, standing, incidents: withPhotos, config, flex }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const customerId = sp.get('customerId'), bookingId = sp.get('bookingId')
  try {
    if (customerId || bookingId) {
      const c = await customerFor({ customerId, bookingId })
      if (!c) return NextResponse.json({ error: 'No customer on this booking.' }, { status: 404 })
      return NextResponse.json(await meter(c))
    }
    const { data, error } = await db.from('customer_incidents')
      .select(`${INC_COLS}, customers ( name, email )`).order('created_at', { ascending: false }).limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ incidents: data ?? [], config: await loadStandingConfig(db) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Read failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const c = await customerFor({ customerId: body.customerId, bookingId: body.bookingId })
  if (!c) return NextResponse.json({ error: 'No customer found for this incident.' }, { status: 404 })

  const config = await loadStandingConfig(db)
  const cat = config.categories.find(x => x.key === body.category)
  if (!cat) return NextResponse.json({ error: 'Pick a category.' }, { status: 400 })
  const severity: Severity = SEVERITIES.includes(body.severity) ? body.severity : cat.severity
  const occurredOn = /^\d{4}-\d{2}-\d{2}$/.test(String(body.occurredOn ?? '')) ? body.occurredOn : centralDateStr(new Date().toISOString())
  const details = String(body.details ?? '').trim().slice(0, 2000)
  const feeCents = Number.isFinite(Number(body.feeCents)) && Number(body.feeCents) > 0 ? Math.round(Number(body.feeCents)) : null

  const { data: row, error } = await db.from('customer_incidents').insert({
    customer_id: c.id, booking_id: body.bookingId || null, occurred_on: occurredOn,
    category: cat.key, severity, points: config.points[severity], details, fee_cents: feeCents, logged_by: 'admin',
  }).select(INC_COLS).single()
  if (error || !row) return NextResponse.json({ error: error?.message || 'Could not save the incident.' }, { status: 500 })

  const m = await meter(c)

  // Email: moderate and up by default; the admin can force it either way.
  const notify = typeof body.notify === 'boolean' ? body.notify : severityAtLeast(severity, config.emailFrom)
  let emailed = false, emailError: string | null = null
  if (notify && c.email) {
    try {
      await sendIncidentNoticeEmail({
        to: c.email, customerName: c.name, occurredOn, categoryLabel: cat.label, details,
        points: row.points, levelLabel: LEVEL_LABEL[m.standing.level], levelMeaning: LEVEL_MEANING[m.standing.level],
        nextDropOff: m.standing.nextDropOff,
      })
      const { error: nErr } = await db.from('customer_incidents').update({ customer_notified_at: new Date().toISOString() }).eq('id', row.id)
      if (nErr) console.error('[incidents] notified stamp failed', nErr)
      emailed = true
    } catch (e: any) { emailError = e?.message || 'Email failed' }
  }
  return NextResponse.json({ ok: true, incident: row, emailed, emailError, ...m })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  if (body.incidentId) {
    const reason = String(body.voidReason ?? '').trim()
    if (!reason) return NextResponse.json({ error: 'Say why it is being voided.' }, { status: 400 })
    const { data, error } = await db.from('customer_incidents')
      .update({ voided_at: new Date().toISOString(), void_reason: reason.slice(0, 500) })
      .eq('id', body.incidentId).is('voided_at', null).select('customer_id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Already voided or not found.' }, { status: 404 })
    const c = await customerFor({ customerId: data[0].customer_id })
    return NextResponse.json({ ok: true, ...(c ? await meter(c) : {}) })
  }

  if (body.customerId && 'suspendedUntil' in body) {
    const until = body.suspendedUntil ? new Date(body.suspendedUntil) : null
    if (until && !Number.isFinite(until.getTime())) return NextResponse.json({ error: 'Bad date.' }, { status: 400 })
    const { data, error } = await db.from('customers')
      .update({ suspended_until: until ? until.toISOString() : null }).eq('id', body.customerId).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
    const c = await customerFor({ customerId: body.customerId })
    return NextResponse.json({ ok: true, ...(c ? await meter(c) : {}) })
  }
  return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 })
}

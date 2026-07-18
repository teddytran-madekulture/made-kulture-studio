import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { shortNoticeActive, shortNoticeViewActive, shortNoticeExpiresAtMs } from '@/lib/short-notice'
import { sendShortNoticeRequestAlert } from '@/lib/email'
import { sendOwnerSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

// Resolve the logged-in customer (auth user → customers row + profile name).
async function currentCustomer() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const email = user.email.toLowerCase()
  const [{ data: cust }, { data: profile }] = await Promise.all([
    service.from('customers').select('id, pricing_overrides, phone').eq('email', email).maybeSingle(),
    supabase.from('customer_profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
  ])
  return {
    email,
    name: profile?.full_name || email.split('@')[0],
    phone: profile?.phone || cust?.phone || null,
    id: cust?.id ?? null,
    overrides: cust?.pricing_overrides ?? null,
  }
}

// GET — latest request status for the logged-in customer (drives the dashboard button).
export async function GET() {
  const c = await currentCustomer()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canView = shortNoticeViewActive(c.overrides)
  const canBook = shortNoticeActive(c.overrides)
  const expiresAt = shortNoticeExpiresAtMs(c.overrides) // ms epoch of the active timed window, or null
  let latest = null
  if (c.id || c.email) {
    const q = service.from('short_notice_requests').select('status, requested_at, granted_until').order('requested_at', { ascending: false }).limit(1)
    const { data } = c.id ? await q.eq('customer_id', c.id) : await q.eq('customer_email', c.email)
    latest = data?.[0] ?? null
  }
  return NextResponse.json({ canView, canBook, expiresAt, latest })
}

// POST — file a short-notice booking request + notify the owner.
export async function POST(req: NextRequest) {
  const c = await currentCustomer()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!shortNoticeViewActive(c.overrides)) {
    return NextResponse.json({ error: 'Short-notice requests are only available to approved customers.' }, { status: 403 })
  }
  if (shortNoticeActive(c.overrides)) {
    return NextResponse.json({ error: 'You already have short-notice booking access.' }, { status: 400 })
  }

  // Don't stack duplicate pending requests.
  const dupQ = service.from('short_notice_requests').select('id').eq('status', 'pending').limit(1)
  const { data: dup } = c.id ? await dupQ.eq('customer_id', c.id) : await dupQ.eq('customer_email', c.email)
  if (dup && dup.length) return NextResponse.json({ ok: true, status: 'pending', already: true })

  const body = await req.json().catch(() => ({} as any))

  // Set, date, and time are all required so the studio knows exactly what the
  // customer intends to book before approving a short-notice window.
  const desiredSet  = typeof body.desiredSet === 'string' ? body.desiredSet.trim() : ''
  const desiredDate = typeof body.desiredDate === 'string' ? body.desiredDate.trim() : ''
  const desiredStart = (body.desiredStart != null && !isNaN(Number(body.desiredStart))) ? Number(body.desiredStart) : null
  if (!desiredSet)                              return NextResponse.json({ error: 'Please choose the set you want.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) return NextResponse.json({ error: 'Please choose the date you want.' }, { status: 400 })
  if (desiredStart == null)                     return NextResponse.json({ error: 'Please choose the time you want.' }, { status: 400 })

  // Resolve a human-readable set name for the owner alert (falls back to slug).
  const { data: setRow } = await service.from('sets').select('name').eq('slug', desiredSet).maybeSingle()
  const desiredSetName = setRow?.name || desiredSet

  const token = randomBytes(20).toString('hex')
  const row = {
    customer_id:    c.id,
    customer_email: c.email,
    customer_name:  c.name,
    customer_phone: c.phone,
    status:         'pending',
    desired_set:    desiredSet,
    desired_date:   desiredDate,
    desired_start:  desiredStart,
    note:           (typeof body.note === 'string' && body.note.trim()) ? body.note.trim().slice(0, 500) : null,
    approve_token:  token,
  }
  const { error } = await service.from('short_notice_requests').insert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approveUrl = `${APP_URL}/short-notice/approve/${token}`
  // Notify the owner — non-fatal if either channel fails.
  await Promise.allSettled([
    sendShortNoticeRequestAlert({ customerName: c.name, customerEmail: c.email, desiredSetName, desiredDate: row.desired_date, desiredStart: row.desired_start, note: row.note, approveUrl }),
    sendOwnerSMS(`🔔 Short-notice request from ${c.name} — ${desiredSetName} on ${row.desired_date}. Approve: ${approveUrl}`),
  ])

  return NextResponse.json({ ok: true, status: 'pending' })
}

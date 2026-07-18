import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendShortNoticeApprovedEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// today + N days as YYYY-MM-DD (UTC — matches shortNoticeActive's date compare).
function datePlusDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// Read the studio-configured grant length in minutes (default 60).
async function grantMinutes(): Promise<number> {
  const { data } = await service.from('studio_settings').select('value').eq('key', 'short_notice_grant_minutes').maybeSingle()
  const n = Number(data?.value)
  return Number.isFinite(n) && n > 0 ? n : 60
}

// GET /api/short-notice/[token] — request details for the owner's approval page.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { data, error } = await service
    .from('short_notice_requests')
    .select('customer_name, customer_email, desired_set, desired_date, desired_start, note, status, granted_until, granted_expires_at, requested_at')
    .eq('approve_token', params.token)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  // Resolve a readable set name for display (falls back to the slug).
  let desiredSetName: string | null = null
  if (data.desired_set) {
    const { data: setRow } = await service.from('sets').select('name').eq('slug', data.desired_set).maybeSingle()
    desiredSetName = setRow?.name || data.desired_set
  }
  return NextResponse.json({ request: { ...data, desired_set_name: desiredSetName }, grantMinutes: await grantMinutes() })
}

// POST /api/short-notice/[token] — approve (48h or until date) or deny.
// Token-gated (the owner's private approval link / admin list). Approving flips
// on the customer's short_notice grant and notifies them.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  const { data: reqRow } = await service
    .from('short_notice_requests')
    .select('id, customer_id, customer_email, customer_name, customer_phone, status')
    .eq('approve_token', params.token)
    .maybeSingle()
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (reqRow.status !== 'pending') return NextResponse.json({ error: `Already ${reqRow.status}.`, status: reqRow.status }, { status: 409 })

  if (action === 'deny') {
    await service.from('short_notice_requests').update({ status: 'denied', resolved_at: new Date().toISOString() }).eq('id', reqRow.id)
    return NextResponse.json({ ok: true, status: 'denied' })
  }

  if (action !== 'approve_1h' && action !== 'approve_48h' && action !== 'approve_until') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Timed window (the default): open short-notice booking for N minutes only.
  const timed = action === 'approve_1h'
  const mins = timed ? await grantMinutes() : 0
  const expiresIso = timed ? new Date(Date.now() + mins * 60_000).toISOString() : null
  const until = timed
    ? null
    : (action === 'approve_48h'
        ? datePlusDays(2)
        : (typeof body.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.until) ? body.until : null))
  if (!timed && !until) return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })

  // Merge into the customer's pricing_overrides (preserve any existing overrides).
  const custQ = service.from('customers').select('id, pricing_overrides, email')
  const { data: cust } = reqRow.customer_id
    ? await custQ.eq('id', reqRow.customer_id).maybeSingle()
    : await custQ.eq('email', reqRow.customer_email).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Timed grant sets a precise expiry and clears any stale date; a date grant
  // sets the day and clears any stale timed expiry.
  const overrides = {
    ...(cust.pricing_overrides || {}),
    short_notice: true,
    short_notice_until: timed ? null : until,
    short_notice_expires_at: timed ? expiresIso : null,
  }
  const { error: upErr } = await service.from('customers').update({ pricing_overrides: overrides }).eq('id', cust.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await service.from('short_notice_requests').update({
    status: 'approved',
    granted_until: until,
    granted_expires_at: expiresIso,
    resolved_at: new Date().toISOString(),
  }).eq('id', reqRow.id)

  const bookUrl = `${(process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')}/availability`
  // Houston-time clock label for when the timed window closes.
  const clock = timed
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(expiresIso!))
    : ''
  const timedLabel = timed ? `for the next ${mins} minutes — until ${clock}` : null

  // Notify the customer — non-fatal.
  await Promise.allSettled([
    sendShortNoticeApprovedEmail({ customerName: reqRow.customer_name || '', customerEmail: reqRow.customer_email, grantedUntil: until, timedLabel }),
    reqRow.customer_phone
      ? sendSMS(reqRow.customer_phone, timed
          ? `✅ Made Kulture: you're approved to book short-notice for the next ${mins} min (until ${clock}). Book now: ${bookUrl}`
          : `✅ Made Kulture: you're approved to book short-notice through ${until}. Book at ${bookUrl}`)
      : Promise.resolve(),
  ])

  return NextResponse.json({ ok: true, status: 'approved', granted_until: until, granted_expires_at: expiresIso })
}

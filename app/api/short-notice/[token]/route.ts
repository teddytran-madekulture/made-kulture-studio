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

// GET /api/short-notice/[token] — request details for the owner's approval page.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { data, error } = await service
    .from('short_notice_requests')
    .select('customer_name, customer_email, desired_date, desired_start, note, status, granted_until, requested_at')
    .eq('approve_token', params.token)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  return NextResponse.json({ request: data })
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

  if (action !== 'approve_48h' && action !== 'approve_until') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  const until = action === 'approve_48h'
    ? datePlusDays(2)
    : (typeof body.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.until) ? body.until : null)
  if (!until) return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })

  // Merge into the customer's pricing_overrides (preserve any existing overrides).
  const custQ = service.from('customers').select('id, pricing_overrides, email')
  const { data: cust } = reqRow.customer_id
    ? await custQ.eq('id', reqRow.customer_id).maybeSingle()
    : await custQ.eq('email', reqRow.customer_email).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const overrides = { ...(cust.pricing_overrides || {}), short_notice: true, short_notice_until: until }
  const { error: upErr } = await service.from('customers').update({ pricing_overrides: overrides }).eq('id', cust.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await service.from('short_notice_requests').update({ status: 'approved', granted_until: until, resolved_at: new Date().toISOString() }).eq('id', reqRow.id)

  // Notify the customer — non-fatal.
  await Promise.allSettled([
    sendShortNoticeApprovedEmail({ customerName: reqRow.customer_name || '', customerEmail: reqRow.customer_email, grantedUntil: until }),
    reqRow.customer_phone ? sendSMS(reqRow.customer_phone, `✅ Made Kulture: you're approved to book short-notice through ${until}. Book at https://made-kulture-studio.vercel.app/availability`) : Promise.resolve(),
  ])

  return NextResponse.json({ ok: true, status: 'approved', granted_until: until })
}

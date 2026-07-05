import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSegmentRecipients, sendCampaignEmails, type SegmentKey } from '@/lib/marketing'
import { renderTemplateBody } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

// POST /api/admin/marketing/[id]/send  { test?: boolean, testEmail?: string }
// test=true → send a single preview to testEmail (no status change).
// otherwise → send to the whole segment (minus unsubscribes) and mark sent.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: { test?: boolean; testEmail?: string } = {}
  try { b = await req.json() } catch { /* real send */ }

  const db = supabaseAdmin()
  const { data: c } = await db.from('marketing_campaigns')
    .select('id, subject, body_html, template_id, template_data, segment_key, status, promo_id').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })

  // Resolve the attached promo code (rendered inside the template's promo block).
  let promoCode: string | undefined
  if (c.promo_id) {
    const { data: p } = await db.from('promo_codes').select('code').eq('id', c.promo_id).maybeSingle()
    promoCode = p?.code || undefined
  }

  // Template campaign → render branded HTML; legacy campaign → raw body_html (+ promo line).
  let body: string
  if (c.template_id) {
    body = renderTemplateBody(c.template_id as string, (c.template_data as any) || {}, promoCode)
  } else {
    body = (c.body_html as string) || ''
    if (promoCode) body += `<p style="margin:20px 0 0;font-size:16px;">Use code <strong style="color:#c9b27e;">${promoCode}</strong> at checkout.</p>`
  }

  // Test send — one email, no status change.
  if (b.test) {
    const to = (b.testEmail || '').trim()
    if (!to) return NextResponse.json({ error: 'Enter a test email.' }, { status: 400 })
    const r = await sendCampaignEmails(c.subject, body, [{ email: to, name: 'Test' }])
    if (r.error) return NextResponse.json({ error: r.error }, { status: 502 })
    return NextResponse.json({ success: true, test: true, sent: r.sent })
  }

  // Real send.
  if (c.status === 'sent') return NextResponse.json({ error: 'This campaign was already sent.' }, { status: 409 })
  const recipients = await getSegmentRecipients(c.segment_key as SegmentKey)
  if (recipients.length === 0) return NextResponse.json({ error: 'No recipients in that segment.' }, { status: 400 })

  const r = await sendCampaignEmails(c.subject, body, recipients, c.id)
  if (r.error && r.sent === 0) return NextResponse.json({ error: r.error }, { status: 502 })

  await db.from('marketing_campaigns')
    .update({ status: 'sent', recipient_count: r.sent, sent_at: new Date().toISOString() })
    .eq('id', params.id)

  return NextResponse.json({ success: true, sent: r.sent, partialError: r.error ?? null })
}

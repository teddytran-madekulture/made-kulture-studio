import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { readUnsubToken } from '@/lib/marketing'

export const dynamic = 'force-dynamic'

// campaign_id is an FK to marketing_campaigns. A malformed or stale value makes
// Postgres reject the whole row — including the opt-out itself. Attribution is
// never worth losing a removal over, so it gets validated and, failing that,
// dropped.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function page(msg: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Made Kulture</title></head>
    <body style="margin:0;background:#0b0b0d;color:#f4f4f5;font-family:Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px;">
      <div><div style="font-family:'Courier New',monospace;letter-spacing:0.3em;color:#c9b27e;font-size:12px;margin-bottom:16px;">MADE KULTURE</div>
      <div style="font-size:18px;line-height:1.6;max-width:360px;">${msg}</div></div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

// GET /api/unsubscribe?t=<token>&c=<campaignId> — add the email to the do-not-email
// list, attributing the opt-out to the campaign whose email drove it (c, optional).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') ?? ''
  const rawCampaignId = req.nextUrl.searchParams.get('c') || null
  const campaignId = rawCampaignId && UUID_RE.test(rawCampaignId) ? rawCampaignId : null
  const email = readUnsubToken(token)
  if (!email) return page('That unsubscribe link isn’t valid. Reply STOP to any text, or contact us at (832) 408-1631.')
  const clean = email.toLowerCase().trim()
  const db = supabaseAdmin()

  // supabase-js RESOLVES on a Postgres error rather than throwing, so a
  // try/catch around these calls never sees a DB rejection — the error has to
  // be read. Unread, a failed upsert meant telling someone they were
  // unsubscribed while they stayed on the list and kept getting campaigns.
  let { error: supErr } = await db
    .from('email_suppressions')
    .upsert({ email: clean, reason: 'unsubscribe', campaign_id: campaignId }, { onConflict: 'email' })

  // Attribution failed (deleted campaign, FK violation) — retry bare. Losing
  // which campaign drove the opt-out is acceptable; losing the opt-out is not.
  if (supErr && campaignId) {
    console.error('[unsubscribe] attributed suppression failed, retrying unattributed:', supErr)
    ;({ error: supErr } = await db
      .from('email_suppressions')
      .upsert({ email: clean, reason: 'unsubscribe', campaign_id: null }, { onConflict: 'email' }))
  }

  if (supErr) {
    console.error('[unsubscribe] SUPPRESSION FAILED —', clean, supErr)
    return page('Something went wrong. Please email info@madekulture.com to be removed.')
  }

  // Analytics only. Best-effort by design: never blocks the opt-out.
  if (campaignId) {
    const { error: evtErr } = await db
      .from('marketing_events')
      .insert({ campaign_id: campaignId, email: clean, type: 'unsubscribed' })
    if (evtErr) console.error('[unsubscribe] event log failed (non-fatal):', evtErr)
  }
  return page('You’ve been unsubscribed from Made Kulture marketing emails. You’ll still get booking confirmations for any sessions you book.')
}

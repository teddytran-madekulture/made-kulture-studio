import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { readUnsubToken } from '@/lib/marketing'

export const dynamic = 'force-dynamic'

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

// GET /api/unsubscribe?t=<token> — add the email to the do-not-email list.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') ?? ''
  const email = readUnsubToken(token)
  if (!email) return page('That unsubscribe link isn’t valid. Reply STOP to any text, or contact us at (832) 408-1631.')
  try {
    await supabaseAdmin().from('email_suppressions').upsert({ email: email.toLowerCase().trim(), reason: 'unsubscribe' }, { onConflict: 'email' })
  } catch (e) {
    console.error('[unsubscribe] failed', e)
    return page('Something went wrong. Please email info@madekulture.com to be removed.')
  }
  return page('You’ve been unsubscribed from Made Kulture marketing emails. You’ll still get booking confirmations for any sessions you book.')
}

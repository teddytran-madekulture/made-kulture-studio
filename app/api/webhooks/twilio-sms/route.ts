// POST /api/webhooks/twilio-sms — texts people send TO the toll-free number.
//
// Until 2026-09-27 the number's "A message comes in" webhook was Twilio's demo
// URL, so every reply ("All done", "running 5 min late") got a canned
// unsubscribe blurb and reached NOBODY. Now each one pushes Teddy (kept in
// /admin/notifications history) and emails teddytran@, with the customer's name
// when the number matches a customer.
//
// ⚠️ STOP / UNSUBSCRIBE / START are handled by Twilio and the carriers for
// toll-free numbers before they reach us — never try to handle opt-out here.
// HELP gets a short reply (required for toll-free compliance).
// ⚠️ Stays on the vercel.app host after the domain move, like the igloohome
// webhook, so a DNS change can never silently break it.
import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase'
import { sendOwnerPush } from '@/lib/push'
import { sendSimpleEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const twiml = (msg?: string) => new NextResponse(
  `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/[<&>]/g, '')}</Message>` : ''}</Response>`,
  { headers: { 'Content-Type': 'text/xml' } },
)

const HELP_REPLY = 'Made Kulture: booking texts for your studio sessions. Questions? Email info@madekulture.com. Reply STOP to opt out. Msg & data rates may apply.'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const params = Object.fromEntries(new URLSearchParams(raw))

  // Signature check against the URL Twilio called (host-derived, so it survives
  // a host change). Unsigned/forged ⇒ 403 and nothing forwarded.
  const token = process.env.TWILIO_AUTH_TOKEN
  const sig = req.headers.get('x-twilio-signature') || ''
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const url = `https://${host}${req.nextUrl.pathname}${req.nextUrl.search}`
  if (!token || !twilio.validateRequest(token, sig, url, params)) {
    console.error('[twilio-sms] signature check failed', { url })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const from = String(params.From || '')
  const body = String(params.Body || '').trim().slice(0, 1000)
  const media = Number(params.NumMedia || 0)
  const word = body.toUpperCase()
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'START', 'UNSTOP'].includes(word)) return twiml()
  if (word === 'HELP' || word === 'INFO') return twiml(HELP_REPLY)

  // Who is it? Match on the last 10 digits against customers.phone.
  let who = from
  try {
    const d = from.replace(/\D/g, '').slice(-10)
    if (d.length === 10) {
      const { data } = await supabaseAdmin().from('customers').select('name, phone').ilike('phone', `%${d}`).limit(1)
      if (data?.[0]?.name) who = `${data[0].name} (${from})`
    }
  } catch (e) { console.error('[twilio-sms] customer lookup failed (non-fatal)', e) }

  const text = body || (media ? `[${media} photo${media > 1 ? 's' : ''}]` : '[empty message]')
  await Promise.allSettled([
    sendOwnerPush({ title: `Text from ${who}`, body: text.slice(0, 180), url: '/admin/notifications' }),
    sendSimpleEmail({
      to: 'teddytran@madekulture.com',
      subject: `Text to the studio number from ${who}`,
      heading: 'New text to the studio number',
      paragraphs: [`<strong>From:</strong> ${esc(who)}`, esc(text).replace(/\n/g, '<br/>'), media ? `${media} attachment(s) — open the message in Twilio to see them.` : '', 'Reply from your phone — this number can’t hold a conversation.'].filter(Boolean),
    }),
  ])
  // No auto-reply: silence is better than the old canned blurb.
  return twiml()
}

// POST /api/webhooks/twilio-sms — texts people send TO the toll-free number.
//
// Until 2026-09-27 the number's "A message comes in" webhook was Twilio's demo
// URL, so every reply ("All done", "running 5 min late") got a canned
// unsubscribe blurb and reached NOBODY. Now each one is saved to sms_messages
// (migration 115) as a thread on /admin/texts, where Teddy replies from this
// same number, and he gets a push + email naming the customer and their
// nearest booking.
//
// ⚠️ STOP / UNSUBSCRIBE / START are handled by Twilio and the carriers for
// toll-free numbers — never try to handle opt-out here (we only log them).
// HELP gets a short reply (required for toll-free compliance).
// ⚠️ Stays on the vercel.app host after the domain move, like the igloohome
// webhook, so a DNS change can never silently break it.
import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase'
import { sendOwnerPush } from '@/lib/push'
import { sendSimpleEmail } from '@/lib/email'
import { toE164 } from '@/lib/sms'
import { customersForPhone, nearestBookingLine } from '@/lib/sms-inbox'
import { codeTextFor } from '@/lib/door-code-fallback'

export const dynamic = 'force-dynamic'

const twiml = (msg?: string) => new NextResponse(
  `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/[<&>]/g, '')}</Message>` : ''}</Response>`,
  { headers: { 'Content-Type': 'text/xml' } },
)

const HELP_REPLY = 'Made Kulture: booking texts for your studio sessions. Questions? Email info@madekulture.com. Reply STOP to opt out. Msg & data rates may apply.'
const OPT_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'START', 'UNSTOP']
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const params = Object.fromEntries(new URLSearchParams(raw))

  // Signature check against the URL Twilio called (host-derived, so it survives
  // a host change). Unsigned/forged ⇒ 403 and nothing saved or forwarded.
  const token = process.env.TWILIO_AUTH_TOKEN
  const sig = req.headers.get('x-twilio-signature') || ''
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const url = `https://${host}${req.nextUrl.pathname}${req.nextUrl.search}`
  if (!token || !twilio.validateRequest(token, sig, url, params)) {
    console.error('[twilio-sms] signature check failed', { url })
    return new NextResponse('Forbidden', { status: 403 })
  }

  const from = toE164(String(params.From || '')) || String(params.From || '')
  const body = String(params.Body || '').trim().slice(0, 1600)
  const media = Number(params.NumMedia || 0)
  const word = body.toUpperCase()
  const db = supabaseAdmin()

  // Save it first — the thread is the record even if the alerts fail.
  // upsert+ignoreDuplicates on the sid: a Twilio retry never doubles a message.
  let isNew = true
  try {
    const { data, error } = await db.from('sms_messages')
      .upsert({ phone: from, direction: 'in', body, media_count: media, twilio_sid: params.MessageSid || null }, { onConflict: 'twilio_sid', ignoreDuplicates: true })
      .select('id')
    if (error) console.error('[twilio-sms] save failed', error)
    else if (!data?.length && params.MessageSid) isNew = false
  } catch (e) { console.error('[twilio-sms] save error', e) }
  if (!isNew) return twiml()

  // Opt-out/in words: carriers already acted; logged above, nothing to alert.
  if (OPT_WORDS.includes(word)) return twiml()
  // CODE → text the door code back. The safety net for a phone with no signal
  // at the door (2026-10-01): answers only from the phone on a booking that is
  // live or starts within CODE_REVEAL_MINUTES, and counts as a check-in.
  if (word === 'CODE') {
    let reply = 'Made Kulture: no session found for this number starting in the next 30 minutes. Text us here and we will help.'
    try {
      const custs = await customersForPhone(db, from)
      const r = await codeTextFor(db, custs.map(c => c.id), 'sms-code-reply')
      if (r) reply = r
    } catch (e) { console.error('[twilio-sms] CODE reply failed', e) }
    const { error } = await db.from('sms_messages').insert({ phone: from, direction: 'out', body: reply, sent_by: 'system' })
    if (error) console.error('[twilio-sms] CODE reply log failed', error)
    return twiml(reply)
  }

  if (word === 'HELP' || word === 'INFO') {
    const { error } = await db.from('sms_messages').insert({ phone: from, direction: 'out', body: HELP_REPLY, sent_by: 'system' })
    if (error) console.error('[twilio-sms] help log failed', error)
    return twiml(HELP_REPLY)
  }

  let who = from, context = ''
  try {
    const custs = await customersForPhone(db, from)
    if (custs.length) who = `${custs[0].name || 'Customer'} (${from})`
    context = await nearestBookingLine(db, custs.map(c => c.id))
  } catch (e) { console.error('[twilio-sms] customer lookup failed (non-fatal)', e) }

  const text = body || (media ? `[${media} photo${media > 1 ? 's' : ''}]` : '[empty message]')
  const threadUrl = `/admin/texts?phone=${encodeURIComponent(from)}`
  await Promise.allSettled([
    sendOwnerPush({ title: `Text from ${who}`, body: (context ? `${context}\n` : '') + text.slice(0, 180), url: threadUrl }),
    sendSimpleEmail({
      to: 'teddytran@madekulture.com',
      subject: `Text to the studio number from ${who}`,
      heading: 'New text to the studio number',
      paragraphs: [
        `<strong>From:</strong> ${esc(who)}`,
        context ? `<strong>${esc(context)}</strong>` : '',
        esc(text).replace(/\n/g, '<br/>'),
        media ? `${media} attachment(s) — open the message in Twilio to see them.` : '',
        `<a href="${APP_URL}${threadUrl}">Reply in the admin</a> — it texts back from the studio number.`,
      ].filter(Boolean),
    }),
  ])
  // No auto-reply: Teddy answers from /admin/texts.
  return twiml()
}

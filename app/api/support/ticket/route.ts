// POST /api/support/ticket — "Contact support" on the Support Center (2026-10-07).
//
// A ticket is an EMAIL conversation in June's inbox with no Gmail thread yet:
//   1. agent_conversations row (channel 'email', page 'support', contact_email)
//   2. the customer's message as role 'user'
//   3. June drafts a reply → role 'draft', status 'needs_teddy'
//   4. owner push
// Teddy approves/edits the draft in Admin → Inbox exactly like an email; the
// first send starts the Gmail thread (see app/api/admin/inbox/[id]/draft) and
// the customer's reply threads back in through the email poller.
// Nothing is sent to the customer without approval.
//
// Signed-in members: name/email come from the account. Guests: must give both;
// rate-limited by IP.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { runJune, juneConfigured, type JuneTurn } from '@/lib/agent/june'
import { demarkdownLinks } from '@/lib/agent/email-send'
import { sendOwnerPush } from '@/lib/push'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TOPICS = ['Booking', 'Door code / getting in', 'Payment or receipt', 'Cancellation or credit', 'Plus membership', 'Account or sign-in', 'App', 'Directory or castings', 'Something else']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as any))
  const topic = TOPICS.includes(String(b.topic)) ? String(b.topic) : 'Something else'
  const subject = String(b.subject ?? '').trim().slice(0, 120)
  const message = String(b.message ?? '').trim().slice(0, 5000)
  if (!subject) return NextResponse.json({ error: 'Add a short subject.' }, { status: 400 })
  if (message.length < 10) return NextResponse.json({ error: 'Tell us a little more so we can help.' }, { status: 400 })

  const { data: { user } } = await createClient().auth.getUser()

  let name = '', email = ''
  if (user) {
    email = (user.email ?? '').toLowerCase()
    const { data: prof } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
    name = prof?.full_name || ''
  } else {
    name = String(b.name ?? '').trim().slice(0, 80)
    email = String(b.email ?? '').trim().toLowerCase().slice(0, 200)
    if (!name) return NextResponse.json({ error: 'Add your name.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Add a valid email so we can reply.' }, { status: 400 })

  // Abuse guard: tickets land in Teddy's inbox and cost a June draft each.
  const rl = await rateLimit(user ? `ticket:u:${user.id}` : `ticket:ip:${clientIp(req)}`, user ? 6 : 3, 60 * 60_000, {
    message: 'You’ve sent a few requests already. We’ll get back to you soon, or text (832) 408-1631 if it’s urgent.',
  })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  const fullSubject = `Support: ${subject}`
  const { data: convo, error: cErr } = await service.from('agent_conversations').insert({
    token: `ticket-${randomUUID()}`,
    channel: 'email',
    status: 'needs_teddy',
    contact_email: email,
    visitor_email: email,
    visitor_name: name || null,
    auth_user_id: user?.id ?? null,
    subject: fullSubject,
    page: 'support',
  }).select('id').single()
  if (cErr || !convo) {
    console.error('[support/ticket] create failed:', cErr)
    return NextResponse.json({ error: 'Could not send your request. Please text (832) 408-1631.' }, { status: 500 })
  }
  const ref = convo.id.slice(0, 6).toUpperCase()

  const content = `[Support ticket #${ref}] Topic: ${topic}\nSubject: ${subject}\nFrom: ${name || 'Guest'} <${email}>${user ? ' (signed in)' : ' (guest)'}\n\n${message}`
  const { error: mErr } = await service.from('agent_messages').insert({ conversation_id: convo.id, role: 'user', content })
  if (mErr) {
    console.error('[support/ticket] message insert failed:', mErr)
    await service.from('agent_conversations').delete().eq('id', convo.id)
    return NextResponse.json({ error: 'Could not send your request. Please text (832) 408-1631.' }, { status: 500 })
  }

  // June drafts. A failure leaves the ticket in the inbox as needs_teddy with no
  // draft — Teddy still sees it and can write the reply himself.
  let drafted = false
  if (juneConfigured()) {
    try {
      const history: JuneTurn[] = [{ role: 'user', content } as JuneTurn]
      const result = await runJune({
        supabase: service,
        conversationId: convo.id,
        history,
        authUserId: user?.id ?? null,
        visitorName: name || null,
        page: `support-ticket:${topic}`,
      })
      const { error: dErr } = await service.from('agent_messages').insert({
        conversation_id: convo.id, role: 'draft', content: demarkdownLinks(result.reply),
      })
      if (dErr) console.error('[support/ticket] draft insert failed:', dErr)
      else drafted = true
    } catch (e) {
      console.error('[support/ticket] June draft error:', e)
    }
  }

  await sendOwnerPush({
    title: `🎫 Support ticket #${ref}`,
    body: `${name || email} · ${topic}: ${subject}${drafted ? ' — June drafted a reply' : ''}`,
    url: '/admin/inbox',
    tag: `ticket-${convo.id}`,
  }).catch(() => {})

  return NextResponse.json({ ok: true, ref, email })
}

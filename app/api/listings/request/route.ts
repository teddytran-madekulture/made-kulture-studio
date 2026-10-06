// POST /api/listings/request { listingId, date: 'YYYY-MM-DD', note? }
// A member requests a Production Services listing (migration 135). Server-side
// so it can (a) confirm the listing is real and active, (b) post the request
// into the 1:1 directory conversation, and (c) email the vendor EVERY time —
// the normal message email is throttled to once per 3h per conversation,
// which would silently swallow a second request. (2026-10-03)
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { sendListingRequestEmail } from '@/lib/email'
import { sendMemberPush } from '@/lib/member-push'
import { sendListingRequestSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function dateLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to send a request.' }, { status: 401 })

  const b = await req.json().catch(() => ({} as any))
  const listingId = String(b.listingId || '')
  const date = String(b.date || '')
  const note = String(b.note || '').trim().slice(0, 1500)
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return NextResponse.json({ error: 'Invalid listing.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick the date you need it.' }, { status: 400 })

  // Same members-only rule as messaging: the requester must be listed.
  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'send requests')

  // 2026-10-06: emails + texts to the vendor were unthrottled.
  const perListing = await rateLimit(`listreq:${user.id}:${listingId}`, 3, 60 * 60_000)
  const perSender  = perListing.allowed ? await rateLimit(`listreq:${user.id}`, 10, 60 * 60_000) : perListing
  if (!perListing.allowed || !perSender.allowed) return NextResponse.json({ error: 'You have sent a lot of requests recently — give the vendor a chance to reply, then try again later.' }, { status: 429 })

  const { data: listing, error: lErr } = await service.from('service_listings')
    .select('id, user_id, title, rate, price_extras, active, review_hold').eq('id', listingId).maybeSingle()
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  if (!listing || !listing.active || listing.review_hold) return NextResponse.json({ error: 'That listing is no longer available.' }, { status: 404 })
  if (listing.user_id === user.id) return NextResponse.json({ error: "That's your own listing." }, { status: 400 })
  if (!(await memberAccess(service, listing.user_id)).listed) return NextResponse.json({ error: 'That listing is no longer available.' }, { status: 404 })

  // Get or create the 1:1 conversation (same shape as /api/messages/start).
  const [a, bId] = [user.id, listing.user_id].sort()
  let convId: string | null = null
  const { data: existing } = await service.from('conversations').select('id').eq('user_a', a).eq('user_b', bId).maybeSingle()
  if (existing) convId = existing.id
  else {
    const { data: created, error } = await service.from('conversations').insert({ user_a: a, user_b: bId }).select('id').single()
    if (created) convId = created.id
    else {
      const { data: again } = await service.from('conversations').select('id').eq('user_a', a).eq('user_b', bId).maybeSingle()
      if (!again) return NextResponse.json({ error: error?.message || 'Could not start a conversation.' }, { status: 500 })
      convId = again.id
    }
  }

  const label = dateLabel(date)
  const text = [`REQUEST: ${listing.title}`, `Date: ${label}`, listing.rate ? `Listed rate: ${listing.rate}${listing.price_extras ? ` (${listing.price_extras})` : ''}` : '', note ? `\n${note}` : '']
    .filter(Boolean).join('\n').slice(0, 2000)
  const { error: mErr } = await service.from('messages').insert({ conversation_id: convId, sender_id: user.id, body: text }).select('id').single()
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  // Requester has seen their own message.
  const meCol = a === user.id ? 'last_read_a' : 'last_read_b'
  await service.from('conversations').update({ [meCol]: new Date().toISOString() }).eq('id', convId)

  // Email the vendor — unthrottled, but respects their notify_email opt-out.
  // A failure is reported back (emailed: false), never swallowed into a fake success.
  let emailed = false
  try {
    const [{ data: vendorProf }, { data: senderProf }, { data: authUser }] = await Promise.all([
      service.from('customer_profiles').select('notify_email, notify_sms, phone').eq('id', listing.user_id).maybeSingle(),
      service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle(),
      service.auth.admin.getUserById(listing.user_id),
    ])
    const to = authUser?.user?.email
    if (to && vendorProf?.notify_email !== false) {
      await sendListingRequestEmail({ to, fromName: senderProf?.full_name || 'A member', listingTitle: listing.title, dateLabel: label, note, conversationId: convId! })
      emailed = true
      // Counts as their message notification, so a follow-up chat line right
      // after doesn't send a second "new message" email on top of this one.
      const vCol = a === listing.user_id ? 'notified_a_at' : 'notified_b_at'
      await service.from('conversations').update({ [vCol]: new Date().toISOString() }).eq('id', convId)
    }
    // Text the vendor too, if they opted in (Vendor Agreement step or
    // Settings -> Directory & notifications). Unthrottled, like the email.
    if (vendorProf?.notify_sms === true && vendorProf?.phone) {
      await sendListingRequestSMS(vendorProf.phone, senderProf?.full_name || 'A member', listing.title, label, convId!)
    }
  } catch (e) {
    console.error('[listings/request] vendor email failed:', e)
  }

  // App push to the vendor (migration 137). Non-fatal; email above is the
  // guaranteed channel.
  const { data: sp } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
  const pushed = await sendMemberPush(listing.user_id, { title: `Request: ${listing.title}`, body: `${sp?.full_name || 'A member'} · ${label}${note ? ` · ${note.slice(0, 80)}` : ''}`, url: `/account/messages/${convId}`, tag: `msg-${convId}` })

  return NextResponse.json({ conversationId: convId, emailed, pushed })
}

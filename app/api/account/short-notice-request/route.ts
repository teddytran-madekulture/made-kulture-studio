import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { shortNoticeActive, shortNoticeViewActive, shortNoticeExpiresAtMs } from '@/lib/short-notice'
import { shortNoticeQuoteCents, SET_MIN_HOURS } from '@/lib/booking-core'
import { Client, Environment } from 'square'
import { sendShortNoticeRequestAlert } from '@/lib/email'
import { sendOwnerSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

function fmtHour(h: number): string {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  return `${hr % 12 === 0 ? 12 : hr % 12}:${mn}${hr >= 12 ? 'PM' : 'AM'}`
}

// The studio closes at 10pm; a request cannot ask for a session that runs past
// it. Mirrors CLOSE_HOUR in app/book/BookClient.tsx.
const CLOSE_HOUR = 22

// Verify a card id actually belongs to THIS signed-in customer before recording
// it as the one to charge.
//
// ⚠️ Without this, a request body could name any Square card id in the account
// and approval would charge a stranger's card on this member's say-so. Checkout
// re-verifies the same way (see BookClient's card-on-file picker) — identity for
// a card always comes from the session, never from what was posted.
async function cardBelongsToSession(supabase: any, userId: string, cardId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('customer_profiles').select('square_customer_id').eq('id', userId).maybeSingle()
  if (!profile?.square_customer_id) return false
  try {
    const square = new Client({
      accessToken: process.env.SQUARE_ACCESS_TOKEN!,
      environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
    })
    const res = await square.cardsApi.listCards(undefined, profile.square_customer_id)
    return (res.result.cards ?? []).some(c => c.id === cardId && c.enabled)
  } catch (e) {
    // A Square outage must not silently downgrade this to "trusted". No card
    // recorded means approval falls to the payment link, which is the safe side.
    console.error('[short-notice-request] card verify failed:', e)
    return false
  }
}

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

// GET — latest request status for the logged-in customer (drives the dashboard
// button), or a PRICE QUOTE when ?set=&hours= are supplied.
export async function GET(req: NextRequest) {
  const c = await currentCustomer()
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Quote mode. The price the customer consents to is computed HERE, not in the
  // browser — it is the same figure the approval charges, and two independent
  // calculations of one number is how they end up disagreeing. It also carries
  // this customer's own rate overrides, which the browser has no business knowing.
  const qSet   = req.nextUrl.searchParams.get('set')
  const qHours = Number(req.nextUrl.searchParams.get('hours'))
  if (qSet && Number.isFinite(qHours) && qHours > 0) {
    return NextResponse.json({
      cents:    shortNoticeQuoteCents(qSet, qHours, c.overrides),
      minHours: SET_MIN_HOURS[qSet] ?? 1,
    })
  }
  const canView = shortNoticeViewActive(c.overrides)
  const canBook = shortNoticeActive(c.overrides)
  const expiresAt = shortNoticeExpiresAtMs(c.overrides) // ms epoch of the active timed window, or null
  let latest = null
  if (c.id || c.email) {
    const q = service.from('short_notice_requests').select('status, requested_at, granted_until, resolved_at').order('requested_at', { ascending: false }).limit(1)
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

  // ⚠️ One live request per person — but a SECOND ask REPLACES the first rather
  // than being swallowed. It used to return ok and record nothing, so a customer
  // who changed their mind from 3pm to 7pm was silently still asking for 3pm.
  const dupQ = service.from('short_notice_requests').select('id, approve_token').eq('status', 'pending').limit(1)
  const { data: dup } = c.id ? await dupQ.eq('customer_id', c.id) : await dupQ.eq('customer_email', c.email)
  const existing = dup && dup.length ? dup[0] : null

  const body = await req.json().catch(() => ({} as any))

  // Set, date, and time are all required so the studio knows exactly what the
  // customer intends to book before approving a short-notice window.
  const desiredSet  = typeof body.desiredSet === 'string' ? body.desiredSet.trim() : ''
  const desiredDate = typeof body.desiredDate === 'string' ? body.desiredDate.trim() : ''
  const desiredStart = (body.desiredStart != null && !isNaN(Number(body.desiredStart))) ? Number(body.desiredStart) : null
  if (!desiredSet)                              return NextResponse.json({ error: 'Please choose the set you want.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) return NextResponse.json({ error: 'Please choose the date you want.' }, { status: 400 })
  if (desiredStart == null)                     return NextResponse.json({ error: 'Please choose the time you want.' }, { status: 400 })

  // ── Auto-pay consent (optional) ─────────────────────────────────────
  // A request that carries a LENGTH can be priced, and a priced request can be
  // charged the moment it is approved. One that does not is a pre-auto-pay
  // request (the account-page form still sends these) and approval simply
  // unlocks them to book it themselves — exactly as it did before.
  const minHours = SET_MIN_HOURS[desiredSet] ?? 1
  const rawHours = Number(body.desiredHours)
  const wantsAutoPay = Number.isFinite(rawHours) && rawHours > 0
  let desiredHours: number | null = null
  let quotedCents:  number | null = null
  let squareCardId: string | null = null
  let consentedAt:  string | null = null

  if (wantsAutoPay) {
    if (rawHours % 0.5 !== 0)      return NextResponse.json({ error: 'Sessions run in 30-minute increments.' }, { status: 400 })
    if (rawHours < minHours)       return NextResponse.json({ error: `That set has a ${minHours}-hour minimum.` }, { status: 400 })
    if (desiredStart + rawHours > CLOSE_HOUR) {
      return NextResponse.json({ error: 'That would run past closing (10pm). Try a shorter session or an earlier start.' }, { status: 400 })
    }
    // Consent is the whole basis for charging without them present. No consent,
    // no stored card and no quote — the request degrades to the old unlock flow
    // rather than half-arming an auto-charge.
    if (body.consent !== true) {
      return NextResponse.json({ error: 'Please confirm you agree to be charged if this is approved.' }, { status: 400 })
    }
    desiredHours = rawHours
    quotedCents  = shortNoticeQuoteCents(desiredSet, rawHours, c.overrides)
    consentedAt  = new Date().toISOString()

    const cardId = typeof body.squareCardId === 'string' ? body.squareCardId.trim() : ''
    if (cardId) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      // Unverifiable card → record NOTHING and let approval send a payment link.
      // Recording it anyway would mean approving charges a card we could not
      // confirm is theirs.
      if (user && await cardBelongsToSession(supabase, user.id, cardId)) squareCardId = cardId
      else console.warn('[short-notice-request] card id not verified for session — falling back to payment link')
    }
  }

  // Resolve a human-readable set name for the owner alert (falls back to slug).
  const { data: setRow } = await service.from('sets').select('name').eq('slug', desiredSet).maybeSingle()
  const desiredSetName = setRow?.name || desiredSet

  // Reuse the existing token when replacing, so an approval link already sitting
  // in the owner's texts still resolves — to the UPDATED time, not a dead row.
  const token = existing?.approve_token || randomBytes(20).toString('hex')
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
    desired_hours:  desiredHours,
    quoted_cents:   quotedCents,
    square_card_id: squareCardId,
    consented_at:   consentedAt,
    // A replacement request is a fresh ask: any hold or booking the PREVIOUS
    // version produced must not stay attached to it, or approval would think it
    // had already been fulfilled and refuse to do anything.
    hold_expires_at: null,
    booking_id:      null,
  }
  const { error } = existing
    ? await service.from('short_notice_requests').update(row).eq('id', existing.id)
    : await service.from('short_notice_requests').insert(row)
  // ⚠️ supabase-js does not throw on a Postgres error — read `error` or a failed
  // write returns "request sent" to a customer whose request does not exist.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approveUrl = `${APP_URL}/short-notice/approve/${token}`
  // Notify the owner — non-fatal if either channel fails.
  const verb = existing ? 'CHANGED their request to' : 'Short-notice request from'
  await Promise.allSettled([
    sendShortNoticeRequestAlert({ customerName: c.name, customerEmail: c.email, desiredSetName, desiredDate: row.desired_date, desiredStart: row.desired_start, note: row.note, approveUrl }),
    // The text carries the money now: length and price, so the decision can be
    // made from the notification without opening anything.
    sendOwnerSMS([
      existing ? `🔁 ${c.name} ${verb}` : `🔔 ${verb} ${c.name} —`,
      `${desiredSetName} on ${row.desired_date}`,
      desiredStart != null ? `at ${fmtHour(desiredStart)}` : '',
      desiredHours ? `for ${desiredHours} hr` : '',
      quotedCents ? `· $${(quotedCents / 100).toFixed(2)}${squareCardId ? ' (card on file)' : ' (no card — link)'}` : '',
      `\nApprove: ${approveUrl}`,
    ].filter(Boolean).join(' ')),
  ])

  return NextResponse.json({ ok: true, status: 'pending', replaced: !!existing })
}

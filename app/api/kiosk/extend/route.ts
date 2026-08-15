// POST /api/kiosk/extend
//
// "Can I keep the room a bit longer?" asked from the tablet bolted to the wall,
// rather than from the 15-minute wrap-up text.
//
// The text already answers this (see app/api/cron/session-reminder) — it warns
// when the set is booked behind them and offers the hour when it is not. This
// route is the same offer on the surface they are actually looking at, for the
// guest whose phone is in a bag across the room, and for the ~7% with no number
// on file at all.
//
// ⚠️ The tablet sends only its SET, never a booking id — the server re-derives
// who is in the room, exactly like /api/kiosk/checkin. A forged request can at
// worst buy time for whoever is genuinely booked there.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { findActiveBookingBySet, createExtensionRequest, normalizeHours, durationLabel } from '@/lib/extensions'
import { sendSMS, toE164 } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

function keyOk(key: string | null): boolean {
  const required = process.env.KIOSK_KEY
  if (!required) return true
  return key === required
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { /* handled by the checks below */ }

  if (!keyOk(body?.key ?? null)) {
    return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })
  }

  const setSlug = typeof body?.set === 'string' ? body.set : ''
  if (!setSlug) {
    return NextResponse.json({ error: 'This tablet is not assigned to a set.' }, { status: 400 })
  }

  const hours = normalizeHours(body?.hours)
  if (hours == null) {
    return NextResponse.json({ error: 'Pick between 30 minutes and 12 hours.' }, { status: 400 })
  }

  const occ = await findActiveBookingBySet(setSlug)
  if (occ.kind === 'none' || !occ.bookingId) {
    return NextResponse.json({ error: 'No session is running on this set right now.' }, { status: 409 })
  }

  // Buyouts and off-hours ends are a conversation with a person, not a price.
  if (!occ.extendable) {
    return NextResponse.json({
      error: occ.buyout
        ? 'Full-studio bookings are extended by the team - tap GET THE TEAM.'
        : 'This one needs a person - tap GET THE TEAM and we will sort it out.',
    }, { status: 409 })
  }

  const headroom = occ.headroomHours ?? 0
  if (hours > headroom) {
    return NextResponse.json({
      error: headroom >= 0.5
        ? `Only ${durationLabel(headroom)} is available on this set.`
        : 'There is no more time available on this set.',
    }, { status: 409 })
  }

  // allowNoCard: an Acuity guest has no website account and often no saved card.
  // The confirm page takes a keyed card (tokenized by Square in their browser),
  // so refusing here would shut out most of the people standing at the tablet.
  const made = await createExtensionRequest(occ.bookingId, hours, {
    kind: 'extend',
    allowNoCard: true,
    createdBy: 'kiosk',
    ttlMs: 20 * 60 * 1000,
  })
  if ('error' in made) {
    return NextResponse.json({ error: made.error }, { status: 409 })
  }

  const url = `${APP_URL}/extend/${made.token}`

  // Text it AS WELL AS offering the tap. A link on the guest's own device is the
  // only way to key a card in without typing it on a wall-mounted screen.
  let smsSent = false
  const db = supabaseAdmin()
  const { data: bk } = await db
    .from('bookings')
    .select('customers ( phone )')
    .eq('id', occ.bookingId)
    .maybeSingle()
  const cust = Array.isArray((bk as any)?.customers) ? (bk as any).customers[0] : (bk as any)?.customers
  const phone = toE164(cust?.phone)
  if (phone) {
    // ⚠️ sendSMS swallows Twilio errors by design, so this flag means "we had a
    // number and tried", NOT "it arrived". The tablet must not promise delivery.
    await sendSMS(
      phone,
      `Made Kulture: add ${durationLabel(hours)} on ${made.setName} for $${(made.priceCents / 100).toFixed(2)}. Confirm here: ${url}`,
    ).catch(() => {})
    smsSent = true
  }

  return NextResponse.json({
    token: made.token,
    priceCents: made.priceCents,
    setName: made.setName,
    hasCardOnFile: made.hasCardOnFile,
    durationLabel: durationLabel(hours),
    url,
    smsSent,
  })
}

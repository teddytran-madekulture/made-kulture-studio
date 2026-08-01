import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createExtensionRequest, planExtension, durationLabel, normalizeHours, type ExtensionKind } from '@/lib/extensions'
import { sendSMS, toE164 } from '@/lib/sms'

// POST /api/admin/bookings/[id]/extension
//
// The admin trigger for the confirm-and-pay flow that already existed but could
// only be started by June at the kiosk or by the wrap-up cron. Mints the request
// and texts the guest a link to their own phone; NOTHING is charged here.
//
// The customer's tap on that link is what charges the card and (for 'extend')
// moves end_time — see app/api/extensions/[token]/route.ts. That separation is
// deliberate: a charge the guest agreed to on their own phone is a very
// different conversation from one that just appeared on their statement.
//
// kind:
//   'extend'  — buying time that hasn't happened yet; end_time moves forward on
//               confirm, so the set being booked behind them blocks it.
//   'overage' — time they already used; charged, booking window untouched.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch { /* empty body → validation below */ }

  const kind: ExtensionKind = body.kind === 'overage' ? 'overage' : 'extend'
  const hours = normalizeHours(body.hours)
  if (hours == null) {
    return NextResponse.json({ error: 'Pick between 30 minutes and 12 hours, in half-hour steps.' }, { status: 400 })
  }

  // Price it first so a failure explains itself before anything is written.
  const plan = await planExtension(params.id, hours, kind)
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: 400 })
  if (plan.conflict) {
    return NextResponse.json({
      error: 'The set is booked right after this session, so the booking can’t be extended. Charge it as overtime instead — that bills the time without moving their end time.',
    }, { status: 409 })
  }

  const phone = toE164(plan.customerPhone)
  if (!phone) {
    return NextResponse.json({ error: 'No usable phone number on this booking — charge the card directly instead.' }, { status: 400 })
  }

  // 2 hours: the guest may already have left, and an overtime text they open on
  // the drive home should still work.
  const created = await createExtensionRequest(params.id, hours, {
    kind,
    ttlMs: 2 * 60 * 60 * 1000,
    allowNoCard: true,   // no card → the confirm page shows a card field
    createdBy: 'admin',
  })
  if ('error' in created) return NextResponse.json({ error: created.error }, { status: 400 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
  const link = `${appUrl}/extend/${created.token}`
  const amount = `$${(created.priceCents / 100).toFixed(2)}`
  const dur = durationLabel(hours)
  const firstName = plan.customerName?.split(' ')[0] || 'there'
  const payLine = created.hasCardOnFile
    ? 'Confirm & pay (card on file):'
    : 'Confirm & pay:'

  const message = kind === 'overage'
    ? [
        `Made Kulture: hi ${firstName} — your session on ${plan.setName} ran over, so there's ${dur} of extra studio time to settle: ${amount}.`,
        ``,
        `${payLine} ${link}`,
        ``,
        `Nothing is charged unless you confirm. Questions? Text (832) 408-1631.`,
      ].join('\n')
    : [
        `Made Kulture: hi ${firstName} — add ${dur} on ${plan.setName} for ${amount}?`,
        ``,
        `${payLine} ${link}`,
        ``,
        `Nothing is charged unless you confirm. Questions? Text (832) 408-1631.`,
      ].join('\n')

  // sendSMS swallows Twilio errors by design, so the admin gets the link back
  // either way and can paste it manually if the text never lands.
  await sendSMS(phone, message)

  return NextResponse.json({
    success: true,
    kind,
    hours,
    durationLabel: dur,
    amount: created.priceCents / 100,
    url: link,
    hasCardOnFile: created.hasCardOnFile,
    sentTo: `••••${phone.slice(-4)}`,
  })
}

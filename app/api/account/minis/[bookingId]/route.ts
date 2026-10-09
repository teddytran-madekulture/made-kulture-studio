// GET /api/account/minis/[bookingId] — setup + roster for one of MY bookings.
// PUT                                 — create or change the Mini Sessions setup.
//
// ⚠️ Slot length and break can't change once anyone is booked: slots are
// indexes into the booking, so changing the grid would silently move people.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadForOwner, guestSettings, rosterView, shareUrl, photographerName, settleLinkStatus, feeCentsFor } from '@/lib/mini-sessions-server'
import { cardBelongsToUser } from '@/lib/card-verify'
import { cleanText, maxParty, partyRoom, headcountLimit, extrasFor, slotsFor, signupsClosed, DEFAULTS, fmtDay, fmtTime } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(_req: NextRequest, { params }: { params: { bookingId: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = supabaseAdmin()
  const r = await loadForOwner(db, user, params.bookingId)
  if (!r.ok) return NextResponse.json({ error: (r as any).error }, { status: (r as any).status })
  const { booking: b, clients } = r
  const mini = r.mini ? await settleLinkStatus(db, r.mini) : null
  const gs = await guestSettings(db)
  const limit = headcountLimit(b, gs)
  const room = mini ? partyRoom(b, mini, gs) : null
  return NextResponse.json({
    booking: {
      id: b.id, start_time: b.start_time, end_time: b.end_time, status: b.status,
      place: b.set_id ? (b.sets?.name ?? 'Set') : 'Full warehouse', isBuyout: !b.set_id,
      day: fmtDay(b.start_time), time: `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`,
      over: Date.parse(b.end_time) < Date.now(),
    },
    limit,
    hardLimit: b.set_id ? gs.maxPerSet : limit,
    extraFee: mini && mini.extra_fee_cents != null ? feeCentsFor(mini, gs) / 100 : gs.extraFee,
    photographer: await photographerName(db, b, user.id),
    mini: mini && {
      ...mini,
      shareUrl: shareUrl(mini),
      signupsClosed: signupsClosed(b, mini),
      maxParty: room!.max,
      includedParty: room!.included,
      extra_card_id: mini.extra_card_id ? '•' : null,  // never echo card ids back; the page only needs "set"
      extra_square_customer_id: undefined, extra_payment_id: undefined,
    },
    roster: mini ? rosterView(b, mini, clients, gs) : null,
  })
}

export async function PUT(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = supabaseAdmin()
  const r = await loadForOwner(db, user, params.bookingId)
  if (!r.ok) return NextResponse.json({ error: (r as any).error }, { status: (r as any).status })
  const { booking: b, mini, clients } = r
  if (b.status === 'cancelled') return NextResponse.json({ error: 'This booking is cancelled.' }, { status: 400 })
  if (b.status !== 'confirmed') return NextResponse.json({ error: 'Mini Sessions opens once this booking is paid and confirmed.' }, { status: 400 })
  if (Date.parse(b.end_time) < Date.now()) return NextResponse.json({ error: 'This booking is already over.' }, { status: 400 })

  const body = await req.json().catch(() => ({} as any))
  const int = (v: any, d: number) => (v === undefined || v === null || v === '' ? d : Math.round(Number(v)))
  const row = {
    title: cleanText(body.title ?? mini?.title, 80),
    note: body.note === undefined ? (mini?.note ?? null) : (String(body.note ?? '').trim().slice(0, 600) || null),
    price_text: cleanText(body.price_text ?? mini?.price_text, 80),
    slot_minutes: int(body.slot_minutes, mini?.slot_minutes ?? DEFAULTS.slot_minutes),
    break_minutes: int(body.break_minutes, mini?.break_minutes ?? DEFAULTS.break_minutes),
    crew_count: int(body.crew_count, mini?.crew_count ?? DEFAULTS.crew_count),
    cutoff_hours: int(body.cutoff_hours, mini?.cutoff_hours ?? DEFAULTS.cutoff_hours),
    approve_switches: body.approve_switches === undefined ? (mini?.approve_switches ?? false) : !!body.approve_switches,
    allow_extra_guests: body.allow_extra_guests === undefined ? (mini?.allow_extra_guests ?? false) : !!body.allow_extra_guests,
  }
  if (!(row.slot_minutes >= 5 && row.slot_minutes <= 240)) return NextResponse.json({ error: 'Slots can be 5 minutes to 4 hours.' }, { status: 400 })
  if (!(row.break_minutes >= 0 && row.break_minutes <= 60)) return NextResponse.json({ error: 'The break can be 0 to 60 minutes.' }, { status: 400 })
  if (!(row.cutoff_hours >= 0 && row.cutoff_hours <= 168)) return NextResponse.json({ error: 'Sign-ups can close 0 to 168 hours before.' }, { status: 400 })
  if (!(row.crew_count >= 1)) return NextResponse.json({ error: 'Crew includes you, so at least 1.' }, { status: 400 })

  const gs = await guestSettings(db)
  const limit = headcountLimit(b, gs)
  const included = maxParty(limit, row.crew_count)
  const room = partyRoom(b, row, gs).max
  if (included < 1) {
    return NextResponse.json({ error: `This booking allows ${limit} people at once, so a crew of ${row.crew_count} leaves no room for a client.` }, { status: 400 })
  }
  if (slotsFor(b, row).length < 1) return NextResponse.json({ error: 'That slot length is longer than your booking.' }, { status: 400 })

  // Once the session starts, nothing that changes the headcount math can move:
  // extra guests are billed from it afterwards.
  if (mini && Date.parse(b.start_time) <= Date.now() && (
    row.crew_count !== mini.crew_count || row.allow_extra_guests !== mini.allow_extra_guests ||
    row.slot_minutes !== mini.slot_minutes || row.break_minutes !== mini.break_minutes)) {
    return NextResponse.json({ error: 'Your session has started, so crew, slot length and bigger groups are locked.' }, { status: 400 })
  }

  const booked = clients.filter(c => c.status === 'booked')
  if (mini && booked.length) {
    if (row.slot_minutes !== mini.slot_minutes || row.break_minutes !== mini.break_minutes) {
      return NextResponse.json({ error: 'Clients are already booked, so slot length and break are locked. Move or remove them first.' }, { status: 400 })
    }
    const tooBig = booked.filter(c => c.party_size > room)
    if (tooBig.length) {
      return NextResponse.json({ error: `A crew of ${row.crew_count} leaves room for parties of ${room}, but ${tooBig.map(c => c.name || 'a client').join(', ')} booked more. Adjust them first.` }, { status: 400 })
    }
    if (mini.allow_extra_guests && !row.allow_extra_guests && booked.some(c => extrasFor(c.party_size, included) > 0)) {
      return NextResponse.json({ error: 'Some clients are already bringing extra guests, so bigger groups can’t be turned off. Adjust them first.' }, { status: 400 })
    }
  }

  // Bigger groups are billed to a card — it must be THIS photographer's own,
  // checked against their Square profile, never taken on trust from the request.
  let cardFields: Record<string, any> = {}
  if (row.allow_extra_guests && b.set_id) {
    const cardId = body.extra_card_id ? String(body.extra_card_id) : null
    if (cardId) {
      if (!(await cardBelongsToUser(db, user.id, cardId))) return NextResponse.json({ error: 'That card isn’t on your account. Pick another or add one in Payment Methods.' }, { status: 400 })
      const { data: prof } = await db.from('customer_profiles').select('square_customer_id').eq('id', user.id).maybeSingle()
      cardFields = { extra_card_id: cardId, extra_square_customer_id: (prof as any)?.square_customer_id ?? null }
    } else if (!mini?.extra_card_id) {
      return NextResponse.json({ error: 'Pick the card to bill extra guests to.' }, { status: 400 })
    }
  }
  if (!b.set_id) row.allow_extra_guests = false   // a buyout already holds 30
  // The fee is agreed when bigger groups are turned on; a later admin change
  // applies to days set up after it, not to this one.
  if (row.allow_extra_guests && (!mini || mini.extra_fee_cents == null)) cardFields.extra_fee_cents = gs.extraFee * 100
  if (!row.allow_extra_guests && mini?.extra_fee_cents != null) cardFields.extra_fee_cents = null   // re-opting in takes the fee of the day

  const now = new Date().toISOString()
  // Blocked slots are indexes into the grid — a new grid means they point at
  // different times, so they're cleared rather than silently shifted.
  const gridChanged = !!mini && (row.slot_minutes !== mini.slot_minutes || row.break_minutes !== mini.break_minutes)
  const q = mini
    ? db.from('mini_sessions').update({ ...row, ...cardFields, ...(gridChanged ? { blocked_slots: [] } : {}), updated_at: now }).eq('id', mini.id).select('*')
    : db.from('mini_sessions').insert({ ...row, ...cardFields, booking_id: b.id, owner_user_id: user.id, announced_start: b.start_time }).select('*')
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nothing was saved.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

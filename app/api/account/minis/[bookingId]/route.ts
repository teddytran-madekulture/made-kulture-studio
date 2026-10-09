// GET /api/account/minis/[bookingId] — setup + roster for one of MY bookings.
// PUT                                 — create or change the Mini Sessions setup.
//
// ⚠️ Slot length and break can't change once anyone is booked: slots are
// indexes into the booking, so changing the grid would silently move people.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadForOwner, limitFor, rosterView, shareUrl, photographerName } from '@/lib/mini-sessions-server'
import { cleanText, maxParty, slotsFor, signupsClosed, DEFAULTS, fmtDay, fmtTime } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(_req: NextRequest, { params }: { params: { bookingId: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = supabaseAdmin()
  const r = await loadForOwner(db, user, params.bookingId)
  if (!r.ok) return NextResponse.json({ error: (r as any).error }, { status: (r as any).status })
  const { booking: b, mini, clients } = r
  const limit = await limitFor(db, b)
  return NextResponse.json({
    booking: {
      id: b.id, start_time: b.start_time, end_time: b.end_time, status: b.status,
      place: b.set_id ? (b.sets?.name ?? 'Set') : 'Full warehouse', isBuyout: !b.set_id,
      day: fmtDay(b.start_time), time: `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`,
      over: Date.parse(b.end_time) < Date.now(),
    },
    limit,
    photographer: await photographerName(db, b, user.id),
    mini: mini && {
      ...mini,
      shareUrl: shareUrl(mini),
      signupsClosed: signupsClosed(b, mini),
      maxParty: maxParty(limit, mini.crew_count),
    },
    roster: mini ? rosterView(b, mini, clients, limit) : null,
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
  }
  if (!(row.slot_minutes >= 5 && row.slot_minutes <= 240)) return NextResponse.json({ error: 'Slots can be 5 minutes to 4 hours.' }, { status: 400 })
  if (!(row.break_minutes >= 0 && row.break_minutes <= 60)) return NextResponse.json({ error: 'The break can be 0 to 60 minutes.' }, { status: 400 })
  if (!(row.cutoff_hours >= 0 && row.cutoff_hours <= 168)) return NextResponse.json({ error: 'Sign-ups can close 0 to 168 hours before.' }, { status: 400 })
  if (!(row.crew_count >= 1)) return NextResponse.json({ error: 'Crew includes you, so at least 1.' }, { status: 400 })

  const limit = await limitFor(db, b)
  const room = maxParty(limit, row.crew_count)
  if (room < 1) {
    return NextResponse.json({ error: `This booking allows ${limit} people at once, so a crew of ${row.crew_count} leaves no room for a client.` }, { status: 400 })
  }
  if (slotsFor(b, row).length < 1) return NextResponse.json({ error: 'That slot length is longer than your booking.' }, { status: 400 })

  const booked = clients.filter(c => c.status === 'booked')
  if (mini && booked.length) {
    if (row.slot_minutes !== mini.slot_minutes || row.break_minutes !== mini.break_minutes) {
      return NextResponse.json({ error: 'Clients are already booked, so slot length and break are locked. Move or remove them first.' }, { status: 400 })
    }
    const tooBig = booked.filter(c => c.party_size > room)
    if (tooBig.length) {
      return NextResponse.json({ error: `A crew of ${row.crew_count} leaves room for parties of ${room}, but ${tooBig.map(c => c.name || 'a client').join(', ')} booked more. Adjust them first.` }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  // Blocked slots are indexes into the grid — a new grid means they point at
  // different times, so they're cleared rather than silently shifted.
  const gridChanged = !!mini && (row.slot_minutes !== mini.slot_minutes || row.break_minutes !== mini.break_minutes)
  const q = mini
    ? db.from('mini_sessions').update({ ...row, ...(gridChanged ? { blocked_slots: [] } : {}), updated_at: now }).eq('id', mini.id).select('*')
    : db.from('mini_sessions').insert({ ...row, booking_id: b.id, owner_user_id: user.id, announced_start: b.start_time }).select('*')
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Nothing was saved.' }, { status: 500 })
  return NextResponse.json({ ok: true, mini: data[0] })
}

import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const OWNER_PHONE = '+18324081631'

const SELECT = `
  id, start_time, end_time, status, guest_count, arrived_guest_count,
  checked_in_at, checked_out_at, sets ( name ), customers ( name )
`
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })

// POST /api/desk/bookings/[id]/checkin  { action: 'check_in' | 'check_out', guests? }
// Staff-driven check-in/out — same arrival window + owner SMS as the self-serve
// kiosk, but attributed to the signed-in employee and written to the audit log.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'booking.checkin')
  if (g instanceof NextResponse) return g

  let body: { action?: string; guests?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const db = supabaseAdmin()
  const { data: b } = await db.from('bookings').select(SELECT).eq('id', params.id).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  if (b.status === 'cancelled') return NextResponse.json({ error: 'This booking was cancelled.' }, { status: 400 })

  const setName = (b.sets as any)?.name ?? 'Full Studio Takeover'
  const customer = b.customers as any
  const now = Date.now()
  const start = new Date(b.start_time).getTime()
  const end = new Date(b.end_time).getTime()

  if (body.action === 'check_in') {
    if (now < start - 3600_000) return NextResponse.json({ error: `Check-in opens at ${fmtTime(new Date(start - 3600_000).toISOString())}.` }, { status: 400 })
    if (now > end + 3600_000) return NextResponse.json({ error: 'This booking has already ended.' }, { status: 400 })

    const arrived = Math.floor(Number(body.guests) || 0) || null
    await db.from('bookings').update({
      checked_in_at: new Date().toISOString(),
      ...(arrived ? { arrived_guest_count: arrived } : {}),
    }).eq('id', b.id)

    await audit(g, 'booking.checkin', { entityType: 'booking', entityId: b.id, details: { arrived, by: 'desk' } })

    const over = arrived && b.guest_count && arrived > b.guest_count
    const guestLine = arrived ? `\n👥 ${arrived} here${over ? ` ⚠️ (booked ${b.guest_count})` : ''}` : ''
    twilioClient.messages.create({
      body: `✅ ARRIVED (desk: ${g.name}) — ${customer?.name ?? 'Guest'}\n📍 ${setName} · ${fmtTime(b.start_time)}–${fmtTime(b.end_time)}${guestLine}`,
      from: process.env.TWILIO_PHONE_NUMBER, to: OWNER_PHONE,
    }).catch(e => console.error('[desk checkin] SMS error:', e))

    return NextResponse.json({ success: true, checkedIn: true })
  }

  if (body.action === 'check_out') {
    if (!b.checked_in_at) return NextResponse.json({ error: 'Check in first.' }, { status: 400 })
    await db.from('bookings').update({ checked_out_at: new Date().toISOString() }).eq('id', b.id)
    await audit(g, 'booking.checkout', { entityType: 'booking', entityId: b.id, details: { by: 'desk' } })

    twilioClient.messages.create({
      body: `👋 CHECKED OUT (desk: ${g.name}) — ${customer?.name ?? 'Guest'}\n📍 ${setName} is now free.`,
      from: process.env.TWILIO_PHONE_NUMBER, to: OWNER_PHONE,
    }).catch(e => console.error('[desk checkout] SMS error:', e))

    return NextResponse.json({ success: true, checkedOut: true })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()

  // Fetch the booking — verify it belongs to this user
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, start_time, status, acuity_appointment_id, customer_email, auth_user_id')
    .eq('id', booking_id)
    .single()

  if (fetchError || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Verify ownership
  if (booking.auth_user_id !== user.id && booking.customer_email !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Enforce 48hr cancellation policy
  const startTime = new Date(booking.start_time)
  const hoursUntil = (startTime.getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursUntil < 48) {
    return NextResponse.json({ error: 'Cancellations must be made at least 48 hours in advance. No refund will be issued per our cancellation policy.' }, { status: 400 })
  }

  // Cancel in Acuity if we have an appointment ID
  if (booking.acuity_appointment_id) {
    const acuityRes = await fetch(
      `https://acuityscheduling.com/api/v1/appointments/${booking.acuity_appointment_id}/cancel`,
      {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noShow: false }),
      }
    )
    if (!acuityRes.ok) {
      const err = await acuityRes.text()
      console.error('Acuity cancel error:', err)
      // Continue anyway — update our DB
    }
  }

  // Update Supabase booking status
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', booking_id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

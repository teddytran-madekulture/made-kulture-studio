// POST /api/account/bookings/[id]/reschedule   { date: 'YYYY-MM-DD', startHour: number }
//
// Move an upcoming booking to a new start time, keeping the SAME booking, the
// same set, the same duration and the same price. Nothing about money moves.
//
// ⚠️ This route now does ONE thing: prove the signed-in user owns this booking.
// Every rule that follows — the 48-hour window, the Acuity refusal, opening
// hours, availability, self-exclusion, the door-code re-mint, the notifications
// — lives in lib/reschedule.ts, because a guest holding an emailed manage link
// (/api/manage/[token]) has to be held to exactly the same list. Two copies of
// that list is how one approval surface ends up with a rule the other lacks.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { rescheduleBooking, rescheduleFailed } from '@/lib/reschedule'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))

  // ── Authorization, and nothing else ──────────────────────────────────────
  // ⚠️ Ownership from the VERIFIED session, never a body field.
  const { data: owned, error: fetchErr } = await service
    .from('bookings')
    .select('id, auth_user_id, customers(email)')
    .eq('id', params.id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!owned) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const ownerEmail = (owned as any).customers?.email as string | undefined
  if (owned.auth_user_id !== user.id && ownerEmail !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await rescheduleBooking(service, {
    bookingId: params.id,
    date: typeof body.date === 'string' ? body.date.trim() : '',
    startHour: Number(body.startHour),
    via: 'account',
    // The SESSION email, preserving the identity the Plus / instant-book checks
    // used before this route was split.
    actorEmail: user.email ?? null,
  })

  // rescheduleFailed, not `!result.ok` — see the note on it in lib/reschedule.ts.
  if (rescheduleFailed(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    success: true,
    startISO: result.startISO,
    endISO: result.endISO,
    when: result.when,
    doorCode: result.doorCode,
    doorCodeBack: result.doorCodeBack,
  })
}

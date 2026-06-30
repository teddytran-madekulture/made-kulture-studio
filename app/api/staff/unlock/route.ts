import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getStaffFromRequest, verifySecret } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

// POST /api/staff/unlock  { pin }
// Dismiss the idle lock by re-entering the signed-in staff's quick-unlock PIN.
// The session cookie stays valid; this just confirms the same person is back.
export async function POST(req: NextRequest) {
  const staff = getStaffFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: { pin?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const pin = (body.pin ?? '').trim()
  if (!pin) return NextResponse.json({ error: 'Enter your PIN.' }, { status: 400 })

  const { data } = await supabaseAdmin()
    .from('staff_users').select('pin_hash').eq('id', staff.staffId).maybeSingle()
  if (!data?.pin_hash) {
    return NextResponse.json({ error: 'No PIN set on your account — sign out and back in, or set one in the staff console.' }, { status: 400 })
  }
  if (!verifySecret(pin, data.pin_hash)) {
    return NextResponse.json({ error: 'Wrong PIN.' }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}

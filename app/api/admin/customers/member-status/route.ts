// 2026-10-14: does this email have a website login (= member rate)? Used by the
// admin manual-booking form so a guest is pre-priced at the GUEST rate, the
// same way website checkout prices them. Before this the form always filled in
// the plain set rate, so a guest booked by hand paid the member price.
// Lookup only — the admin can still type any amount.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { findAuthUserIdByEmail } from '@/lib/auth-user'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const email = (req.nextUrl.searchParams.get('email') || '').trim()
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: row } = await db.from('studio_settings').select('value').eq('key', 'guest_surcharge_per_hour').maybeSingle()
  const guestSurchargePerHour = row?.value != null ? Number(row.value) : 10
  if (!email) return NextResponse.json({ isMember: null, guestSurchargePerHour })
  try {
    const id = await findAuthUserIdByEmail(db, email)
    return NextResponse.json({ isMember: !!id, guestSurchargePerHour })
  } catch (e: any) {
    // Unknown is NOT "guest" — the form falls back to the plain rate and says so.
    console.error('[member-status] lookup failed', e?.message)
    return NextResponse.json({ isMember: null, guestSurchargePerHour })
  }
}

// GET /api/admin/bookings/[id]/credit — the booking customer's studio credit, so
// Add charge can offer "use studio credit" for in-studio gear (migration 112).
// Credit lives on the ACCOUNT (auth user); an admin booking may only carry the
// customer's email, so fall back to matching it.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCreditBalance } from '@/lib/credits'
import { authUserIdForEmail, rewardPotForUser } from '@/lib/rewards'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const { data: b, error } = await db.from('bookings').select('auth_user_id, customers ( email )').eq('id', params.id).maybeSingle()
  if (error || !b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  const authUserId = b.auth_user_id ?? await authUserIdForEmail(db, (b.customers as any)?.email)
  if (!authUserId) return NextResponse.json({ authUserId: null, balanceCents: 0, rewardCents: 0 })
  const [balanceCents, pot] = await Promise.all([getCreditBalance(authUserId), rewardPotForUser(db, authUserId)])
  return NextResponse.json({ authUserId, balanceCents: Math.max(0, balanceCents), rewardCents: pot.rewardCents })
}

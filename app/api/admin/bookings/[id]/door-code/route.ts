// GET /api/admin/bookings/[id]/door-code
//
// The booking's CURRENT front + back door codes, for the SHOW button in the
// admin Booking Detail panel (2026-10-24).
//
// ⚠️ Deliberately its own call, never part of the bookings list: the dashboard
// list loads every booking at once, and live door codes don't belong in a
// payload that size, sitting in a phone's memory. One booking, on a tap.
// ⚠️ Read-only. It never mints — igloohome PINs cannot be revoked.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin()
    .from('bookings').select('id, status, door_code, door_code_back').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  return NextResponse.json(
    { front: (data as any).door_code ?? null, back: (data as any).door_code_back ?? null, status: (data as any).status },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

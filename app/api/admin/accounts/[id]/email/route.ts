import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { adminChangeEmail } from '@/lib/email-change'

export const dynamic = 'force-dynamic'

// POST /api/admin/accounts/<authUserId>/email { email }
// Change a member's LOGIN email from the admin (Recent Signups, Directory).
// For members with no customer record yet — they have a login but haven't
// booked, so the customer panel's EDIT INFO can't reach them. Same core as
// EDIT INFO (lib/email-change.ts): the customer record follows if one exists,
// the new address is marked confirmed, and a heads-up email goes to it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body?.email) return NextResponse.json({ error: 'Enter the new email.' }, { status: 400 })
  const r = await adminChangeEmail(supabaseAdmin(), { authUserId: params.id }, String(body.email))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 })
  return NextResponse.json({ ok: true, email: r.email })
}

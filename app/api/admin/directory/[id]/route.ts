import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH /api/admin/directory/<id>  { optedIn: boolean }
//
// ⚠️ THIS IS NOT JUST A VISIBILITY SWITCH. Both /api/directory and
// /api/directory/[id] gate BROWSING on the viewer's own `directory_opt_in` —
// opting out of being seen also opts you out of seeing. So turning this off
// removes the member from the roster AND revokes their access to it. The admin
// UI says so on the button; do not soften that wording without changing those
// two routes first.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  if (typeof body?.optedIn !== 'boolean') {
    return NextResponse.json({ error: 'optedIn must be true or false' }, { status: 400 })
  }

  // ⚠️ .select() the row back and check it: an update that matches no row is
  // NOT an error in supabase-js, it returns empty and reads as success — the
  // exact failure mode this project keeps getting bitten by.
  const { data, error } = await supabase
    .from('customer_profiles')
    .update({ directory_opt_in: body.optedIn })
    .eq('id', params.id)
    .select('id, directory_opt_in')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No profile with that id — nothing was changed.' }, { status: 404 })
  }

  return NextResponse.json({ id: data[0].id, optedIn: !!data[0].directory_opt_in })
}

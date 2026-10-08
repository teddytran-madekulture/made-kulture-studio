// DELETE /api/admin/marketing/[id] — remove a DRAFT campaign (2026-10-08).
//
// Teddy ended up with two copies of the launch email draft and there was no
// way to remove one from the admin. Only drafts can go: a sent or sending
// campaign carries the open/click/unsubscribe history that the stats and the
// do-not-email list point back to.
//
// ⚠️ A CLAIM, not a blind delete: the row must still be a draft at the moment
// of deletion (.eq('status','draft')), and we check a row actually came back —
// supabase-js reports no error when a delete matches nothing, so a campaign
// that started sending between the click and the request would otherwise look
// "deleted" while it kept going.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Bad id.' }, { status: 400 })

  const { data, error } = await supabaseAdmin()
    .from('marketing_campaigns')
    .delete()
    .eq('id', params.id)
    .eq('status', 'draft')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ error: 'Only drafts can be deleted, and this one is not a draft (or is already gone).' }, { status: 409 })
  }
  return NextResponse.json({ success: true })
}

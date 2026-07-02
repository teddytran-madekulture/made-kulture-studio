import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PATCH /api/castings/<id>/participants { userId, action } — author confirms,
// unconfirms, or removes a collaborator. action: confirm | unconfirm | remove.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: c } = await service.from('castings').select('author_id').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (c.author_id !== user.id) return NextResponse.json({ error: 'Only the author can manage collaborators.' }, { status: 403 })

  const { userId, action } = await req.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  if (action === 'remove') {
    const { error } = await service.from('casting_participants').delete()
      .eq('casting_id', params.id).eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'confirm' || action === 'unconfirm') {
    const { error } = await service.from('casting_participants')
      .update({ status: action === 'confirm' ? 'confirmed' : 'interested' })
      .eq('casting_id', params.id).eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { deleteAcuityBlocks } from '@/lib/acuity-sync'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, any> = {}

  if (body.status       !== undefined) updates.status       = body.status

  // If cancelling, remove any Acuity blocks this website booking created
  if (body.status === 'cancelled') {
    const { data: existing } = await supabase
      .from('bookings').select('acuity_block_ids').eq('id', params.id).single()
    const blockIds = Array.isArray(existing?.acuity_block_ids) ? existing!.acuity_block_ids : []
    if (blockIds.length) {
      await deleteAcuityBlocks(blockIds)
      updates.acuity_block_ids = []
    }
  }
  if (body.start_time   !== undefined) updates.start_time   = body.start_time
  if (body.end_time     !== undefined) updates.end_time     = body.end_time
  if (body.notes        !== undefined) updates.notes        = body.notes
  if (body.total_amount !== undefined) updates.total_amount = body.total_amount
  // Manual check-in / check-out (admin override). Pass ISO string or null.
  if (body.checked_in_at  !== undefined) updates.checked_in_at  = body.checked_in_at
  if (body.checked_out_at !== undefined) updates.checked_out_at = body.checked_out_at

  // Resolve set name to set_id
  if (body.setName !== undefined) {
    if (!body.setName || body.setName === 'Full Studio Takeover') {
      updates.set_id = null
    } else {
      const { data: setData } = await supabase
        .from('sets').select('id').eq('name', body.setName).single()
      updates.set_id = setData?.id ?? null
    }
  }

  const { error } = await supabase
    .from('bookings').update(updates).eq('id', params.id)

  if (error) {
    const isConflict = error.code === '23P01'
      || error.message?.includes('no_overlap')
      || error.message?.includes('conflicts')
    return NextResponse.json(
      { error: isConflict ? 'This time slot conflicts with another booking.' : error.message },
      { status: isConflict ? 409 : 500 }
    )
  }
  return NextResponse.json({ success: true })
}

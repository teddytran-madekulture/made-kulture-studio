import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/admin/customers/[id]/notes
// Body: { note: string, tag: 'general' | 'warning' | 'ban' | 'vip' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { note, tag = 'general' } = await req.json()
  if (!note?.trim()) return NextResponse.json({ error: 'Note is required' }, { status: 400 })

  const validTags = ['general', 'warning', 'ban', 'vip']
  if (!validTags.includes(tag)) return NextResponse.json({ error: 'Invalid tag' }, { status: 400 })

  const { data, error } = await supabase
    .from('customer_notes')
    .insert({ customer_id: params.id, note: note.trim(), tag })
    .select('id, note, tag, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note: data })
}

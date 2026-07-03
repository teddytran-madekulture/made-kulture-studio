// Admin — June's knowledge base. Edits take effect on her next message
// (the system prompt is rebuilt from agent_kb on every reply).

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/kb → all entries
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('agent_kb')
    .select('id, topic, content, enabled, updated_at')
    .order('topic')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}

// POST /api/admin/kb { topic, content } → new entry
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { topic, content } = await req.json()
  const t = String(topic ?? '').trim().slice(0, 80)
  const c = String(content ?? '').trim().slice(0, 4000)
  if (!t || !c) return NextResponse.json({ error: 'topic and content required' }, { status: 400 })
  const { data, error } = await supabase
    .from('agent_kb').insert({ topic: t, content: c }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data?.id })
}

// PATCH /api/admin/kb { id, topic?, content?, enabled? }
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, topic, content, enabled } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (topic !== undefined)   updates.topic   = String(topic).trim().slice(0, 80)
  if (content !== undefined) updates.content = String(content).trim().slice(0, 4000)
  if (enabled !== undefined) updates.enabled = !!enabled
  const { error } = await supabase.from('agent_kb').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/kb { id }
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('agent_kb').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

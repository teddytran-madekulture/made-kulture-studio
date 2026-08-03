// Admin — decide on one of June's pending knowledge proposals.
//
// POST /api/admin/kb/proposal { id, action: 'save' | 'dismiss', topic?, content? }
//
// This is the ONLY path from a proposal into agent_kb, and it requires an admin
// click. topic/content may be edited here, so Teddy can fix her wording without
// retyping the whole thing.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
// Supabase reads in a polled route go stale with force-dynamic alone.
export const fetchCache = 'force-no-store'

// GET /api/admin/kb/proposal?conversationId=… → the pending cards for a thread.
// Kept off the transcript route on purpose: proposals are additive, and a
// missing agent_kb_proposals table (migration 092 not run yet) must never be
// able to stop someone reading their mail.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('agent_kb_proposals')
    .select('id, mode, kb_id, topic, content, reason, source, created_at')
    .eq('conversation_id', conversationId).eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[kb proposal] list failed:', error.message)
    return NextResponse.json({ proposals: [], unavailable: true })
  }
  return NextResponse.json({ proposals: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? '').trim()
  const action = body?.action === 'dismiss' ? 'dismiss' : 'save'
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: prop, error: readErr } = await supabase
    .from('agent_kb_proposals')
    .select('id, mode, kb_id, topic, content, status')
    .eq('id', id).single()
  if (readErr || !prop) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (prop.status !== 'pending') {
    return NextResponse.json({ error: `Already ${prop.status}` }, { status: 409 })
  }

  const now = new Date().toISOString()

  if (action === 'dismiss') {
    await supabase.from('agent_kb_proposals')
      .update({ status: 'dismissed', decided_at: now }).eq('id', id)
    return NextResponse.json({ success: true, status: 'dismissed' })
  }

  // Teddy's edits in the card win over what June proposed.
  const topic = String(body?.topic ?? prop.topic).trim().slice(0, 80)
  const content = String(body?.content ?? prop.content).trim().slice(0, 4000)
  if (!topic || !content) return NextResponse.json({ error: 'topic and content required' }, { status: 400 })

  if (prop.mode === 'update' && prop.kb_id) {
    const { error } = await supabase.from('agent_kb')
      .update({ topic, content, updated_at: now }).eq('id', prop.kb_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // A topic key that already exists would leave June holding two rows on the
    // same subject and picking between them, so fold into the existing one.
    const { data: existing } = await supabase
      .from('agent_kb').select('id').eq('topic', topic).maybeSingle()
    if (existing?.id) {
      const { error } = await supabase.from('agent_kb')
        .update({ content, updated_at: now }).eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase.from('agent_kb').insert({ topic, content })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Only mark it saved once the KB write actually landed — otherwise a failed
  // write leaves a proposal that looks handled and a June who never learned it.
  await supabase.from('agent_kb_proposals')
    .update({ status: 'saved', topic, content, decided_at: now }).eq('id', id)

  return NextResponse.json({ success: true, status: 'saved' })
}

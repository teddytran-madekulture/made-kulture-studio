// Admin — coach June on a draft, and let her propose knowledge.
//
// POST /api/admin/inbox/[id]/coach
//   { mode: 'revise', instruction, draftId? }  → rewrite the draft in place
//   { mode: 'learn',  sentReply }              → nothing to rewrite, just learn
//
// Proposals are written as PENDING rows. This route never touches agent_kb —
// see lib/agent/coach.ts for why that separation is deliberate.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { runCoach, coachConfigured, type CoachTurn, type KbEntryLite } from '@/lib/agent/coach'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!coachConfigured()) {
    return NextResponse.json({ error: 'June is not configured (ANTHROPIC_API_KEY missing)' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const mode = body?.mode === 'learn' ? 'learn' : 'revise'
  const instruction = String(body?.instruction ?? '').trim().slice(0, 4000)
  const sentReply = String(body?.sentReply ?? '').trim().slice(0, 20000)
  const draftId = String(body?.draftId ?? '').trim()

  if (mode === 'revise' && !instruction) {
    return NextResponse.json({ error: 'Tell June what to change.' }, { status: 400 })
  }

  const [msgRes, kbRes] = await Promise.all([
    supabase.from('agent_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true })
      .limit(200),
    supabase.from('agent_kb').select('id, topic, content').eq('enabled', true).order('topic'),
  ])
  if (msgRes.error) {
    return NextResponse.json({ error: `Couldn't read this conversation: ${msgRes.error.message}` }, { status: 500 })
  }

  const messages = msgRes.data ?? []
  const kb = (kbRes.data ?? []) as KbEntryLite[]

  // The draft being edited: the one the UI named, else the newest draft row.
  const draftRow = draftId
    ? messages.find((m: any) => m.id === draftId)
    : [...messages].reverse().find((m: any) => m.role === 'draft')

  // The draft the coach sees must be what's on Teddy's SCREEN, not what's in the
  // database — he may have hand-edited the textarea before typing "and drop the
  // last paragraph". Editing the stale copy would silently revert his edits.
  const currentDraft = typeof body?.draftBody === 'string' && body.draftBody.trim()
    ? String(body.draftBody).slice(0, 20000)
    : (draftRow?.content ?? null)

  const history: CoachTurn[] = messages.map((m: any) => ({ role: m.role, content: m.content }))

  let result
  try {
    result = await runCoach({
      mode,
      kb,
      history,
      currentDraft,
      instruction,
      sentReply,
    })
  } catch (e: any) {
    console.error('[coach] error:', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }

  // Persist the rewritten draft so a refresh doesn't lose it.
  if (result.revisedDraft && draftRow?.id) {
    await supabase.from('agent_messages')
      .update({ content: result.revisedDraft })
      .eq('id', draftRow.id)
  }

  let saved: any[] = []
  if (result.proposals.length) {
    const rows = result.proposals.map(p => ({
      conversation_id: params.id,
      mode: p.mode,
      kb_id: p.kbId ?? null,
      topic: p.topic,
      content: p.content,
      reason: p.reason,
      source: mode,
      status: 'pending',
    }))
    const { data, error } = await supabase
      .from('agent_kb_proposals').insert(rows)
      .select('id, mode, kb_id, topic, content, reason, source, status, created_at')
    if (error) {
      // A failed proposal write must not lose the redraft Teddy just asked for —
      // that's the part he's waiting on. Tell him, keep the rest.
      console.error('[coach] proposal insert failed:', error.message)
      return NextResponse.json({
        note: result.note,
        revisedDraft: result.revisedDraft,
        proposals: [],
        warning: `I rewrote the draft, but couldn't save what I learned: ${error.message}`,
      })
    }
    saved = data ?? []
  }

  return NextResponse.json({
    note: result.note,
    revisedDraft: result.revisedDraft,
    proposals: saved,
  })
}

// Admin — the QUESTIONS tab in the June Inbox.
//
// GET  → { groups, ungrouped }  open groups first (most asked), then the last
//        20 done/ignored; ungrouped = questions logged since the last review.
// POST { action: 'run' }                  → run the review now (same code as the Monday cron)
// POST { action: 'ignore'|'reopen'|'done', id } → set a group's status

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { runQuestionReview } from '@/lib/agent/question-review'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const GROUP_COLS = 'id, label, ask_count, examples, conversation_ids, channels, proposal_id, note, status, first_asked_at, last_asked_at'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [openRes, closedRes, ungroupedRes] = await Promise.all([
    supabase.from('june_question_groups').select(GROUP_COLS).eq('status', 'open')
      .order('ask_count', { ascending: false }).order('last_asked_at', { ascending: false }).limit(100),
    supabase.from('june_question_groups').select(GROUP_COLS).neq('status', 'open')
      .order('updated_at', { ascending: false }).limit(20),
    supabase.from('june_questions').select('id, conversation_id, channel, question, kind, created_at')
      .is('group_id', null).order('created_at', { ascending: false }).limit(100),
  ])
  // Loud, not empty — "migration 117 not run" must not read as "June knows everything".
  const err = openRes.error || closedRes.error || ungroupedRes.error
  if (err) return NextResponse.json({ error: `Couldn't load questions: ${err.message}` }, { status: 500 })

  const groups = [...(openRes.data ?? []), ...(closedRes.data ?? [])]
  const propIds = groups.map(g => g.proposal_id).filter(Boolean)
  let props: Record<string, any> = {}
  if (propIds.length) {
    const { data } = await supabase.from('agent_kb_proposals')
      .select('id, mode, kb_id, topic, content, reason, status').in('id', propIds)
    props = Object.fromEntries((data ?? []).map(p => [p.id, p]))
  }

  return NextResponse.json({
    groups: groups.map(g => ({ ...g, proposal: g.proposal_id ? props[g.proposal_id] ?? null : null })),
    ungrouped: ungroupedRes.data ?? [],
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  if (body?.action === 'run') {
    const r = await runQuestionReview(supabase)
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }

  const status = body?.action === 'ignore' ? 'ignored' : body?.action === 'done' ? 'done' : body?.action === 'reopen' ? 'open' : null
  const id = String(body?.id ?? '')
  if (!status || !id) return NextResponse.json({ error: 'action and id required' }, { status: 400 })
  const { data, error } = await supabase.from('june_question_groups')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ success: true, status })
}

// GET /api/cron/june-questions — the weekly "questions June couldn't answer" review.
// Mondays, see vercel.json. Groups the week's june_questions, drafts a KB line
// per group (as agent_kb_proposals — never straight into agent_kb), and sends
// ONE push. Silent when she missed nothing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'
import { runQuestionReview } from '@/lib/agent/question-review'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const r = await runQuestionReview(supabase)
  if (!r.ok) {
    console.error('[june-questions] review failed:', r.error)
    return NextResponse.json(r, { status: 500 })
  }

  if (r.questions > 0) {
    const n = r.labels.length
    const top = r.labels.slice(0, 3).join(' · ')
    await sendOwnerPush({
      title: `June missed ${n} question${n === 1 ? '' : 's'} this week`,
      body: `${top}${n > 3 ? ` +${n - 3} more` : ''}. Tap to review her draft answers.`.slice(0, 180),
      url: '/admin/inbox?tab=questions',
      tag: 'june-questions',
    }).catch(e => console.error('[june-questions] push failed (non-fatal):', e))
  }

  return NextResponse.json(r)
}

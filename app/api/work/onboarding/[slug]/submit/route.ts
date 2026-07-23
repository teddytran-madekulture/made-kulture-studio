import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getWorkerByAccount, gradeQuiz } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

// POST /api/work/onboarding/[slug]/submit  { answers: { [qId]: number[] } }
// Grades server-side and records the attempt against the current module version.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const worker = await getWorkerByAccount(user.id)
  if (!worker) return NextResponse.json({ error: 'Not enrolled.' }, { status: 403 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const answers: Record<string, number[]> =
    b && typeof b.answers === 'object' && b.answers ? b.answers : {}

  const admin = supabaseAdmin()
  const { data } = await admin
    .from('onboarding_modules').select('*')
    .eq('slug', params.slug).eq('active', true)
    .order('version', { ascending: false }).limit(1)
  const mod = data?.[0]
  if (!mod) return NextResponse.json({ error: 'Module not found.' }, { status: 404 })
  if (!(mod.required_for || []).includes(worker.worker_class)) {
    return NextResponse.json({ error: 'Not required for your role.' }, { status: 403 })
  }

  const result = gradeQuiz(mod.quiz, answers)

  const { error } = await admin.from('onboarding_progress').upsert({
    worker_id: worker.id,
    module_slug: mod.slug,
    module_version: mod.version,
    passed: result.passed,
    score_pct: result.scorePct,
    answers,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'worker_id,module_slug,module_version' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(result)
}

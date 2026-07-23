import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getWorkerByAccount, publicQuiz } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/work/onboarding/[slug] — the current (highest active version) module
// for a slug, with its quiz stripped of answer keys. 403 unless required for the
// worker's class.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const worker = await getWorkerByAccount(user.id)
  if (!worker) return NextResponse.json({ error: 'Not enrolled.' }, { status: 403 })

  const { data } = await supabaseAdmin()
    .from('onboarding_modules').select('*')
    .eq('slug', params.slug).eq('active', true)
    .order('version', { ascending: false }).limit(1)
  const mod = data?.[0]
  if (!mod) return NextResponse.json({ error: 'Module not found.' }, { status: 404 })
  if (!(mod.required_for || []).includes(worker.worker_class)) {
    return NextResponse.json({ error: 'Not required for your role.' }, { status: 403 })
  }

  return NextResponse.json({
    slug: mod.slug,
    title: mod.title,
    body: mod.body,
    version: mod.version,
    quiz: publicQuiz(mod.quiz),
  })
}

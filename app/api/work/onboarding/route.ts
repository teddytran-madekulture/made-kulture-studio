import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getWorkerByAccount, getCurrentModules, requiredForClass, getProgressRows,
  moduleStatus, isCertified, WORKER_CLASSES, WORKER_CLASS_LABELS,
} from '@/lib/onboarding'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/work/onboarding — the signed-in member's onboarding state.
// Not enrolled → the list of classes they can apply as. Enrolled → their
// required modules with status + overall certified flag.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const worker = await getWorkerByAccount(user.id)
  if (!worker) {
    return NextResponse.json({
      enrolled: false,
      classes: WORKER_CLASSES.map(c => ({ key: c, label: WORKER_CLASS_LABELS[c] })),
    })
  }

  const all = await getCurrentModules()
  const required = requiredForClass(all, worker.worker_class)
  const progress = await getProgressRows(worker.id)
  const modules = required.map(m => ({
    slug: m.slug,
    title: m.title,
    version: m.version,
    questions: m.quiz?.questions?.length ?? 0,
    status: moduleStatus(m, progress),
  }))

  return NextResponse.json({
    enrolled: true,
    worker: {
      worker_class: worker.worker_class,
      status: worker.status,
      label: WORKER_CLASS_LABELS[worker.worker_class],
    },
    certified: isCertified(required, progress),
    modules,
  })
}

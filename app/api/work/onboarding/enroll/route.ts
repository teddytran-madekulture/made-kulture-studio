import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { WORKER_CLASSES, type WorkerClass } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

// POST /api/work/onboarding/enroll  { worker_class }
// A signed-in member applies as a worker of the chosen class (status 'applicant').
// Re-applying updates the class. Actual clearance to work is gated later (screening).
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const worker_class = b.worker_class as WorkerClass
  if (!(WORKER_CLASSES as string[]).includes(worker_class)) {
    return NextResponse.json({ error: 'Pick a role.' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const learning_only = worker_class === 'intern'
  const { data: existing } = await admin
    .from('worker_profiles').select('id').eq('account_id', user.id).maybeSingle()

  if (existing) {
    const { error } = await admin.from('worker_profiles')
      .update({ worker_class, learning_only, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await admin.from('worker_profiles').insert({
      account_id: user.id,
      email: user.email,
      worker_class,
      status: 'applicant',
      learning_only,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

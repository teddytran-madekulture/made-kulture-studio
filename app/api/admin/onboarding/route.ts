import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { WORKER_CLASSES, DEFAULT_QUIZ } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/onboarding — every module row (all versions), for the editor.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin()
    .from('onboarding_modules')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('version', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ modules: data ?? [] })
}

// POST /api/admin/onboarding — create a module, or a NEW VERSION of an existing
// slug (rule change). Editing in place (typo fix) is PATCH on [id].
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const slug = String(b.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const title = String(b.title || '').trim()
  if (!slug) return NextResponse.json({ error: 'Enter a slug.' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Enter a title.' }, { status: 400 })

  const required_for = Array.isArray(b.required_for)
    ? b.required_for.filter((c: string) => (WORKER_CLASSES as string[]).includes(c))
    : []
  const quiz = b.quiz && typeof b.quiz === 'object' ? b.quiz : DEFAULT_QUIZ

  // New version if this slug already exists.
  const { data: existing } = await supabaseAdmin()
    .from('onboarding_modules')
    .select('version')
    .eq('slug', slug)
    .order('version', { ascending: false })
    .limit(1)
  const version = existing && existing.length ? Number(existing[0].version) + 1 : 1

  const { error } = await supabaseAdmin().from('onboarding_modules').insert({
    slug,
    title,
    body: String(b.body || ''),
    version,
    required_for,
    quiz,
    sort_order: Number(b.sort_order) || 0,
    active: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, version })
}

import { supabaseAdmin } from '@/lib/supabase'

// ── Worker classes ─────────────────────────────────────────────────────────────
export type WorkerClass = 'attendant' | 'sanitation' | 'intern' | 'freelancer'
export type WorkerStatus = 'applicant' | 'active' | 'inactive'

export const WORKER_CLASSES: WorkerClass[] = ['attendant', 'sanitation', 'intern', 'freelancer']

export const WORKER_CLASS_LABELS: Record<WorkerClass, string> = {
  attendant: 'Studio Attendant',
  sanitation: 'Sanitation',
  intern: 'Intern / Student',
  freelancer: 'Freelancer',
}

export type WorkerProfile = {
  id: string
  account_id: string | null
  email: string | null
  full_name: string | null
  worker_class: WorkerClass
  status: WorkerStatus
  learning_only: boolean
  created_at: string
  updated_at: string
}

// ── Module + quiz shapes ───────────────────────────────────────────────────────
export type QuizQuestion = {
  id: string
  prompt: string
  type: 'single' | 'boolean'
  options: string[]
  answer: number[] // correct option indices
}
export type Quiz = {
  pass_pct: number
  retake_on_miss: boolean
  questions: QuizQuestion[]
}
export type OnboardingModule = {
  id: string
  slug: string
  title: string
  body: string
  version: number
  required_for: WorkerClass[]
  quiz: Quiz
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export const DEFAULT_QUIZ: Quiz = { pass_pct: 80, retake_on_miss: false, questions: [] }

// ── Grading (server-side only — never send answer keys to the client) ──────────
export function gradeQuiz(
  quiz: Quiz,
  answers: Record<string, number[]>
): { passed: boolean; scorePct: number; missed: string[] } {
  const qs = quiz.questions || []
  if (qs.length === 0) return { passed: true, scorePct: 100, missed: [] }
  const missed: string[] = []
  for (const q of qs) {
    const got = (answers[q.id] || []).slice().sort((a, b) => a - b)
    const want = (q.answer || []).slice().sort((a, b) => a - b)
    const ok = got.length === want.length && got.every((v, i) => v === want[i])
    if (!ok) missed.push(q.id)
  }
  const scorePct = Math.round(((qs.length - missed.length) / qs.length) * 100)
  const passPct = quiz.pass_pct ?? 80
  let passed = scorePct >= passPct
  if (quiz.retake_on_miss && missed.length > 0) passed = false
  return { passed, scorePct, missed }
}

// Strip answer keys before handing a quiz to a worker.
export function publicQuiz(quiz: Quiz): Quiz {
  return {
    ...quiz,
    questions: (quiz.questions || []).map(q => ({ ...q, answer: [] })),
  }
}

// ── Data access (service role) ─────────────────────────────────────────────────
// Current module for a slug = highest active version.
export async function getCurrentModules(): Promise<OnboardingModule[]> {
  const { data } = await supabaseAdmin()
    .from('onboarding_modules')
    .select('*')
    .eq('active', true)
    .order('version', { ascending: false })
  const bySlug = new Map<string, OnboardingModule>()
  for (const m of (data ?? []) as OnboardingModule[]) {
    if (!bySlug.has(m.slug)) bySlug.set(m.slug, m) // first seen = highest version
  }
  return [...bySlug.values()].sort((a, b) => a.sort_order - b.sort_order)
}

export function requiredForClass(modules: OnboardingModule[], cls: WorkerClass): OnboardingModule[] {
  return modules.filter(m => (m.required_for || []).includes(cls))
}

// A worker's profile by their auth account id (or null if not enrolled).
export async function getWorkerByAccount(accountId: string): Promise<WorkerProfile | null> {
  const { data } = await supabaseAdmin()
    .from('worker_profiles')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()
  return (data ?? null) as WorkerProfile | null
}

// A worker's progress rows.
export async function getProgressRows(workerId: string): Promise<ProgressRow[]> {
  const { data } = await supabaseAdmin()
    .from('onboarding_progress')
    .select('module_slug, module_version, passed')
    .eq('worker_id', workerId)
  return (data ?? []) as ProgressRow[]
}

// ── Certification logic ─────────────────────────────────────────────────────────
export type ProgressRow = { module_slug: string; module_version: number; passed: boolean }
export type ModuleStatus = 'not_started' | 'passed' | 'needs_recert'

export function moduleStatus(mod: OnboardingModule, progress: ProgressRow[]): ModuleStatus {
  const rows = progress.filter(p => p.module_slug === mod.slug)
  if (rows.some(p => p.passed && p.module_version === mod.version)) return 'passed'
  if (rows.some(p => p.passed && p.module_version < mod.version)) return 'needs_recert'
  return 'not_started'
}

export function isCertified(required: OnboardingModule[], progress: ProgressRow[]): boolean {
  return required.every(m => moduleStatus(m, progress) === 'passed')
}

// ── Admin roster (all workers + computed progress) ─────────────────────────────
export type RosterCell = { slug: string; title: string; version: number; status: ModuleStatus }
export type RosterWorker = WorkerProfile & {
  label: string
  requiredCount: number
  passedCount: number
  certified: boolean
  cells: RosterCell[]
}

// One roster of every worker with their status against the CURRENT required
// modules for their class. Batches all progress in a single query, then groups
// in memory (no per-worker round trips).
export async function getRoster(): Promise<RosterWorker[]> {
  const admin = supabaseAdmin()
  const [{ data: workerRows }, modules, { data: progRows }] = await Promise.all([
    admin.from('worker_profiles').select('*').order('created_at', { ascending: false }),
    getCurrentModules(),
    admin.from('onboarding_progress').select('worker_id, module_slug, module_version, passed'),
  ])

  const byWorker = new Map<string, ProgressRow[]>()
  for (const p of (progRows ?? []) as (ProgressRow & { worker_id: string })[]) {
    const list = byWorker.get(p.worker_id) ?? []
    list.push({ module_slug: p.module_slug, module_version: p.module_version, passed: p.passed })
    byWorker.set(p.worker_id, list)
  }

  return ((workerRows ?? []) as WorkerProfile[]).map(w => {
    const required = requiredForClass(modules, w.worker_class)
    const progress = byWorker.get(w.id) ?? []
    const cells: RosterCell[] = required.map(m => ({
      slug: m.slug, title: m.title, version: m.version, status: moduleStatus(m, progress),
    }))
    return {
      ...w,
      label: WORKER_CLASS_LABELS[w.worker_class],
      requiredCount: required.length,
      passedCount: cells.filter(c => c.status === 'passed').length,
      certified: isCertified(required, progress),
      cells,
    }
  })
}

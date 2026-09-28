// Settings for Account Standing + Made Kulture Rewards (migration 109). Admin only.
//   GET → { config, rewards, outstandingCents, rewardOutstandingCents }
//   PUT { config?, rewards?: { enabled?, memberRate?, plusRate? } }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { loadStandingConfig, mergeConfig, SEVERITIES } from '@/lib/standing'
import { getRewardSettings, splitPots } from '@/lib/rewards'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function setSetting(key: string, value: string): Promise<string | null> {
  const { data: ex, error: rErr } = await db.from('studio_settings').select('key').eq('key', key).maybeSingle()
  if (rErr) return rErr.message
  const { data, error } = ex
    ? await db.from('studio_settings').update({ value }).eq('key', key).select('key')
    : await db.from('studio_settings').insert({ key, value }).select('key')
  if (error) return error.message
  return data?.length ? null : `${key} was not saved`
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [config, rewards] = await Promise.all([loadStandingConfig(db), getRewardSettings(db)])
  // Credit outstanding = studio services owed. Bookkeeping wants the total.
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('credit_ledger').select('auth_user_id, amount_cents, kind, created_at').order('id').range(from, from + 999)
    if (error) return NextResponse.json({ error: `Ledger read failed: ${error.message}` }, { status: 500 })
    rows.push(...(data ?? [])); if (!data || data.length < 1000) break
  }
  const byUser = new Map<string, any[]>()
  for (const r of rows) { const a = byUser.get(r.auth_user_id); if (a) a.push(r); else byUser.set(r.auth_user_id, [r]) }
  let outstandingCents = 0, rewardOutstandingCents = 0
  byUser.forEach(list => {
    const p = splitPots(list)
    outstandingCents += Math.max(0, p.rewardCents + p.otherCents)
    rewardOutstandingCents += p.rewardCents
  })
  // Suspended-customer matches (migration 113). Non-fatal: before 113 runs the
  // table doesn't exist, and that must not take the whole settings page down.
  const { data: matches, error: mErr } = await db.from('identity_matches')
    .select('id, signal, strength, detail, action, booker, where_seen, created_at, customers ( name, email )')
    .order('created_at', { ascending: false }).limit(50)
  if (mErr) console.error('[standing-settings] identity_matches read failed', mErr)
  return NextResponse.json({ config, rewards, outstandingCents, rewardOutstandingCents, matches: matches ?? [], matchesError: mErr?.message ?? null })
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const errors: string[] = []

  if (body.config) {
    const c = mergeConfig(body.config)
    for (const s of SEVERITIES) if (!(Number(c.points[s]) >= 0)) errors.push(`Points for ${s} must be 0 or more.`)
    const t = c.thresholds
    if (!(t.warning > 0 && t.warning < t.probation && t.probation < t.suspended)) errors.push('Thresholds must go up: warning < probation < suspended.')
    if (c.categories.some((x: any) => !x.key || !x.label || !SEVERITIES.includes(x.severity))) errors.push('Every category needs a key, a label and a severity.')
    if (!errors.length) { const e = await setSetting('standing_config', JSON.stringify(c)); if (e) errors.push(e) }
  }
  if (body.rewards) {
    const r = body.rewards
    if (typeof r.enabled === 'boolean') { const e = await setSetting('rewards_enabled', r.enabled ? 'true' : 'false'); if (e) errors.push(e) }
    for (const [k, key] of [['memberRate', 'reward_rate_member'], ['plusRate', 'reward_rate_plus']] as const) {
      if (r[k] === undefined) continue
      const n = Number(r[k])
      if (!(n >= 0 && n <= 50)) { errors.push(`${k} must be between 0 and 50.`); continue }
      const e = await setSetting(key, String(n)); if (e) errors.push(e)
    }
  }
  if (errors.length) return NextResponse.json({ error: errors.join(' ') }, { status: 400 })
  const [config, rewards] = await Promise.all([loadStandingConfig(db), getRewardSettings(db)])
  return NextResponse.json({ ok: true, config, rewards })
}

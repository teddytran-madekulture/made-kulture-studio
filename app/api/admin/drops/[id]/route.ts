// Admin — one Set Drop. PATCH edits its settings.
//
// ⚠️ ONCE ANYONE HAS PAID A DEPOSIT, the promise they agreed to is frozen except
// in their favour: the cancel policy can only move toward "refund", perks can
// only get better, the deposit can't change. Customers ticked the generated
// sentences (lib/set-drops dropTerms) — changing them afterwards would hand
// someone a different deal from the one they agreed to.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { cancelPolicyChangeAllowed, depositorRate, slugify, LIVE_PLEDGE, type SetDrop } from '@/lib/set-drops'
import { invalidateSetCatalog } from '@/lib/set-catalog'
import { fullDayWindow } from '@/lib/closures'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const TEXT = ['name', 'tagline', 'description', 'hero_url', 'video_url'] as const
const NUM = ['deposit_cents', 'max_hours_per_pledge', 'goal_value', 'rate_per_hour', 'min_hours', 'capacity',
  'early_access_hours', 'discount_value', 'bonus_credit_cents'] as const
const BOOL = ['show_goal', 'perk_early_access', 'perk_discount', 'video_hero'] as const
const ENUMS: Record<string, string[]> = {
  deposit_mode: ['flat', 'per_hour'],
  goal_type: ['people', 'hours', 'dollars'],
  discount_kind: ['percent', 'fixed_rate'],
  discount_scope: ['all', 'pledged_hours'],
  cancel_policy: ['refund', 'credit', 'choice', 'decide_later'],
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const body = await req.json().catch(() => ({} as any))

  const { data: cur, error: curErr } = await db.from('set_drops').select('*').eq('id', params.id).maybeSingle()
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })
  if (!cur) return NextResponse.json({ error: 'Drop not found.' }, { status: 404 })
  const drop = cur as SetDrop

  const row: Record<string, any> = {}
  for (const k of TEXT) if (k in body) row[k] = body[k] == null || body[k] === '' ? null : String(body[k])
  if ('name' in body && !String(body.name || '').trim()) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  for (const k of NUM) if (k in body) {
    const n = Number(body[k])
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: `${k.replace(/_/g, ' ')} must be a positive number.` }, { status: 400 })
    row[k] = k.endsWith('_cents') || k === 'capacity' || k === 'early_access_hours' ? Math.round(n) : n
  }
  for (const k of BOOL) if (k in body) row[k] = !!body[k]
  for (const [k, ok] of Object.entries(ENUMS)) if (k in body) {
    if (!ok.includes(body[k])) return NextResponse.json({ error: `Invalid ${k}.` }, { status: 400 })
    row[k] = body[k]
  }
  if ('gallery' in body) row.gallery = Array.isArray(body.gallery) ? body.gallery.map(String).filter(Boolean).slice(0, 12) : []
  if ('slug' in body) {
    const s = slugify(String(body.slug || ''))
    if (!s) return NextResponse.json({ error: 'Slug needs a letter or number.' }, { status: 400 })
    if (drop.status !== 'draft' && s !== drop.slug) return NextResponse.json({ error: 'The link can only change while the drop is a draft — people may already have it.' }, { status: 400 })
    row.slug = s
  }
  for (const k of ['pre_reserve_ends_at'] as const) if (k in body) row[k] = body[k] ? new Date(body[k]).toISOString() : null
  for (const k of ['run_starts', 'run_ends'] as const) if (k in body) {
    if (body[k] && !/^\d{4}-\d{2}-\d{2}$/.test(body[k])) return NextResponse.json({ error: `${k} must be YYYY-MM-DD.` }, { status: 400 })
    row[k] = body[k] || null
  }
  for (const k of ['replaces_set_id', 'open_call_id'] as const) if (k in body) row[k] = body[k] || null

  // Money in whole dollars — checkout sells half-hours and must agree with the
  // browser to the cent (see depositorRate in lib/set-drops).
  if ('rate_per_hour' in row) row.rate_per_hour = Math.round(row.rate_per_hour)
  if ('discount_value' in row && (body.discount_kind ?? drop.discount_kind) === 'fixed_rate') row.discount_value = Math.round(row.discount_value)
  if ('min_hours' in row) row.min_hours = Math.max(0.5, Math.round(row.min_hours * 2) / 2)
  if ('max_hours_per_pledge' in row) row.max_hours_per_pledge = Math.max(0.5, Math.round(row.max_hours_per_pledge * 2) / 2)

  const next = { ...drop, ...row } as SetDrop
  if (Number(next.max_hours_per_pledge) < Number(next.min_hours)) {
    return NextResponse.json({ error: 'Max hours per pledge can’t be less than the minimum booking.' }, { status: 400 })
  }
  if (next.run_starts && next.run_ends && next.run_ends < next.run_starts) {
    return NextResponse.json({ error: 'The run has to end on or after the day it starts.' }, { status: 400 })
  }
  if (next.replaces_set_id && next.replaces_set_id === next.set_id) {
    return NextResponse.json({ error: 'A drop can’t replace its own set.' }, { status: 400 })
  }
  if ('replaces_set_id' in row && drop.closure_id && row.replaces_set_id !== drop.replaces_set_id) {
    return NextResponse.json({ error: 'The room is already blocked for this drop — remove that block on the calendar first.' }, { status: 400 })
  }

  // The freeze, once money is held.
  const { data: pledges } = await db.from('set_drop_pledges').select('status').eq('drop_id', drop.id)
  const hasDeposits = (pledges ?? []).some(LIVE_PLEDGE)
  if (hasDeposits) {
    const problems: string[] = []
    if (!cancelPolicyChangeAllowed(drop.cancel_policy, next.cancel_policy)) problems.push('the cancel policy can only change in customers’ favour (toward refund)')
    if (next.deposit_mode !== drop.deposit_mode || next.deposit_cents !== drop.deposit_cents) problems.push('the deposit can’t change')
    if (drop.perk_early_access && (!next.perk_early_access || next.early_access_hours < drop.early_access_hours)) problems.push('early access can’t be shortened or removed')
    const oldRate = depositorRate(drop), newRate = depositorRate(next)
    if (oldRate != null && (newRate == null || newRate > oldRate)) problems.push('the depositor rate can’t go up or be removed')
    if (drop.perk_discount && drop.discount_scope === 'all' && next.discount_scope !== 'all') problems.push('the discount can’t be narrowed to pledged hours')
    if (next.bonus_credit_cents < drop.bonus_credit_cents) problems.push('the bonus credit can’t go down')
    if (problems.length) return NextResponse.json({ error: `People have already paid deposits, so ${problems.join('; ')}.` }, { status: 400 })
  }

  row.updated_at = new Date().toISOString()
  const { data: saved, error } = await db.from('set_drops').update(row).eq('id', drop.id).select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!saved?.length) return NextResponse.json({ error: 'Nothing was saved.' }, { status: 500 })

  // The replaced room's block must follow the run dates, or a longer run would
  // leave the physical room sellable on the new days while the drop sells too.
  if (drop.closure_id && (('run_starts' in row && row.run_starts !== drop.run_starts) || ('run_ends' in row && row.run_ends !== drop.run_ends))) {
    const s = saved[0] as SetDrop
    if (s.run_starts && s.run_ends) {
      const { error: cErr } = await db.from('studio_closures').update({
        starts_at: fullDayWindow(s.run_starts).startISO, ends_at: fullDayWindow(s.run_ends).endISO,
      }).eq('id', drop.closure_id)
      if (cErr) return NextResponse.json({ drop: saved[0], warning: `Saved, but the replaced room’s block didn’t move: ${cErr.message}. Fix it in Holidays & Closures.` })
    }
  }

  // Keep the drop's own set in step (name, rate, minimum, capacity, copy).
  if (drop.set_id) {
    const s: Record<string, any> = {}
    if ('name' in row) s.name = row.name
    if ('slug' in row) s.slug = row.slug
    if ('rate_per_hour' in row) s.rate_per_hour = row.rate_per_hour
    if ('min_hours' in row) s.min_hours = row.min_hours
    if ('capacity' in row) s.capacity = row.capacity
    if ('tagline' in row) s.description = row.tagline
    if ('hero_url' in row) s.photo_url = row.hero_url
    if ('video_url' in row) s.video_url = row.video_url
    if ('video_hero' in row) s.video_hero = row.video_hero
    if (Object.keys(s).length) {
      const { error: sErr } = await db.from('sets').update(s).eq('id', drop.set_id)
      invalidateSetCatalog()
      if (sErr) return NextResponse.json({ drop: saved[0], warning: `Saved, but the set itself didn’t update: ${sErr.message}` })
    }
  }
  return NextResponse.json({ drop: saved[0] })
}

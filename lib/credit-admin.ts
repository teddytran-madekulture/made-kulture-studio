// Admin view of studio credit (credit_ledger). Server-only; service-role client.
//
// The ledger IS the history file: append-only, one row per change, never edited.
// Admin "add / remove credit" writes an `adjustment` row with a reason — it never
// touches existing rows, so every change the owner makes is in the history too.

import { splitPots, EXPIRY_MONTHS } from '@/lib/rewards'

export const KIND_LABEL: Record<string, string> = {
  issued: 'Credit added', redeemed: 'Spent', purchased: 'Purchased', adjustment: 'Manual change',
  expired: 'Rewards expired', reward: 'Reward earned', reward_reversed: 'Reward removed',
}

export async function loadLedger(db: any, filter?: { authUserId?: string; from?: string; to?: string }): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from('credit_ledger').select('id, auth_user_id, amount_cents, kind, reason, booking_id, created_by, created_at')
    if (filter?.authUserId) q = q.eq('auth_user_id', filter.authUserId)
    if (filter?.from) q = q.gte('created_at', filter.from)
    if (filter?.to) q = q.lt('created_at', filter.to)
    const { data, error } = await q.order('created_at', { ascending: true }).order('id').range(from, from + 999)
    if (error) throw new Error(`credit_ledger: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

// auth user id ↔ email, paged (listUsers defaults to 50 per page).
export async function authUsers(db: any): Promise<{ emailById: Map<string, string>; idByEmail: Map<string, string> }> {
  const emailById = new Map<string, string>(), idByEmail = new Map<string, string>()
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const users = data?.users ?? []
    for (const u of users) if (u.email) { const e = String(u.email).toLowerCase(); emailById.set(u.id, e); idByEmail.set(e, u.id) }
    if (users.length < 1000) break
  }
  return { emailById, idByEmail }
}

export async function customersByEmail(db: any, emails: string[]): Promise<Map<string, { id: string; name: string | null; phone: string | null }>> {
  const out = new Map<string, any>()
  const uniq = Array.from(new Set(emails.filter(Boolean)))
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await db.from('customers').select('id, name, email, phone').in('email', uniq.slice(i, i + 200))
    for (const c of data ?? []) out.set(String(c.email).toLowerCase(), c)
  }
  return out
}

// When this account's unspent reward credit would expire (null = nothing to expire).
// Same clock as expireRewards: the later of the last completed session and the last reward.
export async function rewardExpiry(db: any, authUserId: string, rows: any[]): Promise<string | null> {
  const { rewardCents } = splitPots(rows)
  if (rewardCents <= 0) return null
  const { data: last } = await db.from('bookings').select('end_time').eq('auth_user_id', authUserId)
    .in('status', ['confirmed', 'completed']).lt('end_time', new Date().toISOString())
    .order('end_time', { ascending: false }).limit(1).maybeSingle()
  const lastReward = rows.filter(r => r.kind === 'reward').map(r => r.created_at).sort().pop()
  const lastActive = [last?.end_time, lastReward].filter(Boolean).sort().pop()
  if (!lastActive) return null
  const d = new Date(lastActive); d.setUTCMonth(d.getUTCMonth() + EXPIRY_MONTHS)
  return d.toISOString()
}

// Per-account summaries from a full ledger read. Pure — unit-tested.
export function summarise(rows: any[]): Map<string, { balanceCents: number; rewardCents: number; otherCents: number; lastAt: string; count: number }> {
  const by = new Map<string, any[]>()
  for (const r of rows) { const a = by.get(r.auth_user_id); if (a) a.push(r); else by.set(r.auth_user_id, [r]) }
  const out = new Map<string, any>()
  by.forEach((list, id) => {
    const balance = list.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0)
    const p = splitPots(list)
    out.set(id, { balanceCents: balance, rewardCents: p.rewardCents, otherCents: balance - p.rewardCents, lastAt: list[list.length - 1]?.created_at ?? '', count: list.length })
  })
  return out
}

export function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

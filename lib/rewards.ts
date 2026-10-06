// Made Kulture Rewards — cash back as studio credit. Migration 109.
// Plan: MK_Rewards_Build_Plan_2026-09-27.docx.
//
//   LOCK   at booking time: bookings.reward_rate (5 member / 10 Plus) and
//          reward_basis_cents (set time + gear on THIS row, card-paid part only).
//   PAY    nightly (app/api/cron/auto-checkout) after the session ends, only in
//          good standing, CLAIMING the row first so a rerun can never pay twice.
//   REVERSE when money goes back (refund / credit-back) — adjustRewardForRefund.
//   EXPIRE reward credit only, after 12 months with no completed booking, with a
//          30-day warning email first. Cancellation credit is never touched.
//
// Rewards are ordinary credit_ledger rows (kind 'reward' / 'reward_reversed' /
// 'expired'), so balance, checkout and "save it for later" work unchanged.

import { plusActive } from '@/lib/short-notice'
import { standingForCustomerIds, canEarnRewards, LEVEL_LABEL } from '@/lib/standing'

export interface RewardSettings { enabled: boolean; memberRate: number; plusRate: number }

export async function getRewardSettings(db: any): Promise<RewardSettings> {
  const { data, error } = await db.from('studio_settings').select('key, value')
    .in('key', ['rewards_enabled', 'reward_rate_member', 'reward_rate_plus'])
  if (error) console.error('[rewards] settings read failed — treating as OFF', error)
  const m = new Map<string, string>((data ?? []).map((r: any) => [r.key, String(r.value)]))
  const num = (k: string, d: number) => { const n = Number(m.get(k)); return Number.isFinite(n) && n >= 0 && n <= 50 ? n : d }
  return { enabled: m.get('rewards_enabled') === 'true', memberRate: num('reward_rate_member', 5), plusRate: num('reward_rate_plus', 10) }
}

// The rate to LOCK for a booking by this email, or null when the program is off.
// Caller decides whether the booker has an account at all.
export async function rewardRateForEmail(db: any, email: string | null | undefined, settings?: RewardSettings): Promise<number | null> {
  const s = settings ?? await getRewardSettings(db)
  if (!s.enabled) return null
  const e = String(email ?? '').trim().toLowerCase()
  let plus = false
  if (e) {
    const { data } = await db.from('customers').select('pricing_overrides').eq('email', e).maybeSingle()
    plus = plusActive(data?.pricing_overrides ?? null)
  }
  const rate = plus ? s.plusRate : s.memberRate
  return rate > 0 ? rate : null
}

// Card-paid share of a row's earnable amount. Promo and credit both come off in
// proportion: basis = earnable × charged / verified-subtotal. Pure, unit-tested.
export function rowBasisCents(rowEarnableCents: number, chargeCents: number, verifiedCents: number): number {
  if (rowEarnableCents <= 0 || chargeCents <= 0 || verifiedCents <= 0) return 0
  return Math.max(0, Math.round(rowEarnableCents * Math.min(1, chargeCents / verifiedCents)))
}

export const rewardFor = (basisCents: number, rate: number) =>
  Math.max(0, Math.round((Number(basisCents) || 0) * (Number(rate) || 0) / 100))

// ── The two pots ──────────────────────────────────────────────────────────────
// Read in order: rewards into one pot, everything else into the other. Every
// spend takes from the reward pot FIRST, which protects the never-expiring
// cancellation credit. Nothing on existing rows changes. Pure, unit-tested.
export function splitPots(rows: { amount_cents: number; kind: string; created_at?: string }[]): { rewardCents: number; otherCents: number } {
  const sorted = [...rows].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
  let reward = 0, other = 0
  for (const r of sorted) {
    const amt = Math.round(Number(r.amount_cents) || 0)
    if (r.kind === 'reward' || r.kind === 'reward_reversed' || r.kind === 'expired') {
      reward += amt
      if (reward < 0) { other += reward; reward = 0 }       // over-reversal spills
    } else if (amt >= 0) {
      other += amt
    } else if (r.kind === 'redeemed') {
      const fromReward = Math.min(reward, -amt); reward -= fromReward; other += amt + fromReward
    } else {                                                  // negative adjustment: other first
      const fromOther = Math.min(Math.max(other, 0), -amt); other -= fromOther
      const rest = -amt - fromOther; const fromReward = Math.min(reward, rest); reward -= fromReward; other -= rest - fromReward
    }
  }
  return { rewardCents: Math.max(0, reward), otherCents: other }
}

export async function rewardPotForUser(db: any, authUserId: string): Promise<{ rewardCents: number; otherCents: number }> {
  const { data, error } = await db.from('credit_ledger').select('amount_cents, kind, created_at').eq('auth_user_id', authUserId)
  if (error) { console.error('[rewards] ledger read failed', error); return { rewardCents: 0, otherCents: 0 } }
  return splitPots(data ?? [])
}

// email → auth user id, paged (listUsers defaults to 50 per page).
export async function authUserMap(db: any): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    // 2026-10-06: THROW, don't break — a partial map made authUserIdForEmail
    // answer "no account" for everyone past the failed page, and the nightly
    // payout then skipped them without a trace.
    if (error) throw new Error(`[rewards] listUsers page ${page}: ${error.message}`)
    const users = data?.users ?? []
    for (const u of users) if (u.email) out.set(String(u.email).toLowerCase(), u.id)
    if (users.length < 1000) break
  }
  return out
}

export async function authUserIdForEmail(db: any, email: string | null | undefined): Promise<string | null> {
  const e = String(email ?? '').trim().toLowerCase()
  if (!e) return null
  return (await authUserMap(db)).get(e) ?? null
}

const PAYABLE_STATUS = ['confirmed', 'completed']
const GIVE_UP_DAYS = 30   // a booking with no payment recorded this long after it ended is closed out

// ── Nightly payout ───────────────────────────────────────────────────────────
export async function payDueRewards(db: any, now = new Date()): Promise<{ paid: number; paidCents: number; skipped: number; errors: number }> {
  const res = { paid: 0, paidCents: 0, skipped: 0, errors: 0 }
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString()   // ended at least 30 min ago
  const { data: due, error } = await db.from('bookings')
    .select('id, status, end_time, reward_rate, reward_basis_cents, auth_user_id, customer_id, square_payment_id, payment_status, sets ( name ), customers ( email )')
    .not('reward_rate', 'is', null).is('reward_paid_at', null).lt('end_time', cutoff)
    .order('end_time').limit(500)
  if (error) { console.error('[rewards] due read failed', error); res.errors++; return res }
  if (!due?.length) return res

  const standing = await standingForCustomerIds(db, due.map((b: any) => b.customer_id))
  let users: Map<string, string> | null = null

  const close = async (b: any, cents: number, note: string | null) => {
    // CLAIM: only the run that flips reward_paid_at from NULL gets to pay.
    const { data, error } = await db.from('bookings')
      .update({ reward_paid_at: now.toISOString(), reward_cents: cents, reward_note: note })
      .eq('id', b.id).is('reward_paid_at', null).select('id')
    if (error) { console.error('[rewards] claim failed', b.id, error); res.errors++; return false }
    return (data ?? []).length === 1
  }

  for (const b of due) {
    const ageDays = (now.getTime() - Date.parse(b.end_time)) / 86400000
    if (b.status === 'cancelled' || b.status === 'no_show') { await close(b, 0, `Not paid: booking ${b.status}`); res.skipped++; continue }
    if (!PAYABLE_STATUS.includes(b.status)) { if (ageDays > GIVE_UP_DAYS) await close(b, 0, `Not paid: status ${b.status}`); res.skipped++; continue }
    const paidFor = !!b.square_payment_id || b.payment_status === 'paid'
    if (!paidFor) { if (ageDays > GIVE_UP_DAYS) await close(b, 0, 'Not paid: no payment recorded'); res.skipped++; continue }

    let authId: string | null = b.auth_user_id ?? null
    if (!authId) {
      users ??= await authUserMap(db)
      authId = users.get(String(b.customers?.email ?? '').toLowerCase()) ?? null
    }
    if (!authId) { await close(b, 0, 'Not paid: no account'); res.skipped++; continue }

    const st = b.customer_id ? standing.get(b.customer_id) : undefined
    if (st && !canEarnRewards(st)) { await close(b, 0, `Not paid: account in ${LEVEL_LABEL[st.level]}`); res.skipped++; continue }

    const cents = rewardFor(b.reward_basis_cents ?? 0, Number(b.reward_rate))
    if (cents <= 0) { await close(b, 0, 'Nothing earnable was paid by card'); res.skipped++; continue }

    if (!(await close(b, cents, null))) { res.skipped++; continue }
    const setName = b.sets?.name ?? 'Full studio'
    const { error: insErr } = await db.from('credit_ledger').insert({
      auth_user_id: authId, amount_cents: cents, kind: 'reward',
      reason: `Reward · ${setName} · ${Number(b.reward_rate)}% back`,
      booking_id: b.id, created_by: 'system', expires_at: null,
    })
    if (insErr) {
      // Un-claim so tomorrow's run retries instead of silently losing the reward.
      console.error('[rewards] ledger insert failed — releasing claim', b.id, insErr)
      await db.from('bookings').update({ reward_paid_at: null, reward_cents: null }).eq('id', b.id)
      res.errors++; continue
    }
    res.paid++; res.paidCents += cents
  }
  return res
}

// ── Money came IN after checkout → it earns too (2026-10-03) ─────────────────
// Extra time, an added set, overtime — anything charged by card on top of a
// booking that already has a locked reward_rate. Before the nightly payout it
// just grows the basis (paid together tonight). After the payout it posts a
// top-up reward right away, so a charge made at 11:30 PM still earns.
// Same standing rule as the payout. Never throws — the charge already happened.
export async function addRewardForCharge(db: any, bookingId: string | null | undefined, cardCents: number, label: string): Promise<{ added: number; mode: 'basis' | 'topup' | 'none' }> {
  const none = { added: 0, mode: 'none' as const }
  try {
    if (!bookingId || !(cardCents > 0)) return none
    const { data: b, error } = await db.from('bookings')
      .select('id, status, reward_rate, reward_basis_cents, reward_cents, reward_paid_at, auth_user_id, customer_id, customers ( email )')
      .eq('id', bookingId).maybeSingle()
    if (error || !b || b.reward_rate == null) return none
    const cents = Math.round(cardCents)

    if (!b.reward_paid_at) {
      const { data: upd } = await db.from('bookings')
        .update({ reward_basis_cents: (b.reward_basis_cents ?? 0) + cents })
        .eq('id', b.id).is('reward_paid_at', null).select('id')
      if ((upd ?? []).length === 1) return { added: rewardFor(cents, Number(b.reward_rate)), mode: 'basis' }
      // Payout won the race between our read and write — fall through to a top-up.
    }

    if (b.customer_id) {
      const st = (await standingForCustomerIds(db, [b.customer_id])).get(b.customer_id)
      if (st && !canEarnRewards(st)) return none
    }
    const authId = b.auth_user_id ?? await authUserIdForEmail(db, b.customers?.email)
    if (!authId) return none
    const reward = rewardFor(cents, Number(b.reward_rate))
    if (reward <= 0) return none
    const { error: insErr } = await db.from('credit_ledger').insert({
      auth_user_id: authId, amount_cents: reward, kind: 'reward',
      reason: `Reward · ${label} · ${Number(b.reward_rate)}% back`,
      booking_id: b.id, created_by: 'system', expires_at: null,
    })
    if (insErr) { console.error('[rewards] top-up insert failed', b.id, insErr); return none }
    // Keep reward_cents the running total so a later refund reverses correctly.
    await db.from('bookings').update({ reward_cents: (b.reward_cents ?? 0) + reward }).eq('id', b.id)
    return { added: reward, mode: 'topup' }
  } catch (e) { console.error('[rewards] addRewardForCharge error (non-fatal)', e); return none }
}

// ── Money went back → take the matching reward back ─────────────────────────
// Call from EVERY refund / credit-back path with the cents returned on this row.
// Before payout it shrinks the basis; after payout it posts a negative ledger row.
// Never throws — a failure here must not break the refund that called it.
export async function adjustRewardForRefund(db: any, bookingId: string | null | undefined, refundedCents: number, reason: string): Promise<void> {
  try {
    if (!bookingId || !(refundedCents > 0)) return
    const { data: b, error } = await db.from('bookings')
      .select('id, reward_rate, reward_basis_cents, reward_cents, reward_paid_at, reward_reversed_cents')
      .eq('id', bookingId).maybeSingle()
    if (error || !b || b.reward_rate == null) return
    if (!b.reward_paid_at) {
      const basis = Math.max(0, (b.reward_basis_cents ?? 0) - Math.round(refundedCents))
      await db.from('bookings').update({ reward_basis_cents: basis }).eq('id', b.id).is('reward_paid_at', null)
      return
    }
    const left = Math.max(0, (b.reward_cents ?? 0) - (b.reward_reversed_cents ?? 0))
    const take = Math.min(left, rewardFor(refundedCents, Number(b.reward_rate)))
    if (take <= 0) return
    const { data: claimed, error: cErr } = await db.from('bookings')
      .update({ reward_reversed_cents: (b.reward_reversed_cents ?? 0) + take })
      .eq('id', b.id).eq('reward_reversed_cents', b.reward_reversed_cents ?? 0).select('id')
    if (cErr || (claimed ?? []).length !== 1) { console.error('[rewards] reversal claim failed', b.id, cErr); return }
    const { data: orig } = await db.from('credit_ledger').select('auth_user_id').eq('booking_id', b.id).eq('kind', 'reward').limit(1).maybeSingle()
    if (!orig?.auth_user_id) return
    const { error: insErr } = await db.from('credit_ledger').insert({
      auth_user_id: orig.auth_user_id, amount_cents: -take, kind: 'reward_reversed',
      reason: `Reward removed · ${reason}`, booking_id: b.id, created_by: 'system', expires_at: null,
    })
    if (insErr) console.error('[rewards] reversal ledger insert failed', b.id, insErr)
  } catch (e) { console.error('[rewards] adjustRewardForRefund error (non-fatal)', e) }
}

// ── Expiry ───────────────────────────────────────────────────────────────────
export const EXPIRY_MONTHS = 12
export const WARN_DAYS = 30

function plusMonths(iso: string, months: number): Date {
  const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + months); return d
}

export async function expireRewards(
  db: any,
  sendWarning: (to: string, cents: number, expiresOn: Date) => Promise<unknown>,
  now = new Date(),
): Promise<{ warned: number; expired: number; expiredCents: number; errors: number }> {
  const res = { warned: 0, expired: 0, expiredCents: 0, errors: 0 }
  // Paged: PostgREST caps a response at 1,000 rows and says nothing about it.
  const holders: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('credit_ledger').select('auth_user_id').eq('kind', 'reward').order('id').range(from, from + 999)
    if (error) { console.error('[rewards] expiry holders read failed', error); res.errors++; return res }
    holders.push(...(data ?? [])); if (!data || data.length < 1000) break
  }
  const ids = Array.from(new Set(holders.map((r: any) => r.auth_user_id)))
  for (const uid of ids as string[]) {
    const { data: rows, error: lErr } = await db.from('credit_ledger').select('amount_cents, kind, created_at').eq('auth_user_id', uid)
    if (lErr) { res.errors++; continue }
    const { rewardCents } = splitPots(rows ?? [])
    if (rewardCents <= 0) continue
    // Clock = the later of the last completed session and the last reward row.
    const { data: last } = await db.from('bookings').select('end_time').eq('auth_user_id', uid)
      .in('status', PAYABLE_STATUS).lt('end_time', now.toISOString()).order('end_time', { ascending: false }).limit(1).maybeSingle()
    const lastReward = (rows ?? []).filter((r: any) => r.kind === 'reward').map((r: any) => r.created_at).sort().pop()
    const lastActive = [last?.end_time, lastReward].filter(Boolean).sort().pop() as string
    const expiresOn = plusMonths(lastActive, EXPIRY_MONTHS)
    if (now >= expiresOn) {
      const { error: e } = await db.from('credit_ledger').insert({
        auth_user_id: uid, amount_cents: -rewardCents, kind: 'expired',
        reason: `Rewards expired — no completed booking in ${EXPIRY_MONTHS} months`, created_by: 'system', expires_at: null,
      })
      if (e) { res.errors++; continue }
      res.expired++; res.expiredCents += rewardCents
    } else if (now.getTime() >= expiresOn.getTime() - WARN_DAYS * 86400000) {
      const day = expiresOn.toISOString().slice(0, 10)
      const { data: ins, error: nErr } = await db.from('reward_expiry_notices')
        .upsert({ auth_user_id: uid, expires_on: day }, { onConflict: 'auth_user_id,expires_on', ignoreDuplicates: true }).select('auth_user_id')
      if (nErr) { res.errors++; continue }
      if (!(ins ?? []).length) continue                     // already warned for this date
      const { data: u } = await db.auth.admin.getUserById(uid)
      const to = u?.user?.email
      if (to) { await sendWarning(to, rewardCents, expiresOn).catch(() => { res.errors++ }); res.warned++ }
    }
  }
  return res
}

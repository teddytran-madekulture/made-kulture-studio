// Customer store-credit ledger helpers. Credit is account-based (auth_user_id),
// dollar-denominated (cents), append-only, and non-expiring by default.
// All access is service-role — callers must have already established WHO the
// user is (a verified session for redemption, admin auth for issuance).

import { supabaseAdmin } from '@/lib/supabase'

export interface CreditEntry {
  id: string
  amount_cents: number
  kind: string
  reason: string | null
  booking_id: string | null
  created_at: string
}

// Current available balance (cents). Non-expiring credit → sum everything;
// still filters out any row that has lapsed, in case expiry is ever used.
export async function getCreditBalance(authUserId: string): Promise<number> {
  const db = supabaseAdmin()
  const nowISO = new Date().toISOString()
  const { data } = await db
    .from('credit_ledger')
    .select('amount_cents, expires_at')
    .eq('auth_user_id', authUserId)
  const rows = data ?? []
  return rows.reduce((sum: number, r: any) => {
    if (r.expires_at && r.expires_at < nowISO) return sum
    return sum + Number(r.amount_cents || 0)
  }, 0)
}

// Add credit (issuance). amountCents must be positive.
export async function issueCredit(
  authUserId: string,
  amountCents: number,
  opts: { kind?: string; reason?: string; bookingId?: string | null; createdBy?: string } = {}
): Promise<{ ok: boolean; error?: string }> {
  if (!authUserId || amountCents <= 0) return { ok: false, error: 'Invalid credit amount.' }
  const db = supabaseAdmin()
  const { error } = await db.from('credit_ledger').insert({
    auth_user_id: authUserId,
    amount_cents: Math.round(amountCents),
    kind: opts.kind ?? 'issued',
    reason: opts.reason ?? null,
    booking_id: opts.bookingId ?? null,
    created_by: opts.createdBy ?? 'system',
    expires_at: null, // non-expiring
  })
  if (error) { console.error('[credits] issue failed', error); return { ok: false, error: error.message } }
  return { ok: true }
}

// Spend credit (redemption). Re-checks the balance to avoid overspend, then
// writes a negative row. Returns how much was actually applied.
export async function redeemCredit(
  authUserId: string,
  requestedCents: number,
  opts: { bookingId?: string | null; reason?: string } = {}
): Promise<{ appliedCents: number }> {
  if (!authUserId || requestedCents <= 0) return { appliedCents: 0 }
  const balance = await getCreditBalance(authUserId)
  const applied = Math.min(balance, Math.round(requestedCents))
  if (applied <= 0) return { appliedCents: 0 }
  const db = supabaseAdmin()
  const { error } = await db.from('credit_ledger').insert({
    auth_user_id: authUserId,
    amount_cents: -applied,
    kind: 'redeemed',
    reason: opts.reason ?? 'Applied to booking',
    booking_id: opts.bookingId ?? null,
    created_by: 'customer',
    expires_at: null,
  })
  if (error) { console.error('[credits] redeem failed', error); return { appliedCents: 0 } }
  return { appliedCents: applied }
}

// Ledger history for the account page (newest first).
export async function getCreditHistory(authUserId: string, limit = 50): Promise<CreditEntry[]> {
  const db = supabaseAdmin()
  const { data } = await db
    .from('credit_ledger')
    .select('id, amount_cents, kind, reason, booking_id, created_at')
    .eq('auth_user_id', authUserId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as CreditEntry[]
}

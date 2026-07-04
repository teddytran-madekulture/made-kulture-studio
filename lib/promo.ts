// Promo-code validation + redemption. Codes are stored UPPERCASE and matched
// case-insensitively. Discount is computed against the order SUBTOTAL (before
// credit is applied). All access is service-role — callers own auth.

import { supabaseAdmin } from '@/lib/supabase'

export interface PromoResult {
  ok: true
  promoId: string
  code: string
  discountCents: number
  label: string | null
}
export interface PromoError { ok: false; error: string }

export function normalizeCode(code: string): string {
  return String(code || '').trim().toUpperCase()
}

// Validate a code for a given order. Does NOT mutate anything.
export async function validatePromo(
  rawCode: string,
  opts: { subtotalCents: number; email?: string | null }
): Promise<PromoResult | PromoError> {
  const code = normalizeCode(rawCode)
  if (!code) return { ok: false, error: 'Enter a promo code.' }
  const db = supabaseAdmin()

  const { data: p } = await db
    .from('promo_codes')
    .select('id, code, kind, value, min_cents, max_uses, uses, per_customer_limit, starts_at, expires_at, active, label')
    .eq('code', code)
    .maybeSingle()

  if (!p || !p.active) return { ok: false, error: 'That code isn’t valid.' }

  const now = Date.now()
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { ok: false, error: 'That code isn’t active yet.' }
  if (p.expires_at && new Date(p.expires_at).getTime() < now) return { ok: false, error: 'That code has expired.' }
  if (p.max_uses != null && p.uses >= p.max_uses) return { ok: false, error: 'That code has been fully redeemed.' }
  if (p.min_cents != null && opts.subtotalCents < p.min_cents) {
    return { ok: false, error: `That code needs a minimum of $${(p.min_cents / 100).toFixed(0)}.` }
  }

  // Per-customer cap (by email).
  const email = (opts.email || '').toLowerCase().trim()
  if (p.per_customer_limit != null && email) {
    const { count } = await db
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promo_id', p.id)
      .eq('email', email)
    if ((count ?? 0) >= p.per_customer_limit) {
      return { ok: false, error: 'You’ve already used that code.' }
    }
  }

  // Compute discount, capped at the subtotal.
  let discountCents = p.kind === 'percent'
    ? Math.floor(opts.subtotalCents * Number(p.value) / 100)
    : Math.min(Number(p.value), opts.subtotalCents)
  discountCents = Math.max(0, Math.min(discountCents, opts.subtotalCents))
  if (discountCents <= 0) return { ok: false, error: 'That code has no discount to apply here.' }

  return { ok: true, promoId: p.id, code: p.code, discountCents, label: p.label }
}

// Record a redemption + bump the running total. Call AFTER a booking succeeds.
export async function recordPromoRedemption(
  promoId: string,
  opts: { email?: string | null; bookingId?: string | null; amountCents: number }
): Promise<void> {
  const db = supabaseAdmin()
  try {
    await db.from('promo_redemptions').insert({
      promo_id: promoId,
      email: (opts.email || '').toLowerCase().trim() || null,
      booking_id: opts.bookingId ?? null,
      amount_cents: Math.round(opts.amountCents),
    })
    const { data } = await db.from('promo_codes').select('uses').eq('id', promoId).maybeSingle()
    await db.from('promo_codes').update({ uses: (data?.uses ?? 0) + 1 }).eq('id', promoId)
  } catch (e) {
    console.error('[promo] record redemption failed (non-fatal):', e)
  }
}

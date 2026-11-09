// WHO'S PAYING — an add-on line paid by someone other than the booker
// (2026-11-08, migration 183). A regular on a friend's booking adds a strobe and
// pays for it himself: the charge stays on the booking (gear prep sees it), but
// the card, receipt, texts and rewards belong to HIM.
//
// The payer is resolved SERVER-SIDE from the customer id whenever there is one —
// the browser's name/phone are only trusted for "someone new", who has no record.

import { toE164 } from '@/lib/sms'

export interface Payer {
  customerId: string | null
  name: string
  phone: string | null   // E.164
  email: string | null
}

export interface RawPayer { customerId?: string | null; name?: string | null; phone?: string | null; email?: string | null }

/** null = the booker pays (normal path). `error` = the request named a payer we can't use. */
export async function resolvePayer(db: any, raw: RawPayer | null | undefined): Promise<{ payer: Payer | null; error?: string }> {
  if (!raw || (!raw.customerId && !raw.name && !raw.phone)) return { payer: null }
  if (raw.customerId) {
    const { data: c, error } = await db.from('customers').select('id, name, email, phone').eq('id', raw.customerId).maybeSingle()
    if (error) return { payer: null, error: 'Could not look up that client — try again.' }
    if (!c) return { payer: null, error: 'That client record no longer exists.' }
    return { payer: { customerId: c.id, name: (c.name || '').trim() || 'there', phone: toE164(c.phone), email: (c.email || '').trim().toLowerCase() || null } }
  }
  const name = String(raw.name ?? '').trim().slice(0, 80)
  const phone = toE164(raw.phone)
  if (!name) return { payer: null, error: 'Enter the name of the person paying.' }
  if (!phone) return { payer: null, error: 'Enter a valid 10-digit phone number for the person paying.' }
  const email = String(raw.email ?? '').trim().toLowerCase()
  return { payer: { customerId: null, name, phone, email: /\S+@\S+\.\S+/.test(email) ? email : null } }
}

/** The booking_add_ons columns for a payer (all null when the booker pays). */
export function payerColumns(p: Payer | null) {
  return {
    payer_customer_id: p?.customerId ?? null,
    payer_name:        p?.name ?? null,
    payer_phone:       p?.phone ?? null,
    payer_email:       p?.email ?? null,
  }
}

export const firstName = (n: string | null | undefined) => (String(n ?? '').trim().split(/\s+/)[0] || 'there')

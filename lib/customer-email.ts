// The ONE way to turn a typed/imported email into the customers-table key.
// Added 2026-09-27.
//
// ⚠️ The customers upserts use onConflict: 'email', which is CASE-SENSITIVE. Acuity
// and the checkout form passed emails through as typed, so 'Lola@…' and 'lola@…'
// became two customer rows — 22 people were split this way, which made regulars
// read as FIRST VISIT and splits notes, warnings, cards and (later) standing.
// Every write of customers.email goes through this; /api/admin/customers/dedupe
// lowercased the existing rows so old and new agree.
export function normEmail(e: unknown): string {
  return String(e ?? '').trim().toLowerCase()
}

// Find-or-create the customer for a booking/charge, by email.
// 2026-10-04: a merge saves the merged-away record's email in alt_emails, but
// every booking path upserted on the MAIN email only - so booking again with
// the old address quietly created a fresh duplicate of a merged person.
// Order: exact main email -> an alt email -> upsert a new row (as before).
// An alt match never renames the customer; it only fills a missing phone.
export async function upsertCustomerByEmail(
  db: any,
  c: { email: unknown; name?: string | null; phone?: string | null },
): Promise<{ data: { id: string } | null; error: any }> {
  const email = normEmail(c.email)
  if (email) {
    const { data: main } = await db.from('customers').select('id').eq('email', email).maybeSingle()
    if (!main) {
      const raw = String(c.email ?? '').trim()
      const forms = Array.from(new Set([email, raw]))
      for (const f of forms) {
        const { data: alt } = await db.from('customers').select('id, phone').contains('alt_emails', [f]).limit(1)
        if (alt && alt.length) {
          if (!alt[0].phone && c.phone) await db.from('customers').update({ phone: c.phone }).eq('id', alt[0].id)
          return { data: { id: alt[0].id }, error: null }
        }
      }
    }
  }
  const { data, error } = await db.from('customers')
    .upsert({ email, name: c.name, phone: c.phone }, { onConflict: 'email' })
    .select('id').single()
  return { data, error }
}

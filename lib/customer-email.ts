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
// ⚠️ 2026-10-06 security pass: `trusted` decides whether an EXISTING row's
// name/phone may be overwritten. The upsert below is INSERT … ON CONFLICT DO
// UPDATE, so until now anyone at public checkout who typed a victim's email
// replaced that customer's phone — and the phone is where the day-before
// reminder (with the door-code link) gets texted. Trusted = the admin, or a
// signed-in session whose email IS this email. Untrusted callers (guest
// checkout) create new rows normally but only FILL BLANKS on existing ones.
export async function upsertCustomerByEmail(
  db: any,
  c: { email: unknown; name?: string | null; phone?: string | null },
  opts: { trusted?: boolean } = {},
): Promise<{ data: { id: string } | null; error: any }> {
  const email = normEmail(c.email)
  if (email) {
    const { data: main } = await db.from('customers').select('id, name, phone').eq('email', email).maybeSingle()
    if (main && !opts.trusted) {
      const fill: Record<string, string> = {}
      if (!main.name && c.name) fill.name = c.name
      if (!main.phone && c.phone) fill.phone = c.phone
      if (Object.keys(fill).length) await db.from('customers').update(fill).eq('id', main.id)
      return { data: { id: main.id }, error: null }
    }
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

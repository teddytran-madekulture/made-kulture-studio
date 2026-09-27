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

// Visit history — "have they been here before?" Built 2026-09-27.
//
// Teddy kept having to ask guests whether they'd been here before, to decide
// whether to give the orientation. The answer was already in `bookings`; nothing
// surfaced it. This derives it at READ time (no column, no cron), so it can never
// drift from the bookings themselves — same approach as ATLAS and standing.
//
// ⚠️ PAGED READS. PostgREST caps one request at 1,000 rows by default, and the
// booking table was ~741 rows on 2026-09-01. A single select would start silently
// dropping the OLDEST rows past 1,000 — exactly the history this exists to count,
// so regulars would drift back to "first visit" with nothing in any log.
//
// Rules:
//   • A VISIT is a session that happened or is on the books: status confirmed or
//     completed. Cancelled, no-show and unpaid holds don't count.
//   • One ORDER is one visit. Rows sharing an order_group (several sets bought
//     together) count once.
//   • Keyed on the customer's LOWERCASED EMAIL, falling back to customer_id.
//     ⚠️ Found 2026-09-27: the customers table holds case-duplicates —
//     'Lolavaughnburlesque@gmail.com' and 'lolavaughnburlesque@gmail.com' as two
//     rows — because email upserts are case-sensitive. Keyed on customer_id, a
//     regular read as FIRST VISIT. Keying on the lowercased email makes the
//     count right regardless of which duplicate a booking landed on.
//   • History from before the Acuity sync (bookings start 2026-02-14) comes from
//     customer_prior_visits (migration 108, filled by /api/admin/visit-history),
//     matched by lowercased email and ADDED to the count.

import type { SupabaseClient } from '@supabase/supabase-js'

export const COUNTED_STATUSES = ['confirmed', 'completed']

export interface VisitInfo {
  /** This booking's visit number for the customer, 1 = first ever. */
  n: number
  /** The customer's previous visit before this one, if any. */
  prevStart: string | null
  prevSet: string | null
}

interface Row { id: string; customer_id: string | null; start_time: string; order_group: string | null; set_name: string | null; email?: string | null }
export interface Prior { visits: number; last_visit: string | null; last_set: string | null }

// Fetch every counted booking, 1,000 rows at a time. Light columns only.
export async function fetchVisitRows(db: SupabaseClient, customerId?: string): Promise<Row[]> {
  const out: Row[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = db.from('bookings')
      .select('id, customer_id, start_time, order_group, sets(name), customers(email)')
      .in('status', COUNTED_STATUSES)
      .not('customer_id', 'is', null)
      .order('start_time', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (customerId) q = q.eq('customer_id', customerId)
    const { data, error } = await q
    // ⚠️ supabase-js does not throw. A failed page must not read as "no history" —
    // that would stamp FIRST VISIT on a regular. Throw; callers treat it as unknown.
    if (error) throw new Error(`[visits] read failed: ${error.message}`)
    for (const r of (data ?? []) as any[]) {
      const s = Array.isArray(r.sets) ? r.sets[0] : r.sets
      const c = Array.isArray(r.customers) ? r.customers[0] : r.customers
      out.push({ id: r.id, customer_id: r.customer_id, start_time: r.start_time, order_group: r.order_group, set_name: s?.name ?? null, email: c?.email ? String(c.email).trim().toLowerCase() : null })
    }
    if (!data || data.length < PAGE) break
  }
  return out
}

// Pre-sync history, lowercased email → Prior. NON-FATAL by design: before
// migration 108 is run the table does not exist, and that must not break the
// calendar — it just means no older history is added yet.
export async function fetchPrior(db: SupabaseClient, email?: string | null): Promise<Map<string, Prior>> {
  const out = new Map<string, Prior>()
  const PAGE = 1000
  try {
    for (let from = 0; ; from += PAGE) {
      let q = db.from('customer_prior_visits').select('email, visits, last_visit, last_set').range(from, from + PAGE - 1)
      if (email) q = q.eq('email', email.trim().toLowerCase())
      const { data, error } = await q
      if (error) { console.warn('[visits] prior history unavailable:', error.message); return out }
      for (const r of (data ?? []) as any[]) out.set(String(r.email), { visits: Number(r.visits) || 0, last_visit: r.last_visit, last_set: r.last_set })
      if (!data || data.length < PAGE) break
    }
  } catch (e) { console.warn('[visits] prior history unavailable:', e) }
  return out
}

// bookingId → VisitInfo, for every counted booking that has a customer.
// `prior` adds visits from before the booking table's history begins.
export function computeVisits(rows: Row[], prior: Map<string, Prior> = new Map()): Record<string, VisitInfo> {
  // Group rows into visits per customer: one visit per order_group (or per row).
  const byCustomer = new Map<string, Map<string, { start: string; set: string | null; ids: string[] }>>()
  const emailOf = new Map<string, string>()
  for (const r of rows) {
    if (!r.customer_id) continue
    // Person key: lowercased email when we have one, so case-duplicate customer
    // rows count as ONE person; otherwise the row's own customer_id.
    const person = r.email ? `e:${r.email}` : `c:${r.customer_id}`
    if (r.email) emailOf.set(person, r.email)
    let visits = byCustomer.get(person)
    if (!visits) { visits = new Map(); byCustomer.set(person, visits) }
    const key = r.order_group ?? r.id
    const v = visits.get(key)
    if (!v) visits.set(key, { start: r.start_time, set: r.set_name, ids: [r.id] })
    else {
      v.ids.push(r.id)
      if (Date.parse(r.start_time) < Date.parse(v.start)) { v.start = r.start_time; v.set = r.set_name }
    }
  }
  const out: Record<string, VisitInfo> = {}
  byCustomer.forEach((visits, customerId) => {
    const ordered = Array.from(visits.values()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    const email = emailOf.get(customerId)
    const p = email ? prior.get(email) : undefined
    const offset = p?.visits ?? 0
    ordered.forEach((v, i) => {
      const prev = i > 0 ? ordered[i - 1] : null
      // The first visit in the table looks back into the imported history.
      const prevStart = prev?.start ?? (offset > 0 ? p!.last_visit : null)
      const prevSet   = prev ? prev.set : (offset > 0 ? p!.last_set : null)
      for (const id of v.ids) out[id] = { n: i + 1 + offset, prevStart, prevSet }
    })
  })
  return out
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// One line for the new-booking push: "First visit" or "5th visit · last here Aug 30".
// Returns '' on any failure — a missing line beats a wrong "first visit".
// ⚠️ Reads ALL counted bookings, not just this customer_id's: a person's history
// can sit on a case-duplicate customer row (see the note at the top). At this
// table's size that is a page or two, once per new booking.
export async function pushVisitLine(db: SupabaseClient, customerId: string | null | undefined, bookingIds: string[]): Promise<string> {
  if (!customerId || !bookingIds.length) return ''
  try {
    const rows = await fetchVisitRows(db)
    const email = rows.find(r => r.customer_id === customerId && r.email)?.email ?? null
    const visits = computeVisits(rows, email ? await fetchPrior(db, email) : new Map())
    const v = visits[bookingIds[0]]
    if (!v) return ''
    if (v.n === 1) return '\nFirst visit: give the orientation'
    const last = v.prevStart
      ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }).format(new Date(v.prevStart))
      : null
    return `\n${ordinal(v.n)} visit${last ? ` · last here ${last}${v.prevSet ? ` (${v.prevSet})` : ''}` : ''}`
  } catch (e) {
    console.error('[visits] push line failed (non-fatal):', e)
    return ''
  }
}

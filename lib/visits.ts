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
//   • Keyed on customer_id. Duplicate customer records split a person's count —
//     the admin merge tool fixes that.
//   • Only as good as the history in the table: Acuity visits from before the
//     Acuity sync started are not here unless backfilled.

import type { SupabaseClient } from '@supabase/supabase-js'

export const COUNTED_STATUSES = ['confirmed', 'completed']

export interface VisitInfo {
  /** This booking's visit number for the customer, 1 = first ever. */
  n: number
  /** The customer's previous visit before this one, if any. */
  prevStart: string | null
  prevSet: string | null
}

interface Row { id: string; customer_id: string | null; start_time: string; order_group: string | null; set_name: string | null }

// Fetch every counted booking, 1,000 rows at a time. Light columns only.
export async function fetchVisitRows(db: SupabaseClient, customerId?: string): Promise<Row[]> {
  const out: Row[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = db.from('bookings')
      .select('id, customer_id, start_time, order_group, sets(name)')
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
      out.push({ id: r.id, customer_id: r.customer_id, start_time: r.start_time, order_group: r.order_group, set_name: s?.name ?? null })
    }
    if (!data || data.length < PAGE) break
  }
  return out
}

// bookingId → VisitInfo, for every counted booking that has a customer.
export function computeVisits(rows: Row[]): Record<string, VisitInfo> {
  // Group rows into visits per customer: one visit per order_group (or per row).
  const byCustomer = new Map<string, Map<string, { start: string; set: string | null; ids: string[] }>>()
  for (const r of rows) {
    if (!r.customer_id) continue
    let visits = byCustomer.get(r.customer_id)
    if (!visits) { visits = new Map(); byCustomer.set(r.customer_id, visits) }
    const key = r.order_group ?? r.id
    const v = visits.get(key)
    if (!v) visits.set(key, { start: r.start_time, set: r.set_name, ids: [r.id] })
    else {
      v.ids.push(r.id)
      if (Date.parse(r.start_time) < Date.parse(v.start)) { v.start = r.start_time; v.set = r.set_name }
    }
  }
  const out: Record<string, VisitInfo> = {}
  byCustomer.forEach(visits => {
    const ordered = Array.from(visits.values()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    ordered.forEach((v, i) => {
      const prev = i > 0 ? ordered[i - 1] : null
      for (const id of v.ids) out[id] = { n: i + 1, prevStart: prev?.start ?? null, prevSet: prev?.set ?? null }
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
export async function pushVisitLine(db: SupabaseClient, customerId: string | null | undefined, bookingIds: string[]): Promise<string> {
  if (!customerId || !bookingIds.length) return ''
  try {
    const visits = computeVisits(await fetchVisitRows(db, customerId))
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

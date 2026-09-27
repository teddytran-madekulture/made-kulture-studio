// GET /api/admin/customers/dedupe            → PREVIEW (writes nothing)
// GET /api/admin/customers/dedupe?apply=1    → merge + lowercase
//
// One pass that (1) merges customer records that are the same person split by
// email CAPITALISATION ('Lola@…' vs 'lola@…'), and (2) lowercases every other
// stored email so the lowercased writes in lib/customer-email.ts match them.
// Built 2026-09-27 after 22 split people were found.
//
// Deliberately NOT a loop over /api/admin/customers/merge, which:
//   • only moves bookings + notes — short_notice_requests and plus_payments
//     would be left pointing at a deleted id;
//   • deletes the duplicates even when a move FAILED;
//   • keeps the primary's pricing_overrides even when it is an empty object and
//     the duplicate holds the Plus membership.
//
// Safety rules here:
//   • A group whose records carry DIFFERENT names is never merged (one shared
//     inbox, two people — e.g. Ellie / Kayla Salazar). Listed for a human.
//   • Every move is checked; any error stops THAT group before anything is deleted.
//   • Before deleting, the duplicate's full row is written to customer_notes on
//     the survivor, so nothing is unrecoverable.
//   • Banned/warning status and Plus survive the merge (the stricter/active one wins).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { normEmail } from '@/lib/customer-email'
import { plusActive, plusExpiresAtMs } from '@/lib/short-notice'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 120

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Every table known to hold a customers.id. Checked in the preview and moved on apply.
const CHILD_TABLES = ['bookings', 'customer_notes', 'short_notice_requests', 'plus_payments', 'customer_incidents'] as const

const COLS = 'id, name, email, phone, status, banned, pricing_overrides, square_customer_id, acuity_client_id, alt_emails, alt_phones, alt_names, created_at'

async function pagedAll(table: string, cols: string): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

const normName = (n: unknown) => String(n ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const apply = req.nextUrl.searchParams.get('apply') === '1'

  let customers: any[], bookingRows: any[]
  try {
    customers = await pagedAll('customers', COLS)
    bookingRows = await pagedAll('bookings', 'id, customer_id')
  } catch (e: any) {
    return NextResponse.json({ error: `Read failed, nothing changed: ${e.message}` }, { status: 500 })
  }
  const bookingCount = new Map<string, number>()
  for (const b of bookingRows) if (b.customer_id) bookingCount.set(b.customer_id, (bookingCount.get(b.customer_id) ?? 0) + 1)

  // Group by lowercased email.
  const groups = new Map<string, any[]>()
  for (const c of customers) {
    const k = normEmail(c.email)
    if (!k) continue
    const g = groups.get(k); if (g) g.push(c); else groups.set(k, [c])
  }

  const toMerge: { email: string; primary: any; dups: any[] }[] = []
  const skipped: { email: string; names: string[]; reason: string }[] = []
  for (const [email, g] of Array.from(groups.entries())) {
    if (g.length < 2) continue
    const names = Array.from(new Set(g.map(c => normName(c.name)).filter(Boolean)))
    if (names.length > 1) { skipped.push({ email, names: g.map(c => c.name), reason: 'different names, needs a human' }); continue }
    // Survivor: most bookings, then has a Square profile, then active Plus, then oldest.
    const ranked = [...g].sort((a, b) =>
      (bookingCount.get(b.id) ?? 0) - (bookingCount.get(a.id) ?? 0)
      || Number(!!b.square_customer_id) - Number(!!a.square_customer_id)
      || Number(plusActive(b.pricing_overrides)) - Number(plusActive(a.pricing_overrides))
      || Date.parse(a.created_at) - Date.parse(b.created_at))
    toMerge.push({ email, primary: ranked[0], dups: ranked.slice(1) })
  }

  // Emails that only need lowercasing (not part of a group being merged or skipped).
  const groupedEmails = new Set([...toMerge.map(m => m.email), ...skipped.map(s => s.email)])
  const toLowercase = customers.filter(c => c.email && c.email !== normEmail(c.email) && !groupedEmails.has(normEmail(c.email)))

  const preview = {
    mode: apply ? 'APPLIED' : 'PREVIEW (nothing written, add ?apply=1 to run)',
    customers: customers.length,
    groupsToMerge: toMerge.length,
    recordsRemoved: toMerge.reduce((s, m) => s + m.dups.length, 0),
    emailsToLowercase: toLowercase.length,
    skippedForReview: skipped,
    merges: toMerge.map(m => ({
      email: m.email, name: m.primary.name,
      keep: { id: m.primary.id, storedAs: m.primary.email, bookings: bookingCount.get(m.primary.id) ?? 0, plus: plusActive(m.primary.pricing_overrides) },
      remove: m.dups.map(d => ({ id: d.id, storedAs: d.email, bookings: bookingCount.get(d.id) ?? 0, plus: plusActive(d.pricing_overrides), squareProfile: !!d.square_customer_id })),
      squareConflict: m.dups.some(d => d.square_customer_id && m.primary.square_customer_id && d.square_customer_id !== m.primary.square_customer_id),
    })),
  }
  if (!apply) return NextResponse.json(preview)

  const results: any[] = []
  for (const m of toMerge) {
    const { primary, dups } = m
    const dupIds = dups.map(d => d.id)
    const r: any = { email: m.email, moved: {}, errors: [] as string[] }
    results.push(r)

    // 1. Move every child row. Any error ⇒ stop this group, delete nothing.
    for (const t of CHILD_TABLES) {
      const { data, error } = await db.from(t).update({ customer_id: primary.id }).in('customer_id', dupIds).select('id')
      if (error) { r.errors.push(`${t}: ${error.message}`); break }
      r.moved[t] = data?.length ?? 0
    }
    if (r.errors.length) continue

    // 2. Merged fields — stricter status, active/longer Plus, keep every contact.
    const all = [primary, ...dups]
    const banned = all.some(c => c.banned)
    const status = all.find(c => c.status === 'warning')?.status ?? all.find(c => c.status && c.status !== 'regular')?.status ?? primary.status ?? 'regular'
    const plusSource = [...all].filter(c => plusActive(c.pricing_overrides))
      .sort((a, b) => (plusExpiresAtMs(b.pricing_overrides) ?? 0) - (plusExpiresAtMs(a.pricing_overrides) ?? 0))[0]
    const withOverrides = all.find(c => c.pricing_overrides && Object.keys(c.pricing_overrides).length)
    const pricing = (plusSource ?? withOverrides ?? primary).pricing_overrides ?? primary.pricing_overrides
    const set = (xs: any[]) => Array.from(new Set(xs.filter(Boolean).map((x: string) => String(x).trim()).filter(Boolean)))
    const phone = primary.phone || dups.find(d => d.phone)?.phone || null
    const altPhones = set([...(primary.alt_phones ?? []), ...dups.flatMap(d => [d.phone, ...(d.alt_phones ?? [])])]).filter(p => p !== phone)
    const altEmails = set([...(primary.alt_emails ?? []), ...dups.flatMap(d => d.alt_emails ?? [])]).filter(e => normEmail(e) !== m.email)
    const squareFromDup = !primary.square_customer_id ? dups.find(d => d.square_customer_id)?.square_customer_id ?? null : null
    const lostSquare = dups.map(d => d.square_customer_id).filter(s => s && s !== primary.square_customer_id && s !== squareFromDup)

    // 3. Keep a full copy of each duplicate on the survivor before deleting it.
    const { error: noteErr } = await db.from('customer_notes').insert({
      customer_id: primary.id, tag: 'note',
      note: `Merged duplicate record(s) with the same email in different capitalisation (2026-09-27 cleanup). Removed: ${JSON.stringify(dups.map(d => ({ id: d.id, email: d.email, name: d.name, phone: d.phone, status: d.status, banned: d.banned, square_customer_id: d.square_customer_id, pricing_overrides: d.pricing_overrides })))}${lostSquare.length ? ` · Other Square customer profile(s) not linked: ${lostSquare.join(', ')}` : ''}`,
    })
    if (noteErr) { r.errors.push(`backup note: ${noteErr.message}`); continue }

    // 4. Delete the duplicates (children already moved; a leftover reference fails loudly here).
    const { data: gone, error: delErr } = await db.from('customers').delete().in('id', dupIds).select('id')
    if (delErr) { r.errors.push(`delete: ${delErr.message}`); continue }
    r.removed = gone?.length ?? 0

    // 5. Update the survivor last (the Square id and lowercase email are unique, so
    //    they can only move once the duplicates are gone).
    const { data: upd, error: updErr } = await db.from('customers').update({
      email: m.email, phone, banned, status, pricing_overrides: pricing,
      ...(squareFromDup ? { square_customer_id: squareFromDup } : {}),
      acuity_client_id: primary.acuity_client_id ?? dups.find(d => d.acuity_client_id)?.acuity_client_id ?? null,
      alt_emails: altEmails, alt_phones: altPhones,
    }).eq('id', primary.id).select('id')
    if (updErr || !upd?.length) r.errors.push(`update survivor: ${updErr?.message ?? 'matched no row'}`)
  }

  // Lowercase the rest.
  let lowercased = 0
  const lowerErrors: string[] = []
  for (const c of toLowercase) {
    const { data, error } = await db.from('customers').update({ email: normEmail(c.email) }).eq('id', c.id).select('id')
    if (error) lowerErrors.push(`${c.email}: ${error.message}`); else lowercased += data?.length ?? 0
  }

  // Verify: re-read and count what is still split.
  let remaining: any = 'unknown'
  try {
    const after = await pagedAll('customers', 'id, email, name')
    const seen = new Map<string, number>()
    for (const c of after) { const k = normEmail(c.email); if (k) seen.set(k, (seen.get(k) ?? 0) + 1) }
    remaining = Array.from(seen.values()).filter(n => n > 1).length
  } catch {}

  return NextResponse.json({
    ...preview, results, lowercased, lowerErrors,
    duplicateGroupsRemaining: remaining,
    note: `Expected remaining = ${skipped.length} (the groups skipped for review).`,
  })
}

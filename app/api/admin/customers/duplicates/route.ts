import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { accountEmails, hasPricing } from '@/lib/account-emails'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/customers/duplicates
// Returns groups of customers that share the same normalized name or phone number
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch ALL customers with booking counts. PostgREST caps a response at
  // 1000 rows, so a single select silently dropped every customer past the
  // first 1000 (oldest first) - the newest records, where fresh duplicates
  // live, were never compared. Page through until a short page.
  const customers: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('customers')
      .select(`
        id, name, email, phone, status, banned, created_at, pricing_overrides,
        bookings ( id )
      `)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999)
    // A failed page must not read as "no duplicates".
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    customers.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  let accounts: Set<string>
  try { accounts = await accountEmails(supabase) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  const hasAcct = (c: any) => !!c.email && accounts.has(String(c.email).trim().toLowerCase())
  const digits = (p: string | null) => { let d = String(p ?? '').replace(/\D/g, ''); if (d.length === 11 && d.startsWith('1')) d = d.slice(1); return d }

  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

  // Group by normalized name
  const nameGroups: Record<string, any[]> = {}
  for (const c of customers ?? []) {
    if (!c.name) continue
    const key = normalize(c.name)
    if (!nameGroups[key]) nameGroups[key] = []
    nameGroups[key].push(c)
  }

  // Also group by phone (non-empty)
  const phoneGroups: Record<string, any[]> = {}
  for (const c of customers ?? []) {
    if (!c.phone) continue
    // US numbers: +1 832... and 832... are the same phone.
    let key = c.phone.replace(/\D/g, '')
    if (key.length === 11 && key.startsWith('1')) key = key.slice(1)
    if (key.length < 7) continue
    if (!phoneGroups[key]) phoneGroups[key] = []
    phoneGroups[key].push(c)
  }

  // Collect all duplicate groups (deduplicate across name + phone groupings)
  const seenGroups = new Set<string>()
  const groups: any[] = []

  const addGroup = (members: any[], reason: string) => {
    const key = members.map(m => m.id).sort().join(',')
    if (seenGroups.has(key)) return
    seenGroups.add(key)
    // Order = merge preference: the record a website login points at first
    // (it MUST be the one kept), then most bookings, then oldest. The UI
    // defaults KEEP to members[0].
    const sorted = [...members].sort((a, b) =>
      (hasAcct(b) ? 1 : 0) - (hasAcct(a) ? 1 : 0) ||
      (b.bookings as any[]).length - (a.bookings as any[]).length ||
      String(a.created_at).localeCompare(String(b.created_at)))
    // Why a human should look before merging. MERGE ALL skips these.
    const review: string[] = []
    const accts = sorted.filter(hasAcct).length
    if (accts > 1) review.push('Two website logins - merging would orphan one. Do not merge.')
    if (reason.includes('phone') && new Set(sorted.map(m => normalize(m.name ?? ''))).size > 1) review.push('Same phone, different names - could be family or a shared number.')
    if (reason.includes('name') && new Set(sorted.map(m => digits(m.phone)).filter(d => d.length >= 7)).size > 1) review.push('Same name, different phones - could be two different people.')
    groups.push({
      reason,
      review,
      blocked: accts > 1,
      members: sorted.map(m => ({
        id:           m.id,
        name:         m.name,
        email:        m.email,
        phone:        m.phone,
        status:       m.status ?? 'regular',
        banned:       m.banned ?? false,
        createdAt:    m.created_at,
        bookingCount: (m.bookings as any[]).length,
        hasAccount:   hasAcct(m),
        hasPricing:   hasPricing(m.pricing_overrides),
      })),
    })
  }

  // One group per PERSON, not per match. The same pair often matches by name
  // AND by phone; listing them as two groups meant merging one left the other
  // on screen pointing at a record that no longer exists, so merged people
  // "kept coming back". Union every overlapping match into a single group.
  const parent = new Map<string, string>()
  const find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const byId = new Map<string, any>()
  const why = new Map<string, Set<string>>()   // member id -> match reasons
  const link = (members: any[], reason: string) => {
    for (const m of members) { byId.set(m.id, m); if (!why.has(m.id)) why.set(m.id, new Set()); why.get(m.id)!.add(reason) }
    for (let i = 1; i < members.length; i++) union(members[0].id, members[i].id)
  }
  for (const [, members] of Object.entries(nameGroups)) if (members.length > 1) link(members, 'name')
  for (const [, members] of Object.entries(phoneGroups)) if (members.length > 1) link(members, 'phone')
  const clusters = new Map<string, any[]>()
  for (const id of Array.from(byId.keys())) {
    const r = find(id)
    if (!clusters.has(r)) clusters.set(r, [])
    clusters.get(r)!.push(byId.get(id))
  }
  for (const members of Array.from(clusters.values())) {
    const reasons = new Set<string>()
    for (const m of members) why.get(m.id)!.forEach(r => reasons.add(r))
    addGroup(members, Array.from(reasons).sort().join(' + '))
  }

  // Sort: groups with more members first
  groups.sort((a, b) => b.members.length - a.members.length)

  return NextResponse.json({ groups, total: groups.length })
}

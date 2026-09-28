// Two-way texting helpers (migration 115). Server-only; service-role client.
// Phones are stored in every format ("(832) 454-9032", "+18324549032",
// "832.454.9032"), so matching always compares the normalised LAST 10 digits.

export const last10 = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10)

export interface PhoneCustomer { id: string; name: string | null; email: string | null }

// Customers whose phone (or a merged alt phone) is this number.
export async function customersForPhone(db: any, phone: string): Promise<PhoneCustomer[]> {
  const d = last10(phone)
  if (d.length !== 10) return []
  const { data: cands } = await db.from('customers').select('id, name, email, phone, alt_phones').ilike('phone', `%${d.slice(-4)}%`).limit(50)
  let hits = (cands ?? []).filter((c: any) => last10(c.phone) === d)
  if (!hits.length) {
    const { data: alt } = await db.from('customers').select('id, name, email, phone, alt_phones').neq('alt_phones', '{}').limit(1000)
    hits = (alt ?? []).filter((c: any) => (c.alt_phones ?? []).some((p: string) => last10(p) === d))
  }
  return hits.map((c: any) => ({ id: c.id, name: c.name ?? null, email: c.email ?? null }))
}

// Many numbers at once (the thread list): one paged read of every customer phone.
export async function customerNamesByPhone(db: any): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from('customers').select('name, phone, alt_phones').range(from, from + 999)
    if (error) { console.error('[sms-inbox] customer read failed', error); break }
    for (const c of data ?? []) {
      if (!c.name) continue
      for (const p of [c.phone, ...(c.alt_phones ?? [])]) { const k = last10(p); if (k.length === 10 && !out.has(k)) out.set(k, c.name) }
    }
    if (!data || data.length < 1000) break
  }
  return out
}

// "Next booking: The Tank, Sat, Oct 3, 2:00 PM" — the booking nearest to now
// (last 3 days to next 30), so a text can be tied to a session at a glance.
export async function nearestBookingLine(db: any, customerIds: string[]): Promise<string> {
  if (!customerIds.length) return 'Number not on any customer'
  const now = Date.now()
  const { data: bks } = await db.from('bookings').select('start_time, sets ( name )')
    .in('customer_id', customerIds).neq('status', 'cancelled')
    .gte('start_time', new Date(now - 3 * 864e5).toISOString()).lte('start_time', new Date(now + 30 * 864e5).toISOString())
    .order('start_time').limit(20)
  const near = (bks ?? []).sort((a: any, b: any) => Math.abs(Date.parse(a.start_time) - now) - Math.abs(Date.parse(b.start_time) - now))[0] as any
  if (!near) return 'No booking in the last 3 days or next 30'
  const set = Array.isArray(near.sets) ? near.sets[0]?.name : near.sets?.name
  const when = new Date(near.start_time).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return `${Date.parse(near.start_time) < now ? 'Last booking' : 'Next booking'}: ${set ?? 'set'}, ${when}`
}

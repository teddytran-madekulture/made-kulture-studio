// Nomad — the members' home base in Mexico City (2026-10-25). The ONE place the
// program's rules live, so the member routes, the admin routes and the daily
// cron can never disagree. Server-only (service role).
//
// ⚠️ TIME ZONE: Mexico City dropped DST in 2022. It is NOT Central time half
// the year. Stay dates are Mexico City calendar dates; instants are built with
// mxInstant(), never lib/booking-times (which assumes Central).
//
// ⚠️ MONEY: every charge uses the card the member picked and consented to
// (membership.square_card_id). Idempotency keys are deterministic per
// membership + period, so a retried cron run cannot double-charge.
import type { SupabaseClient } from '@supabase/supabase-js'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { isCardUsable } from '@/lib/card-expiry'
import { createPinForDevice } from '@/lib/igloohome'

export const MX_TZ = 'America/Mexico_City'
export const RULES_VERSION = '2026-10-25'

// ── Settings ──────────────────────────────────────────────────────────────
export interface NomadSettings {
  dues_cents: number
  nights_per_month: number
  night_cap: number
  extra_night_cents: number
  busy_multiplier: number
  busy_ranges: { start: string; end: string; label?: string }[]   // inclusive YYYY-MM-DD
  max_nights_per_stay: number
  max_members_at_once: number
  booking_window_days: number
  second_stay_lead_days: number
  free_cancel_days: number
  check_in_hour: number
  check_out_hour: number
  studio_block_hours: number
  studio_open_hour: number
  studio_close_hour: number
  max_visitors_per_day: number
  past_due_grace_days: number
  house_name: string
  house_address: string
  door_codes_enabled: boolean
}

export const DEFAULT_SETTINGS: NomadSettings = {
  dues_cents: 23000,
  nights_per_month: 4,
  night_cap: 12,
  extra_night_cents: 3000,
  busy_multiplier: 2,
  busy_ranges: [],
  max_nights_per_stay: 10,
  max_members_at_once: 2,
  booking_window_days: 60,
  second_stay_lead_days: 14,
  free_cancel_days: 14,
  check_in_hour: 15,
  check_out_hour: 11,
  studio_block_hours: 4,
  studio_open_hour: 10,
  studio_close_hour: 21,
  max_visitors_per_day: 4,
  past_due_grace_days: 7,
  house_name: 'Nomad House, Mexico City',
  house_address: '',
  door_codes_enabled: false,
}

export async function getNomadSettings(db: SupabaseClient): Promise<NomadSettings> {
  const { data, error } = await db.from('studio_settings').select('value').eq('key', 'nomad_settings').maybeSingle()
  if (error) throw new Error(`nomad settings read failed: ${error.message}`)
  let saved: any = {}
  try { saved = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : {} } catch { saved = {} }
  return { ...DEFAULT_SETTINGS, ...saved }
}

export async function saveNomadSettings(db: SupabaseClient, patch: Partial<NomadSettings>): Promise<NomadSettings> {
  const cur = await getNomadSettings(db)
  const next: any = { ...cur }
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof NomadSettings)[]) {
    if (!(k in patch)) continue
    const v: any = (patch as any)[k]
    const d: any = DEFAULT_SETTINGS[k]
    if (typeof d === 'number') { const n = Number(v); if (Number.isFinite(n) && n >= 0) next[k] = Math.round(n) }
    else if (typeof d === 'boolean') next[k] = v === true
    else if (typeof d === 'string') next[k] = String(v ?? '').slice(0, 300)
    else if (k === 'busy_ranges' && Array.isArray(v)) {
      next[k] = v.filter((r: any) => isDate(r?.start) && isDate(r?.end) && r.end >= r.start)
        .map((r: any) => ({ start: r.start, end: r.end, label: String(r.label ?? '').slice(0, 60) }))
    }
  }
  if (next.busy_multiplier < 1) next.busy_multiplier = 1
  if (next.max_members_at_once < 1) next.max_members_at_once = 1
  // Update-then-insert, same as the other studio_settings writers (no upsert:
  // the key column is not guaranteed unique-constrained).
  const value = JSON.stringify(next)
  let { data, error } = await db.from('studio_settings').update({ value }).eq('key', 'nomad_settings').select('key')
  if (!error && !data?.length) ({ data, error } = await db.from('studio_settings').insert({ key: 'nomad_settings', value }).select('key'))
  if (error || !data?.length) throw new Error(`nomad settings save failed: ${error?.message || 'nothing saved'}`)
  return next
}

// ── Mexico City dates ─────────────────────────────────────────────────────
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

export function mxToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MX_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}
/** The nights of a stay: check_in .. check_out-1. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = []; for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d); return out
}
/** "2026-11-03" at 15:00 Mexico City → an ISO instant with the right offset (DST-proof). */
export function mxInstant(date: string, hour: number): string {
  const guess = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: MX_TZ, timeZoneName: 'longOffset' }).formatToParts(guess)
  const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-06:00'
  const m = tz.match(/GMT([+-]\d{2}):?(\d{2})?/)
  const off = m ? `${m[1]}:${m[2] || '00'}` : '-06:00'
  return `${date}T${String(hour).padStart(2, '0')}:00:00${off}`
}

// ── Night bank ────────────────────────────────────────────────────────────
export function isBusy(date: string, s: NomadSettings): boolean {
  return s.busy_ranges.some(r => date >= r.start && date <= r.end)
}
export function nightCost(dates: string[], s: NomadSettings): number {
  return dates.reduce((n, d) => n + (isBusy(d, s) ? s.busy_multiplier : 1), 0)
}
export async function nightBalance(db: SupabaseClient, membershipId: string): Promise<number> {
  const { data, error } = await db.from('nomad_nights').select('delta').eq('membership_id', membershipId)
  if (error) throw new Error(`night balance read failed: ${error.message}`)
  return (data ?? []).reduce((n, r: any) => n + Number(r.delta || 0), 0)
}
/** Add this period's nights, topping up to the cap. De-duped by period_key. */
export async function accrueNights(db: SupabaseClient, membershipId: string, s: NomadSettings, periodKey: string): Promise<number> {
  const bal = await nightBalance(db, membershipId)
  const add = Math.max(0, Math.min(s.nights_per_month, s.night_cap - bal))
  if (add <= 0) return 0
  const { error } = await db.from('nomad_nights').insert({ membership_id: membershipId, delta: add, reason: 'accrual', period_key: periodKey })
  if (error) {
    if ((error as any).code === '23505') return 0 // already accrued this period
    throw new Error(`night accrual failed: ${error.message}`)
  }
  return add
}

// ── Memberships ───────────────────────────────────────────────────────────
export const LIVE_STATUSES = ['active', 'past_due']

/** One calendar month later in UTC, clamped to the month's last day — so a
 *  Jan 31 anchor goes to Feb 28/29, never Mar 3 (which would drift forever). */
export function addMonth(iso: string): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
  const out = new Date(d)
  out.setUTCDate(1); out.setUTCMonth(mo); out.setUTCDate(Math.min(d.getUTCDate(), last))
  return out.toISOString()
}

export async function membershipForUser(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from('nomad_memberships').select('*').eq('auth_user_id', userId).maybeSingle()
  if (error) throw new Error(`membership read failed: ${error.message}`)
  return data
}

/** Nomad includes Plus while the membership is live, and only then.
 *  Nomad "owns" a member's Plus only while plus_expires_at is still the exact
 *  value Nomad wrote (plus_nomad_exp). If the member buys or is comped Plus
 *  some other way, that value changes and Nomad lets go instead of clobbering
 *  it — even if the purchase route kept the old plus_nomad flag. */
export async function syncPlus(db: SupabaseClient, m: any): Promise<string> {
  const email = String(m.email || '').trim().toLowerCase()
  if (!email) return 'no email'
  const { data: rows, error } = await db.from('customers').select('id, pricing_overrides').eq('email', email).order('created_at', { ascending: true }).limit(1)
  if (error) throw new Error(`customers read failed: ${error.message}`)
  let cust = (rows ?? [])[0]
  const live = LIVE_STATUSES.includes(m.status) && m.paid_through
  if (!cust) {
    if (!live) return 'nothing to do'
    // customers.name and .phone are NOT NULL — see account/plus ensureCustomerRow.
    const { data: created, error: insErr } = await db.from('customers')
      .insert({ email, name: m.name || email.split('@')[0], phone: '' }).select('id, pricing_overrides').maybeSingle()
    if (insErr || !created) throw new Error(`customers insert failed: ${insErr?.message || 'no row'}`)
    cust = created
  }
  const po: any = { ...(cust.pricing_overrides || {}) }
  const nomadOwned = po.plus && po.plus_nomad && po.plus_nomad_exp && po.plus_expires_at === po.plus_nomad_exp
  const ownPlusActive = po.plus && !nomadOwned && (!po.plus_expires_at || Date.parse(po.plus_expires_at) > Date.now())
  const write = async () => {
    const { data: upd, error: updErr } = await db.from('customers').update({ pricing_overrides: po }).eq('id', cust.id).select('id')
    if (updErr || !upd?.length) throw new Error(`Plus sync write failed: ${updErr?.message || 'no row'}`)
  }
  if (ownPlusActive) {
    if (po.plus_nomad || po.plus_nomad_exp) { delete po.plus_nomad; delete po.plus_nomad_exp; await write() }
    return 'member has their own Plus'
  }
  if (live) {
    const exp = new Date(Date.parse(m.paid_through) + 3 * 86_400_000).toISOString()
    if (nomadOwned && po.plus_expires_at === exp) return 'already synced'
    Object.assign(po, { plus: true, plus_nomad: true, plus_nomad_exp: exp, plus_comp: true, plus_expires_at: exp, plus_auto_renew: false })
    po.plus_started_at = po.plus_started_at || new Date().toISOString()
  } else {
    if (!nomadOwned) return 'nothing to do'
    for (const k of ['plus', 'plus_nomad', 'plus_nomad_exp', 'plus_comp', 'plus_expires_at', 'plus_auto_renew', 'plus_started_at']) delete po[k]
  }
  await write()
  return live ? 'Plus on' : 'Plus off'
}

// ── A tiny lock (nomad_locks) to serialize bookings and approvals ─────────
// Check-then-insert is a race: two taps (or two members) can both see room.
// The lock is a row with a unique key; a stale one (>30s) is taken over.
export async function withLock<T>(db: SupabaseClient, key: string, fn: () => Promise<T>): Promise<T | { locked: true }> {
  const stale = new Date(Date.now() - 30_000).toISOString()
  await db.from('nomad_locks').delete().eq('key', key).lt('locked_at', stale)
  const { error } = await db.from('nomad_locks').insert({ key })
  if (error) return { locked: true }
  try { return await fn() } finally { await db.from('nomad_locks').delete().eq('key', key) }
}
export const isLocked = (x: any): x is { locked: true } => !!x && x.locked === true

// ── Square ────────────────────────────────────────────────────────────────
export function square() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  })
}

export async function squareCustomerFor(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from('customer_profiles').select('square_customer_id').eq('id', userId).maybeSingle()
  return data?.square_customer_id ?? null
}

/** Charge the member's chosen card. Never throws; returns the outcome.
 *  The idempotency key = membership + caller seed + card: a same-day repeat of
 *  the same charge on the same card is the SAME payment (no double charge),
 *  while a retry on a NEW card gets a fresh key (Square refuses a reused key
 *  with a different source). */
export async function chargeMember(db: SupabaseClient, m: any, cents: number, note: string, idemSeed: string):
  // One flat shape, not a union: tsconfig strict:false disables union narrowing.
  Promise<{ ok: boolean; paymentId?: string | null; error?: string }> {
  const custId = await squareCustomerFor(db, m.auth_user_id)
  if (!custId) return { ok: false, error: 'No saved card on this account' }
  if (!m.square_card_id) return { ok: false, error: 'No card chosen for Nomad' }
  const sq = square()
  try {
    const cards = (await sq.cardsApi.listCards(undefined, custId)).result.cards ?? []
    const card = cards.find(c => c.id === m.square_card_id)
    if (!card || !isCardUsable(card)) return { ok: false, error: 'The Nomad card is expired or was removed' }
    const cardTail = String(card.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6)
    // ⚠️ Square idempotency keys max out at 45 chars (see the 2026-10-10 lesson).
    const idem = `nm${String(m.id).replace(/-/g, '').slice(0, 16)}${String(idemSeed).replace(/[^a-zA-Z0-9]/g, '').slice(0, 21)}${cardTail}`.slice(0, 45)
    const pay = await sq.paymentsApi.createPayment({
      sourceId: card.id!, customerId: custId, idempotencyKey: idem,
      amountMoney: { amount: BigInt(cents), currency: 'USD' },
      locationId: process.env.SQUARE_LOCATION_ID!, note: note.slice(0, 500),
      buyerEmailAddress: m.email || undefined,
    })
    return { ok: true, paymentId: pay.result.payment?.id ?? null }
  } catch (e: any) {
    const msg = e?.errors?.[0]?.detail || e?.errors?.[0]?.code || e?.message || 'Charge failed'
    console.error('[nomad] charge failed', msg)
    return { ok: false, error: String(msg).slice(0, 300) }
  }
}

export async function paymentLink(cents: number, name: string): Promise<{ url: string; orderId: string | null; linkId: string | null } | null> {
  try {
    const { result } = await square().checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      quickPay: { name: name.slice(0, 255), priceMoney: { amount: BigInt(cents), currency: 'USD' }, locationId: process.env.SQUARE_LOCATION_ID! },
    })
    const url = result.paymentLink?.url
    return url ? { url, orderId: result.paymentLink?.orderId ?? null, linkId: result.paymentLink?.id ?? null } : null
  } catch (e: any) {
    console.error('[nomad] payment link failed', e?.errors ?? e)
    return null
  }
}

/** Kill every open dues payment link for a member (the period got paid some
 *  other way). Deletes the Square link so it can't be paid twice. */
export async function voidOpenLinks(db: SupabaseClient, membershipId: string, note: string) {
  const { data: open } = await db.from('nomad_charges').select('id, payment_link_id').eq('membership_id', membershipId).eq('status', 'link_sent')
  for (const c of open ?? []) {
    if (c.payment_link_id) {
      try { await square().checkoutApi.deletePaymentLink(c.payment_link_id) } catch (e: any) { console.error('[nomad] could not delete payment link', c.payment_link_id, e?.errors ?? e) }
    }
    await db.from('nomad_charges').update({ status: 'void', error: note }).eq('id', c.id).eq('status', 'link_sent')
  }
}

/** Charge one month of dues and extend the membership.
 *  ⚠️ CLAIMS the period first (charging_at compare-and-set on the paid_through
 *  it read), so two simultaneous callers — a double tap, the admin and the
 *  cron — can't both charge it. A paused member restarts from NOW: they are
 *  never billed for months they couldn't use. */
export async function chargeDuesPeriod(db: SupabaseClient, m: any, s: NomadSettings, periodStart: string, retrySeed = '') {
  const cents = Number(m.dues_cents) > 0 ? Number(m.dues_cents) : s.dues_cents
  const nowIso = new Date().toISOString()
  const start = (m.status === 'paused' || !periodStart || Date.parse(periodStart) > Date.now()) ? nowIso : periodStart
  const periodEnd = addMonth(start)
  const key = start.slice(0, 10).replace(/-/g, '')

  const stale = new Date(Date.now() - 5 * 60_000).toISOString()
  let claim = db.from('nomad_memberships').update({ charging_at: nowIso }).eq('id', m.id).or(`charging_at.is.null,charging_at.lt.${stale}`)
  claim = m.paid_through ? claim.eq('paid_through', m.paid_through) : claim.is('paid_through', null)
  const { data: claimed, error: claimErr } = await claim.select('id')
  if (claimErr || !claimed?.length) return { ok: false as const, error: claimErr?.message || 'This month is already being charged or was just paid. Refresh.', cents, periodEnd, skipped: true }

  const release = () => db.from('nomad_memberships').update({ charging_at: null }).eq('id', m.id)
  const res = await chargeMember(db, m, cents, 'Made Kulture Nomad membership', `d${key}${retrySeed}`)
  if (!res.ok) {
    await db.from('nomad_charges').insert({ membership_id: m.id, kind: 'dues', amount_cents: cents, period_start: start, period_end: periodEnd, status: 'failed', error: res.error })
    await release()
    return { ok: false as const, error: res.error, cents, periodEnd, skipped: false }
  }
  const { error: chErr } = await db.from('nomad_charges').insert({ membership_id: m.id, kind: 'dues', amount_cents: cents, period_start: start, period_end: periodEnd, status: 'charged', square_payment_id: res.paymentId })
  if (chErr) console.error('[nomad] CRITICAL: dues charged but charge row not saved', m.id, chErr)
  const { data: upd, error: upErr } = await db.from('nomad_memberships')
    .update({ status: 'active', paid_through: periodEnd, past_due_since: null, charging_at: null, started_at: m.started_at || nowIso })
    .eq('id', m.id).select('*')
  if (upErr || !upd?.length) console.error('[nomad] CRITICAL: dues charged but membership not extended', m.id, upErr)
  const fresh = upd?.[0] ?? { ...m, status: 'active', paid_through: periodEnd }
  await voidOpenLinks(db, m.id, 'paid by card').catch(e => console.error('[nomad] void links failed', e))
  let accrued = 0
  try { accrued = await accrueNights(db, m.id, s, key) } catch (e) { console.error('[nomad] accrual failed', e) }
  try { await syncPlus(db, fresh) } catch (e) { console.error('[nomad] plus sync failed', e) }
  return { ok: true as const, cents, periodEnd, accrued, paymentId: res.paymentId, membership: fresh, skipped: false }
}

/** A paid dues link (or cash marked paid): give the member one month for it.
 *  If the month it was for is already covered (they also paid by card), the
 *  payment buys the NEXT month rather than vanishing. */
export async function applyPaidDues(db: SupabaseClient, charge: any, s: NomadSettings) {
  const { data: m } = await db.from('nomad_memberships').select('*').eq('id', charge.membership_id).maybeSingle()
  if (!m) return null
  const covered = m.paid_through && charge.period_end && Date.parse(m.paid_through) >= Date.parse(charge.period_end)
  const base = covered ? m.paid_through
    : m.status === 'paused' ? new Date().toISOString()
    : (charge.period_start || m.paid_through || new Date().toISOString())
  const newEnd = covered ? addMonth(m.paid_through) : addMonth(base)
  const { data: upd, error } = await db.from('nomad_memberships')
    .update({ status: 'active', paid_through: newEnd, past_due_since: null }).eq('id', m.id).select('*')
  if (error || !upd?.length) { console.error('[nomad] CRITICAL: link paid but membership not extended', m.id, error); return null }
  const key = String(base).slice(0, 10).replace(/-/g, '')
  try { await accrueNights(db, m.id, s, key) } catch (e) { console.error('[nomad] accrual failed', e) }
  try { await syncPlus(db, upd[0]) } catch (e) { console.error('[nomad] plus sync failed', e) }
  await voidOpenLinks(db, m.id, 'superseded by a paid link').catch(() => {})
  return { ...upd[0], covered }
}

// ── Stays ─────────────────────────────────────────────────────────────────
// 'confirming' = an approval is mid-charge; it holds its place like the others.
export const ACTIVE_STAY = ['confirmed', 'requested', 'confirming']

/** Stays (any member) overlapping [checkIn, checkOut), excluding one id. */
export async function overlappingStays(db: SupabaseClient, checkIn: string, checkOut: string, excludeId?: string) {
  let q = db.from('nomad_stays').select('*').in('status', ACTIVE_STAY).lt('check_in', checkOut).gt('check_out', checkIn)
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) throw new Error(`stay lookup failed: ${error.message}`)
  return data ?? []
}

// Flat shape (strict:false disables union narrowing — see rescheduleFailed()).
export type StayCheck = { ok: boolean; error?: string; status?: 'confirmed' | 'requested'; hostStayIds?: string[]; nights?: string[]; cost?: number }

/** Every booking rule in one place. Pure apart from the reads it is given. */
export function checkStay(opts: {
  m: any; s: NomadSettings; checkIn: string; checkOut: string; visibility: string
  overlapping: any[]; myUpcoming: any[]; today?: string
}): StayCheck {
  const { m, s, checkIn, checkOut, overlapping, myUpcoming } = opts
  const today = opts.today ?? mxToday()
  if (m.status !== 'active') return { ok: false, error: 'Your membership needs to be active to book.' }
  if (!isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn) return { ok: false, error: 'Pick a check-in and a later check-out.' }
  if (checkIn < addDays(today, 1)) return { ok: false, error: 'Stays start tomorrow at the earliest.' }
  if (daysBetween(today, checkIn) > s.booking_window_days) return { ok: false, error: `Stays open ${s.booking_window_days} days ahead.` }
  const nights = nightsOf(checkIn, checkOut)
  if (nights.length > s.max_nights_per_stay) return { ok: false, error: `Stays are up to ${s.max_nights_per_stay} nights.` }
  if (!['private', 'chosen', 'any'].includes(opts.visibility)) return { ok: false, error: 'Pick who can stay with you.' }
  const blocking = myUpcoming.filter(x => daysBetween(today, x.check_in) > s.second_stay_lead_days)
  if (blocking.length) return { ok: false, error: `You can book your next stay once your upcoming one is within ${s.second_stay_lead_days} days.` }
  if (overlapping.some(x => x.membership_id === m.id)) return { ok: false, error: 'You already have a stay on those dates.' }

  const hostStayIds: string[] = []
  for (const x of overlapping) {
    if (x.visibility === 'private') return { ok: false, error: 'Someone has the house privately on some of those dates.' }
    if (x.visibility === 'chosen') {
      if (!(x.share_with || []).includes(m.id)) return { ok: false, error: 'Someone is staying on those dates and hasn’t added you to their list.' }
    } else if (x.visibility === 'any') {
      if (!(x.share_with || []).includes(m.id)) hostStayIds.push(x.id)
    }
  }
  // A private stay needs the house empty; otherwise count members per night.
  if (opts.visibility === 'private' && overlapping.length) return { ok: false, error: 'A private stay needs the house to yourself. Someone is already booked on some of those dates.' }
  for (const night of nights) {
    const n = overlapping.filter(x => x.check_in <= night && x.check_out > night).length
    if (n + 1 > s.max_members_at_once) return { ok: false, error: `The house is full on ${night}.` }
  }
  return { ok: true, status: hostStayIds.length ? 'requested' : 'confirmed', hostStayIds, nights, cost: nightCost(nights, s) }
}

/** Mint the stay's door code — only once it's within 3 days of check-in
 *  (the daily cron catches the rest), because an algoPIN can NEVER be revoked:
 *  minting at booking time would leave a live code behind every cancellation.
 *  `force` is the admin's MAKE DOOR CODE button. No-op when not configured. */
export async function issueStayDoorCode(db: SupabaseClient, stay: any, s: NomadSettings, who: string, force = false): Promise<string | null> {
  if (!s.door_codes_enabled || stay.door_code) return stay.door_code ?? null
  if (stay.status !== 'confirmed') return null
  if (!force && daysBetween(mxToday(), stay.check_in) > 3) return null
  try {
    const pin = await createPinForDevice(process.env.NOMAD_IGLOOHOME_DEVICE_ID, {
      startISO: mxInstant(stay.check_in, s.check_in_hour),
      endISO: mxInstant(stay.check_out, s.check_out_hour),
      accessName: `Nomad ${who}`.slice(0, 40),
    })
    if (!pin) return null
    const { error } = await db.from('nomad_stays').update({ door_code: pin.pin }).eq('id', stay.id)
    if (error) console.error('[nomad] CRITICAL: door code minted but not saved', stay.id, error)
    return pin.pin
  } catch (e) {
    console.error('[nomad] door code failed', e)
    return null
  }
}

export const firstName = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || 'A member'

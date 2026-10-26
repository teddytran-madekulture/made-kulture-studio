// Nomad — the members' home bases (2026-10-25). The ONE place the program's
// rules live, so the member routes, the admin routes and the daily cron can
// never disagree. Server-only (service role).
//
// HOUSES (migration 175): every stay belongs to a house (nomad_houses). One
// membership and one night bank work at every house. Program-wide settings
// live in studio_settings 'nomad_settings'; a house can override the
// HOUSE_OVERRIDE_KEYS (its rules, hours, prices) in nomad_houses.overrides.
// Always book/check against houseSettings(s, house), never the bare settings.
//
// ⚠️ TIME ZONE: each house has its own IANA zone. Stay dates are that house's
// calendar dates; instants are built with localInstant(date, hour, tz), never
// lib/booking-times (which assumes Central). Mexico City has no DST since 2022.
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
  // 'simple' (2026-10-26, the default): one member in the house at a time, a
  // flat monthly price, nights_per_month nights each paid month that do NOT
  // roll over, no paid extra nights, every night counts as one. 'bank' is the
  // original model (rollover up to night_cap, extra nights, busy dates,
  // sharing). See applyModel() for what simple locks.
  model: 'simple' | 'bank'
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
  // 2026-10-26 additions
  stay_min_lead_days: number          // stays start at least this many days out
  unused_to_studio_credit: boolean    // simple: a paid month with no trip → part of its dues back as studio credit
  unused_credit_percent: number       // …this % of the member's dues (rest stays with Nomad), rounded to the dollar
  studio_credit_expiry_days: number   // Nomad-sourced studio credit expires after N days (0 = never)
  flights_offered: boolean            // offer the Nomad + Flights add-on
  flight_addon_cents: number          // added to the monthly charge
  flight_credit_cents: number         // of which this much becomes flight credit
  flight_credit_cap_cents: number     // credit tops out here; the add-on pauses while full
  flight_request_lead_days: number    // request flights at least this many days before check-in
}

export const DEFAULT_SETTINGS: NomadSettings = {
  model: 'simple',
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
  stay_min_lead_days: 3,
  unused_to_studio_credit: true,
  unused_credit_percent: 80,
  studio_credit_expiry_days: 0,
  // PARKED 2026-10-26: real IAH↔MEX round trips run ~$300–400 (more at holidays),
  // so a small monthly add-on can't cover a flight. Code stays; switch on in Settings.
  flights_offered: false,
  flight_addon_cents: 8500,
  flight_credit_cents: 7500,
  flight_credit_cap_cents: 30000,
  flight_request_lead_days: 21,
}

// ── Program model ─────────────────────────────────────────────────────────
// The keys the simple model decides for itself. Their saved values are left
// untouched (so switching back to 'bank' restores them) but are overridden on
// every read, at program AND house level.
export const SIMPLE_LOCKED_KEYS = ['night_cap', 'extra_night_cents', 'busy_multiplier', 'busy_ranges', 'max_members_at_once'] as const
export const isSimple = (s: any) => (s?.model ?? DEFAULT_SETTINGS.model) !== 'bank'
export function applyModel<T extends NomadSettings>(s: T): T {
  if (!isSimple(s)) return s
  return { ...s, model: 'simple', night_cap: s.nights_per_month, extra_night_cents: 0, busy_multiplier: 1, busy_ranges: [], max_members_at_once: 1 }
}

// ── Houses ────────────────────────────────────────────────────────────────
// Settings a single house may set differently from the program default.
// Membership money (dues, nights/month, bank cap, grace) stays program-wide.
export const HOUSE_OVERRIDE_KEYS = [
  'extra_night_cents', 'busy_multiplier', 'busy_ranges', 'max_nights_per_stay', 'max_members_at_once',
  'booking_window_days', 'free_cancel_days', 'check_in_hour', 'check_out_hour', 'studio_block_hours',
  'studio_open_hour', 'studio_close_hour', 'max_visitors_per_day', 'door_codes_enabled',
] as const

export const TIMEZONES = [
  'America/Mexico_City', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Bogota', 'America/Lima', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'Europe/London',
  'Europe/Paris', 'Europe/Madrid', 'Europe/Lisbon', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Bangkok', 'Asia/Makassar',
]

/** Program settings + one house's overrides + the house's own facts. */
export type HouseSettings = NomadSettings & {
  house_id: string; house_slug: string; city: string; timezone: string
  lock_device_id: string | null; has_studio: boolean; house_active: boolean
}

export function houseSettings(s: NomadSettings, house: any): HouseSettings {
  const o: any = house?.overrides || {}
  const merged: any = { ...s }
  for (const k of HOUSE_OVERRIDE_KEYS) if (o[k] !== undefined && o[k] !== null && o[k] !== '') merged[k] = o[k]
  // Door codes are a per-house switch only (never inherited): a new house with
  // a lock must not start minting live codes until someone turns it on there.
  merged.door_codes_enabled = o.door_codes_enabled === true
  // The first house keeps working with the env-var lock it was built with.
  const lock = house?.lock_device_id || (house?.slug === 'cdmx' ? process.env.NOMAD_IGLOOHOME_DEVICE_ID || null : null)
  return {
    ...applyModel(merged),
    house_name: house?.name || s.house_name, house_address: house?.address || '',
    house_id: house?.id, house_slug: house?.slug, city: house?.city || '', timezone: house?.timezone || MX_TZ,
    lock_device_id: lock, has_studio: house?.has_studio !== false, house_active: house?.active === true,
  }
}

export async function getHouses(db: SupabaseClient, activeOnly = false): Promise<any[]> {
  let q = db.from('nomad_houses').select('*').order('sort').order('created_at')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(`houses read failed: ${error.message}`)
  return data ?? []
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function getHouse(db: SupabaseClient, id: string): Promise<any | null> {
  if (!id || !UUID_RE.test(id)) return null
  const { data, error } = await db.from('nomad_houses').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`house read failed: ${error.message}`)
  return data
}

/** Clean an admin's house edit. Returns only fields that are safe to write. */
export function cleanHouse(input: any): { patch: any; error?: string } {
  const patch: any = {}
  if (input.name !== undefined) { const v = String(input.name || '').trim().slice(0, 120); if (!v) return { patch, error: 'Give the house a name.' }; patch.name = v }
  if (input.city !== undefined) { const v = String(input.city || '').trim().slice(0, 80); if (!v) return { patch, error: 'Add the city.' }; patch.city = v }
  if (input.timezone !== undefined) {
    const tz = String(input.timezone || '')
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }) } catch { return { patch, error: 'That time zone isn’t valid.' } }
    patch.timezone = tz
  }
  if (input.slug !== undefined) {
    const v = String(input.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)
    if (!v) return { patch, error: 'Add a short code, like la.' }
    patch.slug = v
  }
  if (input.address !== undefined) patch.address = String(input.address || '').slice(0, 300) || null
  if (input.lock_device_id !== undefined) patch.lock_device_id = String(input.lock_device_id || '').trim().slice(0, 80) || null
  if (input.active !== undefined) patch.active = input.active === true
  if (input.has_studio !== undefined) patch.has_studio = input.has_studio !== false
  if (input.sort !== undefined && Number.isFinite(Number(input.sort))) patch.sort = Math.round(Number(input.sort))
  if (input.overrides !== undefined) {
    const o: any = {}
    const src = input.overrides || {}
    for (const k of HOUSE_OVERRIDE_KEYS) {
      const v = src[k]
      if (v === undefined || v === null || v === '') continue
      const d: any = (DEFAULT_SETTINGS as any)[k]
      if (typeof d === 'number') { const n = Number(v); if (Number.isFinite(n) && n >= 0) o[k] = Math.round(n) }
      else if (typeof d === 'boolean') o[k] = v === true
      else if (k === 'busy_ranges' && Array.isArray(v)) {
        o[k] = v.filter((r: any) => isDate(r?.start) && isDate(r?.end) && r.end >= r.start)
          .map((r: any) => ({ start: r.start, end: r.end, label: String(r.label ?? '').slice(0, 60) }))
      }
    }
    if (o.busy_multiplier !== undefined && o.busy_multiplier < 1) o.busy_multiplier = 1
    if (o.max_members_at_once !== undefined && o.max_members_at_once < 1) o.max_members_at_once = 1
    const hourErr = checkHours(o)
    if (hourErr) return { patch, error: hourErr }
    patch.overrides = o
  }
  return { patch }
}

/** The settings everything runs on: saved values with the model applied. */
export async function getNomadSettings(db: SupabaseClient): Promise<NomadSettings> {
  return applyModel(await readRawSettings(db))
}

/** Saved values only (no model applied) — what the admin form edits. */
export async function readRawSettings(db: SupabaseClient): Promise<NomadSettings> {
  const { data, error } = await db.from('studio_settings').select('value').eq('key', 'nomad_settings').maybeSingle()
  if (error) throw new Error(`nomad settings read failed: ${error.message}`)
  let saved: any = {}
  try { saved = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : {} } catch { saved = {} }
  return { ...DEFAULT_SETTINGS, ...saved }
}

export async function saveNomadSettings(db: SupabaseClient, patch: Partial<NomadSettings>): Promise<NomadSettings> {
  const cur = await readRawSettings(db)
  const next: any = { ...cur }
  if ('model' in patch) next.model = (patch as any).model === 'bank' ? 'bank' : 'simple'
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof NomadSettings)[]) {
    if (!(k in patch) || k === 'model') continue
    // Simple mode shows these locked; never let the form's locked display
    // values overwrite the saved bank-model numbers.
    if (next.model !== 'bank' && (SIMPLE_LOCKED_KEYS as readonly string[]).includes(k)) continue
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
  next.unused_credit_percent = Math.min(100, Math.max(0, Number(next.unused_credit_percent) || 0))
  const hourErr = checkHours(next)
  if (hourErr) throw new Error(hourErr)
  // Update-then-insert, same as the other studio_settings writers (no upsert:
  // the key column is not guaranteed unique-constrained).
  const value = JSON.stringify(next)
  let { data, error } = await db.from('studio_settings').update({ value }).eq('key', 'nomad_settings').select('key')
  if (!error && !data?.length) ({ data, error } = await db.from('studio_settings').insert({ key: 'nomad_settings', value }).select('key'))
  if (error || !data?.length) throw new Error(`nomad settings save failed: ${error?.message || 'nothing saved'}`)
  return applyModel(next)
}

/** Hours must be real clock hours, or localInstant() can't build a time and
 *  door codes silently stop. Checks whichever hour keys are present. */
export function checkHours(o: any): string | null {
  for (const k of ['check_in_hour', 'check_out_hour', 'studio_open_hour']) if (o[k] !== undefined && !(o[k] >= 0 && o[k] <= 23)) return 'Hours run 0 to 23.'
  if (o.studio_close_hour !== undefined && !(o.studio_close_hour >= 1 && o.studio_close_hour <= 24)) return 'Studio closing hour runs 1 to 24.'
  if (o.studio_open_hour !== undefined && o.studio_close_hour !== undefined && o.studio_open_hour >= o.studio_close_hour) return 'The studio has to open before it closes.'
  return null
}

// ── House-local dates ─────────────────────────────────────────────────────
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Today's calendar date in a house's time zone. */
export function localToday(tz: string = MX_TZ, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || MX_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
/** Mexico City today (kept for program-wide things: billing seeds, logs). */
export function mxToday(now: Date = new Date()): string { return localToday(MX_TZ, now) }
/** The earliest "today" of any house — a safe lower bound for date queries. */
export function earliestToday(houses: any[]): string {
  const days = (houses.length ? houses : [{ timezone: MX_TZ }]).map(h => localToday(h.timezone))
  return days.sort()[0]
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
/** "2026-11-03" at 15:00 in a house's zone → an ISO instant with the right offset.
 *  The offset is read at that local moment, so DST zones (LA) get it right. */
export function localInstant(date: string, hour: number, tz: string = MX_TZ): string {
  // First guess the offset at noon UTC that day, then re-read it at the real moment.
  const off1 = offsetAt(new Date(`${date}T12:00:00Z`), tz)
  const local = `${date}T${String(hour).padStart(2, '0')}:00:00`
  const off2 = offsetAt(new Date(`${local}${off1}`), tz)
  return `${local}${off2}`
}
export const mxInstant = (date: string, hour: number) => localInstant(date, hour, MX_TZ)
function offsetAt(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || MX_TZ, timeZoneName: 'longOffset' }).formatToParts(instant)
  const name = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-06:00'
  if (name === 'GMT') return '+00:00'
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/)
  return m ? `${m[1]}:${m[2] || '00'}` : '-06:00'
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
/** Add this period's nights. De-duped by period_key.
 *  bank: top up by nights_per_month, never past night_cap.
 *  simple: RESET to exactly nights_per_month — last month's leftovers expire
 *  (the delta can be negative), so nothing ever rolls over. */
export async function accrueNights(db: SupabaseClient, membershipId: string, s: NomadSettings, periodKey: string, m?: any): Promise<number> {
  const bal = await nightBalance(db, membershipId)
  const simple = isSimple(s)
  const add = simple ? s.nights_per_month - bal : Math.max(0, Math.min(s.nights_per_month, s.night_cap - bal))
  // Simple: the whole allowance still unbooked = the member didn't take a trip
  // last month → that month's dues come back as studio credit (below).
  const unusedMonth = simple && s.unused_to_studio_credit && bal >= s.nights_per_month && s.nights_per_month > 0
  if (add === 0 && !unusedMonth) return 0
  if (!simple && add < 0) return 0
  const note = unusedMonth ? 'new month: last month’s trip unused, dues returned as studio credit'
    : simple && bal > 0 ? `new month: ${bal} unused night${bal === 1 ? '' : 's'} expired` : null
  // The accrual row is the CLAIM for this period (unique period_key), so the
  // studio credit below can never be issued twice for one month.
  const { error } = await db.from('nomad_nights').insert({ membership_id: membershipId, delta: add, reason: 'accrual', period_key: periodKey, note })
  if (error) {
    if ((error as any).code === '23505') return 0 // already accrued this period
    throw new Error(`night accrual failed: ${error.message}`)
  }
  if (unusedMonth && m?.auth_user_id) {
    const cents = unusedCreditCents(m, s)
    const ok = cents <= 0 ? true : await issueNomadStudioCredit(db, m.auth_user_id, cents, 'nomad_unused', 'Nomad: unused month returned as studio credit', s)
    if (!ok) console.error('[nomad] CRITICAL: unused month claimed but studio credit NOT issued', membershipId, periodKey, cents)
  }
  return Math.max(0, add)
}
/** What an unused month returns as studio credit: unused_credit_percent of the
 *  member's dues (their locked rate if they have one), rounded to the dollar. */
export function unusedCreditCents(m: any, s: NomadSettings): number {
  const dues = Number(m?.dues_cents) > 0 ? Number(m.dues_cents) : s.dues_cents
  const pct = Math.min(100, Math.max(0, Number(s.unused_credit_percent ?? 80)))
  return Math.round((dues * pct) / 100 / 100) * 100
}
// ── Studio credit that comes from Nomad ───────────────────────────────────
// Kinds starting 'nomad_' in credit_ledger. That money sits in the NOMAD
// account; when it's spent on a Houston booking it is owed to the studio —
// see nomadCreditUsage() and nomad_studio_transfers.
export const NOMAD_CREDIT_KINDS = ['nomad_unused', 'nomad_flight']
export async function issueNomadStudioCredit(db: SupabaseClient, authUserId: string, cents: number, kind: string, reason: string, s: NomadSettings): Promise<boolean> {
  if (!authUserId || !(cents > 0)) return false
  const days = Number(s.studio_credit_expiry_days) || 0
  const expires = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null
  const { error } = await db.from('credit_ledger').insert({
    auth_user_id: authUserId, amount_cents: Math.round(cents), kind, reason, created_by: 'system', expires_at: expires,
  })
  if (error) { console.error('[nomad] studio credit insert failed', error); return false }
  return true
}

/** How much Nomad-sourced studio credit has been SPENT at the studio, by month
 *  (Central). Nomad credit is treated as spent FIRST when a member also has
 *  other studio credit. Expired Nomad credit is never "spent" (it stays in the
 *  Nomad account). Computed from the ledger every time, so it can't drift. */
export async function nomadCreditUsage(db: SupabaseClient): Promise<{ months: { month: string; used_cents: number }[]; issued_cents: number; used_cents: number; unspent_cents: number }> {
  const { data: src, error } = await db.from('credit_ledger').select('auth_user_id').in('kind', NOMAD_CREDIT_KINDS)
  if (error) throw new Error(`credit usage read failed: ${error.message}`)
  const users = Array.from(new Set((src ?? []).map((r: any) => r.auth_user_id)))
  const byMonth = new Map<string, number>()
  let issued = 0, used = 0, unspent = 0
  const monthOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).format(new Date(iso)).slice(0, 7)
  const now = Date.now()
  for (let i = 0; i < users.length; i += 50) {
    const { data: rows, error: rErr } = await db.from('credit_ledger').select('auth_user_id, amount_cents, kind, created_at, expires_at').in('auth_user_id', users.slice(i, i + 50)).order('created_at')
    if (rErr) throw new Error(`credit usage read failed: ${rErr.message}`)
    const per = new Map<string, any[]>()
    for (const r of rows ?? []) { const a = per.get(r.auth_user_id) || []; a.push(r); per.set(r.auth_user_id, a) }
    for (const list of Array.from(per.values())) {
      const lots: { left: number; exp: number | null }[] = []   // Nomad lots, oldest first
      let other = 0
      for (const r of list) {
        const amt = Number(r.amount_cents || 0)
        const at = Date.parse(r.created_at)
        if (amt > 0) {
          if (NOMAD_CREDIT_KINDS.includes(r.kind)) { lots.push({ left: amt, exp: r.expires_at ? Date.parse(r.expires_at) : null }); issued += amt }
          else other += amt
          continue
        }
        let need = -amt
        let fromNomad = 0
        for (const lot of lots) {
          if (need <= 0) break
          if (lot.left <= 0 || (lot.exp !== null && lot.exp < at)) continue
          const take = Math.min(lot.left, need); lot.left -= take; need -= take; fromNomad += take
        }
        other -= Math.min(other, need)
        if (r.kind === 'redeemed' && fromNomad > 0) { used += fromNomad; const k = monthOf(r.created_at); byMonth.set(k, (byMonth.get(k) || 0) + fromNomad) }
      }
      for (const lot of lots) if (lot.left > 0 && (lot.exp === null || lot.exp >= now)) unspent += lot.left
    }
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([month, used_cents]) => ({ month, used_cents }))
  return { months, issued_cents: issued, used_cents: used, unspent_cents: unspent }
}

// ── Flight credit (Nomad + Flights add-on) ────────────────────────────────
export async function flightBalance(db: SupabaseClient, membershipId: string): Promise<number> {
  const { data, error } = await db.from('nomad_flight_credit').select('delta_cents').eq('membership_id', membershipId)
  if (error) throw new Error(`flight credit read failed: ${error.message}`)
  return (data ?? []).reduce((n, r: any) => n + Number(r.delta_cents || 0), 0)
}
/** This month's flight add-on. Paused (not charged, no credit) while there
 *  isn't room under the cap for a full month's credit. */
export function flightPlan(m: any, s: NomadSettings, balance: number) {
  const on = s.flights_offered && m?.flights_enabled === true
  const paused = on && balance + s.flight_credit_cents > s.flight_credit_cap_cents
  const live = on && !paused
  return { on, paused, chargeCents: live ? s.flight_addon_cents : 0, creditCents: live ? Math.min(s.flight_credit_cents, s.flight_addon_cents) : 0 }
}

/** A membership ended: last month's unused trip → studio credit (simple), and
 *  leftover flight credit → studio credit (up to the cap). Each step CLAIMS
 *  with a unique period_key row first, so a retry can't pay out twice. */
export async function settleOnEnd(db: SupabaseClient, m: any, s: NomadSettings): Promise<{ unusedCents: number; flightCents: number }> {
  const out = { unusedCents: 0, flightCents: 0 }
  const key = `end${String(m.ended_at || m.paid_through || new Date().toISOString()).slice(0, 10).replace(/-/g, '')}`
  if (isSimple(s)) {
    const bal = await nightBalance(db, m.id)
    if (bal !== 0) {
      const { error } = await db.from('nomad_nights').insert({ membership_id: m.id, delta: -bal, reason: 'ended', period_key: key, note: 'membership ended' })
      if (!error && s.unused_to_studio_credit && bal >= s.nights_per_month && s.nights_per_month > 0 && m.auth_user_id && unusedCreditCents(m, s) > 0) {
        const cents = unusedCreditCents(m, s)
        if (await issueNomadStudioCredit(db, m.auth_user_id, cents, 'nomad_unused', 'Nomad: last month unused, returned as studio credit', s)) out.unusedCents = cents
        else console.error('[nomad] CRITICAL: end-of-membership unused credit NOT issued', m.id)
      }
    }
  }
  const fb = await flightBalance(db, m.id)
  if (fb > 0) {
    const toStudio = Math.min(fb, s.flight_credit_cap_cents)
    const { error } = await db.from('nomad_flight_credit').insert({ membership_id: m.id, delta_cents: -fb, reason: 'to_studio_credit', period_key: key, note: `moved $${(toStudio / 100).toFixed(2)} to studio credit` })
    if (!error && m.auth_user_id) {
      if (await issueNomadStudioCredit(db, m.auth_user_id, toStudio, 'nomad_flight', 'Nomad: leftover flight credit', s)) out.flightCents = toStudio
      else console.error('[nomad] CRITICAL: flight credit cleared but studio credit NOT issued', m.id, toStudio)
    }
  }
  return out
}

/** How many of `n` cancelled nights go back. Simple: never past this month's
 *  allowance (a stay paid with LAST month's nights can't double them up). */
export async function nightsToReturn(db: SupabaseClient, membershipId: string, n: number, s: NomadSettings): Promise<number> {
  if (n <= 0) return 0
  if (!isSimple(s)) return n
  const bal = await nightBalance(db, membershipId)
  return Math.max(0, Math.min(n, s.nights_per_month - bal))
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
  const baseCents = Number(m.dues_cents) > 0 ? Number(m.dues_cents) : s.dues_cents
  let cents = baseCents
  let flightCents = 0, flightCredit = 0, flightPaused = false
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
  // A flights add/drop the member chose takes effect at the start of a period.
  if (m.flights_next === true || m.flights_next === false) {
    const { data: fl } = await db.from('nomad_memberships').update({ flights_enabled: m.flights_next, flights_next: null }).eq('id', m.id).select('flights_enabled')
    if (fl?.length) m = { ...m, flights_enabled: fl[0].flights_enabled, flights_next: null }
  }
  try {
    const plan = flightPlan(m, s, await flightBalance(db, m.id))
    flightCents = plan.chargeCents; flightCredit = plan.creditCents; flightPaused = plan.paused
  } catch (e) { console.error('[nomad] flight plan failed; charging dues only', e) }
  cents = baseCents + flightCents
  const res = await chargeMember(db, m, cents, flightCents ? 'Made Kulture Nomad membership + flights' : 'Made Kulture Nomad membership', `d${key}${flightCents ? 'f' : ''}${retrySeed}`)
  if (!res.ok) {
    await db.from('nomad_charges').insert({ membership_id: m.id, kind: 'dues', amount_cents: cents, flight_cents: flightCents, period_start: start, period_end: periodEnd, status: 'failed', error: res.error })
    await release()
    return { ok: false as const, error: res.error, cents, flightCents, periodEnd, skipped: false }
  }
  const { error: chErr } = await db.from('nomad_charges').insert({ membership_id: m.id, kind: 'dues', amount_cents: cents, flight_cents: flightCents, period_start: start, period_end: periodEnd, status: 'charged', square_payment_id: res.paymentId })
  if (chErr) console.error('[nomad] CRITICAL: dues charged but charge row not saved', m.id, chErr)
  const { data: upd, error: upErr } = await db.from('nomad_memberships')
    .update({ status: 'active', paid_through: periodEnd, past_due_since: null, charging_at: null, started_at: m.started_at || nowIso })
    .eq('id', m.id).select('*')
  if (upErr || !upd?.length) console.error('[nomad] CRITICAL: dues charged but membership not extended', m.id, upErr)
  const fresh = upd?.[0] ?? { ...m, status: 'active', paid_through: periodEnd }
  await voidOpenLinks(db, m.id, 'paid by card').catch(e => console.error('[nomad] void links failed', e))
  if (flightCredit > 0) {
    const { error: fcErr } = await db.from('nomad_flight_credit').insert({ membership_id: m.id, delta_cents: flightCredit, reason: 'addon', period_key: key })
    if (fcErr && (fcErr as any).code !== '23505') console.error('[nomad] CRITICAL: flight add-on charged but credit not added', m.id, fcErr)
  }
  let accrued = 0
  try { accrued = await accrueNights(db, m.id, s, key, fresh) } catch (e) { console.error('[nomad] accrual failed', e) }
  try { await syncPlus(db, fresh) } catch (e) { console.error('[nomad] plus sync failed', e) }
  return { ok: true as const, cents, flightCents, flightPaused, periodEnd, accrued, paymentId: res.paymentId, membership: fresh, skipped: false }
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
  if (Number(charge.flight_cents) > 0) {
    const credit = Math.min(s.flight_credit_cents, Number(charge.flight_cents))
    const { error: fcErr } = await db.from('nomad_flight_credit').insert({ membership_id: m.id, delta_cents: credit, reason: 'addon', period_key: key })
    if (fcErr && (fcErr as any).code !== '23505') console.error('[nomad] CRITICAL: paid flight add-on but credit not added', m.id, fcErr)
  }
  try { await accrueNights(db, m.id, s, key, upd[0]) } catch (e) { console.error('[nomad] accrual failed', e) }
  try { await syncPlus(db, upd[0]) } catch (e) { console.error('[nomad] plus sync failed', e) }
  await voidOpenLinks(db, m.id, 'superseded by a paid link').catch(() => {})
  return { ...upd[0], covered }
}

// ── Stays ─────────────────────────────────────────────────────────────────
// 'confirming' = an approval is mid-charge; it holds its place like the others.
export const ACTIVE_STAY = ['confirmed', 'requested', 'confirming']

/** Stays (any member) at ONE house overlapping [checkIn, checkOut), excluding one id. */
export async function overlappingStays(db: SupabaseClient, houseId: string, checkIn: string, checkOut: string, excludeId?: string) {
  if (!houseId) throw new Error('overlappingStays needs a house')
  let q = db.from('nomad_stays').select('*').eq('house_id', houseId).in('status', ACTIVE_STAY).lt('check_in', checkOut).gt('check_out', checkIn)
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) throw new Error(`stay lookup failed: ${error.message}`)
  return data ?? []
}

// Flat shape (strict:false disables union narrowing — see rescheduleFailed()).
export type StayCheck = { ok: boolean; error?: string; status?: 'confirmed' | 'requested'; hostStayIds?: string[]; nights?: string[]; cost?: number }

/** Every booking rule in one place. Pure apart from the reads it is given.
 *  `s` is houseSettings() for the house being booked; `overlapping` is that
 *  house's stays; `myUpcoming` is the member's stays at EVERY house. */
export function checkStay(opts: {
  m: any; s: NomadSettings | HouseSettings; checkIn: string; checkOut: string; visibility: string
  overlapping: any[]; myUpcoming: any[]; today?: string
}): StayCheck {
  const { m, s, checkIn, checkOut, overlapping, myUpcoming } = opts
  const today = opts.today ?? localToday((s as any).timezone || MX_TZ)
  if (m.status !== 'active') return { ok: false, error: 'Your membership needs to be active to book.' }
  if ((s as any).house_id && !(s as any).house_active) return { ok: false, error: 'That house isn’t open for booking yet.' }
  if (!isDate(checkIn) || !isDate(checkOut) || checkOut <= checkIn) return { ok: false, error: 'Pick a check-in and a later check-out.' }
  const lead = Math.max(1, Number((s as any).stay_min_lead_days) || 1)
  if (checkIn < addDays(today, lead)) return { ok: false, error: lead === 1 ? 'Stays start tomorrow at the earliest.' : `Stays need at least ${lead} days’ notice.` }
  if (daysBetween(today, checkIn) > s.booking_window_days) return { ok: false, error: `Stays open ${s.booking_window_days} days ahead.` }
  const nights = nightsOf(checkIn, checkOut)
  if (nights.length > s.max_nights_per_stay) return { ok: false, error: `Stays are up to ${s.max_nights_per_stay} nights.` }
  if (!['private', 'chosen', 'any'].includes(opts.visibility)) return { ok: false, error: 'Pick who can stay with you.' }
  const blocking = myUpcoming.filter(x => daysBetween(today, x.check_in) > s.second_stay_lead_days)
  if (blocking.length) return { ok: false, error: `You can book your next stay once your upcoming one is within ${s.second_stay_lead_days} days.` }
  if (overlapping.some(x => x.membership_id === m.id)) return { ok: false, error: 'You already have a stay on those dates.' }
  // Simple: one member at a time, so any other stay on those dates means no.
  if (isSimple(s) && overlapping.length) return { ok: false, error: 'Another member has the house on some of those dates.' }
  // One member, one place: no overlapping stays across houses either.
  if (myUpcoming.some(x => x.check_out && x.check_in < checkOut && x.check_out > checkIn)) return { ok: false, error: 'You already have a stay on those dates (at another house).' }

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

/** Mint the stay's door code (lock = the stay's house) — only within 3 days of check-in
 *  (the daily cron catches the rest), because an algoPIN can NEVER be revoked:
 *  minting at booking time would leave a live code behind every cancellation.
 *  `force` is the admin's MAKE DOOR CODE button. No-op when not configured. */
export async function issueStayDoorCode(db: SupabaseClient, stay: any, s: HouseSettings, who: string, force = false): Promise<string | null> {
  if (!s.door_codes_enabled || stay.door_code) return stay.door_code ?? null
  if (stay.status !== 'confirmed') return null
  if (!s.lock_device_id) return null
  if (stay.house_id && s.house_id && stay.house_id !== s.house_id) { console.error('[nomad] door code: settings are for another house', stay.id); return null }
  if (!force && daysBetween(localToday(s.timezone), stay.check_in) > 3) return null
  try {
    const pin = await createPinForDevice(s.lock_device_id, {
      startISO: localInstant(stay.check_in, s.check_in_hour, s.timezone),
      endISO: localInstant(stay.check_out, s.check_out_hour, s.timezone),
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

/** A membership ended: cancel its stays that haven't started yet, judged by
 *  each house's own "today". Nights are not refunded (the membership is over). */
export async function cancelFutureStays(db: SupabaseClient, membershipId: string): Promise<number> {
  const houses = await getHouses(db)
  const tz = new Map(houses.map(h => [h.id, h.timezone]))
  // Not 'confirming': an approval is mid-charge on that one; it finishes first.
  const { data, error } = await db.from('nomad_stays').select('id, house_id, check_in').eq('membership_id', membershipId).in('status', ['confirmed', 'requested']).gte('check_in', earliestToday(houses))
  if (error) throw new Error(`future stays read failed: ${error.message}`)
  const ids = (data ?? []).filter(x => x.check_in > localToday(tz.get(x.house_id))).map(x => x.id)
  if (!ids.length) return 0
  const { data: done, error: upErr } = await db.from('nomad_stays').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).in('id', ids).in('status', ['confirmed', 'requested']).select('id')
  if (upErr) throw new Error(`future stays cancel failed: ${upErr.message}`)
  const doneIds = (done ?? []).map(x => x.id)
  if (!doneIds.length) return 0
  await db.from('nomad_studio_blocks').update({ status: 'cancelled' }).in('stay_id', doneIds)
  await db.from('nomad_visitors').update({ status: 'cancelled' }).in('stay_id', doneIds)
  for (const id of doneIds) await releaseWaitingOn(db, id).catch(e => console.error('[nomad] release waiting failed', id, e))
  return doneIds.length
}

/** A stay was cancelled: join requests that were waiting on its OK drop it.
 *  If nobody is left to approve one, it's declined and its nights go back.
 *  Returns the released requests (for pushes). */
export async function releaseWaitingOn(db: SupabaseClient, stayId: string): Promise<any[]> {
  const released: any[] = []
  const { data: waiting } = await db.from('nomad_stays').select('id, host_stay_ids').eq('status', 'requested').contains('host_stay_ids', [stayId])
  for (const w of waiting ?? []) {
    const left = (w.host_stay_ids || []).filter((h: string) => h !== stayId)
    if (left.length) { await db.from('nomad_stays').update({ host_stay_ids: left }).eq('id', w.id).eq('status', 'requested'); continue }
    const { data: rel } = await db.from('nomad_stays').update({ status: 'declined', cancelled_at: new Date().toISOString(), host_stay_ids: [] }).eq('id', w.id).eq('status', 'requested').select('id, membership_id, nights_cost, check_in, check_out, nomad_memberships ( auth_user_id )')
    const r0: any = rel?.[0]
    if (!r0) continue
    if (r0.nights_cost > 0) await db.from('nomad_nights').insert({ membership_id: r0.membership_id, delta: r0.nights_cost, reason: 'stay_refund', stay_id: r0.id, note: 'host cancelled' })
    released.push(r0)
  }
  return released
}

export const firstName = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || 'A member'

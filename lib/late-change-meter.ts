// Late-change meter — "booking flexibility" (Teddy, 2026-10-02).
//
// Plus has no fixed limit on cancels/reschedules (Terms → Fair use). This meter
// is the throttle behind that: it moves with behaviour in BOTH directions and
// recovers on its own, like an "unlimited" data plan that slows down after
// heavy use and comes back.
//
//   +1  each LATE change by the customer (cancel / reschedule / release inside
//       48h of the session's ORIGINAL start), counted for 30 days
//   −1  each session they actually use after their first counted late change
//   chain: the same session changed 3+ times in a row (direct moves AND
//       cancel → credit → rebook) ⇒ at least ORANGE, until that session is used
//
//   0–2 green · 3 orange (heads-up, owner told) · 4+ red (late changes need OK)
//
// SEPARATE from Account Standing (incident points): the meter never adds
// standing points. Escalating is the owner's call ("Repeated late changes"
// incident category). Reads booking_changes (migration 134).
import type { SupabaseClient } from '@supabase/supabase-js'
import { LATE_CHANGE_HOURS } from '@/lib/booking-changes'

export type MeterLevel = 'green' | 'orange' | 'red'

export const METER_WINDOW_DAYS = 30
export const METER_ORANGE_AT = 3
export const METER_RED_AT = 4
export const METER_CHAIN_ORANGE_AT = 3

export interface MeterIdent { authUserId?: string | null; email?: string | null }

export interface LateChangeMeter {
  level: MeterLevel
  points: number          // late changes − sessions used since
  lateChanges: number     // in the window
  sessionsUsed: number    // counted against them
  longestChain: number    // longest active chain on an upcoming session
  nextDropOff: string | null  // ISO — when the oldest late change leaves the window
}

export const METER_LABEL: Record<MeterLevel, string> = { green: 'Flexible', orange: 'Heads-up', red: 'Needs approval' }

const GREEN: LateChangeMeter = { level: 'green', points: 0, lateChanges: 0, sessionsUsed: 0, longestChain: 0, nextDropOff: null }

function levelFor(points: number, chain: number): MeterLevel {
  if (points >= METER_RED_AT) return 'red'
  if (points >= METER_ORANGE_AT || chain >= METER_CHAIN_ORANGE_AT) return 'orange'
  return 'green'
}

/**
 * ⚠️ Fails OPEN (returns green) on a read error — a broken meter must never block
 * a customer's booking. It logs the error so a silent failure is still visible.
 */
export async function lateChangeMeter(service: SupabaseClient, ident: MeterIdent, now = Date.now()): Promise<LateChangeMeter> {
  const uid = ident.authUserId || null
  const email = (ident.email || '').trim().toLowerCase() || null
  if (!uid && !email) return GREEN
  try {
    const since = new Date(now - METER_WINDOW_DAYS * 86_400_000).toISOString()

    // ── Customer changes in the window (by account OR email, de-duplicated) ──
    const reads: Promise<any>[] = []
    const cols = 'id, booking_id, kind, hours_notice, credit_cents, created_at'
    if (uid) reads.push(service.from('booking_changes').select(cols).eq('actor', 'customer').eq('auth_user_id', uid).gte('created_at', since) as any)
    if (email) reads.push(service.from('booking_changes').select(cols).eq('actor', 'customer').eq('customer_email', email).gte('created_at', since) as any)
    const res = await Promise.all(reads)
    for (const r of res) if (r.error) throw new Error(r.error.message)
    const byId = new Map<string, any>()
    for (const r of res) for (const row of r.data ?? []) byId.set(row.id, row)
    const changes = [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    if (!changes.length) return GREEN

    const late = changes.filter(c => c.hours_notice != null && Number(c.hours_notice) < LATE_CHANGE_HOURS)

    // ── Their bookings (to credit sessions used, and find active chains) ──
    const bReads: Promise<any>[] = []
    const bCols = 'id, status, start_time, end_time'
    if (uid) bReads.push(service.from('bookings').select(bCols).eq('auth_user_id', uid).gte('end_time', since) as any)
    if (email) bReads.push(service.from('bookings').select(`${bCols}, customers!inner(email)`).eq('customers.email', email).gte('end_time', since) as any)
    const bRes = await Promise.all(bReads)
    for (const r of bRes) if (r.error) throw new Error(r.error.message)
    const bookings = new Map<string, any>()
    for (const r of bRes) for (const b of r.data ?? []) bookings.set(b.id, b)

    // Sessions used: ended after their first counted late change, not cancelled/no-show.
    const firstLateMs = late.length ? Date.parse(late[0].created_at) : Infinity
    let sessionsUsed = 0
    for (const b of bookings.values()) {
      const endMs = Date.parse(b.end_time)
      if ((b.status === 'confirmed' || b.status === 'completed') && endMs <= now && endMs > firstLateMs) sessionsUsed++
    }
    const points = Math.max(0, late.length - sessionsUsed)

    // ── Chains: direct moves on one booking + cancel → credit → rebook ──
    const perBooking = new Map<string, number>()
    for (const c of changes) if (c.booking_id) perBooking.set(c.booking_id, (perBooking.get(c.booking_id) ?? 0) + 1)
    const parent = new Map<string, string>()   // rebooked → the booking it came from
    if (uid) {
      const exits = changes.filter(c => (c.kind === 'cancel' || c.kind === 'release_credit') && Number(c.credit_cents) > 0 && c.booking_id)
      if (exits.length) {
        const { data: redeemed, error } = await service.from('credit_ledger')
          .select('booking_id, created_at').eq('auth_user_id', uid).eq('kind', 'redeemed')
          .gte('created_at', exits[0].created_at).order('created_at', { ascending: true })
        if (error) throw new Error(error.message)
        const used = new Set<number>()
        for (const ex of exits) {
          const i = (redeemed ?? []).findIndex((r: any, idx: number) =>
            !used.has(idx) && r.booking_id && r.booking_id !== ex.booking_id && Date.parse(r.created_at) > Date.parse(ex.created_at))
          if (i >= 0) { used.add(i); parent.set((redeemed as any)[i].booking_id, ex.booking_id) }
        }
      }
    }
    const chainLen = (id: string, guard = 0): number =>
      (perBooking.get(id) ?? 0) + (guard < 20 && parent.has(id) ? chainLen(parent.get(id)!, guard + 1) : 0)
    let longestChain = 0
    for (const b of bookings.values()) {
      if (b.status !== 'confirmed' || Date.parse(b.end_time) <= now) continue   // a used session ends its chain
      longestChain = Math.max(longestChain, chainLen(b.id))
    }

    const nextDropOff = points > 0 && late.length
      ? new Date(Date.parse(late[0].created_at) + METER_WINDOW_DAYS * 86_400_000).toISOString()
      : null
    return { level: levelFor(points, longestChain), points, lateChanges: late.length, sessionsUsed, longestChain, nextDropOff }
  } catch (e) {
    console.error('[late-change-meter] read failed — failing open (green):', e)
    return GREEN
  }
}

/** Plain-English line for the customer's account page. */
export function meterMessage(m: LateChangeMeter): string {
  if (m.level === 'green') return 'You can cancel or move sessions freely under your plan.'
  const what = m.longestChain >= METER_CHAIN_ORANGE_AT && m.points < METER_ORANGE_AT
    ? `One session has been changed ${m.longestChain} times.`
    : `${m.points} recent last-minute change${m.points === 1 ? '' : 's'}.`
  const fix = 'Using your next booking as planned brings this back down, and changes also clear after 30 days.'
  return m.level === 'red'
    ? `${what} For now, changes inside 48 hours come to us for a quick OK. ${fix}`
    : `${what} ${fix}`
}

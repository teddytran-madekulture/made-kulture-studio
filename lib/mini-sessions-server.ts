// MINI SESSIONS — server side: loading with an ownership check, the client
// emails/texts, and the hourly upkeep (follow a moved or cancelled booking,
// morning-of reminders, the 90-day clean-out). Pure helpers: lib/mini-sessions.
//
// ⚠️ Every send here is best-effort and caught. A failed email must never undo
// a sign-up or a roster change — the roster is the record, the email is a nicety.
// ⚠️ sendSimpleEmail drops paragraphs in as raw HTML, so EVERYTHING a person
// typed goes through esc() first.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSimpleEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'
import { centralDateStr, centralHourDecimal, bookingHourToISO, bookingEndISO } from '@/lib/booking-times'
import {
  type MiniSession, type MiniClient, type MiniBooking, type Slot,
  slotsFor, headcountLimit, partyRoom, extrasFor, fmtTime, fmtDay, fmtDayShort, slotLabel, esc, payHost, RETENTION_DAYS,
} from '@/lib/mini-sessions'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { createOrderForPayment } from '@/lib/square-order'
import { sendOwnerPush } from '@/lib/push'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
export const STUDIO_ADDRESS = '4825 Gulf Freeway, Houston TX 77023'

export const BOOKING_SELECT = `id, start_time, end_time, status, set_id, guest_count, auth_user_id,
  customer_id, customers ( name, email, phone ), sets ( name, slug )`

export type OwnedBooking = MiniBooking & {
  auth_user_id: string | null
  customers?: { name: string | null; email: string | null; phone: string | null } | null
  /** true when this is a PLANNED day's stand-in, not a real booking (migration 161). */
  planned?: boolean
}

// ── Planned days (migration 161) ────────────────────────────────────────────
// A plan has no booking yet. Everything downstream (slots, headcount, emails)
// reads a booking, so a plan gets a stand-in built from its planned fields.
// Its status is 'planned'; its id is the mini's own id.
export const isPlanned = (m: Pick<MiniSession, 'booking_id'>) => !m.booking_id

export async function plannedBooking(db: SupabaseClient, m: MiniSession): Promise<OwnedBooking> {
  let sets: { name: string | null; slug: string | null } | null = null
  if (m.planned_set_id) {
    const { data } = await db.from('sets').select('name, slug').eq('id', m.planned_set_id).maybeSingle()
    sets = (data as any) ?? null
  }
  const [{ data: prof }, { data: au }] = await Promise.all([
    db.from('customer_profiles').select('full_name').eq('id', m.owner_user_id).maybeSingle(),
    db.auth.admin.getUserById(m.owner_user_id).catch(() => ({ data: { user: null } } as any)),
  ])
  return {
    id: m.id, start_time: m.planned_start!, end_time: m.planned_end!,
    status: m.status === 'cancelled' ? 'cancelled' : 'planned',
    set_id: m.planned_buyout ? null : m.planned_set_id, guest_count: null,
    auth_user_id: m.owner_user_id,
    customers: { name: (prof as any)?.full_name ?? null, email: (au as any)?.user?.email ?? null, phone: null },
    sets, planned: true,
  }
}

/**
 * A plan must be bookable exactly as planned: whole-hour start inside studio
 * hours (9 AM – 10 PM), the set's minimum (buyout 4h), and far enough out that
 * a normal booking (48 hours' notice) is still possible.
 */
export const PLAN_LEAD_HOURS = 48
export async function validatePlanWindow(db: SupabaseClient, o: { date: string; startHour: number; endHour: number; setId: string | null; buyout: boolean }):
  Promise<{ ok: true; start: string; end: string; setId: string | null } | { ok: false; error: string }> {
  const { date, startHour: sh, endHour: eh } = o
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Pick a date.' }
  if (!Number.isInteger(sh) || !Number.isInteger(eh * 2)) return { ok: false, error: 'Bookings start on the hour.' }
  if (sh < 9 || eh > 22) return { ok: false, error: 'Pick a time between 9 AM and 10 PM.' }
  let setId: string | null = null, minH = 4
  if (!o.buyout) {
    const { data: set } = await db.from('sets').select('id, is_active, min_hours').eq('id', String(o.setId || '')).maybeSingle()
    if (!set || !(set as any).is_active) return { ok: false, error: 'Pick a set.' }
    setId = (set as any).id; minH = Number((set as any).min_hours) || 1
  }
  if (eh - sh < minH) return { ok: false, error: `That ${o.buyout ? 'full warehouse booking' : 'set'} needs at least ${minH} hour${minH === 1 ? '' : 's'}.` }
  const start = bookingHourToISO(date, sh), end = bookingEndISO(date, sh, eh)
  if (!Number.isFinite(Date.parse(start)) || centralDateStr(start) !== date) return { ok: false, error: 'That date doesn’t exist.' }
  // 48h booking notice + a day to actually book it before the plan is called off.
  if (Date.parse(start) < Date.now() + (PLAN_LEAD_HOURS + 24) * 3_600_000) return { ok: false, error: 'Plan at least 3 days ahead — you’ll need to book it 48 hours before.' }
  return { ok: true, start, end, setId }
}

/** The owner's confirmed booking that matches a plan (same day, overlapping, same set / buyout), if any. */
export async function findMatchingBooking(db: SupabaseClient, m: MiniSession, ownerEmail: string | null, statuses: string[] = ['confirmed']): Promise<OwnedBooking | null> {
  if (!m.planned_start || !m.planned_end) return null
  const date = centralDateStr(m.planned_start)
  const { data } = await db.from('bookings').select(BOOKING_SELECT)
    .in('status', statuses).lt('start_time', m.planned_end).gt('end_time', m.planned_start)
  const ok = ((data ?? []) as any[]).filter(b =>
    centralDateStr(b.start_time) === date &&
    (m.planned_buyout ? b.set_id == null : b.set_id === m.planned_set_id) &&
    ownsBooking(b, { id: m.owner_user_id, email: ownerEmail }))
  if (!ok.length) return null
  const { data: used } = await db.from('mini_sessions').select('booking_id').in('booking_id', ok.map(b => b.id))
  const usedSet = new Set((used ?? []).map((u: any) => u.booking_id))
  return ok.find(b => !usedSet.has(b.id)) ?? null
}

/** The booking a mini day runs on — the real one, or a plan's stand-in. */
export async function bookingForMini(db: SupabaseClient, m: MiniSession): Promise<OwnedBooking | null> {
  if (isPlanned(m)) return plannedBooking(db, m)
  const { data } = await db.from('bookings').select(BOOKING_SELECT).eq('id', m.booking_id!).maybeSingle()
  return (data as any) ?? null
}

/**
 * Is the planned time still free? A plan holds nothing, so someone else may
 * book it. Bookings by the photographer themselves don't count — that's the
 * booking they'll attach.
 */
export async function planConflicts(db: SupabaseClient, m: MiniSession, ownerEmail: string | null): Promise<number> {
  if (!m.planned_start || !m.planned_end) return 0
  // Only bookings that really hold the time: paid, or a live payment hold.
  let q = db.from('bookings').select('id, set_id, auth_user_id, customers ( email )')
    .in('status', ['pending', 'confirmed', 'pending_payment']).lt('start_time', m.planned_end).gt('end_time', m.planned_start)
  // A buyout plan collides with anything; a set plan with that set or a buyout.
  if (!m.planned_buyout && m.planned_set_id) q = q.or(`set_id.eq.${m.planned_set_id},set_id.is.null`)
  const { data, error } = await q
  if (error) { console.error('[minis] conflict check failed', error); return 0 }
  const mine = (b: any) => b.auth_user_id === m.owner_user_id || (!!ownerEmail && (b.customers?.email || '').toLowerCase() === ownerEmail.toLowerCase())
  return (data ?? []).filter(b => !mine(b)).length
}

export const shareUrl = (m: Pick<MiniSession, 'share_token'>) => `${APP_URL}/minis/${m.share_token}`
export const clientUrl = (c: Pick<MiniClient, 'manage_token'>) => `${APP_URL}/minis/c/${c.manage_token}`

export interface GuestSettings { capacity: number; maxPerSet: number; extraFee: number }

export async function guestSettings(db: SupabaseClient, opts: { strict?: boolean } = {}): Promise<GuestSettings> {
  const { data, error } = await db.from('studio_settings').select('key, value')
    .in('key', ['guest_capacity_per_set', 'max_guests_per_set', 'mini_extra_guest_fee'])
  // Billing must not guess: a failed read throws so the charge retries next hour.
  if (error && opts.strict) throw new Error(error.message)
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
  return {
    capacity: Number(map['guest_capacity_per_set']) || 5,
    maxPerSet: Number(map['max_guests_per_set']) || 7,
    // Whole dollars per extra person per slot. Teddy set $5 on 2026-10-09.
    extraFee: (() => { const n = Math.round(Number(map['mini_extra_guest_fee'] ?? 5)); return Number.isFinite(n) && n >= 0 ? n : 5 })(),
  }
}

export async function limitFor(db: SupabaseClient, b: MiniBooking): Promise<number> {
  return headcountLimit(b, await guestSettings(db))
}

/** Same ownership rule as every /api/account/bookings route: auth id OR the booking's email. */
export function ownsBooking(b: OwnedBooking, user: { id: string; email?: string | null }): boolean {
  const be = b.customers?.email?.toLowerCase() ?? null
  return b.auth_user_id === user.id || (!!be && be === (user.email ?? '').toLowerCase())
}

export type OwnerLoad =
  | { ok: true; booking: OwnedBooking; mini: MiniSession | null; clients: MiniClient[]; attached?: { confirmed: number; bumped: number } }
  | { ok: false; status: number; error: string }

export async function loadForOwner(db: SupabaseClient, user: { id: string; email?: string | null }, bookingId: string): Promise<OwnerLoad> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return { ok: false, status: 404, error: 'Booking not found.' }
  const { data: b, error } = await db.from('bookings').select(BOOKING_SELECT).eq('id', bookingId).maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!b) {
    // Not a booking id — maybe a PLANNED day (its URL uses the mini's own id).
    const { data: pm, error: pErr } = await db.from('mini_sessions').select('*').eq('id', bookingId).maybeSingle()
    if (pErr) return { ok: false, status: 500, error: pErr.message }
    if (!pm || (pm as any).owner_user_id !== user.id) return { ok: false, status: 404, error: 'Booking not found.' }
    const mini = pm as MiniSession
    // A plan that has since been attached lives at its booking's URL.
    if (!isPlanned(mini)) return loadForOwner(db, user, mini.booking_id!)
    const { data: cs, error: cErr } = await db.from('mini_session_clients').select('*')
      .eq('mini_session_id', mini.id).order('slot_index').order('created_at')
    if (cErr) return { ok: false, status: 500, error: cErr.message }
    return { ok: true, booking: await plannedBooking(db, mini), mini, clients: (cs ?? []) as MiniClient[] }
  }
  if (!ownsBooking(b as any, user)) return { ok: false, status: 404, error: 'Booking not found.' }
  let attached: { confirmed: number; bumped: number } | undefined
  let { data: m, error: mErr } = await db.from('mini_sessions').select('*').eq('booking_id', bookingId).maybeSingle()
  if (mErr) return { ok: false, status: 500, error: mErr.message }
  if (!m && (b as any).status === 'confirmed') {
    // This booking may be the one a PLAN was waiting for — attach it instead of
    // starting a fresh, empty mini day (which would strand the plan's clients).
    const { data: plans } = await db.from('mini_sessions').select('*')
      .eq('owner_user_id', user.id).is('booking_id', null).neq('status', 'cancelled').order('created_at')
    for (const p of (plans ?? []) as MiniSession[]) {
      const r = await attachPlan(db, p, b as any)
      if (r.ok) {
        const { data: again } = await db.from('mini_sessions').select('*').eq('booking_id', bookingId).maybeSingle()
        m = again
        attached = { confirmed: r.confirmed ?? 0, bumped: r.bumped ?? 0 }
        break
      }
    }
  }
  let clients: MiniClient[] = []
  if (m) {
    const { data: cs, error: cErr } = await db.from('mini_session_clients').select('*')
      .eq('mini_session_id', m.id).order('slot_index').order('created_at')
    if (cErr) return { ok: false, status: 500, error: cErr.message }
    clients = (cs ?? []) as MiniClient[]
  }
  return { ok: true, booking: b as any, mini: (m as MiniSession) ?? null, clients, attached }
}

/** The name clients see: directory name, else the booking name. */
export async function photographerName(db: SupabaseClient, b: OwnedBooking, ownerId: string): Promise<string> {
  const { data } = await db.from('customer_profiles').select('full_name').eq('id', ownerId).maybeSingle()
  return (data as any)?.full_name || b.customers?.name || 'Your photographer'
}

// ── Messages to clients ─────────────────────────────────────────────────────
interface Ctx { mini: MiniSession; booking: OwnedBooking; photographer: string }

function slotOf(ctx: Ctx, idx: number): Slot | null {
  return slotsFor(ctx.booking, ctx.mini).find(s => s.index === idx) ?? null
}
const first = (n: string | null) => (n || '').split(' ')[0] || 'there'
/** The photographer's own pay link, as an email paragraph (MK never handles the money). */
function payLine(ctx: Ctx): string[] {
  const url = ctx.mini.payment_url
  if (!url) return []
  return [`<b>Pay ${esc(ctx.photographer)}:</b> <a href="${esc(url)}" style="color:#c9b27e">${esc(payHost(url) || 'pay link')}</a> — this goes straight to ${esc(ctx.photographer)}, not Made Kulture.`]
}
const titleOf = (ctx: Ctx) => ctx.mini.title || `Mini sessions with ${ctx.photographer}`

async function mail(ctx: Ctx, to: string | null, subject: string, heading: string, paragraphs: string[], cta?: { text: string; url: string }, label = 'mini_session') {
  if (!to) return
  try {
    await sendSimpleEmail({
      to, subject, heading, paragraphs, label,
      ctaText: cta?.text, ctaUrl: cta?.url,
      replyTo: ctx.booking.customers?.email || undefined,
    })
  } catch (e) { console.error('[minis] email failed', label, e) }
}

const ARRIVAL = 'Please arrive at your slot time and <b>wait outside until it starts</b> — the set has a strict headcount, and everyone inside counts toward it. Limited parking is out front, with street parking in the rear.'

export async function sendClientConfirmation(ctx: Ctx, c: MiniClient) {
  const s = slotOf(ctx, c.slot_index); if (!s) return
  if (ctx.booking.planned) {
    await mail(ctx, c.email,
      `Requested: ${fmtDay(s.startISO)} at ${fmtTime(s.startISO)} (pending)`,
      `Your spot is requested`,
      [
        `Hi ${esc(first(c.name))} — you've requested <b>${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b> for a mini session with ${esc(ctx.photographer)} at Made Kulture, ${STUDIO_ADDRESS}.`,
        `<b>This day is pending.</b> ${esc(ctx.photographer)} is confirming it with the studio. You'll get another email the moment it's locked in — or if it isn't happening.`,
        `Party of ${c.party_size}.`,
        ...(ctx.mini.note ? [`From ${esc(ctx.photographer)}: ${esc(ctx.mini.note)}`] : []),
      ],
      { text: 'View or change my request', url: clientUrl(c) }, 'mini_requested')
    return
  }
  await mail(ctx, c.email,
    `You're booked: ${fmtDay(s.startISO)} at ${fmtTime(s.startISO)}`,
    `You're booked with ${ctx.photographer}`,
    [
      `Hi ${esc(first(c.name))} — your mini session is set for <b>${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b> at Made Kulture, ${STUDIO_ADDRESS}.`,
      `Party of ${c.party_size}. ${ARRIVAL}`,
      ...(ctx.mini.note ? [`From ${esc(ctx.photographer)}: ${esc(ctx.mini.note)}`] : []),
      ...payLine(ctx),
      `Payment and anything about your photos go through ${esc(ctx.photographer)} directly — reply to this email to reach them.`,
    ],
    { text: 'View or change my slot', url: clientUrl(c) }, 'mini_confirm')
}

export async function sendClientRemovedOrCancelled(ctx: Ctx, c: MiniClient, why: 'removed' | 'cancelled') {
  await mail(ctx, c.email,
    why === 'cancelled' ? `Your mini session with ${ctx.photographer} is cancelled` : `Your mini session slot was released`,
    why === 'cancelled' ? 'This mini session day is cancelled' : 'Your slot was released',
    [
      why === 'cancelled'
        ? `Hi ${esc(first(c.name))} — ${esc(ctx.photographer)}'s mini session day at Made Kulture is no longer happening.`
        : `Hi ${esc(first(c.name))} — ${esc(ctx.photographer)} released your mini session slot.`,
      `Anything about payment or a new date goes through ${esc(ctx.photographer)} directly — reply to this email to reach them.`,
    ], undefined, 'mini_cancel')
}

export async function sendClientMoved(ctx: Ctx, c: MiniClient, why: 'day' | 'slot' = 'day') {
  const s = slotOf(ctx, c.slot_index); if (!s) return
  if (ctx.booking.planned) {
    await mail(ctx, c.email,
      `New requested time: ${fmtDay(s.startISO)} at ${fmtTime(s.startISO)} (pending)`,
      'Your requested time changed',
      [
        `Hi ${esc(first(c.name))} — ${why === 'day' ? `${esc(ctx.photographer)} moved the planned mini session day.` : 'Your requested time changed.'} Your requested slot is now <b>${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b>.`,
        `<b>This day is still pending</b> until ${esc(ctx.photographer)} confirms it with the studio — you'll get an email either way. If the new time doesn't work, you can switch or cancel from the link below.`,
      ],
      { text: 'View or change my request', url: clientUrl(c) }, 'mini_plan_moved')
    return
  }
  await mail(ctx, c.email,
    `New time: ${fmtDay(s.startISO)} at ${fmtTime(s.startISO)}`,
    'Your mini session time changed',
    [
      `Hi ${esc(first(c.name))} — your mini session with ${esc(ctx.photographer)} is now <b>${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b>.`,
      ARRIVAL,
      `If the new time doesn't work, you can switch to another open slot or cancel from the link below.`,
    ],
    { text: 'View or change my slot', url: clientUrl(c) }, 'mini_moved')
}

export async function sendClientBumped(ctx: Ctx, c: MiniClient) {
  await mail(ctx, c.email,
    `Your mini session with ${ctx.photographer} needs a new time`,
    'Your slot needs a new time',
    [
      `Hi ${esc(first(c.name))} — ${esc(ctx.photographer)}'s mini session day changed and your slot no longer fits.`,
      `${esc(ctx.photographer)} will be in touch about a new time — or reply to this email to reach them.`,
    ], undefined, 'mini_bumped')
}

/** A planned day was booked: pending → confirmed. */
export async function sendClientPlanConfirmed(ctx: Ctx, c: MiniClient) {
  const s = slotOf(ctx, c.slot_index); if (!s) return
  await mail(ctx, c.email,
    `Confirmed: ${fmtDay(s.startISO)} at ${fmtTime(s.startISO)}`,
    `You're confirmed with ${ctx.photographer}`,
    [
      `Hi ${esc(first(c.name))} — ${esc(ctx.photographer)} booked the studio, so your mini session is <b>confirmed for ${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b> at Made Kulture, ${STUDIO_ADDRESS}.`,
      `Party of ${c.party_size}. ${ARRIVAL}`,
      ...payLine(ctx),
      `Payment and anything about your photos go through ${esc(ctx.photographer)} directly — reply to this email to reach them.`,
    ],
    { text: 'View or change my slot', url: clientUrl(c) }, 'mini_plan_confirmed')
}

/** A planned day that won't happen (photographer called it off, or it was never booked). */
export async function sendClientPlanOff(ctx: Ctx, c: MiniClient) {
  await mail(ctx, c.email,
    `${ctx.photographer}'s mini session day isn't happening`,
    'This mini session day is off',
    [
      `Hi ${esc(first(c.name))} — the mini session day you requested with ${esc(ctx.photographer)} wasn't confirmed, so it isn't happening.`,
      `Reply to this email to reach ${esc(ctx.photographer)} about another date.`,
    ], undefined, 'mini_plan_off')
}

export async function sendClientSwitchDeclined(ctx: Ctx, c: MiniClient) {
  const s = slotOf(ctx, c.slot_index); if (!s) return
  await mail(ctx, c.email,
    `Your mini session time stays at ${fmtTime(s.startISO)}`,
    'Your time stays the same',
    [
      `Hi ${esc(first(c.name))} — ${esc(ctx.photographer)} couldn't make the switch you asked for, so your slot stays <b>${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b>.`,
      `Reply to this email to reach ${esc(ctx.photographer)} directly.`,
    ],
    { text: 'View my slot', url: clientUrl(c) }, 'mini_switch_declined')
}

/** Message from the photographer to every booked client. */
export async function sendClientBroadcast(ctx: Ctx, c: MiniClient, text: string, withSms: boolean) {
  const s = slotOf(ctx, c.slot_index)
  await mail(ctx, c.email,
    `A note from ${ctx.photographer} about your mini session`,
    `A note from ${ctx.photographer}`,
    [esc(text), ...(s ? [`Your slot: <b>${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b>.`] : [])],
    { text: 'View my slot', url: clientUrl(c) }, 'mini_broadcast')
  if (withSms && c.sms_ok && c.phone) {
    await sendSMS(c.phone, `${ctx.photographer} (mini session at Made Kulture): ${text.slice(0, 300)} Reply STOP to opt out.`).catch(() => {})
  }
}

export async function sendClientReminder(ctx: Ctx, c: MiniClient) {
  const s = slotOf(ctx, c.slot_index); if (!s) return
  if (c.sms_ok && c.phone) {
    await sendSMS(c.phone,
      `Reminder: your mini session with ${ctx.photographer} is today at ${fmtTime(s.startISO)}, Made Kulture, ${STUDIO_ADDRESS}. ` +
      `Please wait outside until your slot starts. Details: ${clientUrl(c)} Reply STOP to opt out.`).catch(() => {})
  }
  await mail(ctx, c.email,
    `Today at ${fmtTime(s.startISO)}: your mini session`,
    'See you today',
    [
      `Hi ${esc(first(c.name))} — your mini session with ${esc(ctx.photographer)} is <b>today, ${esc(slotLabel(s))}</b> at Made Kulture, ${STUDIO_ADDRESS}.`,
      `Party of ${c.party_size}. ${ARRIVAL}`,
    ],
    { text: 'View my slot', url: clientUrl(c) }, 'mini_reminder')
}

/** The photographer hears when a client cancels or switches on their own. */
export async function notifyPhotographer(ctx: Ctx, subject: string, line: string) {
  const to = ctx.booking.customers?.email
  if (!to) return
  try {
    await sendSimpleEmail({
      to, subject, heading: 'Mini Sessions update', label: 'mini_owner',
      paragraphs: [line, `Your roster is always up to date in your account.`],
      ctaText: 'Open my roster', ctaUrl: `${APP_URL}/account/minis/${ctx.booking.id}`,
    })
  } catch (e) { console.error('[minis] owner email failed', e) }
}

export async function ctxFor(db: SupabaseClient, mini: MiniSession, booking?: OwnedBooking): Promise<Ctx | null> {
  let b = booking ?? await bookingForMini(db, mini)
  if (!b) return null
  return { mini, booking: b!, photographer: await photographerName(db, b!, mini.owner_user_id) }
}

// ── Plans: call off, or attach the real booking ─────────────────────────────
/** Call off a planned day: every pending client is told it isn't happening. */
export async function cancelPlan(db: SupabaseClient, mini: MiniSession, why: 'photographer' | 'expired'): Promise<number> {
  const { data: claimed } = await db.from('mini_sessions').update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', mini.id).is('booking_id', null).neq('status', 'cancelled').select('id')
  if (!claimed?.length) return 0
  const ctx = await ctxFor(db, mini)
  const { data: cs } = await db.from('mini_session_clients').update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('mini_session_id', mini.id).eq('status', 'booked').select('*')
  for (const c of (cs ?? []) as MiniClient[]) if (ctx) await sendClientPlanOff(ctx, c)
  if (ctx && why === 'expired') {
    await notifyPhotographer(ctx, 'Your planned mini session day was called off',
      `Your planned mini day on ${esc(fmtDay(ctx.booking.start_time))} wasn't booked by 48 hours before (the studio's booking notice), so it was called off and your ${(cs ?? []).length} pending client${(cs ?? []).length === 1 ? ' was' : 's were'} told.`)
  }
  return (cs ?? []).length
}

/**
 * The photographer booked the studio: hang the plan on that booking. Slot
 * indexes are re-read against the REAL booking's hours — anyone whose slot no
 * longer fits is bumped and told; everyone else gets "you're confirmed".
 */
export async function attachPlan(db: SupabaseClient, mini: MiniSession, b: OwnedBooking): Promise<{ ok: boolean; error?: string; confirmed?: number; bumped?: number }> {
  if (b.status !== 'confirmed') return { ok: false, error: 'That booking isn’t confirmed yet.' }
  if (Date.parse(b.end_time) < Date.now()) return { ok: false, error: 'That booking is already over.' }
  // Only the booking this plan is FOR: same day, overlapping, same set (or a buyout for a buyout plan).
  if (!mini.planned_start || !mini.planned_end || centralDateStr(b.start_time) !== centralDateStr(mini.planned_start)
      || !(Date.parse(b.start_time) < Date.parse(mini.planned_end) && Date.parse(b.end_time) > Date.parse(mini.planned_start))) {
    return { ok: false, error: 'That booking isn’t on the day and time you planned. Move the plan first, or attach the right booking.' }
  }
  if (mini.planned_buyout ? b.set_id != null : b.set_id !== mini.planned_set_id) {
    return { ok: false, error: mini.planned_buyout ? 'This plan is for the full warehouse — attach your buyout booking.' : 'That booking is for a different set than you planned.' }
  }
  const { data: taken } = await db.from('mini_sessions').select('id').eq('booking_id', b.id).maybeSingle()
  if (taken) return { ok: false, error: 'That booking already has mini sessions set up.' }
  const { data: claimed, error } = await db.from('mini_sessions')
    .update({ booking_id: b.id, announced_start: b.start_time, updated_at: new Date().toISOString() })
    .eq('id', mini.id).is('booking_id', null).neq('status', 'cancelled').select('*')
  if (error) return { ok: false, error: error.code === '23505' ? 'That booking already has mini sessions set up.' : error.message }
  if (!claimed?.length) return { ok: false, error: 'This plan was already attached or cancelled.' }
  const live = claimed[0] as MiniSession
  const ctx = await ctxFor(db, live, b)
  const fit = slotsFor(b, live).length
  // Blocks keep their meaning (same grid); drop only ones past the real booking's end.
  if ((live.blocked_slots ?? []).some(i => i >= fit)) {
    await db.from('mini_sessions').update({ blocked_slots: live.blocked_slots.filter(i => i < fit) }).eq('id', live.id)
  }
  // A plan's party sizes were checked against the PLANNED room; the real booking may hold fewer.
  const room = partyRoom(b, live, await guestSettings(db))
  const { data: cs } = await db.from('mini_session_clients').select('*').eq('mini_session_id', mini.id).eq('status', 'booked')
  let confirmed = 0, bumped = 0
  for (const c of (cs ?? []) as MiniClient[]) {
    if (c.slot_index >= fit || c.party_size > room.max) {
      await db.from('mini_session_clients').update({ status: 'bumped', updated_at: new Date().toISOString() }).eq('id', c.id)
      if (ctx) await sendClientBumped(ctx, c)
      bumped++
    } else {
      await db.from('mini_session_clients').update({ told_start: b.start_time, reminder_sent_at: null, updated_at: new Date().toISOString() }).eq('id', c.id)
      if (ctx) await sendClientPlanConfirmed(ctx, c)
      confirmed++
    }
  }
  if (bumped && ctx) {
    await notifyPhotographer(ctx, 'Some planned clients need a new time',
      `Your booking is attached and ${confirmed} client${confirmed === 1 ? ' was' : 's were'} confirmed. ${bumped} didn't fit the booking (their slot or party size) and were told you'll reach out — they're listed at the top of your roster.`)
  }
  return { ok: true, confirmed, bumped }
}

// ── Keep clients in step with the booking ───────────────────────────────────
/**
 * Called after a booking is moved or cancelled (and hourly as a safety net for
 * every path that doesn't call it). Each client row remembers the start time
 * they were last told (told_start), so every notice is claimed PER CLIENT
 * before it is sent: two runs can't double-send, and a run that stops halfway
 * (time budget, timeout) is finished by the next one.
 *
 * ⚠️ Booking paths call this with a short budget so a big roster can't stall a
 * cancel or reschedule; the hourly cron picks up whatever is left.
 */
export async function reconcileMiniForBooking(db: SupabaseClient, bookingId: string, budgetMs = 8_000): Promise<string | null> {
  const { data: m, error } = await db.from('mini_sessions').select('*').eq('booking_id', bookingId).maybeSingle()
  if (error) { console.error('[minis] reconcile lookup failed', error); return null }
  if (!m) return null
  return reconcileMini(db, m as MiniSession, Date.now() + budgetMs)
}

export async function reconcileMini(db: SupabaseClient, mini: MiniSession, deadline = Date.now() + 60_000): Promise<string | null> {
  if (mini.status === 'cancelled') return null
  const ctx = await ctxFor(db, mini)
  if (!ctx) return null
  const b = ctx.booking
  const { data: cs, error } = await db.from('mini_session_clients').select('*').eq('mini_session_id', mini.id).eq('status', 'booked')
  if (error) { console.error('[minis] reconcile clients failed', error); return null }
  const clients = (cs ?? []) as MiniClient[]
  const future = Date.parse(b.end_time) > Date.now()
  const stamp = () => new Date().toISOString()
  let told = 0

  if (b.status === 'cancelled') {
    for (const c of clients) {
      if (Date.now() > deadline) return `cancelled (partial, ${told} told)`
      const { data: claimed } = await db.from('mini_session_clients').update({ status: 'cancelled', updated_at: stamp() })
        .eq('id', c.id).eq('status', 'booked').select('id')
      if (!claimed?.length) continue
      if (future) await sendClientRemovedOrCancelled(ctx, c, 'cancelled')
      told++
    }
    await db.from('mini_sessions').update({ status: 'cancelled', updated_at: stamp() }).eq('id', mini.id)
    return `cancelled (${told} told)`
  }

  const fit = slotsFor(b, mini).length
  const bumped: MiniClient[] = []
  for (const c of clients) {
    if (Date.now() > deadline) break
    if (c.pending_slot != null && c.pending_slot >= fit) {
      await db.from('mini_session_clients').update({ pending_slot: null }).eq('id', c.id)
    }
    if (c.slot_index >= fit) {
      // The booking got shorter (or moved and shrank): this slot no longer exists.
      const { data: claimed } = await db.from('mini_session_clients').update({ status: 'bumped', updated_at: stamp() })
        .eq('id', c.id).eq('status', 'booked').select('id')
      if (!claimed?.length) continue
      bumped.push(c)
      if (future) await sendClientBumped(ctx, c)
    } else if (!c.told_start || Date.parse(c.told_start) !== Date.parse(b.start_time)) {
      const q = db.from('mini_session_clients').update({ told_start: b.start_time, reminder_sent_at: null, updated_at: stamp() }).eq('id', c.id)
      const { data: claimed } = await (c.told_start ? q.eq('told_start', c.told_start) : q.is('told_start', null)).select('id')
      if (!claimed?.length) continue
      // No told_start = a row from before this column was filled: record it quietly.
      if (c.told_start && future) { await sendClientMoved(ctx, c); told++ }
    }
  }
  if (bumped.length && future) {
    await notifyPhotographer(ctx, 'Some mini session clients need a new time',
      `Your ${ctx.booking.planned ? 'plan' : 'booking'} changed and ${bumped.length} client${bumped.length === 1 ? '' : 's'} no longer fit: ${bumped.map(c => esc(c.name || 'a client')).join(', ')}. They've been told you'll reach out.`)
  }
  if (!mini.announced_start || Date.parse(mini.announced_start) !== Date.parse(b.start_time)) {
    await db.from('mini_sessions').update({ announced_start: b.start_time }).eq('id', mini.id)
  }
  return told || bumped.length ? `moved (${told} told, ${bumped.length} bumped)` : null
}

// ── Hourly upkeep ───────────────────────────────────────────────────────────
export async function runMiniUpkeep(db: SupabaseClient, now = new Date()) {
  const result = { reconciled: 0, reminders: 0, purged: 0, covers: 0, extraCharges: [] as string[], errors: [] as string[] }
  const deadline = Date.now() + 240_000

  // 1. Follow moved/cancelled bookings — anything not yet over.
  const { data: live, error: lErr } = await db.from('mini_sessions').select('*, bookings!inner ( end_time )')
    .neq('status', 'cancelled').gt('bookings.end_time', now.toISOString())
  if (lErr) result.errors.push(`live: ${lErr.message}`)
  for (const m of (live ?? []) as any[]) {
    if (Date.now() > deadline) break
    const { bookings: _b, ...mini } = m
    if (await reconcileMini(db, mini as MiniSession, deadline)) result.reconciled++
  }

  // 2. Morning-of reminders: from 7 AM Central on the day of each SLOT (an
  //    overnight booking's after-midnight slots belong to the next day). Sent
  //    whether or not sign-ups are still open — stopping sign-ups keeps clients.
  const today = centralDateStr(now.toISOString())
  if (centralHourDecimal(now.toISOString()) >= 7) {
    const { data: todays, error: tErr } = await db.from('mini_sessions').select('*, bookings!inner ( start_time, status )')
      .neq('status', 'cancelled').neq('bookings.status', 'cancelled')
      .gte('bookings.start_time', new Date(now.getTime() - 24 * 3_600_000).toISOString())
      .lte('bookings.start_time', new Date(now.getTime() + 24 * 3_600_000).toISOString())
    if (tErr) result.errors.push(`reminders: ${tErr.message}`)
    for (const m of (todays ?? []) as any[]) {
      const { bookings: _b, ...mini } = m
      const ctx = await ctxFor(db, mini as MiniSession)
      if (!ctx) continue
      const { data: cs } = await db.from('mini_session_clients').select('*')
        .eq('mini_session_id', mini.id).eq('status', 'booked').is('reminder_sent_at', null)
      const slots = slotsFor(ctx.booking, ctx.mini)
      for (const c of (cs ?? []) as MiniClient[]) {
        if (Date.now() > deadline) break
        const s = slots.find(x => x.index === c.slot_index)
        if (!s || Date.parse(s.startISO) <= now.getTime() || centralDateStr(s.startISO) !== today) continue
        // Claim before sending: two overlapping runs must not text twice.
        const { data: claimed } = await db.from('mini_session_clients').update({ reminder_sent_at: now.toISOString() })
          .eq('id', c.id).is('reminder_sent_at', null).select('id')
        if (!claimed?.length) continue
        await sendClientReminder(ctx, c)
        result.reminders++
      }
    }
  }

  // 3. Bigger groups: bill the photographer once the session is over.
  //    Every finished day is checked (not only ones with the setting on), so
  //    extras that slipped in any other way still get billed — or marked 'none'.
  const { data: done, error: dErr } = await db.from('mini_sessions').select('*, bookings!inner ( end_time )')
    .is('extra_charge_status', null).neq('status', 'cancelled')
    .lt('bookings.end_time', now.toISOString()).limit(20)
  if (dErr) result.errors.push(`extra charges: ${dErr.message}`)
  for (const m of (done ?? []) as any[]) {
    if (Date.now() > deadline) break
    const { bookings: _b, ...mini } = m
    result.extraCharges.push(`${mini.id}: ${await chargeMiniExtras(db, mini as MiniSession)}`)
  }

  //    A charge that never finished (process died mid-way) is never retried —
  //    it might have gone through. Flag it for Teddy instead.
  const { data: stuck } = await db.from('mini_sessions').select('id, owner_user_id, booking_id, extra_charge_cents')
    .eq('extra_charge_status', 'charging').lt('extra_charge_claimed_at', new Date(now.getTime() - 15 * 60_000).toISOString())
  for (const m of (stuck ?? []) as any[]) {
    const { data: flipped } = await db.from('mini_sessions').update({ extra_charge_status: 'review' }).eq('id', m.id).eq('extra_charge_status', 'charging').select('id')
    if (flipped?.length) await sendOwnerPush({ title: '⚠️ Mini Sessions charge didn’t finish', body: 'An extra-guest charge stopped part-way. Check Square before charging again.', url: '/admin/minis' }).catch(() => {})
  }
  //    Payment links the photographer has paid since.
  const { data: links } = await db.from('mini_sessions').select('*').eq('extra_charge_status', 'link_sent').limit(50)
  for (const m of (links ?? []) as MiniSession[]) await settleLinkStatus(db, m)

  // 3b. Plans (migration 161). A plan whose start time passed without a booking
  //     is called off. A plan whose time someone else booked: tell the
  //     photographer once, so they can move it or book elsewhere.
  const { data: plans, error: plErr } = await db.from('mini_sessions').select('*')
    .is('booking_id', null).neq('status', 'cancelled').limit(200)
  if (plErr) result.errors.push(`plans: ${plErr.message}`)
  for (const m of (plans ?? []) as MiniSession[]) {
    if (Date.now() > deadline) break
    // Booked it but never pressed Attach? Do it for them.
    const ctx = await ctxFor(db, m)
    const ownerEmail = ctx?.booking.customers?.email ?? null
    const match = await findMatchingBooking(db, m, ownerEmail)
    if (match) { await attachPlan(db, m, match); continue }
    // Not booked by the time a booking is no longer possible (48h notice): call it off
    // now, while clients still have two days to make other plans — unless the
    // photographer is mid-checkout for it right now.
    if (m.planned_start && Date.parse(m.planned_start) <= now.getTime() + PLAN_LEAD_HOURS * 3_600_000) {
      if (await findMatchingBooking(db, m, ownerEmail, ['pending', 'pending_payment'])) continue
      await cancelPlan(db, m, 'expired'); continue
    }
    if (!m.conflict_notified_at) {
      if (ctx && await planConflicts(db, m, ctx.booking.customers?.email ?? null) > 0) {
        const { data: flagged } = await db.from('mini_sessions').update({ conflict_notified_at: now.toISOString() })
          .eq('id', m.id).is('conflict_notified_at', null).select('id')
        if (flagged?.length) await notifyPhotographer(ctx, 'Heads up: someone booked your planned mini day',
          `The time you planned for minis on ${esc(fmtDay(m.planned_start!))} was just booked by someone else. Your plan doesn't hold the studio, so pick another time or set — your pending clients move with it.`)
      }
    }
  }

  // 4. 90 days after the session: clear client contact details, keep counts.
  //    Done in batches and marked on the session, so the list never grows.
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString()
  const { data: old, error: oErr } = await db.from('mini_sessions').select('id, bookings!inner ( end_time )')
    .is('purged_at', null).lt('bookings.end_time', cutoff).limit(100)
  if (oErr) result.errors.push(`purge list: ${oErr.message}`)
  for (const r of (old ?? []) as any[]) {
    const { data: purged, error: pErr } = await db.from('mini_session_clients')
      .update({ name: null, email: null, phone: null, purged_at: now.toISOString() })
      .eq('mini_session_id', r.id).is('purged_at', null).select('id')
    if (pErr) { result.errors.push(`purge ${r.id}: ${pErr.message}`); continue }
    result.purged += purged?.length ?? 0
    await db.from('mini_sessions').update({ purged_at: now.toISOString() }).eq('id', r.id)
  }
  //    Plans that never became bookings: same 90 days, counted from their planned end.
  const { data: oldPlans } = await db.from('mini_sessions').select('id').is('booking_id', null).is('purged_at', null).lt('planned_end', cutoff).limit(100)
  for (const r of (oldPlans ?? []) as any[]) {
    const { data: purged, error: pErr } = await db.from('mini_session_clients')
      .update({ name: null, email: null, phone: null, purged_at: now.toISOString() })
      .eq('mini_session_id', r.id).is('purged_at', null).select('id')
    if (pErr) { result.errors.push(`purge plan ${r.id}: ${pErr.message}`); continue }
    result.purged += purged?.length ?? 0
    await db.from('mini_sessions').update({ purged_at: now.toISOString() }).eq('id', r.id)
  }
  // 5. Cover photos (migration 162) leave storage a week after the day is over
  //    or called off — the sign-up page, link preview and flyers are done with.
  const weekAgo = new Date(now.getTime() - COVER_KEEP_DAYS * 86_400_000).toISOString()
  const coverRows: { id: string }[] = []
  const { data: c1, error: c1Err } = await db.from('mini_sessions').select('id, bookings!inner ( end_time )')
    .not('cover_url', 'is', null).lt('bookings.end_time', weekAgo).limit(50)
  if (c1Err) result.errors.push(`cover list: ${c1Err.message}`)
  coverRows.push(...((c1 ?? []) as any[]))
  const { data: c2, error: c2Err } = await db.from('mini_sessions').select('id')
    .not('cover_url', 'is', null).is('booking_id', null).lt('planned_end', weekAgo).limit(50)
  if (c2Err) result.errors.push(`cover plans: ${c2Err.message}`)
  coverRows.push(...((c2 ?? []) as any[]))
  const { data: c3, error: c3Err } = await db.from('mini_sessions').select('id')
    .not('cover_url', 'is', null).eq('status', 'cancelled').lt('updated_at', weekAgo).limit(50)
  if (c3Err) result.errors.push(`cover cancelled: ${c3Err.message}`)
  coverRows.push(...((c3 ?? []) as any[]))
  const seen = new Set<string>()
  for (const r of coverRows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    const removed = await removeMiniMedia(db, r.id)
    if (!removed.ok) { result.errors.push(`cover ${r.id}: ${(removed as any).error}`); continue }
    await db.from('mini_sessions').update({ cover_url: null }).eq('id', r.id)
    result.covers++
  }

  if (result.errors.length) console.error('[minis] upkeep errors', result.errors)
  return result
}

const COVER_KEEP_DAYS = 7

/** Deletes everything a mini day stored in the mini-media bucket (its folder is its id). */
export async function removeMiniMedia(db: SupabaseClient, miniId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const bucket = db.storage.from('mini-media')
  const { data: files, error } = await bucket.list(miniId, { limit: 100 })
  if (error) return { ok: false, error: error.message }
  if (!files?.length) return { ok: true }
  const { error: rmErr } = await bucket.remove(files.map(f => `${miniId}/${f.name}`))
  return rmErr ? { ok: false, error: rmErr.message } : { ok: true }
}

// ── The roster, as the photographer's page and the admin page both show it ──
export function rosterView(booking: OwnedBooking, mini: MiniSession, clients: MiniClient[], gs: GuestSettings) {
  const slots = slotsFor(booking, mini)
  const booked = clients.filter(c => c.status === 'booked')
  const bySlot = new Map(booked.map(c => [c.slot_index, c]))
  const blocked = new Set(mini.blocked_slots ?? [])
  // Requested switches (approval on): the wanted slot is held for that client.
  const pendingFor = new Map(booked.filter(c => c.pending_slot != null).map(c => [c.pending_slot as number, c]))
  const labelOf = (i: number) => { const s = slots.find(x => x.index === i) ; return s ? slotLabel(s) : null }
  const room = partyRoom(booking, mini, gs)
  const limit = mini.crew_count + room.max
  const extraOf = (c: MiniClient) => extrasFor(c.party_size, room.included)
  const extraGuests = booked.reduce((n, c) => n + extraOf(c), 0)
  const feeCents = feeCentsFor(mini, gs)
  const billed = mini.extra_charge_status && mini.extra_charge_status !== 'none' && mini.extra_charge_cents != null
  return {
    limit,
    included: room.included,
    maxParty: room.max,
    crew: mini.crew_count,
    extraFee: feeCents / 100,
    extraCharge: {
      status: mini.extra_charge_status, cents: mini.extra_charge_cents, at: mini.extra_charged_at,
    },
    slots: slots.map(s => {
      const c = bySlot.get(s.index) ?? null
      return {
        index: s.index, startISO: s.startISO, endISO: s.endISO, label: slotLabel(s),
        blocked: blocked.has(s.index),
        heldFor: !c && pendingFor.has(s.index) ? (pendingFor.get(s.index)!.name || 'a client') : null,
        client: c && {
          id: c.id, name: c.name, email: c.email, phone: c.phone, party: c.party_size,
          extras: extraOf(c),
          checkedIn: !!c.checked_in_at, addedBy: c.added_by, smsOk: c.sms_ok,
          pendingSlot: c.pending_slot, pendingLabel: c.pending_slot != null ? labelOf(c.pending_slot) : null,
        },
        headcount: mini.crew_count + (c?.party_size ?? 0),
      }
    }),
    // Clients who need attention: their slot vanished when the booking changed.
    bumped: clients.filter(c => c.status === 'bumped').map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, party: c.party_size })),
    counts: {
      slots: slots.length,
      booked: booked.length,
      open: slots.filter(s => !bySlot.has(s.index) && !blocked.has(s.index) && !pendingFor.has(s.index)).length,
      requests: booked.filter(c => c.pending_slot != null).length,
      people: booked.reduce((n, c) => n + c.party_size, 0),
      extraGuests,
      // Once billed, show what was actually billed, not a live recount.
      extraCents: billed ? mini.extra_charge_cents! : extraGuests * feeCents,
    },
  }
}

// ── Bigger groups: one charge to the photographer, after the session ───────
const square = () => new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

/** The fee this day was agreed at (snapshotted when bigger groups were turned on), else today's. */
export function feeCentsFor(mini: Pick<MiniSession, 'extra_fee_cents'>, gs: GuestSettings): number {
  const snap = Number(mini.extra_fee_cents)
  return Number.isFinite(snap) && snap >= 0 && mini.extra_fee_cents != null ? Math.round(snap) : gs.extraFee * 100
}

// Square error codes that mean "this card said no" — the only case where a
// payment link is the right next step. Anything else (timeout, 5xx) may have
// actually charged, so it goes to Teddy for review instead of billing twice.
const DECLINE_CODES = new Set([
  'CARD_DECLINED', 'GENERIC_DECLINE', 'INSUFFICIENT_FUNDS', 'CVV_FAILURE', 'ADDRESS_VERIFICATION_FAILURE',
  'INVALID_EXPIRATION', 'EXPIRATION_FAILURE', 'CARD_EXPIRED', 'CARD_NOT_SUPPORTED', 'INVALID_CARD',
  'CARD_DECLINED_VERIFICATION_REQUIRED', 'CARD_DECLINED_CALL_ISSUER', 'TRANSACTION_LIMIT', 'VOICE_FAILURE',
  'PAN_FAILURE', 'BAD_EXPIRATION', 'CHIP_INSERTION_REQUIRED', 'ALLOWABLE_PIN_TRIES_EXCEEDED', 'INVALID_ACCOUNT',
  'CARD_TOKEN_EXPIRED', 'CARD_TOKEN_USED',
])
const isDecline = (e: any) => Array.isArray(e?.errors) && e.errors.some((x: any) => DECLINE_CODES.has(String(x?.code)))

async function needsReview(db: SupabaseClient, mini: MiniSession, why: string, cents: number | null) {
  await db.from('mini_sessions').update({ extra_charge_status: 'review', ...(cents != null ? { extra_charge_cents: cents } : {}) }).eq('id', mini.id)
  await sendOwnerPush({ title: '⚠️ Mini Sessions extra guests need a look', body: why.slice(0, 180), url: '/admin/minis' }).catch(() => {})
}

/**
 * Bill the photographer for extra guests on a FINISHED mini day. Claimed first
 * (extra_charge_status null → 'charging'), so the cron can never start it twice.
 * The card was verified as the photographer's own when they turned the setting
 * on. A clear DECLINE becomes a Square payment link (unpaid booking_add_ons row
 * → the Square webhook marks it paid). Anything unclear → 'review' + a push to
 * Teddy, never a second attempt: a timed-out payment may have gone through.
 */
export async function chargeMiniExtras(db: SupabaseClient, mini: MiniSession): Promise<string> {
  const now = new Date().toISOString()
  const { data: claimed, error: cErr } = await db.from('mini_sessions')
    .update({ extra_charge_status: 'charging', extra_charge_claimed_at: now })
    .eq('id', mini.id).is('extra_charge_status', null).select('id')
  if (cErr) return `claim failed: ${cErr.message}`
  if (!claimed?.length) return 'already handled'
  const release = async () => { await db.from('mini_sessions').update({ extra_charge_status: null, extra_charge_claimed_at: null }).eq('id', mini.id) }

  const ctx = await ctxFor(db, mini)
  if (!ctx) { await release(); return 'booking not loaded — will retry' }
  const b = ctx.booking
  let gs: GuestSettings
  try { gs = await guestSettings(db, { strict: true }) } catch { await release(); return 'settings not loaded — will retry' }
  const { data: cs, error: csErr } = await db.from('mini_session_clients').select('*').eq('mini_session_id', mini.id).eq('status', 'booked')
  if (csErr) { await release(); return `clients not loaded (${csErr.message}) — will retry` }

  const room = partyRoom(b, mini, gs)
  const fee = feeCentsFor(mini, gs)
  const slots = slotsFor(b, mini)
  const lines = ((cs ?? []) as MiniClient[])
    .map(c => ({ c, n: extrasFor(c.party_size, room.included), s: slots.find(x => x.index === c.slot_index) }))
    .filter(x => x.n > 0)
    .map(x => ({
      name: `Mini Sessions extra guests — ${x.s ? fmtTime(x.s.startISO) : 'slot'} (${x.n} × $${(fee / 100).toFixed(fee % 100 ? 2 : 0)})`,
      amountCents: x.n * fee,
    }))
  const totalCents = lines.reduce((t, l) => t + l.amountCents, 0)
  if (!Number.isFinite(totalCents)) { await needsReview(db, mini, `${ctx.photographer}: extra-guest total could not be worked out`, null); return 'review' }
  if (totalCents <= 0 || b.status === 'cancelled') {
    await db.from('mini_sessions').update({ extra_charge_status: 'none', extra_charge_cents: 0, extra_charged_at: now }).eq('id', mini.id)
    return 'nothing to charge'
  }
  // Only a photographer who opted in (and so agreed a fee) is ever billed. Extras
  // on any other day mean the settings moved under it — Teddy decides.
  if (!mini.allow_extra_guests || mini.extra_fee_cents == null) {
    await needsReview(db, mini, `${ctx.photographer}: extra guests on a day without bigger groups turned on — decide whether to bill`, totalCents)
    return 'review (not opted in)'
  }
  const extraCount = lines.reduce((t, l) => t + l.amountCents / Math.max(1, fee), 0)
  const label = `Mini Sessions extra guests — ${fmtDayShort(b.start_time)}`
  const dollarsS = `$${(totalCents / 100).toFixed(2)}`
  const feeS = `$${(fee / 100).toFixed(fee % 100 ? 2 : 0)}`
  const sq = square()

  // 1. The card the photographer chose. ONLY the payment call is inside the try.
  let declined = !(mini.extra_card_id && mini.extra_square_customer_id)
  if (!declined) {
    const orderId = await createOrderForPayment(sq, {
      locationId: process.env.SQUARE_LOCATION_ID!, customerId: mini.extra_square_customer_id,
      lineItems: lines, expectedTotalCents: totalCents, referenceId: b.id.slice(0, 40),
    })
    let paymentId: string | null = null
    try {
      const { result } = await sq.paymentsApi.createPayment({
        sourceId: mini.extra_card_id!, customerId: mini.extra_square_customer_id!,
        idempotencyKey: `mx-${mini.id}`,
        amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
        locationId: process.env.SQUARE_LOCATION_ID!,
        ...(orderId ? { orderId } : {}),
        note: label.slice(0, 500),
        buyerEmailAddress: b.customers?.email || undefined,
      })
      paymentId = result.payment?.id ?? null
    } catch (e: any) {
      if (isDecline(e)) declined = true
      else {
        console.error('[minis] extra-guest charge — unclear result', e?.errors ?? e)
        await needsReview(db, mini, `${ctx.photographer}: ${dollarsS} extra-guest charge got an unclear answer from Square — check Square before charging again`, totalCents)
        return 'review (unclear)'
      }
    }
    if (!declined) {
      // Money has moved. Everything below is bookkeeping and must not re-bill.
      const { error: sErr } = await db.from('mini_sessions').update({
        extra_charge_status: 'charged', extra_charge_cents: totalCents, extra_payment_id: paymentId, extra_charged_at: now,
      }).eq('id', mini.id)
      if (sErr) console.error('[minis] CRITICAL: charged but status not saved', sErr)
      await recordOnBooking(db, b, label, totalCents, true, paymentId, null)
      await notifyPhotographer(ctx, `Receipt: ${label}`,
        `Your card was charged <b>${dollarsS}</b> for ${extraCount} extra guest${extraCount === 1 ? '' : 's'} across your mini sessions on ${esc(fmtDay(b.start_time))} (${feeS} per extra person per slot). Square emails an itemized receipt.`)
      return `charged ${totalCents}`
    }
  }

  // 2. No card / declined: a payment link the photographer pays themselves.
  try {
    const { result } = await sq.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      quickPay: { name: label, priceMoney: { amount: BigInt(totalCents), currency: 'USD' }, locationId: process.env.SQUARE_LOCATION_ID! },
    })
    const url = result.paymentLink?.url
    const linkOrderId = result.paymentLink?.orderId ?? null
    if (!url) throw new Error('Square returned no payment link')
    await db.from('mini_sessions').update({
      extra_charge_status: 'link_sent', extra_charge_cents: totalCents, extra_payment_id: linkOrderId, extra_charged_at: now,
    }).eq('id', mini.id)
    const ok = await recordOnBooking(db, b, label, totalCents, false, linkOrderId, result.paymentLink?.id ?? null)
    if (!ok) await sendOwnerPush({ title: '⚠️ Mini Sessions link won’t auto-reconcile', body: `${ctx.photographer} — ${dollarsS}. Mark it paid by hand when it clears.`, url: '/admin/minis' }).catch(() => {})
    if (b.customers?.email) {
      await sendSimpleEmail({
        to: b.customers.email, label: 'mini_extra_link',
        subject: `Payment needed: ${label}`, heading: 'Extra guests from your mini sessions',
        paragraphs: [
          `Your mini sessions on ${esc(fmtDay(b.start_time))} had ${extraCount} extra guest${extraCount === 1 ? '' : 's'} (${feeS} per extra person per slot), <b>${dollarsS}</b> total.`,
          mini.extra_card_id ? `We couldn't charge the card you chose, so here's a secure link to pay.` : `Here's a secure link to pay.`,
        ],
        ctaText: 'Pay now', ctaUrl: url,
      }).catch(e => console.error('[minis] link email failed', e))
    }
    await sendOwnerPush({ title: 'Mini Sessions: extra guests sent as a link', body: `${ctx.photographer} — ${dollarsS}`, url: '/admin/minis' }).catch(() => {})
    return `link ${totalCents}`
  } catch (e: any) {
    console.error('[minis] extra-guest payment link failed', e?.errors ?? e)
    await needsReview(db, mini, `${ctx.photographer} owes ${dollarsS} for extra guests — card declined and the payment link failed. Charge it by hand.`, totalCents)
    return 'review (link failed)'
  }
}

/** The charge lands on the booking like any other add-on (and its total, once paid). Returns false if the row didn't save. */
async function recordOnBooking(db: SupabaseClient, b: OwnedBooking, label: string, cents: number, paid: boolean, orderOrPaymentId: string | null, linkId: string | null): Promise<boolean> {
  const { error } = await db.from('booking_add_ons').insert({
    booking_id: b.id, equipment_id: null, quantity: 1, rate: cents / 100, paid, label,
    square_order_id: orderOrPaymentId,
    ...(linkId ? { square_payment_link_id: linkId, link_sent_at: new Date().toISOString() } : {}),
  })
  if (error) console.error('[minis] add-on row failed (money side already done)', error)
  if (!paid) return !error   // the Square webhook bumps the total when the link is paid
  const { data: bk } = await db.from('bookings').select('total_amount').eq('id', b.id).single()
  const bumped = Math.round(((Number(bk?.total_amount) || 0) + cents / 100) * 100) / 100
  const { data: up, error: upErr } = await db.from('bookings').update({ total_amount: bumped }).eq('id', b.id).select('id')
  if (upErr || !up?.length) console.error('[minis] CRITICAL: charged but booking total not updated', upErr)
  return !error
}

/** A payment link the photographer has since paid: the webhook marked the add-on paid; mirror it. */
export async function settleLinkStatus(db: SupabaseClient, mini: MiniSession): Promise<MiniSession> {
  if (mini.extra_charge_status !== 'link_sent' || !mini.extra_payment_id) return mini
  const { data } = await db.from('booking_add_ons').select('paid').eq('square_order_id', mini.extra_payment_id).eq('paid', true).limit(1)
  if (!data?.length) return mini
  await db.from('mini_sessions').update({ extra_charge_status: 'charged' }).eq('id', mini.id).eq('extra_charge_status', 'link_sent')
  return { ...mini, extra_charge_status: 'charged' }
}

// ── Shareable images (migration 162) ───────────────────────────────────────
/** What the flyer and the link preview show for a mini day. */
export async function flyerInfoFor(db: SupabaseClient, mini: MiniSession): Promise<{
  title: string; photographer: string; day: string; time: string; priceText: string | null
  coverUrl: string | null; link: string; pending: boolean; cancelled: boolean
} | null> {
  const b = await bookingForMini(db, mini)
  if (!b) return null
  const photographer = await photographerName(db, b, mini.owner_user_id)
  return {
    title: mini.title || `Mini sessions with ${photographer}`,
    photographer,
    day: fmtDay(b.start_time),
    time: `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`,
    priceText: mini.price_text,
    coverUrl: mini.cover_url,
    link: shareUrl(mini),
    pending: !!b.planned,
    cancelled: mini.status === 'cancelled' || b.status === 'cancelled',
  }
}

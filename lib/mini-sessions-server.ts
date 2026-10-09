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
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'
import {
  type MiniSession, type MiniClient, type MiniBooking, type Slot,
  slotsFor, headcountLimit, fmtTime, fmtDay, slotLabel, esc, RETENTION_DAYS,
} from '@/lib/mini-sessions'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
export const STUDIO_ADDRESS = '4825 Gulf Freeway, Houston TX 77023'

export const BOOKING_SELECT = `id, start_time, end_time, status, set_id, guest_count, auth_user_id,
  customer_id, customers ( name, email, phone ), sets ( name )`

export type OwnedBooking = MiniBooking & {
  auth_user_id: string | null
  customers?: { name: string | null; email: string | null; phone: string | null } | null
}

export const shareUrl = (m: Pick<MiniSession, 'share_token'>) => `${APP_URL}/minis/${m.share_token}`
export const clientUrl = (c: Pick<MiniClient, 'manage_token'>) => `${APP_URL}/minis/c/${c.manage_token}`

export async function guestSettings(db: SupabaseClient): Promise<{ capacity: number; maxPerSet: number }> {
  const { data } = await db.from('studio_settings').select('key, value')
    .in('key', ['guest_capacity_per_set', 'max_guests_per_set'])
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value]))
  return { capacity: Number(map['guest_capacity_per_set']) || 5, maxPerSet: Number(map['max_guests_per_set']) || 7 }
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
  | { ok: true; booking: OwnedBooking; mini: MiniSession | null; clients: MiniClient[] }
  | { ok: false; status: number; error: string }

export async function loadForOwner(db: SupabaseClient, user: { id: string; email?: string | null }, bookingId: string): Promise<OwnerLoad> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return { ok: false, status: 404, error: 'Booking not found.' }
  const { data: b, error } = await db.from('bookings').select(BOOKING_SELECT).eq('id', bookingId).maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!b || !ownsBooking(b as any, user)) return { ok: false, status: 404, error: 'Booking not found.' }
  const { data: m, error: mErr } = await db.from('mini_sessions').select('*').eq('booking_id', bookingId).maybeSingle()
  if (mErr) return { ok: false, status: 500, error: mErr.message }
  let clients: MiniClient[] = []
  if (m) {
    const { data: cs, error: cErr } = await db.from('mini_session_clients').select('*')
      .eq('mini_session_id', m.id).order('slot_index').order('created_at')
    if (cErr) return { ok: false, status: 500, error: cErr.message }
    clients = (cs ?? []) as MiniClient[]
  }
  return { ok: true, booking: b as any, mini: (m as MiniSession) ?? null, clients }
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
  await mail(ctx, c.email,
    `You're booked: ${fmtDay(s.startISO)} at ${fmtTime(s.startISO)}`,
    `You're booked with ${ctx.photographer}`,
    [
      `Hi ${esc(first(c.name))} — your mini session is set for <b>${esc(fmtDay(s.startISO))}, ${esc(slotLabel(s))}</b> at Made Kulture, ${STUDIO_ADDRESS}.`,
      `Party of ${c.party_size}. ${ARRIVAL}`,
      ...(ctx.mini.note ? [`From ${esc(ctx.photographer)}: ${esc(ctx.mini.note)}`] : []),
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

export async function sendClientMoved(ctx: Ctx, c: MiniClient) {
  const s = slotOf(ctx, c.slot_index); if (!s) return
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
  let b = booking
  if (!b) {
    const { data } = await db.from('bookings').select(BOOKING_SELECT).eq('id', mini.booking_id).maybeSingle()
    if (!data) return null
    b = data as any
  }
  return { mini, booking: b!, photographer: await photographerName(db, b!, mini.owner_user_id) }
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
      `Your booking changed and ${bumped.length} client${bumped.length === 1 ? '' : 's'} no longer fit: ${bumped.map(c => esc(c.name || 'a client')).join(', ')}. They've been told you'll reach out.`)
  }
  if (!mini.announced_start || Date.parse(mini.announced_start) !== Date.parse(b.start_time)) {
    await db.from('mini_sessions').update({ announced_start: b.start_time }).eq('id', mini.id)
  }
  return told || bumped.length ? `moved (${told} told, ${bumped.length} bumped)` : null
}

// ── Hourly upkeep ───────────────────────────────────────────────────────────
export async function runMiniUpkeep(db: SupabaseClient, now = new Date()) {
  const result = { reconciled: 0, reminders: 0, purged: 0, errors: [] as string[] }
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

  // 3. 90 days after the session: clear client contact details, keep counts.
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
  if (result.errors.length) console.error('[minis] upkeep errors', result.errors)
  return result
}

// ── The roster, as the photographer's page and the admin page both show it ──
export function rosterView(booking: OwnedBooking, mini: MiniSession, clients: MiniClient[], limit: number) {
  const slots = slotsFor(booking, mini)
  const booked = clients.filter(c => c.status === 'booked')
  const bySlot = new Map(booked.map(c => [c.slot_index, c]))
  const blocked = new Set(mini.blocked_slots ?? [])
  // Requested switches (approval on): the wanted slot is held for that client.
  const pendingFor = new Map(booked.filter(c => c.pending_slot != null).map(c => [c.pending_slot as number, c]))
  const labelOf = (i: number) => { const s = slots.find(x => x.index === i); return s ? slotLabel(s) : null }
  return {
    limit,
    crew: mini.crew_count,
    slots: slots.map(s => {
      const c = bySlot.get(s.index) ?? null
      return {
        index: s.index, startISO: s.startISO, endISO: s.endISO, label: slotLabel(s),
        blocked: blocked.has(s.index),
        heldFor: !c && pendingFor.has(s.index) ? (pendingFor.get(s.index)!.name || 'a client') : null,
        client: c && {
          id: c.id, name: c.name, email: c.email, phone: c.phone, party: c.party_size,
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
    },
  }
}

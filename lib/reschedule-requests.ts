// Reschedule REQUESTS — a Plus member asking to move a booking into short-notice
// hours the studio isn't already open for (2026-09-29, Teddy's rule: if nobody
// else has the building open then, he confirms he can be there first).
//
// ⚠️ Deliberately does NOT import lib/reschedule.ts (which imports this file).
// Approving re-enters rescheduleBooking() from the token route with
// `ownerApproved`, so every move — instant or approved — runs the same gates.
//
// Expiry is DERIVED, not a cron: a pending row whose requested start (or the
// booking's original start) has passed is treated as expired on read.

import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { sendOwnerSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

export const RR_APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export const RR_COLS =
  'id, token, booking_id, customer_email, customer_name, set_name, old_start, old_end, ' +
  'new_date, new_start_hour, new_start, new_end, when_old, when_new, status, decision_note, decided_at, created_at'

export interface RescheduleRequestRow {
  id: string
  token: string
  booking_id: string
  customer_email: string | null
  customer_name: string | null
  set_name: string | null
  old_start: string
  old_end: string
  new_date: string
  new_start_hour: number
  new_start: string
  new_end: string
  when_old: string | null
  when_new: string | null
  status: string
  decision_note: string | null
  decided_at: string | null
  created_at: string
}

/** A pending request goes stale once either start time arrives. */
export function isExpired(r: Pick<RescheduleRequestRow, 'status' | 'new_start' | 'old_start'>, now = Date.now()): boolean {
  return r.status === 'pending' && (Date.parse(r.new_start) <= now || Date.parse(r.old_start) <= now)
}

export async function createRescheduleRequest(service: SupabaseClient, input: {
  bookingId: string
  customerEmail: string | null
  customerName: string | null
  setName: string | null
  oldStartISO: string
  oldEndISO: string
  newDate: string
  newStartHour: number
  newStartISO: string
  newEndISO: string
  whenOld: string
  whenNew: string
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  // ⚠️ Plain shape, not a union: tsconfig strict:false can't narrow on `ok`.
  // One live request per booking — a newer ask replaces an older one.
  const { error: supErr } = await service
    .from('reschedule_requests')
    .update({ status: 'superseded', decided_at: new Date().toISOString() })
    .eq('booking_id', input.bookingId).eq('status', 'pending')
  if (supErr) return { ok: false, error: supErr.message }

  const token = randomBytes(18).toString('hex')
  const { data, error } = await service
    .from('reschedule_requests')
    .insert({
      token,
      booking_id: input.bookingId,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      set_name: input.setName,
      old_start: input.oldStartISO,
      old_end: input.oldEndISO,
      new_date: input.newDate,
      new_start_hour: input.newStartHour,
      new_start: input.newStartISO,
      new_end: input.newEndISO,
      when_old: input.whenOld,
      when_new: input.whenNew,
    })
    .select('id')
  // ⚠️ supabase-js does not throw. No row back = no request = the member must be told.
  if (error || !data?.length) return { ok: false, error: error?.message || 'Could not send the request — nothing was changed.' }

  const link = `${RR_APP_URL}/reschedule/approve/${token}`
  const who = input.customerName || input.customerEmail || 'A Plus member'
  const set = input.setName || 'their set'
  await Promise.allSettled([
    // Plain ASCII on purpose: lib/sms folds non-GSM characters, but an arrow is
    // clearer written out than substituted. See sms-gsm7-segments.
    sendOwnerSMS([
      `Reschedule request - needs your OK`,
      `${who} (Plus)`,
      `${set}: ${input.whenOld} -> ${input.whenNew}`,
      `Nobody else has the studio open then.`,
      `Approve or decline: ${link}`,
    ].join('\n')),
    sendOwnerPush({
      title: '⏳ Reschedule request',
      body: `${who} — ${set}: ${input.whenOld} → ${input.whenNew}`,
      url: `/reschedule/approve/${token}`,
      tag: `reschedule-req-${input.bookingId}`,
      requireInteraction: true,
    }),
  ])
  return { ok: true, token }
}

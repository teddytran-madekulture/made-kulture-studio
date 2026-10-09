// SET DROPS — server side (migration 155). Pure helpers live in lib/set-drops.ts.
//
// What lives here:
//   • reading drops + pledges
//   • the booking GATES every checkout path relies on (run dates, early access)
//   • the depositor PRICE a signed-in member pays on a drop's set
//   • GO / CANCEL / customer choice — the steps that move money
//
// ⚠️ MONEY ORDER. Every money step CLAIMS the pledge row first
// (`.eq('status', <expected>).select()`) and only then issues credit or refunds.
// A double tap on GO, or two admins, therefore cannot credit a deposit twice —
// the second claim matches nothing. If the money step then fails the row is put
// back and the failure is REPORTED, never swallowed (see silent-failure-pattern).

import type { SupabaseClient } from '@supabase/supabase-js'
import { issueCredit } from '@/lib/credits'
import { refundPayment } from '@/lib/square-refund'
import { sendSimpleEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { fullDayWindow, nextDate } from '@/lib/closures'
import { invalidateSetCatalog } from '@/lib/set-catalog'
import {
  type SetDrop, type DropPledge, dropPhase, depositorRate, dollars, fmtDate, fmtInstant, runLabel, centralToday,
} from '@/lib/set-drops'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// A missing table (migration 155 not run yet) must not take checkout down with
// it — that is the ONLY error that degrades to "no drops". Anything else throws.
const isMissingTable = (e: any) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|schema cache/i.test(e?.message ?? '')

export const DROP_COLUMNS = '*'

// ── Reads ───────────────────────────────────────────────────────────────────
export async function getDrop(db: SupabaseClient, idOrSlug: string): Promise<SetDrop | null> {
  const isId = /^[0-9a-f-]{36}$/i.test(idOrSlug)
  const { data, error } = await db.from('set_drops').select(DROP_COLUMNS).eq(isId ? 'id' : 'slug', idOrSlug).maybeSingle()
  if (error) throw new Error(`drop lookup failed: ${error.message}`)
  return (data as SetDrop) ?? null
}

export async function getPledges(db: SupabaseClient, dropId: string): Promise<DropPledge[]> {
  const { data, error } = await db.from('set_drop_pledges').select('*').eq('drop_id', dropId).order('created_at', { ascending: true })
  if (error) throw new Error(`pledge lookup failed: ${error.message}`)
  return (data ?? []) as DropPledge[]
}

/** Drops attached to any of these sets, keyed by set id. */
export async function dropsBySetIds(db: SupabaseClient, setIds: (string | null)[]): Promise<Map<string, SetDrop>> {
  const ids = Array.from(new Set(setIds.filter(Boolean) as string[]))
  const out = new Map<string, SetDrop>()
  if (!ids.length) return out
  const { data, error } = await db.from('set_drops').select(DROP_COLUMNS).in('set_id', ids)
  if (error) {
    if (isMissingTable(error)) return out
    throw new Error(`drop lookup failed: ${error.message}`)
  }
  for (const d of (data ?? []) as SetDrop[]) if (d.set_id) out.set(d.set_id, d)
  return out
}

// ── Gate 1: run dates (every booking path, via lib/set-availability) ────────
/** Customer-facing reason a window on a drop's set can't be sold, or null. */
export function dropWindowProblem(drop: SetDrop, startISO: string): string | null {
  const phase = dropPhase(drop)
  if (phase === 'draft' || phase === 'pre_reserve' || phase === 'deciding') {
    return `${drop.name} isn't open for booking yet.`
  }
  if (phase === 'cancelled' || phase === 'archived') return `${drop.name} is no longer available.`
  const day = centralToday(new Date(startISO))
  if (drop.run_starts && day < drop.run_starts) return `${drop.name} runs ${runLabel(drop)} — pick a date in that window.`
  if (drop.run_ends && day > drop.run_ends) return `${drop.name} runs ${runLabel(drop)} — pick a date in that window.`
  return null
}

// ── Gate 2 + price: early access and the depositor rate (checkout) ──────────
export interface DropLineContext {
  drop: SetDrop
  pledge: DropPledge | null
  /** Non-null when this account may not book the set right now. */
  blocked: string | null
  /** The depositor hourly rate, when it applies to this account's next booking. */
  depositorRate: number | null
}

export async function dropContextForCheckout(
  db: SupabaseClient,
  authUserId: string | null,
  setIds: (string | null)[],
): Promise<Map<string, DropLineContext>> {
  const drops = await dropsBySetIds(db, setIds)
  const out = new Map<string, DropLineContext>()
  for (const [setId, drop] of Array.from(drops.entries())) {
    let pledge: DropPledge | null = null
    if (authUserId) {
      const { data, error } = await db.from('set_drop_pledges').select('*')
        .eq('drop_id', drop.id).eq('auth_user_id', authUserId).maybeSingle()
      if (error) throw new Error(`pledge lookup failed: ${error.message}`)
      pledge = (data as DropPledge) ?? null
    }
    const isDepositor = !!pledge && pledge.status !== 'refunded'
    const phase = dropPhase(drop)
    let blocked: string | null = null
    if (phase === 'early_access' && !isDepositor) {
      blocked = `${drop.name} is in early access for people who reserved it until ${fmtInstant(drop.early_access_ends_at)}. It opens to everyone after that.`
    }

    let rate: number | null = null
    const dr = depositorRate(drop)
    if (isDepositor && dr != null && (phase === 'early_access' || phase === 'open')) {
      if (drop.discount_scope === 'all') rate = dr
      else {
        // 'pledged_hours': the discount covers bookings until the hours they
        // reserved are used. The booking that crosses the line still gets it —
        // a whole-booking rule, so the price on screen and the charge agree.
        const { data: used, error } = await db.from('bookings')
          .select('start_time, end_time')
          .eq('set_id', setId).eq('auth_user_id', authUserId!)
          .in('status', ['confirmed', 'pending', 'pending_payment'])
        if (error) throw new Error(`depositor usage lookup failed: ${error.message}`)
        const hoursUsed = (used ?? []).reduce((s: number, b: any) => s + (Date.parse(b.end_time) - Date.parse(b.start_time)) / 3_600_000, 0)
        if (hoursUsed < Number(pledge!.hours_wanted || 0)) rate = dr
      }
    }
    out.set(setId, { drop, pledge, blocked, depositorRate: rate })
  }
  return out
}

/** Per-set display rate for a viewer — /api/sets uses it so the page and checkout agree. */
export async function depositorRatesForViewer(db: SupabaseClient, authUserId: string | null, setIds: string[]): Promise<Record<string, number>> {
  if (!authUserId) return {}
  const ctx = await dropContextForCheckout(db, authUserId, setIds)
  const out: Record<string, number> = {}
  ctx.forEach((c, setId) => { if (c.depositorRate != null) out[setId] = c.depositorRate })
  return out
}

// ── Notifications ───────────────────────────────────────────────────────────
async function tell(p: DropPledge, email: { subject: string; heading: string; paragraphs: string[]; ctaText?: string; ctaUrl?: string }, sms?: string) {
  try {
    await sendSimpleEmail({ to: p.customer_email, label: 'set_drop', ...email })
  } catch (e) { console.error('[set-drops] email failed', p.customer_email, e) }
  if (sms && p.phone) {
    try { await sendSMS(p.phone, sms) } catch (e) { console.error('[set-drops] sms failed', e) }
  }
}

export async function sendPledgeReceipt(drop: SetDrop, p: DropPledge, terms: string) {
  const first = (p.customer_name || '').split(' ')[0] || 'there'
  await tell(p, {
    subject: `You reserved ${drop.name}`,
    heading: `You're in for ${drop.name}`,
    paragraphs: [
      `Hi ${esc(first)}, your ${dollars(p.deposit_cents)} deposit is in. You asked for about ${p.hours_wanted} hour${Number(p.hours_wanted) === 1 ? '' : 's'}${p.timing_note ? ` (${esc(p.timing_note)})` : ''}.`,
      drop.pre_reserve_ends_at ? `Reservations close ${esc(fmtInstant(drop.pre_reserve_ends_at))}. We'll email you as soon as we decide whether it's happening.` : `We'll email you as soon as we decide whether it's happening.`,
      `<strong style="color:#fff;">What you agreed to:</strong> ${esc(terms)}`,
    ],
    ctaText: 'View the drop',
    ctaUrl: `${APP_URL}/drops/${drop.slug}`,
  })
}

// ── GO ──────────────────────────────────────────────────────────────────────
export interface StepReport { ok: boolean; done: number; failed: { pledgeId: string; email: string; error: string }[]; notes: string[] }

export async function goDrop(db: SupabaseClient, dropId: string): Promise<StepReport> {
  const report: StepReport = { ok: false, done: 0, failed: [], notes: [] }
  const drop = await getDrop(db, dropId)
  if (!drop) return { ...report, notes: ['Drop not found.'] }
  if (!drop.set_id) return { ...report, notes: ['This drop has no set attached.'] }
  if (!drop.run_starts || !drop.run_ends) return { ...report, notes: ['Set the run dates before pressing GO.'] }

  // 1. Claim the drop: only one GO can win.
  const now = new Date()
  const eaEnds = drop.perk_early_access && drop.early_access_hours > 0
    ? new Date(now.getTime() + drop.early_access_hours * 3_600_000).toISOString()
    : now.toISOString()
  const { data: claimed, error: claimErr } = await db.from('set_drops')
    .update({ status: 'funded', funded_at: now.toISOString(), early_access_ends_at: eaEnds, updated_at: now.toISOString() })
    .eq('id', drop.id).eq('status', 'pre_reserve').select('id')
  if (claimErr) return { ...report, notes: [`Could not update the drop: ${claimErr.message}`] }
  if (!claimed?.length) return { ...report, notes: ['This drop is not taking reservations (already decided?).'] }

  // 2. Open the set: active, with the drop's own rate/minimum/capacity.
  const { error: setErr } = await db.from('sets')
    .update({ is_active: true, rate_per_hour: drop.rate_per_hour, min_hours: drop.min_hours, capacity: drop.capacity })
    .eq('id', drop.set_id)
  invalidateSetCatalog()
  if (setErr) report.notes.push(`⚠️ The set could not be switched on (${setErr.message}) — turn it on in Products & Pricing.`)

  // 3. Take over the replaced room for the run dates (an ordinary closure).
  if (drop.replaces_set_id && !drop.closure_id) {
    const startISO = fullDayWindow(drop.run_starts).startISO
    const endISO = fullDayWindow(drop.run_ends).endISO
    const { data: cl, error: clErr } = await db.from('studio_closures').insert({
      starts_at: startISO, ends_at: endISO, set_ids: [drop.replaces_set_id],
      public_label: `Taken over by ${drop.name}`, note: `Set Drop: ${drop.name} (${drop.slug})`,
    }).select('id').single()
    if (clErr || !cl) report.notes.push(`⚠️ Could not block the replaced room (${clErr?.message}). Block it from the calendar.`)
    else {
      await db.from('set_drops').update({ closure_id: cl.id }).eq('id', drop.id)
      const { data: clash } = await db.from('bookings').select('id')
        .eq('set_id', drop.replaces_set_id).in('status', ['confirmed', 'pending', 'pending_payment'])
        .lt('start_time', endISO).gt('end_time', startISO)
      if (clash?.length) report.notes.push(`⚠️ ${clash.length} existing booking${clash.length === 1 ? ' is' : 's are'} on the replaced room during the run. Nothing was cancelled — see Holidays & Closures.`)
    }
  }

  // 4. Every deposit → studio credit (+ bonus).
  const funded = (await getDrop(db, drop.id)) ?? drop
  const pledges = (await getPledges(db, drop.id)).filter(p => p.status === 'active')
  for (const p of pledges) {
    const r = await creditForFunded(db, funded, p)
    if (r.ok) report.done++
    else report.failed.push({ pledgeId: p.id, email: p.customer_email, error: r.error ?? 'credit failed' })
  }

  report.ok = report.failed.length === 0
  try {
    await sendOwnerPush({
      title: `GO: ${drop.name}`,
      body: `${report.done} deposit${report.done === 1 ? '' : 's'} turned into credit${report.failed.length ? ` · ${report.failed.length} FAILED` : ''}.`,
      url: '/admin/drops', tag: `drop-go-${drop.id}`,
    })
  } catch {}
  return report
}

/** One deposit on a FUNDED drop → studio credit (+ bonus) and the "it's happening" note. */
export async function creditForFunded(db: SupabaseClient, drop: SetDrop, p: DropPledge): Promise<{ ok: boolean; error?: string }> {
  const credit = p.deposit_cents + (drop.bonus_credit_cents || 0)
  const { data: c } = await db.from('set_drop_pledges')
    .update({ status: 'credited', credit_cents_issued: credit, resolved_at: new Date().toISOString() })
    .eq('id', p.id).eq('status', 'active').select('id')
  if (!c?.length) return { ok: false, error: 'Already handled.' }
  // A $0 deposit with no bonus has nothing to credit — the claim above is the whole step.
  if (credit > 0) {
    const r = await issueCredit(p.auth_user_id, credit, { kind: 'issued', reason: `Set Drop deposit — ${drop.name}`, createdBy: 'set-drop' })
    if (!r.ok) {
      await db.from('set_drop_pledges').update({ status: 'active', credit_cents_issued: 0, resolved_at: null }).eq('id', p.id)
      return { ok: false, error: r.error ?? 'credit failed' }
    }
  }
  const ea = drop.perk_early_access && drop.early_access_hours > 0 && drop.early_access_ends_at && Date.parse(drop.early_access_ends_at) > Date.now()
  await tell(p, {
    subject: `${drop.name} is happening`,
    heading: `${drop.name} is happening`,
    paragraphs: [
      credit > 0
        ? `Thanks to you, we're building it. Your deposit is now ${dollars(credit)} in studio credit, and it applies automatically at checkout.`
        : `Thanks to you, we're building it.`,
      `${esc(drop.name)} runs ${esc(runLabel(drop))}.${ea ? ` You have early access until ${esc(fmtInstant(drop.early_access_ends_at))} to grab your dates before everyone else.` : ''}`,
    ],
    ctaText: 'Book your dates',
    ctaUrl: `${APP_URL}/drops/${drop.slug}`,
  }, `Made Kulture: ${drop.name} is happening.${credit > 0 ? ` Your deposit is now ${dollars(credit)} in studio credit.` : ''}${ea ? ` Early access to book ends ${fmtInstant(drop.early_access_ends_at)}.` : ''} Book: ${APP_URL}/drops/${drop.slug}`)
  return { ok: true }
}

/**
 * Finish any deposit still 'active' on a drop that has already been decided —
 * a credit that failed during GO, a crash halfway through, or a reservation
 * that landed in the instant GO/CANCEL ran. Safe to press repeatedly: every
 * step claims its row first.
 */
export async function processRemaining(db: SupabaseClient, dropId: string): Promise<StepReport> {
  const report: StepReport = { ok: false, done: 0, failed: [], notes: [] }
  const drop = await getDrop(db, dropId)
  if (!drop) return { ...report, notes: ['Drop not found.'] }
  if (drop.status !== 'funded' && drop.status !== 'cancelled') return { ...report, notes: ['Only a funded or cancelled drop has deposits to finish.'] }
  const pledges = (await getPledges(db, drop.id)).filter(p => p.status === 'active')
  for (const p of pledges) {
    const r = drop.status === 'funded' ? await creditForFunded(db, drop, p)
      : drop.cancel_resolution === 'credit' ? await creditPledge(db, drop, p, 'active')
      : drop.cancel_resolution === 'choice' ? await offerChoice(db, drop, p)
      : await refundPledge(db, drop, p, 'active')
    if (r.ok) report.done++
    else report.failed.push({ pledgeId: p.id, email: p.customer_email, error: r.error ?? 'failed' })
  }
  if (!pledges.length) report.notes.push('Nothing left to finish — every deposit is settled.')
  report.ok = report.failed.length === 0
  return report
}

// ── CANCEL ──────────────────────────────────────────────────────────────────
export async function cancelDrop(db: SupabaseClient, dropId: string, resolution: 'refund' | 'credit' | 'choice'): Promise<StepReport> {
  const report: StepReport = { ok: false, done: 0, failed: [], notes: [] }
  const drop = await getDrop(db, dropId)
  if (!drop) return { ...report, notes: ['Drop not found.'] }
  const allowed = drop.cancel_policy === 'decide_later' ? ['refund', 'credit', 'choice'] : [drop.cancel_policy]
  if (!allowed.includes(resolution)) return { ...report, notes: [`This drop promised "${drop.cancel_policy}" — that's what customers agreed to.`] }

  const now = new Date()
  const { data: claimed, error } = await db.from('set_drops')
    .update({ status: 'cancelled', cancelled_at: now.toISOString(), cancel_resolution: resolution, updated_at: now.toISOString() })
    .eq('id', drop.id).in('status', ['pre_reserve', 'draft']).select('id')
  if (error) return { ...report, notes: [`Could not update the drop: ${error.message}`] }
  if (!claimed?.length) return { ...report, notes: ['Only a drop that is still taking reservations can be cancelled.'] }

  const pledges = (await getPledges(db, drop.id)).filter(p => p.status === 'active')
  for (const p of pledges) {
    const r = resolution === 'refund' ? await refundPledge(db, drop, p, 'active')
      : resolution === 'credit' ? await creditPledge(db, drop, p, 'active')
      : await offerChoice(db, drop, p)
    if (r.ok) report.done++
    else report.failed.push({ pledgeId: p.id, email: p.customer_email, error: r.error ?? 'failed' })
  }
  report.ok = report.failed.length === 0
  try {
    await sendOwnerPush({
      title: `Cancelled: ${drop.name}`,
      body: `${report.done} deposit${report.done === 1 ? '' : 's'} handled (${resolution})${report.failed.length ? ` · ${report.failed.length} FAILED` : ''}.`,
      url: '/admin/drops', tag: `drop-cancel-${drop.id}`,
    })
  } catch {}
  return report
}

export async function refundPledge(db: SupabaseClient, drop: SetDrop, p: DropPledge, from: 'active' | 'pending_choice' | 'refund_failed'): Promise<{ ok: boolean; error?: string }> {
  const { data: c } = await db.from('set_drop_pledges')
    .update({ status: 'refunded', resolved_at: new Date().toISOString() })
    .eq('id', p.id).eq('status', from).select('id, square_payment_id')
  if (!c?.length) return { ok: false, error: 'Already handled.' }
  const paymentId = (c[0] as any).square_payment_id
  if (!paymentId || p.deposit_cents <= 0) {
    if (p.deposit_cents > 0) {
      await db.from('set_drop_pledges').update({ status: 'refund_failed' }).eq('id', p.id)
      return { ok: false, error: 'No Square payment on file to refund.' }
    }
  } else {
    try {
      const r = await refundPayment({ paymentId, amountCents: p.deposit_cents, reason: `Set Drop cancelled — ${drop.name}` })
      await db.from('set_drop_pledges').update({ refund_id: r.id ?? null }).eq('id', p.id)
    } catch (e: any) {
      const msg = e?.errors?.[0]?.detail || e?.message || 'refund failed'
      await db.from('set_drop_pledges').update({ status: 'refund_failed' }).eq('id', p.id)
      return { ok: false, error: msg }
    }
  }
  await tell(p, {
    subject: `${drop.name} isn't happening — refund on its way`,
    heading: `${drop.name} isn't happening`,
    paragraphs: [
      `Not enough people reserved it this time, so we're not building it. Your ${dollars(p.deposit_cents)} deposit has been refunded to your card — it usually shows within 5–10 business days.`,
      `Thank you for backing it. Keep an eye out for the next drop.`,
    ],
  }, `Made Kulture: ${drop.name} isn't happening this time. Your ${dollars(p.deposit_cents)} deposit has been refunded to your card.`)
  return { ok: true }
}

export async function creditPledge(db: SupabaseClient, drop: SetDrop, p: DropPledge, from: 'active' | 'pending_choice'): Promise<{ ok: boolean; error?: string }> {
  const { data: c } = await db.from('set_drop_pledges')
    .update({ status: 'credited', credit_cents_issued: p.deposit_cents, resolved_at: new Date().toISOString() })
    .eq('id', p.id).eq('status', from).select('id')
  if (!c?.length) return { ok: false, error: 'Already handled.' }
  const r = p.deposit_cents > 0
    ? await issueCredit(p.auth_user_id, p.deposit_cents, { kind: 'issued', reason: `Set Drop deposit — ${drop.name} (not built)`, createdBy: 'set-drop' })
    : { ok: true as const, error: undefined }
  if (!r.ok) {
    await db.from('set_drop_pledges').update({ status: from, credit_cents_issued: 0, resolved_at: null }).eq('id', p.id)
    return { ok: false, error: r.error }
  }
  await tell(p, {
    subject: `${drop.name} isn't happening — your credit`,
    heading: `${drop.name} isn't happening`,
    paragraphs: [
      `Not enough people reserved it this time, so we're not building it. Your ${dollars(p.deposit_cents)} deposit is now studio credit on your account, good on any set.`,
      `Thank you for backing it.`,
    ],
    ctaText: 'Book a set', ctaUrl: `${APP_URL}/sets`,
  }, `Made Kulture: ${drop.name} isn't happening this time. Your ${dollars(p.deposit_cents)} deposit is now studio credit on your account.`)
  return { ok: true }
}

async function offerChoice(db: SupabaseClient, drop: SetDrop, p: DropPledge): Promise<{ ok: boolean; error?: string }> {
  const deadline = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const { data: c } = await db.from('set_drop_pledges')
    .update({ status: 'pending_choice', choice_deadline: deadline })
    .eq('id', p.id).eq('status', 'active').select('id, choice_token')
  if (!c?.length) return { ok: false, error: 'Already handled.' }
  const url = `${APP_URL}/drops/choice/${(c[0] as any).choice_token}`
  await tell(p, {
    subject: `${drop.name} isn't happening — refund or credit?`,
    heading: `${drop.name} isn't happening`,
    paragraphs: [
      `Not enough people reserved it this time, so we're not building it. You choose what happens to your ${dollars(p.deposit_cents)} deposit: a full refund to your card, or studio credit good on any set.`,
      `If you don't choose by ${esc(fmtInstant(deadline))}, it is refunded to your card.`,
    ],
    ctaText: 'Choose', ctaUrl: url,
  }, `Made Kulture: ${drop.name} isn't happening. Refund or studio credit for your ${dollars(p.deposit_cents)} deposit? Choose here: ${url}`)
  return { ok: true }
}

/** Refund every choice that ran past its 7 days (daily cron). */
export async function settleExpiredChoices(db: SupabaseClient): Promise<{ refunded: number; failed: number }> {
  const { data, error } = await db.from('set_drop_pledges').select('*')
    .eq('status', 'pending_choice').lt('choice_deadline', new Date().toISOString())
  if (error) {
    if (isMissingTable(error)) return { refunded: 0, failed: 0 }
    throw new Error(error.message)
  }
  let refunded = 0, failed = 0
  for (const p of (data ?? []) as DropPledge[]) {
    const drop = await getDrop(db, p.drop_id)
    if (!drop) continue
    const r = await refundPledge(db, drop, p, 'pending_choice')
    if (r.ok) refunded++; else failed++
  }
  if (failed) {
    try { await sendOwnerPush({ title: 'Set Drop refunds failed', body: `${failed} expired-choice refund${failed === 1 ? '' : 's'} failed. Open Set Drops.`, url: '/admin/drops', tag: 'drop-refund-fail' }) } catch {}
  }
  return { refunded, failed }
}

/** Archive: switch the set off. Bookings and history stay. */
export async function archiveDrop(db: SupabaseClient, dropId: string): Promise<{ ok: boolean; error?: string }> {
  const drop = await getDrop(db, dropId)
  if (!drop) return { ok: false, error: 'Drop not found.' }
  // Never archive a drop still holding undecided deposits.
  const { data: done, error } = await db.from('set_drops').update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', drop.id).in('status', ['funded', 'cancelled']).select('id')
  if (error) return { ok: false, error: error.message }
  if (!done?.length) return { ok: false, error: 'Only a funded or cancelled drop can be archived.' }
  if (drop.set_id) {
    await db.from('sets').update({ is_active: false }).eq('id', drop.set_id)
    invalidateSetCatalog()
  }
  return { ok: true }
}

export { fmtDate, nextDate }

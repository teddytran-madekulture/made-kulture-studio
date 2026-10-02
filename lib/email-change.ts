// Changing a member's email WITHOUT splitting them in two.
//
// ⚠️ A member is two records joined only by an email address:
//   • the LOGIN (Supabase auth user, keyed by id) — credit, rewards, directory
//     profile, First 100 and signed-in bookings hang off this id;
//   • the CUSTOMER row (customers, keyed by EMAIL) — Plus, saved card, custom
//     pricing, short-notice grants, booking history, visit count, standing.
// Changing only the login (what Supabase's "change email" does) left the
// customer row on the old address: Plus "vanished", the saved card went, and
// the Add Credit panel said "no account". Teddy, 2026-10-01: the old address
// must be KEPT but only the new one shown.
//
// So every email change goes through moveCustomerEmail():
//   customers.email := new, old address appended to customers.alt_emails
//   (the suspended-customer screen in lib/identity-match.ts already reads
//   alt_emails, so a new address cannot dodge a ban), plus the side records
//   that are keyed by email (prior-visit history, unsubscribes, invite-only
//   promo guest lists), plus a log row and a customer note.
//
// Three doors, one core:
//   • customer self-serve — /api/account/email records a PENDING change and asks
//     Supabase to email a confirmation link; /auth/callback calls
//     reconcileEmailChange() when they click it.
//   • admin — adminChangeEmail() (EDIT INFO on the customer panel) moves the
//     login AND the customer row together, no link.
//   • ⚠️ Changing an email in the Supabase DASHBOARD bypasses all of this. Don't.
import { normEmail } from '@/lib/customer-email'
import { authUsers } from '@/lib/credit-admin'
import { standingForEmail } from '@/lib/standing'
import { sendOwnerPush } from '@/lib/push'
import { sendSimpleEmail } from '@/lib/email'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type By = 'customer' | 'admin'
// Flat (not a discriminated union): tsconfig has strict:false, which turns off
// union narrowing, so `if (!r.ok) r.error` would not compile.
export type MoveResult = { ok: boolean; status: 'applied' | 'needs_merge' | 'error'; error?: string; customerId: string | null }

/** Move the CUSTOMER side of a member from oldEmail to newEmail. Does not touch
 *  the login. Safe to call twice (second call finds nothing left to move). */
export async function moveCustomerEmail(db: any, opts: { oldEmail: string; newEmail: string; by: By; authUserId?: string | null }): Promise<MoveResult> {
  const o = normEmail(opts.oldEmail), n = normEmail(opts.newEmail)
  if (!o || !n) return { ok: false, status: 'error', error: 'Missing email.', customerId: null }
  if (o === n) return { ok: true, customerId: null, status: 'applied' }

  const [{ data: oldRow, error: e1 }, { data: newRow, error: e2 }] = await Promise.all([
    db.from('customers').select('id, alt_emails').eq('email', o).maybeSingle(),
    db.from('customers').select('id, alt_emails').eq('email', n).maybeSingle(),
  ])
  if (e1 || e2) return { ok: false, status: 'error', error: (e1 ?? e2).message, customerId: null }

  // Two different customer rows would now be the same person. Merging moves
  // bookings, Plus and history between records — never do that unattended.
  if (oldRow && newRow && oldRow.id !== newRow.id) {
    return { ok: false, status: 'needs_merge', customerId: oldRow.id,
      error: `A separate customer record already uses ${n}. Merge the two records (Find Duplicates / merge) and the change will be complete.` }
  }

  if (oldRow) {
    const alt = Array.from(new Set([...(oldRow.alt_emails ?? []).map(normEmail), o])).filter(e => e && e !== n)
    const { data: upd, error } = await db.from('customers').update({ email: n, alt_emails: alt }).eq('id', oldRow.id).select('id')
    if (error) return { ok: false, status: 'error', error: error.message, customerId: oldRow.id }
    if (!upd?.length) return { ok: false, status: 'error', error: 'Customer update matched no row.', customerId: oldRow.id }
  }
  // ADOPTING (2026-10-02): no record at the old address, but one at the new
  // address — the login takes over that record. Keep the old address on it too,
  // so both doors (self-serve and admin) leave the same trail. Non-fatal.
  if (!oldRow && newRow) {
    const alt = Array.from(new Set([...(newRow.alt_emails ?? []).map(normEmail), o])).filter(e => e && e !== n)
    const { error } = await db.from('customers').update({ alt_emails: alt }).eq('id', newRow.id)
    if (error) console.warn('[email-change] alt_emails on adopted record:', error.message)
  }
  const customerId: string | null = oldRow?.id ?? newRow?.id ?? null

  // Side records keyed by email — best effort, each one non-fatal and logged.
  const side = async (label: string, fn: () => Promise<{ error: any }>) => {
    try { const { error } = await fn(); if (error) console.warn(`[email-change] ${label}:`, error.message) }
    catch (e) { console.warn(`[email-change] ${label}:`, e) }
  }
  // Pre-account visit history (the FIRST VISIT / REGULAR tags).
  await side('prior visits', () => db.from('customer_prior_visits').update({ email: n }).eq('email', o))
  // Someone who unsubscribed stays unsubscribed at the new address.
  const { data: supp } = await db.from('email_suppressions').select('email').eq('email', o).maybeSingle()
  if (supp) await side('suppression', () => db.from('email_suppressions').upsert({ email: n }, { onConflict: 'email', ignoreDuplicates: true }))
  // An invite-only code sent to the old address keeps working at the new one.
  const { data: inv } = await db.from('promo_code_recipients').select('promo_id, campaign_id').eq('email', o)
  if (inv?.length) await side('promo guest lists', () => db.from('promo_code_recipients')
    .upsert(inv.map((r: any) => ({ promo_id: r.promo_id, email: n, campaign_id: r.campaign_id })), { onConflict: 'promo_id,email', ignoreDuplicates: true }))

  if (customerId) await side('note', () => db.from('customer_notes').insert({
    customer_id: customerId, tag: 'note',
    note: `Email changed from ${o} to ${n} by ${opts.by === 'admin' ? 'the studio' : 'the customer'}. The old address is kept on file.`,
  }))
  return { ok: true, customerId, status: 'applied' }
}

async function log(db: any, row: Record<string, unknown>) {
  const { error } = await db.from('customer_email_changes').insert(row)
  if (error) console.error('[email-change] log failed:', error.message)
}

/** Customer self-serve, step 2: the confirmation link was clicked and the login
 *  now carries the new address. Finish the move. Called from /auth/callback on
 *  EVERY sign-in, so it must be cheap and idempotent. Never throws. */
export async function reconcileEmailChange(db: any, user: { id: string; email?: string | null }): Promise<void> {
  try {
    const current = normEmail(user.email)
    if (!current) return
    const { data: pending, error } = await db.from('customer_email_changes')
      .select('id, old_email, new_email').eq('auth_user_id', user.id).eq('status', 'pending')
    if (error || !pending?.length) return
    for (const p of pending) {
      if (normEmail(p.new_email) !== current) continue   // not confirmed yet (or a superseded request)
      const r = await moveCustomerEmail(db, { oldEmail: p.old_email, newEmail: current, by: 'customer', authUserId: user.id })
      await db.from('customer_email_changes').update({
        status: r.status, customer_id: r.customerId, applied_at: new Date().toISOString(), note: r.ok ? null : r.error,
      }).eq('id', p.id).eq('status', 'pending')
      if (!r.ok) {
        await sendOwnerPush({ title: 'Email change needs you', body: `${p.old_email} → ${current}: ${r.error}`, url: '/admin/dashboard' }).catch(() => {})
      } else {
        // A flagged account changing its address is worth knowing about.
        const st = await standingForEmail(db, current).catch(() => null)
        if (st && st.level !== 'good') {
          await sendOwnerPush({ title: 'Flagged account changed email', body: `${p.old_email} → ${current} (${st.level})`, url: '/admin/dashboard' }).catch(() => {})
        }
      }
    }
  } catch (e) { console.error('[email-change] reconcile failed:', e) }
}

/** Studio-side change: moves the login and the customer row together, marks the
 *  new address CONFIRMED (the studio is vouching for it — no verification
 *  email), and emails a heads-up to the new address. Refuses rather than
 *  half-applying.
 *
 *  Target either a CUSTOMER row (EDIT INFO on the customer panel) or a LOGIN
 *  (Recent Signups / admin Directory) — most new members have a login but no
 *  customer row until their first booking, and the panel can't reach them. */
export async function adminChangeEmail(
  db: any,
  target: { customerId?: string | null; authUserId?: string | null },
  newEmailRaw: string,
): Promise<{ ok: boolean; email?: string; status?: number; error?: string }> {
  const n = normEmail(newEmailRaw)
  if (!EMAIL_RE.test(n)) return { ok: false, status: 400, error: 'That doesn’t look like an email address.' }

  const { idByEmail } = await authUsers(db)
  let o = '', uid: string | null = null, custId: string | null = null
  if (target.customerId) {
    const { data: c, error } = await db.from('customers').select('id, email').eq('id', target.customerId).maybeSingle()
    if (error) return { ok: false, status: 500, error: error.message }
    if (!c) return { ok: false, status: 404, error: 'Customer not found.' }
    custId = c.id; o = normEmail(c.email)
    uid = o ? idByEmail.get(o) ?? null : null
  } else if (target.authUserId) {
    const { data, error } = await db.auth.admin.getUserById(target.authUserId)
    if (error || !data?.user) return { ok: false, status: 404, error: 'Account not found.' }
    uid = data.user.id; o = normEmail(data.user.email)
    const { data: c } = await db.from('customers').select('id').eq('email', o).maybeSingle()
    custId = c?.id ?? null
  } else return { ok: false, status: 400, error: 'Nothing to change.' }
  if (o === n) return { ok: true, email: n }

  const other = idByEmail.get(n)
  if (other && other !== uid) return { ok: false, status: 409, error: `${n} already has its own login — that’s a different account. Ask the customer which one to keep.` }
  const { data: clash, error: clashErr } = await db.from('customers').select('id, alt_emails').eq('email', n).maybeSingle()
  if (clashErr) return { ok: false, status: 500, error: clashErr.message }
  // 2026-10-02 (Wellspool): a returning customer signs up with a NEW address, then
  // asks to use the address their old booking history is under. The login has NO
  // customer record of its own and the history record has NO login (checked
  // above), so there is nothing to merge — the login simply ADOPTS that record by
  // moving onto its address. Only refuse when BOTH sides carry a customer record.
  if (clash && custId && clash.id !== custId) return { ok: false, status: 409, error: `Another customer record already uses ${n}, and this account has its own record too. Merge the two records instead.` }
  // (When clash && !custId the login ADOPTS that record — moveCustomerEmail keeps the old address on it.)

  if (uid) {
    const { error: aErr } = await db.auth.admin.updateUserById(uid, { email: n, email_confirm: true })
    if (aErr) return { ok: false, status: 500, error: `Could not change the login: ${aErr.message}` }
  }
  const r = await moveCustomerEmail(db, { oldEmail: o, newEmail: n, by: 'admin', authUserId: uid })
  // The login moved but the customer row didn't — put the login back rather
  // than leave the member split across two addresses.
  if (!r.ok && uid) {
    const { error: back } = await db.auth.admin.updateUserById(uid, { email: o, email_confirm: true })
    if (back) console.error('[email-change] could not restore login email:', back.message)
  }
  await log(db, { auth_user_id: uid, customer_id: r.customerId ?? custId, old_email: o, new_email: n, changed_by: 'admin',
    status: r.status, applied_at: new Date().toISOString(), note: r.ok ? null : r.error })
  if (!r.ok) return { ok: false, status: 500, error: r.error }

  // Heads-up to the NEW address so they aren't left guessing. Non-fatal.
  if (uid) {
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL || 'https://madekulture.com'
      await sendSimpleEmail({
        to: n,
        subject: 'Your Made Kulture login email was updated',
        heading: 'Your login email is updated',
        paragraphs: [
          `The studio updated the email on your Made Kulture account to <strong style="color:#fff;">${n}</strong>.`,
          'Sign in with this address and your existing password — or with Google, if that’s how you signed up. No verification needed.',
          'If you didn’t ask for this, text the studio at (832) 408-1631.',
        ],
        ctaText: 'Sign in',
        ctaUrl: `${base}/login`,
        label: 'account',
      })
    } catch (e) { console.warn('[email-change] notice email failed:', e) }
  }
  return { ok: true, email: n }
}

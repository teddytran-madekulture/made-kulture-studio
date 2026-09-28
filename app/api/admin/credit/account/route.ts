// /api/admin/credit/account — one customer's studio credit (admin only).
//   GET  ?customerId= | ?authUserId=          → balance, pots, reward expiry, full history
//   POST { customerId|authUserId, direction: 'add'|'remove', amountCents, reason, notify? }
//        → writes ONE `adjustment` row (never edits history). Remove is capped at
//          the balance. created_by = 'admin'.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { loadLedger, authUsers, rewardExpiry, KIND_LABEL } from '@/lib/credit-admin'
import { splitPots } from '@/lib/rewards'
import { sendSMSResult } from '@/lib/sms'
import { sendSimpleEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function resolve(db: any, customerId?: string | null, authUserId?: string | null) {
  let email: string | null = null, name: string | null = null, phone: string | null = null, custId = customerId ?? null
  if (customerId) {
    const { data } = await db.from('customers').select('id, name, email, phone').eq('id', customerId).maybeSingle()
    if (!data) return null
    email = data.email ? String(data.email).toLowerCase() : null; name = data.name; phone = data.phone
  }
  let uid = authUserId ?? null
  if (!uid || !email) {
    const u = await authUsers(db)
    if (!uid && email) uid = u.idByEmail.get(email) ?? null
    if (uid && !email) email = u.emailById.get(uid) ?? null
  }
  if (!custId && email) {
    const { data } = await db.from('customers').select('id, name, phone').eq('email', email).maybeSingle()
    if (data) { custId = data.id; name = data.name; phone = data.phone }
  }
  return { authUserId: uid, email, name, phone, customerId: custId }
}

async function view(db: any, who: any) {
  if (!who.authUserId) return { ...who, hasAccount: false, balanceCents: 0, rewardCents: 0, otherCents: 0, rewardExpiresAt: null, history: [] }
  const rows = await loadLedger(db, { authUserId: who.authUserId })
  const balance = rows.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0)
  const p = splitPots(rows)
  return {
    ...who, hasAccount: true, balanceCents: balance, rewardCents: p.rewardCents, otherCents: balance - p.rewardCents,
    rewardExpiresAt: await rewardExpiry(db, who.authUserId, rows),
    history: rows.slice().reverse().map(r => ({ ...r, label: KIND_LABEL[r.kind] ?? r.kind })),
  }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  try {
    const who = await resolve(db, req.nextUrl.searchParams.get('customerId'), req.nextUrl.searchParams.get('authUserId'))
    if (!who) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
    return NextResponse.json(await view(db, who))
  } catch (e: any) {
    return NextResponse.json({ error: `Read failed: ${e?.message}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const body = await req.json().catch(() => ({}))
  const direction = body.direction === 'remove' ? 'remove' : body.direction === 'add' ? 'add' : null
  const cents = Math.round(Number(body.amountCents))
  const reason = String(body.reason ?? '').trim().slice(0, 300)
  if (!direction) return NextResponse.json({ error: 'Add or remove?' }, { status: 400 })
  if (!(cents > 0) || cents > 500000) return NextResponse.json({ error: 'Enter an amount between $0.01 and $5,000.' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'A reason is required — it goes in the history.' }, { status: 400 })

  try {
    const who = await resolve(db, body.customerId, body.authUserId)
    if (!who) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
    if (!who.authUserId) return NextResponse.json({ error: 'This customer has no account, so credit can’t be stored. They need to sign up with this email first.' }, { status: 400 })

    let amount = cents
    if (direction === 'remove') {
      const rows = await loadLedger(db, { authUserId: who.authUserId })
      const balance = rows.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0)
      if (balance <= 0) return NextResponse.json({ error: 'They have no credit to remove.' }, { status: 400 })
      amount = -Math.min(cents, balance)
    }
    const { data, error } = await db.from('credit_ledger').insert({
      auth_user_id: who.authUserId, amount_cents: amount, kind: 'adjustment',
      reason: `${direction === 'add' ? 'Added' : 'Removed'} by admin — ${reason}`, created_by: 'admin', expires_at: null,
    }).select('id')
    if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Not saved.' }, { status: 500 })

    let notified: string | null = null
    if (body.notify && direction === 'add') {
      const dollars = (amount / 100).toFixed(2)
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
      try {
        // ⚠️ sendSMS is fire-and-forget and never reports failure — it made this
        // route claim "Texted them" for a text that never went. Use the result.
        // ok:true still only means Twilio ACCEPTED it, not that it was delivered.
        const sms = who.phone ? await sendSMSResult(who.phone, `Made Kulture: we've added $${dollars} in studio credit to your account. It applies automatically at your next booking. ${appUrl}/account`) : null
        if (sms?.ok) notified = 'text'
        else if (who.email) {
          await sendSimpleEmail({ to: who.email, subject: `$${dollars} studio credit added`, heading: 'Studio credit added',
            paragraphs: [`We've added <strong>$${dollars}</strong> in studio credit to your Made Kulture account. It applies automatically at your next booking.`],
            ctaText: 'View your account', ctaUrl: `${appUrl}/account` })
          notified = sms ? 'email_after_text_failed' : 'email'
        } else notified = 'failed'
        if (sms && !sms.ok) console.error('[credit adjust] text failed:', sms.error)
      } catch { notified = 'failed' }
    }
    return NextResponse.json({ ok: true, appliedCents: amount, capped: direction === 'remove' && -amount < cents, notified, ...(await view(db, who)) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

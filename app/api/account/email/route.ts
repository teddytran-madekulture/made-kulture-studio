import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normEmail } from '@/lib/customer-email'
import { EMAIL_RE } from '@/lib/email-change'
import { standingForEmail } from '@/lib/standing'
import { sendSimpleEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/account/email { email } — a member asks to change their login email.
// Step 1 of 2 (see lib/email-change.ts): record the request, then have Supabase
// email a confirmation link to the NEW address. Nothing changes until they
// click it; /auth/callback finishes the move.
//
// ⚠️ Accounts below good standing can't do this themselves (Teddy, 2026-10-01)
// — a fresh address must never be a way to step around a record.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const n = normEmail(body?.email)
  if (!EMAIL_RE.test(n)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  const o = normEmail(user.email)
  if (n === o) return NextResponse.json({ error: 'That’s already your email.' }, { status: 400 })

  const db = supabaseAdmin()
  const st = await standingForEmail(db, o)
  if (st.level !== 'good') {
    return NextResponse.json({ error: 'To update the email on this account, please contact the studio.' }, { status: 403 })
  }

  // Any earlier unconfirmed request is superseded by this one.
  await db.from('customer_email_changes').update({ status: 'cancelled', note: 'superseded' })
    .eq('auth_user_id', user.id).eq('status', 'pending')
  const { data: row, error: logErr } = await db.from('customer_email_changes')
    .insert({ auth_user_id: user.id, customer_id: st.customerId, old_email: o, new_email: n, changed_by: 'customer', status: 'pending' })
    .select('id').single()
  // Without the log row the confirmation could not be finished — refuse up front.
  if (logErr || !row) return NextResponse.json({ error: 'Could not start the change — please try again.' }, { status: 500 })

  const origin = req.nextUrl.origin
  const { error } = await supabase.auth.updateUser({ email: n }, { emailRedirectTo: `${origin}/auth/callback?next=/account/security` })
  if (error) {
    await db.from('customer_email_changes').update({ status: 'cancelled', note: error.message }).eq('id', row.id)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // 2026-10-07: tell the CURRENT address too. If the account was taken over,
  // this is how the real owner finds out before the link is clicked.
  const safe = n.replace(/[<>&"]/g, '')
  await sendSimpleEmail({
    to: o,
    subject: 'Your Made Kulture email is being changed',
    heading: 'Email change requested',
    paragraphs: [
      `Someone signed in to your Made Kulture account asked to change its email to <strong style="color:#fff">${safe}</strong>. Nothing changes until the confirmation link sent to that address is clicked.`,
      'If this was you, there’s nothing else to do. If it wasn’t, contact us right away and we’ll secure your account.',
    ],
    ctaText: 'Contact support',
    ctaUrl: 'https://madekulture.com/support',
    label: 'email_change_notice',
  }).catch(e => console.error('[account/email] old-address notice failed:', e))

  return NextResponse.json({ ok: true, email: n })
}

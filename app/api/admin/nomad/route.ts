// /api/admin/nomad — review Nomad applications (Phase 1, 2026-10-25).
//   GET   → every application, newest first, with waitlist position and
//           whether the email already has a website login.
//   PATCH → { id, status?, admin_notes?, notify? } — change status / private notes; with
//           notify:true, approving sends the invite email and waitlisting
//           sends the waitlist email (each once, stamped).
// Linked from BOTH admin sidebars.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { listAllAuthUsers, findAuthUserIdByEmail } from '@/lib/auth-user'
import { sendSimpleEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const STATUSES = new Set(['new', 'approved', 'waitlisted', 'declined'])
// sendSimpleEmail returns null (no throw) when RESEND_API_KEY is unset — treat
// that as a failure, or the invite would be stamped as sent when nothing went out.
async function send(opts: Parameters<typeof sendSimpleEmail>[0]) {
  const r = await sendSimpleEmail(opts)
  if (!r) throw new Error('Email not sent: RESEND_API_KEY is not set')
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const { data, error } = await db.from('nomad_interest').select('*').order('created_at', { ascending: false })
  // A failed read must never render as "no applications".
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let logins = new Set<string>()
  try {
    const users = await listAllAuthUsers(db)
    logins = new Set(users.map((u: any) => String(u.email || '').toLowerCase()).filter(Boolean))
  } catch (e) {
    console.error('[admin/nomad] auth user list failed:', e)
  }

  const rows = data ?? []
  const waitlist = rows
    .filter(r => r.status === 'waitlisted')
    .sort((a, b) => String(a.reviewed_at || a.created_at).localeCompare(String(b.reviewed_at || b.created_at)))
  const pos = new Map(waitlist.map((r, i) => [r.id, i + 1]))

  const counts: Record<string, number> = { new: 0, approved: 0, waitlisted: 0, declined: 0 }
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1

  return NextResponse.json({
    counts,
    applications: rows.map(r => ({
      ...r,
      waitlist_position: pos.get(r.id) ?? null,
      has_login: logins.has(String(r.email || '').toLowerCase()),
    })),
  })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const db = supabaseAdmin()

  const { data: row, error: readErr } = await db.from('nomad_interest').select('*').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  // `notes` is the APPLICANT's answer from the form; Teddy's notes are admin_notes.
  if (typeof body.admin_notes === 'string') patch.admin_notes = body.admin_notes.slice(0, 4000)
  if (body.status !== undefined) {
    const status = String(body.status)
    if (!STATUSES.has(status)) return NextResponse.json({ error: 'Bad status' }, { status: 400 })
    if (status !== row.status) {
      patch.status = status
      // Re-entering the waitlist goes to the back of the line.
      patch.reviewed_at = new Date().toISOString()
    }
  }

  // Email first decision, so a failed send is reported before anything is stamped.
  let emailed: string | null = null
  let emailError: string | null = null
  const finalStatus = (patch.status as string) ?? row.status
  if (body.notify === true) {
    const first = String(row.name || '').trim().split(/\s+/)[0] || 'there'
    try {
      if (finalStatus === 'approved' && !row.invited_at) {
        // Existing members just sign in; only people without a login are sent to sign up.
        const hasLogin = !!(await findAuthUserIdByEmail(db, row.email).catch(() => null))
        const signup = `${APP_URL}/signup?${new URLSearchParams({ email: row.email, name: row.name || '', next: '/account/nomad' })}`
        await send({
          to: row.email,
          label: 'nomad_invite',
          subject: "You're in: Made Kulture Nomad",
          heading: `${first}, you're in the founding group`,
          paragraphs: [
            'Thanks for applying to Nomad, our members-only home base for creatives in Mexico City. We’d love to have you in the founding group.',
            hasLogin
              ? `You already have a Made Kulture account under <strong style="color:#fff;">${row.email}</strong>, so there’s nothing to set up. Sign in with it anytime and you’ll find Nomad in your account.`
              : `Next step: create your free Made Kulture member account using <strong style="color:#fff;">${row.email}</strong>. That’s where your Nomad membership will live.`,
            'We’ll be in touch personally with dates, pricing and the house details as the home comes together. Nothing is charged yet.',
          ],
          ctaText: hasLogin ? 'Open Nomad' : 'Create my account',
          ctaUrl: hasLogin ? `${APP_URL}/account/nomad` : signup,
        })
        patch.invited_at = new Date().toISOString()
        emailed = 'invite'
      } else if (finalStatus === 'waitlisted' && !row.waitlist_notified_at) {
        await send({
          to: row.email,
          label: 'nomad_waitlist',
          subject: "You're on the Nomad waitlist",
          heading: `Thanks, ${first}`,
          paragraphs: [
            'Nomad is capped so the house never gets crowded, and the founding group is currently full.',
            'You’re on the waitlist. When a spot opens, we’ll reach out to you directly. Nothing is charged.',
          ],
        })
        patch.waitlist_notified_at = new Date().toISOString()
        emailed = 'waitlist'
      }
    } catch (e: any) {
      console.error('[admin/nomad] email failed:', e)
      emailError = e?.message || 'Email failed to send'
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: !emailError, emailed, emailError })
  }

  // .select() so an update that matched nothing is an error, not a silent success.
  const { data: updated, error } = await db.from('nomad_interest').update(patch).eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Nothing was updated' }, { status: 404 })
  return NextResponse.json({ ok: !emailError, emailed, emailError })
}

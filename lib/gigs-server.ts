// GIGS (migration 185) — server-only: member alerts and every notification the
// feature sends. Every send here is best-effort and NEVER throws into the
// caller: a gig going live must not fail because one email bounced.
//
// ⚠️ PRIVACY RULE FOR THIS FILE: a member's email or phone is never put in
// anything that goes to a company, and a company's email is never put in
// anything that goes to a member. Both sides talk through the site.
import { createClient } from '@supabase/supabase-js'
import { selectAll } from '@/lib/select-all'
import { listAllAuthUsers } from '@/lib/auth-user'
import { profileBlockers } from '@/lib/directory-listing'
import { sendMemberPush } from '@/lib/member-push'
import { sendOwnerPush } from '@/lib/push'
import { sendSimpleEmail, sendGigAlertBatch } from '@/lib/email'
import { gigDateLabel, isRelayedGig } from '@/lib/gigs'

export const gigDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export function gigUrl(id: string) { return `${APP_URL}/account/gigs/${id}` }
export function gigManageUrl(token: string) { return `${APP_URL}/gig-manage/${token}` }

export function escHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type GigRow = {
  id: string; title: string; company_name: string; pay: string; roles_needed: string[] | null
  gig_date: string | null; date_note: string | null; location: string | null; poster_id: string | null
  posted_by: string; company_email: string | null; manage_token: string
}

function whenLine(g: Pick<GigRow, 'gig_date' | 'date_note'>): string {
  return [gigDateLabel(g.gig_date), g.date_note].filter(Boolean).join(' · ')
}

/**
 * Send the "new paid gig" alerts for a gig that just went live. Runs ONCE per
 * gig: alerts_sent_at is CLAIMED with a conditional update, so a double tap on
 * APPROVE (or approve + restore) can't alert everyone twice.
 * Recipients = listed directory members whose roles overlap the gig's, with
 * notify_gigs on, minus the poster. Push to all of them; email to those who
 * also have notify_email on. A CLIENT gig (customer-posted) also skips anyone
 * who turned off gig_alerts_clients ("brands and companies only").
 */
export async function sendGigAlerts(gigId: string): Promise<{ recipients: number; pushed: number; emailed: number; error?: string }> {
  const out = { recipients: 0, pushed: 0, emailed: 0 } as { recipients: number; pushed: number; emailed: number; error?: string }
  try {
    const { data: claimed, error: cErr } = await gigDb.from('gigs')
      .update({ alerts_sent_at: new Date().toISOString() })
      .eq('id', gigId).is('alerts_sent_at', null).eq('status', 'live').eq('is_test', false)
      .select('id, title, company_name, pay, roles_needed, gig_date, date_note, location, poster_id, posted_by, company_email, manage_token')
    if (cErr) return { ...out, error: cErr.message }
    const gig = (claimed ?? [])[0] as GigRow | undefined
    if (!gig) return out   // already sent, or not live
    const wanted = new Set((gig.roles_needed ?? []).map(r => r.toLowerCase()))
    if (!wanted.size) return out

    const { data: profs, error: pErr } = await selectAll(() => gigDb.from('customer_profiles')
      .select('id, full_name, roles, bio, instagram, links, account_type, directory_opt_in, vendor_terms_accepted_at, notify_email, notify_gigs, gig_alerts_clients')
      .eq('directory_opt_in', true).order('id'))
    if (pErr) return { ...out, error: pErr.message }
    const matches = (profs ?? []).filter((p: any) =>
      p.id !== gig.poster_id && p.notify_gigs !== false &&
      !(gig.posted_by === 'client' && p.gig_alerts_clients === false) &&
      (p.roles ?? []).some((r: string) => wanted.has(String(r).toLowerCase())))
    if (!matches.length) { await gigDb.from('gigs').update({ alerts_count: 0 }).eq('id', gigId); return out }

    // Listed = the directory's own rule (needs the one-query photo lookup).
    const { data: pics, error: picErr } = await selectAll(() => gigDb.from('portfolio_images').select('user_id').order('id'))
    if (picErr) return { ...out, error: picErr.message }
    const withPhoto = new Set((pics ?? []).map((r: any) => r.user_id))
    const listed = matches.filter((p: any) => profileBlockers(p, withPhoto.has(p.id)).length === 0)
    out.recipients = listed.length

    const title = `New paid gig: ${gig.title}`
    const body = [gig.company_name, gig.pay, whenLine(gig)].filter(Boolean).join(' · ').slice(0, 160)
    for (let i = 0; i < listed.length; i += 10) {
      const chunk = listed.slice(i, i + 10)
      const n = await Promise.all(chunk.map((p: any) => sendMemberPush(p.id, { title, body, url: `/account/gigs/${gig.id}?from=push`, tag: `gig-${gig.id}` }).catch(() => 0)))
      out.pushed += n.filter(x => x > 0).length
    }

    const emailIds = new Set(listed.filter((p: any) => p.notify_email !== false).map((p: any) => p.id))
    if (emailIds.size) {
      const users = await listAllAuthUsers(gigDb)
      const to = users.filter(u => emailIds.has(u.id) && u.email).map(u => String(u.email))
      out.emailed = await sendGigAlertBatch(to, {
        title: gig.title, company: gig.company_name, pay: gig.pay, when: whenLine(gig),
        location: gig.location || '', roles: gig.roles_needed ?? [], url: `${gigUrl(gig.id)}?from=email`,
      })
    }
    await gigDb.from('gigs').update({ alerts_count: out.recipients }).eq('id', gigId)
    return out
  } catch (e: any) {
    console.error('[gigs] alerts failed:', e)
    return { ...out, error: e?.message || 'alerts failed' }
  }
}

/**
 * View counts per gig from community_events (gig_view, written by the member gig
 * page; never counts the poster). THROWS on a read error so a failed lookup can
 * never show as "0 views". 2026-11-23.
 */
export async function gigViewStats(ids: string[]): Promise<Record<string, { views: number; viewers: number; push: number; email: number; board: number }>> {
  const out: Record<string, { views: number; viewers: number; push: number; email: number; board: number }> = {}
  if (!ids.length) return out
  const seen: Record<string, Set<string>> = {}
  for (let from = 0; ; from += 1000) {
    const { data, error } = await gigDb.from('community_events').select('user_id, target_id, meta')
      .eq('type', 'gig_view').in('target_id', ids).order('id').range(from, from + 999)
    if (error) throw new Error(`gig views: ${error.message}`)
    for (const e of data ?? []) {
      const g = out[e.target_id] ??= { views: 0, viewers: 0, push: 0, email: 0, board: 0 }
      g.views++
      const src = (e.meta as any)?.src
      if (src === 'push' || src === 'email' || src === 'board') g[src as 'push' | 'email' | 'board']++
      ;(seen[e.target_id] ??= new Set()).add(e.user_id)
    }
    if (!data || data.length < 1000) break
  }
  for (const id of Object.keys(out)) out[id].viewers = seen[id]?.size ?? 0
  return out
}

/** Tell a member poster their gig was approved or declined. A CLIENT poster
 *  can't open the members' gig page, so their links go to /account/hire. */
export async function notifyPosterDecision(gig: GigRow, decision: 'approved' | 'declined', reason?: string | null) {
  if (!gig.poster_id) return
  try {
    const approved = decision === 'approved'
    const client = gig.posted_by === 'client'
    const link = client ? `${APP_URL}/account/hire` : gigUrl(gig.id)
    await sendMemberPush(gig.poster_id, {
      title: approved ? 'Your gig is live' : 'Your gig was not approved',
      body: approved ? gig.title : `${gig.title}${reason ? ` · ${reason}` : ''}`.slice(0, 160),
      url: client ? '/account/hire' : `/account/gigs/${gig.id}`, tag: `gig-${gig.id}`,
    })
    const [{ data: prof }, { data: au }] = await Promise.all([
      gigDb.from('customer_profiles').select('notify_email').eq('id', gig.poster_id).maybeSingle(),
      gigDb.auth.admin.getUserById(gig.poster_id),
    ])
    const to = au?.user?.email
    // A client hears "approved" through the manage-link email instead (see admin approve).
    if (!to || prof?.notify_email === false || (client && approved)) return
    await sendSimpleEmail({
      to, label: approved ? 'gig_approved' : 'gig_declined',
      subject: approved ? `Your gig is live: ${gig.title}` : `Your gig wasn't approved: ${gig.title}`,
      heading: approved ? 'Your gig is live' : 'Your gig wasn’t approved',
      paragraphs: approved
        ? [`<strong style="color:#fff;">${escHtml(gig.title)}</strong> is now on Gigs, and members whose roles match have been notified.`, 'Applications show up on the gig page and in your messages.']
        : [`<strong style="color:#fff;">${escHtml(gig.title)}</strong> wasn’t approved for Gigs.`, ...(reason ? [`Reason: ${escHtml(reason)}`] : []), 'You can edit the details and post it again, or reply to this email with any questions.'],
      ctaText: client ? 'Your posts' : 'View gig', ctaUrl: link,
    })
  } catch (e) { console.error('[gigs] poster notice failed (non-fatal):', e) }
}

/** Studio-posted gig: send the company its private manage link. */
export async function emailCompanyManageLink(gig: GigRow): Promise<boolean> {
  if (!gig.company_email) return false
  try {
    await sendSimpleEmail({
      to: gig.company_email, label: 'gig_company_link',
      subject: `Your gig is live on Made Kulture: ${gig.title}`,
      heading: 'Your gig is live',
      paragraphs: [
        `We shared <strong style="color:#fff;">${escHtml(gig.title)}</strong> with the Made Kulture creative community in Houston.`,
        'Everyone who applies shows up on your private gig page, with their portfolio and a short note. You can reply to each of them right there, and we’ll email you when someone applies or answers.',
        'Keep this link to yourself. Anyone who has it can see your applicants.',
      ],
      ctaText: 'See your applicants', ctaUrl: gigManageUrl(gig.manage_token),
    })
    return true
  } catch (e) { console.error('[gigs] company link email failed:', e); return false }
}

/** Someone applied: tell whoever posted the gig. */
export async function notifyNewApplicant(gig: GigRow, applicantName: string, note: string, conversationId: string | null) {
  try {
    if (gig.posted_by === 'member' && gig.poster_id) {
      await sendMemberPush(gig.poster_id, {
        title: `New applicant: ${gig.title}`, body: `${applicantName}${note ? ` · ${note.slice(0, 80)}` : ''}`,
        url: `/account/gigs/${gig.id}#applicants`, tag: `gig-app-${gig.id}`,
      })
      const [{ data: prof }, { data: au }] = await Promise.all([
        gigDb.from('customer_profiles').select('notify_email').eq('id', gig.poster_id).maybeSingle(),
        gigDb.auth.admin.getUserById(gig.poster_id),
      ])
      const to = au?.user?.email
      if (to && prof?.notify_email !== false) {
        await sendSimpleEmail({
          to, label: 'gig_applicant', subject: `${applicantName} applied: ${gig.title}`,
          heading: 'New applicant',
          paragraphs: [`<strong style="color:#fff;">${escHtml(applicantName)}</strong> applied to <strong style="color:#fff;">${escHtml(gig.title)}</strong>.`, ...(note ? [`“${escHtml(note)}”`] : [])],
          ctaText: conversationId ? 'Reply' : 'See applicants',
          ctaUrl: conversationId ? `${APP_URL}/account/messages/${conversationId}` : `${gigUrl(gig.id)}#applicants`,
        })
      }
    } else if (gig.company_email) {
      await sendSimpleEmail({
        to: gig.company_email, label: 'gig_company_applicant', subject: `New applicant for ${gig.title}`,
        heading: 'Someone applied',
        paragraphs: [`<strong style="color:#fff;">${escHtml(applicantName)}</strong> applied to <strong style="color:#fff;">${escHtml(gig.title)}</strong>.`, ...(note ? [`“${escHtml(note)}”`] : []), 'Their portfolio is on your gig page, and you can reply to them there.'],
        ctaText: 'See applicant', ctaUrl: gigManageUrl(gig.manage_token),
      })
    }
    // Teddy sees studio- and client-posted applications too — he's the connector.
    if (isRelayedGig(gig)) {
      await sendOwnerPush({ title: `Gig applicant: ${gig.title}`, body: `${applicantName} · ${gig.company_name}`, url: '/admin/gigs', tag: `gig-app-${gig.id}` })
    }
  } catch (e) { console.error('[gigs] applicant notice failed (non-fatal):', e) }
}

/** Company replied on a studio-posted gig: tell the member. */
export async function notifyMemberCompanyReply(gig: GigRow, applicantId: string, body: string) {
  try {
    await sendMemberPush(applicantId, {
      title: `${gig.company_name} replied`, body: body.slice(0, 120),
      url: `/account/gigs/${gig.id}#thread`, tag: `gig-thread-${gig.id}`,
    })
    const [{ data: prof }, { data: au }] = await Promise.all([
      gigDb.from('customer_profiles').select('notify_email').eq('id', applicantId).maybeSingle(),
      gigDb.auth.admin.getUserById(applicantId),
    ])
    const to = au?.user?.email
    if (!to || prof?.notify_email === false) return
    await sendSimpleEmail({
      to, label: 'gig_company_reply', subject: `${gig.company_name} replied about ${gig.title}`,
      heading: `${gig.company_name} replied`,
      paragraphs: [`About <strong style="color:#fff;">${escHtml(gig.title)}</strong>:`, `“${escHtml(body.slice(0, 1500))}”`, 'Reply on the gig page. Your email stays private.'],
      ctaText: 'Reply', ctaUrl: `${gigUrl(gig.id)}#thread`,
    })
  } catch (e) { console.error('[gigs] member reply notice failed (non-fatal):', e) }
}

/** Member replied on a studio-posted gig: tell the company. */
export async function notifyCompanyMemberReply(gig: GigRow, memberName: string, body: string) {
  if (!gig.company_email) return
  try {
    await sendSimpleEmail({
      to: gig.company_email, label: 'gig_member_reply', subject: `${memberName} replied about ${gig.title}`,
      heading: `${memberName} replied`,
      paragraphs: [`About <strong style="color:#fff;">${escHtml(gig.title)}</strong>:`, `“${escHtml(body.slice(0, 1500))}”`, 'Reply on your gig page.'],
      ctaText: 'Reply', ctaUrl: gigManageUrl(gig.manage_token),
    })
  } catch (e) { console.error('[gigs] company reply notice failed (non-fatal):', e) }
}

export const GIG_SELECT = 'id, is_test, posted_by, poster_id, company_name, company_email, manage_token, title, description, roles_needed, pay, gig_date, date_note, location, at_studio, apply_by, status, decline_reason, pull_reason, approved_at, alerts_sent_at, alerts_count, expires_at, created_at, updated_at'

/** What a MEMBER may see of a gig. Never the company email or manage token. */
export function publicGig(g: any) {
  return {
    id: g.id, posted_by: g.posted_by, poster_id: g.poster_id, company_name: g.company_name,
    title: g.title, description: g.description, roles_needed: g.roles_needed ?? [], pay: g.pay,
    gig_date: g.gig_date, date_note: g.date_note, location: g.location, at_studio: !!g.at_studio,
    apply_by: g.apply_by, status: g.status, expires_at: g.expires_at, created_at: g.created_at,
  }
}

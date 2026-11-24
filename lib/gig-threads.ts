// 2026-11-23 — the APPLICANT's side of relayed gig threads (company/client gigs,
// where the conversation is gig_messages and not a DM). Feeds two things:
//   • rows in the member's Messages list that link to the gig page thread
//   • the unread count in the red badges + the app-icon number (lib/member-badge)
// "Unread" = company messages newer than gig_applications.member_read_at
// (migration 192); the gig page GET stamps it. Both functions THROW on a read
// error so a failed lookup never shows as "no replies" or a badge of 0.
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export type GigThreadRow = {
  gigId: string
  title: string
  company: string
  last: { body: string; fromMe: boolean; at: string }
  unread: number
}

/** Gigs I applied to where the company has written back, newest reply first. */
export async function gigThreadRows(userId: string): Promise<GigThreadRow[]> {
  const { data: apps, error } = await db.from('gig_applications')
    .select('id, gig_id, member_read_at').eq('applicant_id', userId)
  if (error) throw new Error(`gig applications: ${error.message}`)
  if (!apps?.length) return []
  const { data: gigs, error: gErr } = await db.from('gigs')
    .select('id, title, company_name, posted_by').in('id', apps.map(a => a.gig_id)).in('posted_by', ['studio', 'client'])
  if (gErr) throw new Error(`gigs: ${gErr.message}`)
  const gigById = new Map((gigs ?? []).map(g => [g.id, g]))
  const mine = apps.filter(a => gigById.has(a.gig_id))
  if (!mine.length) return []
  const { data: msgs, error: mErr } = await db.from('gig_messages')
    .select('application_id, sender, body, created_at').in('application_id', mine.map(a => a.id)).order('created_at')
  if (mErr) throw new Error(`gig messages: ${mErr.message}`)

  const rows: GigThreadRow[] = []
  for (const a of mine) {
    const thread = (msgs ?? []).filter(m => m.application_id === a.id)
    const fromCompany = thread.filter(m => m.sender === 'company')
    if (!fromCompany.length) continue   // nothing to read yet: my own note is not a conversation
    const lastMsg = thread[thread.length - 1]
    const readAt = a.member_read_at ? new Date(a.member_read_at).getTime() : 0
    const g = gigById.get(a.gig_id)!
    rows.push({
      gigId: g.id, title: g.title, company: g.company_name,
      last: { body: lastMsg.body, fromMe: lastMsg.sender !== 'company', at: lastMsg.created_at },
      unread: fromCompany.filter(m => new Date(m.created_at).getTime() > readAt).length,
    })
  }
  return rows.sort((x, y) => (x.last.at < y.last.at ? 1 : -1))
}

/** Company replies I have not opened, across every gig I applied to. */
export async function unreadGigReplyCount(userId: string): Promise<number> {
  return (await gigThreadRows(userId)).reduce((n, r) => n + r.unread, 0)
}

/** Stamp the thread as read. Returns true when it CHANGED something, so the
 *  caller only re-syncs the app-icon badge when there was something to clear. */
export async function markGigThreadRead(applicationId: string): Promise<boolean> {
  const { data: app, error } = await db.from('gig_applications').select('member_read_at').eq('id', applicationId).maybeSingle()
  if (error) throw new Error(`gig read lookup: ${error.message}`)
  if (!app) return false
  let q = db.from('gig_messages').select('id', { count: 'exact', head: true }).eq('application_id', applicationId).eq('sender', 'company')
  if (app.member_read_at) q = q.gt('created_at', app.member_read_at)
  const { count, error: cErr } = await q
  if (cErr) throw new Error(`gig read count: ${cErr.message}`)
  if (!count) return false
  const { error: uErr } = await db.from('gig_applications').update({ member_read_at: new Date().toISOString() }).eq('id', applicationId)
  if (uErr) throw new Error(`gig read stamp: ${uErr.message}`)
  return true
}

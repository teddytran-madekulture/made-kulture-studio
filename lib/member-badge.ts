// The ONE count behind every "you have something to look at" number for a
// member (2026-10-23): the red badges in the app's nav (components/AccountRail)
// AND the number on the iPhone app icon (lib/member-push.ts). They read the
// same functions so the icon can never say 3 while the app shows 2.
//
// Counted: unread messages (listing requests ARE messages, so they're in
// here) + new applicants on castings I posted. Only things with a "seen"
// state belong here; anything without one would pin the icon at a number
// nobody can clear.
import { createClient } from '@supabase/supabase-js'

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Messages from other people since I last read each conversation. */
export async function unreadMessageCount(userId: string): Promise<number> {
  const { data: convs, error } = await service
    .from('conversations')
    .select('id, user_a, user_b, last_read_a, last_read_b')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
  if (error) throw new Error(`unread conversations: ${error.message}`)
  let total = 0
  for (const c of convs ?? []) {
    const myRead = c.user_a === userId ? c.last_read_a : c.last_read_b
    let q = service.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id).neq('sender_id', userId)
    if (myRead) q = q.gt('created_at', myRead)
    const { count, error: mErr } = await q
    if (mErr) throw new Error(`unread messages: ${mErr.message}`)
    total += count ?? 0
  }
  return total
}

/** People who applied to my castings that I haven't opened yet (migration 142). */
export async function unseenApplicantCount(userId: string): Promise<number> {
  const { data: mine, error } = await service.from('castings').select('id').eq('author_id', userId)
  if (error) throw new Error(`my castings: ${error.message}`)
  if (!mine?.length) return 0
  const { count, error: pErr } = await service.from('casting_participants')
    .select('user_id', { count: 'exact', head: true })
    .in('casting_id', mine.map(c => c.id))
    .eq('status', 'interested')
    .is('seen_by_author_at', null)
  if (pErr) throw new Error(`unseen applicants: ${pErr.message}`)
  return count ?? 0
}

/** The app-icon number. THROWS on a lookup error — callers must NOT turn a
 *  failed count into 0, which would wipe a real badge. */
export async function memberBadgeCount(userId: string): Promise<number> {
  const [m, a] = await Promise.all([unreadMessageCount(userId), unseenApplicantCount(userId)])
  return m + a
}

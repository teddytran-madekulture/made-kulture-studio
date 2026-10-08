// Member blocking (migration 148, 2026-10-07). A block hides BOTH members from
// each other everywhere in the directory and stops messages both ways. The DB
// trigger on `messages` is the backstop; these helpers keep the UI honest.
//
// Server-only: takes a service-role client.
import type { SupabaseClient } from '@supabase/supabase-js'

/** Everyone this member has blocked OR been blocked by. Throws on a DB error —
 *  a failed lookup must not quietly show a blocked member again. */
export async function blockedIds(db: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await db.from('member_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
  if (error) throw new Error(`block lookup failed: ${error.message}`)
  const out = new Set<string>()
  for (const r of data ?? []) out.add(r.blocker_id === userId ? r.blocked_id : r.blocker_id)
  return out
}

/** Block state between the viewer and one other member. Throws on a DB error. */
export async function blockState(db: SupabaseClient, me: string, other: string): Promise<{ byMe: boolean; byThem: boolean }> {
  const { data, error } = await db.from('member_blocks')
    .select('blocker_id, blocked_id')
    .or(`and(blocker_id.eq.${me},blocked_id.eq.${other}),and(blocker_id.eq.${other},blocked_id.eq.${me})`)
  if (error) throw new Error(`block lookup failed: ${error.message}`)
  return {
    byMe: (data ?? []).some(r => r.blocker_id === me),
    byThem: (data ?? []).some(r => r.blocker_id === other),
  }
}

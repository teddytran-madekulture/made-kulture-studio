// Find a website login (auth.users) by email.
//
// 2026-10-04: every caller used to run a bare `auth.admin.listUsers()`, which
// returns only the FIRST PAGE (50 accounts). Once the site passed 50 logins,
// anyone later in the list came back as "no account" - no error, just a
// silent miss. The visible symptom: approving Tricia's short-notice request
// could not find her Square customer, so her saved card was never charged and
// she was sent a payment link instead.
//
// Pages through every account and compares emails case-insensitively.
// Returns null when there is no account; THROWS if a page fails, so a partial
// list can never be mistaken for "no account" (callers already wrap this in
// try/catch and treat a failure as non-fatal).
import type { SupabaseClient } from '@supabase/supabase-js'

export async function findAuthUserIdByEmail(
  db: SupabaseClient,
  email: string | null | undefined,
): Promise<string | null> {
  const target = String(email ?? '').trim().toLowerCase()
  if (!target) return null
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const users = data?.users ?? []
    const hit = users.find(u => (u.email ?? '').trim().toLowerCase() === target)
    if (hit) return hit.id
    if (users.length < 1000) break
  }
  return null
}

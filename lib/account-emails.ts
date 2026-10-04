// Every email that has a website login (auth.users), lowercased. Used by the
// customer duplicate tools so a merge never deletes the customer record a
// signed-in member's account points at (accounts match customers by email).
// Pages through listUsers; a failed page THROWS - a partial set would make a
// real account look like "no account" and let a merge delete its record.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function accountEmails(db: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>()
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const users = data?.users ?? []
    for (const u of users) if (u.email) out.add(u.email.trim().toLowerCase())
    if (users.length < 1000) break
  }
  return out
}

export const hasPricing = (po: unknown) =>
  !!po && typeof po === 'object' && Object.keys(po as object).length > 0

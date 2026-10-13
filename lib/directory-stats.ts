// Public directory COUNTS (2026-10-13) — shared by /api/directory/stats (home
// teaser) and /api/kiosk/showcase (the "join the directory" kiosk ad), so the
// number on the wall and the number on the website can never disagree.
// Counts only: no name, photo, handle or id ever leaves here — members agreed
// to be seen by other members, not by the public.
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAll } from '@/lib/select-all'
import { isProfileComplete } from '@/lib/directory-listing'

export type DirectoryCounts = { total: number; newThisMonth: number; brands: number; roles: { role: string; count: number }[] }

/** Throws on a failed read — a failure must never render as "0 members". */
export async function getDirectoryCounts(db: SupabaseClient): Promise<DirectoryCounts> {
  const [{ data: profiles, error }, { data: pics, error: picErr }] = await Promise.all([
    selectAll(() => db.from('customer_profiles')
      .select('id, full_name, roles, instagram, bio, links, account_type, created_at, vendor_terms_accepted_at')
      .eq('directory_opt_in', true).order('id')),
    selectAll(() => db.from('portfolio_images').select('user_id').order('id')),
  ])
  if (error || picErr) throw new Error((error || picErr)!.message)

  const withPhotos = new Set((pics ?? []).map((p: { user_id: string }) => p.user_id))
  const listed = (profiles ?? []).filter(p => isProfileComplete(p as any, withPhotos.has(p.id)))

  const byRole: Record<string, number> = {}
  let brands = 0
  // "Growing": listed members whose account is under 30 days old.
  const monthAgo = Date.now() - 30 * 864e5
  const newThisMonth = listed.filter(m => m.created_at && Date.parse(m.created_at) >= monthAgo).length
  for (const m of listed) {
    if (m.account_type === 'brand') brands++
    for (const r of (m.roles ?? []) as string[]) byRole[r] = (byRole[r] || 0) + 1
  }
  const roles = Object.entries(byRole)
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role))
  return { total: listed.length, newThisMonth, brands, roles }
}

// The kiosk ad's "not just creatives" row. A tag shows only when at least one
// LISTED member holds one of its roles, so the ad never promises an empty aisle.
const AD_TAGS: [string, string[]][] = [
  ['Photographers', ['Photographer']],
  ['Videographers', ['Videographer', 'Cinematographer']],
  ['Models', ['Model']],
  ['Makeup', ['Makeup Artist']],
  ['Hair', ['Hair Stylist']],
  ['Stylists', ['Wardrobe Stylist']],
  ['Model agencies', ['Model & Talent Agency']],
  ['Car rentals', ['Vehicle Rental']],
  ['Props', ['Prop Rental']],
  ['Wardrobe', ['Wardrobe Rental']],
  ['Gear', ['Equipment Rental']],
  ['Catering', ['Catering']],
  ['Educators', ['Educator']],
]
export function directoryAdTags(c: DirectoryCounts): string[] {
  const has = new Set(c.roles.filter(r => r.count > 0).map(r => r.role.toLowerCase()))
  return AD_TAGS.filter(([, roles]) => roles.some(r => has.has(r.toLowerCase()))).map(([t]) => t)
}

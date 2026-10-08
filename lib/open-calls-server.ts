// Server-side reads for Open Calls — the ONE answer to "which calls are on
// right now", shared by /submissions and the directory home's Submissions row
// so the two can never disagree. Pure rules live in lib/open-calls.ts.
import { supabaseAdmin } from '@/lib/supabase'
import { centralDate, openCallPhase, type OpenCall, type OpenCallPhase } from '@/lib/open-calls'

const COLS = 'id, slug, title, tagline, set_slug, set_name, prize, cover_url, opens_at, closes_at, voting_opens_at, voting_closes_at, max_images, status, rolling'
const SHOWN: OpenCallPhase[] = ['open', 'voting', 'reviewing', 'upcoming']
const ORDER: Record<string, number> = { voting: 0, open: 1, reviewing: 2, upcoming: 3 }

export interface ActiveCall { c: OpenCall; phase: OpenCallPhase; cover: string | null }

/** Every call that belongs on /submissions: limited-run first (voting, then
 *  open by soonest deadline, then in review, then TBA), always-open last. */
export async function loadActiveCalls(): Promise<ActiveCall[]> {
  const sb = supabaseAdmin()
  const { data, error } = await sb.from('open_calls').select(COLS).neq('status', 'draft')
  if (error) { console.error('[open-calls] load failed:', error); return [] }
  const calls = ((data ?? []) as OpenCall[])
    .map(c => ({ c, phase: openCallPhase(c) }))
    .filter(x => SHOWN.includes(x.phase))
  // Covers fall back to the set's own photo.
  const slugs = Array.from(new Set(calls.filter(x => !x.c.cover_url && x.c.set_slug).map(x => x.c.set_slug!)))
  const setPhotos: Record<string, string | null> = {}
  if (slugs.length) {
    const { data: sets } = await sb.from('sets').select('slug, photo_url').in('slug', slugs)
    for (const s of sets ?? []) setPhotos[s.slug] = s.photo_url ?? null
  }
  return calls
    .map(x => ({ ...x, cover: x.c.cover_url || (x.c.set_slug ? setPhotos[x.c.set_slug] : null) || null }))
    .sort((a, b) =>
      Number(!!a.c.rolling) - Number(!!b.c.rolling) ||
      ORDER[a.phase] - ORDER[b.phase] ||
      (a.c.closes_at ?? '').localeCompare(b.c.closes_at ?? ''))
}

/** The short status tag: CLOSES NOV 30 · VOTING NOW · IN REVIEW · TBA · ANY SET */
export function callStatusLabel(c: OpenCall, phase: OpenCallPhase): string {
  if (phase === 'open') return c.closes_at ? `CLOSES ${centralDate(c.closes_at, { month: 'short', day: 'numeric' }).toUpperCase()}` : 'ANY SET'
  if (phase === 'voting') return 'VOTING NOW'
  if (phase === 'upcoming') return c.status === 'announced' || !c.closes_at ? 'TBA' : `OPENS ${centralDate(c.opens_at, { month: 'short', day: 'numeric' }).toUpperCase()}`
  return 'IN REVIEW'
}

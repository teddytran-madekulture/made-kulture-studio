// /submissions — ONE page for everything Made Kulture is accepting work for
// (migrations 149/150). Teddy, 2026-10-08: each open call is a SECTION on this
// page, not its own page — the limited-run sets (The Patient, Christmas…) with a
// deadline, vote and prize first, then the always-open Featured Editorial.
// New calls appear here on their own once they're set to open in Admin → Open
// Calls. /open-call/<slug> redirects to /submissions#<slug>.
//
// Kept out of the page files because Next only allows its own named exports
// from a page.

import type { Metadata } from 'next'
import SiteNav from '@/components/SiteNav'
import { supabaseAdmin } from '@/lib/supabase'
import { centralDate, openCallPhase, type OpenCall, type OpenCallPhase } from '@/lib/open-calls'
import SubmissionsBoard, { type BoardCall } from './SubmissionsBoard'

const COLS = 'id, slug, title, tagline, set_slug, set_name, prize, cover_url, opens_at, closes_at, voting_opens_at, voting_closes_at, max_images, status, rolling'
const SHOWN: OpenCallPhase[] = ['open', 'voting', 'reviewing', 'upcoming']
const ORDER: Record<string, number> = { open: 0, voting: 1, reviewing: 2, upcoming: 3 }

export const pathFor = (slug: string) => `/submissions#${slug}`

async function loadAll() {
  const sb = supabaseAdmin()
  const { data } = await sb.from('open_calls').select(COLS).neq('status', 'draft')
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
      Number(!!a.c.rolling) - Number(!!b.c.rolling) ||          // limited-run sets first
      ORDER[a.phase] - ORDER[b.phase] ||
      (a.c.closes_at ?? '').localeCompare(b.c.closes_at ?? ''))  // soonest deadline first
}

export async function submissionsMetadata(): Promise<Metadata> {
  const desc = 'Submit work shot at Made Kulture. Open calls for our limited-run sets come with a vote and a prize; the best series become the featured editorial.'
  const calls = await loadAll()
  const img = calls.find(x => x.cover)?.cover
  return { title: 'Submissions', description: desc, openGraph: { title: 'Submissions — Made Kulture', description: desc, images: img ? [img] : undefined } }
}

const mono = '"JetBrains Mono", ui-monospace, monospace'
const anton = 'Anton, "Bebas Neue", sans-serif'
const GOLD = '#c9b27e'

export async function SubmissionsView() {
  const calls = await loadAll()
  const limited = calls.filter(x => !x.c.rolling)
  const board: BoardCall[] = calls.map(({ c, phase, cover }) => toBoard(c, phase, cover))

  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <header style={{ maxWidth: 1100, margin: '0 auto', padding: '140px 20px 32px' }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: GOLD, marginBottom: 14 }}>MADE KULTURE</div>
        <h1 style={{ fontFamily: anton, fontSize: 'clamp(56px, 11vw, 132px)', lineHeight: 0.9, letterSpacing: '0.01em', margin: 0 }}>SUBMISSIONS</h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, maxWidth: 620, margin: '18px 0 0' }}>
          Shot something here you&rsquo;d put your name on? This is where it goes.
          {limited.length > 0 && ' Our limited-run sets each get their own open call, with a deadline, a vote and a prize.'}
        </p>
      </header>

      {board.length === 0
        ? <p style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 96px', fontFamily: 'Inter, sans-serif', color: 'rgba(255,255,255,0.5)' }}>Nothing is open right now. Check back soon.</p>
        : <SubmissionsBoard calls={board} />}
    </main>
  )
}

function label(c: OpenCall, phase: OpenCallPhase): string {
  if (phase === 'open') return c.closes_at ? `CLOSES ${centralDate(c.closes_at, { month: 'short', day: 'numeric' }).toUpperCase()}` : 'ANY SET'
  if (phase === 'voting') return 'VOTING NOW'
  if (phase === 'upcoming') return c.status === 'announced' || !c.closes_at ? 'TBA' : `OPENS ${centralDate(c.opens_at, { month: 'short', day: 'numeric' }).toUpperCase()}`
  return 'IN REVIEW'
}

// Everything the tile + panel need, worked out here so the client gets plain data.
function toBoard(call: OpenCall, phase: OpenCallPhase, cover: string | null): BoardCall {
  const closes = call.closes_at ? centralDate(call.closes_at) : null
  const short = (iso: string) => centralDate(iso, { month: 'short', day: 'numeric' })
  const vOpen = call.voting_opens_at ? short(call.voting_opens_at) : null
  // Same month ⇒ "Dec 1–7", not "Dec 1–Dec 7".
  const vClose = call.voting_closes_at
    ? (vOpen && centralDate(call.voting_opens_at!, { month: 'short' }) === centralDate(call.voting_closes_at, { month: 'short' })
        ? centralDate(call.voting_closes_at, { day: 'numeric' })
        : short(call.voting_closes_at))
    : null
  const range = call.max_images > 3 ? `3–${call.max_images}` : ''
  const tba = phase === 'upcoming' && (call.status === 'announced' || !closes)

  const steps = tba ? [] : call.rolling || !closes ? [
    { n: '01', h: 'Shoot it here', p: `Make something on any Made Kulture set that you'd put your name on.` },
    { n: '02', h: 'Submit any time', p: `Send your best ${range} frames with full credits. There's no deadline.` },
    { n: '03', h: 'We feature the best', p: 'Every series is reviewed by hand. The ones we pick run as the featured editorial, credited to you.' },
  ] : [
    { n: '01', h: 'Shoot it', p: `Book ${call.set_name || 'the set'} and make something you'd put your name on.` },
    { n: '02', h: `Submit by ${short(call.closes_at!)}`, p: `Send your best ${range} frames with full credits. We review every entry by hand.` },
    { n: '03', h: vOpen ? `Vote ${vOpen}–${vClose}` : 'The directory votes', p: 'Shortlisted series go to a vote by members of the Made Kulture directory.' },
  ]

  return {
    slug: call.slug, title: call.title, tagline: call.tagline, prize: call.prize, cover,
    kind: call.rolling ? 'ALWAYS OPEN' : 'OPEN CALL', status: label(call, phase), phase, tba, steps,
    setName: call.set_name, setSlug: call.set_slug, maxImages: call.max_images, closes, rolling: !!call.rolling,
  }
}

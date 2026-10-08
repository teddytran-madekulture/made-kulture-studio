'use client'

// The vote, inside the /submissions side panel (migration 151). Listed
// directory members see the shortlist and pick ONE series; they can change it
// until voting closes. No counts are shown — hidden until it ends.

import { useEffect, useState } from 'react'
import Link from 'next/link'

const GOLD = '#c9b27e'
const mono = '"JetBrains Mono", ui-monospace, monospace'
const anton = 'Anton, "Bebas Neue", sans-serif'

interface Entry {
  id: string; title: string; photographer: string; photographer_ig: string | null
  credits: { role: string; name: string; handle: string }[]; note: string | null
  mature: boolean; mine: boolean; images: string[]
}
interface State {
  signedIn?: boolean; listed?: boolean; optedIn?: boolean; blockers?: string[]
  entries: Entry[]; myVote?: string | null; closes?: string | null; error?: string
}

const btn: React.CSSProperties = { background: '#fff', color: '#000', border: 'none', padding: '14px 22px', fontFamily: mono, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }
const p: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 14.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: '0 0 16px' }

export default function VotePanel({ slug }: { slug: string }) {
  const [s, setS] = useState<State | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [adult, setAdult] = useState(false)
  const here = `/submissions#${slug}`

  const load = async () => {
    const r = await fetch(`/api/open-calls/${slug}/vote`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    setS(r.ok ? d : { entries: [], error: d.error || 'Could not load the vote.' })
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const wrap: React.CSSProperties = { padding: '28px 24px 64px' }
  if (!s) return <div style={wrap}><p style={p}>Loading the shortlist…</p></div>
  if (s.error) return <div style={wrap}><p style={{ ...p, color: '#ff8a80' }}>{s.error}</p></div>

  if (!s.signedIn) return (
    <div style={wrap}>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: GOLD, marginBottom: 10 }}>VOTING NOW</div>
      <p style={p}>The shortlist is voted on by members of the Made Kulture directory. Sign in to see it and cast your vote.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href={`/login?next=${encodeURIComponent(here)}`} style={btn}>SIGN IN TO VOTE</Link>
        <Link href={`/signup?next=${encodeURIComponent(here)}`} style={ghost}>CREATE AN ACCOUNT</Link>
      </div>
    </div>
  )

  if (!s.listed) return (
    <div style={wrap}>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: GOLD, marginBottom: 10 }}>VOTING NOW</div>
      <p style={p}>
        Voting is for members listed in the directory.{' '}
        {s.optedIn ? `Finish your profile to vote${s.blockers?.length ? ` (missing: ${s.blockers.join(', ')})` : ''}.` : 'Join the directory and finish your profile to vote.'}
      </p>
      <Link href="/account/profile" style={btn}>FINISH MY PROFILE ↗</Link>
    </div>
  )

  if (!s.entries.length) return <div style={wrap}><p style={p}>The shortlist is being finalised. Check back shortly.</p></div>

  const vote = async (id: string) => {
    setErr(null); setBusy(id)
    try {
      const r = await fetch(`/api/open-calls/${slug}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId: id }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not save your vote.'); return }
      setS(cur => cur ? { ...cur, myVote: d.myVote } : cur)
    } finally { setBusy(null) }
  }

  const closes = s.closes ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric' }).format(new Date(s.closes)) : null

  return (
    <div style={wrap}>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: GOLD, marginBottom: 10 }}>THE SHORTLIST · {s.entries.length} SERIES</div>
      <p style={p}>
        Pick the one you think should be featured. One vote each{closes ? `, and you can change it until ${closes}` : ''}. The winner is announced after voting closes.
      </p>
      {err && <p style={{ ...p, color: '#ff8a80' }}>{err}</p>}

      <div style={{ display: 'grid', gap: 28 }}>
        {s.entries.map(e => {
          const chosen = s.myVote === e.id
          const blur = e.mature && !adult
          return (
            <article key={e.id} style={{ border: `1px solid ${chosen ? GOLD : 'rgba(255,255,255,0.1)'}`, background: chosen ? 'rgba(201,178,126,0.06)' : '#0b0b0d' }}>
              <div style={{ position: 'relative', display: 'flex', gap: 4, overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
                {e.images.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt="" loading="lazy" style={{ height: 340, width: 'auto', flexShrink: 0, scrollSnapAlign: 'start', filter: blur ? 'blur(28px)' : 'none', background: '#000' }} />
                ))}
                {blur && (
                  <button onClick={() => setAdult(true)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: mono, fontSize: 11, letterSpacing: '0.16em' }}>
                    18+ · I&rsquo;M 18 OR OLDER, SHOW IT
                  </button>
                )}
              </div>
              <div style={{ padding: '16px 18px 18px' }}>
                <div style={{ fontFamily: anton, fontSize: 26, letterSpacing: '0.02em', lineHeight: 1 }}>{e.title.toUpperCase()}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, color: 'rgba(255,255,255,0.7)', margin: '6px 0 0' }}>
                  by {e.photographer}{e.photographer_ig ? ` · @${e.photographer_ig}` : ''}
                </div>
                {e.credits.length > 0 && (
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginTop: 6, lineHeight: 1.6 }}>
                    {e.credits.map(c => `${c.role}: ${c.name || ''}${c.handle ? ` @${c.handle}` : ''}`).join(' · ')}
                  </div>
                )}
                {e.note && <p style={{ ...p, fontSize: 13.5, margin: '10px 0 0' }}>{e.note}</p>}
                <div style={{ marginTop: 14 }}>
                  {e.mine
                    ? <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.45)' }}>YOUR SERIES · GOOD LUCK</span>
                    : chosen
                      ? <span style={{ fontFamily: mono, fontSize: 11.5, letterSpacing: '0.16em', color: GOLD, fontWeight: 700 }}>✓ YOUR VOTE</span>
                      : <button disabled={!!busy} onClick={() => vote(e.id)} style={{ ...(s.myVote ? ghost : btn), opacity: busy ? 0.5 : 1 }}>
                          {busy === e.id ? 'SAVING…' : s.myVote ? 'CHANGE MY VOTE TO THIS' : 'VOTE FOR THIS SERIES'}
                        </button>}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

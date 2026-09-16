'use client'
import { useEffect, useMemo, useState } from 'react'

// The Creative Directory as a roster Teddy can act on.
//
// ⚠️ The reason this page exists is the INCOMPLETE bucket. /account/directory
// only ever shows finished profiles, so a member who joined, filled in half a
// profile and stopped was invisible to everyone including the studio. Those are
// the people worth a text, and they are the default filter here for that reason.

type Photos = { visible: number; hidden: number; mature: number }
type Member = {
  id: string
  name: string
  email: string | null
  emailConfirmed: boolean
  phone: string | null
  instagram: string | null
  avatar: string | null
  accountType: 'brand' | 'creative' | 'customer'
  roles: string[]
  hasBio: boolean
  hasVideo: boolean
  linkCount: number
  photos: Photos
  optedIn: boolean
  onboarded: boolean
  joined: string | null
  listed: boolean
  blockers: string[]
}
type Counts = { total: number; listed: number; incomplete: number; optedOut: number }
type Filter = 'all' | 'listed' | 'incomplete' | 'optedOut'

const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }
const chip = (tone: 'good' | 'warn' | 'mute'): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 8px', borderRadius: 999, fontFamily: 'Inter, sans-serif',
  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
  background: tone === 'good' ? 'rgba(96,190,120,0.14)' : tone === 'warn' ? 'rgba(212,168,67,0.16)' : 'rgba(255,255,255,0.07)',
  color: tone === 'good' ? '#7fd096' : tone === 'warn' ? '#e6c07a' : 'rgba(255,255,255,0.5)',
  border: `1px solid ${tone === 'good' ? 'rgba(96,190,120,0.3)' : tone === 'warn' ? 'rgba(212,168,67,0.35)' : 'rgba(255,255,255,0.12)'}`,
})
const btn = (primary = false): React.CSSProperties => ({
  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
  padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
  border: primary ? 'none' : '1px solid rgba(255,255,255,0.18)',
  background: primary ? '#fff' : 'transparent', color: primary ? '#080808' : 'rgba(255,255,255,0.75)',
})

export default function AdminDirectoryPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/directory', { cache: 'no-store' })
      if (res.status === 401) { setUnauth(true); return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setMembers(data.members || [])
      setCounts(data.counts || null)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const allRoles = useMemo(
    () => Array.from(new Set(members.flatMap(m => m.roles))).sort(),
    [members]
  )

  const shown = useMemo(() => members.filter(m => {
    if (filter === 'listed' && !m.listed) return false
    if (filter === 'incomplete' && !(m.optedIn && m.blockers.length > 0)) return false
    if (filter === 'optedOut' && m.optedIn) return false
    if (role && !m.roles.includes(role)) return false
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [m.name, m.email ?? '', m.instagram ?? '', m.roles.join(' ')]
      .join(' ').toLowerCase().includes(needle)
  }), [members, filter, role, q])

  async function setOptedIn(m: Member, optedIn: boolean) {
    setBusy(m.id); setError('')
    try {
      const res = await fetch(`/api/admin/directory/${m.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optedIn }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      // Trust the server's echo, not the value we sent.
      setMembers(list => list.map(x => x.id === m.id
        ? { ...x, optedIn: data.optedIn, listed: data.optedIn && x.blockers.length === 0 }
        : x))
    } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  if (unauth) return <Wrap><p style={text}>Admin sign-in required. <a href="/admin" style={{ color: '#e6c07a' }}>Sign in →</a></p></Wrap>

  return (
    <Wrap>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, color: '#fff', letterSpacing: '0.02em', margin: '0 0 6px' }}>CREATIVE DIRECTORY</h1>
      <p style={{ ...text, marginTop: 0, maxWidth: 640 }}>
        Everyone with a creative profile. <strong style={{ color: '#fff' }}>Listed</strong> means a member browsing the
        directory can actually see them — a profile that is opted in but unfinished shows up nowhere, including here
        on the customer side, which is what the <strong style={{ color: '#e6c07a' }}>needs info</strong> filter is for.
      </p>

      {counts && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0 14px' }}>
          {([['all', 'All', counts.total], ['listed', 'Listed', counts.listed], ['incomplete', 'Needs info', counts.incomplete], ['optedOut', 'Not in directory', counts.optedOut]] as const).map(([key, label, n]) => (
            <button key={key} onClick={() => setFilter(key as Filter)} style={{
              ...btn(filter === key), display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {label} <span style={{ opacity: 0.6 }}>{n}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search name, email, Instagram, role…"
          style={{ flex: '1 1 260px', background: '#0b0b0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#f4f4f5', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '10px 12px', boxSizing: 'border-box' }}
        />
        {/* ⚠️ background AND color on <option> + colorScheme — a native select
            popup otherwise follows the VISITOR's OS theme, not the page. */}
        <select
          value={role} onChange={e => setRole(e.target.value)}
          style={{ background: '#0b0b0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#f4f4f5', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '10px 12px', colorScheme: 'dark' }}
        >
          <option value="" style={{ background: '#0b0b0d', color: '#f4f4f5' }}>All roles</option>
          {allRoles.map(r => <option key={r} value={r} style={{ background: '#0b0b0d', color: '#f4f4f5' }}>{r}</option>)}
        </select>
        <button onClick={load} style={btn()}>REFRESH</button>
      </div>

      {error && <p style={{ ...text, color: '#ffb4b4' }}>{error}</p>}
      {loading && <p style={text}>Loading…</p>}
      {!loading && shown.length === 0 && <p style={text}>Nobody matches that.</p>}

      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map(m => (
          <div key={m.id} style={{ ...card, padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0b0b0d', flex: '0 0 auto', overflow: 'hidden', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter, sans-serif', fontSize: 18 }}>
              {m.avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (m.name || '?').charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, color: '#fff' }}>
                  {m.name || <span style={{ color: 'rgba(255,255,255,0.35)' }}>(no name)</span>}
                </span>
                <span style={chip('mute')}>{m.accountType}</span>
                {m.listed
                  ? <span style={chip('good')}>listed</span>
                  : m.optedIn
                    ? <span style={chip('warn')}>needs info</span>
                    : <span style={chip('mute')}>not in directory</span>}
              </div>

              <div style={{ ...text, marginTop: 6, fontSize: 12.5 }}>
                {m.email || '(no email)'}{!m.emailConfirmed && m.email ? ' · unconfirmed' : ''}
                {m.phone ? ` · ${m.phone}` : ''}
                {m.instagram ? ` · @${m.instagram}` : ''}
              </div>

              <div style={{ ...text, marginTop: 6, fontSize: 12.5 }}>
                {m.roles.length ? m.roles.join(' · ') : 'no roles'}
                {' — '}
                {m.photos.visible} photo{m.photos.visible === 1 ? '' : 's'}
                {m.photos.hidden ? `, ${m.photos.hidden} hidden` : ''}
                {m.photos.mature ? `, ${m.photos.mature} mature` : ''}
                {m.linkCount ? `, ${m.linkCount} link${m.linkCount === 1 ? '' : 's'}` : ''}
                {m.hasVideo ? ', video' : ''}
              </div>

              {m.optedIn && m.blockers.length > 0 && (
                <div style={{ ...text, marginTop: 8, fontSize: 12.5, color: '#e6c07a' }}>
                  Hidden from the directory — missing: {m.blockers.join(', ')}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 8, flex: '0 0 auto' }}>
              {m.optedIn ? (
                <button
                  onClick={() => setOptedIn(m, false)} disabled={busy === m.id}
                  title="Also revokes their own access to browse the directory"
                  style={{ ...btn(), color: '#ffb4b4', opacity: busy === m.id ? 0.5 : 1 }}
                >
                  {busy === m.id ? '…' : 'REMOVE FROM DIRECTORY'}
                </button>
              ) : (
                <button onClick={() => setOptedIn(m, true)} disabled={busy === m.id} style={{ ...btn(true), opacity: busy === m.id ? 0.5 : 1 }}>
                  {busy === m.id ? '…' : 'ADD TO DIRECTORY'}
                </button>
              )}
              {m.photos.visible + m.photos.hidden > 0 && (
                <a href="/admin/portfolio" style={{ ...btn(), textDecoration: 'none', textAlign: 'center' }}>PORTFOLIO →</a>
              )}
            </div>
          </div>
        ))}
      </div>

      {m_footnote}
    </Wrap>
  )
}

const text: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }

// ⚠️ Removing someone also takes away their ability to browse, because both
// /api/directory and /api/directory/[id] gate viewing on the viewer's own
// directory_opt_in. Said once, plainly, where it can be read before clicking.
const m_footnote = (
  <p style={{ ...text, marginTop: 22, fontSize: 12, maxWidth: 640 }}>
    Removing a member from the directory also stops them browsing it — visibility and access are the same flag.
    Adding them back restores both.
  </p>
)

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    // ⚠️ var(--vh-full), never raw 100vh: globals.css zooms desktop 1.25x, so a
    // raw viewport unit paints 25% too tall. Matches the other admin pages.
    <div style={{ background: '#080808', minHeight: 'var(--vh-full)', color: '#fff', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

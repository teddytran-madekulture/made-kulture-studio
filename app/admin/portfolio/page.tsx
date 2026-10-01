'use client'
import { useEffect, useState } from 'react'

interface Report { reason: string; note: string | null; created_at: string }
interface Img {
  id: string
  user_id: string
  member: string
  url: string
  is_mature: boolean
  hidden: boolean
  explore_hidden: boolean
  explore_hidden_reason: 'admin' | 'reports' | null
  created_at: string
  reports: Report[]
}

type Filter = 'all' | 'flagged' | 'offexplore' | 'mature' | 'archived'

const REASON: Record<string, string> = {
  nudity: 'Nudity', sexual: 'Sexual content', harassment: 'Harassment / hate',
  not_theirs: 'Not their work', spam: 'Spam', other: 'Other',
}

// Three separate levers, on purpose (2026-10-01):
//   OFF EXPLORE — stays on the member's own profile, unblurred, just not in the
//                 Explore grid. For "fine, but not for the front page".
//   18+         — only for obvious nudity / explicit content. Blurred on profiles
//                 behind a reveal, never on Explore.
//   ARCHIVE     — hidden everywhere.
// Member reports are anonymous; 3 open reports take a photo off Explore until
// it's reviewed here. KEEP clears the reports and puts it back.
export default function AdminPortfolioPage() {
  const [items, setItems] = useState<Img[]>([])
  const [loading, setLoad] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get('filter')
      if (f && ['all', 'flagged', 'offexplore', 'mature', 'archived'].includes(f)) setFilter(f as Filter)
    } catch {}
    fetch('/api/admin/portfolio')
      .then(async r => {
        if (r.status === 401) { setUnauth(true); setLoad(false); return }
        const d = await r.json().catch(() => ({}))
        setItems(d.images ?? []); setLoad(false)
      })
      .catch(() => setLoad(false))
  }, [])

  const act = async (img: Img, change: Record<string, unknown>) => {
    setBusy(img.id); setErr('')
    const res = await fetch('/api/admin/portfolio', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: img.id, ...change }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.image) {
      setItems(list => list.map(i => (i.id === img.id ? { ...i, ...d.image, reports: [] } : i)))
    } else {
      setErr(d.error || 'That change did not save.')
    }
    setBusy(null)
  }

  const remove = async (img: Img) => {
    if (!window.confirm(`Permanently delete this image from ${img.member}'s portfolio? This cannot be undone.`)) return
    setBusy(img.id)
    const res = await fetch('/api/admin/portfolio', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: img.id }),
    })
    if (res.ok) setItems(list => list.filter(i => i.id !== img.id))
    setBusy(null)
  }

  const counts = {
    flagged:    items.filter(i => i.reports.length > 0).length,
    offexplore: items.filter(i => i.explore_hidden && !i.hidden).length,
    mature:     items.filter(i => i.is_mature).length,
    archived:   items.filter(i => i.hidden).length,
  }
  const shown = items
    .filter(i =>
      filter === 'all'        ? true :
      filter === 'flagged'    ? i.reports.length > 0 :
      filter === 'offexplore' ? i.explore_hidden && !i.hidden :
      filter === 'mature'     ? i.is_mature : i.hidden)
    .sort((a, b) => filter === 'flagged' ? b.reports.length - a.reports.length : 0)

  const wrap: React.CSSProperties = { background: '#080808', minHeight: 'var(--vh-full)', color: '#fff', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }
  const inner: React.CSSProperties = { maxWidth: 1000, margin: '0 auto' }
  const chip = (f: Filter, label: string, alert = false) => (
    <button key={f} onClick={() => setFilter(f)} style={{
      background: filter === f ? '#fff' : 'transparent',
      color: filter === f ? '#080808' : alert ? '#ff9b9b' : 'rgba(255,255,255,0.7)',
      border: filter === f ? '1px solid #fff' : `1px solid ${alert ? 'rgba(255,120,120,0.5)' : 'rgba(255,255,255,0.2)'}`,
      borderRadius: 20, padding: '6px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer',
    }}>{label}</button>
  )
  const btn = (color = 'rgba(255,255,255,0.8)', border = 'rgba(255,255,255,0.2)'): React.CSSProperties => ({
    flex: 1, background: 'transparent', border: `1px solid ${border}`, color, borderRadius: 4,
    padding: '7px 0', fontFamily: 'Inter', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
  })
  const tag = (text: string, color: string) => (
    <span style={{ background: 'rgba(0,0,0,0.75)', color, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 5px', borderRadius: 3 }}>{text}</span>
  )

  if (unauth) return (
    <div style={wrap}><div style={inner}><p style={{ color: 'rgba(255,255,255,0.6)' }}>Sign in to the <a href="/admin" style={{ color: '#e6c07a' }}>admin dashboard</a> first, then reload.</p></div></div>
  )

  return (
    <div style={wrap}><div style={inner}>
      <a href="/admin/dashboard" style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Dashboard</a>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '8px 0 4px' }}>PORTFOLIO MODERATION</h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '0 0 6px', lineHeight: 1.55 }}>
        <b style={{ color: '#fff' }}>Off Explore</b> keeps a photo on the member&apos;s profile but out of the Explore grid.{' '}
        <b style={{ color: '#fff' }}>18+</b> is for obvious nudity or explicit content (blurred on profiles).{' '}
        <b style={{ color: '#fff' }}>Archive</b> hides it everywhere.
      </p>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '0 0 20px', lineHeight: 1.55 }}>
        Member reports are anonymous. 3 reports take a photo off Explore until you review it. <b>Keep</b> clears the reports and puts it back.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {chip('all', `All (${items.length})`)}
        {chip('flagged', `Reported (${counts.flagged})`, counts.flagged > 0)}
        {chip('offexplore', `Off Explore (${counts.offexplore})`)}
        {chip('mature', `18+ (${counts.mature})`)}
        {chip('archived', `Archived (${counts.archived})`)}
      </div>
      {err && <div style={{ color: '#ff8080', fontSize: 12, marginBottom: 14 }}>{err}</div>}

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.35)' }}>{filter === 'flagged' ? 'No open reports.' : 'Nothing here.'}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {shown.map(img => {
            const b = busy === img.id
            return (
              <div key={img.id} style={{ background: '#141414', border: `1px solid ${img.reports.length ? 'rgba(255,120,120,0.45)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, overflow: 'hidden', opacity: img.hidden ? 0.55 : 1 }}>
                <a href={img.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', aspectRatio: '4 / 5', background: '#0f0f0f' }}>
                  <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {img.reports.length > 0 && tag(`REPORTED ×${img.reports.length}`, '#ff9b9b')}
                    {img.explore_hidden && !img.hidden && tag(img.explore_hidden_reason === 'reports' ? 'OFF EXPLORE · REPORTS' : 'OFF EXPLORE', '#9cc0ff')}
                    {img.is_mature && tag('18+', '#e6c07a')}
                    {img.hidden && tag('ARCHIVED', '#ff9b9b')}
                  </div>
                </a>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{img.member}</div>
                  {img.reports.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {img.reports.map((r, k) => (
                        <div key={k} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                          <span style={{ color: '#ff9b9b' }}>{REASON[r.reason] ?? r.reason}</span>
                          {r.note ? <span> · “{r.note}”</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button disabled={b} onClick={() => act(img, { explore_hidden: !img.explore_hidden })} style={btn('#9cc0ff', 'rgba(129,178,255,0.4)')}>
                      {img.explore_hidden ? 'Show on Explore' : 'Off Explore'}
                    </button>
                    <button disabled={b} onClick={() => act(img, { is_mature: !img.is_mature })} style={btn('#e6c07a', 'rgba(230,192,122,0.4)')}>
                      {img.is_mature ? 'Remove 18+' : 'Mark 18+'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {img.reports.length > 0 && (
                      <button disabled={b} onClick={() => act(img, { keep: true })} style={btn('#4ade80', 'rgba(74,222,128,0.4)')}>Keep</button>
                    )}
                    <button disabled={b} onClick={() => act(img, { hidden: !img.hidden })} style={btn()}>
                      {img.hidden ? 'Restore' : 'Archive'}
                    </button>
                    <button disabled={b} onClick={() => remove(img)} style={btn('#ff8080', 'rgba(255,80,80,0.4)')}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div></div>
  )
}

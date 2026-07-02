'use client'
import { useEffect, useState } from 'react'

interface Img {
  id: string
  user_id: string
  member: string
  url: string
  is_mature: boolean
  hidden: boolean
  created_at: string
}

type Filter = 'all' | 'mature' | 'archived'

export default function AdminPortfolioPage() {
  const [items, setItems] = useState<Img[]>([])
  const [loading, setLoad] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/portfolio')
      .then(async r => {
        if (r.status === 401) { setUnauth(true); setLoad(false); return }
        const d = await r.json().catch(() => ({}))
        setItems(d.images ?? []); setLoad(false)
      })
      .catch(() => setLoad(false))
  }, [])

  const setArchived = async (img: Img, hidden: boolean) => {
    setBusy(img.id)
    const res = await fetch('/api/admin/portfolio', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: img.id, hidden }),
    })
    if (res.ok) setItems(list => list.map(i => (i.id === img.id ? { ...i, hidden } : i)))
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

  const shown = items.filter(i =>
    filter === 'all' ? true : filter === 'mature' ? i.is_mature : i.hidden)

  const wrap: React.CSSProperties = { background: '#080808', minHeight: '100vh', color: '#fff', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }
  const inner: React.CSSProperties = { maxWidth: 1000, margin: '0 auto' }
  const chip = (f: Filter, label: string) => (
    <button onClick={() => setFilter(f)} style={{
      background: filter === f ? '#fff' : 'transparent',
      color: filter === f ? '#080808' : 'rgba(255,255,255,0.7)',
      border: filter === f ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)',
      borderRadius: 20, padding: '6px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer',
    }}>{label}</button>
  )

  if (unauth) return (
    <div style={wrap}><div style={inner}><p style={{ color: 'rgba(255,255,255,0.6)' }}>Sign in to the <a href="/admin" style={{ color: '#e6c07a' }}>admin dashboard</a> first, then reload.</p></div></div>
  )

  return (
    <div style={wrap}><div style={inner}>
      <a href="/admin/dashboard" style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Dashboard</a>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '8px 0 4px' }}>PORTFOLIO MODERATION</h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>
        Every member portfolio image. Archive hides an image from public profiles (reversible); delete removes it permanently.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {chip('all', `All (${items.length})`)}
        {chip('mature', `18+ (${items.filter(i => i.is_mature).length})`)}
        {chip('archived', `Archived (${items.filter(i => i.hidden).length})`)}
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.35)' }}>Nothing here.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {shown.map(img => (
            <div key={img.id} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', opacity: img.hidden ? 0.6 : 1 }}>
              <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#0f0f0f' }}>
                <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', top: 6, left: 6, display: 'flex', gap: 4 }}>
                  {img.is_mature && <span style={{ background: 'rgba(0,0,0,0.7)', color: '#e6c07a', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 5px', borderRadius: 3 }}>18+</span>}
                  {img.hidden && <span style={{ background: 'rgba(0,0,0,0.7)', color: '#ff9b9b', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 5px', borderRadius: 3 }}>ARCHIVED</span>}
                </div>
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{img.member}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button
                    disabled={busy === img.id}
                    onClick={() => setArchived(img, !img.hidden)}
                    style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', borderRadius: 4, padding: '7px 0', fontFamily: 'Inter', fontSize: 11, cursor: 'pointer' }}>
                    {img.hidden ? 'Restore' : 'Archive'}
                  </button>
                  <button
                    disabled={busy === img.id}
                    onClick={() => remove(img)}
                    style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,80,80,0.4)', color: '#ff8080', borderRadius: 4, padding: '7px 0', fontFamily: 'Inter', fontSize: 11, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}

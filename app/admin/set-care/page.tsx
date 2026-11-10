'use client'
// Admin — Set Care (2026-11-10, migration 184). Every set, tap one for its
// finishes, parts, cleaning, maintenance log (and pool sections on pool sets).
// Owner only. Source: /api/admin/set-care.

import { useEffect, useState } from 'react'
import { careDate } from '@/lib/set-care'

interface SetRow {
  id: string; name: string; slug: string; photo_url: string | null; is_active: boolean; care_pool: boolean
  counts: Record<string, number>; lastLog: string | null
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', gold: '#d4a843', red: '#e57373', blue: '#7fb3d5' }

export default function SetCarePage() {
  const [sets, setSets] = useState<SetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/set-care', { cache: 'no-store' })
      if (r.status === 401) { setUnauth(true); setLoading(false); return }
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d?.error || 'Could not load sets'); setLoading(false); return }
      setSets(d.sets ?? []); setLoading(false)
    })()
  }, [])

  if (unauth) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Admin sign-in required.</main>

  const active = sets.filter(s => s.is_active)
  const inactive = sets.filter(s => !s.is_active)

  const card = (s: SetRow) => {
    const total = Object.values(s.counts).reduce((a, b) => a + b, 0)
    return (
      <a key={s.id} href={`/admin/set-care/${s.id}`} style={{ display: 'block', textDecoration: 'none', color: C.text, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ height: 120, background: s.photo_url ? `center/cover no-repeat url("${s.photo_url}")` : '#1d1d20' }} />
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div>
            {s.care_pool && <span style={{ fontSize: 10, letterSpacing: '0.12em', color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 4, padding: '1px 5px' }}>POOL</span>}
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
            {total ? `${total} entr${total === 1 ? 'y' : 'ies'}` : 'Nothing yet'}
            {s.lastLog && <> · last logged {careDate(s.lastLog)}</>}
          </div>
        </div>
      </a>
    )
  }

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, letterSpacing: '0.04em', margin: 0 }}>Set Care</h1>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>
          Paint, parts, cleaning and maintenance for every set. Only you can see this.
        </p>
        {err && <div style={{ background: 'rgba(229,115,115,0.12)', border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 13 }}>{err}</div>}
        {loading ? <div style={{ color: C.dim, marginTop: 20 }}>Loading…</div> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginTop: 20 }}>
              {active.map(card)}
            </div>
            {inactive.length > 0 && (
              <>
                <button onClick={() => setShowInactive(v => !v)} style={{ background: 'transparent', border: 'none', color: C.dim, fontSize: 11, letterSpacing: '0.15em', margin: '28px 0 12px', cursor: 'pointer', padding: 0 }}>
                  INACTIVE SETS ({inactive.length}) {showInactive ? '▲' : '▼'}
                </button>
                {showInactive && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, opacity: 0.7 }}>
                    {inactive.map(card)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

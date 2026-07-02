'use client'
import { useEffect, useState } from 'react'

interface Suggestion {
  id: string
  role: string
  suggested_email: string | null
  created_at: string
}

export default function AdminRolesPage() {
  const [items, setItems]   = useState<Suggestion[]>([])
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState<string | null>(null)
  const [unauth, setUnauth] = useState(false)

  const load = () => {
    setLoad(true)
    fetch('/api/admin/role-suggestions')
      .then(async r => {
        if (r.status === 401) { setUnauth(true); setLoad(false); return }
        const d = await r.json().catch(() => ({}))
        setItems(d.suggestions ?? []); setLoad(false)
      })
      .catch(() => setLoad(false))
  }
  useEffect(load, [])

  const resolve = async (id: string, action: 'approve' | 'dismiss') => {
    setBusy(id)
    await fetch('/api/admin/role-suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setItems(list => list.filter(s => s.id !== id))
    setBusy(null)
  }

  const wrap: React.CSSProperties = { background: '#080808', minHeight: '100vh', color: '#fff', padding: '48px 24px', fontFamily: 'Inter, sans-serif' }
  const inner: React.CSSProperties = { maxWidth: 640, margin: '0 auto' }

  if (unauth) return (
    <div style={wrap}><div style={inner}>
      <p style={{ color: 'rgba(255,255,255,0.6)' }}>Please sign in to the <a href="/admin" style={{ color: '#e6c07a' }}>admin dashboard</a> first, then reload this page.</p>
    </div></div>
  )

  return (
    <div style={wrap}><div style={inner}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '0 0 6px' }}>ROLE SUGGESTIONS</h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 28px' }}>
        Custom roles members typed in. <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Approve</strong> to add it as a standard option everywhere, or <strong style={{ color: 'rgba(255,255,255,0.7)' }}>dismiss</strong> to hide it. (The member keeps it on their own profile either way.)
      </p>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.35)' }}>No pending role suggestions. 🎉</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(s => (
            <div key={s.id} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{s.role}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  {s.suggested_email || 'unknown'} · {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => resolve(s.id, 'approve')} disabled={busy === s.id}
                  style={{ background: '#5dca8f', color: '#080808', border: 'none', borderRadius: 4, padding: '9px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', opacity: busy === s.id ? 0.5 : 1 }}>
                  APPROVE
                </button>
                <button onClick={() => resolve(s.id, 'dismiss')} disabled={busy === s.id}
                  style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '9px 16px', fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer' }}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}

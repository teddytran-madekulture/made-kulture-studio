'use client'
import { useEffect, useState } from 'react'

interface Signup {
  id: string
  email: string
  name: string
  createdAt: string
  confirmed: boolean
  provider: string
  instagram: string | null
  roles: string[]
  inDirectory: boolean
  onboarded: boolean
}

function when(iso: string): string {
  const d = new Date(iso), now = Date.now()
  const mins = Math.round((now - d.getTime()) / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminSignupsPage() {
  const [items, setItems] = useState<Signup[]>([])
  const [loading, setLoad] = useState(true)
  const [unauth, setUnauth] = useState(false)

  useEffect(() => {
    fetch('/api/admin/signups')
      .then(async r => {
        if (r.status === 401) { setUnauth(true); setLoad(false); return }
        const d = await r.json().catch(() => ({}))
        setItems(d.signups ?? []); setLoad(false)
      })
      .catch(() => setLoad(false))
  }, [])

  const wrap: React.CSSProperties = { background: '#080808', minHeight: '100vh', color: '#fff', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }
  const inner: React.CSSProperties = { maxWidth: 760, margin: '0 auto' }
  const pill = (bg: string, fg: string, txt: string) => (
    <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{txt}</span>
  )

  if (unauth) return (
    <div style={wrap}><div style={inner}><p style={{ color: 'rgba(255,255,255,0.6)' }}>Sign in to the <a href="/admin" style={{ color: '#e6c07a' }}>admin dashboard</a> first, then reload.</p></div></div>
  )

  return (
    <div style={wrap}><div style={inner}>
      <a href="/admin/dashboard" style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>← Dashboard</a>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '8px 0 4px' }}>RECENT SIGNUPS</h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 24px' }}>
        New accounts, newest first. {items.length ? `${items.length} shown.` : ''}
      </p>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.35)' }}>No signups yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(s => (
            <div key={s.id} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{s.name || '(no name)'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                  {s.email}{s.instagram ? ` · @${s.instagram.replace('@', '')}` : ''}
                </div>
                {s.roles.length > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{s.roles.join(' · ')}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {s.provider === 'google' ? pill('rgba(66,133,244,0.15)', '#8ab4f8', 'GOOGLE') : pill('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.6)', 'EMAIL')}
                {s.inDirectory && pill('rgba(212,168,67,0.15)', '#e6c07a', 'DIRECTORY')}
                {!s.onboarded && pill('rgba(255,150,60,0.15)', '#ffb066', 'NEEDS SETUP')}
                {!s.confirmed && pill('rgba(255,90,90,0.12)', '#ff8080', 'UNCONFIRMED')}
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', minWidth: 64, textAlign: 'right' }}>{when(s.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}

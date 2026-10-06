'use client'
import { useEffect, useState } from 'react'
import ChangeEmailButton from '@/components/admin/ChangeEmailButton'

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

// Bot sign-ups (2026-10-05) look like "Rtxh Kuifjiyfz" + @ohxzIpOkbbAiZpwD:
// a long mixed-case random Instagram handle and/or a vowel-starved name, on a
// real stranger's email. A hint for "Select likely spam" — you still review.
function looksLikeBot(s: { name: string; instagram: string | null; roles: string[]; inDirectory: boolean }): boolean {
  if (s.roles.length > 0 || s.inDirectory) return false
  const ig = (s.instagram || '').replace('@', '')
  const randomIg = ig.length >= 12 && /[a-z]/.test(ig) && /[A-Z]/.test(ig) && !/[._0-9]/.test(ig) && /[A-Z][a-z]*[A-Z][a-z]*[A-Z]/.test(ig)
  const words = s.name.trim().split(/\s+/).filter(Boolean)
  const gibberish = (w: string) => { const l = w.toLowerCase(); const v = (l.match(/[aeiouy]/g) || []).length; return l.length >= 5 && v / l.length < 0.25 }
  const randomName = words.length >= 2 && words.filter(gibberish).length >= 1 && words.every(w => /^[A-Z][a-z]+$/.test(w))
  return randomIg || (randomName && !!ig)
}

export default function AdminSignupsPage() {
  const [items, setItems] = useState<Signup[]>([])
  const [loading, setLoad] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [result, setResult] = useState('')
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const deletePicked = async () => {
    const ids = Array.from(picked)
    if (!ids.length) return
    if (!window.confirm(`Permanently delete ${ids.length} account${ids.length === 1 ? '' : 's'}? Accounts with bookings, credit, messages, castings, listings or photos are skipped automatically. This can't be undone.`)) return
    setDeleting(true); setResult('')
    const r = await fetch('/api/admin/signups', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    const d = await r.json().catch(() => ({}))
    setDeleting(false)
    if (!r.ok) { setResult(d.error || 'Delete failed.'); return }
    const gone = new Set<string>(d.deleted ?? [])
    setItems(list => list.filter(x => !gone.has(x.id)))
    setPicked(new Set())
    const sk = (d.skipped ?? []) as { id: string; reason: string }[]
    setResult(`Deleted ${gone.size}.` + (sk.length ? ` Skipped ${sk.length}: ${sk.map(x => x.reason).join(', ')}.` : ''))
  }

  useEffect(() => {
    fetch('/api/admin/signups')
      .then(async r => {
        if (r.status === 401) { setUnauth(true); setLoad(false); return }
        const d = await r.json().catch(() => ({}))
        setItems(d.signups ?? []); setLoad(false)
      })
      .catch(() => setLoad(false))
  }, [])

  const wrap: React.CSSProperties = { background: '#080808', minHeight: 'var(--vh-full)', color: '#fff', padding: '40px 20px', fontFamily: 'Inter, sans-serif' }
  const inner: React.CSSProperties = { maxWidth: 760, margin: '0 auto' }
  const tb = (danger: boolean): React.CSSProperties => ({ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '9px 12px', borderRadius: 6, cursor: 'pointer', background: danger ? 'rgba(255,90,90,0.15)' : 'transparent', color: danger ? '#ff8080' : '#ccc', border: `1px solid ${danger ? 'rgba(255,128,128,0.5)' : 'rgba(255,255,255,0.2)'}` })
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

      {!loading && items.length > 0 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#080808', padding: '8px 0 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={() => setPicked(new Set(items.filter(looksLikeBot).map(x => x.id)))} style={tb(false)}>SELECT LIKELY SPAM ({items.filter(looksLikeBot).length})</button>
          <button type="button" onClick={() => setPicked(new Set(items.filter(x => !x.confirmed).map(x => x.id)))} style={tb(false)}>SELECT UNCONFIRMED</button>
          {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} style={tb(false)}>CLEAR</button>}
          <button type="button" disabled={!picked.size || deleting} onClick={deletePicked} style={{ ...tb(true), opacity: !picked.size || deleting ? 0.4 : 1 }}>{deleting ? 'DELETING…' : `DELETE SELECTED (${picked.size})`}</button>
          {result && <div style={{ width: '100%', fontSize: 12, color: '#e6c07a' }}>{result}</div>}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.35)' }}>No signups yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(s => (
            <a key={s.id} href={`/admin/dashboard?view=customers&openEmail=${encodeURIComponent(s.email)}`}
              style={{ textDecoration: 'none', color: 'inherit', background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; e.currentTarget.style.background = '#181818' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = '#141414' }}>
              <div style={{ minWidth: 0, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={picked.has(s.id)} aria-label={`Select ${s.name || s.email}`}
                  onClick={e => e.stopPropagation()} onChange={() => toggle(s.id)}
                  style={{ width: 18, height: 18, marginTop: 2, accentColor: '#e6c07a', cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{s.name || '(no name)'}{looksLikeBot(s) && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: '#ff8080', border: '1px solid rgba(255,128,128,0.5)', padding: '1px 6px', borderRadius: 4, verticalAlign: 2 }}>LIKELY SPAM</span>}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                  {s.email}{s.instagram ? ` · @${s.instagram.replace('@', '')}` : ''}
                </div>
                {s.roles.length > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{s.roles.join(' · ')}</div>
                )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {s.provider === 'google' ? pill('rgba(66,133,244,0.15)', '#8ab4f8', 'GOOGLE') : pill('rgba(255,255,255,0.08)', 'rgba(255,255,255,0.6)', 'EMAIL')}
                {s.inDirectory && pill('rgba(212,168,67,0.15)', '#e6c07a', 'DIRECTORY')}
                {!s.onboarded && pill('rgba(255,150,60,0.15)', '#ffb066', 'NEEDS SETUP')}
                {!s.confirmed && pill('rgba(255,90,90,0.12)', '#ff8080', 'UNCONFIRMED')}
                <ChangeEmailButton authUserId={s.id} current={s.email}
                  onChanged={email => setItems(list => list.map(x => x.id === s.id ? { ...x, email, confirmed: true } : x))} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', minWidth: 64, textAlign: 'right' }}>{when(s.createdAt)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div></div>
  )
}

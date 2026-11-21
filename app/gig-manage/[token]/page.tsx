'use client'
// /gig-manage/<token> — an outside company's private applicant page for a gig
// Made Kulture posted on its behalf. No account needed: the link IS the access.
// Shows each applicant's directory profile (no email, phone or Instagram) and
// a relayed thread; replies reach the member by push + email.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const CHAMP = '#c9b27e'
const INK = '#0b0b0d'
type Msg = { sender: 'company' | 'member'; body: string; created_at: string }
type Applicant = { id: string; isNew: boolean; created_at: string; note: string | null; name: string; avatar_url: string | null; roles: string[]; bio: string; photos: string[]; thread: Msg[]; instagram: string | null; links: { label: string; url: string }[] }

const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const dateLabel = (d: string | null) => {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function GigManagePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<{ gig: any; applicants: Applicant[] } | null>(null)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/gig-manage/${token}`, { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Could not load this page.'); return }
      setError(''); setData(d)
    }).catch(() => setError('Could not load this page.'))
  }, [token])
  useEffect(() => { load() }, [load])

  const send = async (applicationId: string) => {
    const body = (drafts[applicationId] || '').trim()
    if (!body) return
    setBusy(applicationId); setNote('')
    const r = await fetch(`/api/gig-manage/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId, body }) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setNote(d.error || 'That did not send.'); return }
    setDrafts(prev => ({ ...prev, [applicationId]: '' })); load()
  }
  const close = async (action: 'filled' | 'closed') => {
    if (!confirm(action === 'filled' ? 'Mark this gig filled? It comes off the board.' : 'Close this gig? It comes off the board.')) return
    setBusy('close')
    const r = await fetch(`/api/gig-manage/${token}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) setNote(d.error || 'That did not work.'); else load()
  }

  const wrap: React.CSSProperties = { minHeight: 'var(--vh-full, 100vh)', background: INK, color: '#eee', fontFamily: 'Inter, sans-serif', padding: '36px 18px 80px' }
  const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }
  const btn = (gold = true): React.CSSProperties => ({ background: gold ? CHAMP : 'transparent', color: gold ? '#111' : '#bbb', border: gold ? 'none' : '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '10px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer' })

  if (error) return <div style={wrap}><div style={{ maxWidth: 720, margin: '0 auto' }}><div style={{ letterSpacing: '0.2em', fontSize: 12, color: CHAMP }}>MADE KULTURE</div><p style={{ marginTop: 20, color: '#bbb' }}>{error}</p></div></div>
  if (!data) return <div style={wrap}><div style={{ maxWidth: 720, margin: '0 auto', color: '#888' }}>Loading…</div></div>

  const g = data.gig
  const open = g.status === 'live' && (!g.expires_at || new Date(g.expires_at) > new Date())
  return (
    <div style={wrap}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.2em', fontSize: 12, color: CHAMP, fontWeight: 700 }}>MADE KULTURE · GIGS</div>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '10px 0 4px', lineHeight: 1.1 }}>{g.title}</h1>
        <div style={{ fontSize: 13, color: '#999' }}>{[g.company_name, g.pay, dateLabel(g.gig_date), g.date_note, g.location].filter(Boolean).join(' · ')}</div>
        <div style={{ fontSize: 13, color: open ? '#7be09a' : '#bbb', marginTop: 8 }}>
          {open ? `Live${g.apply_by ? ` until ${dateLabel(g.apply_by)}` : ''}` : g.status === 'filled' ? 'Filled' : g.status === 'pulled' ? 'Paused by Made Kulture' : 'Closed'}
        </div>
        <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6, margin: '14px 0 0' }}>
          This page is private to you. Keep the link to yourself. Applicants share their work, Instagram and website with you; their email and phone aren’t shown, and yours aren’t shared with them. Replies go through this page, and we email you when someone applies or replies. If you want to swap numbers with someone, just say so in your message.
        </p>
        {open && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" disabled={busy === 'close'} style={btn()} onClick={() => close('filled')}>MARK FILLED</button>
            <button type="button" disabled={busy === 'close'} style={btn(false)} onClick={() => close('closed')}>CLOSE GIG</button>
          </div>
        )}
        {note && <div style={{ color: '#f0a0a0', fontSize: 13, marginTop: 12 }}>{note}</div>}

        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', color: '#888', margin: '32px 0 12px' }}>APPLICANTS ({data.applicants.length})</h2>
        {data.applicants.length === 0 && <div style={{ color: '#888', fontSize: 14 }}>No one has applied yet. We’ll email you when someone does.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.applicants.map(a => (
            <div key={a.id} style={card}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', background: '#222', flexShrink: 0, display: 'inline-block' }}>
                  {a.avatar_url && <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{a.name}{a.isNew && <span style={{ marginLeft: 8, fontSize: 10, color: CHAMP }}>NEW</span>}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>{a.roles.join(' · ')}{a.roles.length ? ' · ' : ''}applied {fmt(a.created_at)}</div>
                </div>
              </div>
              {a.bio && <p style={{ fontSize: 13, color: '#bbb', lineHeight: 1.55, margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{a.bio}</p>}
              {(a.instagram || a.links.length > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {a.instagram && <a href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noopener noreferrer" style={{ ...btn(false), textDecoration: 'none', padding: '7px 12px' }}>@{a.instagram}</a>}
                  {a.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" style={{ ...btn(false), textDecoration: 'none', padding: '7px 12px' }}>{(l.label || l.url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')).slice(0, 40)} ↗</a>)}
                </div>
              )}
              {a.photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6, marginTop: 12 }}>
                  {a.photos.map(u => (
                    <button key={u} type="button" onClick={() => setZoom(u)} style={{ padding: 0, border: 'none', background: '#222', aspectRatio: '4 / 5', borderRadius: 6, overflow: 'hidden', cursor: 'zoom-in' }}>
                      <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                {a.thread.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.sender === 'company' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.sender === 'company' ? 'rgba(201,178,126,0.14)' : '#1c1c20', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>{m.sender === 'company' ? 'You' : a.name} · {fmt(m.created_at)}</div>
                  </div>
                ))}
              </div>
              <textarea value={drafts[a.id] || ''} onChange={e => setDrafts(prev => ({ ...prev, [a.id]: e.target.value }))} rows={2} maxLength={2000} placeholder={`Reply to ${a.name}…`}
                style={{ width: '100%', marginTop: 12, background: '#0e0e10', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 16, color: '#eee', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              <button type="button" disabled={busy === a.id || !(drafts[a.id] || '').trim()} style={{ ...btn(), marginTop: 8 }} onClick={() => send(a.id)}>{busy === a.id ? 'SENDING…' : 'SEND'}</button>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#666', marginTop: 40, lineHeight: 1.6 }}>Made Kulture connects you with creatives and isn’t part of any deal. Questions? Text the studio at (832) 408-1631.</p>
      </div>
      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'zoom-out', padding: 20 }}>
          <img src={zoom} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

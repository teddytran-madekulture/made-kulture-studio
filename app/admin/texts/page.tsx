'use client'
// Texts — two-way texting on the toll-free number (migration 115).
// Threads on the left, the conversation + reply box on the right (stacked on a
// phone). Replies go out from the studio number via /api/admin/texts.
// Linked from BOTH admin sidebars (AdminShell AND the dashboard's own nav).
// Polls every 20s ONLY while the tab is visible — see the jukebox CPU incident.
import { useCallback, useEffect, useRef, useState } from 'react'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, colorScheme: 'dark', borderRadius: 6 }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.5 }
const btn: React.CSSProperties = { cursor: 'pointer', background: C.accent, color: '#080808', fontWeight: 700, border: 'none', letterSpacing: '0.1em', fontSize: 11, padding: '10px 16px', borderRadius: 6, fontFamily: 'Inter, sans-serif' }

const fmtPhone = (p: string) => { const d = p.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p }
const when = (iso: string) => {
  const d = new Date(iso), now = new Date()
  const tz = { timeZone: 'America/Chicago' } as const
  const sameDay = d.toLocaleDateString('en-US', tz) === now.toLocaleDateString('en-US', tz)
  return d.toLocaleString('en-US', sameDay ? { ...tz, hour: 'numeric', minute: '2-digit' } : { ...tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
// Replies are GSM-7 after the server strips emoji: 160 chars, or 153 per part when longer.
const segments = (s: string) => (s.length <= 160 ? 1 : Math.ceil(s.length / 153))

export default function TextsPage() {
  const [threads, setThreads] = useState<any[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [thread, setThread] = useState<any>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [unauth, setUnauth] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [newNum, setNewNum] = useState('')
  const [showAll, setShowAll] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const f = () => setMobile(window.innerWidth < 800)
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f)
  }, [])
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('phone')
    if (p) setSel(p)
  }, [])

  const loadThreads = useCallback(async () => {
    const r = await fetch('/api/admin/texts', { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); return }
    const d = await r.json()
    if (!r.ok) { setMsg(`⚠️ ${d.error || 'Could not load texts.'}`); return }
    setThreads(d.threads ?? [])
  }, [])
  const loadThread = useCallback(async (phone: string) => {
    const r = await fetch(`/api/admin/texts?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); return }
    const d = await r.json()
    if (!r.ok) { setMsg(`⚠️ ${d.error || 'Could not load that conversation.'}`); return }
    setThread(d)
  }, [])

  useEffect(() => { loadThreads() }, [loadThreads])
  useEffect(() => {
    if (!sel) { setThread(null); return }
    setThread(null); loadThread(sel).then(loadThreads)
  }, [sel, loadThread, loadThreads])
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      loadThreads(); if (sel) loadThread(sel)
    }, 20000)
    return () => clearInterval(t)
  }, [sel, loadThreads, loadThread])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [thread?.messages?.length])

  const send = async () => {
    if (!sel || !draft.trim()) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/texts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: sel, body: draft }) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not sent.'}`); return }
      setDraft(''); await loadThread(sel); loadThreads()
    } catch { setMsg('⚠️ Not sent — check your connection.') }
    finally { setBusy(false) }
  }

  const startNew = () => {
    const d = newNum.replace(/\D/g, '')
    const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
    if (ten.length !== 10) { setMsg('⚠️ Enter a 10-digit phone number.'); return }
    setMsg(null); setNewNum(''); setSel(`+1${ten}`)
  }

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>

  // Replies-only by default: a thread that's just automatic texts isn't a conversation.
  const visible = (threads ?? []).filter(t => showAll || t.hasInbound)
  const name = thread?.customers?.[0]?.name
  const showList = !mobile || !sel
  const showThread = !mobile || !!sel

  return (
    <div style={{ padding: mobile ? '20px 12px' : '32px 24px', color: C.text, maxWidth: 1100 }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>TEXTS</h1>
      <p style={{ ...small, margin: '0 0 16px' }}>Texts to the studio number (866) 329-7069. Your replies go out from that same number.</p>
      {msg && <div style={{ ...small, color: '#fbbf24', marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {showList && (
          <div style={{ width: mobile ? '100%' : 320, flexShrink: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${C.line}`, display: 'flex', gap: 8 }}>
              <input value={newNum} onChange={e => setNewNum(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') startNew() }} placeholder="Text a number…" inputMode="tel" style={{ ...inp, flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 13 }} />
              <button onClick={startNew} style={{ ...btn, padding: '8px 12px' }}>NEW</button>
            </div>
            <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${C.line}` }}>
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Include automatic-only threads
            </label>
            {threads === null ? <div style={{ ...small, padding: 16 }}>Loading…</div>
              : visible.length === 0 ? <div style={{ ...small, padding: 16 }}>No replies yet. When a customer texts the studio number it shows up here.</div>
              : visible.map(t => (
                <button key={t.phone} onClick={() => { setSel(t.phone); history.replaceState(null, '', `/admin/texts?phone=${encodeURIComponent(t.phone)}`) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: sel === t.phone ? 'rgba(255,255,255,0.07)' : 'transparent', border: 'none', borderBottom: `1px solid ${C.line}`, padding: '12px 14px', cursor: 'pointer', color: C.text }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: 'Inter', fontSize: 14 }}>
                    <strong style={{ fontWeight: t.unread ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || fmtPhone(t.phone)}</strong>
                    <span style={{ ...small, flexShrink: 0 }}>{when(t.lastAt)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                    <span style={{ ...small, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.unread ? C.text : C.dim }}>
                      {t.lastDirection === 'out' ? 'You: ' : ''}{t.last || '[photo]'}
                    </span>
                    {t.unread > 0 && <span style={{ background: C.accent, color: '#080808', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px', flexShrink: 0 }}>{t.unread}</span>}
                  </div>
                </button>
              ))}
          </div>
        )}

        {showThread && (
          <div style={{ flex: 1, minWidth: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, display: 'flex', flexDirection: 'column', minHeight: 480, maxHeight: 'calc(var(--vh-full, 100vh) - 180px)' }}>
            {!sel ? <div style={{ ...small, padding: 24 }}>Pick a conversation.</div> : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.line}` }}>
                  {mobile && <button onClick={() => { setSel(null); history.replaceState(null, '', '/admin/texts') }} style={{ ...small, background: 'none', border: 'none', color: C.accent, cursor: 'pointer', padding: 0, marginBottom: 6 }}>← All texts</button>}
                  <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600 }}>{name || fmtPhone(sel)}</div>
                  <div style={small}>{name ? `${fmtPhone(sel)} · ` : ''}{thread?.booking ?? '…'}</div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {!thread ? <div style={small}>Loading…</div>
                    : thread.messages.length === 0 ? <div style={small}>No messages with this number yet. Type below to start.</div>
                    : thread.messages.map((m: any) => {
                      const out = m.direction === 'out'
                      return (
                        <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                          <div style={{
                            background: out ? (m.sent_by === 'admin' ? C.accent : 'rgba(201,178,126,0.18)') : 'rgba(255,255,255,0.08)',
                            color: out && m.sent_by === 'admin' ? '#080808' : C.text,
                            padding: '9px 12px', borderRadius: 12, fontFamily: 'Inter', fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>
                            {m.body || (m.media_count ? `[${m.media_count} photo${m.media_count > 1 ? 's' : ''} — open in Twilio]` : '[empty]')}
                          </div>
                          <div style={{ ...small, fontSize: 11, textAlign: out ? 'right' : 'left', marginTop: 2 }}>
                            {out ? (m.sent_by === 'admin' ? 'You' : 'Automatic') + ' · ' : ''}{when(m.created_at)}
                          </div>
                        </div>
                      )
                    })}
                  <div ref={endRef} />
                </div>
                <div style={{ borderTop: `1px solid ${C.line}`, padding: 12 }}>
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder="Type a reply…"
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
                    style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 12 }}>
                    <span style={small}>{draft.length ? `${draft.length} chars · ${segments(draft)} text${segments(draft) > 1 ? 's' : ''}` : 'Emoji are removed before sending.'}</span>
                    <button onClick={send} disabled={busy || !draft.trim()} style={{ ...btn, opacity: busy || !draft.trim() ? 0.5 : 1 }}>{busy ? 'SENDING…' : 'SEND'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

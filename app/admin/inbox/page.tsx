'use client'

// Admin — June Inbox. All chat conversations, live transcript, take over /
// give back, close, and the June on/off kill switch (studio_settings.cs_agent_enabled).

import { useCallback, useEffect, useRef, useState } from 'react'

const GOLD = '#d4a843'

interface Convo {
  id: string; channel: string; status: string; human_takeover: boolean
  visitor_name: string | null; visitor_email: string | null; page: string | null
  last_message_at: string; created_at: string; preview: string
}
interface Msg { id: string; role: string; content: string; created_at: string }

export default function AdminInboxPage() {
  const [unauth, setUnauth]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [convos, setConvos]   = useState<Convo[]>([])
  const [sel, setSel]         = useState<Convo | null>(null)
  const [msgs, setMsgs]       = useState<Msg[]>([])
  const [reply, setReply]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [juneOn, setJuneOn]   = useState<boolean | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const selRef = useRef<string | null>(null)
  selRef.current = sel?.id ?? null

  const loadList = useCallback(async () => {
    const r = await fetch('/api/admin/inbox')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    setConvos(d.conversations ?? [])
    setLoading(false)
  }, [])

  const loadConvo = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/inbox/${id}`)
    if (!r.ok) return
    const d = await r.json()
    if (selRef.current === id) {
      setMsgs(d.messages ?? [])
      setSel(s => (s && s.id === id ? { ...s, ...d.conversation } : s))
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
    }
  }, [])

  useEffect(() => {
    loadList()
    fetch('/api/admin/settings?key=cs_agent_enabled')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setJuneOn(d.value === 'true') })
      .catch(() => {})
    const iv = setInterval(loadList, 10000)
    return () => clearInterval(iv)
  }, [loadList])

  useEffect(() => {
    if (!sel) return
    loadConvo(sel.id)
    const iv = setInterval(() => loadConvo(sel.id), 5000)
    return () => clearInterval(iv)
  }, [sel?.id, loadConvo]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id: string, action: string) => {
    setBusy(true)
    await fetch('/api/admin/inbox', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    await Promise.all([loadList(), sel ? loadConvo(id) : Promise.resolve()])
    setBusy(false)
  }

  const sendReply = async () => {
    if (!sel || !reply.trim() || busy) return
    setBusy(true)
    const r = await fetch(`/api/admin/inbox/${sel.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: reply.trim() }),
    })
    if (r.ok) { setReply(''); await loadConvo(sel.id); await loadList() }
    setBusy(false)
  }

  const toggleJune = async () => {
    if (juneOn === null) return
    const next = !juneOn
    const r = await fetch('/api/admin/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'cs_agent_enabled', value: next ? 'true' : 'false' }),
    })
    if (r.ok) setJuneOn(next)
  }

  const label: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.14em' }
  const statusBadge = (c: Convo) => {
    const [bg, txt, t] =
      c.human_takeover ? ['rgba(212,168,67,0.2)', GOLD, 'YOU'] :
      c.status === 'needs_teddy' ? ['rgba(239,68,68,0.2)', '#f87171', 'NEEDS YOU'] :
      c.status === 'closed' ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.4)', 'CLOSED'] :
      ['rgba(74,222,128,0.15)', '#4ade80', 'JUNE']
    return <span style={{ ...label, background: bg, color: txt, padding: '3px 7px', borderRadius: 3 }}>{t}</span>
  }

  if (unauth) return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div>Not authorized — <a href="/admin" style={{ color: GOLD }}>log in</a></div>
    </div>
  )

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="/admin/dashboard" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 13 }}>← Dashboard</a>
            <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', margin: 0 }}>JUNE — INBOX</h1>
          </div>
          <button onClick={toggleJune} disabled={juneOn === null} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)', padding: '8px 14px', cursor: 'pointer', borderRadius: 4,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: juneOn ? '#4ade80' : '#f87171' }} />
            <span style={{ ...label, color: '#fff' }}>{juneOn === null ? '…' : juneOn ? 'JUNE IS ON' : 'JUNE IS OFF'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Conversation list */}
          <div style={{ flex: '0 0 340px', maxWidth: '100%', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' }}>
            {loading && <div style={{ padding: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}
            {!loading && convos.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No conversations yet. June's widget is live on the site.</div>
            )}
            {convos.map(c => (
              <div key={c.id} onClick={() => { setSel(c); setMsgs([]) }} style={{
                padding: '12px 14px', cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                background: sel?.id === c.id ? 'rgba(212,168,67,0.08)' : 'transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.visitor_name || c.visitor_email || 'Visitor'}
                  </span>
                  {statusBadge(c)}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.preview}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  {new Date(c.last_message_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {c.page ? ` · ${c.page}` : ''}
                </div>
              </div>
            ))}
          </div>

          {/* Transcript */}
          <div style={{ flex: 1, minWidth: 320, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, display: 'flex', flexDirection: 'column', minHeight: 480 }}>
            {!sel ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                Select a conversation
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {sel.visitor_name || sel.visitor_email || 'Visitor'}
                    <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}> · {sel.channel}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {sel.human_takeover ? (
                      <button disabled={busy} onClick={() => act(sel.id, 'release')} style={{ ...label, background: 'transparent', border: `1px solid ${GOLD}`, color: GOLD, padding: '7px 12px', cursor: 'pointer', borderRadius: 4 }}>GIVE BACK TO JUNE</button>
                    ) : (
                      <button disabled={busy} onClick={() => act(sel.id, 'takeover')} style={{ ...label, background: GOLD, border: 'none', color: '#080808', padding: '7px 12px', cursor: 'pointer', borderRadius: 4 }}>TAKE OVER</button>
                    )}
                    {sel.status !== 'closed' ? (
                      <button disabled={busy} onClick={() => act(sel.id, 'close')} style={{ ...label, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', padding: '7px 12px', cursor: 'pointer', borderRadius: 4 }}>CLOSE</button>
                    ) : (
                      <button disabled={busy} onClick={() => act(sel.id, 'reopen')} style={{ ...label, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', padding: '7px 12px', cursor: 'pointer', borderRadius: 4 }}>REOPEN</button>
                    )}
                  </div>
                </div>

                <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16, maxHeight: 520 }}>
                  {msgs.map(m => {
                    const mine = m.role === 'teddy'
                    const user = m.role === 'user'
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                        <div style={{
                          maxWidth: '75%', padding: '8px 12px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                          background: mine ? GOLD : user ? '#fff' : 'rgba(255,255,255,0.07)',
                          color: mine || user ? '#080808' : 'rgba(255,255,255,0.9)',
                          borderRadius: 8,
                        }}>
                          <div style={{ ...label, marginBottom: 3, color: mine ? 'rgba(0,0,0,0.55)' : user ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)' }}>
                            {mine ? 'YOU' : user ? 'CUSTOMER' : m.role === 'agent' ? 'JUNE' : 'SYSTEM'}
                            {' · '}
                            {new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })}
                          </div>
                          {m.content}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
                  <input
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendReply() }}
                    placeholder={sel.human_takeover ? 'Reply as yourself…' : 'Replying takes over from June…'}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, padding: '10px 12px', outline: 'none', borderRadius: 4, fontFamily: 'Inter, sans-serif' }}
                  />
                  <button onClick={sendReply} disabled={busy || !reply.trim()} style={{ ...label, background: reply.trim() ? '#fff' : 'rgba(255,255,255,0.1)', color: reply.trim() ? '#080808' : 'rgba(255,255,255,0.3)', border: 'none', padding: '0 16px', cursor: reply.trim() ? 'pointer' : 'default', borderRadius: 4 }}>SEND</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

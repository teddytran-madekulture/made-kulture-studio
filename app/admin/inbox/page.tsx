'use client'

// Admin — June Inbox. All chat conversations, live transcript, take over /
// give back, close, and the June on/off kill switch (studio_settings.cs_agent_enabled).

import { useCallback, useEffect, useRef, useState } from 'react'
import { enablePush } from '@/components/AdminPwa'

const GOLD = '#d4a843'

interface Convo {
  id: string; channel: string; status: string; human_takeover: boolean
  visitor_name: string | null; visitor_email: string | null; page: string | null
  subject?: string | null
  last_message_at: string; created_at: string; preview: string
}
interface Msg { id: string; role: string; content: string; created_at: string }
interface KbEntry { id: string; topic: string; content: string; enabled: boolean; updated_at: string }

export default function AdminInboxPage() {
  const [unauth, setUnauth]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [convos, setConvos]   = useState<Convo[]>([])
  const [sel, setSel]         = useState<Convo | null>(null)
  const [msgs, setMsgs]       = useState<Msg[]>([])
  const [reply, setReply]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({})
  const [tab, setTab]               = useState<'convos' | 'kb' | 'tours'>('convos')
  const [tours, setTours]           = useState<any[]>([])
  const [tourBusy, setTourBusy]     = useState<string | null>(null)
  const [kb, setKb]                 = useState<KbEntry[]>([])
  const [kbEdits, setKbEdits]       = useState<Record<string, { topic: string; content: string }>>({})
  const [kbBusy, setKbBusy]         = useState<string | null>(null)
  const [newTopic, setNewTopic]     = useState('')
  const [newContent, setNewContent] = useState('')
  const [pushState, setPushState]   = useState<'idle' | 'busy' | 'ok' | 'denied' | 'unsupported' | 'error'>('idle')

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') setPushState('ok')
  }, [])

  const onEnablePush = async () => {
    setPushState('busy')
    setPushState(await enablePush())
  }
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

  const loadKb = useCallback(async () => {
    const r = await fetch('/api/admin/kb')
    if (!r.ok) return
    const d = await r.json()
    setKb(d.entries ?? [])
  }, [])

  useEffect(() => { if (tab === 'kb') loadKb() }, [tab, loadKb])

  const loadTours = useCallback(async () => {
    const r = await fetch('/api/admin/tours')
    if (!r.ok) return
    const d = await r.json()
    setTours(d.tours ?? [])
  }, [])

  useEffect(() => {
    if (tab !== 'tours') return
    loadTours()
    const iv = setInterval(loadTours, 15000)
    return () => clearInterval(iv)
  }, [tab, loadTours])

  const decideTour = async (t: any, action: 'approve' | 'decline') => {
    if (action === 'decline' && !window.confirm(`Decline ${t.name}'s tour? They'll get a polite text.`)) return
    setTourBusy(t.id)
    await fetch(`/api/tours/decide/${t.decision_token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    await loadTours()
    setTourBusy(null)
  }

  const cancelTour = async (t: any) => {
    if (!window.confirm(`Cancel ${t.name}'s confirmed tour? They'll get a sorry-text with a rebook link.`)) return
    setTourBusy(t.id)
    await fetch(`/api/tours/cancel/${t.cancel_token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: 'studio' }),
    })
    await loadTours()
    setTourBusy(null)
  }

  const saveKb = async (id: string) => {
    const e = kbEdits[id]
    if (!e) return
    setKbBusy(id)
    await fetch('/api/admin/kb', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, topic: e.topic, content: e.content }),
    })
    setKbEdits(d => { const { [id]: _, ...rest } = d; return rest })
    await loadKb()
    setKbBusy(null)
  }

  const toggleKb = async (entry: KbEntry) => {
    setKbBusy(entry.id)
    await fetch('/api/admin/kb', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, enabled: !entry.enabled }),
    })
    await loadKb()
    setKbBusy(null)
  }

  const deleteKb = async (entry: KbEntry) => {
    if (!window.confirm(`Delete "${entry.topic}" from June's knowledge? She won't know this anymore.`)) return
    setKbBusy(entry.id)
    await fetch('/api/admin/kb', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id }),
    })
    await loadKb()
    setKbBusy(null)
  }

  const addKb = async () => {
    if (!newTopic.trim() || !newContent.trim()) return
    setKbBusy('new')
    const r = await fetch('/api/admin/kb', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: newTopic.trim(), content: newContent.trim() }),
    })
    if (r.ok) { setNewTopic(''); setNewContent(''); await loadKb() }
    setKbBusy(null)
  }

  const teachJune = () => {
    setTab('kb')
    setNewTopic(sel?.subject ? `re: ${sel.subject}`.slice(0, 60) : '')
    setNewContent('')
  }

  const draftAction = async (messageId: string, action: 'send' | 'discard') => {
    if (!sel || busy) return
    setBusy(true)
    const res = await fetch(`/api/admin/inbox/${sel.id}/draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, action, content: draftEdits[messageId] }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Draft action failed')
    }
    setDraftEdits(e => { const { [messageId]: _, ...rest } = e; return rest })
    await Promise.all([loadConvo(sel.id), loadList()])
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

  // Where the conversation came from: website chat, email, (later: sms/instagram)
  const channelBadge = (c: Convo) => {
    const [icon, txt, color] =
      c.channel === 'email' ? ['✉', 'EMAIL', '#7dd3fc'] :
      c.channel === 'sms' ? ['✆', 'SMS', '#c4b5fd'] :
      c.channel === 'instagram' ? ['◎', 'IG', '#f9a8d4'] :
      ['💬', 'WEB CHAT', 'rgba(255,255,255,0.55)']
    return (
      <span style={{ ...label, color, border: `1px solid ${color === 'rgba(255,255,255,0.55)' ? 'rgba(255,255,255,0.25)' : color}`, padding: '2px 6px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10 }}>{icon}</span>{txt}
      </span>
    )
  }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <a href="/admin/dashboard" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 13 }}>← Dashboard</a>
            <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', margin: 0 }}>JUNE</h1>
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              {([['convos', 'INBOX'], ['kb', 'KNOWLEDGE'], ['tours', 'TOURS']] as const).map(([t, lbl]) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  ...label, padding: '7px 12px', cursor: 'pointer', borderRadius: 4,
                  background: tab === t ? 'rgba(212,168,67,0.15)' : 'transparent',
                  border: tab === t ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.15)',
                  color: tab === t ? GOLD : 'rgba(255,255,255,0.5)',
                }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onEnablePush} disabled={pushState === 'busy' || pushState === 'ok'} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
            border: `1px solid ${pushState === 'ok' ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.15)'}`,
            padding: '8px 12px', cursor: pushState === 'ok' ? 'default' : 'pointer', borderRadius: 4,
          }}>
            <span style={{ fontSize: 11 }}>🔔</span>
            <span style={{ ...label, color: pushState === 'ok' ? '#4ade80' : '#fff' }}>
              {pushState === 'ok' ? 'NOTIFICATIONS ON' :
               pushState === 'busy' ? '…' :
               pushState === 'denied' ? 'BLOCKED IN BROWSER' :
               pushState === 'unsupported' ? 'NOT SUPPORTED HERE' :
               pushState === 'error' ? 'RETRY NOTIFICATIONS' : 'ENABLE NOTIFICATIONS'}
            </span>
          </button>
          <button onClick={toggleJune} disabled={juneOn === null} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)', padding: '8px 14px', cursor: 'pointer', borderRadius: 4,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: juneOn ? '#4ade80' : '#f87171' }} />
            <span style={{ ...label, color: '#fff' }}>{juneOn === null ? '…' : juneOn ? 'JUNE IS ON' : 'JUNE IS OFF'}</span>
          </button>
          </div>
        </div>

        {tab === 'tours' && (
          <div style={{ maxWidth: 760 }}>
            {tours.length === 0 && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No tour requests yet. They'll appear here (and buzz your phone) as they come in.</div>}
            {tours.map(t => {
              const when = new Date(t.start_time).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              const [bg, color, txt] =
                t.status === 'pending'  ? ['rgba(212,168,67,0.15)', GOLD, 'PENDING'] :
                t.status === 'approved' ? ['rgba(74,222,128,0.15)', '#4ade80', 'APPROVED'] :
                ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.45)', t.status.toUpperCase()]
              return (
                <div key={t.id} style={{ border: `1px solid ${t.status === 'pending' ? 'rgba(212,168,67,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{when}</span>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      {t.is_custom && <span style={{ ...label, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', padding: '3px 7px', borderRadius: 3 }}>CUSTOM TIME</span>}
                      <span style={{ ...label, background: bg, color, padding: '3px 7px', borderRadius: 3 }}>{txt}</span>
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{t.name} · {t.phone}{t.email ? ` · ${t.email}` : ''}</div>
                  {t.purpose && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Planning: {t.purpose}</div>}
                  {t.is_custom && t.status === 'pending' && (
                    <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>Outside open shoot hours — approving means opening the studio for this.</div>
                  )}
                  {t.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button disabled={tourBusy === t.id} onClick={() => decideTour(t, 'approve')}
                        style={{ ...label, background: '#4ade80', border: 'none', color: '#052e16', padding: '8px 16px', cursor: 'pointer', borderRadius: 4 }}>
                        APPROVE
                      </button>
                      <button disabled={tourBusy === t.id} onClick={() => decideTour(t, 'decline')}
                        style={{ ...label, background: 'transparent', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', padding: '8px 16px', cursor: 'pointer', borderRadius: 4 }}>
                        DECLINE
                      </button>
                    </div>
                  )}
                  {t.status === 'approved' && new Date(t.start_time).getTime() > Date.now() && (
                    <div style={{ marginTop: 10 }}>
                      <button disabled={tourBusy === t.id} onClick={() => cancelTour(t)}
                        style={{ ...label, background: 'transparent', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', padding: '8px 16px', cursor: 'pointer', borderRadius: 4 }}>
                        CANCEL TOUR
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'kb' && (
          <div style={{ maxWidth: 760 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 20 }}>
              Everything June knows lives here. Edits apply on her <span style={{ color: GOLD }}>very next message</span> — no deploy needed. She only states what's written below, so keep it accurate.
            </div>

            {/* Add new entry */}
            <div style={{ border: `1px dashed ${GOLD}`, borderRadius: 6, padding: 16, marginBottom: 24, background: 'rgba(212,168,67,0.04)' }}>
              <div style={{ ...label, color: GOLD, marginBottom: 10 }}>+ TEACH JUNE SOMETHING NEW</div>
              <input
                value={newTopic} onChange={e => setNewTopic(e.target.value)}
                placeholder="Topic (e.g. holiday_hours, pets, drone_policy)"
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, padding: '9px 11px', outline: 'none', borderRadius: 4, fontFamily: 'Inter, sans-serif', marginBottom: 8 }}
              />
              <textarea
                value={newContent} onChange={e => setNewContent(e.target.value)}
                placeholder="What should June say about this? Write it the way you'd tell a customer."
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, lineHeight: 1.5, padding: '9px 11px', outline: 'none', borderRadius: 4, fontFamily: 'Inter, sans-serif', resize: 'vertical' }}
              />
              <button disabled={kbBusy === 'new' || !newTopic.trim() || !newContent.trim()} onClick={addKb}
                style={{ ...label, marginTop: 8, background: newTopic.trim() && newContent.trim() ? GOLD : 'rgba(255,255,255,0.1)', border: 'none', color: newTopic.trim() && newContent.trim() ? '#080808' : 'rgba(255,255,255,0.3)', padding: '8px 14px', cursor: 'pointer', borderRadius: 4 }}>
                {kbBusy === 'new' ? 'SAVING…' : 'ADD TO HER KNOWLEDGE'}
              </button>
            </div>

            {/* Existing entries */}
            {kb.map(entry => {
              const edit = kbEdits[entry.id]
              const dirty = !!edit && (edit.topic !== entry.topic || edit.content !== entry.content)
              return (
                <div key={entry.id} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 14, marginBottom: 12, opacity: entry.enabled ? 1 : 0.45 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <input
                      value={edit?.topic ?? entry.topic}
                      onChange={e => setKbEdits(d => ({ ...d, [entry.id]: { topic: e.target.value, content: d[entry.id]?.content ?? entry.content } }))}
                      style={{ flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: GOLD, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', padding: '7px 10px', outline: 'none', borderRadius: 4, fontFamily: 'Inter, sans-serif' }}
                    />
                    {!entry.enabled && <span style={{ ...label, color: 'rgba(255,255,255,0.4)' }}>OFF</span>}
                    <button disabled={kbBusy === entry.id} onClick={() => toggleKb(entry)} style={{ ...label, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', padding: '6px 10px', cursor: 'pointer', borderRadius: 4 }}>
                      {entry.enabled ? 'TURN OFF' : 'TURN ON'}
                    </button>
                    <button disabled={kbBusy === entry.id} onClick={() => deleteKb(entry)} style={{ ...label, background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', padding: '6px 10px', cursor: 'pointer', borderRadius: 4 }}>
                      DELETE
                    </button>
                  </div>
                  <textarea
                    value={edit?.content ?? entry.content}
                    onChange={e => setKbEdits(d => ({ ...d, [entry.id]: { topic: d[entry.id]?.topic ?? entry.topic, content: e.target.value } }))}
                    rows={Math.min(10, Math.max(3, (edit?.content ?? entry.content).split('\n').length + 1))}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.5, padding: '9px 11px', outline: 'none', borderRadius: 4, fontFamily: 'Inter, sans-serif', resize: 'vertical' }}
                  />
                  {dirty && (
                    <button disabled={kbBusy === entry.id} onClick={() => saveKb(entry.id)}
                      style={{ ...label, marginTop: 8, background: GOLD, border: 'none', color: '#080808', padding: '7px 14px', cursor: 'pointer', borderRadius: 4 }}>
                      {kbBusy === entry.id ? 'SAVING…' : 'SAVE — JUNE KNOWS IT IMMEDIATELY'}
                    </button>
                  )}
                </div>
              )
            })}
            {kb.length === 0 && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading her knowledge…</div>}
          </div>
        )}

        <div style={{ display: tab === 'convos' ? 'flex' : 'none', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
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
                  <span style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                    {channelBadge(c)}
                    {statusBadge(c)}
                  </span>
                </div>
                {c.channel === 'email' && c.subject && (
                  <div style={{ fontSize: 11, color: '#7dd3fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{c.subject}</div>
                )}
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
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {sel.visitor_name || sel.visitor_email || 'Visitor'}
                    {channelBadge(sel)}
                    {sel.channel === 'email' && sel.subject && (
                      <span style={{ color: '#7dd3fc', fontWeight: 400, fontSize: 12 }}>{sel.subject}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={teachJune} title="Add what June should have known to her knowledge base"
                      style={{ ...label, background: 'transparent', border: `1px dashed ${GOLD}`, color: GOLD, padding: '7px 12px', cursor: 'pointer', borderRadius: 4 }}>
                      TEACH JUNE
                    </button>
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
                    if (m.role === 'draft') {
                      return (
                        <div key={m.id} style={{ marginBottom: 12, border: `1px dashed ${GOLD}`, borderRadius: 8, padding: 12, background: 'rgba(212,168,67,0.05)' }}>
                          <div style={{ ...label, color: GOLD, marginBottom: 8 }}>✉️ JUNE'S DRAFT — NOT SENT YET</div>
                          <textarea
                            value={draftEdits[m.id] ?? m.content}
                            onChange={e => setDraftEdits(d => ({ ...d, [m.id]: e.target.value }))}
                            rows={Math.min(14, Math.max(5, (draftEdits[m.id] ?? m.content).split('\n').length + 1))}
                            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, lineHeight: 1.5, padding: 10, outline: 'none', borderRadius: 6, fontFamily: 'Inter, sans-serif', resize: 'vertical' }}
                          />
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button disabled={busy} onClick={() => draftAction(m.id, 'send')}
                              style={{ ...label, background: GOLD, border: 'none', color: '#080808', padding: '8px 14px', cursor: 'pointer', borderRadius: 4 }}>
                              APPROVE & SEND
                            </button>
                            <button disabled={busy} onClick={() => { if (window.confirm('Discard this draft?')) draftAction(m.id, 'discard') }}
                              style={{ ...label, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', padding: '8px 14px', cursor: 'pointer', borderRadius: 4 }}>
                              DISCARD
                            </button>
                          </div>
                        </div>
                      )
                    }
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

                {sel.channel === 'email' ? (
                  <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    Email thread — approve or edit June's draft above. (To write your own reply, edit her draft before sending, or reply from your mailbox.)
                  </div>
                ) : (
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
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

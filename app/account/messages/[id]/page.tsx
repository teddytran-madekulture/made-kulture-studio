'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Msg = { id: string; sender_id: string; body: string; created_at: string }
type Meta = { id: string; me: string; other: { id: string; name: string; avatar_url: string | null } }

export default function ThreadPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const supabase = createClient()

  const [meta, setMeta] = useState<Meta | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement | null>(null)

  const markRead = () => {
    fetch('/api/messages/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: id }),
    }).catch(() => {})
  }

  useEffect(() => {
    fetch(`/api/messages/${id}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(d.error ?? 'Could not load conversation.'); setLoading(false); return }
        setMeta(d.conversation); setMessages(d.messages ?? []); setLoading(false)
        markRead()
      })
      .catch(() => { setError('Could not load conversation.'); setLoading(false) })

    // Live incoming messages for this thread.
    const ch = supabase
      .channel(`conv-${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        payload => {
          const m = payload.new as Msg
          setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
          markRead()
        })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true); setError('')
    const res = await fetch(`/api/messages/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'Could not send.'); setSending(false); return }
    setMessages(prev => (prev.some(x => x.id === d.message.id) ? prev : [...prev, d.message]))
    setInput(''); setSending(false)
  }

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingTop: 20 }}>Loading…</div>
  if (error && !meta) return (
    <div style={{ paddingTop: 20 }}>
      <Link href="/account/messages" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Messages</Link>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingTop: 20 }}>{error}</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 620 }}>
      <Link href="/account/messages" style={{ display: 'inline-block', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', marginBottom: 12 }}>← Messages</Link>

      {meta && (
        <Link href={`/account/directory/${meta.other.id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: '#1f1f1f', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {meta.other.avatar_url
              ? <img src={meta.other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>{meta.other.name.charAt(0).toUpperCase()}</span>}
          </div>
          <span style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: '#fff' }}>{meta.other.name}</span>
        </Link>
      )}

      <div style={{ height: 'min(58vh, 520px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
        {messages.length === 0 && (
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 20 }}>Say hello 👋</div>
        )}
        {messages.map(m => {
          const mine = meta && m.sender_id === meta.me
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
              <div style={{
                background: mine ? '#fff' : '#1c1c1c',
                color: mine ? '#080808' : '#fff',
                border: mine ? 'none' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 14, padding: '9px 13px', fontFamily: 'Inter', fontSize: 14, lineHeight: 1.4,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{m.body}</div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      {error && <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Message…"
          maxLength={2000}
          style={{ flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 22, padding: '12px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff', outline: 'none' }}
        />
        <button onClick={send} disabled={sending || !input.trim()}
          style={{ background: '#fff', color: '#080808', border: 'none', borderRadius: 22, padding: '0 20px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, cursor: (sending || !input.trim()) ? 'default' : 'pointer', opacity: (sending || !input.trim()) ? 0.5 : 1 }}>
          Send
        </button>
      </div>
    </div>
  )
}

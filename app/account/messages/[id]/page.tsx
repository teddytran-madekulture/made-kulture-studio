'use client'
// A 1:1 directory conversation. 2026-10-05 phone fix (Teddy's test with Ryan):
//  • iOS ZOOMED the page on focus because the input was 14px (Safari zooms any
//    field under 16px) — the bubbles and Send button slid off the right edge.
//    The input is 16px now. Keep it >= 16px.
//  • The reply box sat below the fold behind the bottom nav, so Ryan didn't
//    find it. On phones the thread is now a fixed chat screen between the top
//    and bottom bars: header, scrolling messages, composer always visible.
//    It follows window.visualViewport so the composer rides on top of the
//    keyboard, and the bottom nav + June button hide while typing.
import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/lib/use-is-mobile'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { linkify } from '@/lib/linkify'

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
  const listRef = useRef<HTMLDivElement | null>(null)
  const isMobile = useIsMobile()
  const [typing, setTyping] = useState(false)
  // Visible viewport (shrinks when the iOS keyboard opens).
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => {
    if (!isMobile) return
    const v = window.visualViewport
    const upd = () => setVv(v ? { h: v.height, top: v.offsetTop } : { h: window.innerHeight, top: 0 })
    upd()
    v?.addEventListener('resize', upd); v?.addEventListener('scroll', upd); window.addEventListener('resize', upd)
    return () => { v?.removeEventListener('resize', upd); v?.removeEventListener('scroll', upd); window.removeEventListener('resize', upd) }
  }, [isMobile])
  // Flags for the CSS below: hide June on threads; hide the bottom nav while typing.
  useEffect(() => {
    const r = document.documentElement
    r.dataset.chat = '1'
    return () => { delete r.dataset.chat; delete r.dataset.chatTyping }
  }, [])
  useEffect(() => {
    const r = document.documentElement
    if (typing) r.dataset.chatTyping = '1'; else delete r.dataset.chatTyping
  }, [typing])

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

  // Keep the message list pinned to the newest message — scroll only the list
  // box, never the page (scrollIntoView would drag the whole window down).
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [messages.length, vv?.h])

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

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', paddingTop: 20 }}>Loading…</div>
  if (error && !meta) return (
    <div style={{ paddingTop: 20 }}>
      <Link href="/account/messages" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'none' }}>← Messages</Link>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', paddingTop: 20 }}>{error}</div>
    </div>
  )

  // Phone: a fixed chat screen between the top bar (52px) and the bottom nav
  // (62px + safe area). While typing, the nav is hidden and the screen ends at
  // the top of the keyboard.
  const TOP = 52
  const shell: React.CSSProperties = isMobile
    ? {
        position: 'fixed', left: 0, right: 0, zIndex: 50, background: 'var(--t-bg)',
        top: TOP + (vv?.top ?? 0),
        height: vv
          ? (typing ? `${vv.h - TOP}px` : `calc(${vv.h - TOP - 62}px - env(safe-area-inset-bottom))`)
          : `calc(100dvh - ${TOP + 62}px - env(safe-area-inset-bottom))`,
        display: 'flex', flexDirection: 'column', padding: '10px 14px 10px', boxSizing: 'border-box', overflowX: 'hidden',
      }
    : { maxWidth: 1000, display: 'flex', flexDirection: 'column', height: 'calc(85 * var(--svh))', minHeight: 420 }

  return (
    <div style={shell}>
      <style>{`
        html[data-chat] .mk-june-launcher { display: none !important; }
        @media (max-width: 768px) { html[data-chat-typing] .am-bar { display: none !important; } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', flexShrink: 0 }}>
        <Link href="/account/messages" aria-label="Back to messages" style={{ fontFamily: 'Inter', fontSize: isMobile ? 22 : 13, lineHeight: 1, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', textDecoration: 'none', padding: isMobile ? '4px 4px 4px 0' : 0 }}>{isMobile ? '←' : '← Messages'}</Link>
        {meta && (
          <Link href={`/account/directory/${meta.other.id}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {meta.other.avatar_url
                ? <img src={meta.other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 16, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' }}>{meta.other.name.charAt(0).toUpperCase()}</span>}
            </div>
            <span style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.other.name}</span>
          </Link>
        )}
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 2px 8px', WebkitOverflowScrolling: 'touch' as any }}>
        {messages.length === 0 && (
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', textAlign: 'center', marginTop: 20 }}>Say hello</div>
        )}
        {messages.map(m => {
          const mine = meta && m.sender_id === meta.me
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', minWidth: 0 }}>
              <div style={{
                background: mine ? 'var(--t-fg)' : 'var(--t-surface-hi)',
                color: mine ? 'var(--t-on-fg)' : 'var(--t-fg)',
                border: mine ? 'none' : '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))',
                borderRadius: 16, padding: '9px 13px', fontFamily: 'Inter', fontSize: 15, lineHeight: 1.4,
                whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              }}>{linkify(m.body, mine ? 'var(--t-link-mine)' : 'var(--t-link)')}</div>
            </div>
          )
        })}
      </div>

      {error && <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--t-err)', margin: '4px 0', flexShrink: 0 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', flexShrink: 0, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Write a reply…"
          maxLength={2000}
          enterKeyHint="send"
          // 16px minimum: iOS Safari zooms the whole page on focus for anything smaller.
          style={{ flex: 1, minWidth: 0, background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.16 * var(--t-a)))', borderRadius: 22, padding: '11px 16px', fontFamily: 'Inter', fontSize: 16, color: 'var(--t-fg)', outline: 'none' }}
        />
        <button
          // mousedown/touch keeps focus in the input so the keyboard stays up after sending.
          onMouseDown={e => e.preventDefault()}
          onPointerDown={e => e.preventDefault()}
          onClick={send} disabled={sending || !input.trim()}
          style={{ flexShrink: 0, height: 44, background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 22, padding: '0 18px', fontFamily: 'Inter', fontSize: 14, fontWeight: 600, cursor: (sending || !input.trim()) ? 'default' : 'pointer', opacity: (sending || !input.trim()) ? 0.5 : 1 }}>
          Send
        </button>
      </div>
    </div>
  )
}

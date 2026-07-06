'use client'

// June — floating chat widget (site-wide, mounted in app/layout.tsx).
// Talks to /api/agent/chat. Polls while open so Teddy-takeover replies arrive.
// Avatar: "J" monogram until June's generated look is ready.

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'

interface Msg { id?: string; role: string; content: string; created_at?: string }

const TOKEN_KEY = 'mk_june_token'
const GOLD = '#d4a843'

export default function JuneChatWidget() {
  const pathname = usePathname()
  const [open, setOpen]         = useState(false)
  const [msgs, setMsgs]         = useState<Msg[]>([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [takeover, setTakeover] = useState(false)
  const [unread, setUnread]     = useState(false)
  const listRef  = useRef<HTMLDivElement>(null)
  const lastTs   = useRef<string | null>(null)
  const openRef  = useRef(false)
  openRef.current = open

  // Hide on admin/desk/checkin surfaces.
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/desk') || pathname?.startsWith('/checkin') || pathname?.startsWith('/kiosk') || pathname?.startsWith('/tour-admin')) {
    return null
  }

  const scrollDown = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
    })
  }

  const poll = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    try {
      const url = new URL('/api/agent/chat', window.location.origin)
      url.searchParams.set('token', token)
      if (lastTs.current) url.searchParams.set('after', lastTs.current)
      const res = await fetch(url.toString())
      if (!res.ok) return
      const data = await res.json()
      setTakeover(!!data.human_takeover)
      const incoming: Msg[] = (data.messages ?? []).filter((m: Msg) => m.role !== 'user' || !lastTs.current)
      if (incoming.length) {
        setMsgs(prev => {
          const seen = new Set(prev.map(p => p.id))
          const fresh = (data.messages ?? []).filter((m: Msg) => !seen.has(m.id))
          if (!fresh.length) return prev
          if (!openRef.current) setUnread(true)
          return [...prev, ...fresh]
        })
        const all = data.messages ?? []
        if (all.length) lastTs.current = all[all.length - 1].created_at
        scrollDown()
      }
    } catch {}
  }, [])

  // Restore history on first open; poll every 4s while open (20s in background if a convo exists).
  useEffect(() => {
    if (!open) return
    setUnread(false)
    if (msgs.length === 0 && localStorage.getItem(TOKEN_KEY)) {
      lastTs.current = null
      poll()
    }
    const iv = setInterval(poll, 4000)
    return () => clearInterval(iv)
  }, [open, poll]) // eslint-disable-line react-hooks/exhaustive-deps

  // Replace local (optimistic, id-less) messages with the server's canonical
  // list so polling never duplicates them.
  const refreshAll = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    try {
      const url = new URL('/api/agent/chat', window.location.origin)
      url.searchParams.set('token', token)
      const res = await fetch(url.toString())
      if (!res.ok) return
      const data = await res.json()
      setTakeover(!!data.human_takeover)
      const all: Msg[] = data.messages ?? []
      setMsgs(all)
      lastTs.current = all.length ? all[all.length - 1].created_at ?? null : null
      scrollDown()
    } catch {}
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    setMsgs(prev => [...prev, { role: 'user', content: text }])
    scrollDown()
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem(TOKEN_KEY) || undefined,
          message: text,
          page: pathname,
        }),
      })
      const data = await res.json()
      if (data.token) localStorage.setItem(TOKEN_KEY, data.token)
      if (data.queued) setTakeover(true)
      if (data.error) setMsgs(prev => [...prev, { role: 'system', content: data.error }])
      // Pull the canonical transcript (includes our message + June's reply, with ids).
      await refreshAll()
    } catch {
      setMsgs(prev => [...prev, { role: 'system', content: 'Connection hiccup — try again.' }])
    }
    setSending(false)
    scrollDown()
  }

  // Render June's text with [label](/path) markdown links as tappable gold
  // buttons (internal paths navigate in-tab; full URLs open a new tab).
  const renderContent = (text: string) => {
    const parts: React.ReactNode[] = []
    const re = /(!?)\[([^\]]+)\]\((\/[^\s)]+|https?:\/\/[^\s)]+)\)/g
    let last = 0
    let match: RegExpExecArray | null
    let k = 0
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) parts.push(text.slice(last, match.index))
      const isImg = match[1] === '!'
      const label = match[2]
      const href = match[3]
      if (isImg) {
        parts.push(
          <img key={k++} src={href} alt={label} style={{ display: 'block', maxWidth: '100%', maxHeight: 260, borderRadius: 10, margin: '6px 0 2px' }} />
        )
      } else {
        const external = href.startsWith('http') && !href.includes(window.location.hostname)
        parts.push(
          <a key={k++} href={href} target={external ? '_blank' : '_self'} rel="noreferrer" style={{
            display: 'inline-block', background: GOLD, color: '#080808', textDecoration: 'none',
            fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', padding: '7px 14px',
            borderRadius: 6, margin: '6px 4px 2px 0',
          }}>
            {label} →
          </a>
        )
      }
      last = match.index + match[0].length
    }
    if (last < text.length) parts.push(text.slice(last))
    return parts
  }

  const bubble = (m: Msg, i: number) => {
    const mine = m.role === 'user'
    const isTeddy = m.role === 'teddy'
    return (
      <div key={m.id ?? i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
        <div style={{
          maxWidth: '80%', padding: '9px 12px', fontSize: 13, lineHeight: 1.5,
          fontFamily: 'Inter, sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: mine ? '#fff' : 'rgba(255,255,255,0.07)',
          color: mine ? '#080808' : 'rgba(255,255,255,0.92)',
          border: mine ? 'none' : '1px solid rgba(255,255,255,0.1)',
          borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        }}>
          {!mine && (
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: isTeddy ? GOLD : 'rgba(255,255,255,0.4)', marginBottom: 3 }}>
              {isTeddy ? 'MADE KULTURE TEAM' : m.role === 'system' ? 'SYSTEM' : 'JUNE'}
            </div>
          )}
          {mine ? m.content : renderContent(m.content)}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Chat with June"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9000,
          width: 56, height: 56, borderRadius: '50%', border: `1px solid ${GOLD}`,
          background: '#080808', color: GOLD, cursor: 'pointer',
          fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700,
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? '×' : 'J'}
        {unread && !open && (
          <span style={{ position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: '50%', background: GOLD }} />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 20, zIndex: 9000,
          width: 'min(360px, calc(100vw - 32px))', height: 'min(520px, calc(100vh - 120px))',
          background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)', borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10, background: '#000' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: GOLD, color: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 16 }}>J</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#fff' }}>JUNE</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                {takeover ? 'A team member joined the chat' : 'Made Kulture front desk · AI assistant'}
              </div>
            </div>
            <button
              onClick={() => {
                if (msgs.length && !window.confirm('Start a fresh chat? Your current conversation will be cleared.')) return
                localStorage.removeItem(TOKEN_KEY)
                lastTs.current = null
                setMsgs([])
                setTakeover(false)
              }}
              title="Start a new chat"
              aria-label="Start a new chat"
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, padding: 4 }}
            >
              ↺
            </button>
          </div>

          {/* Messages */}
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {msgs.length === 0 && (
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, padding: '8px 4px' }}>
                Hey! I'm June 👋 Ask me about sets, pricing, availability, or how booking works. Chats here are monitored by a real member of our team.
              </div>
            )}
            {msgs.map(bubble)}
            {sending && (
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.35)', padding: '4px 2px' }}>June is typing…</div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Type a message…"
              maxLength={1000}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '10px 12px',
                outline: 'none', borderRadius: 6,
              }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              style={{
                background: input.trim() && !sending ? GOLD : 'rgba(255,255,255,0.1)',
                color: input.trim() && !sending ? '#080808' : 'rgba(255,255,255,0.3)',
                border: 'none', padding: '0 16px', cursor: input.trim() && !sending ? 'pointer' : 'default',
                fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', borderRadius: 6,
              }}
            >
              SEND
            </button>
          </div>
        </div>
      )}
    </>
  )
}

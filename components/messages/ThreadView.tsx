'use client'
// One 1:1 directory conversation (2026-10-05).
//  • Desktop: the right pane of the two-pane inbox (app/account/messages/layout.tsx),
//    filling its height — header, scrolling messages, pinned reply box.
//  • Phone: a fixed chat screen between the top bar (52px) and bottom nav (62px).
//    It follows window.visualViewport so the reply box rides on the keyboard,
//    and the bottom nav + June button hide while typing.
//  • The input is 16px: iOS Safari ZOOMS the page on focus for anything smaller
//    (that's what pushed the bubbles off-screen in Teddy's test). Keep it >= 16px.
//  • REQUEST messages (from /api/listings/request) render as a card.
//  • Fires 'mk-messages-changed' + 'mk-badges' after send/read so the inbox
//    list and the nav badge update without a reload.
import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { linkify } from '@/lib/linkify'
import { useIsMobile } from '@/lib/use-is-mobile'

type Msg = { id: string; sender_id: string; body: string; created_at: string }
type Meta = { id: string; me: string; other: { id: string; name: string; avatar_url: string | null }; blocked_by_me?: boolean }

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`
const hair = `1px solid ${muted(0.1)}`

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
function dayLabel(iso: string): string {
  const k = dayKey(iso), today = dayKey(new Date().toISOString()), yest = dayKey(new Date(Date.now() - 864e5).toISOString())
  if (k === today) return 'Today'
  if (k === yest) return 'Yesterday'
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'America/Chicago' })
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })

/** "REQUEST: <title>\nDate: …\nListed rate: …\n\n<note>" → parts, else null. */
function parseRequest(body: string) {
  if (!body.startsWith('REQUEST: ')) return null
  const [head, ...rest] = body.split('\n\n')
  const lines = head.split('\n')
  const title = lines[0].slice(9).trim()
  const fields = lines.slice(1).map(l => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const : null }).filter(Boolean) as (readonly [string, string])[]
  return { title, fields, note: rest.join('\n\n').trim() }
}

export default function ThreadView({ id, pane = false }: { id: string; pane?: boolean }) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const phone = isMobile && !pane

  const [meta, setMeta] = useState<Meta | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [typing, setTyping] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Visible viewport on phones (shrinks when the keyboard opens).
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null)
  useEffect(() => {
    if (!phone) { setVv(null); return }
    const v = window.visualViewport
    const upd = () => setVv(v ? { h: v.height, top: v.offsetTop } : { h: window.innerHeight, top: 0 })
    upd()
    v?.addEventListener('resize', upd); v?.addEventListener('scroll', upd); window.addEventListener('resize', upd)
    return () => { v?.removeEventListener('resize', upd); v?.removeEventListener('scroll', upd); window.removeEventListener('resize', upd) }
  }, [phone])
  useEffect(() => {
    const r = document.documentElement
    r.dataset.chat = '1'
    return () => { delete r.dataset.chat; delete r.dataset.chatTyping }
  }, [])
  useEffect(() => {
    const r = document.documentElement
    if (typing) r.dataset.chatTyping = '1'; else delete r.dataset.chatTyping
  }, [typing])

  const changed = () => { window.dispatchEvent(new Event('mk-messages-changed')); window.dispatchEvent(new Event('mk-badges')) }
  const markRead = () => {
    fetch('/api/messages/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: id }) })
      .then(changed).catch(() => {})
  }

  useEffect(() => {
    setLoading(true); setError(''); setMeta(null); setMessages([]); setInput('')
    fetch(`/api/messages/${id}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(d.error ?? 'Could not load conversation.'); setLoading(false); return }
        setMeta(d.conversation); setMessages(d.messages ?? []); setLoading(false)
        markRead()
      })
      .catch(() => { setError('Could not load conversation.'); setLoading(false) })

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

  // Scroll only the message box, never the page.
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [messages.length, vv?.h, loading])

  // Block / unblock from the thread (migration 148). Two taps to block.
  const [blockArmed, setBlockArmed] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const setBlocked = async (block: boolean) => {
    if (!meta || blockBusy) return
    if (block && !blockArmed) { setBlockArmed(true); setTimeout(() => setBlockArmed(false), 4000); return }
    setBlockBusy(true); setError('')
    const res = block
      ? await fetch('/api/directory/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: meta.other.id }) })
      : await fetch(`/api/directory/block?userId=${encodeURIComponent(meta.other.id)}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    setBlockBusy(false); setBlockArmed(false)
    if (!res.ok) { setError((d as any).error ?? 'Could not update. Try again.'); return }
    setMeta(m => m ? { ...m, blocked_by_me: block } : m)
  }
  const blocked = !!meta?.blocked_by_me

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true); setError('')
    const res = await fetch(`/api/messages/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'Could not send.'); setSending(false); return }
    setMessages(prev => (prev.some(x => x.id === d.message.id) ? prev : [...prev, d.message]))
    setInput(''); setSending(false)
    changed()
  }

  const TOP = 52
  const shell: React.CSSProperties = phone
    ? {
        position: 'fixed', left: 0, right: 0, zIndex: 50, background: 'var(--t-bg)',
        top: TOP + (vv?.top ?? 0),
        height: vv
          ? (typing ? `${vv.h - TOP}px` : `calc(${vv.h - TOP - 62}px - env(safe-area-inset-bottom))`)
          : `calc(100dvh - ${TOP + 62}px - env(safe-area-inset-bottom))`,
        display: 'flex', flexDirection: 'column', padding: '10px 14px', boxSizing: 'border-box', overflowX: 'hidden',
      }
    : { height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }

  const pad = phone ? 0 : 22
  const bubbleMax = phone ? '82%' : '62%'

  // Messages grouped under day dividers.
  const rows: React.ReactNode[] = []
  let lastDay = ''
  for (const m of messages) {
    const k = dayKey(m.created_at)
    if (k !== lastDay) {
      lastDay = k
      rows.push(
        <div key={`d-${k}`} style={{ alignSelf: 'center', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.06em', color: muted(0.45), margin: '10px 0 4px' }}>{dayLabel(m.created_at)}</div>
      )
    }
    const mine = !!meta && m.sender_id === meta.me
    const req = parseRequest(m.body)
    rows.push(
      <div key={m.id} className="mk-msg" style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: bubbleMax, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {req ? (
          <div style={{ width: phone ? '100%' : 340, maxWidth: '100%', background: 'var(--t-surface)', border: '1px solid rgba(var(--t-gold-rgb), 0.45)', borderRadius: 14, overflow: 'hidden', fontFamily: 'Inter' }}>
            <div style={{ padding: '12px 14px 10px', borderBottom: hair }}>
              <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: '0.16em', color: 'var(--t-gold)' }}>REQUEST</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-fg)', marginTop: 4 }}>{req.title}</div>
            </div>
            <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 14, rowGap: 4, fontSize: 13 }}>
              {req.fields.map(([k, v]) => (<Fragment key={k}><span style={{ color: muted(0.5) }}>{k}</span><span style={{ color: 'var(--t-fg)' }}>{v}</span></Fragment>))}
            </div>
            {req.note && <div style={{ padding: '0 14px 12px', fontSize: 14, lineHeight: 1.45, color: 'var(--t-fg)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{linkify(req.note, 'var(--t-link)')}</div>}
          </div>
        ) : (
          <div title={timeLabel(m.created_at)} style={{
            background: mine ? 'var(--t-fg)' : 'var(--t-surface-hi)',
            color: mine ? 'var(--t-on-fg)' : 'var(--t-fg)',
            border: mine ? 'none' : hair,
            borderRadius: 18, padding: '9px 14px', fontFamily: 'Inter', fontSize: 15, lineHeight: 1.4,
            whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          }}>{linkify(m.body, mine ? 'var(--t-link-mine)' : 'var(--t-link)')}</div>
        )}
        <span className="mk-msg-time" style={{ fontFamily: 'Inter', fontSize: 10.5, color: muted(0.4), margin: '3px 6px 0' }}>{timeLabel(m.created_at)}</span>
      </div>
    )
  }

  return (
    <div style={shell}>
      <style>{`
        html[data-chat] .mk-june-launcher { display: none !important; }
        @media (max-width: 768px) { html[data-chat-typing] .am-bar { display: none !important; } }
        .mk-msg .mk-msg-time { visibility: hidden; height: 0; margin-top: 0 !important; }
        .mk-msg:hover .mk-msg-time { visibility: visible; height: auto; margin-top: 3px !important; }
        @media (hover: none) { .mk-msg .mk-msg-time { display: none; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: phone ? '0 0 10px' : `14px ${pad}px`, borderBottom: hair, flexShrink: 0, minHeight: phone ? undefined : 64, boxSizing: 'border-box' }}>
        {phone && <Link href="/account/messages" aria-label="Back to messages" style={{ fontFamily: 'Inter', fontSize: 22, lineHeight: 1, color: muted(0.6), textDecoration: 'none', padding: '4px 4px 4px 0' }}>←</Link>}
        {meta && (
          <Link href={`/account/directory/${meta.other.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {meta.other.avatar_url
                ? <img src={meta.other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 16, color: muted(0.5) }}>{meta.other.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.other.name}</div>
              {!phone && <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.45) }}>View profile</div>}
            </div>
          </Link>
        )}
        {meta && (
          <button type="button" onClick={() => setBlocked(!blocked)} disabled={blockBusy}
            style={{ marginLeft: 'auto', flexShrink: 0, background: blockArmed ? 'var(--t-err, #d9534f)' : 'transparent', color: blockArmed ? '#fff' : muted(0.55), border: `1px solid ${blockArmed ? 'transparent' : muted(0.18)}`, borderRadius: 16, padding: '6px 12px', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: blockBusy ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {blockBusy ? '…' : blocked ? 'Unblock' : blockArmed ? 'Tap to confirm' : 'Block'}
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 6, padding: phone ? '10px 2px 8px' : `12px ${pad}px 14px` }}>
        {loading && <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.4), margin: 'auto' }}>Loading…</div>}
        {!loading && error && !meta && <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.5), margin: 'auto' }}>{error}</div>}
        {!loading && meta && messages.length === 0 && <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.4), margin: 'auto' }}>Say hello</div>}
        {rows}
      </div>

      {error && meta && <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--t-err)', padding: `4px ${pad}px`, flexShrink: 0 }}>{error}</div>}

      {blocked && (
        <div style={{ fontFamily: 'Inter', fontSize: 12.5, lineHeight: 1.5, color: muted(0.55), padding: phone ? '10px 0 0' : `10px ${pad}px 0`, borderTop: hair, flexShrink: 0 }}>
          You blocked {meta?.other.name.split(' ')[0]}. Neither of you can message the other, and this thread is hidden from your inbox. Unblock to talk again.
        </div>
      )}

      {/* Reply box */}
      {!blocked && <div style={{ display: 'flex', gap: 8, padding: phone ? '10px 0 0' : `12px ${pad}px 16px`, borderTop: hair, flexShrink: 0, alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={meta ? `Message ${meta.other.name.split(' ')[0]}…` : 'Write a reply…'}
          maxLength={2000}
          enterKeyHint="send"
          disabled={!meta}
          style={{ flex: 1, minWidth: 0, background: 'var(--t-surface)', border: `1px solid ${muted(0.16)}`, borderRadius: 22, padding: '11px 16px', fontFamily: 'Inter', fontSize: 16, color: 'var(--t-fg)', outline: 'none' }}
        />
        <button
          onMouseDown={e => e.preventDefault()}
          onPointerDown={e => e.preventDefault()}
          onClick={send} disabled={sending || !input.trim()}
          style={{ flexShrink: 0, height: 44, background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 22, padding: '0 20px', fontFamily: 'Inter', fontSize: 14, fontWeight: 600, cursor: (sending || !input.trim()) ? 'default' : 'pointer', opacity: (sending || !input.trim()) ? 0.5 : 1 }}>
          Send
        </button>
      </div>}
    </div>
  )
}

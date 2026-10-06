'use client'
// The inbox list. Used full-width on phones (/account/messages) and as the
// left pane of the desktop two-pane view (app/account/messages/layout.tsx).
// Refetches when a thread fires 'mk-messages-changed' (sent / read), so the
// preview line and unread dot stay current without a page reload.
import { useEffect, useState } from 'react'
import Link from 'next/link'

export type Conv = {
  id: string
  other: { id: string; name: string; avatar_url: string | null }
  last: { body: string; fromMe: boolean; at: string } | null
  unread: number
}

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`

function when(iso: string): string {
  const d = new Date(iso), mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const h = Math.round(mins / 60); if (h < 24) return `${h}h`
  const days = Math.round(h / 24); if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// "REQUEST: 1981 DMC Delorean\nDate: …" reads badly as a one-line preview.
const preview = (body: string) => body.startsWith('REQUEST: ') ? `Request · ${body.split('\n')[0].slice(9)}` : body.replace(/\s+/g, ' ')

export default function ConversationList({ selectedId, pane = false }: { selectedId?: string | null; pane?: boolean }) {
  const [convs, setConvs] = useState<Conv[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const load = () => fetch('/api/messages/conversations', { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error(); const d = await r.json(); setConvs(d.conversations ?? []); setFailed(false) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
    load()
    window.addEventListener('mk-messages-changed', load)
    return () => window.removeEventListener('mk-messages-changed', load)
  }, [])

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.4), padding: pane ? 18 : 0 }}>Loading…</div>
  // A failed read must never look like an empty inbox.
  if (failed && convs.length === 0) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-err)', padding: pane ? 18 : 0 }}>Could not load messages. Refresh to try again.</div>
  if (convs.length === 0) return (
    <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.45), lineHeight: 1.6, padding: pane ? 18 : 0 }}>
      No messages yet. Open a member from the <Link href="/account/directory" style={{ color: 'var(--t-gold)' }}>directory</Link> and hit Message to start a conversation.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: pane ? 0 : 6 }}>
      {convs.map(c => {
        const on = c.id === selectedId
        return (
          <Link key={c.id} href={`/account/messages/${c.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit',
              padding: pane ? '12px 16px' : '12px 14px',
              background: on ? `rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))` : (!pane ? (c.unread ? 'rgba(var(--t-gold-rgb), 0.06)' : 'var(--t-surface)') : 'transparent'),
              border: pane ? 'none' : `1px solid ${muted(0.08)}`, borderRadius: pane ? 0 : 8,
              borderLeft: pane ? `3px solid ${on ? 'var(--t-gold)' : 'transparent'}` : undefined,
            }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {c.other.avatar_url
                ? <img src={c.other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, color: muted(0.5) }}>{c.other.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: c.unread ? 700 : 600, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.other.name}</span>
                {c.last && <span style={{ fontFamily: 'Inter', fontSize: 11, color: muted(0.4), flexShrink: 0 }}>{when(c.last.at)}</span>}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: c.unread ? muted(0.85) : muted(0.45), fontWeight: c.unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                {c.last ? `${c.last.fromMe ? 'You: ' : ''}${preview(c.last.body)}` : 'No messages yet'}
              </div>
            </div>
            {c.unread > 0 && <span aria-label={`${c.unread} unread`} style={{ flexShrink: 0, width: 9, height: 9, borderRadius: 5, background: 'var(--t-gold)' }} />}
          </Link>
        )
      })}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Conv = {
  id: string
  other: { id: string; name: string; avatar_url: string | null }
  last: { body: string; fromMe: boolean; at: string } | null
  unread: number
}

function when(iso: string): string {
  const d = new Date(iso), mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const h = Math.round(mins / 60); if (h < 24) return `${h}h`
  const days = Math.round(h / 24); if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function MessagesPage() {
  const [convs, setConvs] = useState<Conv[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/messages/conversations')
      .then(r => (r.ok ? r.json() : { conversations: [] }))
      .then(d => { setConvs(d.conversations ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, margin: '0 0 24px' }}>MESSAGES</h1>

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : convs.length === 0 ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
          No messages yet. Open a member from the{' '}
          <Link href="/account/directory" style={{ color: '#e6c07a' }}>directory</Link> and hit Message to start a conversation.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 620 }}>
          {convs.map(c => (
            <Link key={c.id} href={`/account/messages/${c.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', background: c.unread ? 'rgba(230,192,122,0.06)' : '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', background: '#1f1f1f', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.other.avatar_url
                  ? <img src={c.other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>{c.other.name.charAt(0).toUpperCase()}</span>}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: c.unread ? 700 : 600, color: '#fff' }}>{c.other.name}</span>
                  {c.last && <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{when(c.last.at)}</span>}
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: c.unread ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                  {c.last ? `${c.last.fromMe ? 'You: ' : ''}${c.last.body}` : 'No messages yet'}
                </div>
              </div>
              {c.unread > 0 && (
                <span style={{ flexShrink: 0, minWidth: 20, height: 20, borderRadius: 10, background: '#e6c07a', color: '#080808', fontFamily: 'Inter', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{c.unread}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Msg = { id: string; sender_id: string; body: string; reply_to_id: string | null; created_at: string }
type Member = { id: string; name: string; avatar_url: string | null; is_author: boolean }

export default function CastingTeamChannel({ castingId }: { castingId: string }) {
  const supabase = createClient()
  const [me, setMe] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const memberMap = useMemo(() => {
    const m: Record<string, Member> = {}
    for (const x of members) m[x.id] = x
    return m
  }, [members])
  const nameOf = (id: string) => memberMap[id]?.name || 'Member'

  const load = (initial = false) => {
    if (initial) setLoading(true)
    fetch(`/api/castings/${castingId}/team-messages`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(d.error ?? 'Could not load the channel.'); setLoading(false); return }
        setMe(d.me); setMembers(d.members ?? []); setMessages(d.messages ?? []); setLoading(false)
      })
      .catch(() => { setError('Could not load the channel.'); setLoading(false) })
  }

  useEffect(() => {
    load(true)
    // Live: any insert on this casting's channel refreshes the thread (and marks read).
    const ch = supabase
      .channel(`casting-team-${castingId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'casting_messages', filter: `casting_id=eq.${castingId}` },
        () => load(false))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [castingId])

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [messages.length])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true); setError('')
    const res = await fetch(`/api/castings/${castingId}/team-messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, replyToId: replyTo?.id ?? null }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'Could not send.'); setSending(false); return }
    setMessages(prev => (prev.some(x => x.id === d.message.id) ? prev : [...prev, d.message]))
    setInput(''); setReplyTo(null); setSending(false)
  }

  const excerpt = (s: string) => (s.length > 60 ? s.slice(0, 60) + '…' : s)

  return (
    <div style={{ marginTop: 26, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: '#e6c07a' }}>TEAM CHANNEL</div>
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>· only the confirmed crew can see this</div>
      </div>

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', padding: '12px 0' }}>Loading…</div>
      ) : (
        <>
          <div ref={listRef} style={{ maxHeight: 'min(52vh, 440px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 4px 4px' }}>
            {messages.length === 0 && (
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', margin: '16px 0' }}>
                Kick things off — this is your crew&apos;s space to plan the shoot.
              </div>
            )}
            {messages.map(m => {
              const mine = m.sender_id === me
              const parent = m.reply_to_id ? messages.find(x => x.id === m.reply_to_id) : null
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {!mine && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '0 4px 2px' }}>{nameOf(m.sender_id)}{memberMap[m.sender_id]?.is_author ? ' · organizer' : ''}</div>}
                  <div style={{ background: mine ? '#fff' : '#1c1c1c', color: mine ? '#080808' : '#fff', border: mine ? 'none' : '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '9px 13px', fontFamily: 'Inter', fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {parent && (
                      <div style={{ borderLeft: `2px solid ${mine ? 'rgba(0,0,0,0.25)' : 'rgba(230,192,122,0.6)'}`, paddingLeft: 8, marginBottom: 5, fontSize: 12, opacity: 0.7 }}>
                        <span style={{ fontWeight: 600 }}>{nameOf(parent.sender_id)}</span>: {excerpt(parent.body)}
                      </div>
                    )}
                    {m.body}
                  </div>
                  <button type="button" onClick={() => setReplyTo(m)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter', fontSize: 10, cursor: 'pointer', padding: '2px 4px', margin: '1px 2px 0' }}>Reply</button>
                </div>
              )
            })}
          </div>

          {error && <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', marginTop: 6 }}>{error}</div>}

          {replyTo && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'rgba(255,255,255,0.05)', borderLeft: '2px solid #e6c07a', borderRadius: 4, padding: '6px 10px', marginTop: 10, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Replying to <strong style={{ color: '#fff' }}>{nameOf(replyTo.sender_id)}</strong>: {excerpt(replyTo.body)}</span>
              <button type="button" onClick={() => setReplyTo(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={replyTo ? `Reply to ${nameOf(replyTo.sender_id)}…` : 'Message the team…'} maxLength={2000}
              style={{ flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 22, padding: '11px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff', outline: 'none' }} />
            <button onClick={send} disabled={sending || !input.trim()}
              style={{ background: '#fff', color: '#080808', border: 'none', borderRadius: 22, padding: '0 20px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, cursor: (sending || !input.trim()) ? 'default' : 'pointer', opacity: (sending || !input.trim()) ? 0.5 : 1 }}>Send</button>
          </div>
        </>
      )}
    </div>
  )
}

'use client'
// Support Center (2026-10-07) — searchable FAQ + "Contact support" ticket form.
// Used by /account/support (inside the account shell, light/dark theme vars)
// and /support (public page, dark). Content lives in lib/support-faq.ts.
// Tickets go to /api/support/ticket → June drafts → Teddy approves in the inbox.
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FAQ, SUPPORT_EMAIL, SUPPORT_TEXT, SUPPORT_TEXT_HREF, type FaqItem } from '@/lib/support-faq'

const fg = 'var(--t-fg, #fff)'
const muted = 'rgba(var(--t-fg-rgb, 255,255,255), calc(0.6 * var(--t-a, 1)))'
const faint = 'rgba(var(--t-fg-rgb, 255,255,255), calc(0.4 * var(--t-a, 1)))'
const line = '1px solid rgba(var(--t-fg-rgb, 255,255,255), calc(0.12 * var(--t-a, 1)))'
const surface = 'var(--t-surface-lo, rgba(255,255,255,0.03))'
const gold = 'var(--t-gold, #c9b27e)'
const input: React.CSSProperties = { width: '100%', background: 'var(--t-surface, #111)', border: line, borderRadius: 6, padding: '12px 14px', fontFamily: 'Inter', fontSize: 14, color: fg, outline: 'none', boxSizing: 'border-box' }
const label: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: faint, marginBottom: 6 }
const btn: React.CSSProperties = { background: fg, color: 'var(--t-on-fg, #080808)', border: 'none', borderRadius: 4, padding: '12px 22px', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }

const TOPICS = ['Booking', 'Door code / getting in', 'Payment or receipt', 'Cancellation or credit', 'Plus membership', 'Account or sign-in', 'App', 'Directory or castings', 'Something else']

// [label](/path) → link. Everything else is plain text.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return <>{parts.map((p, i) => {
    const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    return m ? <Link key={i} href={m[2]} style={{ color: gold, textDecoration: 'none', fontWeight: 600 }}>{m[1]}</Link> : <span key={i}>{p}</span>
  })}</>
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ')

function Qa({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: line }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, background: 'none', border: 'none', padding: '16px 2px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter', fontSize: 15, fontWeight: 500, color: fg }}>
        <span>{item.q}</span>
        <span aria-hidden style={{ color: faint, fontSize: 20, lineHeight: 1, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>+</span>
      </button>
      {open && <div style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.7, color: muted, padding: '0 2px 18px' }}><Rich text={item.a} /></div>}
    </div>
  )
}

export default function SupportCenter({ signedIn, email }: { signedIn: boolean; email?: string | null }) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<string>('all')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(() => {
    const words = norm(query).split(' ').filter(w => w.length > 1)
    const out: { key: string; sectionTitle: string; item: FaqItem; score: number }[] = []
    for (const s of FAQ) {
      if (!words.length && section !== 'all' && s.id !== section) continue
      s.items.forEach((item, i) => {
        const key = `${s.id}-${i}`
        if (!words.length) { out.push({ key, sectionTitle: s.title, item, score: 0 }); return }
        const q = norm(item.q), hay = norm(`${item.q} ${item.tags ?? ''} ${item.a} ${s.title}`)
        if (!words.every(w => hay.includes(w))) return
        out.push({ key, sectionTitle: s.title, item, score: words.filter(w => q.includes(w)).length })
      })
    }
    if (words.length) out.sort((a, b) => b.score - a.score)
    return out
  }, [query, section])

  // ── Ticket form
  const [showForm, setShowForm] = useState(false)
  const [topic, setTopic] = useState(TOPICS[0]); const [subject, setSubject] = useState(''); const [message, setMessage] = useState('')
  const [name, setName] = useState(''); const [gEmail, setGEmail] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<{ ref: string; email: string } | null>(null)
  const openForm = (prefill?: string) => {
    setShowForm(true); setDone(null); setErr('')
    if (prefill && !subject) setSubject(prefill.slice(0, 120))
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const r = await fetch('/api/support/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, subject, message, ...(signedIn ? {} : { name, email: gEmail }) }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) { setErr(d.error || 'Could not send your request. Please text us instead.'); return }
    setDone({ ref: d.ref, email: d.email }); setSubject(''); setMessage('')
  }

  const chip = (id: string, title: string) => {
    const on = section === id && !query
    return (
      <button key={id} type="button" onClick={() => { setSection(id); setQuery(''); setOpenKey(null) }}
        style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
          border: on ? `1px solid ${fg}` : line, background: on ? fg : 'transparent', color: on ? 'var(--t-on-fg, #080808)' : muted }}>{title}</button>
    )
  }

  let lastTitle = ''
  return (
    <div style={{ fontFamily: 'Inter', maxWidth: 760 }}>
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 14, top: 14, color: faint }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={query} onChange={e => { setQuery(e.target.value); setOpenKey(null) }} placeholder="Search for an answer — e.g. door code, cancel, parking"
          aria-label="Search help" style={{ ...input, padding: '13px 14px 13px 42px', fontSize: 15 }} />
      </div>
      {!query && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
          {chip('all', 'All')}
          {FAQ.map(s => chip(s.id, s.title))}
        </div>
      )}

      {/* Answers */}
      <div style={{ marginBottom: 36 }}>
        {results.length === 0 ? (
          <div style={{ border: line, borderRadius: 10, padding: 20, background: surface }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: fg, marginBottom: 6 }}>No answers match “{query}”.</div>
            <div style={{ fontSize: 14, color: muted, marginBottom: 14 }}>Send us your question and we’ll get back to you by email.</div>
            <button type="button" onClick={() => openForm(query)} style={btn}>CONTACT SUPPORT</button>
          </div>
        ) : results.map(r => {
          const header = !query && section === 'all' && r.sectionTitle !== lastTitle
          lastTitle = r.sectionTitle
          return (
            <div key={r.key}>
              {header && <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', color: faint, textTransform: 'uppercase', marginTop: 26, marginBottom: 2 }}>{r.sectionTitle}</div>}
              <Qa item={r.item} open={openKey === r.key || (!!query && results.length === 1)} onToggle={() => setOpenKey(k => k === r.key ? null : r.key)} />
            </div>
          )
        })}
      </div>

      {/* Contact */}
      <div ref={formRef} style={{ border: line, borderRadius: 12, padding: '22px 22px', background: surface, scrollMarginTop: 90 }}>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 24, letterSpacing: '0.02em', color: fg, marginBottom: 6 }}>STILL NEED HELP?</div>
        <div style={{ fontSize: 14, color: muted, lineHeight: 1.6, marginBottom: 16 }}>
          Send a request and we’ll reply by email, usually within a few hours. At the studio right now? Tap <strong style={{ color: fg }}>GET THE TEAM</strong> on the set tablet or text <a href={SUPPORT_TEXT_HREF} style={{ color: gold, textDecoration: 'none' }}>{SUPPORT_TEXT}</a>.
        </div>

        {done ? (
          <div style={{ border: '1px solid rgba(60,200,120,0.35)', background: 'rgba(60,200,120,0.08)', borderRadius: 8, padding: '14px 16px', fontSize: 14, lineHeight: 1.6, color: fg }}>
            <strong>Request #{done.ref} received.</strong> We’ll reply to <strong>{done.email}</strong>. You can reply to that email to keep the conversation going.
            <div style={{ marginTop: 10 }}><button type="button" onClick={() => { setDone(null); setShowForm(true) }} style={{ ...btn, background: 'transparent', color: muted, border: line }}>SEND ANOTHER</button></div>
          </div>
        ) : !showForm ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => openForm()} style={btn}>CONTACT SUPPORT</button>
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ fontSize: 13, color: muted, textDecoration: 'none' }}>or email {SUPPORT_EMAIL}</a>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <div style={{ border: '1px solid rgba(255,60,60,0.3)', background: 'rgba(255,60,60,0.08)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--t-err, #ff7a7a)' }}>{err}</div>}
            {!signedIn && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div><label style={label}>YOUR NAME</label><input value={name} onChange={e => setName(e.target.value)} required style={input} /></div>
                <div><label style={label}>EMAIL</label><input type="email" value={gEmail} onChange={e => setGEmail(e.target.value)} required style={input} /></div>
              </div>
            )}
            <div>
              <label style={label}>WHAT’S IT ABOUT?</label>
              <select value={topic} onChange={e => setTopic(e.target.value)} style={{ ...input, colorScheme: 'dark' }}>
                {TOPICS.map(t => <option key={t} value={t} style={{ background: '#111', color: '#fff' }}>{t}</option>)}
              </select>
            </div>
            <div><label style={label}>SUBJECT</label><input value={subject} onChange={e => setSubject(e.target.value)} required maxLength={120} placeholder="A few words" style={input} /></div>
            <div>
              <label style={label}>HOW CAN WE HELP?</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} required minLength={10} maxLength={5000} rows={6}
                placeholder="Include your booking date and set if it’s about a booking." style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            {signedIn && email && <div style={{ fontSize: 12, color: faint }}>We’ll reply to {email}.</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'SENDING…' : 'SEND REQUEST'}</button>
              <button type="button" onClick={() => setShowForm(false)} style={{ ...btn, background: 'transparent', color: muted, border: line }}>CANCEL</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

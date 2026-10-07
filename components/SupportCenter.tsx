'use client'
// Support Center (2026-10-07) — a help center in the style of big-brand support
// sites: search hero → category tiles → popular articles → article pages with
// numbered steps → "Was this helpful?" → Contact Support ticket form.
// Used by /account/support (account shell, light/dark theme vars) and /support
// (public, dark). Content: lib/support-faq.ts. Tickets: /api/support/ticket →
// June drafts → Teddy approves in Admin → Inbox.
//
// Navigation lives in the URL (?c=<category> / ?a=<article>) so articles can be
// linked and the back button works. No phone number anywhere (Teddy, 2026-10-07).
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CATEGORIES, ALL_ARTICLES, SUPPORT_EMAIL, type Article } from '@/lib/support-faq'

const fg = 'var(--t-fg, #fff)'
const muted = 'rgba(var(--t-fg-rgb, 255,255,255), calc(0.62 * var(--t-a, 1)))'
const faint = 'rgba(var(--t-fg-rgb, 255,255,255), calc(0.42 * var(--t-a, 1)))'
const hair = 'rgba(var(--t-fg-rgb, 255,255,255), calc(0.12 * var(--t-a, 1)))'
const line = `1px solid ${hair}`
const surface = 'var(--t-surface-lo, rgba(255,255,255,0.035))'
const gold = 'var(--t-gold, #c9b27e)'
const display = 'Anton, "Bebas Neue", sans-serif'
const input: React.CSSProperties = { width: '100%', background: 'var(--t-surface, #111)', border: line, borderRadius: 8, padding: '12px 14px', fontFamily: 'Inter', fontSize: 14, color: fg, outline: 'none', boxSizing: 'border-box' }
const label: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: faint, marginBottom: 6 }
const btn: React.CSSProperties = { background: fg, color: 'var(--t-on-fg, #080808)', border: 'none', borderRadius: 4, padding: '12px 22px', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', color: muted, border: line }

const TOPICS = ['Booking', 'Door code / getting in', 'Payment or receipt', 'Cancellation or credit', 'Plus membership', 'Account or sign-in', 'App', 'Profile or directory', 'Service listings', 'Castings', 'Something else']
const TOPIC_FOR: Record<string, string> = { start: 'Account or sign-in', booking: 'Booking', payments: 'Payment or receipt', arrival: 'Door code / getting in', changes: 'Cancellation or credit', rules: 'Booking', profile: 'Profile or directory', directory: 'Profile or directory', services: 'Service listings', castings: 'Castings', plus: 'Plus membership', account: 'Account or sign-in', visit: 'Something else' }

const ICONS: Record<string, React.ReactNode> = {
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></>,
  swap: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></>,
  cast: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  pin: <><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
}
const Icon = ({ name, size = 22 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{ICONS[name] ?? ICONS.spark}</svg>
)

// [label](/path or ?a=slug) → link; plain text otherwise.
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return <>{parts.map((p, i) => {
    const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    return m ? <Link key={i} href={m[2]} style={{ color: gold, textDecoration: 'none', fontWeight: 600 }}>{m[1]}</Link> : <span key={i}>{p}</span>
  })}</>
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9+]+/g, ' ')
const textOf = (a: Article) => [a.q, a.tags, a.a, ...(a.steps ?? []), ...(a.notes ?? [])].filter(Boolean).join(' ')

function search(query: string) {
  const words = norm(query).split(' ').filter(w => w.length > 1)
  if (!words.length) return []
  return ALL_ARTICLES
    .map(a => {
      const q = norm(a.q), tags = norm(a.tags ?? ''), hay = norm(textOf(a) + ' ' + a.categoryTitle)
      if (!words.every(w => hay.includes(w))) return null
      const score = words.reduce((s, w) => s + (q.includes(w) ? 3 : 0) + (tags.includes(w) ? 2 : 0), 0) + (a.popular ? 1 : 0)
      return { a, score }
    })
    .filter((x): x is { a: (typeof ALL_ARTICLES)[number]; score: number } => !!x)
    .sort((x, y) => y.score - x.score)
    .map(x => x.a)
}

function Crumbs({ items, go }: { items: { label: string; to?: string }[]; go: (q: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, color: faint, marginBottom: 18 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {i > 0 && <span aria-hidden>›</span>}
          {it.to !== undefined
            ? <button type="button" onClick={() => go(it.to!)} style={{ background: 'none', border: 'none', padding: 0, color: muted, cursor: 'pointer', font: 'inherit' }}>{it.label}</button>
            : <span style={{ color: fg }}>{it.label}</span>}
        </span>
      ))}
    </div>
  )
}

function ArticleRow({ a, onOpen, sub }: { a: Article; onOpen: () => void; sub?: string }) {
  return (
    <button type="button" onClick={onOpen}
      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, background: 'none', border: 'none', borderBottom: line, padding: '15px 2px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter' }}>
      <span>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: fg }}>{a.q}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: faint, marginTop: 3 }}>{sub}</span>}
      </span>
      <span aria-hidden style={{ color: faint, fontSize: 18 }}>›</span>
    </button>
  )
}

// Home page shows 8 topic tiles (Reolink-style: icon + name, nothing else).
// Each tile groups one or more content categories from lib/support-faq.ts.
const TILES: { id: string; title: string; icon: string; cats: string[] }[] = [
  { id: 'start', title: 'Getting Started', icon: 'spark', cats: ['start'] },
  { id: 'booking', title: 'Booking a Set', icon: 'cal', cats: ['booking'] },
  { id: 'payments', title: 'Payments & Credit', icon: 'card', cats: ['payments'] },
  { id: 'studio', title: 'At the Studio', icon: 'key', cats: ['arrival', 'rules', 'visit'] },
  { id: 'changes', title: 'Changes & Cancellations', icon: 'swap', cats: ['changes'] },
  { id: 'profile', title: 'Profile & Directory', icon: 'user', cats: ['profile', 'directory'] },
  { id: 'services', title: 'Services & Castings', icon: 'cast', cats: ['services', 'castings'] },
  { id: 'plus', title: 'Plus & Account', icon: 'star', cats: ['plus', 'account'] },
]
const tileFor = (catId: string) => TILES.find(t => t.cats.includes(catId))

// "Hot searches" tabs — a short, curated list per tab.
const HOT: { label: string; slugs: string[] }[] = [
  { label: 'Booking', slugs: ['book-set', 'party-size', 'equipment', 'advance', 'buyout', 'reschedule'] },
  { label: 'Door codes', slugs: ['door-code', 'code-not-working', 'early', 'add-time', 'help-at-studio', 'leaving'] },
  { label: 'Payments', slugs: ['credit', 'cancel-policy', 'cards', 'receipt', 'someone-else-pays', 'promo'] },
  { label: 'Directory', slugs: ['get-listed', 'portfolio-add', 'add-listing', 'post-casting', 'message', 'apply-casting'] },
  { label: 'Account', slugs: ['create-account', 'forgot-password', 'notifications', 'what-is-plus', 'change-email', 'delete-account'] },
]

export default function SupportCenter({ signedIn, email }: { signedIn: boolean; email?: string | null }) {
  const router = useRouter()
  const pathname = usePathname() || '/support'
  const params = useSearchParams()
  const tileId = params?.get('c') || ''
  const slug = params?.get('a') || ''
  const article = slug ? ALL_ARTICLES.find(a => a.slug === slug) : undefined
  const tile = article ? tileFor(article.categoryId) : TILES.find(t => t.id === tileId)
  const [hotTab, setHotTab] = useState(0)

  const [query, setQuery] = useState('')
  const results = useMemo(() => search(query), [query])
  const topRef = useRef<HTMLDivElement | null>(null)
  const go = (qs: string) => { setQuery(''); router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }); setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30) }
  const openArticle = (s: string) => go(`a=${encodeURIComponent(s)}`)

  // ── Contact form
  const formRef = useRef<HTMLDivElement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [topic, setTopic] = useState(TOPICS[0]); const [subject, setSubject] = useState(''); const [message, setMessage] = useState('')
  const [name, setName] = useState(''); const [gEmail, setGEmail] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState<{ ref: string; email: string } | null>(null)
  const openForm = (opts?: { subject?: string; topic?: string }) => {
    setShowForm(true); setDone(null); setErr('')
    if (opts?.subject) setSubject(opts.subject.slice(0, 120))
    if (opts?.topic) setTopic(opts.topic)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    const r = await fetch('/api/support/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, subject, message, ...(signedIn ? {} : { name, email: gEmail }) }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) { setErr(d.error || `Could not send your request. Please email ${SUPPORT_EMAIL}.`); return }
    setDone({ ref: d.ref, email: d.email }); setSubject(''); setMessage('')
  }

  // ── Was this helpful?
  const [helpful, setHelpful] = useState<Record<string, 'yes' | 'no'>>({})
  useEffect(() => { setShowForm(false) }, [slug])

  const searchBox = (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', color: faint, display: 'flex' }}><Icon name="search" size={20} /></span>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search help articles"
        aria-label="Search help" style={{ ...input, borderRadius: 999, padding: '16px 22px 16px 52px', fontSize: 16 }} />
    </div>
  )
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 style={{ fontFamily: display, fontSize: 'clamp(26px, 4vw, 34px)', letterSpacing: '0.03em', color: fg, textAlign: 'center', margin: '0 0 26px', fontWeight: 400, lineHeight: 1.1 }}>{children}</h2>
  )
  const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: '6px 0', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter', fontSize: 14, lineHeight: 1.5, color: muted }
  const bySlug = (s: string) => ALL_ARTICLES.find(a => a.slug === s)
  const wrap: React.CSSProperties = { maxWidth: 880, margin: '0 auto' }
  const narrow: React.CSSProperties = { maxWidth: 720, margin: '0 auto' }

  return (
    <div ref={topRef} style={{ fontFamily: 'Inter', scrollMarginTop: 90 }}>
      {/* Hero — always centered; title only on the home view */}
      <div style={{ ...narrow, textAlign: 'center', padding: article || tile ? '0 0 30px' : '10px 0 56px' }}>
        {!article && !tile && (
          <div style={{ fontFamily: display, fontSize: 'clamp(38px, 7vw, 64px)', color: fg, letterSpacing: '0.03em', lineHeight: 1, marginBottom: 26 }}>SUPPORT CENTER</div>
        )}
        {searchBox}
      </div>

      {query.trim() ? (
        /* ── Search results */
        <div style={narrow}>
          <div style={{ fontSize: 13, color: faint, marginBottom: 6, textAlign: 'center' }}>{results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”</div>
          {results.length ? results.slice(0, 25).map(a => <ArticleRow key={a.slug} a={a} sub={tileFor(a.categoryId)?.title} onOpen={() => openArticle(a.slug)} />) : (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ fontSize: 15, color: muted, marginBottom: 16 }}>No articles match that. Try other words, or ask us directly.</div>
              <button type="button" onClick={() => openForm({ subject: query })} style={btn}>CONTACT SUPPORT</button>
            </div>
          )}
        </div>
      ) : article ? (
        /* ── Article */
        <div style={narrow}>
          <Crumbs go={go} items={[{ label: 'Support Center', to: '' }, { label: tile?.title ?? article.categoryTitle, to: `c=${tile?.id ?? ''}` }]} />
          <h1 style={{ fontFamily: display, fontSize: 'clamp(28px, 4.5vw, 40px)', letterSpacing: '0.02em', lineHeight: 1.05, color: fg, margin: '0 0 18px', fontWeight: 400 }}>{article.q.toUpperCase()}</h1>
          {article.a && <p style={{ fontSize: 16, lineHeight: 1.7, color: muted, margin: '0 0 22px' }}><Rich text={article.a} /></p>}
          {article.steps && (
            <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {article.steps.map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 14, border: line, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: fg, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 15, lineHeight: 1.65, color: fg, paddingTop: 3 }}><Rich text={s} /></span>
                </li>
              ))}
            </ol>
          )}
          {article.notes && (
            <div style={{ borderLeft: `3px solid ${gold}`, borderRadius: 4, padding: '12px 18px', background: surface, marginBottom: 26 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: gold, marginBottom: 8 }}>GOOD TO KNOW</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {article.notes.map((n, i) => <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: muted }}><Rich text={n} /></li>)}
              </ul>
            </div>
          )}
          <div style={{ textAlign: 'center', padding: '22px 0', borderTop: line, marginBottom: 30 }}>
            {helpful[article.slug] === 'yes' ? <span style={{ fontSize: 14, color: muted }}>Thanks — glad that helped.</span>
              : helpful[article.slug] === 'no' ? <span style={{ fontSize: 14, color: muted }}>Sorry about that — send us the details below.</span>
              : <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, color: fg }}>Was this helpful?</span>
                  <button type="button" onClick={() => setHelpful(h => ({ ...h, [article.slug]: 'yes' }))} style={{ ...ghost, padding: '8px 18px' }}>YES</button>
                  <button type="button" onClick={() => { setHelpful(h => ({ ...h, [article.slug]: 'no' })); openForm({ subject: article.q, topic: TOPIC_FOR[article.categoryId] }) }} style={{ ...ghost, padding: '8px 18px' }}>NO</button>
                </div>}
          </div>
        </div>
      ) : tile ? (
        /* ── Topic page */
        <div style={narrow}>
          <Crumbs go={go} items={[{ label: 'Support Center', to: '' }, { label: tile.title }]} />
          <H>{tile.title.toUpperCase()}</H>
          {tile.cats.map(cid => {
            const c = CATEGORIES.find(x => x.id === cid)
            if (!c) return null
            return (
              <div key={cid} style={{ marginBottom: 34 }}>
                {tile.cats.length > 1 && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: faint, marginBottom: 2 }}>{c.title.toUpperCase()}</div>}
                {c.articles.map(a => <ArticleRow key={a.slug} a={a} onOpen={() => openArticle(a.slug)} />)}
              </div>
            )
          })}
        </div>
      ) : (
        /* ── Home */
        <>
          <div style={{ ...wrap, marginBottom: 72 }}>
            <H>HOT SEARCHES</H>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 22, flexWrap: 'wrap', marginBottom: 22 }}>
              {HOT.map((h, i) => (
                <button key={h.label} type="button" onClick={() => setHotTab(i)}
                  style={{ background: 'none', border: 'none', borderBottom: `2px solid ${i === hotTab ? fg : 'transparent'}`, padding: '4px 2px 8px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 14, fontWeight: i === hotTab ? 600 : 400, color: i === hotTab ? fg : muted }}>{h.label}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', columnGap: 48, maxWidth: 760, margin: '0 auto' }}>
              {HOT[hotTab].slugs.map(s => bySlug(s)).filter(Boolean).map(a => (
                <button key={a!.slug} type="button" onClick={() => openArticle(a!.slug)} className="sc-link" style={linkBtn}>{a!.q}</button>
              ))}
            </div>
          </div>

          <div style={{ ...wrap, marginBottom: 72 }}>
            <H>GET HELP BY TOPIC</H>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
              {TILES.map(t => (
                <button key={t.id} type="button" onClick={() => go(`c=${t.id}`)} className="sc-tile"
                  style={{ background: surface, border: line, borderRadius: 10, padding: '28px 14px 22px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, fontFamily: 'Inter' }}>
                  <span style={{ color: gold }}><Icon name={t.icon} size={30} /></span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: fg, textAlign: 'center' }}>{t.title}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <style>{`.sc-tile{transition:border-color .15s}.sc-tile:hover{border-color:${gold}}.sc-link:hover{color:${fg}!important;text-decoration:underline}`}</style>

      {/* Contact */}
      <div ref={formRef} style={{ ...narrow, textAlign: showForm && !done ? 'left' : 'center', padding: '40px 0 10px', borderTop: line, scrollMarginTop: 90 }}>
        <div style={{ fontFamily: display, fontSize: 26, letterSpacing: '0.03em', color: fg, marginBottom: 8, textAlign: 'center' }}>STILL NEED HELP?</div>
        <div style={{ fontSize: 14, color: muted, lineHeight: 1.6, marginBottom: 18, textAlign: 'center' }}>
          Send us a request and we’ll reply by email, usually within a few hours. At the studio right now? Tap <strong style={{ color: fg, whiteSpace: 'nowrap' }}>GET THE TEAM</strong> on the set tablet.
        </div>

        {done ? (
          <div style={{ border: '1px solid rgba(60,200,120,0.35)', background: 'rgba(60,200,120,0.08)', borderRadius: 8, padding: '14px 16px', fontSize: 14, lineHeight: 1.6, color: fg }}>
            <strong>Request #{done.ref} received.</strong> We’ll reply to <strong>{done.email}</strong> — you can reply to that email to keep the conversation going.
            <div style={{ marginTop: 10 }}><button type="button" onClick={() => { setDone(null); setShowForm(true) }} style={ghost}>SEND ANOTHER</button></div>
          </div>
        ) : !showForm ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
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
              <button type="button" onClick={() => setShowForm(false)} style={ghost}>CANCEL</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

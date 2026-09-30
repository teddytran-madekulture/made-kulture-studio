'use client'
// Website Editor → Marketing Tools: announcement bar, promotional pop-up and
// mobile info bar (lib/marketing-tools.ts). One save writes all three.
// Times are entered in the browser's local time (Houston) and stored as UTC.
import { useEffect, useState } from 'react'
import { MARKETING_DEFAULTS, THEMES, type MarketingTools, type Theme } from '@/lib/marketing-tools'
import { PopupCard } from '@/components/MarketingTools'
import { shrinkImage } from '@/lib/shrink-image'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#d4a843' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '9px 11px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }
const opt: React.CSSProperties = { background: '#141416', color: '#fff' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 20, marginBottom: 20 }
const h2: React.CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.03em', margin: 0 }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.5 }
const lbl: React.CSSProperties = { ...small, display: 'block', marginBottom: 4 }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }

const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

function status(item: { enabled: boolean; startAt: string | null; endAt: string | null }, hasContent: boolean): [string, string] {
  if (!item.enabled) return ['OFF', C.dim]
  if (!hasContent) return ['ON — but empty, nothing shows', '#fbbf24']
  const now = Date.now()
  if (item.startAt && Date.parse(item.startAt) > now) return [`SCHEDULED — starts ${fmt(item.startAt)}`, '#60a5fa']
  if (item.endAt && Date.parse(item.endAt) <= now) return [`ENDED ${fmt(item.endAt)}`, C.dim]
  return [item.endAt ? `LIVE — until ${fmt(item.endAt)}` : 'LIVE', '#4ade80']
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{
      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
      background: on ? C.accent : 'rgba(255,255,255,0.18)', transition: 'background 0.15s',
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  )
}

function Header({ title, desc, on, onToggle, st }: { title: string; desc: string; on: boolean; onToggle: (v: boolean) => void; st: [string, string] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
      <div style={{ flex: 1 }}>
        <h2 style={h2}>{title}</h2>
        <div style={{ ...small, marginTop: 4 }}>{desc}</div>
        <div style={{ ...small, marginTop: 6, color: st[1], fontWeight: 600, letterSpacing: '0.05em' }}>{st[0]}</div>
      </div>
      <Toggle on={on} onChange={onToggle} />
    </div>
  )
}

function Schedule({ startAt, endAt, onChange }: { startAt: string | null; endAt: string | null; onChange: (s: string | null, e: string | null) => void }) {
  return (
    <div style={{ ...grid2, marginTop: 12 }}>
      <label><span style={lbl}>Start showing (optional)</span><input type="datetime-local" value={toLocal(startAt)} onChange={e => onChange(fromLocal(e.target.value), endAt)} style={inp} /></label>
      <label><span style={lbl}>Stop showing (optional)</span><input type="datetime-local" value={toLocal(endAt)} onChange={e => onChange(startAt, fromLocal(e.target.value))} style={inp} /></label>
    </div>
  )
}

const LAUNCH: Pick<MarketingTools, 'announcement' | 'popup' | 'mobileBar'> = {
  announcement: { enabled: true, text: 'Our new booking site is live! Create a free account to book at member rates.', linkLabel: 'Sign up', linkUrl: '/signup', theme: 'gold', startAt: null, endAt: null },
  popup: {
    enabled: true, eyebrow: 'NOW LIVE', headline: 'WELCOME TO\nTHE NEW\nMADE KULTURE',
    body: "Our new site is live. If anything looks off, email info@madekulture.com and we'll fix it fast.",
    hl1Title: 'FREE ACCOUNT', hl1Text: "Member rates, the same prices you've always paid.",
    hl2Title: 'PLUS · $99/YR', hl2Text: 'Book on short notice. Cancel for full credit up to your start.',
    buttonLabel: 'Create free account', buttonUrl: '/signup', link2Label: 'See Plus', link2Url: '/plus',
    imageUrl: '', focal: 'center',
    delaySec: 3, frequency: 'once', pages: 'all', startAt: null, endAt: null,
  },
  mobileBar: { enabled: true, text: 'Free account = member rates', buttonLabel: 'Sign up', buttonUrl: '/signup', startAt: null, endAt: null },
}

export default function MarketingToolsPage() {
  const [t, setT] = useState<MarketingTools | null>(null)
  const [saved, setSaved] = useState<string>('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [unauth, setUnauth] = useState(false)

  useEffect(() => {
    fetch('/api/admin/marketing-tools', { cache: 'no-store' }).then(async r => {
      if (r.status === 401) { setUnauth(true); return }
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Could not load.'}`); return }
      setT(d.tools); setSaved(JSON.stringify(d.tools))
    }).catch(() => setMsg('⚠️ Could not load — check your connection.'))
  }, [])

  const save = async () => {
    if (!t) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/marketing-tools', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not saved.'}`); return }
      setT(d.tools); setSaved(JSON.stringify(d.tools))
      setMsg('Saved. The live site picks it up within about a minute.')
    } catch { setMsg('⚠️ Not saved — check your connection.') }
    finally { setBusy(false) }
  }

  const uploadPhoto = async (f?: File) => {
    if (!f || !t) return
    setPhotoBusy(true); setMsg(null)
    try {
      const blob = await shrinkImage(f, 1800, 0.85)   // 4.5 MB function ceiling
      const fd = new FormData(); fd.append('file', new File([blob], 'popup.jpg', { type: 'image/jpeg' }))
      const r = await fetch('/api/admin/marketing-tools', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Upload failed.'}`); return }
      setT(cur => cur ? { ...cur, popup: { ...cur.popup, imageUrl: d.url } } : cur)
      setMsg('Photo added — SAVE to put it live.')
    } catch { setMsg('⚠️ Could not read that photo.') }
    finally { setPhotoBusy(false) }
  }

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>
  if (!t) return <div style={{ padding: 40, fontFamily: 'Inter', color: C.dim }}>{msg ?? 'Loading…'}</div>

  const dirty = JSON.stringify(t) !== saved
  const a = t.announcement, p = t.popup, m = t.mobileBar
  const setA = (x: Partial<typeof a>) => setT({ ...t, announcement: { ...a, ...x } })
  const setP = (x: Partial<typeof p>) => setT({ ...t, popup: { ...p, ...x } })
  const setM = (x: Partial<typeof m>) => setT({ ...t, mobileBar: { ...m, ...x } })
  const th = THEMES[a.theme] ?? THEMES.gold

  return (
    <div style={{ padding: '32px 24px 0', maxWidth: 860, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>MARKETING TOOLS</h1>
      <p style={{ ...small, margin: '0 0 16px' }}>
        Tell visitors what&rsquo;s going on: launches, promos, holiday hours, notices. None of these show on the booking/checkout pages or anywhere in the admin.
      </p>
      <button onClick={() => setT({ ...t, ...LAUNCH })} style={{ ...small, background: 'transparent', border: `1px solid ${C.line}`, color: C.accent, padding: '8px 12px', cursor: 'pointer', marginBottom: 20 }}>
        Fill all three with the launch / member-rates message
      </button>

      {/* ── Announcement bar ── */}
      <div style={card}>
        <Header title="ANNOUNCEMENT BAR" desc="A strip across the very top of every page, desktop and phone. Visitors can close it for their visit."
          on={a.enabled} onToggle={v => setA({ enabled: v })} st={status(a, !!a.text)} />
        <label><span style={lbl}>Message</span><input value={a.text} maxLength={200} onChange={e => setA({ text: e.target.value })} placeholder="e.g. Closed Thanksgiving Day. Open 9–10 the rest of the week." style={inp} /></label>
        <div style={{ ...grid2, marginTop: 12 }}>
          <label><span style={lbl}>Link text (optional)</span><input value={a.linkLabel} maxLength={40} onChange={e => setA({ linkLabel: e.target.value })} placeholder="Sign up" style={inp} /></label>
          <label><span style={lbl}>Link goes to</span><input value={a.linkUrl} onChange={e => setA({ linkUrl: e.target.value })} placeholder="/signup or https://…" style={inp} /></label>
          <label><span style={lbl}>Color</span>
            <select value={a.theme} onChange={e => setA({ theme: e.target.value as Theme })} style={inp}>
              {(['gold', 'black', 'red', 'white'] as Theme[]).map(k => <option key={k} value={k} style={opt}>{k[0].toUpperCase() + k.slice(1)}</option>)}
            </select>
          </label>
        </div>
        <Schedule startAt={a.startAt} endAt={a.endAt} onChange={(s, e) => setA({ startAt: s, endAt: e })} />
        {a.text && (
          <div style={{ marginTop: 14 }}>
            <div style={lbl}>Preview</div>
            <div style={{ background: th.bg, color: th.fg, padding: '9px 16px', textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500 }}>
              {a.text}{a.linkLabel && <> <span style={{ color: th.link, fontWeight: 700, textDecoration: 'underline' }}>{a.linkLabel} →</span></>}
            </div>
          </div>
        )}
      </div>

      {/* ── Pop-up ── */}
      <div style={card}>
        <Header title="PROMOTIONAL POP-UP" desc="A box that opens over the page a few seconds after someone arrives."
          on={p.enabled} onToggle={v => setP({ enabled: v })} st={status(p, !!(p.headline || p.body))} />
        {/* Photo — "The Cover": fills the pop-up, words sit over its lower part */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 96, height: 72, background: p.imageUrl ? `url("${p.imageUrl}") center/cover` : '#0b0b0d', border: `1px solid ${C.line}`, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={lbl}>Photo (optional) — drop in any image. Portrait or landscape both work; the text sits over the bottom.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ ...small, color: C.accent, border: `1px solid ${C.line}`, padding: '7px 12px', cursor: 'pointer' }}>
                {photoBusy ? 'Uploading…' : p.imageUrl ? 'Replace photo' : 'Upload photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={photoBusy} onChange={e => uploadPhoto(e.target.files?.[0])} />
              </label>
              {p.imageUrl && <button onClick={() => setP({ imageUrl: '' })} style={{ ...small, background: 'none', border: `1px solid ${C.line}`, color: '#f87171', padding: '7px 12px', cursor: 'pointer' }}>Remove</button>}
              {p.imageUrl && (
                <select value={p.focal} onChange={e => setP({ focal: e.target.value as any })} style={{ ...inp, width: 'auto' }}>
                  <option value="top" style={opt}>Keep the top in view</option>
                  <option value="center" style={opt}>Keep the middle in view</option>
                  <option value="bottom" style={opt}>Keep the bottom in view</option>
                </select>
              )}
            </div>
          </div>
        </div>
        <div style={grid2}>
          <label><span style={lbl}>Small line above the headline (optional)</span><input value={p.eyebrow} maxLength={40} onChange={e => setP({ eyebrow: e.target.value })} placeholder="NOW LIVE" style={inp} /></label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>Headline — press Enter to break it into lines</span><textarea value={p.headline} maxLength={80} rows={3} onChange={e => setP({ headline: e.target.value })} placeholder={'WELCOME TO\nTHE NEW\nMADE KULTURE'} style={{ ...inp, resize: 'vertical' }} /></label>
        <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>Message</span>
          <textarea value={p.body} maxLength={600} rows={4} onChange={e => setP({ body: e.target.value })} style={{ ...inp, resize: 'vertical' }} />
        </label>
        <div style={{ ...grid2, marginTop: 12 }}>
          <label><span style={lbl}>Note 1 title (optional)</span><input value={p.hl1Title} maxLength={40} onChange={e => setP({ hl1Title: e.target.value })} placeholder="FREE ACCOUNT" style={inp} /></label>
          <label><span style={lbl}>Note 1 text</span><input value={p.hl1Text} maxLength={140} onChange={e => setP({ hl1Text: e.target.value })} style={inp} /></label>
          <label><span style={lbl}>Note 2 title (optional, shown in gold)</span><input value={p.hl2Title} maxLength={40} onChange={e => setP({ hl2Title: e.target.value })} placeholder="PLUS · $99/YR" style={inp} /></label>
          <label><span style={lbl}>Note 2 text</span><input value={p.hl2Text} maxLength={140} onChange={e => setP({ hl2Text: e.target.value })} style={inp} /></label>
        </div>
        <div style={{ ...grid2, marginTop: 12 }}>
          <label><span style={lbl}>Second link text (optional)</span><input value={p.link2Label} maxLength={40} onChange={e => setP({ link2Label: e.target.value })} placeholder="See Plus" style={inp} /></label>
          <label><span style={lbl}>Second link goes to</span><input value={p.link2Url} onChange={e => setP({ link2Url: e.target.value })} placeholder="/plus" style={inp} /></label>
        </div>
        <div style={{ ...grid2, marginTop: 12 }}>
          <label><span style={lbl}>Button text (optional)</span><input value={p.buttonLabel} maxLength={40} onChange={e => setP({ buttonLabel: e.target.value })} placeholder="Create free account" style={inp} /></label>
          <label><span style={lbl}>Button goes to</span><input value={p.buttonUrl} onChange={e => setP({ buttonUrl: e.target.value })} placeholder="/signup or https://…" style={inp} /></label>
          <label><span style={lbl}>Show it</span>
            <select value={p.frequency} onChange={e => setP({ frequency: e.target.value as any })} style={inp}>
              <option value="once" style={opt}>Once per visitor</option>
              <option value="session" style={opt}>Once per visit</option>
              <option value="always" style={opt}>Every page load</option>
            </select>
          </label>
          <label><span style={lbl}>On</span>
            <select value={p.pages} onChange={e => setP({ pages: e.target.value as any })} style={inp}>
              <option value="all" style={opt}>Any page they land on</option>
              <option value="home" style={opt}>Home page only</option>
            </select>
          </label>
          <label><span style={lbl}>Delay (seconds)</span><input type="number" min={0} max={30} value={p.delaySec} onChange={e => setP({ delaySec: Number(e.target.value) })} style={inp} /></label>
        </div>
        <Schedule startAt={p.startAt} endAt={p.endAt} onChange={(s, e) => setP({ startAt: s, endAt: e })} />
        <p style={{ ...small, marginTop: 10, marginBottom: 0 }}>&ldquo;Once per visitor&rdquo; resets whenever you save changes, so an edited pop-up is seen again.</p>
        {(p.headline || p.body) && (
          <div style={{ marginTop: 14 }}>
            <div style={lbl}>Preview</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ width: 'min(560px, 100%)' }}><PopupCard p={p} /></div>
              <div style={{ width: 300 }}><div style={{ ...small, marginBottom: 4 }}>On a phone</div><PopupCard p={p} narrow /></div>
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile info bar ── */}
      <div style={card}>
        <Header title="MOBILE INFO BAR" desc="A slim bar pinned to the bottom of the screen on phones only. Keep it short."
          on={m.enabled} onToggle={v => setM({ enabled: v })} st={status(m, !!m.text)} />
        <div style={grid2}>
          <label><span style={lbl}>Text</span><input value={m.text} maxLength={80} onChange={e => setM({ text: e.target.value })} placeholder="Free account = member rates" style={inp} /></label>
          <label><span style={lbl}>Button text (optional)</span><input value={m.buttonLabel} maxLength={24} onChange={e => setM({ buttonLabel: e.target.value })} placeholder="Sign up" style={inp} /></label>
          <label><span style={lbl}>Button goes to</span><input value={m.buttonUrl} onChange={e => setM({ buttonUrl: e.target.value })} placeholder="/signup, tel:+18324081631…" style={inp} /></label>
        </div>
        <Schedule startAt={m.startAt} endAt={m.endAt} onChange={(s, e) => setM({ startAt: s, endAt: e })} />
        {m.text && (
          <div style={{ marginTop: 14, maxWidth: 380 }}>
            <div style={lbl}>Preview (phone)</div>
            <div style={{ background: '#080808', borderTop: '1px solid rgba(212,168,67,0.4)', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
              <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 13 }}>{m.text}</span>
              {m.buttonLabel && <span style={{ background: C.accent, color: '#080808', padding: '8px 11px', fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{m.buttonLabel}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Sticky save */}
      <div style={{ position: 'sticky', bottom: 0, margin: '0 -24px', padding: '12px 24px', background: 'rgba(8,8,8,0.92)', borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, zIndex: 50 }}>
        {msg?.startsWith('⚠️') ? <span style={{ ...small, color: '#fbbf24' }}>{msg}</span>
          : dirty ? <span style={small}>Unsaved changes</span>
          : msg ? <span style={{ ...small, color: '#4ade80' }}>{msg}</span> : null}
        <button onClick={save} disabled={busy || !dirty} style={{
          background: C.accent, color: '#080808', border: 'none', padding: '11px 22px', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.14em', cursor: busy || !dirty ? 'default' : 'pointer', opacity: busy || !dirty ? 0.5 : 1,
        }}>{busy ? 'SAVING…' : 'SAVE'}</button>
      </div>
    </div>
  )
}

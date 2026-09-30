'use client'
// Website Editor → Featured Editorial: the customer shoot shown in the home
// page's "Built for the Obsessed" photo spot (lib/featured-editorial.ts).
// Photos upload straight away (shrunk in the browser first — 4.5 MB function
// ceiling) but nothing changes on the live site until SAVE.
import { useEffect, useRef, useState } from 'react'
import { EDITORIAL_DEFAULTS, EDITORIAL_MAX_CREDITS, EDITORIAL_MAX_PHOTOS, cleanHandle, type FeaturedEditorial } from '@/lib/featured-editorial'
import { shrinkImage } from '@/lib/shrink-image'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#d4a843' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '9px 11px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 20, marginBottom: 20 }
const h2: React.CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.03em', margin: '0 0 12px' }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.5 }
const lbl: React.CSSProperties = { ...small, display: 'block', marginBottom: 4 }
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }
const btn: React.CSSProperties = { ...small, background: 'transparent', border: `1px solid ${C.line}`, color: C.text, padding: '6px 10px', cursor: 'pointer' }

// Pull "Role @handle" lines out of an Instagram caption so credits can be
// pasted rather than typed. Anything without an @handle is ignored.
function parseCaptionCredits(text: string): { role: string; handle: string }[] {
  const out: { role: string; handle: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.*?)@([A-Za-z0-9._]+)/)
    if (!m) continue
    const role = m[1].replace(/\b(by|:)\s*$/i, '').replace(/[:\-–—·]+\s*$/, '').trim()
    const handle = cleanHandle(m[2])
    if (handle.toLowerCase() === 'madekulture') continue   // that's us — the set goes in "Shot on"
    out.push({ role, handle })
  }
  return out.slice(0, EDITORIAL_MAX_CREDITS)
}

export default function FeaturedEditorialPage() {
  const [e, setE] = useState<FeaturedEditorial | null>(null)
  const [saved, setSaved] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [unauth, setUnauth] = useState(false)
  const [paste, setPaste] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/featured-editorial', { cache: 'no-store' }).then(async r => {
      if (r.status === 401) { setUnauth(true); return }
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Could not load.'}`); return }
      setE(d.editorial); setSaved(JSON.stringify(d.editorial))
    }).catch(() => setMsg('⚠️ Could not load — check your connection.'))
  }, [])

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>
  if (!e) return <div style={{ padding: 40, fontFamily: 'Inter', color: C.dim }}>{msg ?? 'Loading…'}</div>

  const set = (x: Partial<FeaturedEditorial>) => setE({ ...e, ...x })
  const dirty = JSON.stringify(e) !== saved

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    const room = EDITORIAL_MAX_PHOTOS - e.photos.length
    const list = Array.from(files).slice(0, room)
    if (list.length < files.length) setMsg(`Only ${EDITORIAL_MAX_PHOTOS} photos per editorial — the extras were skipped.`)
    setUploading(list.length)
    const added: string[] = []
    for (const f of list) {
      try {
        const blob = await shrinkImage(f, 2000, 0.86)
        const fd = new FormData(); fd.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
        const r = await fetch('/api/admin/featured-editorial', { method: 'POST', body: fd })
        const d = await r.json()
        if (!r.ok) { setMsg(`⚠️ ${f.name}: ${d.error || 'upload failed'}`); continue }
        added.push(d.url)
      } catch { setMsg(`⚠️ ${f.name}: could not read that photo.`) }
      finally { setUploading(n => n - 1) }
    }
    // Functional update — the uploads can finish after other edits.
    setE(cur => cur ? { ...cur, photos: [...cur.photos, ...added].slice(0, EDITORIAL_MAX_PHOTOS) } : cur)
    if (fileRef.current) fileRef.current.value = ''
  }

  const move = (k: number, d: -1 | 1) => {
    const p = [...e.photos]; const j = k + d
    if (j < 0 || j >= p.length) return
    ;[p[k], p[j]] = [p[j], p[k]]; set({ photos: p })
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/featured-editorial', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not saved.'}`); return }
      setE(d.editorial); setSaved(JSON.stringify(d.editorial))
      setMsg(d.editorial.enabled && d.editorial.photos.length ? 'Saved — live on the home page now.' : 'Saved. It is switched off (or has no photos), so the home page shows the plain studio photo.')
    } catch { setMsg('⚠️ Not saved — check your connection.') }
    finally { setBusy(false) }
  }

  const status: [string, string] = !e.enabled ? ['OFF — the home page shows the plain studio photo', C.dim]
    : e.photos.length === 0 ? ['ON — but no photos yet, nothing shows', '#fbbf24']
    : ['LIVE on the home page', '#4ade80']

  return (
    <div style={{ padding: '32px 24px 120px', maxWidth: 860, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>FEATURED EDITORIAL</h1>
      <p style={{ ...small, margin: '0 0 20px' }}>
        A customer&rsquo;s shoot, shown in the big photo spot beside &ldquo;Built for the Obsessed&rdquo; on the home page. Photos fade one to the next,
        uncropped, with the title, the photographer and a CREDITS button. Only feature work the creators have cleared for us, and credit everyone.
      </p>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...h2, margin: 0 }}>SHOW ON HOME PAGE</div>
          <div style={{ ...small, marginTop: 4, color: status[1], fontWeight: 600 }}>{status[0]}</div>
        </div>
        <button onClick={() => set({ enabled: !e.enabled })} aria-pressed={e.enabled} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: e.enabled ? C.accent : 'rgba(255,255,255,0.18)' }}>
          <span style={{ position: 'absolute', top: 3, left: e.enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>

      {/* ── Photos ── */}
      <div style={card}>
        <h2 style={h2}>PHOTOS</h2>
        <p style={{ ...small, marginTop: -6 }}>Portrait (3:4) photos look best — that&rsquo;s the frame, so they show uncropped. First photo shows first. Up to {EDITORIAL_MAX_PHOTOS}.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginTop: 12 }}>
          {e.photos.map((src, k) => (
            <div key={src} style={{ position: 'relative', border: `1px solid ${C.line}` }}>
              <img src={src} alt="" style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', top: 4, left: 6, ...small, color: '#fff', textShadow: '0 1px 3px #000' }}>{k + 1}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0b0b0d' }}>
                <button onClick={() => move(k, -1)} disabled={k === 0} style={{ ...btn, border: 'none', opacity: k === 0 ? 0.3 : 1 }} aria-label="Move earlier">←</button>
                <button onClick={() => set({ photos: e.photos.filter((_, j) => j !== k) })} style={{ ...btn, border: 'none', color: '#f87171' }}>Remove</button>
                <button onClick={() => move(k, 1)} disabled={k === e.photos.length - 1} style={{ ...btn, border: 'none', opacity: k === e.photos.length - 1 ? 0.3 : 1 }} aria-label="Move later">→</button>
              </div>
            </div>
          ))}
          {e.photos.length < EDITORIAL_MAX_PHOTOS && (
            <button onClick={() => fileRef.current?.click()} disabled={uploading > 0}
              style={{ ...btn, aspectRatio: '3 / 4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, borderStyle: 'dashed', color: C.accent }}>
              <span style={{ fontSize: 26 }}>+</span>{uploading > 0 ? `Uploading ${uploading}…` : 'Add photos'}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={ev => upload(ev.target.files)} />
      </div>

      {/* ── Details ── */}
      <div style={card}>
        <h2 style={h2}>DETAILS</h2>
        <div style={grid2}>
          <label><span style={lbl}>Title</span><input value={e.title} maxLength={80} onChange={ev => set({ title: ev.target.value })} placeholder="SAPEUR EN ROSE" style={inp} /></label>
          <label><span style={lbl}>Subtitle (optional)</span><input value={e.subtitle} maxLength={80} onChange={ev => set({ subtitle: ev.target.value })} placeholder="Dark Grandiose" style={inp} /></label>
          <label><span style={lbl}>Shot on (optional)</span><input value={e.setName} maxLength={40} onChange={ev => set({ setName: ev.target.value })} placeholder="Set D" style={inp} /></label>
          <label><span style={lbl}>Seconds per photo</span><input type="number" min={3} max={15} value={e.intervalSec} onChange={ev => set({ intervalSec: Number(ev.target.value) })} style={inp} /></label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>Instagram post link</span><input value={e.postUrl} onChange={ev => set({ postUrl: ev.target.value })} placeholder="https://www.instagram.com/p/…" style={inp} /></label>
      </div>

      {/* ── Credits ── */}
      <div style={card}>
        <h2 style={h2}>CREDITS</h2>
        <p style={{ ...small, marginTop: -6 }}>The first line is the byline under the title (usually the photographer). Handles link to their Instagram.</p>
        <details style={{ margin: '10px 0 14px' }}>
          <summary style={{ ...small, color: C.accent, cursor: 'pointer' }}>Paste the Instagram caption to fill these in</summary>
          <textarea value={paste} onChange={ev => setPaste(ev.target.value)} rows={6} placeholder={'Photography & Direction by @someone\nTalent @someone_else\nStyling @…'} style={{ ...inp, marginTop: 8, resize: 'vertical' }} />
          <button onClick={() => { const c = parseCaptionCredits(paste); if (c.length) { set({ credits: c }); setPaste('') } else setMsg('No @handles found in that text.') }} style={{ ...btn, marginTop: 8, color: C.accent }}>Fill credits from caption</button>
        </details>
        {e.credits.map((c, k) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
            <input value={c.role} maxLength={40} placeholder="Role (e.g. Photography)" onChange={ev => set({ credits: e.credits.map((x, j) => j === k ? { ...x, role: ev.target.value } : x) })} style={inp} />
            <input value={c.handle ? `@${c.handle}` : ''} placeholder="@handle" onChange={ev => set({ credits: e.credits.map((x, j) => j === k ? { ...x, handle: cleanHandle(ev.target.value) } : x) })} style={inp} />
            <button onClick={() => set({ credits: e.credits.filter((_, j) => j !== k) })} style={{ ...btn, color: '#f87171' }} aria-label="Remove credit">×</button>
          </div>
        ))}
        {e.credits.length < EDITORIAL_MAX_CREDITS && (
          <button onClick={() => set({ credits: [...e.credits, { role: '', handle: '' }] })} style={{ ...btn, color: C.accent }}>+ Add credit</button>
        )}
      </div>

      {/* ── Save bar ── */}
      <div style={{ position: 'sticky', bottom: 0, background: 'rgba(8,8,8,0.95)', borderTop: `1px solid ${C.line}`, padding: '14px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={save} disabled={busy || uploading > 0 || !dirty} style={{ background: dirty ? C.accent : 'rgba(255,255,255,0.12)', color: '#080808', border: 'none', padding: '11px 22px', fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: dirty ? 'pointer' : 'default' }}>
          {busy ? 'SAVING…' : dirty ? 'SAVE' : 'SAVED'}
        </button>
        <a href="/" target="_blank" rel="noreferrer" style={{ ...small, color: C.text }}>View home page ↗</a>
        {msg && <span style={{ ...small, color: msg.startsWith('⚠️') ? '#fbbf24' : '#4ade80' }}>{msg}</span>}
      </div>
    </div>
  )
}

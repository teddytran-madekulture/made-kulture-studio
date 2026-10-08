'use client'
// Website Editor → Featured Editorial: the customer shoot shown in the home
// page's "Built for the Obsessed" photo spot (lib/featured-editorial.ts).
// Photos upload straight away (shrunk in the browser first — 4.5 MB function
// ceiling) but nothing changes on the live site until SAVE.
import { useEffect, useRef, useState } from 'react'
import { EDITORIAL_DEFAULTS, EDITORIAL_MAX_CREDITS, EDITORIAL_MAX_ITEMS, EDITORIAL_MAX_PHOTOS, cleanHandle, centralToday, editorialStatus, type EditorialsConfig, type FeaturedEditorial } from '@/lib/featured-editorial'
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
  const [cfg, setCfg] = useState<EditorialsConfig | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [saved, setSaved] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [unauth, setUnauth] = useState(false)
  const [paste, setPaste] = useState('')
  const [sets, setSets] = useState<{ slug: string; name: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/featured-editorial', { cache: 'no-store' }).then(async r => {
      if (r.status === 401) { setUnauth(true); return }
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Could not load.'}`); return }
      setCfg(d.config); setSaved(JSON.stringify(d.config)); setSel(d.config.items[0]?.id ?? null)
    }).catch(() => setMsg('⚠️ Could not load — check your connection.'))
  }, [])

  // Set list for "Shot on" — the slug drives the hero banner's BOOK button.
  useEffect(() => {
    fetch('/api/sets').then(r => r.json()).then(d => setSets((d.sets || []).filter((x: any) => x.slug && x.name).map((x: any) => ({ slug: x.slug, name: x.name })))).catch(() => {})
  }, [])

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>
  if (!cfg) return <div style={{ padding: 40, fontFamily: 'Inter', color: C.dim }}>{msg ?? 'Loading…'}</div>

  const today = centralToday()
  const e: FeaturedEditorial | null = cfg.items.find(x => x.id === sel) ?? cfg.items[0] ?? null
  const eid = e?.id
  // Edits apply to the SELECTED editorial only. Pinning one unpins the rest —
  // only one can hold the spot.
  const set = (x: Partial<FeaturedEditorial>) => setCfg(cur => cur ? {
    ...cur,
    items: cur.items.map(it => it.id === eid ? { ...it, ...x } : (x.pinned ? { ...it, pinned: false } : it)),
  } : cur)
  const dirty = JSON.stringify(cfg) !== saved
  const addEditorial = () => {
    const id = `e${Date.now().toString(36)}`
    setCfg({ ...cfg, items: [...cfg.items, { ...EDITORIAL_DEFAULTS, id, credits: [], photos: [] }] })
    setSel(id)
  }
  const removeEditorial = () => {
    if (!e || !confirm(`Remove "${e.title || 'Untitled'}" from the list? (It is gone once you SAVE.)`)) return
    const items = cfg.items.filter(x => x.id !== e.id)
    setCfg({ ...cfg, items }); setSel(items[0]?.id ?? null)
  }
  const moveEditorial = (d: -1 | 1) => {
    const k = cfg.items.findIndex(x => x.id === eid), j = k + d
    if (k < 0 || j < 0 || j >= cfg.items.length) return
    const items = [...cfg.items]; [items[k], items[j]] = [items[j], items[k]]
    setCfg({ ...cfg, items })
  }
  const STATUS_LABEL: Record<string, [string, string]> = {
    live: ['LIVE', '#4ade80'], off: ['OFF', C.dim], incomplete: ['NO PHOTOS', '#fbbf24'],
    scheduled: ['SCHEDULED', '#60a5fa'], ended: ['ENDED', C.dim],
  }
  const liveCount = cfg.items.filter(x => editorialStatus(x, today) === 'live').length
  const pinnedLive = cfg.items.find(x => x.pinned && editorialStatus(x, today) === 'live')

  const upload = async (files: FileList | null) => {
    if (!files?.length || !e) return
    const target = e.id
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
    setCfg(cur => cur ? { ...cur, items: cur.items.map(it => it.id === target ? { ...it, photos: [...it.photos, ...added].slice(0, EDITORIAL_MAX_PHOTOS) } : it) } : cur)
    if (fileRef.current) fileRef.current.value = ''
  }

  const move = (k: number, d: -1 | 1) => {
    if (!e) return
    const p = [...e.photos]; const j = k + d
    if (j < 0 || j >= p.length) return
    ;[p[k], p[j]] = [p[j], p[k]]; set({ photos: p })
  }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/featured-editorial', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not saved.'}`); return }
      setCfg(d.config); setSaved(JSON.stringify(d.config))
      const n = (d.config.items as FeaturedEditorial[]).filter(x => editorialStatus(x, centralToday()) === 'live').length
      setMsg(n ? `Saved — ${n} editorial${n === 1 ? '' : 's'} in rotation.` : 'Saved. Nothing is live, so the home page shows the plain studio photo.')
    } catch { setMsg('⚠️ Not saved — check your connection.') }
    finally { setBusy(false) }
  }

  const st = e ? editorialStatus(e, today) : 'off'
  const status: [string, string] = !e ? ['', C.dim]
    : st === 'off' ? ['OFF — not in rotation', C.dim]
    : st === 'incomplete' ? ['ON — but no photos yet, so it is skipped', '#fbbf24']
    : st === 'scheduled' ? [`SCHEDULED — starts ${e.startDate}`, '#60a5fa']
    : st === 'ended' ? [`ENDED ${e.endDate}`, C.dim]
    : pinnedLive && pinnedLive.id !== e.id ? ['LIVE — but another editorial is pinned, so this one waits', '#fbbf24']
    : ['LIVE — in rotation', '#4ade80']

  return (
    <div style={{ padding: '32px 24px 120px', maxWidth: 860, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>FEATURED EDITORIAL</h1>
      <p style={{ ...small, margin: '0 0 20px' }}>
        A customer&rsquo;s shoot, shown in the big photo spot beside &ldquo;Built for the Obsessed&rdquo; on the home page. Photos fade one to the next,
        uncropped, with the title, the photographer and a CREDITS button. Only feature work the creators have cleared for us, and credit everyone.
      </p>

      {/* ── The list ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <h2 style={{ ...h2, margin: 0, flex: 1 }}>EDITORIALS</h2>
          <span style={small}>{pinnedLive ? `PINNED: ${pinnedLive.title || 'Untitled'}` : `${liveCount} live · the website shows one per visit, tablets cycle through all`}</span>
        </div>
        {cfg.items.map(x => {
          const [lab, col] = STATUS_LABEL[editorialStatus(x, today)]
          const on = x.id === eid
          return (
            <button key={x.id} onClick={() => setSel(x.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer', padding: '8px 10px', marginBottom: 6, background: on ? 'rgba(212,168,67,0.1)' : '#0b0b0d', border: `1px solid ${on ? C.accent : C.line}`, color: C.text }}>
              {x.photos[0] ? <img src={x.photos[0]} alt="" style={{ width: 36, height: 48, objectFit: 'cover' }} /> : <span style={{ width: 36, height: 48, background: '#1c1c1f' }} />}
              <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 13, fontWeight: 600 }}>{x.title || 'Untitled'}{x.pinned ? '  📌' : ''}<span style={{ ...small, display: 'block', fontWeight: 400 }}>{x.credits[0]?.handle ? `@${x.credits[0].handle}` : ''}{x.setName ? ` · ${x.setName}` : ''}</span></span>
              <span style={{ ...small, color: col, fontWeight: 700, letterSpacing: '0.08em' }}>{lab}</span>
            </button>
          )
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {cfg.items.length < EDITORIAL_MAX_ITEMS && <button onClick={addEditorial} style={{ ...btn, color: C.accent }}>+ Add editorial</button>}
          {e && cfg.items.length > 1 && <>
            <button onClick={() => moveEditorial(-1)} style={btn}>↑ Move up</button>
            <button onClick={() => moveEditorial(1)} style={btn}>↓ Move down</button>
          </>}
          {e && <button onClick={removeEditorial} style={{ ...btn, color: '#f87171', marginLeft: 'auto' }}>Remove this editorial</button>}
        </div>
      </div>

      {!e ? <p style={small}>No editorials yet — add one above.</p> : <>
      <div style={{ ...h2, fontSize: 18, margin: '4px 0 12px', color: C.accent }}>EDITING: {e.title || 'Untitled'}</div>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...h2, margin: 0 }}>IN ROTATION</div>
          <div style={{ ...small, marginTop: 4, color: status[1], fontWeight: 600 }}>{status[0]}</div>
        </div>
        <button onClick={() => set({ enabled: !e.enabled })} aria-pressed={e.enabled} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: e.enabled ? C.accent : 'rgba(255,255,255,0.18)' }}>
          <span style={{ position: 'absolute', top: 3, left: e.enabled ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...h2, margin: 0 }}>ALSO SHOW AS A HERO BANNER</div>
          <div style={{ ...small, marginTop: 4 }}>
            Adds it as the second slide in the home page&rsquo;s top carousel: title, byline and credits on the left, the photos side by side on the right, uncropped.
            Buttons: &ldquo;View the editorial&rdquo; (scrolls down to it) and &ldquo;Book&rdquo; the set it was shot on. Follows whatever you save here, so it never needs editing separately.
          </div>
          <div style={{ ...small, marginTop: 6, fontWeight: 600, color: e.showInHero ? (e.enabled && e.photos.length ? '#4ade80' : '#fbbf24') : C.dim }}>
            {e.showInHero ? (e.enabled && e.photos.length ? 'ON' : 'ON — but only shows while the editorial above is live') : 'OFF'}
          </div>
        </div>
        <button onClick={() => set({ showInHero: !e.showInHero })} aria-pressed={e.showInHero} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, background: e.showInHero ? C.accent : 'rgba(255,255,255,0.18)' }}>
          <span style={{ position: 'absolute', top: 3, left: e.showInHero ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...h2, margin: 0 }}>PIN THIS ONE</div>
          <div style={{ ...small, marginTop: 4 }}>Pause the rotation: every visitor and every tablet sees only this editorial (while it is live). Handy for a launch. Pinning it unpins any other.</div>
        </div>
        <button onClick={() => set({ pinned: !e.pinned })} aria-pressed={e.pinned} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, background: e.pinned ? C.accent : 'rgba(255,255,255,0.18)' }}>
          <span style={{ position: 'absolute', top: 3, left: e.pinned ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
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
          <label><span style={lbl}>Shot on (optional)</span>
            <select value={e.setSlug} onChange={ev => { const x = sets.find(y => y.slug === ev.target.value); set({ setSlug: x?.slug || '', setName: x?.name || '' }) }} style={inp}>
              <option value="" style={{ background: '#141416', color: '#fff' }}>{e.setName && !e.setSlug ? `${e.setName} (pick from list)` : 'Not shown'}</option>
              {sets.map(x => <option key={x.slug} value={x.slug} style={{ background: '#141416', color: '#fff' }}>{x.name}</option>)}
            </select>
          </label>
          <label><span style={lbl}>Start showing (optional)</span><input type="date" value={e.startDate ?? ''} onChange={ev => set({ startDate: ev.target.value || null })} style={inp} /></label>
          <label><span style={lbl}>Stop showing after (optional)</span><input type="date" value={e.endDate ?? ''} onChange={ev => set({ endDate: ev.target.value || null })} style={inp} /></label>
          <label><span style={lbl}>Seconds per photo</span><input type="number" min={3} max={15} value={e.intervalSec} onChange={ev => set({ intervalSec: Number(ev.target.value) })} style={inp} /></label>
        </div>
        <label style={{ display: 'block', marginTop: 12 }}><span style={lbl}>Instagram post link</span><input value={e.postUrl} onChange={ev => set({ postUrl: ev.target.value })} placeholder="https://www.instagram.com/p/…" style={inp} /></label>
        <details open={!!(e.promoLabel || e.promoUrl || e.promoCta)} style={{ marginTop: 16 }}>
          <summary style={{ ...small, color: C.accent, cursor: 'pointer' }}>Use this editorial as an ad on the kiosks (optional)</summary>
          <p style={{ ...small, margin: '8px 0 10px' }}>Swaps the &ldquo;Featured Editorial&rdquo; label and points the QR somewhere else, e.g. an open call. Leave blank to show it normally.</p>
          <div style={grid2}>
            <label><span style={lbl}>Label above the title</span><input value={e.promoLabel} maxLength={48} onChange={ev => set({ promoLabel: ev.target.value })} placeholder="OPEN CALL · SUBMIT BY NOV 30" style={inp} /></label>
            <label><span style={lbl}>QR goes to</span><input value={e.promoUrl} onChange={ev => set({ promoUrl: ev.target.value })} placeholder="/submissions#the-patient" style={inp} /></label>
            <label><span style={lbl}>Under the QR</span><input value={e.promoCta} maxLength={24} onChange={ev => set({ promoCta: ev.target.value })} placeholder="SCAN TO SUBMIT" style={inp} /></label>
          </div>
        </details>
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

      </>}

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

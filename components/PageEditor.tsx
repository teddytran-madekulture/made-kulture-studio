'use client'
// The per-page website editor (text + photos + layout), rendered inside the
// Website workspace at /admin/website/pages/[slug]. Field inputs are generated
// from the page's schema in lib/site-content.ts; 'list' fields render as a
// repeater (add / remove / reorder items).
import { useEffect, useMemo, useRef, useState } from 'react'
import ImageCropper from '@/components/ImageCropper'
import { SITE_IMAGE_SLOTS, type SiteImageSlot } from '@/lib/site-images'
import { SITE_SETTINGS_DEFAULTS, HERO_HEIGHT_MIN, HERO_HEIGHT_MAX } from '@/lib/site-settings'
import { getContentPage, type ContentField } from '@/lib/site-content'
import { parseList, type ListItem } from '@/lib/content-list'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

type Status = 'idle' | 'saving' | 'saved'

// Section order + labels for the Home page. Content fields (by group) and image
// slots (by group) with the same name render together under one section heading.
const HOME_SECTIONS: Array<{ group: string; label: string }> = [
  { group: 'Hero',        label: 'Hero' },
  { group: 'Features',    label: 'Feature tiles' },
  { group: 'Sets',        label: 'Sets' },
  { group: 'Studio',      label: 'Studio photo' },
  { group: 'Closing CTA', label: 'Closing CTA' },
  { group: 'Footer',      label: 'Footer' },
]

// Repeater editor for 'list' fields: item cards with per-item inputs,
// reorder / delete, and an add button. The whole list saves as one JSON value.
function ListFieldCard({ field, raw, status, isOverridden, onChange, onReset }: {
  field: ContentField
  raw: string
  status: Status
  isOverridden: boolean
  onChange: (json: string) => void
  onReset: () => void
}) {
  const items = parseList(raw)
  const itemFields = field.item ?? []
  const save = (next: ListItem[]) => onChange(JSON.stringify(next))
  const update = (i: number, key: string, val: string) => save(items.map((it, j) => (j === i ? { ...it, [key]: val } : it)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]; const t = next[i]; next[i] = next[j]; next[j] = t
    save(next)
  }
  const remove = (i: number) => { if (confirm('Remove this item?')) save(items.filter((_, j) => j !== i)) }
  const add = () => save([...items, Object.fromEntries(itemFields.map(f => [f.key, '']))])

  const inputStyle = { width: '100%', background: '#0e0e10', color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' as const }
  const miniBtn = { background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, borderRadius: 6, width: 28, height: 28, fontSize: 13, cursor: 'pointer', lineHeight: 1 }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>{field.label} <span style={{ color: C.dim, fontWeight: 400 }}>· {items.length}</span></label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: status === 'saved' ? C.accent : C.dim, minWidth: 44 }}>{status === 'saving' ? 'Saving\u2026' : status === 'saved' ? 'Saved \u2713' : ''}</span>
          {isOverridden && <button onClick={onReset} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Reset</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px 12px 12px 14px', background: '#101012' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: C.dim }}>#{i + 1}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button title="Move up" onClick={() => move(i, -1)} disabled={i === 0} style={{ ...miniBtn, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                <button title="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1} style={{ ...miniBtn, opacity: i === items.length - 1 ? 0.3 : 1 }}>↓</button>
                <button title="Remove" onClick={() => remove(i)} style={{ ...miniBtn, color: '#e08585', borderColor: 'rgba(220,110,110,0.35)' }}>×</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {itemFields.map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>{f.label}</div>
                  {f.type === 'multiline'
                    ? <textarea value={it[f.key] ?? ''} onChange={e => update(i, f.key, e.target.value)} rows={Math.max(2, (it[f.key] ?? '').split('\n').length)} style={{ ...inputStyle, resize: 'vertical' as const, lineHeight: 1.5 }} />
                    : <input type="text" value={it[f.key] ?? ''} onChange={e => update(i, f.key, e.target.value)} style={inputStyle} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={add} style={{ marginTop: 10, background: 'transparent', color: C.accent, border: `1px dashed rgba(201,178,126,0.5)`, borderRadius: 8, padding: '9px 14px', fontSize: 12, cursor: 'pointer', width: '100%' }}>+ Add item</button>
      {field.hint && <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 8 }}>{field.hint}</div>}
    </div>
  )
}

export default function PageEditor({ slug }: { slug: string }) {
  const pageSlug = slug
  const page = useMemo(() => getContentPage(pageSlug), [pageSlug])
  const isHome = pageSlug === 'home'

  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')

  // ── Text content state ──
  const [values, setValues] = useState<Record<string, string>>({})
  const [overridden, setOverridden] = useState<Record<string, boolean>>({})
  const [textStatus, setTextStatus] = useState<Record<string, Status>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Image state ──
  const [images, setImages] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [crop, setCrop] = useState<{ slug: string; aspect: number; src: string; outWidth: number } | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pendingImg = useRef<{ slug: string; aspect: number; outWidth: number } | null>(null)

  // ── Hero height state ──
  const [heroH, setHeroH] = useState<number>(SITE_SETTINGS_DEFAULTS.heroHeightVh)
  const [heroStatus, setHeroStatus] = useState<Status>('idle')
  const heroTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    if (!page) return
    setLoading(true)
    // Text
    const base: Record<string, string> = {}
    for (const f of page.fields) base[f.key] = f.default
    try {
      const r = await fetch(`/api/admin/site-content?page=${encodeURIComponent(page.slug)}`, { credentials: 'include' })
      if (r.status === 401) { setUnauth(true); setLoading(false); return }
      const d = await r.json()
      const ov: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(d.overrides ?? {})) { base[k] = String(v); ov[k] = true }
      setOverridden(ov)
    } catch {}
    setValues(base)
    // Images + hero height (home only)
    if (pageSlug === 'home') {
      try {
        const ri = await fetch('/api/admin/site-images', { credentials: 'include' })
        if (ri.ok) { const di = await ri.json(); setImages(di.images ?? {}) }
      } catch {}
      try {
        const rs = await fetch('/api/admin/site-settings', { credentials: 'include' })
        if (rs.ok) { const ds = await rs.json(); if (ds.settings?.heroHeightVh) setHeroH(ds.settings.heroHeightVh) }
      } catch {}
    }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pageSlug])

  // ── Text handlers ──
  const saveText = (key: string, value: string) => {
    if (!page) return
    setTextStatus(s => ({ ...s, [key]: 'saving' }))
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(async () => {
      try {
        const r = await fetch('/api/admin/site-content', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: page.slug, key, value }),
        })
        if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Save failed.'); setTextStatus(s => ({ ...s, [key]: 'idle' })); return }
        setOverridden(o => ({ ...o, [key]: true }))
        setTextStatus(s => ({ ...s, [key]: 'saved' }))
      } catch { setTextStatus(s => ({ ...s, [key]: 'idle' })) }
    }, 450)
  }
  const onText = (key: string, value: string) => { setValues(v => ({ ...v, [key]: value })); setErr(''); saveText(key, value) }
  const resetText = async (field: ContentField) => {
    if (!page) return
    setTextStatus(s => ({ ...s, [field.key]: 'saving' }))
    try {
      const r = await fetch(`/api/admin/site-content?page=${encodeURIComponent(page.slug)}&key=${encodeURIComponent(field.key)}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not reset.'); return }
      setValues(v => ({ ...v, [field.key]: field.default }))
      setOverridden(o => { const n = { ...o }; delete n[field.key]; return n })
      setTextStatus(s => ({ ...s, [field.key]: 'idle' }))
    } catch { setErr('Could not reset.') }
  }

  // ── Image handlers ──
  const pickImage = (slot: SiteImageSlot) => {
    setErr('')
    pendingImg.current = { slug: slot.slug, aspect: slot.aspect, outWidth: slot.outWidth ?? 1000 }
    fileInput.current?.click()
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || !pendingImg.current) return
    setCrop({ slug: pendingImg.current.slug, aspect: pendingImg.current.aspect, outWidth: pendingImg.current.outWidth, src: URL.createObjectURL(f) })
  }
  const onCropped = async (blob: Blob) => {
    if (!crop) return
    const slug = crop.slug
    setCrop(null); setBusy(slug); setErr('')
    try {
      const fd = new FormData(); fd.append('slug', slug); fd.append('file', blob, `${slug}.jpg`)
      const r = await fetch('/api/admin/site-images', { method: 'POST', credentials: 'include', body: fd })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Upload failed.'); return }
      setImages(prev => ({ ...prev, [slug]: d.url }))
    } finally { setBusy(null) }
  }
  const resetImage = async (slug: string) => {
    setBusy(slug); setErr('')
    try {
      const r = await fetch(`/api/admin/site-images?slug=${encodeURIComponent(slug)}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) { const d = await r.json(); setErr(d.error || 'Could not reset.'); return }
      setImages(prev => { const n = { ...prev }; delete n[slug]; return n })
    } finally { setBusy(null) }
  }

  // ── Hero height handler ──
  const onHeroH = (v: number) => {
    setHeroH(v); setHeroStatus('saving')
    if (heroTimer.current) clearTimeout(heroTimer.current)
    heroTimer.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/admin/site-settings', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ heroHeightVh: v }) })
        setHeroStatus(r.ok ? 'saved' : 'idle')
      } catch { setHeroStatus('idle') }
    }, 400)
  }

  if (loading) return <main style={{ background: C.bg, minHeight: '100vh', color: C.dim, padding: 40, fontFamily: 'Inter, sans-serif' }}>Loading…</main>
  if (unauth) return <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: 40, fontFamily: 'Inter, sans-serif' }}>Please <a href="/admin" style={{ color: C.accent }}>log in</a> to edit the site.</main>
  if (!page) return <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: 40, fontFamily: 'Inter, sans-serif' }}>No page selected.</main>

  const sections = isHome
    ? HOME_SECTIONS
    : Array.from(new Set(page.fields.map(f => f.group))).map(g => ({ group: g, label: g }))

  const renderField = (field: ContentField) => {
    const st = textStatus[field.key]
    if (field.type === 'list') {
      return (
        <ListFieldCard key={field.key} field={field} raw={values[field.key] ?? ''} status={st}
          isOverridden={!!overridden[field.key]}
          onChange={json => onText(field.key, json)}
          onReset={() => resetText(field)} />
      )
    }
    const common = {
      value: values[field.key] ?? '',
      onChange: (e: any) => onText(field.key, e.target.value),
      style: { width: '100%', background: '#0e0e10', color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' as const },
    }
    return (
      <div key={field.key} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>{field.label}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: st === 'saved' ? C.accent : C.dim, minWidth: 44 }}>{st === 'saving' ? 'Saving…' : st === 'saved' ? 'Saved ✓' : ''}</span>
            {overridden[field.key] && <button onClick={() => resetText(field)} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Reset</button>}
          </div>
        </div>
        {field.type === 'multiline'
          ? <textarea {...common} rows={Math.max(2, (values[field.key] ?? '').split('\n').length)} style={{ ...common.style, resize: 'vertical', lineHeight: 1.5 }} />
          : <input type="text" {...common} />}
        {field.hint && <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 6 }}>{field.hint}</div>}
      </div>
    )
  }

  const renderImage = (slot: SiteImageSlot) => {
    const url = images[slot.slug]; const isBusy = busy === slot.slug
    return (
      <div key={slot.slug} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ width: '100%', aspectRatio: String(slot.aspect), background: 'linear-gradient(135deg, #1c1c1c, #0f0f10)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {url
            ? <img src={url} alt={slot.label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.2)' }}>NO PHOTO</span>}
          {isBusy && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>Uploading…</div>}
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{slot.label}</div>
          {slot.hint && <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 4 }}>{slot.hint}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => pickImage(slot)} disabled={isBusy} style={{ flex: 1, background: '#fff', color: '#080808', border: 'none', padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', cursor: isBusy ? 'default' : 'pointer' }}>{url ? 'Replace' : 'Upload'}</button>
            {url && <button onClick={() => resetImage(slot.slug)} disabled={isBusy} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, padding: '8px 12px', borderRadius: 6, fontSize: 12, cursor: isBusy ? 'default' : 'pointer' }}>Reset</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px 80px', fontFamily: 'Inter, sans-serif' }}>
      <input ref={fileInput} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40, letterSpacing: '0.03em', margin: 0 }}>EDIT — {page?.label?.toUpperCase() ?? 'WEBSITE'}</h1>
          <a href="/" target="_blank" rel="noreferrer" style={{ fontSize: 12, letterSpacing: '0.1em', color: C.accent, textDecoration: 'none' }}>VIEW LIVE SITE ↗</a>
        </div>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6, marginTop: 6, marginBottom: 24, maxWidth: 640 }}>
          Photos and words for each page, together. Everything saves automatically and goes live immediately — no publishing step. Reset returns any item to its original. Wrap words in **double asterisks** to make them bold.
        </p>

        {err && <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', color: '#f2b8b8', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>{err}</div>}

        {sections.map(section => {
          const fields = page.fields.filter(f => f.group === section.group)
          const slots = isHome ? SITE_IMAGE_SLOTS.filter(s => s.group === section.group) : []
          const showHeroSlider = isHome && section.group === 'Hero'
          if (!fields.length && !slots.length && !showHeroSlider) return null
          return (
            <section key={section.group} style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: `1px solid ${C.line}` }}>{section.label}</div>

              {fields.length > 0 && <div style={{ display: 'grid', gap: 14, marginBottom: (slots.length || showHeroSlider) ? 16 : 0 }}>{fields.map(renderField)}</div>}

              {showHeroSlider && (
                <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Hero height</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 16 }}>{heroH}vh</span>
                      <span style={{ fontSize: 11, color: heroStatus === 'saved' ? C.accent : C.dim, minWidth: 44 }}>{heroStatus === 'saving' ? 'Saving…' : heroStatus === 'saved' ? 'Saved ✓' : ''}</span>
                    </div>
                  </div>
                  <input type="range" min={HERO_HEIGHT_MIN} max={HERO_HEIGHT_MAX} step={1} value={heroH} onChange={e => onHeroH(Number(e.target.value))} style={{ width: '100%', accentColor: C.accent, cursor: 'pointer' }} />
                  <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.6, margin: '10px 0 0' }}>Height of the hero band on desktop. The headline auto-scales to fit, so nothing gets cut off. Mobile is unaffected.</p>
                </div>
              )}

              {slots.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>{slots.map(renderImage)}</div>}
            </section>
          )
        })}
      </div>

      {crop && <ImageCropper src={crop.src} aspect={crop.aspect} outWidth={crop.outWidth} onCancel={() => setCrop(null)} onCropped={onCropped} />}
    </main>
  )
}

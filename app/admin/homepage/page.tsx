'use client'
import { useEffect, useRef, useState } from 'react'
import ImageCropper from '@/components/ImageCropper'
import { SITE_IMAGE_SLOTS, type SiteImageSlot } from '@/lib/site-images'
import { SITE_SETTINGS_DEFAULTS, HERO_HEIGHT_MIN, HERO_HEIGHT_MAX } from '@/lib/site-settings'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

const GROUPS: Array<SiteImageSlot['group']> = ['Hero', 'Sets', 'Studio']

export default function HomepageEditor() {
  const [images, setImages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [crop, setCrop] = useState<{ slug: string; aspect: number; src: string; outWidth: number } | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pending = useRef<{ slug: string; aspect: number; outWidth: number } | null>(null)

  const [heroH, setHeroH] = useState<number>(SITE_SETTINGS_DEFAULTS.heroHeightVh)
  const [heroStatus, setHeroStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const heroTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    const r = await fetch('/api/admin/site-images', { credentials: 'include' })
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json(); setImages(d.images ?? {})
    try {
      const rs = await fetch('/api/admin/site-settings', { credentials: 'include' })
      if (rs.ok) { const ds = await rs.json(); if (ds.settings?.heroHeightVh) setHeroH(ds.settings.heroHeightVh) }
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Live-save the hero height (debounced) as the slider moves.
  const onHeroH = (v: number) => {
    setHeroH(v)
    setHeroStatus('saving')
    if (heroTimer.current) clearTimeout(heroTimer.current)
    heroTimer.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/admin/site-settings', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ heroHeightVh: v }),
        })
        setHeroStatus(r.ok ? 'saved' : 'idle')
      } catch { setHeroStatus('idle') }
    }, 400)
  }

  // Step 1: user picks a slot → open the file picker.
  const pick = (slot: SiteImageSlot) => {
    setErr('')
    pending.current = { slug: slot.slug, aspect: slot.aspect, outWidth: slot.outWidth ?? 1000 }
    fileInput.current?.click()
  }

  // Step 2: file chosen → show cropper with an object URL.
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !pending.current) return
    setCrop({ slug: pending.current.slug, aspect: pending.current.aspect, outWidth: pending.current.outWidth, src: URL.createObjectURL(f) })
  }

  // Step 3: cropped blob → upload.
  const onCropped = async (blob: Blob) => {
    if (!crop) return
    const slug = crop.slug
    setCrop(null); setBusy(slug); setErr('')
    try {
      const fd = new FormData()
      fd.append('slug', slug)
      fd.append('file', blob, `${slug}.jpg`)
      const r = await fetch('/api/admin/site-images', { method: 'POST', credentials: 'include', body: fd })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Upload failed.'); return }
      setImages(prev => ({ ...prev, [slug]: d.url }))
    } finally { setBusy(null) }
  }

  const reset = async (slug: string) => {
    setBusy(slug); setErr('')
    try {
      const r = await fetch(`/api/admin/site-images?slug=${encodeURIComponent(slug)}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) { const d = await r.json(); setErr(d.error || 'Could not reset.'); return }
      setImages(prev => { const n = { ...prev }; delete n[slug]; return n })
    } finally { setBusy(null) }
  }

  if (loading) return <main style={{ background: C.bg, minHeight: '100vh', color: C.dim, padding: 40, fontFamily: 'Inter, sans-serif' }}>Loading…</main>
  if (unauth) return <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: 40, fontFamily: 'Inter, sans-serif' }}>Please <a href="/admin" style={{ color: C.accent }}>log in</a> to edit the home page.</main>

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px 80px', fontFamily: 'Inter, sans-serif' }}>
      <input ref={fileInput} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40, letterSpacing: '0.03em', margin: 0 }}>HOME PAGE PHOTOS</h1>
          <a href="/" target="_blank" rel="noreferrer" style={{ fontSize: 12, letterSpacing: '0.1em', color: C.accent, textDecoration: 'none' }}>VIEW LIVE SITE ↗</a>
        </div>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6, marginTop: 6, marginBottom: 28, maxWidth: 620 }}>
          Upload a photo for any slot. Changes go live on the home page immediately — no publishing step.
          Each upload opens a cropper so the photo fits its frame. Reset returns a slot to the default gradient.
        </p>

        {err && <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', color: '#f2b8b8', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>{err}</div>}

        <section style={{ marginBottom: 36 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', marginBottom: 14 }}>Hero layout</div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Hero height</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 18, color: C.text }}>{heroH}vh</span>
                <span style={{ fontSize: 11, color: heroStatus === 'saved' ? C.accent : C.dim, minWidth: 48 }}>
                  {heroStatus === 'saving' ? 'Saving…' : heroStatus === 'saved' ? 'Saved ✓' : ''}
                </span>
              </div>
            </div>
            <input
              type="range" min={HERO_HEIGHT_MIN} max={HERO_HEIGHT_MAX} step={1} value={heroH}
              onChange={e => onHeroH(Number(e.target.value))}
              style={{ width: '100%', accentColor: C.accent, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.dim, marginTop: 2 }}>
              <span>Shorter</span><span>Taller</span>
            </div>
            <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, margin: '12px 0 0' }}>
              Sets the height of the hero band on desktop. The headline and buttons auto-scale to fit,
              so nothing ever gets cut off — go as short as you like. Mobile is unaffected.
              Changes are live; refresh the home page to see them.
            </p>
          </div>
        </section>

        {GROUPS.map(group => {
          const slots = SITE_IMAGE_SLOTS.filter(s => s.group === group)
          if (!slots.length) return null
          return (
            <section key={group} style={{ marginBottom: 36 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', marginBottom: 14 }}>{group}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
                {slots.map(slot => {
                  const url = images[slot.slug]
                  const isBusy = busy === slot.slug
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
                          <button onClick={() => pick(slot)} disabled={isBusy} style={{ flex: 1, background: '#fff', color: '#080808', border: 'none', padding: '8px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', cursor: isBusy ? 'default' : 'pointer' }}>
                            {url ? 'Replace' : 'Upload'}
                          </button>
                          {url && (
                            <button onClick={() => reset(slot.slug)} disabled={isBusy} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, padding: '8px 12px', borderRadius: 6, fontSize: 12, cursor: isBusy ? 'default' : 'pointer' }}>
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {crop && (
        <ImageCropper
          src={crop.src}
          aspect={crop.aspect}
          outWidth={crop.outWidth}
          onCancel={() => setCrop(null)}
          onCropped={onCropped}
        />
      )}
    </main>
  )
}

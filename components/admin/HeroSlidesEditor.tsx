'use client'
// Website Editor → Home → Hero banners. Extra slides that swipe in after the
// main hero on the home page. The main hero itself is still edited by the Hero
// fields and photo above; this only manages the extra ones.
// Saved with one explicit SAVE (a half-typed button link must never go live).

import { useEffect, useMemo, useState } from 'react'
import ImageCropper from '@/components/ImageCropper'
import MediaLibrary from '@/components/admin/MediaLibrary'
import {
  blankSlide, centralToday, slideStatus, MAX_SLIDES, INTERVAL_MIN, INTERVAL_MAX,
  type HeroSlide, type HeroSlidesConfig, type SlideStatus, type Focal,
} from '@/lib/hero-slides'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#0b0b0d', color: C.text, border: `1px solid ${C.line}`,
  borderRadius: 6, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark',
}
const lbl: React.CSSProperties = { fontSize: 11, letterSpacing: '0.08em', color: C.dim, textTransform: 'uppercase', marginBottom: 5, display: 'block' }
const btn = (primary = false): React.CSSProperties => ({
  background: primary ? C.accent : 'transparent', color: primary ? '#0b0b0d' : C.text,
  border: primary ? 'none' : `1px solid ${C.line}`, borderRadius: 6, padding: '7px 12px',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em',
})

const STATUS: Record<SlideStatus, { text: string; color: string }> = {
  live: { text: 'SHOWING NOW', color: '#4ade80' },
  off: { text: 'OFF', color: 'rgba(255,255,255,0.4)' },
  scheduled: { text: 'SCHEDULED', color: C.accent },
  ended: { text: 'ENDED', color: 'rgba(255,255,255,0.4)' },
  incomplete: { text: 'NEEDS PHOTO + HEADLINE', color: '#f0b75a' },
}

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function HeroSlidesEditor() {
  const [cfg, setCfg] = useState<HeroSlidesConfig | null>(null)
  const [saved, setSaved] = useState<string>('')      // JSON of last saved state
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | string | null>(null)
  const [crop, setCrop] = useState<{ src: string; slideId: string; crossOrigin?: boolean } | null>(null)
  const [picker, setPicker] = useState<string | null>(null)   // slide id choosing from the library
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const today = centralToday()

  useEffect(() => {
    fetch('/api/admin/hero-slides').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d?.error || `Couldn't load hero banners (${r.status})`); return }
      setCfg(d.config); setSaved(JSON.stringify(d.config))
    })
  }, [])

  const dirty = useMemo(() => !!cfg && JSON.stringify(cfg) !== saved, [cfg, saved])
  const update = (id: string, patch: Partial<HeroSlide>) =>
    setCfg(c => c && { ...c, slides: c.slides.map(s => s.id === id ? { ...s, ...patch } : s) })
  const move = (i: number, d: -1 | 1) => setCfg(c => {
    if (!c) return c
    const j = i + d; if (j < 0 || j >= c.slides.length) return c
    const slides = [...c.slides]; [slides[i], slides[j]] = [slides[j], slides[i]]; return { ...c, slides }
  })

  const save = async () => {
    if (!cfg) return
    setBusy('save'); setErr(null)
    const r = await fetch('/api/admin/hero-slides', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setErr(d?.error || `Save failed (${r.status})`); return }
    setCfg(d.config); setSaved(JSON.stringify(d.config))
  }

  const pickFile = (slideId: string, f: File | undefined) => {
    if (!f) return
    setCrop({ src: URL.createObjectURL(f), slideId })
  }
  const onCropped = async (blob: Blob) => {
    const target = crop; setCrop(null)
    if (!target) return
    setBusy(target.slideId); setErr(null)
    const fd = new FormData(); fd.append('file', new File([blob], 'slide.jpg', { type: 'image/jpeg' }))
    const r = await fetch('/api/admin/hero-slides', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setErr(d?.error || `Upload failed (${r.status})`); return }
    update(target.slideId, { imageUrl: d.url })
  }

  if (err && !cfg) return <div style={{ color: '#f2b8b8', fontSize: 13, marginTop: 16 }}>{err}</div>
  if (!cfg) return <div style={{ color: C.dim, fontSize: 13, marginTop: 16 }}>Loading hero banners…</div>

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Hero banners <span style={{ color: C.dim, fontWeight: 400, fontSize: 12 }}>— extra slides that swipe in after the main hero</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 11, color: '#f0b75a' }}>Unsaved changes</span>}
          <button style={{ ...btn(true), opacity: dirty ? 1 : 0.4 }} disabled={!dirty || busy === 'save'} onClick={save}>{busy === 'save' ? 'SAVING…' : 'SAVE BANNERS'}</button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.6, margin: '0 0 14px', maxWidth: 680 }}>
        Slide 1 is always the main hero above. A banner shows when it's switched on, has a photo and a headline, and today (Houston time) is inside its dates. Leave the dates blank to keep it up until you switch it off. Changes go live on SAVE.
      </p>

      {err && <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', color: '#f2b8b8', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}

      {cfg.slides.map((s, i) => {
        const st = STATUS[slideStatus(s, today)]
        return (
          <div key={s.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.dim }}>SLIDE {i + 2}</span>
                <span style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 700, color: st.color }}>{st.text}</span>
                {s.startDate && slideStatus(s, today) === 'scheduled' && <span style={{ fontSize: 11, color: C.dim }}>from {fmtDay(s.startDate)}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                  <input type="checkbox" checked={s.enabled} onChange={e => update(s.id, { enabled: e.target.checked })} /> On
                </label>
                <button style={btn()} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button style={btn()} disabled={i === cfg.slides.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                {confirmDel === s.id
                  ? <><button style={{ ...btn(), color: '#f87171' }} onClick={() => { setCfg(c => c && { ...c, slides: c.slides.filter(x => x.id !== s.id) }); setConfirmDel(null) }}>DELETE</button><button style={btn()} onClick={() => setConfirmDel(null)}>KEEP</button></>
                  : <button style={btn()} onClick={() => setConfirmDel(s.id)}>REMOVE</button>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ aspectRatio: '2 / 1', background: '#0b0b0d', border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  {s.imageUrl ? <img src={s.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: C.dim }}>No photo yet</span>}
                </div>
                <label style={{ ...btn(), display: 'inline-block' }}>
                  {busy === s.id ? 'UPLOADING…' : s.imageUrl ? 'REPLACE PHOTO' : 'UPLOAD PHOTO'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { pickFile(s.id, e.target.files?.[0]); e.target.value = '' }} />
                </label>{' '}
                <button style={btn()} onClick={() => setPicker(s.id)}>FROM LIBRARY</button>
                <div style={{ marginTop: 10 }}>
                  <span style={lbl}>On phones, keep in view</span>
                  <select style={input} value={s.focal} onChange={e => update(s.id, { focal: e.target.value as Focal })}>
                    <option value="left" style={{ background: '#0b0b0d', color: C.text }}>Left side of the photo</option>
                    <option value="center" style={{ background: '#0b0b0d', color: C.text }}>Center</option>
                    <option value="right" style={{ background: '#0b0b0d', color: C.text }}>Right side of the photo</option>
                  </select>
                </div>
                <p style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, margin: '8px 0 0' }}>Framed 2:1 like the main hero. Keep the subject away from the bottom-left, where the headline sits.</p>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div><span style={lbl}>Eyebrow (small line above)</span><input style={input} value={s.eyebrow} maxLength={80} placeholder="NEW SET" onChange={e => update(s.id, { eyebrow: e.target.value })} /></div>
                <div><span style={lbl}>Headline — one line per row</span><textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} value={s.headline} maxLength={80} placeholder={'THE PINK\nROOM'} onChange={e => update(s.id, { headline: e.target.value })} /></div>
                <div><span style={lbl}>Short paragraph</span><textarea style={{ ...input, minHeight: 54, resize: 'vertical' }} value={s.paragraph} maxLength={300} onChange={e => update(s.id, { paragraph: e.target.value })} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><span style={lbl}>Button label</span><input style={input} value={s.buttonLabel} maxLength={40} placeholder="See the set" onChange={e => update(s.id, { buttonLabel: e.target.value })} /></div>
                  <div><span style={lbl}>Button link</span><input style={input} value={s.buttonUrl} placeholder="/sets/set-d" onChange={e => update(s.id, { buttonUrl: e.target.value })} /></div>
                  <div><span style={lbl}>Second button (optional)</span><input style={input} value={s.button2Label} maxLength={40} placeholder="Book it" onChange={e => update(s.id, { button2Label: e.target.value })} /></div>
                  <div><span style={lbl}>Second button link</span><input style={input} value={s.button2Url} placeholder="/book?type=set" onChange={e => update(s.id, { button2Url: e.target.value })} /></div>
                  <div><span style={lbl}>Show from (optional)</span><input type="date" style={input} value={s.startDate ?? ''} onChange={e => update(s.id, { startDate: e.target.value || null })} /></div>
                  <div><span style={lbl}>Show until (optional)</span><input type="date" style={input} value={s.endDate ?? ''} onChange={e => update(s.id, { endDate: e.target.value || null })} /></div>
                </div>
                <p style={{ fontSize: 11, color: C.dim, margin: 0 }}>Links: a page on the site like <code>/sets/set-d</code>, or a full https:// address. Dates are Houston days and include both ends.</p>
              </div>
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button style={btn()} disabled={cfg.slides.length >= MAX_SLIDES}
          onClick={() => setCfg(c => c && { ...c, slides: [...c.slides, blankSlide(newId())] })}>
          + ADD BANNER
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.dim }}>
          Seconds per slide
          <input type="number" min={INTERVAL_MIN} max={INTERVAL_MAX} value={cfg.intervalSec} style={{ ...input, width: 64 }}
            onChange={e => setCfg(c => c && { ...c, intervalSec: Number(e.target.value) || 7 })} />
        </label>
      </div>

      {crop && <ImageCropper src={crop.src} aspect={2} outWidth={3000} crossOrigin={!!crop.crossOrigin} onCancel={() => setCrop(null)} onCropped={onCropped} />}

      {picker && (
        <div onClick={() => setPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#101012', border: `1px solid ${C.line}`, borderRadius: 12, width: 'min(1100px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxSizing: 'border-box' }}>
            <MediaLibrary mode="pick" onClose={() => setPicker(null)}
              onPick={item => { const id = picker; setPicker(null); setCrop({ src: item.url, slideId: id, crossOrigin: true }) }} />
          </div>
        </div>
      )}
    </div>
  )
}

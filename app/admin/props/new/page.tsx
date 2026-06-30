'use client'
import { useState, useCallback, type CSSProperties } from 'react'
import { PROP_CATEGORIES } from '@/lib/props'

// Loaded from a CDN at runtime (browser only) so the heavy onnx/wasm code
// never goes through the Next.js/webpack build.
const BG_REMOVAL_CDN: string = 'https://esm.sh/@imgly/background-removal@1.7.0'
let _bgPromise: Promise<any> | null = null
async function loadBgRemover(): Promise<(input: Blob) => Promise<Blob>> {
  if (!_bgPromise) _bgPromise = import(/* webpackIgnore: true */ BG_REMOVAL_CDN)
  const mod: any = await _bgPromise
  return mod.removeBackground || mod.default?.removeBackground || mod.default
}

type Shot = { id: string; preview: string; blob: Blob; status: 'processing' | 'done' | 'error' }

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { res(img) }
    img.onerror = rej
    img.src = url
  })
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise(res => { const r = new FileReader(); r.onloadend = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(blob) })
}
async function compositeOnWhite(img: HTMLImageElement, max = 1400, quality = 0.85): Promise<Blob> {
  let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
  const scale = Math.min(1, max / Math.max(w, h)); w = Math.round(w * scale); h = Math.round(h * scale)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h)
  return await new Promise<Blob>(r => c.toBlob(b => r(b as Blob), 'image/jpeg', quality))
}

export default function AddPropByPhoto() {
  const [shots, setShots] = useState<Shot[]>([])
  const [removeBg, setRemoveBg] = useState(true)
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('Misc')
  const [description, setDescription] = useState('')
  const [needsRepair, setNeedsRepair] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [doneSlug, setDoneSlug] = useState('')

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return
    setBusy(true); setMsg(''); setDoneSlug('')
    const arr = Array.from(files)
    const next: Shot[] = arr.map((f, i) => ({ id: `${Date.now()}-${i}`, preview: '', blob: f, status: 'processing' }))
    setShots(prev => [...prev, ...next])
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i]; const id = next[i].id
      try {
        let imgBlob: Blob = f
        if (removeBg) {
          const removeBackground = await loadBgRemover()
          imgBlob = await removeBackground(f)
        }
        const img = await blobToImage(imgBlob)
        const finalBlob = await compositeOnWhite(img)
        const preview = URL.createObjectURL(finalBlob)
        setShots(prev => prev.map(s => s.id === id ? { ...s, blob: finalBlob, preview, status: 'done' } : s))
      } catch (e) {
        // Fallback: use original resized on white
        try {
          const img = await blobToImage(f); const fb = await compositeOnWhite(img)
          setShots(prev => prev.map(s => s.id === id ? { ...s, blob: fb, preview: URL.createObjectURL(fb), status: 'done' } : s))
        } catch {
          setShots(prev => prev.map(s => s.id === id ? { ...s, status: 'error' } : s))
        }
      }
    }
    setBusy(false)
    // auto-analyze the first done shot
    setShots(prev => { runAnalyze(prev); return prev })
  }, [removeBg])

  const runAnalyze = async (current: Shot[]) => {
    const hero = current.find(s => s.status === 'done')
    if (!hero || name) return
    setAnalyzing(true); setMsg('')
    try {
      const b64 = await blobToBase64(hero.blob)
      const r = await fetch('/api/admin/props/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ imageBase64: b64, mediaType: 'image/jpeg' }) })
      const j = await r.json()
      if (r.ok) { setName(j.name || ''); setCategory(j.category || 'Misc'); setDescription(j.description || '') }
      else setMsg(j.error || 'AI suggestion unavailable — fill the fields in manually.')
    } catch { setMsg('AI suggestion unavailable — fill the fields in manually.') }
    setAnalyzing(false)
  }

  const save = async () => {
    const done = shots.filter(s => s.status === 'done')
    if (!name.trim()) { setMsg('Add a name first.'); return }
    if (!done.length) { setMsg('Add at least one photo.'); return }
    setSaving(true); setMsg('')
    try {
      const fd = new FormData()
      done.forEach((s, i) => fd.append('files', s.blob, `${i + 1}.jpg`))
      const up = await fetch('/api/admin/props/upload', { method: 'POST', credentials: 'include', body: fd })
      const uj = await up.json()
      if (!up.ok) throw new Error(uj.error || 'Upload failed')
      const urls: string[] = uj.urls
      const cr = await fetch('/api/admin/props', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: name.trim(), category, description: description.trim(), image_url: urls[0], gallery: urls, needs_repair: needsRepair, is_active: true }) })
      const cj = await cr.json()
      if (!cr.ok) throw new Error(cj.error || 'Save failed')
      setDoneSlug(cj.prop?.slug || '')
      setMsg('Saved!'); setShots([]); setName(''); setDescription(''); setCategory('Misc'); setNeedsRepair(false)
    } catch (e: any) { setMsg(e?.message || 'Something went wrong.') }
    setSaving(false)
  }

  const L: CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }
  const input: CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#141414', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', padding: '11px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif' }

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <a href="/admin/dashboard" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← ADMIN</a>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.01em', margin: '14px 0 4px' }}>ADD PROP BY PHOTO</h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>Snap or upload photos. The background is removed in your browser and AI suggests a name, category, and description — edit anything, then save.</p>

        {/* Upload */}
        <label style={{ display: 'block', border: '1.5px dashed rgba(255,255,255,0.25)', borderRadius: 10, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: '#0d0d0d' }}>
          <input type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={e => onFiles(e.target.files)} />
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600 }}>+ Take / choose photos</div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>First photo becomes the cover · add several for a gallery</div>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          <input type="checkbox" checked={removeBg} onChange={e => setRemoveBg(e.target.checked)} /> Remove background (white, ecomm-style)
        </label>

        {/* Thumbs */}
        {shots.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, marginTop: 16 }}>
            {shots.map(s => (
              <div key={s.id} style={{ position: 'relative', aspectRatio: '1/1', background: '#141414', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                {s.preview && <img src={s.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                {s.status === 'processing' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', fontSize: 10, letterSpacing: '0.1em', color: '#fff' }}>REMOVING BG…</div>}
                {s.status === 'error' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(120,0,0,0.6)', fontSize: 10 }}>FAILED</div>}
              </div>
            ))}
          </div>
        )}
        {busy && <div style={{ marginTop: 10, fontSize: 12, color: '#d4a843' }}>Processing photos… (first time loads the background-removal model, ~a few seconds)</div>}

        {/* Form */}
        {shots.some(s => s.status === 'done') && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {analyzing && <div style={{ fontSize: 12, color: '#d4a843' }}>AI is reading the photo…</div>}
            <div><label style={L}>Name</label><input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vintage Rocking Chair" /></div>
            <div><label style={L}>Category</label>
              <select style={input} value={category} onChange={e => setCategory(e.target.value)}>
                {PROP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={L}>Description</label><textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="One short sentence" /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              <input type="checkbox" checked={needsRepair} onChange={e => setNeedsRepair(e.target.checked)} /> Needs repair
            </label>
            <button onClick={save} disabled={saving} style={{ background: saving ? '#3d3833' : '#fff', color: '#080808', border: 'none', padding: '13px 18px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'SAVING…' : 'SAVE PROP'}
            </button>
          </div>
        )}

        {msg && (
          <div style={{ marginTop: 16, fontSize: 13, color: doneSlug ? '#4ade80' : '#f59e0b', fontFamily: 'Inter, sans-serif' }}>
            {msg} {doneSlug && <a href={`/props/p/${doneSlug}`} style={{ color: '#d4a843' }} target="_blank" rel="noreferrer">View it →</a>}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState, type CSSProperties } from 'react'
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

const DEFAULT_GPT_PROMPT = 'Remove the background and place this exact object on a clean, evenly lit, pure white studio background. Keep the object itself unchanged, centered, photorealistic. Do not add any new objects, text, or props.'

type Shot = { id: string; file: File; origPreview: string; outBlob?: Blob; outPreview?: string; status: 'raw' | 'processing' | 'done' | 'error' }

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(blob) })
}
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise(res => { const r = new FileReader(); r.onloadend = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(blob) })
}
function b64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64); const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type })
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
  const [method, setMethod] = useState<'free' | 'chatgpt' | 'none'>('free')
  const [gptPrompt, setGptPrompt] = useState(DEFAULT_GPT_PROMPT)
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('Misc')
  const [description, setDescription] = useState('')
  const [needsRepair, setNeedsRepair] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [doneSlug, setDoneSlug] = useState('')

  // Step 1: just hold the chosen photos — no processing yet.
  const onFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    setMsg(''); setDoneSlug('')
    const next: Shot[] = Array.from(files).map((f, i) => ({ id: `${Date.now()}-${i}`, file: f, origPreview: URL.createObjectURL(f), status: 'raw' }))
    setShots(prev => [...prev, ...next])
  }
  const removeShot = (id: string) => setShots(prev => prev.filter(s => s.id !== id))
  const clearAll = () => { setShots([]); setName(''); setDescription(''); setCategory('Misc'); setNeedsRepair(false); setMsg(''); setDoneSlug('') }

  // Step 2: apply the chosen edit to every photo.
  const applyEdit = async () => {
    if (!shots.length) return
    setBusy(true); setMsg('')
    const list = shots
    for (const shot of list) {
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'processing' } : s))
      try {
        let imgBlob: Blob = shot.file
        if (method === 'free') {
          const removeBackground = await loadBgRemover()
          imgBlob = await removeBackground(shot.file)
        } else if (method === 'chatgpt') {
          const fd = new FormData(); fd.append('file', shot.file, shot.file.name || 'photo.jpg'); fd.append('prompt', gptPrompt)
          const r = await fetch('/api/admin/props/edit-image', { method: 'POST', credentials: 'include', body: fd })
          const j = await r.json()
          if (!r.ok) throw new Error(j.error || 'ChatGPT edit failed')
          imgBlob = b64ToBlob(j.imageBase64, 'image/png')
        }
        const img = await blobToImage(imgBlob)
        const outBlob = await compositeOnWhite(img)
        setShots(prev => prev.map(s => s.id === shot.id ? { ...s, outBlob, outPreview: URL.createObjectURL(outBlob), status: 'done' } : s))
      } catch (e: any) {
        setMsg(e?.message || 'An edit failed — you can retry or pick another method.')
        setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'error' } : s))
      }
    }
    setBusy(false)
    setShots(prev => { runAnalyze(prev); return prev })
  }

  const runAnalyze = async (current: Shot[]) => {
    const hero = current.find(s => s.status === 'done' && s.outBlob)
    if (!hero?.outBlob || name) return
    setAnalyzing(true)
    try {
      const b64 = await blobToBase64(hero.outBlob)
      const r = await fetch('/api/admin/props/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ imageBase64: b64, mediaType: 'image/jpeg' }) })
      const j = await r.json()
      if (r.ok) { setName(j.name || ''); setCategory(j.category || 'Misc'); setDescription(j.description || '') }
      else setMsg(j.error || 'AI suggestion unavailable — fill the fields in manually.')
    } catch { setMsg('AI suggestion unavailable — fill the fields in manually.') }
    setAnalyzing(false)
  }

  const save = async () => {
    const done = shots.filter(s => s.status === 'done' && s.outBlob)
    if (!name.trim()) { setMsg('Add a name first.'); return }
    if (!done.length) { setMsg('Apply an edit to your photos first.'); return }
    setSaving(true); setMsg('')
    try {
      const fd = new FormData()
      done.forEach((s, i) => fd.append('files', s.outBlob as Blob, `${i + 1}.jpg`))
      const up = await fetch('/api/admin/props/upload', { method: 'POST', credentials: 'include', body: fd })
      const uj = await up.json()
      if (!up.ok) throw new Error(uj.error || 'Upload failed')
      const urls: string[] = uj.urls
      const cr = await fetch('/api/admin/props', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: name.trim(), category, description: description.trim(), image_url: urls[0], gallery: urls, needs_repair: needsRepair, is_active: true }) })
      const cj = await cr.json()
      if (!cr.ok) throw new Error(cj.error || 'Save failed')
      setDoneSlug(cj.prop?.slug || ''); setMsg('Saved!'); clearAll()
    } catch (e: any) { setMsg(e?.message || 'Something went wrong.') }
    setSaving(false)
  }

  const anyDone = shots.some(s => s.status === 'done')
  const L: CSSProperties = { fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }
  const input: CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#141414', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', padding: '11px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif' }
  const applyLabel = busy ? 'WORKING…' : method === 'free' ? 'REMOVE BACKGROUND' : method === 'chatgpt' ? 'EDIT WITH CHATGPT' : 'USE PHOTOS AS-IS'

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', padding: '40px 20px 90px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <a href="/admin/dashboard" style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← ADMIN</a>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.01em', margin: '14px 0 4px' }}>ADD PROP BY PHOTO</h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>Take or choose your photos, pick how to clean them up, then save. Nothing is edited until you press the button.</p>

        {/* Step 1: choose photos */}
        <label style={{ display: 'block', border: '1.5px dashed rgba(255,255,255,0.25)', borderRadius: 10, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: '#0d0d0d' }}>
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { onFiles(e.target.files); e.currentTarget.value = '' }} />
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600 }}>+ Take / choose photos</div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>First photo becomes the cover · add several for a gallery</div>
        </label>

        {/* Thumbs */}
        {shots.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 8, marginTop: 16 }}>
            {shots.map(s => (
              <div key={s.id} style={{ position: 'relative', aspectRatio: '1/1', background: '#141414', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <img src={s.outPreview || s.origPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {s.status === 'processing' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', fontSize: 10, letterSpacing: '0.08em', color: '#fff', textAlign: 'center', padding: 4 }}>{method === 'chatgpt' ? 'CHATGPT…' : method === 'free' ? 'REMOVING BG…' : 'RESIZING…'}</div>}
                {s.status === 'done' && <div style={{ position: 'absolute', top: 4, left: 4, background: '#1f7a4d', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', letterSpacing: '0.06em' }}>EDITED</div>}
                {s.status === 'error' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(120,0,0,0.6)', fontSize: 10 }}>FAILED</div>}
                {!busy && <button onClick={() => removeShot(s.id)} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, lineHeight: '18px', textAlign: 'center', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>×</button>}
              </div>
            ))}
          </div>
        )}

        {/* Step 2: choose method + apply */}
        {shots.length > 0 && (
          <div style={{ marginTop: 22, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>HOW SHOULD WE EDIT THESE?</div>
            <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, overflow: 'hidden' }}>
              {([['free', 'Free remover'], ['chatgpt', 'ChatGPT'], ['none', 'No edit']] as const).map(([v, label], i) => (
                <button key={v} onClick={() => setMethod(v)} style={{ border: 'none', borderLeft: i ? '1px solid rgba(255,255,255,0.16)' : 'none', padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', background: method === v ? '#d4a843' : 'transparent', color: method === v ? '#080808' : 'rgba(255,255,255,0.6)' }}>{label}</button>
              ))}
            </div>

            {method === 'chatgpt' && (
              <div style={{ marginTop: 14 }}>
                <label style={L}>ChatGPT instructions (edit as you like)</label>
                <textarea value={gptPrompt} onChange={e => setGptPrompt(e.target.value)} style={{ ...input, minHeight: 80, resize: 'vertical' }} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Costs a few cents per photo · ~15–30s each.</div>
              </div>
            )}
            {method === 'free' && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 10 }}>Free, in-browser background removal — keeps the object exactly as shot.</div>}
            {method === 'none' && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginTop: 10 }}>Use the photos as-is, just resized for the web.</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={applyEdit} disabled={busy} style={{ background: busy ? '#3d3833' : '#d4a843', color: '#080808', border: 'none', padding: '12px 20px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', cursor: busy ? 'default' : 'pointer' }}>{applyLabel}{anyDone && !busy ? ' (REDO)' : ''}</button>
              {!busy && <button onClick={clearAll} style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.18)', padding: '12px 16px', fontFamily: 'Inter, sans-serif', fontSize: 12, cursor: 'pointer' }}>Start over</button>}
            </div>
          </div>
        )}

        {/* Step 3: details + save (after an edit is applied) */}
        {anyDone && (
          <div style={{ marginTop: 26, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {analyzing && <div style={{ fontSize: 12, color: '#d4a843' }}>AI is reading the photo…</div>}
            <div><label style={L}>Name</label><input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vintage Rocking Chair" /></div>
            <div><label style={L}>Category</label>
              <select style={input} value={category} onChange={e => setCategory(e.target.value)}>{PROP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
            </div>
            <div><label style={L}>Description</label><textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="One short sentence" /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
              <input type="checkbox" checked={needsRepair} onChange={e => setNeedsRepair(e.target.checked)} /> Needs repair
            </label>
            <button onClick={save} disabled={saving} style={{ background: saving ? '#3d3833' : '#fff', color: '#080808', border: 'none', padding: '13px 18px', fontFamily: '"JetBrains Mono", monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', cursor: saving ? 'default' : 'pointer' }}>{saving ? 'SAVING…' : 'SAVE PROP'}</button>
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

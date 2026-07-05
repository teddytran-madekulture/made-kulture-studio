'use client'
// Equipment + Props catalog managers, extracted from the admin dashboard so they
// can live in the Website workspace (/admin/website/*). One component drives both
// editors because they share the gallery / photo clean-up / upload machinery —
// pass `kind` to choose which manager renders.
import { useState, useEffect, useRef, useCallback } from 'react'
import { PROP_CATEGORIES, type Prop } from '@/lib/props'
import { useIsMobile } from '@/lib/use-is-mobile'

// Default instruction sent to ChatGPT when cleaning a prop photo. Editable per
// image in the clean-up modal. Keep in sync with the fallback in
// app/api/admin/props/clean-image/route.ts.
const DEFAULT_CLEAN_PROMPT = 'Remove the background and place this exact object on a clean, evenly lit, pure white studio background. Keep the object itself unchanged, centered, photorealistic. Do not add any new objects, text, or props.'

// Free, in-browser background remover (same lib the Add-by-Photo flow uses).
// Loaded from a CDN at runtime so the heavy onnx/wasm code isn't bundled.
const BG_REMOVAL_CDN = 'https://esm.sh/@imgly/background-removal@1.7.0'
let _bgPromise: Promise<any> | null = null
async function loadBgRemover(): Promise<(input: Blob | string) => Promise<Blob>> {
  if (!_bgPromise) _bgPromise = import(/* webpackIgnore: true */ BG_REMOVAL_CDN)
  const mod: any = await _bgPromise
  return mod.removeBackground || mod.default?.removeBackground || mod.default
}

interface EquipmentItem {
  id: string
  name: string
  rate: number
  category: 'lighting' | 'modifier' | 'special_effects' | 'camera'
  quantity: number
  description: string | null
  image_url: string | null
  gallery?: string[]
  sort_order: number | null
  is_available: boolean
  allow_offsite: boolean
  deposit: number
  in_use_now: number
  available_now: number
}

interface EquipDraft {
  name: string
  category: string
  rate: string
  quantity: string
  description: string
  image_url: string
  gallery: string[]
  is_available: boolean
  allow_offsite: boolean
}

const EMPTY_EQUIP_DRAFT: EquipDraft = {
  name: '', category: 'lighting', rate: '', quantity: '1',
  description: '', image_url: '', gallery: [], is_available: true, allow_offsite: false,
}

const EQUIP_CATEGORIES: { value: string; label: string }[] = [
  { value: 'lighting',        label: 'Lighting' },
  { value: 'modifier',        label: 'Modifiers' },
  { value: 'special_effects', label: 'Special Effects' },
  { value: 'camera',          label: 'Camera' },
]

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.15em',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 8,
  display: 'block',
}

export default function CatalogManager({ kind }: { kind: 'equipment' | 'props' }) {
  const isMobile = useIsMobile()

  // ── Equipment Manager ────────────────────────────────────────────────────────
  const [equipList,    setEquipList]    = useState<EquipmentItem[]>([])
  const [equipLoading, setEquipLoading] = useState(false)
  const [equipError,   setEquipError]   = useState('')
  const [equipEditId,  setEquipEditId]  = useState<string | null>(null)   // id, 'new', or null
  const [equipDraft,   setEquipDraft]   = useState<EquipDraft>(EMPTY_EQUIP_DRAFT)
  const [equipSaving,  setEquipSaving]  = useState(false)
  const [equipBusyId,  setEquipBusyId]  = useState<string | null>(null)

  // ── Props Manager ───────────────────────────────────────────────────────────
  const [propsList,    setPropsList]    = useState<Prop[]>([])
  const [propsLoading, setPropsLoading] = useState(false)
  const [propEditId,   setPropEditId]   = useState<string | null>(null)   // id, 'new', or null
  const [propDraft,    setPropDraft]    = useState({ name: '', category: '', description: '', image_url: '', gallery: [] as string[], tags: [] as string[], needs_repair: false, is_active: true, sort_order: '0' })
  const [propSaving,   setPropSaving]   = useState(false)
  const [propBusyId,   setPropBusyId]   = useState<string | null>(null)
  const [galleryBusy,  setGalleryBusy]  = useState(false)   // uploading / adding photos
  const [tagInput,     setTagInput]     = useState('')
  const [aiBusy,       setAiBusy]       = useState<'desc' | 'tags' | null>(null)  // AI description / tag suggestion
  const [cleanMethod,  setCleanMethod]  = useState<'chatgpt' | 'free'>('chatgpt') // method for Clean-all
  const [cleanPrompt,  setCleanPrompt]  = useState(DEFAULT_CLEAN_PROMPT)          // editable ChatGPT instruction
  const [batchClean,   setBatchClean]   = useState<{ done: number; total: number } | null>(null)
  const [batchOpen,    setBatchOpen]    = useState<'prop' | 'equip' | null>(null)  // "Clean all" dialog + which editor
  const [propSearch,   setPropSearch]   = useState('')
  const [propCatFilter, setPropCatFilter] = useState('')
  const editFormRef = useRef<HTMLDivElement | null>(null)
  // Clean-up preview modal (per gallery image); method is chosen in the modal.
  const [cleanImg, setCleanImg] = useState<{ index: number; method: 'chatgpt' | 'free'; target: 'prop' | 'equip'; before: string; afterUrl: string | null; afterBlob: Blob | null; busy: boolean; error: string | null } | null>(null)

  const fetchProps = useCallback(async () => {
    setPropsLoading(true)
    const res = await fetch('/api/admin/props', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    setPropsList(data.props ?? [])
    setPropsLoading(false)
  }, [])
  useEffect(() => { if (kind === 'props') fetchProps() }, [kind, fetchProps])

  const scrollToEditor = () => setTimeout(() => editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  const startNewProp  = () => { setPropDraft({ name: '', category: '', description: '', image_url: '', gallery: [], tags: [], needs_repair: false, is_active: true, sort_order: '0' }); setTagInput(''); setPropEditId('new'); scrollToEditor() }
  const startEditProp = (p: Prop) => { setPropDraft({ name: p.name, category: p.category ?? '', description: p.description ?? '', image_url: p.image_url ?? '', gallery: (p.gallery && p.gallery.length ? p.gallery : (p.image_url ? [p.image_url] : [])), tags: p.tags ?? [], needs_repair: p.needs_repair, is_active: p.is_active, sort_order: String(p.sort_order ?? 0) }); setTagInput(''); setPropEditId(p.id); scrollToEditor() }
  const saveProp = async () => {
    if (!propDraft.name.trim()) return
    setPropSaving(true)
    const url    = propEditId === 'new' ? '/api/admin/props' : `/api/admin/props/${propEditId}`
    const method = propEditId === 'new' ? 'POST' : 'PATCH'
    // Keep hero (image_url) in sync with the first gallery image.
    const payload = { ...propDraft, image_url: propDraft.gallery[0] ?? propDraft.image_url ?? '' }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setPropSaving(false)
    if (res.ok) { setPropEditId(null); fetchProps() }
  }

  // ── Gallery editing — shared by the Props and Equipment managers ────────────
  // Each handler takes a `target` ('prop' | 'equip', default 'prop') so the same
  // logic drives both editors, reading/writing that editor's draft gallery and
  // keeping image_url (the hero) in sync with gallery[0].
  const galleryOf = (t: 'prop' | 'equip') => (t === 'equip' ? equipDraft.gallery : propDraft.gallery)
  const applyGallery = (t: 'prop' | 'equip', updater: (g: string[]) => string[]) => {
    if (t === 'equip') setEquipDraft(d => { const g = updater(d.gallery); return { ...d, gallery: g, image_url: g[0] ?? '' } })
    else               setPropDraft(d => { const g = updater(d.gallery); return { ...d, gallery: g, image_url: g[0] ?? '' } })
  }
  const galSetHero = (i: number, t: 'prop' | 'equip' = 'prop') => applyGallery(t, g => { const a = [...g]; const [x] = a.splice(i, 1); a.unshift(x); return a })
  const galRemove  = (i: number, t: 'prop' | 'equip' = 'prop') => applyGallery(t, g => g.filter((_, k) => k !== i))
  const galAddFiles = async (files: FileList | null, t: 'prop' | 'equip' = 'prop') => {
    if (!files || !files.length) return
    setGalleryBusy(true)
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const res = await fetch('/api/admin/props/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.urls)) applyGallery(t, g => [...g, ...data.urls])
      else alert(data.error || 'Upload failed')
    } finally { setGalleryBusy(false) }
  }

  // Produce a cleaned image Blob from an existing image URL, by either method.
  const runClean = async (method: 'chatgpt' | 'free', url: string, prompt?: string): Promise<Blob> => {
    if (method === 'free') {
      const removeBackground = await loadBgRemover()
      // Fetch the image to a Blob first (same as the Add-by-Photo flow). Passing
      // the URL string makes the library do its own fetch, which can come back as
      // text/html and error out.
      const srcRes = await fetch(url, { cache: 'no-store' })
      if (!srcRes.ok) throw new Error(`Could not load the image (${srcRes.status})`)
      const srcBlob = await srcRes.blob()
      const cut = await removeBackground(srcBlob)
      // Flatten the transparent cutout onto white so it matches the site (a
      // transparent PNG shows dark on the dark prop pages). Object stays as shot.
      const bmp = await createImageBitmap(cut)
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width; canvas.height = bmp.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bmp, 0, 0)
      return await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Could not encode image')), 'image/jpeg', 0.92))
    }
    const res = await fetch('/api/admin/props/clean-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: url, prompt: (prompt && prompt.trim()) ? prompt.trim() : undefined }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.imageBase64) throw new Error(data.error || 'Clean-up failed')
    const bin = atob(data.imageBase64); const bytes = new Uint8Array(bin.length)
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k)
    return new Blob([bytes], { type: 'image/png' })
  }
  const uploadBlob = async (blob: Blob): Promise<string> => {
    const fd = new FormData()
    fd.append('files', new File([blob], 'img.png', { type: blob.type || 'image/png' }))
    const res = await fetch('/api/admin/props/upload', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.urls?.[0]) throw new Error(data.error || 'Upload failed')
    return data.urls[0]
  }
  // Open the clean-up modal for image i and generate a preview with `method`.
  const galGen = async (i: number, method: 'chatgpt' | 'free', t: 'prop' | 'equip' = 'prop') => {
    const before = galleryOf(t)[i]
    setCleanImg({ index: i, method, target: t, before, afterUrl: null, afterBlob: null, busy: true, error: null })
    try {
      const blob = await runClean(method, before, cleanPrompt)
      const afterUrl = URL.createObjectURL(blob)
      setCleanImg(c => (c && c.index === i) ? { ...c, method, afterUrl, afterBlob: blob, busy: false } : c)
    } catch (e: any) {
      setCleanImg(c => c ? { ...c, busy: false, error: String(e?.message || e) } : c)
    }
  }
  // Per-image CLEAN button: open the modal idle (no auto-generate).
  const galClean = (i: number, t: 'prop' | 'equip' = 'prop') => setCleanImg({ index: i, method: cleanMethod, target: t, before: galleryOf(t)[i], afterUrl: null, afterBlob: null, busy: false, error: null })
  // Confirm the preview: upload the cleaned image, swap it into the gallery slot.
  const galCleanConfirm = async () => {
    if (!cleanImg?.afterBlob) return
    const t = cleanImg.target
    setCleanImg(c => c ? { ...c, busy: true } : c)
    try {
      const url = await uploadBlob(cleanImg.afterBlob)
      applyGallery(t, g => { const a = [...g]; a[cleanImg.index] = url; return a })
      setCleanImg(null)
    } catch (e: any) {
      setCleanImg(c => c ? { ...c, busy: false, error: String(e?.message || e) } : c)
    }
  }
  // Batch: clean every gallery image with the chosen method + prompt, then
  // replace them. Invoked from the "Clean all" setup dialog (not automatic).
  const runBatchClean = async () => {
    const t = batchOpen === 'equip' ? 'equip' : 'prop'
    const urls = galleryOf(t)
    if (!urls.length) return
    setBatchClean({ done: 0, total: urls.length })
    const out = [...urls]
    for (let i = 0; i < urls.length; i++) {
      try { out[i] = await uploadBlob(await runClean(cleanMethod, urls[i], cleanPrompt)) } catch { /* keep original on failure */ }
      setBatchClean({ done: i + 1, total: urls.length })
    }
    applyGallery(t, () => out)
    setBatchClean(null)
    setBatchOpen(null)
  }

  // ── AI description + tag suggestions (uses the hero image) ──────────────────
  const runAnalyze = async (): Promise<any | null> => {
    const hero = propDraft.gallery[0] || propDraft.image_url
    if (!hero) { alert('Add a photo first.'); return null }
    const blob = await (await fetch(hero, { cache: 'no-store' })).blob()
    const dataUrl: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob) })
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const res = await fetch('/api/admin/props/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageBase64: b64, mediaType: blob.type || 'image/jpeg' }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { alert(data.error || 'AI request failed'); return null }
    return data
  }
  const generateDescription = async () => { setAiBusy('desc'); try { const d = await runAnalyze(); if (d?.description) setPropDraft(p => ({ ...p, description: d.description })) } finally { setAiBusy(null) } }
  const suggestTags = async () => { setAiBusy('tags'); try { const d = await runAnalyze(); if (Array.isArray(d?.tags)) setPropDraft(p => ({ ...p, tags: Array.from(new Set([...p.tags, ...d.tags])) })) } finally { setAiBusy(null) } }

  // ── Tag editing ────────────────────────────────────────────────────────────
  const addTag = (raw: string) => { const t = raw.trim().toLowerCase(); if (!t) return; setPropDraft(d => d.tags.includes(t) ? d : { ...d, tags: [...d.tags, t] }); setTagInput('') }
  const removeTag = (i: number) => setPropDraft(d => ({ ...d, tags: d.tags.filter((_, k) => k !== i) }))
  const patchProp = async (p: Prop, patch: Record<string, unknown>) => {
    setPropBusyId(p.id)
    await fetch(`/api/admin/props/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => {})
    await fetchProps(); setPropBusyId(null)
  }
  const deleteProp = async (p: Prop) => {
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return
    setPropBusyId(p.id)
    await fetch(`/api/admin/props/${p.id}`, { method: 'DELETE' }).catch(() => {})
    await fetchProps(); setPropBusyId(null)
  }

  // ── Equipment Manager helpers ─────────────────────────────────────────────────
  const fetchEquipment = useCallback(async () => {
    setEquipLoading(true); setEquipError('')
    try {
      const res  = await fetch('/api/admin/equipment')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load equipment')
      setEquipList(data.equipment ?? [])
    } catch (e: any) {
      setEquipError(e.message || 'Failed to load equipment')
    }
    setEquipLoading(false)
  }, [])

  useEffect(() => { if (kind === 'equipment') fetchEquipment() }, [kind, fetchEquipment])

  const startNewEquip = () => { setEquipEditId('new'); setEquipDraft(EMPTY_EQUIP_DRAFT); setEquipError('') }

  const startEditEquip = (e: EquipmentItem) => {
    setEquipEditId(e.id); setEquipError('')
    setEquipDraft({
      name:          e.name,
      category:      e.category,
      rate:          String(e.rate),
      quantity:      String(e.quantity),
      description:   e.description ?? '',
      image_url:     e.image_url ?? '',
      gallery:       (e.gallery && e.gallery.length ? e.gallery : (e.image_url ? [e.image_url] : [])),
      is_available:  e.is_available,
      allow_offsite: e.allow_offsite,
    })
  }

  const cancelEditEquip = () => { setEquipEditId(null); setEquipDraft(EMPTY_EQUIP_DRAFT); setEquipError('') }

  const saveEquip = async () => {
    if (!equipDraft.name.trim()) { setEquipError('Equipment name is required'); return }
    setEquipSaving(true); setEquipError('')
    try {
      const isNew = equipEditId === 'new'
      const res = await fetch(isNew ? '/api/admin/equipment' : `/api/admin/equipment/${equipEditId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          equipDraft.name,
          category:      equipDraft.category,
          rate:          equipDraft.rate,
          quantity:      equipDraft.quantity,
          description:   equipDraft.description,
          image_url:     equipDraft.gallery[0] ?? equipDraft.image_url,
          gallery:       equipDraft.gallery,
          is_available:  equipDraft.is_available,
          allow_offsite: equipDraft.allow_offsite,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save equipment')
      cancelEditEquip()
      await fetchEquipment()
    } catch (e: any) {
      setEquipError(e.message || 'Could not save equipment')
    }
    setEquipSaving(false)
  }

  const toggleEquipAvailable = async (e: EquipmentItem) => {
    setEquipBusyId(e.id); setEquipError('')
    try {
      const res = await fetch(`/api/admin/equipment/${e.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !e.is_available }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update equipment')
      await fetchEquipment()
    } catch (err: any) {
      setEquipError(err.message || 'Could not update equipment')
    }
    setEquipBusyId(null)
  }

  const deleteEquip = async (e: EquipmentItem) => {
    if (!confirm(`Delete "${e.name}"? This can't be undone. (If it's on bookings, set it unavailable instead.)`)) return
    setEquipBusyId(e.id); setEquipError('')
    try {
      const res = await fetch(`/api/admin/equipment/${e.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not delete equipment')
      await fetchEquipment()
    } catch (err: any) {
      setEquipError(err.message || 'Could not delete equipment')
    }
    setEquipBusyId(null)
  }

  return (
    <>
      {kind === 'equipment' && (
        <div style={{ paddingBottom: 80 }}>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', marginBottom: 4 }}>EQUIPMENT</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                Manage your gear inventory. &quot;In use&quot; shows units on a booking happening right now. Unavailable items are hidden from customer rentals.
              </div>
            </div>
            {equipEditId === null && (
              <button onClick={startNewEquip} style={{
                background: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', flexShrink: 0,
                fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808',
              }}>
                + NEW ITEM
              </button>
            )}
          </div>

          {equipError && (
            <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.35)', color: '#f0a0a0', padding: '12px 16px', marginBottom: 20, fontSize: 13, lineHeight: 1.5 }}>
              {equipError}
            </div>
          )}

          {/* Create / edit form */}
          {equipEditId !== null && (
            <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: 28, marginBottom: 28 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', marginBottom: 20 }}>
                {equipEditId === 'new' ? 'NEW ITEM' : 'EDIT ITEM'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18, marginBottom: 18 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>NAME</label>
                  <input value={equipDraft.name} onChange={e => setEquipDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Aputure LS 600d Daylight LED Monolight"
                    style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                </div>

                <div>
                  <label style={labelStyle}>CATEGORY</label>
                  <select value={equipDraft.category} onChange={e => setEquipDraft(d => ({ ...d, category: e.target.value }))}
                    style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box', appearance: 'none' as const }}>
                    {EQUIP_CATEGORIES.map(c => <option key={c.value} value={c.value} style={{ background: '#111' }}>{c.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>RATE ($ / booking)</label>
                  <input type="number" value={equipDraft.rate} onChange={e => setEquipDraft(d => ({ ...d, rate: e.target.value }))}
                    style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                </div>

                <div>
                  <label style={labelStyle}>QUANTITY OWNED</label>
                  <input type="number" min={0} value={equipDraft.quantity} onChange={e => setEquipDraft(d => ({ ...d, quantity: e.target.value }))}
                    style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                    <input type="checkbox" checked={equipDraft.is_available} onChange={e => setEquipDraft(d => ({ ...d, is_available: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: '#d4a843' }} />
                    Available
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                    <input type="checkbox" checked={equipDraft.allow_offsite} onChange={e => setEquipDraft(d => ({ ...d, allow_offsite: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: '#d4a843' }} />
                    Off-site OK
                  </label>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>DESCRIPTION (shown to customers)</label>
                  <input value={equipDraft.description} onChange={e => setEquipDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="What it is + key specs"
                    style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={labelStyle}>PHOTOS <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>· first is the hero on the gear catalog</span></label>
                    <label style={{ fontSize: 10, letterSpacing: '0.1em', color: '#080808', background: galleryBusy ? 'rgba(255,255,255,0.3)' : '#fff', padding: '6px 12px', cursor: galleryBusy ? 'wait' : 'pointer', fontWeight: 600 }}>
                      {galleryBusy ? 'UPLOADING…' : '+ ADD PHOTOS'}
                      <input type="file" accept="image/*" multiple disabled={galleryBusy} onChange={e => { galAddFiles(e.target.files, 'equip'); e.currentTarget.value = '' }} style={{ display: 'none' }} />
                    </label>
                  </div>
                  {equipDraft.gallery.length > 1 && (
                    <div style={{ marginBottom: 10 }}>
                      <button type="button" disabled={!!batchClean} onClick={() => setBatchOpen('equip')} style={{ background: 'transparent', border: '1px solid rgba(96,165,250,0.5)', color: '#60a5fa', padding: '6px 14px', cursor: batchClean ? 'default' : 'pointer', fontSize: 10, letterSpacing: '0.08em' }}>{batchClean ? `CLEANING ${batchClean.done}/${batchClean.total}…` : '✨ CLEAN ALL PHOTOS'}</button>
                    </div>
                  )}
                  {equipDraft.gallery.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', border: '1px dashed rgba(255,255,255,0.15)', padding: '18px 12px', textAlign: 'center' }}>No photos yet — add some above.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 100 : 120}px, 1fr))`, gap: 10 }}>
                      {equipDraft.gallery.map((url, i) => (
                        <div key={url + i} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#0a0a0a' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }} />
                            {i === 0 && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 8, letterSpacing: '0.1em', fontWeight: 700, color: '#080808', background: '#d4a843', padding: '2px 5px' }}>HERO</span>}
                          </div>
                          <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            {i !== 0 && (
                              <button type="button" title="Set as hero" onClick={() => galSetHero(i, 'equip')} style={{ flex: 1, background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', padding: '6px 0', cursor: 'pointer', fontSize: 9, letterSpacing: '0.08em' }}>HERO</button>
                            )}
                            <button type="button" title="Clean up the background" onClick={() => galClean(i, 'equip')} style={{ flex: 1, background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', color: '#60a5fa', padding: '6px 0', cursor: 'pointer', fontSize: 9, letterSpacing: '0.08em' }}>CLEAN</button>
                            <button type="button" title="Delete this photo" onClick={() => galRemove(i, 'equip')} style={{ flex: 1, background: 'transparent', border: 'none', color: '#ff6b6b', padding: '6px 0', cursor: 'pointer', fontSize: 9, letterSpacing: '0.08em' }}>DEL</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={saveEquip} disabled={equipSaving} style={{
                  background: '#fff', border: 'none', padding: '11px 24px', cursor: equipSaving ? 'default' : 'pointer', opacity: equipSaving ? 0.6 : 1,
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808',
                }}>
                  {equipSaving ? 'SAVING…' : 'SAVE ITEM'}
                </button>
                <button onClick={cancelEditEquip} disabled={equipSaving} style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '11px 24px', cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)',
                }}>
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {/* List grouped by category */}
          {equipLoading ? (
            <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>LOADING…</div>
          ) : equipList.length === 0 ? (
            <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>NO EQUIPMENT YET</div>
          ) : (
            EQUIP_CATEGORIES.map(cat => {
              const items = equipList.filter(e => e.category === cat.value)
              if (items.length === 0) return null
              return (
                <div key={cat.value} style={{ marginBottom: 32 }}>
                  <div style={{ ...labelStyle, marginBottom: 12, color: 'rgba(255,255,255,0.5)' }}>{cat.label.toUpperCase()}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {items.map(e => (
                      <div key={e.id} style={{
                        background: '#0d0d0d', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 20,
                        opacity: e.is_available ? 1 : 0.5,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500 }}>{e.name}</span>
                            {!e.is_available && (
                              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', padding: '3px 8px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>UNAVAILABLE</span>
                            )}
                            {e.allow_offsite && (
                              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', padding: '3px 8px', background: 'rgba(212,168,67,0.15)', color: '#d4a843' }}>OFF-SITE</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                            ${e.rate} · {e.quantity} owned · <span style={{ color: e.in_use_now > 0 ? '#d4a843' : 'rgba(255,255,255,0.4)' }}>{e.in_use_now} in use now</span> · {e.available_now} free
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button onClick={() => toggleEquipAvailable(e)} disabled={equipBusyId === e.id} style={{
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '7px 14px', cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em',
                            color: e.is_available ? 'rgba(255,255,255,0.45)' : '#d4a843',
                          }}>
                            {equipBusyId === e.id ? '…' : e.is_available ? 'DISABLE' : 'ENABLE'}
                          </button>
                          <button onClick={() => startEditEquip(e)} style={{
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '7px 14px', cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)',
                          }}>
                            EDIT
                          </button>
                          <button onClick={() => deleteEquip(e)} disabled={equipBusyId === e.id} style={{
                            background: 'transparent', border: '1px solid rgba(220,80,80,0.3)', padding: '7px 14px', cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(220,120,120,0.7)',
                          }}>
                            DELETE
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {kind === 'props' && (
        <div style={{ paddingBottom: 80 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', marginBottom: 4 }}>PROPS</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>A browse-only directory of studio props. Hidden props don&apos;t show on the public /props page.</div>
            </div>
            {propEditId === null && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a href="/admin/props/new" style={{ background: '#d4a843', border: 'none', padding: '10px 18px', cursor: 'pointer', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808' }}>+ ADD BY PHOTO</a>
                <button onClick={startNewProp} style={{ background: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808' }}>+ NEW PROP</button>
              </div>
            )}
          </div>

          {/* New / edit form */}
          {propEditId !== null && (
            <div ref={editFormRef} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: '22px 24px', marginBottom: 28, scrollMarginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{propEditId === 'new' ? 'NEW PROP' : 'EDIT PROP'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Name
                  <input value={propDraft.name} onChange={e => setPropDraft(d => ({ ...d, name: e.target.value }))}
                    style={{ width: '100%', marginTop: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '9px 11px', outline: 'none', boxSizing: 'border-box' }} />
                </label>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Category
                  <select value={propDraft.category} onChange={e => setPropDraft(d => ({ ...d, category: e.target.value }))}
                    style={{ width: '100%', marginTop: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '9px 11px', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="" style={{ color: '#000' }}>— none —</option>
                    {PROP_CATEGORIES.map(c => <option key={c} value={c} style={{ color: '#000' }}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Photos <span style={{ color: 'rgba(255,255,255,0.3)' }}>· first image is the hero shown on the /props card</span></span>
                  <label style={{ fontSize: 10, letterSpacing: '0.1em', color: '#080808', background: galleryBusy ? 'rgba(255,255,255,0.3)' : '#fff', padding: '6px 12px', cursor: galleryBusy ? 'wait' : 'pointer', fontWeight: 600 }}>
                    {galleryBusy ? 'UPLOADING…' : '+ ADD PHOTOS'}
                    <input type="file" accept="image/*" multiple disabled={galleryBusy} onChange={e => { galAddFiles(e.target.files); e.currentTarget.value = '' }} style={{ display: 'none' }} />
                  </label>
                </div>
                {propDraft.gallery.length > 1 && (
                  <div style={{ marginBottom: 10 }}>
                    <button disabled={!!batchClean} onClick={() => setBatchOpen('prop')} style={{ background: 'transparent', border: '1px solid rgba(96,165,250,0.5)', color: '#60a5fa', padding: '6px 14px', cursor: batchClean ? 'default' : 'pointer', fontSize: 10, letterSpacing: '0.08em' }}>{batchClean ? `CLEANING ${batchClean.done}/${batchClean.total}…` : '✨ CLEAN ALL PHOTOS'}</button>
                  </div>
                )}
                {propDraft.gallery.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', border: '1px dashed rgba(255,255,255,0.15)', padding: '18px 12px', textAlign: 'center' }}>No photos yet — add some above.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 100 : 120}px, 1fr))`, gap: 10 }}>
                    {propDraft.gallery.map((url, i) => (
                      <div key={url + i} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#0a0a0a' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2' }} />
                          {i === 0 && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 8, letterSpacing: '0.1em', fontWeight: 700, color: '#080808', background: '#d4a843', padding: '2px 5px' }}>HERO</span>}
                        </div>
                        <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                          {i !== 0 && (
                            <button title="Set as hero" onClick={() => galSetHero(i)} style={{ flex: 1, background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)', padding: '6px 0', cursor: 'pointer', fontSize: 9, letterSpacing: '0.08em' }}>HERO</button>
                          )}
                          <button title="Clean up the background with ChatGPT" onClick={() => galClean(i)} style={{ flex: 1, background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.08)', color: '#60a5fa', padding: '6px 0', cursor: 'pointer', fontSize: 9, letterSpacing: '0.08em' }}>CLEAN</button>
                          <button title="Delete this photo" onClick={() => galRemove(i)} style={{ flex: 1, background: 'transparent', border: 'none', color: '#ff6b6b', padding: '6px 0', cursor: 'pointer', fontSize: 9, letterSpacing: '0.08em' }}>DEL</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Description</span>
                  <button type="button" disabled={aiBusy === 'desc'} onClick={generateDescription} style={{ background: 'transparent', border: '1px solid rgba(96,165,250,0.5)', color: '#60a5fa', padding: '4px 10px', cursor: aiBusy === 'desc' ? 'default' : 'pointer', fontSize: 10, letterSpacing: '0.08em' }}>{aiBusy === 'desc' ? 'GENERATING…' : '✨ GENERATE'}</button>
                </div>
                <textarea value={propDraft.description} onChange={e => setPropDraft(d => ({ ...d, description: e.target.value }))}
                  style={{ width: '100%', minHeight: 70, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '9px 11px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Tags <span style={{ color: 'rgba(255,255,255,0.3)' }}>· for search (material, color, style…)</span></span>
                  <button type="button" disabled={aiBusy === 'tags'} onClick={suggestTags} style={{ background: 'transparent', border: '1px solid rgba(96,165,250,0.5)', color: '#60a5fa', padding: '4px 10px', cursor: aiBusy === 'tags' ? 'default' : 'pointer', fontSize: 10, letterSpacing: '0.08em' }}>{aiBusy === 'tags' ? 'SUGGESTING…' : '✨ SUGGEST'}</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 10px' }}>
                  {propDraft.tags.map((t, i) => (
                    <span key={t + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(212,168,67,0.15)', border: '1px solid rgba(212,168,67,0.4)', color: '#e6c67a', fontSize: 11, padding: '3px 8px' }}>{t}
                      <button type="button" onClick={() => removeTag(i)} style={{ background: 'none', border: 'none', color: '#e6c67a', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                  <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
                    onBlur={() => addTag(tagInput)}
                    placeholder={propDraft.tags.length ? 'add…' : 'type a tag, Enter to add'}
                    style={{ flex: 1, minWidth: 100, background: 'transparent', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 18 }}>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={propDraft.is_active} onChange={e => setPropDraft(d => ({ ...d, is_active: e.target.checked }))} style={{ accentColor: '#d4a843' }} /> Show on site
                </label>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={propDraft.needs_repair} onChange={e => setPropDraft(d => ({ ...d, needs_repair: e.target.checked }))} style={{ accentColor: '#f97316' }} /> Needs repair
                </label>
                <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 8 }}>Sort
                  <input type="number" value={propDraft.sort_order} onChange={e => setPropDraft(d => ({ ...d, sort_order: e.target.value }))} style={{ width: 64, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, padding: '6px 8px' }} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button disabled={propSaving || !propDraft.name.trim()} onClick={saveProp} style={{ background: '#d4a843', border: 'none', padding: '8px 18px', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#000', opacity: (propSaving || !propDraft.name.trim()) ? 0.6 : 1 }}>{propSaving ? 'SAVING…' : 'SAVE'}</button>
                <button onClick={() => setPropEditId(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 16px', cursor: 'pointer', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>CANCEL</button>
              </div>
            </div>
          )}

          {/* Search + category filter */}
          {!propsLoading && propsList.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input value={propSearch} onChange={e => setPropSearch(e.target.value)} placeholder="Search name, description, tags…"
                style={{ flex: 1, minWidth: 180, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '8px 11px', outline: 'none', boxSizing: 'border-box' }} />
              <select value={propCatFilter} onChange={e => setPropCatFilter(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '8px 11px', outline: 'none' }}>
                <option value="" style={{ color: '#000' }}>All categories</option>
                {PROP_CATEGORIES.map(c => <option key={c} value={c} style={{ color: '#000' }}>{c}</option>)}
              </select>
              {(propSearch || propCatFilter) && (
                <button onClick={() => { setPropSearch(''); setPropCatFilter('') }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', padding: '8px 12px', cursor: 'pointer', fontSize: 11, letterSpacing: '0.08em' }}>CLEAR</button>
              )}
            </div>
          )}

          {/* List */}
          {propsLoading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading…</div>
          ) : propsList.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No props yet. Add your first one above.</div>
          ) : (() => {
            const q = propSearch.trim().toLowerCase()
            const filtered = propsList.filter(p =>
              (!propCatFilter || p.category === propCatFilter) &&
              (!q || [p.name, p.description, p.category, ...((p.tags as string[]) || [])].filter(Boolean).some(s => String(s).toLowerCase().includes(q)))
            )
            if (!filtered.length) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No props match your search.</div>
            return (
              <>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>{filtered.length} of {propsList.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,0.05)' }}>
                  {filtered.map(p => (
                    <div key={p.id} style={{ background: '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 48, height: 48, flexShrink: 0, background: '#141414', overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.image_url && <img src={p.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: p.is_active ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                          {p.name}
                          {!p.is_active && <span style={{ marginLeft: 8, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.2)', padding: '1px 6px' }}>HIDDEN</span>}
                          {p.needs_repair && <span style={{ marginLeft: 8, fontSize: 9, letterSpacing: '0.1em', color: '#f97316', border: '1px solid rgba(249,115,22,0.4)', padding: '1px 6px' }}>NEEDS REPAIR</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{p.category || '—'}{p.tags && p.tags.length ? <span style={{ color: 'rgba(255,255,255,0.25)' }}> · {(p.tags as string[]).slice(0, 5).join(', ')}</span> : null}</div>
                      </div>
                      <button disabled={propBusyId === p.id} onClick={() => patchProp(p, { is_active: !p.is_active })} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)', padding: '5px 10px', cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em' }}>{p.is_active ? 'HIDE' : 'SHOW'}</button>
                      <button onClick={() => startEditProp(p)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', padding: '5px 10px', cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em' }}>EDIT</button>
                      <button disabled={propBusyId === p.id} onClick={() => deleteProp(p)} style={{ background: 'transparent', border: '1px solid rgba(255,100,100,0.35)', color: '#ff6b6b', padding: '5px 10px', cursor: 'pointer', fontSize: 10, letterSpacing: '0.1em' }}>DELETE</button>
                    </div>
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── PHOTO CLEAN-UP PREVIEW MODAL ─────────────────────────────────── */}
      {cleanImg && (
        <div onClick={() => { if (!cleanImg.busy) setCleanImg(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.14)', padding: 24, maxWidth: 640, width: '100%' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em', marginBottom: 4 }}>CLEAN UP PHOTO</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>{cleanImg.method === 'free' ? 'Free in-browser background removal — keeps the object exactly as shot, on a clean white background.' : 'ChatGPT places the object on a clean white studio background (1024×1024 square).'} Review before replacing.</div>
            {/* Method toggle — switching clears the preview; you press Generate to run */}
            <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.16)', marginBottom: 14 }}>
              {([['chatgpt', 'ChatGPT'], ['free', 'Free remover']] as const).map(([m, label], i) => (
                <button key={m} disabled={cleanImg.busy} onClick={() => setCleanImg(c => c ? { ...c, method: m, afterUrl: null, afterBlob: null, error: null } : c)}
                  style={{ border: 'none', borderLeft: i ? '1px solid rgba(255,255,255,0.16)' : 'none', padding: '7px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', cursor: cleanImg.busy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', background: cleanImg.method === m ? '#d4a843' : 'transparent', color: cleanImg.method === m ? '#080808' : 'rgba(255,255,255,0.6)' }}>{label}</button>
              ))}
            </div>
            {cleanImg.method === 'chatgpt' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>CHATGPT INSTRUCTIONS <span style={{ letterSpacing: 0, color: 'rgba(255,255,255,0.3)' }}>· edit before generating</span></span>
                  {cleanPrompt !== DEFAULT_CLEAN_PROMPT && (
                    <button type="button" onClick={() => setCleanPrompt(DEFAULT_CLEAN_PROMPT)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>reset to default</button>
                  )}
                </div>
                <textarea value={cleanPrompt} onChange={e => setCleanPrompt(e.target.value)} disabled={cleanImg.busy}
                  style={{ width: '100%', minHeight: 58, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 12, lineHeight: 1.5, padding: '8px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            )}
            {/* Explicit Generate button — nothing runs until you click this */}
            <button type="button" disabled={cleanImg.busy} onClick={() => galGen(cleanImg.index, cleanImg.method, cleanImg.target)}
              style={{ marginBottom: 16, background: cleanImg.busy ? 'rgba(96,165,250,0.35)' : 'rgba(96,165,250,0.95)', border: 'none', color: '#08131f', padding: '9px 18px', cursor: cleanImg.busy ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
              {cleanImg.busy ? 'WORKING…' : cleanImg.afterUrl ? '↻ REGENERATE' : (cleanImg.method === 'free' ? '✨ REMOVE BACKGROUND' : '✨ GENERATE')}
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>BEFORE</div>
                <div style={{ aspectRatio: '1', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cleanImg.before} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>AFTER</div>
                {/* checkerboard so transparent (free-remover) results are visible */}
                <div style={{ aspectRatio: '1', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backgroundColor: '#0a0a0a', backgroundImage: 'linear-gradient(45deg,#222 25%,transparent 25%),linear-gradient(-45deg,#222 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#222 75%),linear-gradient(-45deg,transparent 75%,#222 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0px' }}>
                  {cleanImg.busy && !cleanImg.afterUrl ? (
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{cleanImg.method === 'free' ? 'Removing background…' : 'Generating…'}</span>
                  ) : cleanImg.error ? (
                    <span style={{ fontSize: 11, color: '#ff6b6b', padding: 10 }}>{cleanImg.error}</span>
                  ) : cleanImg.afterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cleanImg.afterUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: 10 }}>Press Generate to preview</span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCleanImg(null)} disabled={cleanImg.busy} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 16px', cursor: cleanImg.busy ? 'default' : 'pointer', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)', opacity: cleanImg.busy ? 0.5 : 1 }}>CANCEL</button>
              {cleanImg.error && !cleanImg.busy && (
                <button onClick={() => galGen(cleanImg.index, cleanImg.method, cleanImg.target)} style={{ background: 'transparent', border: '1px solid rgba(96,165,250,0.5)', padding: '8px 16px', cursor: 'pointer', fontSize: 11, letterSpacing: '0.12em', color: '#60a5fa' }}>TRY AGAIN</button>
              )}
              <button onClick={galCleanConfirm} disabled={!cleanImg.afterBlob || cleanImg.busy} style={{ background: (!cleanImg.afterBlob || cleanImg.busy) ? 'rgba(212,168,67,0.4)' : '#d4a843', border: 'none', padding: '8px 18px', cursor: (!cleanImg.afterBlob || cleanImg.busy) ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808' }}>{cleanImg.busy && cleanImg.afterBlob ? 'SAVING…' : 'REPLACE'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CLEAN ALL SETUP DIALOG ────────────────────────────────────── */}
      {batchOpen && (
        <div onClick={() => { if (!batchClean) setBatchOpen(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.14)', padding: 24, maxWidth: 520, width: '100%' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em', marginBottom: 4 }}>CLEAN ALL {(batchOpen === 'equip' ? equipDraft.gallery : propDraft.gallery).length} PHOTOS</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>Pick a method{cleanMethod === 'chatgpt' ? ' and instructions' : ''}, then start. Each photo is processed and replaced — there&apos;s no per-photo preview.</div>
            <div style={{ display: 'inline-flex', border: '1px solid rgba(255,255,255,0.16)', marginBottom: 14 }}>
              {([['chatgpt', 'ChatGPT'], ['free', 'Free remover']] as const).map(([m, label], i) => (
                <button key={m} disabled={!!batchClean} onClick={() => setCleanMethod(m)}
                  style={{ border: 'none', borderLeft: i ? '1px solid rgba(255,255,255,0.16)' : 'none', padding: '7px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', cursor: batchClean ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', background: cleanMethod === m ? '#d4a843' : 'transparent', color: cleanMethod === m ? '#080808' : 'rgba(255,255,255,0.6)' }}>{label}</button>
              ))}
            </div>
            {cleanMethod === 'chatgpt' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>CHATGPT INSTRUCTIONS <span style={{ letterSpacing: 0, color: 'rgba(255,255,255,0.3)' }}>· applied to every photo</span></span>
                  {cleanPrompt !== DEFAULT_CLEAN_PROMPT && (
                    <button type="button" onClick={() => setCleanPrompt(DEFAULT_CLEAN_PROMPT)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}>reset to default</button>
                  )}
                </div>
                <textarea value={cleanPrompt} onChange={e => setCleanPrompt(e.target.value)} disabled={!!batchClean}
                  style={{ width: '100%', minHeight: 58, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 12, lineHeight: 1.5, padding: '8px 10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            )}
            {batchClean && (
              <div style={{ fontSize: 12, color: '#60a5fa', marginBottom: 14 }}>Cleaning {batchClean.done} / {batchClean.total}…</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setBatchOpen(null)} disabled={!!batchClean} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 16px', cursor: batchClean ? 'default' : 'pointer', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)', opacity: batchClean ? 0.5 : 1 }}>CANCEL</button>
              <button onClick={runBatchClean} disabled={!!batchClean} style={{ background: batchClean ? 'rgba(212,168,67,0.4)' : '#d4a843', border: 'none', padding: '8px 18px', cursor: batchClean ? 'default' : 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808' }}>{batchClean ? 'WORKING…' : `CLEAN ALL ${(batchOpen === 'equip' ? equipDraft.gallery : propDraft.gallery).length}`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'
import { useEffect, useRef, useState } from 'react'
import PhotoCreditsEditor from '@/components/PhotoCreditsEditor'
import { createClient } from '@/lib/supabase/client'
import ImageCropper from '@/components/ImageCropper'
import { stampCopyright } from '@/lib/jpeg-copyright'

export const PORTFOLIO_MAX = 12 // base cap; Founding Creatives get 15 (lib/founding.ts, migration 120)
export const PORTFOLIO_ASPECT = 4 / 5 // width / height — Instagram-style portrait

type Img = { id: string; url: string; is_mature: boolean; sort_order: number }

export default function PortfolioManager({ onCountChange, ownerName = '' }: { onCountChange?: (n: number) => void; ownerName?: string }) {
  const supabase = createClient()
  const [images, setImages] = useState<Img[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [agreed, setAgreed] = useState(false)
  // Photo cap for THIS member: 12, or 15 for Founding Creatives. The database
  // trigger enforces the same number; this just keeps the UI honest.
  const [max, setMax] = useState(PORTFOLIO_MAX)
  const maxRef = useRef(PORTFOLIO_MAX)
  maxRef.current = max
  const [foundingNo, setFoundingNo] = useState<number | null>(null)
  const [progress, setProgress] = useState('')      // "2 of 5" during a multi-photo upload
  const [dropActive, setDropActive] = useState(false) // files being dragged over the grid
  const dropDepth = useRef(0)

  // Cropper state: which image we're composing, and where the result goes.
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropCross, setCropCross] = useState(false)
  const [cropReplaceId, setCropReplaceId] = useState<string | null>(null)
  const [cropRevoke, setCropRevoke] = useState<string | null>(null)

  // Drag-to-reorder state. dragId drives the visual "lifted" tile; refs hold the
  // live values the pointer handlers need without stale closures.
  const [dragId, setDragId] = useState<string | null>(null)
  // Photo whose credits editor is open (migration 133).
  const [creditFor, setCreditFor] = useState<Img | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const imagesRef = useRef<Img[]>([])
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  imagesRef.current = images

  // Keep the ref current immediately so back-to-back uploads (multi-select / drop)
  // see each other's rows without waiting for a re-render.
  const sync = (list: Img[]) => { imagesRef.current = list; setImages(list); onCountChange?.(list.length) }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('portfolio_images')
        .select('id, url, is_mature, sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
      const list = (data as Img[]) ?? []
      sync(list)
      if (list.length > 0) setAgreed(true)
      setLoading(false)
      fetch('/api/founding', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
        if (d?.portfolioMax) setMax(d.portfolioMax)
        if (d?.mine) setFoundingNo(d.mine)
      }).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCropForFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    if (file.size > 60 * 1024 * 1024) { setError('That image is over 60 MB.'); return }
    const url = URL.createObjectURL(file)
    setError(''); setCropSrc(url); setCropCross(false); setCropReplaceId(null); setCropRevoke(url)
  }

  // Center-crop a file to the portfolio's 4:5 frame (same output as the cropper:
  // 1000px wide JPEG). Used for multi-photo uploads — reframe later with ⟳.
  const centerCrop = async (file: File): Promise<Blob> => {
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('load'))
        el.src = url
      })
      const w = img.naturalWidth, h = img.naturalHeight
      let sW = w, sH = Math.round(w / PORTFOLIO_ASPECT)
      if (sH > h) { sH = h; sW = Math.round(h * PORTFOLIO_ASPECT) }
      const sx = Math.round((w - sW) / 2), sy = Math.round((h - sH) / 2)
      const outW = Math.min(1000, sW), outH = Math.round(outW / PORTFOLIO_ASPECT)
      const canvas = document.createElement('canvas')
      canvas.width = outW; canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH)
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85))
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  // Entry point for the file picker AND drag-and-drop. One photo opens the
  // cropper like before; several are center-cropped and uploaded in order.
  const addFiles = async (list: File[]) => {
    if (uploading) return
    if (!agreed) { setError('Check the box above first.'); return }
    const files = list.filter(f => f.type.startsWith('image/'))
    if (files.length === 0) { setError('Please choose image files.'); return }
    const room = maxRef.current - imagesRef.current.length
    if (room <= 0) { setError(`You've reached the ${maxRef.current}-photo limit.`); return }
    if (files.length === 1) { openCropForFile(files[0]); return }

    const tooBig = files.filter(f => f.size > 60 * 1024 * 1024)
    const usable = files.filter(f => f.size <= 60 * 1024 * 1024)
    const batch = usable.slice(0, room)
    const notes: string[] = []
    if (tooBig.length) notes.push(`${tooBig.length} skipped (over 60 MB)`)
    if (usable.length > room) notes.push(`${usable.length - room} skipped (${maxRef.current}-photo limit)`)

    setError(''); setUploading(true)
    let failed = 0
    for (let i = 0; i < batch.length; i++) {
      setProgress(`${i + 1} of ${batch.length}`)
      try {
        const blob = await centerCrop(batch[i])
        const ok = await uploadBlob(blob, null, false)
        if (!ok) failed++
      } catch { failed++ }
    }
    setProgress(''); setUploading(false)
    if (failed) notes.push(`${failed} failed to upload`)
    if (notes.length) setError(`Added ${batch.length - failed}. ${notes.join(', ')}.`)
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault(); dropDepth.current++; setDropActive(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    dropDepth.current = Math.max(0, dropDepth.current - 1)
    if (dropDepth.current === 0) setDropActive(false)
  }
  const onDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault(); dropDepth.current = 0; setDropActive(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const openCropForExisting = (img: Img) => {
    setError(''); setCropSrc(img.url); setCropCross(true); setCropReplaceId(img.id); setCropRevoke(null)
  }

  const closeCrop = () => {
    if (cropRevoke) URL.revokeObjectURL(cropRevoke)
    setCropSrc(null); setCropReplaceId(null); setCropRevoke(null); setCropCross(false)
  }

  const onCropped = async (blob: Blob) => {
    const replaceId = cropReplaceId
    closeCrop()
    await uploadBlob(blob, replaceId)
  }

  const uploadBlob = async (blob: Blob, replaceId: string | null, manageBusy = true): Promise<boolean> => {
    if (manageBusy) setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Please sign in again.'); return false }
    if (!replaceId && imagesRef.current.length >= maxRef.current) { setError(`You've reached the ${maxRef.current}-photo limit.`); return false }
    const setBusy = (v: boolean) => { if (manageBusy) setUploading(v) }
    setBusy(true)
    const images = imagesRef.current
    try {
      const path = `${user.id}/${crypto.randomUUID()}.jpg`
      // blob is already canvas re-encoded (all hidden data stripped); add back only the copyright credit.
      const stamped = await stampCopyright(blob, ownerName)
      const { error: upErr } = await supabase.storage
        .from('portfolios').upload(path, stamped, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { setError(upErr.message); setBusy(false); return false }
      const { data: pub } = supabase.storage.from('portfolios').getPublicUrl(path)

      if (replaceId) {
        const old = images.find(i => i.id === replaceId)
        const { error: updErr } = await supabase
          .from('portfolio_images').update({ url: pub.publicUrl }).eq('id', replaceId)
        if (updErr) {
          await supabase.storage.from('portfolios').remove([path])
          setError(updErr.message); setBusy(false); return false
        }
        sync(images.map(i => (i.id === replaceId ? { ...i, url: pub.publicUrl } : i)))
        const oldPath = old?.url?.split('/portfolios/')[1]?.split('?')[0]
        if (oldPath) await supabase.storage.from('portfolios').remove([oldPath])
      } else {
        const nextOrder = images.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1
        const { data: row, error: insErr } = await supabase
          .from('portfolio_images')
          .insert({ user_id: user.id, url: pub.publicUrl, sort_order: nextOrder, is_mature: false })
          .select('id, url, is_mature, sort_order')
          .single()
        if (insErr) {
          await supabase.storage.from('portfolios').remove([path])
          setError(insErr.message.includes('limit') ? `You've reached the ${maxRef.current}-photo limit.` : insErr.message)
          setBusy(false); return false
        }
        sync([...images, row as Img])
      }
    } catch {
      setError('Upload failed.')
      setBusy(false); return false
    }
    setBusy(false)
    return true
  }

  const removeImage = async (img: Img) => {
    const { error: delErr } = await supabase.from('portfolio_images').delete().eq('id', img.id)
    if (delErr) { setError(delErr.message); return }
    const path = img.url.split('/portfolios/')[1]?.split('?')[0]
    if (path) await supabase.storage.from('portfolios').remove([path])
    sync(images.filter(i => i.id !== img.id))
  }

  const toggleMature = async (img: Img) => {
    const next = !img.is_mature
    sync(images.map(i => (i.id === img.id ? { ...i, is_mature: next } : i)))
    const { error: upErr } = await supabase.from('portfolio_images').update({ is_mature: next }).eq('id', img.id)
    if (upErr) { setError(upErr.message); sync(images.map(i => (i.id === img.id ? { ...i, is_mature: img.is_mature } : i))) }
  }

  // ── Drag to reorder (works with mouse and touch via Pointer Events) ──────────
  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch {}
    dragIdRef.current = id
    setDragId(id)
  }

  const onDragMove = (e: React.PointerEvent) => {
    const curId = dragIdRef.current
    if (!curId) return
    e.preventDefault()
    const x = e.clientX, y = e.clientY
    let overId: string | null = null
    for (const [id, el] of tileRefs.current) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { overId = id; break }
    }
    if (!overId || overId === curId) return
    setImages(prev => {
      const from = prev.findIndex(i => i.id === curId)
      const to   = prev.findIndex(i => i.id === overId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const endDrag = (e: React.PointerEvent) => {
    if (!dragIdRef.current) return
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId) } catch {}
    dragIdRef.current = null
    setDragId(null)
    // Persist the final order: write each image's new index as its sort_order,
    // but only for the rows that actually changed.
    const list = imagesRef.current
    const changed = list
      .map((img, idx) => ({ img, idx }))
      .filter(({ img, idx }) => img.sort_order !== idx)
    if (changed.length === 0) return
    setImages(list.map((img, idx) => ({ ...img, sort_order: idx })))
    Promise.allSettled(
      changed.map(({ img, idx }) =>
        supabase.from('portfolio_images').update({ sort_order: idx }).eq('id', img.id))
    ).then(results => {
      if (results.some(r => r.status === 'rejected')) setError('Could not save the new order — refresh and try again.')
    })
  }

  const atMax = images.length >= max
  const iconBtn: React.CSSProperties = { background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', fontSize: 12, lineHeight: 1 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>
          Up to {max} photos{foundingNo ? ` (First 100 perk)` : ''}. Add several at once or drop them in, drag to reorder, mark sensitive work 18+.
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, color: atMax ? 'var(--t-gold)' : 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))' }}>
          {images.length} / {max}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '10px 14px', fontFamily: 'Inter', fontSize: 12, color: 'var(--t-err)', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!loading && !atMax && !agreed && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', lineHeight: 1.5, marginBottom: 12 }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>I own or have the rights to these images, everyone shown is 18 or older and has consented, and this content follows Made Kulture&apos;s{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t-gold)' }} onClick={e => e.stopPropagation()}>content standards</a>.
          </span>
        </label>
      )}

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>Loading…</div>
      ) : (
        <>
        <style>{`
          .pm-controls { opacity: 0; transition: opacity .15s; }
          .pm-tile:hover .pm-controls { opacity: 1; }
          .pm-tile.pm-dragging .pm-controls { opacity: 1; }
          @media (hover: none) { .pm-controls { opacity: 1; } .pm-drop-hint { display: none; } }
        `}</style>
        <div onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, position: 'relative', borderRadius: 8, outline: dropActive ? '2px dashed #e6c07a' : 'none', outlineOffset: 6, transition: 'outline-color .15s' }}>
          {dropActive && (
            <div style={{ position: 'absolute', inset: -6, zIndex: 10, borderRadius: 8, background: 'rgba(8,8,8,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontFamily: 'Inter', fontSize: 13, color: '#e6c07a', textAlign: 'center', padding: 12 }}>
              {atMax ? `Portfolio is full (${max} photos)` : !agreed ? 'Check the box above first' : 'Drop photos to add them'}
            </div>
          )}
          {images.map((img) => {
            const active = dragId === img.id
            return (
            <div key={img.id}
              ref={el => { if (el) tileRefs.current.set(img.id, el); else tileRefs.current.delete(img.id) }}
              className={`pm-tile${active ? ' pm-dragging' : ''}`}
              style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', background: 'var(--t-surface)', transition: 'transform .12s ease', transform: active ? 'scale(1.04)' : 'none', outline: active ? '2px solid #e6c07a' : 'none', zIndex: active ? 5 : 'auto', opacity: active ? 0.92 : 1 }}>
              <img src={img.url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: img.is_mature ? 'blur(8px)' : 'none' }} />
              {img.is_mature && (
                <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#e6c07a', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 3 }}>18+</div>
              )}
              <div className="pm-controls" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 5, background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 30%, transparent 55%, rgba(0,0,0,0.65))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" onClick={() => openCropForExisting(img)} title="Recompose" style={iconBtn}>⟳</button>
                  <button type="button" onClick={() => removeImage(img)} title="Delete" style={iconBtn}>✕</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <button type="button" title="Drag to reorder"
                    onPointerDown={e => startDrag(e, img.id)}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{ ...iconBtn, width: 30, height: 22, cursor: active ? 'grabbing' : 'grab', touchAction: 'none', letterSpacing: '1px' }}>⠿</button>
                  <button type="button" onClick={() => setCreditFor(img)} title="Credit the people in this photo"
                    style={{ ...iconBtn, width: 'auto', padding: '0 6px', height: 22, fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>@ TAG</button>
                  <button type="button" onClick={() => toggleMature(img)} title="Toggle 18+"
                    style={{ background: img.is_mature ? '#e6c07a' : 'rgba(0,0,0,0.65)', color: img.is_mature ? '#080808' : '#fff', border: 'none', borderRadius: 4, padding: '0 6px', height: 22, cursor: 'pointer', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>18+</button>
                </div>
              </div>
            </div>
            )
          })}

          {!atMax && (
            <label title={!agreed ? 'Check the box above first' : undefined}
              style={{ aspectRatio: '4 / 5', borderRadius: 6, border: '1px dashed rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: (uploading || !agreed) ? 'default' : 'pointer', color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))', background: 'rgba(var(--t-fg-rgb), calc(0.02 * var(--t-a)))', opacity: agreed ? 1 : 0.4 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{uploading ? '…' : '+'}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 11 }}>{uploading ? (progress ? `Uploading ${progress}` : 'Uploading') : 'Add photos'}</span>
              {!uploading && <span className="pm-drop-hint" style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))' }}>or drop them here</span>}
              <input type="file" accept="image/*" multiple disabled={uploading || !agreed}
                onChange={e => { const list = Array.from(e.target.files ?? []); e.target.value = ''; if (list.length) addFiles(list) }}
                style={{ display: 'none' }} />
            </label>
          )}
        </div>
        </>
      )}

      {creditFor && (
        <PhotoCreditsEditor imageId={creditFor.id} imageUrl={creditFor.url} onClose={() => setCreditFor(null)} />
      )}

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={PORTFOLIO_ASPECT}
          crossOrigin={cropCross}
          onCancel={closeCrop}
          onCropped={onCropped}
        />
      )}
    </div>
  )
}

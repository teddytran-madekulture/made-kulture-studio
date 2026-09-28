'use client'
// Browser side of a library upload: shrink the photo BEFORE it leaves the
// browser (Vercel refuses request bodies over 4.5 MB, and a phone photo is
// often 5-12 MB), make a small grid thumbnail, then POST both.
import { MAX_EDGE, THUMB_EDGE, ACCEPT, type MediaItem } from './media-core'

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)          // object URL kept until draw; revoked below
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read ${file.name}`)) }
    img.src = url
  })
}

function encode(img: HTMLImageElement, maxEdge: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve({ blob: b, w, h }) : reject(new Error('Encode failed')), 'image/jpeg', quality))
}

export async function uploadToLibrary(file: File, opts: { categoryId?: string | null } = {}): Promise<MediaItem> {
  if (!ACCEPT.includes(file.type)) throw new Error(`${file.name}: use a JPG, PNG or WebP photo`)
  const img = await loadImage(file)
  try {
    let full = await encode(img, MAX_EDGE, 0.88)
    if (full.blob.size > 4_000_000) full = await encode(img, MAX_EDGE, 0.75)
    const thumb = await encode(img, THUMB_EDGE, 0.8)
    const fd = new FormData()
    fd.append('file', new File([full.blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' }))
    fd.append('thumb', new File([thumb.blob], 'thumb.jpg', { type: 'image/jpeg' }))
    fd.append('width', String(full.w)); fd.append('height', String(full.h))
    fd.append('name', file.name)
    if (opts.categoryId) fd.append('category_id', opts.categoryId)
    const r = await fetch('/api/admin/media', { method: 'POST', body: fd })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || `Upload failed (${r.status})`)
    return d.item as MediaItem
  } finally {
    URL.revokeObjectURL(img.src)
  }
}

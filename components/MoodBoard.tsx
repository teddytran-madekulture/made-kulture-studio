'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Img = { url: string }
const MAX = 6

// Downscale to a sane size before upload (keeps aspect ratio).
function resizeToBlob(file: File, maxDim = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (Math.max(width, height) > maxDim) {
        const s = maxDim / Math.max(width, height)
        width = Math.round(width * s); height = Math.round(height * s)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no ctx')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('no blob'))), 'image/jpeg', quality)
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('bad image'))
    img.src = URL.createObjectURL(file)
  })
}

export default function MoodBoard({ castingId, canEdit, initial }: { castingId: string; canEdit: boolean; initial: Img[] }) {
  const supabase = createClient()
  const [images, setImages] = useState<Img[]>(initial ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)

  const persist = async (next: Img[]) => {
    setImages(next)
    await fetch(`/api/castings/${castingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood_board: next }),
    }).catch(() => setError('Could not save the mood board.'))
  }

  const onFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please choose an image.'); return }
    if (images.length >= MAX) { setError(`Up to ${MAX} images.`); return }
    setBusy(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in again.'); setBusy(false); return }
      const blob = await resizeToBlob(file)
      const path = `${user.id}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage.from('casting-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { setError(upErr.message); setBusy(false); return }
      const { data: pub } = supabase.storage.from('casting-media').getPublicUrl(path)
      await persist([...images, { url: pub.publicUrl }])
    } catch {
      setError('Upload failed.')
    }
    setBusy(false)
  }

  const remove = async (url: string) => {
    await persist(images.filter(i => i.url !== url))
    const path = url.split('/casting-media/')[1]?.split('?')[0]
    if (path) await supabase.storage.from('casting-media').remove([path]).catch(() => {})
  }

  if (!canEdit && images.length === 0) return null

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>MOOD BOARD</div>
      {error && <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
        {images.map(img => (
          <div key={img.url} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#141414' }}>
            <img src={img.url} alt="" onClick={() => setLightbox(img.url)} style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }} />
            {canEdit && (
              <button type="button" onClick={() => remove(img.url)} title="Remove"
                style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 12 }}>✕</button>
            )}
          </div>
        ))}
        {canEdit && images.length < MAX && (
          <label style={{ aspectRatio: '1 / 1', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: busy ? 'default' : 'pointer', color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{busy ? '…' : '+'}</span>
            <span style={{ fontFamily: 'Inter', fontSize: 10 }}>{busy ? 'Uploading' : 'Add'}</span>
            <input type="file" accept="image/*" disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
              style={{ display: 'none' }} />
          </label>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export const PORTFOLIO_MAX = 12

type Img = { id: string; url: string; is_mature: boolean; sort_order: number }

// Downscale + JPEG-compress in the browser before upload. Portfolio images show
// larger than avatars, so cap the long side at 1600px @ ~0.82 quality — usually
// 150–350 KB per image instead of multi-MB.
function resizeImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no canvas')); return }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('load failed'))
    img.src = URL.createObjectURL(file)
  })
}

export default function PortfolioManager({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const supabase = createClient()
  const [images, setImages] = useState<Img[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const sync = (list: Img[]) => { setImages(list); onCountChange?.(list.length) }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('portfolio_images')
        .select('id, url, is_mature, sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
      sync((data as Img[]) ?? [])
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Please sign in again.'); return }

    const room = PORTFOLIO_MAX - images.length
    if (room <= 0) { setError(`You've reached the ${PORTFOLIO_MAX}-photo limit.`); return }
    const batch = Array.from(files).slice(0, room)
    setUploading(true)
    let nextOrder = images.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1
    const added: Img[] = []

    for (const file of batch) {
      try {
        if (!file.type.startsWith('image/')) continue
        // We downscale/compress every image below, so accept large high-res
        // originals; only reject truly enormous files that could crash decode.
        if (file.size > 60 * 1024 * 1024) { setError('Skipped an image over 60 MB.'); continue }
        let blob: Blob = file
        try { blob = await resizeImage(file) } catch { /* fall back to original */ }
        const path = `${user.id}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage
          .from('portfolios').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
        if (upErr) { setError(upErr.message); continue }
        const { data: pub } = supabase.storage.from('portfolios').getPublicUrl(path)
        const { data: row, error: insErr } = await supabase
          .from('portfolio_images')
          .insert({ user_id: user.id, url: pub.publicUrl, sort_order: nextOrder++, is_mature: false })
          .select('id, url, is_mature, sort_order')
          .single()
        if (insErr) {
          // roll back the orphaned upload if the row insert failed (e.g. cap trigger)
          await supabase.storage.from('portfolios').remove([path])
          setError(insErr.message.includes('limit') ? `You've reached the ${PORTFOLIO_MAX}-photo limit.` : insErr.message)
          continue
        }
        added.push(row as Img)
      } catch {
        setError('One image failed to upload.')
      }
    }
    sync([...images, ...added])
    setUploading(false)
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

  // Swap sort_order with the neighbour in the given direction.
  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= images.length) return
    const a = images[index], b = images[j]
    const reordered = [...images]
    reordered[index] = b; reordered[j] = a
    sync(reordered)
    await Promise.allSettled([
      supabase.from('portfolio_images').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('portfolio_images').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    // keep local sort_order values consistent after the swap
    const swapped = [...reordered]
    const tmp = swapped[index].sort_order
    swapped[index] = { ...swapped[index], sort_order: swapped[j].sort_order }
    swapped[j] = { ...swapped[j], sort_order: tmp }
    setImages(swapped)
  }

  const atMax = images.length >= PORTFOLIO_MAX

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          Up to {PORTFOLIO_MAX} photos. Drag order with the arrows. Mark sensitive work 18+.
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, color: atMax ? '#e6c07a' : 'rgba(255,255,255,0.4)' }}>
          {images.length} / {PORTFOLIO_MAX}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '10px 14px', fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {images.map((img, i) => (
            <div key={img.id} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#141414' }}>
              <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: img.is_mature ? 'blur(8px)' : 'none' }} />
              {img.is_mature && (
                <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#e6c07a', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 3 }}>18+</div>
              )}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 5, opacity: 0, transition: 'opacity .15s', background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 30%, transparent 60%, rgba(0,0,0,0.6))' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => removeImage(img)} title="Delete"
                    style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move left"
                      style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, fontSize: 12 }}>←</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} title="Move right"
                      style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: 4, width: 22, height: 22, cursor: i === images.length - 1 ? 'default' : 'pointer', opacity: i === images.length - 1 ? 0.3 : 1, fontSize: 12 }}>→</button>
                  </div>
                  <button type="button" onClick={() => toggleMature(img)} title="Toggle 18+"
                    style={{ background: img.is_mature ? '#e6c07a' : 'rgba(0,0,0,0.65)', color: img.is_mature ? '#080808' : '#fff', border: 'none', borderRadius: 4, padding: '0 6px', height: 22, cursor: 'pointer', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>18+</button>
                </div>
              </div>
            </div>
          ))}

          {!atMax && (
            <label style={{ aspectRatio: '1 / 1', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: uploading ? 'default' : 'pointer', color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{uploading ? '…' : '+'}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 11 }}>{uploading ? 'Uploading' : 'Add photos'}</span>
              <input type="file" accept="image/*" multiple disabled={uploading}
                onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
                style={{ display: 'none' }} />
            </label>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ImageCropper from '@/components/ImageCropper'

export const PORTFOLIO_MAX = 12
export const PORTFOLIO_ASPECT = 4 / 5 // width / height — Instagram-style portrait

type Img = { id: string; url: string; is_mature: boolean; sort_order: number }

export default function PortfolioManager({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const supabase = createClient()
  const [images, setImages] = useState<Img[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [agreed, setAgreed] = useState(false)

  // Cropper state: which image we're composing, and where the result goes.
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropCross, setCropCross] = useState(false)
  const [cropReplaceId, setCropReplaceId] = useState<string | null>(null)
  const [cropRevoke, setCropRevoke] = useState<string | null>(null)

  const sync = (list: Img[]) => { setImages(list); onCountChange?.(list.length) }

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
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCropForFile = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    if (file.size > 60 * 1024 * 1024) { setError('That image is over 60 MB.'); return }
    const url = URL.createObjectURL(file)
    setError(''); setCropSrc(url); setCropCross(false); setCropReplaceId(null); setCropRevoke(url)
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

  const uploadBlob = async (blob: Blob, replaceId: string | null) => {
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Please sign in again.'); return }
    if (!replaceId && images.length >= PORTFOLIO_MAX) { setError(`You've reached the ${PORTFOLIO_MAX}-photo limit.`); return }
    setUploading(true)
    try {
      const path = `${user.id}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage
        .from('portfolios').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) { setError(upErr.message); setUploading(false); return }
      const { data: pub } = supabase.storage.from('portfolios').getPublicUrl(path)

      if (replaceId) {
        const old = images.find(i => i.id === replaceId)
        const { error: updErr } = await supabase
          .from('portfolio_images').update({ url: pub.publicUrl }).eq('id', replaceId)
        if (updErr) {
          await supabase.storage.from('portfolios').remove([path])
          setError(updErr.message); setUploading(false); return
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
          setError(insErr.message.includes('limit') ? `You've reached the ${PORTFOLIO_MAX}-photo limit.` : insErr.message)
          setUploading(false); return
        }
        sync([...images, row as Img])
      }
    } catch {
      setError('Upload failed.')
    }
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
    const swapped = [...reordered]
    const tmp = swapped[index].sort_order
    swapped[index] = { ...swapped[index], sort_order: swapped[j].sort_order }
    swapped[j] = { ...swapped[j], sort_order: tmp }
    setImages(swapped)
  }

  const atMax = images.length >= PORTFOLIO_MAX
  const iconBtn: React.CSSProperties = { background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', fontSize: 12, lineHeight: 1 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          Up to {PORTFOLIO_MAX} photos. Frame each shot, drag to reorder, mark sensitive work 18+.
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

      {!loading && !atMax && !agreed && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: 12 }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>I own or have the rights to these images, everyone shown is 18 or older and has consented, and this content follows Made Kulture&apos;s{' '}
            <a href="https://madekulture.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#e6c07a' }} onClick={e => e.stopPropagation()}>content standards</a>.
          </span>
        </label>
      )}

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {images.map((img, i) => (
            <div key={img.id} style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#141414' }}>
              <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: img.is_mature ? 'blur(8px)' : 'none' }} />
              {img.is_mature && (
                <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: '#e6c07a', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 3 }}>18+</div>
              )}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 5, opacity: 0, transition: 'opacity .15s', background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 30%, transparent 55%, rgba(0,0,0,0.65))' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" onClick={() => openCropForExisting(img)} title="Recompose" style={iconBtn}>⟳</button>
                  <button type="button" onClick={() => removeImage(img)} title="Delete" style={iconBtn}>✕</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move left"
                      style={{ ...iconBtn, width: 22, height: 22, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>←</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} title="Move right"
                      style={{ ...iconBtn, width: 22, height: 22, opacity: i === images.length - 1 ? 0.3 : 1, cursor: i === images.length - 1 ? 'default' : 'pointer' }}>→</button>
                  </div>
                  <button type="button" onClick={() => toggleMature(img)} title="Toggle 18+"
                    style={{ background: img.is_mature ? '#e6c07a' : 'rgba(0,0,0,0.65)', color: img.is_mature ? '#080808' : '#fff', border: 'none', borderRadius: 4, padding: '0 6px', height: 22, cursor: 'pointer', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>18+</button>
                </div>
              </div>
            </div>
          ))}

          {!atMax && (
            <label title={!agreed ? 'Check the box above first' : undefined}
              style={{ aspectRatio: '4 / 5', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: (uploading || !agreed) ? 'default' : 'pointer', color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.02)', opacity: agreed ? 1 : 0.4 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{uploading ? '…' : '+'}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 11 }}>{uploading ? 'Uploading' : 'Add photo'}</span>
              <input type="file" accept="image/*" disabled={uploading || !agreed}
                onChange={e => { const f = e.target.files?.[0]; if (f) openCropForFile(f); e.target.value = '' }}
                style={{ display: 'none' }} />
            </label>
          )}
        </div>
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

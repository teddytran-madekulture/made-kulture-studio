'use client'

// Sets catalog manager — the customer-facing set PRESENTATION (hero + gallery +
// description + display fields), managed in the Website workspace alongside the
// Props and Equipment catalogs. It edits the same `sets` rows as the dashboard's
// Products & Pricing screen, but only touches presentation fields — the booking
// fields (rate, min hours, capacity, slug) stay in Products & Pricing and are
// shown here read-only. Hero photo is kept in sync with gallery[0], matching the
// props/equipment convention. Uploads go to /api/admin/sets/upload (site bucket).

import { useEffect, useState } from 'react'

type SetRow = {
  id: string
  name: string
  slug: string
  description: string | null
  rate_per_hour: number
  min_hours: number | null
  capacity: number | null
  features: string[] | null
  photo_url: string | null
  dimensions: string | null
  sort_order: number | null
  category: string | null
  gallery: string[] | null
  is_active: boolean
}

type Draft = {
  description: string
  dimensions: string
  features: string
  sort_order: string
  category: string
  gallery: string[]
}

const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }
const labelStyle: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase' }
const inputStyle: React.CSSProperties = { width: '100%', background: '#0b0b0d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#f4f4f5', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '9px 11px', boxSizing: 'border-box' }
const btn = (primary = false): React.CSSProperties => ({ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', padding: '9px 16px', borderRadius: 6, cursor: 'pointer', border: primary ? 'none' : '1px solid rgba(255,255,255,0.18)', background: primary ? '#fff' : 'transparent', color: primary ? '#080808' : 'rgba(255,255,255,0.75)' })

export default function SetsCatalogManager() {
  const [sets, setSets] = useState<SetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/sets', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load sets')
      setSets((data.sets || []).sort((a: SetRow, b: SetRow) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function startEdit(s: SetRow) {
    setEditId(s.id)
    setSavedId(null)
    const gallery = s.gallery && s.gallery.length ? [...s.gallery] : (s.photo_url ? [s.photo_url] : [])
    setDraft({
      description: s.description ?? '',
      dimensions: s.dimensions ?? '',
      features: (s.features ?? []).join(', '),
      sort_order: String(s.sort_order ?? 0),
      category: s.category ?? 'standard',
      gallery,
    })
  }
  function cancel() { setEditId(null); setDraft(null) }

  function updateGallery(fn: (g: string[]) => string[]) {
    setDraft(d => (d ? { ...d, gallery: fn(d.gallery) } : d))
  }
  const makeHero = (i: number) => updateGallery(g => { const a = [...g]; const [x] = a.splice(i, 1); a.unshift(x); return a })
  const removeImg = (i: number) => updateGallery(g => g.filter((_, k) => k !== i))
  const moveLeft = (i: number) => updateGallery(g => { if (i <= 0) return g; const a = [...g]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a })
  const moveRight = (i: number) => updateGallery(g => { if (i >= g.length - 1) return g; const a = [...g]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a })

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || !files.length) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      Array.from(files).forEach(f => fd.append('files', f))
      const res = await fetch('/api/admin/sets/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !Array.isArray(data.urls)) throw new Error(data.error || 'Upload failed')
      updateGallery(g => [...g, ...data.urls])
    } catch (err: any) { setError(err.message) } finally { setUploading(false); e.target.value = '' }
  }

  async function save() {
    if (!editId || !draft) return
    setSaving(true); setError('')
    try {
      const payload = {
        description: draft.description,
        dimensions: draft.dimensions,
        features: draft.features,
        sort_order: draft.sort_order,
        category: draft.category,
        gallery: draft.gallery,
        photo_url: draft.gallery[0] ?? '',
      }
      const res = await fetch(`/api/admin/sets/${editId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSavedId(editId)
      await load()
      setEditId(null); setDraft(null)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const editing = editId ? sets.find(s => s.id === editId) : null

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: 0 }}>SETS</h1>
        <a href="/admin/dashboard" style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Pricing & booking fields → Products &amp; Pricing</a>
      </div>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginTop: 0, maxWidth: 680 }}>
        Manage each set’s photos, gallery, and description here. The first photo is the hero shown on the home page and the set’s landing page. Rate, capacity, and minimum hours live in Products &amp; Pricing.
      </p>

      {error && <div style={{ ...card, borderColor: 'rgba(220,80,80,0.5)', background: 'rgba(220,80,80,0.08)', padding: '10px 14px', color: '#ffb4b4', fontFamily: 'Inter, sans-serif', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>Loading…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginTop: 12 }}>
        {sets.map(s => {
          const hero = (s.gallery && s.gallery[0]) || s.photo_url || ''
          const count = s.gallery?.length ?? (s.photo_url ? 1 : 0)
          return (
            <div key={s.id} style={{ ...card, overflow: 'hidden', opacity: s.is_active ? 1 : 0.55 }}>
              <div style={{ aspectRatio: '4 / 3', background: 'linear-gradient(135deg,#1a1a1c,#242427)', position: 'relative' }}>
                {hero && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={hero} alt={s.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', padding: '3px 7px', borderRadius: 20 }}>{count} photo{count === 1 ? '' : 's'}</div>
                {!s.is_active && <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,0.65)', color: '#ffb4b4', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', padding: '3px 7px', borderRadius: 4 }}>INACTIVE</div>}
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 18, letterSpacing: '0.02em' }}>{s.name.toUpperCase()}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>${s.rate_per_hour}/hr · {s.slug}</div>
                <button onClick={() => startEdit(s)} style={{ ...btn(false), marginTop: 12, width: '100%' }}>EDIT PHOTOS & COPY</button>
                {savedId === s.id && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#7fd18f', marginTop: 8, textAlign: 'center' }}>✓ Saved</div>}
              </div>
            </div>
          )
        })}
      </div>

      {editing && draft && (
        <div style={{ ...card, marginTop: 26, padding: '22px 22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 26, margin: 0 }}>{editing.name.toUpperCase()}</h2>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>/{editing.slug}</span>
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
            ${editing.rate_per_hour}/hr · up to {editing.capacity ?? 5} people · {editing.min_hours && editing.min_hours > 1 ? `${editing.min_hours}hr min` : '1hr min'} &nbsp;— edit these in Products &amp; Pricing
          </div>

          <label style={labelStyle}>Gallery — first photo is the hero</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            {draft.gallery.map((src, i) => (
              <div key={src + i} style={{ position: 'relative', aspectRatio: '4 / 3', background: '#0b0b0d', border: i === 0 ? '2px solid #d4a843' : '1px solid rgba(255,255,255,0.12)', borderRadius: 6, overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                {i === 0 && <div style={{ position: 'absolute', top: 4, left: 4, background: '#d4a843', color: '#080808', fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 3 }}>HERO</div>}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, padding: 5, background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent 55%)' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button title="Move left" onClick={() => moveLeft(i)} style={miniBtn}>◀</button>
                    <button title="Move right" onClick={() => moveRight(i)} style={miniBtn}>▶</button>
                    {i !== 0 && <button title="Make hero" onClick={() => makeHero(i)} style={miniBtn}>★</button>}
                    <button title="Remove" onClick={() => removeImg(i)} style={{ ...miniBtn, marginLeft: 'auto', color: '#ffb4b4' }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
            <label style={{ aspectRatio: '4 / 3', border: '1px dashed rgba(255,255,255,0.25)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter, sans-serif', fontSize: 12, textAlign: 'center' }}>
              {uploading ? 'Uploading…' : '＋ Add photos'}
              <input type="file" accept="image/*" multiple onChange={onUpload} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ display: 'grid', gap: 16, marginTop: 8 }}>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea value={draft.description} onChange={e => setDraft(d => d && { ...d, description: e.target.value })} rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div>
                <label style={labelStyle}>Dimensions</label>
                <input value={draft.dimensions} onChange={e => setDraft(d => d && { ...d, dimensions: e.target.value })} placeholder="12 × 15 ft" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Display order</label>
                <input type="number" value={draft.sort_order} onChange={e => setDraft(d => d && { ...d, sort_order: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Group</label>
                <select value={draft.category} onChange={e => setDraft(d => d && { ...d, category: e.target.value })} style={inputStyle}>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Features (comma-separated tags)</label>
              <input value={draft.features} onChange={e => setDraft(d => d && { ...d, features: e.target.value })} placeholder="Cinderblock, Large Windows, Natural Light" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button onClick={save} disabled={saving || uploading} style={{ ...btn(true), opacity: saving || uploading ? 0.6 : 1 }}>{saving ? 'SAVING…' : 'SAVE'}</button>
            <button onClick={cancel} disabled={saving} style={btn(false)}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  )
}

const miniBtn: React.CSSProperties = { background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 11, lineHeight: 1, width: 22, height: 22, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }

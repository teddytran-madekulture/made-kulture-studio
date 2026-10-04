'use client'
// LISTINGS — what a Production Services member rents or offers (migration 135).
// Lives in Settings → Listings. Writes go straight to Supabase as the signed-in
// member (RLS: own rows only) and every write is .select()-verified, because a
// supabase-js write that matches nothing is not an error. See
// [[silent-failure-pattern]].
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SERVICE_ROLES } from '@/lib/roles'

export const LISTING_MAX = 12
export const LISTING_PHOTO_MAX = 6

export type Listing = {
  id: string
  category: string
  title: string
  details: string
  rate: string
  notes: string
  photos: string[]
  active: boolean
  sort_order: number
}

type Draft = Omit<Listing, 'id' | 'sort_order'> & { id?: string }

const emptyDraft = (category: string): Draft => ({ category, title: '', details: '', rate: '', notes: '', photos: [], active: true })

const muted = 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))'
const line = '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))'
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--t-surface)', border: line, borderRadius: 4, padding: '12px 14px',
  fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box',
}
const label: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: muted, margin: '14px 0 6px' }
const btn: React.CSSProperties = { fontFamily: 'Inter', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', borderRadius: 4, padding: '10px 16px', cursor: 'pointer' }

// ≤1600px long edge JPEG — plenty for a listing photo, tiny to upload.
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85))
  } finally { URL.revokeObjectURL(url) }
}

/** Storage path from a public URL, so a removed photo can be deleted too. */
function pathOf(url: string): string | null {
  const m = url.match(/\/object\/public\/portfolios\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function ListingsManager({ roles }: { roles: string[] }) {
  const supabase = createClient()
  const myServiceRoles = SERVICE_ROLES.filter(r => roles.some(x => x.toLowerCase() === r.toLowerCase()))
  const categories = myServiceRoles.length ? myServiceRoles : SERVICE_ROLES
  const [uid, setUid] = useState<string | null>(null)
  const [list, setList] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async (id: string) => {
    const { data, error } = await supabase.from('service_listings')
      .select('id, category, title, details, rate, notes, photos, active, sort_order')
      .eq('user_id', id).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    // A failed read must not look like "no listings yet".
    if (error) setError(`Couldn't load your listings: ${error.message}`)
    else setList((data as Listing[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      setUid(user.id); load(user.id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addPhotos = async (files: File[]) => {
    if (!uid || !draft) return
    const room = LISTING_PHOTO_MAX - draft.photos.length
    if (room <= 0) { setError(`Up to ${LISTING_PHOTO_MAX} photos per listing.`); return }
    setBusy(true); setError('')
    const added: string[] = []
    for (const f of files.filter(f => f.type.startsWith('image/')).slice(0, room)) {
      try {
        const blob = await shrink(f)
        const path = `${uid}/listings/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage.from('portfolios').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
        if (upErr) { setError(`Upload failed: ${upErr.message}`); continue }
        added.push(supabase.storage.from('portfolios').getPublicUrl(path).data.publicUrl)
      } catch { setError('Could not read one of those images.') }
    }
    setDraft(d => (d ? { ...d, photos: [...d.photos, ...added] } : d))
    setBusy(false)
  }

  const removePhoto = (url: string) => {
    setDraft(d => (d ? { ...d, photos: d.photos.filter(p => p !== url) } : d))
    const p = pathOf(url)
    // Only delete files we never saved onto a listing; saved ones go on save.
    if (p && !list.some(l => l.photos.includes(url))) supabase.storage.from('portfolios').remove([p])
  }

  const save = async () => {
    if (!uid || !draft) return
    if (!draft.title.trim()) { setError('Give it a title, e.g. "2021 Mercedes G-Wagon (black)".'); return }
    setBusy(true); setError('')
    const row = {
      category: draft.category, title: draft.title.trim().slice(0, 120), details: draft.details.trim().slice(0, 1200),
      rate: draft.rate.trim().slice(0, 80), notes: draft.notes.trim().slice(0, 600), photos: draft.photos, active: draft.active,
      updated_at: new Date().toISOString(),
    }
    const res = draft.id
      ? await supabase.from('service_listings').update(row).eq('id', draft.id).select('id')
      : await supabase.from('service_listings').insert({ ...row, user_id: uid, sort_order: list.length }).select('id')
    if (res.error || !res.data?.length) {
      setError(res.error?.message?.includes('Listing limit') ? `You can have up to ${LISTING_MAX} listings.` : `Couldn't save: ${res.error?.message || 'nothing was saved'}`)
      setBusy(false); return
    }
    // Photos dropped from a saved listing: delete the files.
    if (draft.id) {
      const before = list.find(l => l.id === draft.id)?.photos ?? []
      const gone = before.filter(u => !draft.photos.includes(u)).map(pathOf).filter(Boolean) as string[]
      if (gone.length) await supabase.storage.from('portfolios').remove(gone)
    }
    setDraft(null); setBusy(false); load(uid)
  }

  const remove = async (l: Listing) => {
    if (!uid || !confirm(`Delete "${l.title}"?`)) return
    setBusy(true)
    const { data, error } = await supabase.from('service_listings').delete().eq('id', l.id).select('id')
    if (error || !data?.length) setError(`Couldn't delete: ${error?.message || 'nothing was deleted'}`)
    else {
      const paths = l.photos.map(pathOf).filter(Boolean) as string[]
      if (paths.length) await supabase.storage.from('portfolios').remove(paths)
    }
    setBusy(false); load(uid)
  }

  const toggle = async (l: Listing) => {
    if (!uid) return
    const { data, error } = await supabase.from('service_listings').update({ active: !l.active }).eq('id', l.id).select('id')
    if (error || !data?.length) setError(`Couldn't update: ${error?.message || 'nothing changed'}`)
    load(uid)
  }

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted }}>Loading…</div>

  return (
    <div style={{ fontFamily: 'Inter' }}>
      {myServiceRoles.length === 0 && (
        <div style={{ fontSize: 13, color: muted, border: '1px dashed rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 8, padding: '14px 16px', marginBottom: 18, lineHeight: 1.55 }}>
          Listings are for <strong>Production Services</strong> members (vehicle, wardrobe, prop or equipment rental, catering). Add one of those roles in Edit profile and your listings will show on your directory profile.
        </div>
      )}
      <div style={{ fontSize: 12, color: muted, marginBottom: 16, lineHeight: 1.5 }}>
        Each listing shows on your profile with a REQUEST button. Requests arrive in your directory messages — you arrange the details and payment directly with the member.
      </div>

      {error && <div style={{ color: '#e6a0a0', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {!draft && (<>
        {list.map(l => (
          <div key={l.id} style={{ display: 'flex', gap: 12, alignItems: 'center', border: line, borderRadius: 8, padding: 10, marginBottom: 10, opacity: l.active ? 1 : 0.5 }}>
            <div style={{ width: 72, height: 54, borderRadius: 4, background: 'var(--t-surface)', backgroundImage: l.photos[0] ? `url(${l.photos[0]})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
              <div style={{ fontSize: 12, color: muted }}>{l.category}{l.rate ? ` · ${l.rate}` : ''}{l.active ? '' : ' · HIDDEN'}</div>
            </div>
            <button type="button" onClick={() => toggle(l)} style={{ ...btn, background: 'transparent', border: line, color: muted }}>{l.active ? 'HIDE' : 'SHOW'}</button>
            <button type="button" onClick={() => { setError(''); setDraft({ ...l }) }} style={{ ...btn, background: 'transparent', border: line, color: 'var(--t-fg)' }}>EDIT</button>
            <button type="button" onClick={() => remove(l)} disabled={busy} style={{ ...btn, background: 'transparent', border: line, color: '#e6a0a0' }}>DELETE</button>
          </div>
        ))}
        {list.length === 0 && <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>No listings yet.</div>}
        {list.length < LISTING_MAX && (
          <button type="button" onClick={() => { setError(''); setDraft(emptyDraft(categories[0])) }} style={{ ...btn, background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', marginTop: 6 }}>+ ADD LISTING</button>
        )}
      </>)}

      {draft && (
        <div style={{ border: line, borderRadius: 8, padding: 16 }}>
          <label style={label}>CATEGORY</label>
          <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} style={{ ...inputStyle, colorScheme: 'dark' }}>
            {categories.map(c => <option key={c} value={c} style={{ background: '#111', color: '#eee' }}>{c}</option>)}
          </select>
          <label style={label}>TITLE</label>
          <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} maxLength={120} placeholder="2021 Mercedes G-Wagon (black)" style={inputStyle} />
          <label style={label}>RATE</label>
          <input value={draft.rate} onChange={e => setDraft({ ...draft, rate: e.target.value })} maxLength={80} placeholder="$350/day · $75/hr on set" style={inputStyle} />
          <label style={label}>DETAILS</label>
          <textarea value={draft.details} onChange={e => setDraft({ ...draft, details: e.target.value })} maxLength={1200} rows={4} placeholder="What it is, condition, what's included." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
          <label style={label}>NOTES <span style={{ color: 'var(--t-gold)' }}>· optional</span></label>
          <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} maxLength={600} rows={2} placeholder="Delivery to the studio available. Deposit required. Driver included." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />

          <label style={label}>PHOTOS · {draft.photos.length}/{LISTING_PHOTO_MAX}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {draft.photos.map(u => (
              <div key={u} style={{ position: 'relative', width: 96, height: 72, borderRadius: 4, backgroundImage: `url(${u})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <button type="button" onClick={() => removePhoto(u)} aria-label="Remove photo" style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '22px', padding: 0 }}>×</button>
              </div>
            ))}
            {draft.photos.length < LISTING_PHOTO_MAX && (
              <label style={{ width: 96, height: 72, borderRadius: 4, border: '1px dashed rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 12, color: muted }}>
                {busy ? '…' : '+ PHOTO'}
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { addPhotos(Array.from(e.target.files ?? [])); e.target.value = '' }} />
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={save} disabled={busy} style={{ ...btn, background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', opacity: busy ? 0.6 : 1 }}>{busy ? 'SAVING…' : 'SAVE LISTING'}</button>
            <button type="button" onClick={() => { setDraft(null); setError('') }} disabled={busy} style={{ ...btn, background: 'transparent', border: line, color: muted }}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  )
}

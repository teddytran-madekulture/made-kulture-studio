'use client'
// The Media Library — Website Editor → Library (mode "manage") and the photo
// picker inside other editors (mode "pick"). ONE component on purpose, so the
// picker can never show a different set of photos than the library does.
// Data: /api/admin/media (+ /categories). Rules: lib/media-core.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '@/lib/use-is-mobile'
import { daysLeftInTrash, fmtBytes, ACCEPT, type MediaItem, type MediaCategory } from '@/lib/media-core'
import { uploadToLibrary } from '@/lib/media-upload-client'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#d4a843', red: '#f87171', green: '#4ade80' }
const inp: React.CSSProperties = { background: C.bg, border: `1px solid ${C.line}`, color: C.text, padding: '8px 10px', fontSize: 13, fontFamily: 'Inter, sans-serif', colorScheme: 'dark', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
const opt: React.CSSProperties = { background: '#141416', color: '#fff' }
const btn = (kind: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  background: kind === 'primary' ? C.accent : 'transparent', color: kind === 'primary' ? '#0b0b0d' : kind === 'danger' ? C.red : C.text,
  border: kind === 'primary' ? 'none' : `1px solid ${kind === 'danger' ? 'rgba(248,113,113,0.4)' : C.line}`,
  borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer', whiteSpace: 'nowrap',
})
const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: '0.12em', color: C.dim, textTransform: 'uppercase', display: 'block', marginBottom: 5 }
const sideItem: React.CSSProperties = { textAlign: 'left', background: 'transparent', border: 'none', color: '#f4f4f5', fontSize: 13, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const miniBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }

type View = 'all' | 'favorites' | 'unused' | 'trash'
const PAGE = 60

export default function MediaLibrary({ mode = 'manage', onPick, onClose }: {
  mode?: 'manage' | 'pick'; onPick?: (item: MediaItem) => void; onClose?: () => void
}) {
  const isMobile = useIsMobile()
  const picking = mode === 'pick'
  const [view, setView] = useState<View>('all')
  const [category, setCategory] = useState<string>('')      // '' all · 'none' · id
  const [q, setQ] = useState('')
  const [qLive, setQLive] = useState('')
  const [items, setItems] = useState<MediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [cats, setCats] = useState<MediaCategory[]>([])
  const [uncat, setUncat] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<MediaItem | null>(null)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const reqId = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Debounce the search box.
  useEffect(() => { const t = setTimeout(() => setQ(qLive.trim()), 300); return () => clearTimeout(t) }, [qLive])

  const load = useCallback(async (offset = 0) => {
    const id = ++reqId.current
    setLoading(true); if (offset === 0) setErr(null)
    const p = new URLSearchParams({ view: picking && (view === 'trash' || view === 'unused') ? 'all' : view, offset: String(offset), limit: String(PAGE) })
    if (category) p.set('category', category)
    if (q) p.set('q', q)
    const r = await fetch(`/api/admin/media?${p}`)
    const d = await r.json().catch(() => ({}))
    if (id !== reqId.current) return
    setLoading(false)
    if (!r.ok) { setErr(d?.error || `Couldn't load the library (${r.status})`); return }
    setItems(prev => offset === 0 ? d.items : [...prev, ...d.items])
    setTotal(d.total); setCats(d.categories ?? []); setUncat(d.uncategorized ?? 0)
    if (offset === 0 && d.imported) setNote(`Added ${d.imported} photo${d.imported === 1 ? '' : 's'} already on the site to the library.`)
  }, [view, category, q, picking])

  useEffect(() => { setSel(new Set()); load(0) }, [load])

  // Keep the open detail panel in step with the list after a reload.
  useEffect(() => { if (open) { const fresh = items.find(i => i.id === open.id); if (fresh && fresh !== open) setOpen(fresh) } }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  const catName = useMemo(() => new Map(cats.map(c => [c.id, c.name])), [cats])

  const patch = async (ids: string[], body: any, okMsg?: string) => {
    setErr(null)
    const r = await fetch('/api/admin/media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d?.error || `Update failed (${r.status})`); return false }
    if (okMsg) setNote(okMsg)
    await load(0)
    return true
  }
  const deleteForever = async (ids: string[]) => {
    setErr(null)
    const r = await fetch('/api/admin/media', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d?.error || `Delete failed (${r.status})`); return }
    setNote(`Deleted ${d.deleted} for good.${d.blocked?.length ? ` Kept ${d.blocked.length}: ${d.blocked.join('; ')}` : ''}`)
    setSel(new Set()); setOpen(null); await load(0)
  }
  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => ACCEPT.includes(f.type))
    if (!list.length) { setErr('Only JPG, PNG or WebP photos can go in the library.'); return }
    setErr(null); setUploading({ done: 0, total: list.length })
    const targetCat = category && category !== 'none' ? category : null
    const failed: string[] = []
    let last: MediaItem | null = null
    for (let i = 0; i < list.length; i++) {
      try { last = await uploadToLibrary(list[i], { categoryId: targetCat }) } catch (e: any) { failed.push(e?.message || list[i].name) }
      setUploading({ done: i + 1, total: list.length })
    }
    setUploading(null)
    setNote(`Uploaded ${list.length - failed.length} of ${list.length}${targetCat ? ` into ${catName.get(targetCat)}` : ''}.`)
    if (failed.length) setErr(failed.join(' · '))
    if (view === 'trash' || view === 'unused') setView('all'); else await load(0)
    if (picking && last && list.length === 1) onPick?.(last)
  }

  const toggleSel = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selIds = Array.from(sel)

  const [newCat, setNewCat] = useState<string | null>(null)
  const [editCat, setEditCat] = useState<{ id: string; name: string } | null>(null)
  const [delCat, setDelCat] = useState<string | null>(null)
  const catReq = async (method: string, body?: any, qs = '') => {
    const r = await fetch(`/api/admin/media/categories${qs}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d?.error || `Category change failed (${r.status})`); return null }
    return d
  }
  const pickCategory = (id: string) => { setCategory(id); if (view === 'trash' || view === 'unused') setView('all') }

  const viewBtn = (v: View, label: string) => (
    <button key={v} onClick={() => { setView(v); setCategory('') }} style={{ ...sideItem, color: view === v && !category ? C.accent : C.text, background: view === v && !category ? 'rgba(212,168,67,0.1)' : 'transparent' }}>{label}</button>
  )
  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {viewBtn('all', 'All photos')}
      {viewBtn('favorites', '★ Favorites')}
      {!picking && viewBtn('unused', 'Not used on the site')}
      {!picking && viewBtn('trash', 'Trash')}
      <div style={{ ...lbl, marginTop: 18 }}>Categories</div>
      {cats.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {editCat?.id === c.id ? (
            <form style={{ flex: 1, display: 'flex', gap: 4 }} onSubmit={async e => { e.preventDefault(); if (await catReq('PATCH', { id: c.id, name: editCat.name })) { setEditCat(null); load(0) } }}>
              <input autoFocus style={{ ...inp, padding: '5px 8px' }} value={editCat.name} onChange={e => setEditCat({ id: c.id, name: e.target.value })} />
              <button type="submit" style={{ ...btn(), padding: '4px 8px' }}>✓</button>
            </form>
          ) : delCat === c.id ? (
            <div style={{ flex: 1, fontSize: 11, color: C.dim, padding: '4px 0', lineHeight: 1.5 }}>
              Delete “{c.name}”? Its {c.count} photo{c.count === 1 ? '' : 's'} stay, as Uncategorized.{' '}
              <button style={{ ...btn('danger'), padding: '2px 6px' }} onClick={async () => { if (await catReq('DELETE', undefined, `?id=${c.id}`)) { setDelCat(null); if (category === c.id) setCategory(''); load(0) } }}>DELETE</button>{' '}
              <button style={{ ...btn(), padding: '2px 6px' }} onClick={() => setDelCat(null)}>KEEP</button>
            </div>
          ) : (
            <>
              <button onClick={() => pickCategory(c.id)} style={{ ...sideItem, flex: 1, color: category === c.id ? C.accent : C.text, background: category === c.id ? 'rgba(212,168,67,0.1)' : 'transparent' }}>
                {c.name} <span style={{ color: C.dim, fontSize: 11 }}>{c.count}</span>
              </button>
              {!picking && <button title="Rename" onClick={() => setEditCat({ id: c.id, name: c.name })} style={miniBtn}>✎</button>}
              {!picking && <button title="Delete category" onClick={() => setDelCat(c.id)} style={miniBtn}>×</button>}
            </>
          )}
        </div>
      ))}
      <button onClick={() => pickCategory('none')} style={{ ...sideItem, color: category === 'none' ? C.accent : C.dim }}>Uncategorized <span style={{ fontSize: 11 }}>{uncat}</span></button>
      {!picking && (newCat === null
        ? <button onClick={() => setNewCat('')} style={{ ...sideItem, color: C.accent, marginTop: 6 }}>+ New category</button>
        : <form style={{ display: 'flex', gap: 4, marginTop: 6 }} onSubmit={async e => { e.preventDefault(); if (newCat.trim() && await catReq('POST', { name: newCat })) { setNewCat(null); load(0) } }}>
            <input autoFocus placeholder="e.g. Halloween 2026" style={{ ...inp, padding: '5px 8px' }} value={newCat} onChange={e => setNewCat(e.target.value)} />
            <button type="submit" style={{ ...btn(), padding: '4px 8px' }}>ADD</button>
          </form>)}
    </div>
  )

  const heading = view === 'trash' ? 'Trash' : view === 'favorites' ? 'Favorites' : view === 'unused' ? 'Not used on the site'
    : category === 'none' ? 'Uncategorized' : category ? (catName.get(category) || 'Category') : 'All photos'

  const mobileSelect = (
    <select style={inp} value={category ? `c:${category}` : `v:${view}`} onChange={e => {
      const v = e.target.value
      if (v.startsWith('v:')) { setView(v.slice(2) as View); setCategory('') } else pickCategory(v.slice(2))
    }}>
      <option style={opt} value="v:all">All photos</option>
      <option style={opt} value="v:favorites">★ Favorites</option>
      {!picking && <option style={opt} value="v:unused">Not used on the site</option>}
      {!picking && <option style={opt} value="v:trash">Trash</option>}
      {cats.map(c => <option style={opt} key={c.id} value={`c:${c.id}`}>{c.name} ({c.count})</option>)}
      <option style={opt} value="c:none">Uncategorized ({uncat})</option>
    </select>
  )

  return (
    <div
      onDragOver={e => { if (view !== 'trash' && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); if (view !== 'trash' && e.dataTransfer.files?.length) upload(e.dataTransfer.files) }}
      style={{ color: C.text, fontFamily: 'Inter, sans-serif', position: 'relative', minHeight: picking ? undefined : '80vh' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: picking ? 28 : 40, letterSpacing: '0.03em', margin: 0, flex: '1 1 auto' }}>
          {picking ? 'CHOOSE A PHOTO' : 'LIBRARY'} <span style={{ fontSize: 14, color: C.dim, fontFamily: 'Inter, sans-serif', letterSpacing: 0 }}>{heading} · {total}</span>
        </h1>
        <input placeholder="Search name, description or tag" value={qLive} onChange={e => setQLive(e.target.value)} style={{ ...inp, width: isMobile ? '100%' : 260 }} />
        {view !== 'trash' && (
          <>
            <button style={btn('primary')} disabled={!!uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? `UPLOADING ${uploading.done}/${uploading.total}…` : '+ UPLOAD'}
            </button>
            <input ref={fileRef} type="file" multiple={!picking} accept={ACCEPT.join(',')} style={{ display: 'none' }} onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
          </>
        )}
        {picking && <button style={btn()} onClick={onClose}>CLOSE</button>}
      </div>

      {note && <div style={{ fontSize: 12, color: C.green, marginBottom: 10 }}>{note} <button onClick={() => setNote(null)} style={{ ...miniBtn, color: C.dim }}>×</button></div>}
      {err && <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', color: '#f2b8b8', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '210px 1fr', gap: 20, alignItems: 'start' }}>
        {isMobile ? mobileSelect : sidebar}

        <div>
          {view === 'trash' && <p style={{ fontSize: 12, color: C.dim, margin: '0 0 12px' }}>Photos here are deleted for good after 30 days. Anything still used on the site is never deleted.</p>}
          {view === 'unused' && <p style={{ fontSize: 12, color: C.dim, margin: '0 0 12px' }}>Photos that don't appear on any page right now — the safest ones to clean up.</p>}
          {!picking && !sel.size && items.length > 0 && <p style={{ fontSize: 11, color: C.dim, margin: '0 0 10px' }}>Click a photo for details. Tick the boxes to move, tag or trash several at once. Drag photos onto this page to upload{category && category !== 'none' ? ` into ${catName.get(category)}` : ''}.</p>}

          {!picking && sel.size > 0 && (
            <BulkBar count={sel.size} trash={view === 'trash'} cats={cats}
              onClear={() => setSel(new Set())}
              onSelectAll={() => setSel(new Set(items.map(i => i.id)))}
              onMove={cid => { patch(selIds, { set: { category_id: cid } }, `Moved ${sel.size}.`).then(ok => { if (ok) setSel(new Set()) }) }}
              onTags={t => { patch(selIds, { set: { addTags: t } }, `Tagged ${sel.size}.`) }}
              onFav={f => { patch(selIds, { set: { favorite: f } }) }}
              onTrash={() => {
                const used = items.filter(i => sel.has(i.id) && i.usedIn?.length).length
                patch(selIds, { action: 'trash' }, `Moved ${sel.size} to Trash.${used ? ` ${used} still show on the site until you replace them there.` : ''}`).then(ok => { if (ok) setSel(new Set()) })
              }}
              onRestore={() => { patch(selIds, { action: 'restore' }, `Restored ${sel.size}.`).then(ok => { if (ok) setSel(new Set()) }) }}
              onDeleteForever={() => { deleteForever(selIds) }}
            />
          )}

          {!loading && !items.length && !err && (
            <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: 40, textAlign: 'center', color: C.dim, fontSize: 13 }}>
              {view === 'trash' ? 'Trash is empty.' : q ? `No photos match “${q}”.` : 'No photos here yet — drag photos onto this page or use + UPLOAD.'}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 104 : 150}px, 1fr))`, gap: 10 }}>
            {items.map(it => {
              const selected = sel.has(it.id)
              return (
                <div key={it.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: C.card, outline: selected ? `2px solid ${C.accent}` : 'none', cursor: 'pointer' }}
                  onClick={() => { if (picking) onPick?.(it); else if (sel.size) toggleSel(it.id); else setOpen(it) }}>
                  <img src={it.thumb_url || it.url} alt={it.alt || it.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: it.deleted_at ? 0.5 : 1 }} />
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                  {it.usedIn?.length && !it.deleted_at ? <span title={`On the site: ${it.usedIn.join(', ')}`} style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: C.green, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 5px', borderRadius: 3 }}>IN USE</span> : null}
                  {it.deleted_at && <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)', color: C.red, fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3 }}>{daysLeftInTrash(it.deleted_at)}d LEFT</span>}
                  {!picking && !it.deleted_at && (
                    <button aria-label={it.favorite ? 'Unfavorite' : 'Favorite'} onClick={e => { e.stopPropagation(); patch([it.id], { set: { favorite: !it.favorite } }) }}
                      style={{ position: 'absolute', top: 3, right: 28, background: 'none', border: 'none', color: it.favorite ? C.accent : 'rgba(255,255,255,0.75)', fontSize: 17, cursor: 'pointer', textShadow: '0 1px 3px #000' }}>{it.favorite ? '★' : '☆'}</button>
                  )}
                  {picking && it.favorite && <span style={{ position: 'absolute', top: 4, right: 8, color: C.accent, fontSize: 14, textShadow: '0 1px 3px #000' }}>★</span>}
                  {!picking && (
                    <input type="checkbox" aria-label="Select" checked={selected} onClick={e => e.stopPropagation()} onChange={() => toggleSel(it.id)}
                      style={{ position: 'absolute', top: 7, right: 7, width: 16, height: 16, accentColor: C.accent, cursor: 'pointer' }} />
                  )}
                </div>
              )
            })}
          </div>

          {items.length < total && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button style={btn()} disabled={loading} onClick={() => load(items.length)}>{loading ? 'LOADING…' : `LOAD MORE (${total - items.length})`}</button>
            </div>
          )}
          {loading && !items.length && <div style={{ color: C.dim, fontSize: 13, marginTop: 10 }}>Loading…</div>}
        </div>
      </div>

      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, border: `2px dashed ${C.accent}`, borderRadius: 12, background: 'rgba(212,168,67,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: C.accent, pointerEvents: 'none', zIndex: 5 }}>
          Drop to upload{category && category !== 'none' ? ` into ${catName.get(category)}` : ''}
        </div>
      )}

      {open && !picking && (
        <DetailPanel key={open.id} item={open} cats={cats} isMobile={isMobile}
          onClose={() => setOpen(null)}
          onSave={async set => { await patch([open.id], { set }, 'Saved.') }}
          onTrash={() => { patch([open.id], { action: 'trash' }, open.usedIn?.length ? 'Moved to Trash — it still shows on the site until you replace it there.' : 'Moved to Trash.').then(ok => { if (ok) setOpen(null) }) }}
          onRestore={() => { patch([open.id], { action: 'restore' }, 'Restored.').then(ok => { if (ok) setOpen(null) }) }}
          onDeleteForever={() => { deleteForever([open.id]) }}
        />
      )}
    </div>
  )
}

function BulkBar({ count, trash, cats, onClear, onSelectAll, onMove, onTags, onFav, onTrash, onRestore, onDeleteForever }: {
  count: number; trash: boolean; cats: MediaCategory[]
  onClear: () => void; onSelectAll: () => void; onMove: (id: string | null) => void; onTags: (t: string) => void
  onFav: (f: boolean) => void; onTrash: () => void; onRestore: () => void; onDeleteForever: () => void
}) {
  const [tags, setTags] = useState('')
  const [confirm, setConfirm] = useState(false)
  return (
    <div style={{ position: 'sticky', top: 8, zIndex: 4, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: '#1b1b1e', border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{count} selected</span>
      <button style={btn()} onClick={onSelectAll}>SELECT ALL SHOWN</button>
      <button style={btn()} onClick={onClear}>CLEAR</button>
      {trash ? (
        <>
          <button style={btn()} onClick={onRestore}>RESTORE</button>
          {confirm
            ? <><span style={{ fontSize: 12, color: C.red }}>Delete {count} for good? This can't be undone.</span><button style={btn('danger')} onClick={() => { setConfirm(false); onDeleteForever() }}>DELETE FOREVER</button><button style={btn()} onClick={() => setConfirm(false)}>CANCEL</button></>
            : <button style={btn('danger')} onClick={() => setConfirm(true)}>DELETE FOREVER…</button>}
        </>
      ) : (
        <>
          <select style={{ ...inp, width: 'auto' }} value="" onChange={e => { if (e.target.value) onMove(e.target.value === 'none' ? null : e.target.value) }}>
            <option style={opt} value="">Move to…</option>
            {cats.map(c => <option style={opt} key={c.id} value={c.id}>{c.name}</option>)}
            <option style={opt} value="none">Uncategorized</option>
          </select>
          <form style={{ display: 'flex', gap: 4 }} onSubmit={e => { e.preventDefault(); if (tags.trim()) { onTags(tags); setTags('') } }}>
            <input style={{ ...inp, width: 150 }} placeholder="Add tags: pink, set d" value={tags} onChange={e => setTags(e.target.value)} />
            <button type="submit" style={btn()}>TAG</button>
          </form>
          <button style={btn()} onClick={() => onFav(true)}>★ FAVORITE</button>
          <button style={btn()} onClick={() => onFav(false)}>☆ UNFAVORITE</button>
          <button style={btn('danger')} onClick={onTrash}>MOVE TO TRASH</button>
        </>
      )}
    </div>
  )
}

function DetailPanel({ item, cats, isMobile, onClose, onSave, onTrash, onRestore, onDeleteForever }: {
  item: MediaItem; cats: MediaCategory[]; isMobile: boolean
  onClose: () => void; onSave: (set: any) => Promise<void>; onTrash: () => void; onRestore: () => void; onDeleteForever: () => void
}) {
  const [name, setName] = useState(item.name)
  const [alt, setAlt] = useState(item.alt)
  const [tags, setTags] = useState(item.tags.join(', '))
  const [cat, setCat] = useState(item.category_id || '')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<'trash' | 'forever' | null>(null)
  const [copied, setCopied] = useState(false)
  const dirty = name !== item.name || alt !== item.alt || tags !== item.tags.join(', ') || cat !== (item.category_id || '')
  const used = item.usedIn ?? []
  const absUrl = item.url.startsWith('/') && typeof window !== 'undefined' ? window.location.origin + item.url : item.url

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: isMobile ? '100%' : 440, height: '100%', overflowY: 'auto', background: '#101012', borderLeft: `1px solid ${C.line}`, padding: 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={lbl}>Photo details</span>
          <button style={btn()} onClick={onClose}>CLOSE</button>
        </div>
        <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.alt || item.name} style={{ width: '100%', maxHeight: 320, objectFit: 'contain', background: '#000', borderRadius: 6, display: 'block' }} /></a>
        <div style={{ fontSize: 11, color: C.dim, margin: '8px 0 16px' }}>
          {item.width && item.height ? `${item.width} × ${item.height} · ` : ''}{item.bytes ? `${fmtBytes(item.bytes)} · ` : ''}added {new Date(item.created_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })}
        </div>

        <div style={{ background: used.length ? 'rgba(74,222,128,0.07)' : C.card, border: `1px solid ${used.length ? 'rgba(74,222,128,0.3)' : C.line}`, borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <span style={lbl}>Used on the site</span>
          {used.length ? used.map(u => <div key={u} style={{ fontSize: 12.5, lineHeight: 1.6 }}>• {u}</div>) : <div style={{ fontSize: 12.5, color: C.dim }}>Not used anywhere right now.</div>}
        </div>

        {!item.deleted_at && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div><span style={lbl}>Name</span><input style={inp} value={name} maxLength={120} onChange={e => setName(e.target.value)} /></div>
            <div><span style={lbl}>Description (alt text)</span><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={alt} maxLength={300} placeholder="Pink velvet curtain wall with blush drapes, Set D" onChange={e => setAlt(e.target.value)} /></div>
            <div><span style={lbl}>Tags (comma separated)</span><input style={inp} value={tags} placeholder="pink, set d, portrait" onChange={e => setTags(e.target.value)} /></div>
            <div><span style={lbl}>Category</span>
              <select style={inp} value={cat} onChange={e => setCat(e.target.value)}>
                <option style={opt} value="">Uncategorized</option>
                {cats.map(c => <option style={opt} key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...btn('primary'), opacity: dirty ? 1 : 0.4 }} disabled={!dirty || saving} onClick={async () => { setSaving(true); await onSave({ name, alt, tags, category_id: cat || null }); setSaving(false) }}>{saving ? 'SAVING…' : 'SAVE'}</button>
              <button style={btn()} onClick={() => { onSave({ favorite: !item.favorite }) }}>{item.favorite ? '★ FAVORITED' : '☆ FAVORITE'}</button>
              <button style={btn()} onClick={async () => { try { await navigator.clipboard.writeText(absUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }}>{copied ? 'COPIED ✓' : 'COPY LINK'}</button>
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 20, paddingTop: 16 }}>
          {item.deleted_at ? (
            <>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>In Trash — deleted for good in {daysLeftInTrash(item.deleted_at)} days{used.length ? ', unless it is still used on the site' : ''}.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button style={btn()} onClick={onRestore}>RESTORE</button>
                {used.length ? <span style={{ fontSize: 12, color: C.dim }}>Can't delete for good while it's on the site.</span>
                  : confirm === 'forever'
                    ? <><button style={btn('danger')} onClick={onDeleteForever}>YES, DELETE FOREVER</button><button style={btn()} onClick={() => setConfirm(null)}>CANCEL</button></>
                    : <button style={btn('danger')} onClick={() => setConfirm('forever')}>DELETE FOREVER…</button>}
              </div>
            </>
          ) : confirm === 'trash' ? (
            <div>
              <div style={{ fontSize: 12, color: '#f0b75a', marginBottom: 8, lineHeight: 1.5 }}>
                This photo is on the site ({used.join(', ')}). Moving it to Trash does NOT take it off those pages — replace it there first if you want it gone.
              </div>
              <button style={btn('danger')} onClick={onTrash}>MOVE TO TRASH ANYWAY</button>{' '}
              <button style={btn()} onClick={() => setConfirm(null)}>CANCEL</button>
            </div>
          ) : (
            <button style={btn('danger')} onClick={() => { if (used.length) setConfirm('trash'); else onTrash() }}>MOVE TO TRASH</button>
          )}
        </div>
      </div>
    </div>
  )
}

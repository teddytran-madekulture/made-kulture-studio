'use client'
// Admin — Set Care for ONE set (2026-11-10, migration 184).
// Sections come from lib/set-care.ts CARE_SECTIONS; pool sections show only
// when the set's care_pool flag is on (toggle at the top of the page).
// Owner types everything in; nothing here is customer-facing.

import { useEffect, useState } from 'react'
import { CARE_SECTIONS, MAX_CARE_PHOTOS, careDate, careToday, safeLink, type CareSection } from '@/lib/set-care'
import { shrinkImage } from '@/lib/shrink-image'

interface Photo { path: string; url: string | null }
interface Entry {
  id: string; set_id: string; kind: string; title: string | null; fields: Record<string, string>
  log_date: string | null; photos: Photo[]; created_at: string
}
interface SetInfo { id: string; name: string; slug: string; photo_url: string | null; care_pool: boolean }

const C = { bg: '#0b0b0d', card: '#141416', card2: '#1a1a1d', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', gold: '#d4a843', red: '#e57373', blue: '#7fb3d5' }
// 16px inputs: iOS zooms on anything smaller and the admin PWA never zooms back out.
const input = { width: '100%', boxSizing: 'border-box' as const, background: '#0e0e10', border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, padding: '9px 10px', fontSize: 16, fontFamily: 'Inter, sans-serif' }
const btn = (bg: string, fg: string) => ({ background: bg, color: fg, border: `1px solid ${C.line}`, borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer' } as const)
const label = { fontSize: 11, color: C.dim, letterSpacing: '0.08em', marginBottom: 4, display: 'block' }

function EntryForm({ sec, initial, onCancel, onSave }: {
  sec: CareSection; initial?: Entry; onCancel: () => void
  onSave: (v: { title: string; fields: Record<string, string>; logDate: string }) => Promise<string | null>
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [fields, setFields] = useState<Record<string, string>>(initial?.fields ?? {})
  const [logDate, setLogDate] = useState(initial?.log_date ?? careToday())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setBusy(true); setErr('')
    const e = await onSave({ title, fields, logDate })
    setBusy(false)
    if (e) setErr(e)
  }

  return (
    <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginTop: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {sec.log && (
          <div><span style={label}>DATE</span><input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} style={{ ...input, colorScheme: 'dark' }} /></div>
        )}
        {!sec.log && (
          <div style={{ gridColumn: '1 / -1' }}><span style={label}>{(sec.titleLabel || 'Title').toUpperCase()}</span>
            <input value={title} onChange={e => setTitle(e.target.value)} style={input} autoFocus /></div>
        )}
        {sec.fields.map(f => (
          <div key={f.key} style={f.long ? { gridColumn: '1 / -1' } : undefined}>
            <span style={label}>{f.label.toUpperCase()}</span>
            {f.long
              ? <textarea value={fields[f.key] ?? ''} onChange={e => setFields({ ...fields, [f.key]: e.target.value })} rows={f.key === 'steps' ? 6 : 3} placeholder={f.placeholder} style={{ ...input, resize: 'vertical' }} />
              : <input value={fields[f.key] ?? ''} onChange={e => setFields({ ...fields, [f.key]: e.target.value })} placeholder={f.placeholder} inputMode={f.link ? 'url' : undefined} style={input} />}
          </div>
        ))}
      </div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button disabled={busy} onClick={save} style={btn(C.gold, '#0b0b0d')}>{busy ? 'SAVING…' : 'SAVE'}</button>
        <button disabled={busy} onClick={onCancel} style={btn('transparent', C.text)}>CANCEL</button>
      </div>
    </div>
  )
}

function Photos({ entry, onChange }: { entry: Entry; onChange: (photos: Photo[]) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [big, setBig] = useState<string | null>(null)

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true); setErr('')
    let photos = [...entry.photos]
    for (const f of Array.from(files)) {
      if (photos.length >= MAX_CARE_PHOTOS) { setErr(`Up to ${MAX_CARE_PHOTOS} photos per entry.`); break }
      try {
        const blob = await shrinkImage(f)
        const fd = new FormData(); fd.append('entryId', entry.id); fd.append('photo', new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
        const r = await fetch('/api/admin/set-care/photo', { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setErr(d?.error || 'Upload failed'); break }
        photos = [...photos, { path: d.path, url: d.url }]
        onChange(photos)
      } catch { setErr('Could not read that photo.'); break }
    }
    setBusy(false)
  }
  const remove = async (p: Photo) => {
    if (!window.confirm('Remove this photo?')) return
    const r = await fetch('/api/admin/set-care/photo', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: entry.id, path: p.path }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d?.error || 'Could not remove'); return }
    onChange(entry.photos.filter(x => x.path !== p.path))
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {entry.photos.map(p => (
          <div key={p.path} style={{ position: 'relative' }}>
            {p.url
              ? <img src={p.url} alt="" onClick={() => setBig(p.url)} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', display: 'block' }} />
              : <div style={{ width: 72, height: 72, borderRadius: 6, background: '#222', fontSize: 10, color: C.dim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>unavailable</div>}
            <button onClick={() => remove(p)} aria-label="Remove photo" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: '#000', color: C.red, fontSize: 12, cursor: 'pointer', lineHeight: '20px', padding: 0 }}>×</button>
          </div>
        ))}
        {entry.photos.length < MAX_CARE_PHOTOS && (
          <label style={{ ...btn('transparent', C.dim), display: 'inline-block', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'UPLOADING…' : '+ PHOTO'}
            <input type="file" accept="image/*" multiple disabled={busy} onChange={e => { add(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
          </label>
        )}
      </div>
      {err && <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{err}</div>}
      {big && (
        <div onClick={() => setBig(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
          <img src={big} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}

function EntryView({ sec, e }: { sec: CareSection; e: Entry }) {
  const f = e.fields || {}
  if (sec.kind === 'water') {
    const bits = [f.ph && `pH ${f.ph}`, f.chlorine && `Cl ${f.chlorine} ppm`, f.temp && `${f.temp}°F`, f.added && `added ${f.added}`].filter(Boolean)
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{careDate(e.log_date!)}</div>
        {bits.length > 0 && <div style={{ fontSize: 13, marginTop: 4 }}>{bits.join(' · ')}</div>}
        {f.details && <div style={{ fontSize: 13, color: C.dim, marginTop: 4, whiteSpace: 'pre-wrap' }}>{f.details}</div>}
      </div>
    )
  }
  if (sec.kind === 'maintenance') {
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{careDate(e.log_date!)}{f.cost && <span style={{ color: C.gold, fontWeight: 500 }}> · {f.cost}</span>}</div>
        {f.details && <div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{f.details}</div>}
      </div>
    )
  }
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{e.title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 14, rowGap: 4, marginTop: 8, fontSize: 13 }}>
        {sec.fields.filter(fd => f[fd.key] && fd.key !== 'steps' && fd.key !== 'notes' && fd.key !== 'body').map(fd => {
          const link = fd.link ? safeLink(f[fd.key]) : null
          return [
            <div key={fd.key + 'l'} style={{ color: C.dim }}>{fd.label}</div>,
            <div key={fd.key + 'v'} style={{ wordBreak: 'break-word', color: fd.key === 'never' ? C.red : C.text }}>
              {link ? <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>Open link ↗</a> : f[fd.key]}
            </div>,
          ]
        })}
      </div>
      {f.steps && (
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
          {f.steps.split('\n').map(s => s.trim()).filter(Boolean).map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
      {(f.notes || f.body) && <div style={{ fontSize: 13, color: f.body ? C.text : C.dim, marginTop: 8, whiteSpace: 'pre-wrap' }}>{f.body || f.notes}</div>}
    </div>
  )
}

export default function SetCareDetail({ params }: { params: { id: string } }) {
  const [set, setSet] = useState<SetInfo | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState<string | null>(null)   // section kind
  const [editing, setEditing] = useState<string | null>(null) // entry id

  const load = async () => {
    const r = await fetch(`/api/admin/set-care?setId=${encodeURIComponent(params.id)}`, { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    // A failed load must never render as empty sections.
    if (!r.ok) { setErr(d?.error || 'Could not load this set'); setLoading(false); return }
    setSet(d.set); setEntries(d.entries ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [params.id])

  const create = async (kind: string, v: { title: string; fields: Record<string, string>; logDate: string }) => {
    const r = await fetch('/api/admin/set-care', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setId: params.id, kind, ...v }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return d?.error || 'Could not save'
    setAdding(null); load(); return null
  }
  const update = async (id: string, v: { title: string; fields: Record<string, string>; logDate: string }) => {
    const r = await fetch('/api/admin/set-care', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...v }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return d?.error || 'Could not save'
    setEditing(null); load(); return null
  }
  const remove = async (e: Entry, sec: CareSection) => {
    const what = e.title || (e.log_date ? `the ${careDate(e.log_date)} entry` : 'this entry')
    if (!window.confirm(`Delete ${what} from ${sec.label}?${e.photos.length ? ' Its photos go too.' : ''}`)) return
    const r = await fetch('/api/admin/set-care', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d?.error || 'Could not delete'); return }
    setEntries(list => list.filter(x => x.id !== e.id))
  }
  const togglePool = async () => {
    if (!set) return
    const next = !set.care_pool
    if (!window.confirm(next ? `Turn on the pool sections (Equipment, Procedures, Water Log) for ${set.name}?` : `Hide the pool sections for ${set.name}? Anything already entered stays saved.`)) return
    const r = await fetch('/api/admin/set-care', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setId: set.id, carePool: next }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d?.error || 'Could not change that'); return }
    setSet({ ...set, care_pool: d.care_pool })
  }

  if (unauth) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Admin sign-in required.</main>

  const sections = CARE_SECTIONS.filter(s => !s.pool || set?.care_pool)

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 24px 80px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <a href="/admin/set-care" style={{ color: C.dim, fontSize: 12, textDecoration: 'none', letterSpacing: '0.1em' }}>← ALL SETS</a>
        {err && <div style={{ background: 'rgba(229,115,115,0.12)', border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 13 }}>{err}</div>}
        {loading ? <div style={{ color: C.dim, marginTop: 20 }}>Loading…</div> : set && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
              {set.photo_url && <div style={{ width: 84, height: 84, borderRadius: 8, background: `center/cover no-repeat url("${set.photo_url}")` }} />}
              <div style={{ flex: 1, minWidth: 200 }}>
                <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, letterSpacing: '0.04em', margin: 0 }}>{set.name}</h1>
                <button onClick={togglePool} style={{ ...btn('transparent', set.care_pool ? C.blue : C.dim), marginTop: 6, borderColor: set.care_pool ? C.blue : C.line }}>
                  {set.care_pool ? '● POOL SET' : '○ NOT A POOL SET'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '18px 0 6px' }}>
              {sections.map(s => {
                const n = entries.filter(e => e.kind === s.kind).length
                return <a key={s.kind} href={`#${s.kind}`} style={{ fontSize: 11, color: C.dim, textDecoration: 'none', border: `1px solid ${C.line}`, borderRadius: 14, padding: '4px 10px' }}>{s.label}{n ? ` · ${n}` : ''}</a>
              })}
            </div>

            {sections.map(sec => {
              const list = entries.filter(e => e.kind === sec.kind)
              return (
                <section key={sec.kind} id={sec.kind} style={{ marginTop: 26, scrollMarginTop: 60 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: '0.15em', fontWeight: 600, color: sec.pool ? C.blue : C.accent }}>{sec.label.toUpperCase()}</div>
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>{sec.blurb}</div>
                    </div>
                    {adding !== sec.kind && <button onClick={() => { setAdding(sec.kind); setEditing(null) }} style={btn('transparent', C.text)}>+ ADD</button>}
                  </div>
                  {adding === sec.kind && <EntryForm sec={sec} onCancel={() => setAdding(null)} onSave={v => create(sec.kind, v)} />}
                  {list.length === 0 && adding !== sec.kind && <div style={{ color: C.dim, fontSize: 13, padding: '12px 0' }}>Nothing here yet.</div>}
                  {list.map(e => editing === e.id
                    ? <EntryForm key={e.id} sec={sec} initial={e} onCancel={() => setEditing(null)} onSave={v => update(e.id, v)} />
                    : (
                      <div key={e.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0, flex: 1 }}><EntryView sec={sec} e={e} /></div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0 }}>
                            <button onClick={() => { setEditing(e.id); setAdding(null) }} style={btn('transparent', C.text)}>EDIT</button>
                            <button onClick={() => remove(e, sec)} style={btn('transparent', C.red)}>DELETE</button>
                          </div>
                        </div>
                        <Photos entry={e} onChange={photos => setEntries(list => list.map(x => x.id === e.id ? { ...x, photos } : x))} />
                      </div>
                    ))}
                </section>
              )
            })}
          </>
        )}
      </div>
    </main>
  )
}

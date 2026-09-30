'use client'
// Pose Guide — review guest submissions, manage the library, add studio shots,
// and seed the Pexels starter set. Linked from BOTH admin sidebars.
import { useCallback, useEffect, useState } from 'react'
import { POSE_CATEGORIES, poseCategoryLabel } from '@/lib/pose-categories'
import { shrinkImage } from '@/lib/shrink-image'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', gold: '#d4a843' }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.6 }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark' }
const opt: React.CSSProperties = { background: '#141416', color: '#fff' }
const btn = (primary = false): React.CSSProperties => ({ background: primary ? C.gold : 'transparent', color: primary ? '#080808' : C.text, border: primary ? 'none' : `1px solid ${C.line}`, padding: '7px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' })
const TABS: [string, string][] = [['pending', 'To review'], ['live', 'Live'], ['hidden', 'Hidden'], ['rejected', 'Rejected']]

export default function PosesAdmin() {
  const [status, setStatus] = useState('pending')
  const [category, setCategory] = useState('')
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sets, setSets] = useState<{ slug: string; name: string }[]>([])
  const [upCat, setUpCat] = useState(POSE_CATEGORIES[0].key)
  const [upSet, setUpSet] = useState('')
  const [seedCat, setSeedCat] = useState(POSE_CATEGORIES[0].key)
  const [seedQ, setSeedQ] = useState(POSE_CATEGORIES[0].search)
  const [seedN, setSeedN] = useState(20)

  const load = useCallback(async () => {
    setErr(null)
    const q = new URLSearchParams({ status }); if (category) q.set('category', category)
    const r = await fetch(`/api/admin/poses?${q}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not load.'); return }
    setD(j)
  }, [status, category])
  useEffect(() => { load() }, [load])
  useEffect(() => { fetch('/api/sets').then(r => r.json()).then(j => setSets((j.sets ?? j ?? []).map((s: any) => ({ slug: s.slug, name: s.name })))).catch(() => {}) }, [])

  const act = async (id: string, action: string, extra: any = {}) => {
    setBusy(id)
    const r = await fetch('/api/admin/poses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setNote(`⚠️ ${j.error || 'That didn’t work.'}`)
    setBusy(null); load()
  }
  const seed = async () => {
    setBusy('seed'); setNote(null)
    const r = await fetch('/api/admin/poses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'seed', category: seedCat, query: seedQ, count: seedN }) })
    const j = await r.json().catch(() => ({}))
    setNote(r.ok ? `Added ${j.added} poses from Pexels to ${poseCategoryLabel(seedCat)}. Weed out any duds under Live.` : `⚠️ ${j.error}`)
    setBusy(null); load()
  }
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setNote(null); let done = 0
    for (const f of Array.from(files)) {
      setBusy(`Uploading ${done + 1} of ${files.length}…`)
      try {
        const fd = new FormData(); fd.append('file', await shrinkImage(f, 2000), 'pose.jpg'); fd.append('category', upCat); if (upSet) fd.append('set', upSet)
        const r = await fetch('/api/admin/poses/upload', { method: 'POST', body: fd })
        if (!r.ok) { const j = await r.json().catch(() => ({})); setNote(`⚠️ ${j.error || 'Upload failed.'}`); break }
        done++
      } catch { setNote('⚠️ One photo couldn’t be read.'); break }
    }
    setBusy(null); if (done) setNote(`Added ${done} studio pose${done === 1 ? '' : 's'} to ${poseCategoryLabel(upCat)}.`); load()
  }

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 16, marginBottom: 20 }
  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>POSE GUIDE</h1>
      <p style={{ ...small, margin: '0 0 18px' }}>What guests browse under PORTAL → POSE GUIDE on the set tablets and their phones. Guest submissions wait here until you approve them.</p>
      {err && <div style={{ ...small, color: '#fbbf24', marginBottom: 12 }}>⚠️ {err}</div>}
      {note && <div onClick={() => setNote(null)} style={{ ...small, color: note.startsWith('⚠') ? '#fbbf24' : '#8fe0ae', marginBottom: 12, cursor: 'pointer' }}>{note}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', marginBottom: 10 }}>ADD YOUR OWN SHOTS</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <select value={upCat} onChange={e => setUpCat(e.target.value)} style={inp}>{POSE_CATEGORIES.map(c => <option key={c.key} value={c.key} style={opt}>{c.label}</option>)}</select>
            <select value={upSet} onChange={e => setUpSet(e.target.value)} style={inp}><option value="" style={opt}>Shot in… (optional)</option>{sets.map(s => <option key={s.slug} value={s.slug} style={opt}>{s.name}</option>)}</select>
          </div>
          <label style={{ ...btn(true), display: 'inline-block' }}>
            {busy?.startsWith('Uploading') ? busy : 'CHOOSE PHOTOS'}
            <input type="file" accept="image/*" multiple hidden onChange={e => { upload(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', marginBottom: 10 }}>STARTER POSES FROM PEXELS</div>
          {d && !d.pexelsReady && <div style={{ ...small, color: '#fbbf24', marginBottom: 8 }}>Add PEXELS_API_KEY in Vercel first (free at pexels.com/api).</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <select value={seedCat} onChange={e => { setSeedCat(e.target.value); setSeedQ(POSE_CATEGORIES.find(c => c.key === e.target.value)?.search || '') }} style={inp}>
              {POSE_CATEGORIES.map(c => <option key={c.key} value={c.key} style={opt}>{c.label}</option>)}
            </select>
            <input value={seedQ} onChange={e => setSeedQ(e.target.value)} style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="Search Pexels for…" />
            <select value={seedN} onChange={e => setSeedN(Number(e.target.value))} style={inp}>{[10, 20, 40].map(n => <option key={n} value={n} style={opt}>{n}</option>)}</select>
          </div>
          <button onClick={seed} disabled={busy === 'seed'} style={btn(true)}>{busy === 'seed' ? 'PULLING…' : 'ADD FROM PEXELS'}</button>
          <div style={{ ...small, marginTop: 8 }}>Each Pexels pose shows “Photo by … on Pexels” — that credit is part of their licence.</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 14px' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} style={{ ...btn(status === k), background: status === k ? C.gold : 'transparent' }}>
            {label}{d?.counts?.[k] ? ` · ${d.counts[k]}` : ''}
          </button>
        ))}
        <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inp, marginLeft: 'auto' }}>
          <option value="" style={opt}>All categories</option>
          {POSE_CATEGORIES.map(c => <option key={c.key} value={c.key} style={opt}>{c.label}</option>)}
        </select>
      </div>

      {d && d.poses.length === 0 && <div style={{ ...card, ...small }}>{status === 'pending' ? 'Nothing waiting for review.' : 'No poses here.'}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {(d?.poses ?? []).map((p: any) => (
          <div key={p.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', opacity: busy === p.id ? 0.4 : 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt="" style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block' }} />
            <div style={{ padding: 10 }}>
              <select value={p.category} onChange={e => act(p.id, 'category', { category: e.target.value })} style={{ ...inp, width: '100%', fontSize: 12, padding: '5px 6px', marginBottom: 6 }}>
                {POSE_CATEGORIES.map(c => <option key={c.key} value={c.key} style={opt}>{c.label}</option>)}
              </select>
              <div style={{ ...small, fontSize: 11 }}>{p.credit}{p.setName ? ` · ${p.setName}` : ''}</div>
              {p.source === 'guest' && <div style={{ ...small, fontSize: 11 }}>Consent: rights {p.consentRights ? '✓' : '✗'} · people {p.consentPeople ? '✓' : '✗'}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {status === 'pending' && <button onClick={() => act(p.id, 'approve')} style={btn(true)}>APPROVE</button>}
                {status === 'pending' && <button onClick={() => act(p.id, 'reject')} style={btn()}>REJECT</button>}
                {status === 'live' && <button onClick={() => act(p.id, 'hide')} style={btn()}>HIDE</button>}
                {(status === 'hidden' || status === 'rejected') && <button onClick={() => act(p.id, 'show')} style={btn()}>MAKE LIVE</button>}
                <button onClick={() => { if (confirm('Delete this pose for good?')) act(p.id, 'delete') }} style={{ ...btn(), color: '#ff8080' }}>DELETE</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

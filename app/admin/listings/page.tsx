'use client'
// /admin/listings — every Production Services listing, with its tags and any
// open member reports. Pull a listing (review hold), restore it, dismiss
// reports, or delete it. ?filter=flagged opens on reported/held listings
// (the report push deep-links here).
import { useEffect, useMemo, useState } from 'react'

type Row = {
  id: string; user_id: string; vendor_name: string; category: string; title: string; details: string; rate: string
  photos: string[]; tags: string[]; active: boolean; review_hold: boolean; review_hold_reason: string | null
  created_at: string; reports: { reason: string; note: string | null }[]
}
const REASON: Record<string, string> = { misleading: 'Misleading tags/details', off_topic: 'Not a real service', spam: 'Spam', inappropriate: 'Inappropriate', other: 'Other' }

const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }
const btn = (tone: 'light' | 'ghost' | 'danger'): React.CSSProperties => ({
  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
  background: tone === 'light' ? '#f2f2f2' : 'transparent', color: tone === 'light' ? '#111' : tone === 'danger' ? '#f0a0a0' : '#bbb',
  border: tone === 'light' ? 'none' : `1px solid ${tone === 'danger' ? 'rgba(240,160,160,0.4)' : 'rgba(255,255,255,0.18)'}`,
})

export default function AdminListingsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'all' | 'flagged'>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => fetch('/api/admin/listings', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load listings.'); return }   // never render a failed read as "none"
    setErr(''); setRows(d.listings ?? [])
  }).catch(() => setErr('Could not load listings.'))

  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('filter') === 'flagged') setFilter('flagged') } catch {}
    load()
  }, [])

  const shown = useMemo(() => (rows ?? []).filter(r => filter === 'all' || r.review_hold || r.reports.length > 0), [rows, filter])
  const flaggedCount = (rows ?? []).filter(r => r.review_hold || r.reports.length > 0).length

  const act = async (id: string, method: 'PATCH' | 'DELETE', action?: string) => {
    if (method === 'DELETE' && !confirm('Delete this listing and its photos? This cannot be undone.')) return
    setBusy(id)
    const r = await fetch('/api/admin/listings', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) alert(d.error || 'That did not work.')
    setBusy(null); load()
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: 'Inter, sans-serif', color: '#eee' }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, margin: '0 0 6px', letterSpacing: '0.02em' }}>SERVICE LISTINGS</h1>
      <p style={{ color: '#999', fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
        Everything vendors list on the directory&apos;s Services page. Three member reports pull a listing automatically until you review it. Vendors can&apos;t undo a hold themselves.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'flagged'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)} style={{ ...btn(filter === f ? 'light' : 'ghost'), fontSize: 12 }}>
            {f === 'all' ? `ALL (${rows?.length ?? 0})` : `REPORTED / HELD (${flaggedCount})`}
          </button>
        ))}
      </div>
      {err && <div style={{ color: '#f0a0a0', marginBottom: 12 }}>{err}</div>}
      {!rows && !err && <div style={{ color: '#888' }}>Loading…</div>}
      {rows && shown.length === 0 && <div style={{ color: '#888' }}>{filter === 'flagged' ? 'Nothing reported or held.' : 'No listings yet.'}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {shown.map(r => (
          <div key={r.id} style={{ ...card, display: 'flex', gap: 14, alignItems: 'flex-start', borderColor: r.review_hold ? 'rgba(240,160,160,0.45)' : r.reports.length ? 'rgba(230,192,122,0.45)' : 'rgba(255,255,255,0.08)' }}>
            <div style={{ width: 120, height: 90, borderRadius: 6, background: '#222', backgroundImage: r.photos[0] ? `url(${r.photos[0]})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</div>
              <div style={{ fontSize: 12.5, color: '#aaa', margin: '2px 0 6px' }}>
                <a href={`/account/directory/${r.user_id}`} target="_blank" rel="noreferrer" style={{ color: '#e6c07a' }}>{r.vendor_name}</a> · {r.category}{r.rate ? ` · ${r.rate}` : ''}
                {!r.active && ' · hidden by vendor'}
                {r.review_hold && <span style={{ color: '#f0a0a0' }}> · ON HOLD ({r.review_hold_reason === 'reports' ? '3+ reports' : 'by you'})</span>}
              </div>
              {r.details && <div style={{ fontSize: 12.5, color: '#999', lineHeight: 1.5, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.details}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {(r.tags ?? []).length ? r.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', color: '#ccc' }}>{t}</span>) : <span style={{ fontSize: 11, color: '#777' }}>no tags</span>}
              </div>
              {r.reports.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#e6c07a' }}>
                  {r.reports.length} open report{r.reports.length === 1 ? '' : 's'}: {r.reports.map(x => REASON[x.reason] ?? x.reason).join(', ')}
                  {r.reports.filter(x => x.note).map((x, i) => <div key={i} style={{ color: '#aaa', fontStyle: 'italic' }}>“{x.note}”</div>)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              {r.review_hold
                ? <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'PATCH', 'restore')} style={btn('light')}>RESTORE</button>
                : <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'PATCH', 'hold')} style={btn('ghost')}>PULL</button>}
              {!r.review_hold && r.reports.length > 0 && <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'PATCH', 'dismiss')} style={btn('ghost')}>KEEP · DISMISS</button>}
              <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'DELETE')} style={btn('danger')}>DELETE</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

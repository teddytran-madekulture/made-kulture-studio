'use client'
// SERVICES — the directory's marketplace view (2026-10-03). Every active
// Production Services listing in one grid, searchable by title, details,
// category, vendor and TAGS, so "snake" finds "Exotic Animal Handling" and
// "pole" finds a dance-pole prop. Same detail pop-up and REQUEST as on a
// vendor's profile (components/ListingsTab). Members-only via /api/listings.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import DirectoryHeader from '@/components/DirectoryHeader'
import ListingsTab, { type PublicListing } from '@/components/ListingsTab'
import { SERVICE_ROLES } from '@/lib/roles'

const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const line = '1px solid rgba(var(--t-fg-rgb), calc(0.16 * var(--t-a)))'

// "cars" should find "car", "snakes" → "snake". Crude on purpose: good enough
// for short tags, and it never drops a word to nothing.
const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

export default function ServicesPage() {
  const [listings, setListings] = useState<PublicListing[]>([])
  const [loading, setLoading] = useState(true)
  const [gate, setGate] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/listings', { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (r.status === 403) setGate(d.error || 'Join the directory to browse services.')
      else if (!r.ok) setErr(d.error || 'Could not load services.')
      else setListings(d.listings ?? [])
      setLoading(false)
    }).catch(() => { setErr('Could not load services.'); setLoading(false) })
  }, [])

  const cats = useMemo(() => SERVICE_ROLES.filter(c => listings.some(l => l.category === c)), [listings])

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/[\s,]+/).filter(Boolean).map(stem)
    return listings.filter(l => {
      if (cat && l.category !== cat) return false
      if (!words.length) return true
      const hay = [l.title, l.details, l.notes, l.category, l.vendor?.name ?? '', ...(l.tags ?? [])].join(' ').toLowerCase()
      const hayWords = new Set(hay.split(/[^a-z0-9]+/).filter(Boolean).map(stem))
      // Every typed word must appear — as a whole (stemmed) word, or inside a
      // longer one ("pole" in "dance-pole", "truck" in "trucks").
      return words.every(w => hayWords.has(w) || hay.includes(w))
    })
  }, [listings, q, cat])

  const chip = (on: boolean): React.CSSProperties => ({
    fontFamily: 'Inter', fontSize: 13, padding: '8px 14px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
    background: on ? 'var(--t-fg)' : 'transparent', color: on ? 'var(--t-on-fg)' : muted, border: on ? '1px solid var(--t-fg)' : line,
  })

  return (
    <div>
      <DirectoryHeader active="services" />
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: muted, margin: '0 0 18px', lineHeight: 1.6 }}>
        Vehicles, wardrobe, props, gear, animals and catering from vendors in the Made Kulture network. Request straight from a listing. You arrange pricing and logistics directly with the vendor.
      </p>

      {gate ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted, border: line, borderRadius: 10, padding: 18 }}>
          {gate} <Link href="/account/profile" style={{ color: 'var(--t-gold)' }}>Go to your profile →</Link>
        </div>
      ) : (<>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search services — try car, snake, pole, gown…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(var(--t-fg-rgb), calc(0.04 * var(--t-a)))', border: line, borderRadius: 8, padding: '12px 16px', fontFamily: 'Inter', fontSize: 15, color: 'var(--t-fg)', outline: 'none', marginBottom: 12 }} />
        {cats.length > 1 && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
            <button type="button" onClick={() => setCat(null)} style={chip(cat === null)}>All</button>
            {cats.map(c => <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} style={chip(cat === c)}>{c}</button>)}
          </div>
        )}
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted, margin: '6px 0 14px' }}>
          {loading ? 'Loading…' : err ? <span style={{ color: '#e6a0a0' }}>{err}</span> : `${shown.length} listing${shown.length === 1 ? '' : 's'}`}
        </div>
        {!loading && !err && (
          <ListingsTab listings={shown} showVendor
            emptyText={listings.length === 0 ? 'No services listed yet. Rent out vehicles, wardrobe, props, gear or animals? Add a Production Services role to your profile.' : 'Nothing matches that search. Try a different word.'} />
        )}
      </>)}
    </div>
  )
}

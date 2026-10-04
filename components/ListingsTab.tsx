'use client'
// The LISTINGS tab on a Production Services member's directory profile
// (migration 135). Cards stay short (photo, title, rate, two lines); tapping one
// opens a DETAIL pop-up with large photos and the full text. REQUEST posts to
// /api/listings/request, which messages the vendor and emails them every time.
// Made Kulture never takes payment for these.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { track, trackNow } from '@/lib/track'

export type PublicListing = {
  id: string; category: string; title: string; details: string; rate: string; price_cents?: number | null; price_unit?: string | null; price_extras?: string; notes: string; photos: string[]
  tags?: string[]
  /** Set on the Services page, where listings from many vendors share one grid. */
  vendor?: { id: string; name: string; avatar_url: string | null }
  is_self?: boolean
}

const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const line = '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))'
const input: React.CSSProperties = { width: '100%', background: 'var(--t-surface)', border: line, borderRadius: 4, padding: '12px 14px', fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }
const primaryBtn: React.CSSProperties = { padding: '12px 0', borderRadius: 4, border: 'none', background: 'var(--t-fg)', color: 'var(--t-on-fg)', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }

/** Photo strip with arrows, dots and swipe. `fit` is 'cover' on cards, 'contain'
 *  in the detail view so the whole vehicle/item is visible. */
function Photos({ l, idx, setIdx, aspect, fit, onOpen }: {
  l: PublicListing; idx: number; setIdx: (n: number) => void; aspect: string; fit: 'cover' | 'contain'; onOpen?: () => void
}) {
  const [x0, setX0] = useState<number | null>(null)
  const n = l.photos.length
  const go = (dir: number) => { if (n > 1) setIdx(((idx + dir) % n + n) % n) }
  const i = Math.min(idx, Math.max(0, n - 1))
  return (
    <div style={{ position: 'relative', aspectRatio: aspect, background: '#0b0b0b', cursor: onOpen ? 'pointer' : 'default' }}
      onClick={onOpen}
      onTouchStart={e => setX0(e.touches[0].clientX)}
      onTouchEnd={e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; setX0(null); if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1) }}>
      {l.photos[i] && <img src={l.photos[i]} alt={l.title} loading="lazy" draggable={false} style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />}
      {n > 1 && (<>
        {([['prev', -1], ['next', 1]] as const).map(([k, dir]) => (
          <button key={k} type="button" aria-label={k === 'prev' ? 'Previous photo' : 'Next photo'} onClick={e => { e.stopPropagation(); go(dir) }}
            style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(k === 'prev' ? { left: 8 } : { right: 8 }), width: 36, height: 36, borderRadius: 18, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={k === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>
          </button>
        ))}
        <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
          {l.photos.map((_, k) => (
            <button key={k} type="button" aria-label={`Photo ${k + 1}`} onClick={e => { e.stopPropagation(); setIdx(k) }}
              style={{ width: 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: k === i ? '#fff' : 'rgba(255,255,255,0.45)' }} />
          ))}
        </div>
      </>)}
    </div>
  )
}

export default function ListingsTab({ memberId = '', memberName = '', listings, isSelf = false, showVendor = false, emptyText }: {
  memberId?: string; memberName?: string; listings: PublicListing[]; isSelf?: boolean; showVendor?: boolean; emptyText?: string
}) {
  // Per-listing vendor (Services page) falls back to the profile's owner.
  const vName = (l: PublicListing) => l.vendor?.name || memberName
  const vId = (l: PublicListing) => l.vendor?.id || memberId
  const mine = (l: PublicListing) => l.is_self ?? isSelf
  const router = useRouter()
  const [photoIdx, setPhotoIdx] = useState<Record<string, number>>({})
  const idxOf = (id: string) => photoIdx[id] ?? 0
  const setIdxOf = (id: string) => (n: number) => setPhotoIdx(p => ({ ...p, [id]: n }))
  const [open, setOpen] = useState<PublicListing | null>(null)   // detail pop-up
  const [req, setReq] = useState<PublicListing | null>(null)     // request form
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // Report a listing (migration 139): inside the detail pop-up.
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [reportMsg, setReportMsg] = useState('')

  // Esc closes the top layer; the page behind doesn't scroll while one is open.
  useEffect(() => {
    if (!open && !req) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) { if (req) setReq(null); else setOpen(null) } }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, req, sending])

  if (listings.length === 0) {
    return (
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted, textAlign: 'center', padding: '48px 0', lineHeight: 1.6 }}>
        {emptyText ?? (isSelf ? <>No listings yet. Add them in <a href="/account/profile?s=listings" style={{ color: 'var(--t-gold)' }}>Settings → Service listings</a>.</> : 'No listings right now.')}
      </div>
    )
  }

  const openDetail = (l: PublicListing) => { setOpen(l); setReporting(false); setReportReason(''); setReportNote(''); setReportMsg(''); track('portfolio_open', { target_id: vId(l), meta: { kind: 'listing', listing: l.id } }) }
  const startRequest = (l: PublicListing) => { setReq(l); setDate(''); setNote(''); setError('') }

  const send = async () => {
    if (!req || sending) return
    if (!date) { setError('Pick the date you need it.'); return }
    setSending(true); setError('')
    trackNow('contact_click', { target_id: vId(req), meta: { what: 'listing_request', listing: req.id } })
    const res = await fetch('/api/listings/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: req.id, date, note: note.trim() }),
    })
    const s = await res.json().catch(() => ({}))
    if (!res.ok || !s.conversationId) { setError(s.error ?? 'Could not send the request.'); setSending(false); return }
    router.push(`/account/messages/${s.conversationId}`)
  }

  const clamp2: React.CSSProperties = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: '4px 0 24px' }}>
      {listings.map(l => (
        <div key={l.id} style={{ border: line, borderRadius: 10, overflow: 'hidden', background: 'var(--t-surface)', display: 'flex', flexDirection: 'column' }}>
          <Photos l={l} idx={idxOf(l.id)} setIdx={setIdxOf(l.id)} aspect="4 / 3" fit="cover" onOpen={() => openDetail(l)} />
          <div style={{ padding: '14px 16px', fontFamily: 'Inter', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {showVendor && l.vendor && (
              <a href={`/account/directory/${l.vendor.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--t-fg)', marginBottom: 10 }}>
                <span style={{ width: 24, height: 24, borderRadius: 12, overflow: 'hidden', background: 'var(--t-surface-hi, #222)', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11 }}>
                  {l.vendor.avatar_url ? <img src={l.vendor.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (l.vendor.name || '?').charAt(0).toUpperCase()}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{l.vendor.name}</span>
              </a>
            )}
            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t-gold)', marginBottom: 4 }}>{l.category.toUpperCase()}</div>
            <button type="button" onClick={() => openDetail(l)} style={{ all: 'unset', cursor: 'pointer', fontSize: 16, fontWeight: 600, color: 'var(--t-fg)', marginBottom: 4 }}>{l.title}</button>
            {l.rate && <div style={{ fontSize: 14, color: 'var(--t-fg)', marginBottom: 8 }}>{l.rate}</div>}
            {l.details && <div style={{ fontSize: 13, color: muted, lineHeight: 1.55, marginBottom: 6, ...clamp2 }}>{l.details}</div>}
            <button type="button" onClick={() => openDetail(l)} style={{ all: 'unset', cursor: 'pointer', fontSize: 12, color: 'var(--t-gold)', marginBottom: 12 }}>View details →</button>
            {!mine(l) && <button type="button" onClick={() => startRequest(l)} style={{ ...primaryBtn, marginTop: 'auto' }}>REQUEST</button>}
          </div>
        </div>
      ))}

      {/* DETAIL pop-up */}
      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 820, background: 'var(--t-bg, #0d0d0d)', border: line, borderRadius: 12, overflow: 'hidden', fontFamily: 'Inter' }}>
            <button type="button" aria-label="Close" onClick={() => setOpen(null)}
              style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 36, height: 36, borderRadius: 18, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: '36px', padding: 0 }}>×</button>
            <Photos l={open} idx={idxOf(open.id)} setIdx={setIdxOf(open.id)} aspect="3 / 2" fit="contain" />
            {open.photos.length > 1 && (
              <div style={{ display: 'flex', gap: 6, padding: '10px 14px 0', overflowX: 'auto' }}>
                {open.photos.map((u, k) => (
                  <button key={u} type="button" onClick={() => setIdxOf(open.id)(k)} aria-label={`Photo ${k + 1}`}
                    style={{ flex: '0 0 auto', width: 64, height: 48, padding: 0, borderRadius: 4, cursor: 'pointer', backgroundImage: `url(${u})`, backgroundSize: 'cover', backgroundPosition: 'center', border: k === idxOf(open.id) ? '2px solid var(--t-gold)' : '2px solid transparent', opacity: k === idxOf(open.id) ? 1 : 0.6 }} />
                ))}
              </div>
            )}
            <div style={{ padding: '18px 20px 22px' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t-gold)', marginBottom: 4 }}>{open.category.toUpperCase()} · {vName(open).toUpperCase()}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t-fg)', marginBottom: 6 }}>{open.title}</div>
              {open.rate && <div style={{ fontSize: 16, color: 'var(--t-fg)', marginBottom: open.price_extras ? 4 : 14 }}>{open.rate}</div>}
              {open.price_extras && <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>{open.price_extras}</div>}
              {open.details && <div style={{ fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.75 * var(--t-a)))', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{open.details}</div>}
              {open.notes && <div style={{ fontSize: 13, color: muted, lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: 14, fontStyle: 'italic' }}>{open.notes}</div>}
              {(open.tags ?? []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {(open.tags ?? []).map(t => <span key={t} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 12, border: line, color: muted }}>{t}</span>)}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: muted, lineHeight: 1.5, marginBottom: 16 }}>Pricing, payment, insurance and logistics are arranged directly with {vName(open).split(' ')[0] || 'the vendor'}. Made Kulture isn’t part of the arrangement.</div>
              {!mine(open) && (
                <div style={{ marginBottom: 14 }}>
                  {reportMsg ? <div style={{ fontSize: 12, color: 'var(--t-gold)' }}>{reportMsg}</div>
                  : !reporting ? <button type="button" onClick={() => setReporting(true)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11.5, color: muted, textDecoration: 'underline' }}>Report this listing</button>
                  : (
                    <div style={{ border: line, borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--t-fg)', marginBottom: 8 }}>What’s wrong with this listing? The vendor won’t see who reported it.</div>
                      <select value={reportReason} onChange={e => setReportReason(e.target.value)} style={{ ...input, padding: '10px 12px', marginBottom: 8 }}>
                        <option value="" style={{ background: '#111', color: '#eee' }}>Pick a reason…</option>
                        <option value="misleading" style={{ background: '#111', color: '#eee' }}>Misleading tags or details</option>
                        <option value="off_topic" style={{ background: '#111', color: '#eee' }}>Not a real service</option>
                        <option value="spam" style={{ background: '#111', color: '#eee' }}>Spam</option>
                        <option value="inappropriate" style={{ background: '#111', color: '#eee' }}>Inappropriate</option>
                        <option value="other" style={{ background: '#111', color: '#eee' }}>Other</option>
                      </select>
                      <input value={reportNote} onChange={e => setReportNote(e.target.value)} maxLength={300} placeholder="Anything else? (optional)" style={{ ...input, padding: '10px 12px', marginBottom: 8 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={async () => {
                          if (!reportReason) { setReportMsg(''); return }
                          const r = await fetch('/api/listings/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: open.id, reason: reportReason, note: reportNote }) })
                          const d = await r.json().catch(() => ({}))
                          setReportMsg(r.ok ? 'Thanks. The studio will take a look.' : (d.error || 'Could not send that.'))
                        }} style={{ ...primaryBtn, padding: '9px 14px', opacity: reportReason ? 1 : 0.5 }}>SEND REPORT</button>
                        <button type="button" onClick={() => setReporting(false)} style={{ padding: '9px 14px', borderRadius: 4, border: line, background: 'transparent', color: muted, fontSize: 12, cursor: 'pointer' }}>CANCEL</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!mine(open) && <button type="button" onClick={() => { const l = open; setOpen(null); startRequest(l) }} style={{ ...primaryBtn, width: '100%', padding: '14px 0' }}>REQUEST</button>}
            </div>
          </div>
        </div>
      )}

      {/* REQUEST form */}
      {req && (
        <div onClick={() => !sending && setReq(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--t-bg, #0d0d0d)', border: line, borderRadius: 10, padding: 20, fontFamily: 'Inter' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t-gold)' }}>REQUEST FROM {vName(req).toUpperCase()}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--t-fg)', margin: '6px 0 16px' }}>{req.title}</div>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>DATE NEEDED</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', color: muted, margin: '14px 0 6px' }}>DETAILS <span style={{ color: 'var(--t-gold)' }}>· optional</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} maxLength={1500} placeholder="Times, location, what the shoot is, pickup or delivery…" style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ fontSize: 12, color: muted, marginTop: 10, lineHeight: 1.5 }}>This sends {vName(req).split(' ')[0] || 'them'} a message. Made Kulture connects members but isn’t part of the arrangement: pricing, payment, insurance and logistics are between you and the vendor.</div>
            {error && <div style={{ color: '#e6a0a0', fontSize: 13, marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={send} disabled={sending} style={{ ...primaryBtn, flex: 1, opacity: sending ? 0.6 : 1 }}>{sending ? 'SENDING…' : 'SEND REQUEST'}</button>
              <button type="button" onClick={() => setReq(null)} disabled={sending} style={{ padding: '12px 18px', borderRadius: 4, border: line, background: 'transparent', color: muted, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
// The LISTINGS tab on a Production Services member's directory profile
// (migration 135). REQUEST opens (or reuses) the 1:1 directory conversation and
// sends a structured first message — no new inbox, no payment. The vendor and
// the member sort out the rest between themselves.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trackNow } from '@/lib/track'

export type PublicListing = { id: string; category: string; title: string; details: string; rate: string; notes: string; photos: string[] }

const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const line = '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))'
const input: React.CSSProperties = { width: '100%', background: 'var(--t-surface)', border: line, borderRadius: 4, padding: '12px 14px', fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }

export default function ListingsTab({ memberId, memberName, listings, isSelf }: { memberId: string; memberName: string; listings: PublicListing[]; isSelf: boolean }) {
  const router = useRouter()
  const [photoIdx, setPhotoIdx] = useState<Record<string, number>>({})
  // Step through a listing's photos, wrapping at both ends.
  const step = (l: PublicListing, dir: number) => setPhotoIdx(p => {
    const n = l.photos.length
    return n < 2 ? p : { ...p, [l.id]: (((p[l.id] ?? 0) + dir) % n + n) % n }
  })
  // Phone swipe: remember where the touch started per listing.
  const [touchX, setTouchX] = useState<Record<string, number>>({})
  const [req, setReq] = useState<PublicListing | null>(null)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  if (listings.length === 0) {
    return (
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted, textAlign: 'center', padding: '48px 0', lineHeight: 1.6 }}>
        {isSelf ? <>No listings yet. Add them in <a href="/account/profile?s=listings" style={{ color: 'var(--t-gold)' }}>Settings → Service listings</a>.</> : 'No listings right now.'}
      </div>
    )
  }

  const send = async () => {
    if (!req || sending) return
    if (!date) { setError('Pick the date you need it.'); return }
    setSending(true); setError('')
    trackNow('contact_click', { target_id: memberId, meta: { what: 'listing_request', listing: req.id } })
    const res = await fetch('/api/listings/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: req.id, date, note: note.trim() }),
    })
    const s = await res.json().catch(() => ({}))
    if (!res.ok || !s.conversationId) { setError(s.error ?? 'Could not send the request.'); setSending(false); return }
    router.push(`/account/messages/${s.conversationId}`)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: '4px 0 24px' }}>
      {listings.map(l => {
        const i = Math.min(photoIdx[l.id] ?? 0, Math.max(0, l.photos.length - 1))
        return (
          <div key={l.id} style={{ border: line, borderRadius: 10, overflow: 'hidden', background: 'var(--t-surface)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#111' }}
              onTouchStart={e => setTouchX(t => ({ ...t, [l.id]: e.touches[0].clientX }))}
              onTouchEnd={e => {
                const x0 = touchX[l.id]
                if (x0 == null) return
                const dx = e.changedTouches[0].clientX - x0
                if (Math.abs(dx) > 40) step(l, dx < 0 ? 1 : -1)
              }}>
              {l.photos[i] && <img src={l.photos[i]} alt={l.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              {l.photos.length > 1 && (<>
                {([['prev', -1], ['next', 1]] as const).map(([k, dir]) => (
                  <button key={k} type="button" aria-label={k === 'prev' ? 'Previous photo' : 'Next photo'} onClick={() => step(l, dir)}
                    style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(k === 'prev' ? { left: 8 } : { right: 8 }), width: 34, height: 34, borderRadius: 17, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={k === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>
                  </button>
                ))}
              </>)}
              {l.photos.length > 1 && (
                <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                  {l.photos.map((_, k) => (
                    <button key={k} type="button" aria-label={`Photo ${k + 1}`} onClick={() => setPhotoIdx(p => ({ ...p, [l.id]: k }))}
                      style={{ width: 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: k === i ? '#fff' : 'rgba(255,255,255,0.45)' }} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '14px 16px', fontFamily: 'Inter', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t-gold)', marginBottom: 4 }}>{l.category.toUpperCase()}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t-fg)', marginBottom: 4 }}>{l.title}</div>
              {l.rate && <div style={{ fontSize: 14, color: 'var(--t-fg)', marginBottom: 8 }}>{l.rate}</div>}
              {l.details && <div style={{ fontSize: 13, color: muted, lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{l.details}</div>}
              {l.notes && <div style={{ fontSize: 12, color: muted, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 8, fontStyle: 'italic' }}>{l.notes}</div>}
              {!isSelf && (
                <button type="button" onClick={() => { setReq(l); setDate(''); setNote(''); setError('') }}
                  style={{ marginTop: 'auto', padding: '12px 0', borderRadius: 4, border: 'none', background: 'var(--t-fg)', color: 'var(--t-on-fg)', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }}>
                  REQUEST
                </button>
              )}
            </div>
          </div>
        )
      })}

      {req && (
        <div onClick={() => !sending && setReq(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--t-bg, #0d0d0d)', border: line, borderRadius: 10, padding: 20, fontFamily: 'Inter' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--t-gold)' }}>REQUEST FROM {memberName.toUpperCase()}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--t-fg)', margin: '6px 0 16px' }}>{req.title}</div>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>DATE NEEDED</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
            <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', color: muted, margin: '14px 0 6px' }}>DETAILS <span style={{ color: 'var(--t-gold)' }}>· optional</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} maxLength={1500} placeholder="Times, location, what the shoot is, pickup or delivery…" style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ fontSize: 12, color: muted, marginTop: 10, lineHeight: 1.5 }}>This sends {memberName.split(' ')[0] || 'them'} a message. Made Kulture connects members but isn’t part of the arrangement: pricing, payment, insurance and logistics are between you and the vendor.</div>
            {error && <div style={{ color: '#e6a0a0', fontSize: 13, marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={send} disabled={sending} style={{ flex: 1, padding: '12px 0', borderRadius: 4, border: 'none', background: 'var(--t-fg)', color: 'var(--t-on-fg)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>{sending ? 'SENDING…' : 'SEND REQUEST'}</button>
              <button type="button" onClick={() => setReq(null)} disabled={sending} style={{ padding: '12px 18px', borderRadius: 4, border: line, background: 'transparent', color: muted, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', good: '#5bd08a', warn: '#e0b64a' }

type ShiftPhase = 'upcoming' | 'clock_in_open' | 'working' | 'done' | 'missed'
type ShiftPhoto = { id: string; url: string; caption: string; created_at: string }
type PublicShift = { id: string; starts_at: string; ends_at: string; worker_class: string; label: string; notes: string }
type MyShift = PublicShift & {
  clock_in_at: string | null
  clock_out_at: string | null
  can_clock_in: boolean
  phase: ShiftPhase
  photo_min: number
  photos: ShiftPhoto[]
  can_review: boolean
  worker_review: { rating: number; note: string; created_at: string } | null
}
type View = {
  enrolled: boolean
  eligibility: { active: boolean; certified: boolean; worker_class: string | null; label: string | null }
  open: PublicShift[]
  mine: MyShift[]
}

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso)
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sameDay = s.toDateString() === e.toDateString()
  return sameDay ? `${day} · ${t(s)} – ${t(e)}` : `${day} ${t(s)} → ${e.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${t(e)}`
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function workedLabel(inIso: string, outIso: string): string {
  const mins = Math.max(0, Math.round((new Date(outIso).getTime() - new Date(inIso).getTime()) / 60000))
  const h = Math.floor(mins / 60), m = mins % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

// ── A claimed shift with clock + closeout-photo controls ─────────────────────────
function MineCard({ s, reload }: { s: MyShift; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [caption, setCaption] = useState('')
  const [rating, setRating] = useState(s.worker_review?.rating ?? 0)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const clock = async (action: 'in' | 'out') => {
    setBusy(true); setErr('')
    const r = await fetch(`/api/work/shifts/${s.id}/clock`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Something went wrong.'); }
    reload()
  }
  const drop = async () => {
    setBusy(true); setErr('')
    const r = await fetch(`/api/work/shifts/${s.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not drop.'); }
    reload()
  }
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setBusy(true); setErr('')
    const fd = new FormData()
    fd.append('file', file)
    if (caption.trim()) fd.append('caption', caption.trim())
    const r = await fetch(`/api/work/shifts/${s.id}/photos`, { method: 'POST', body: fd })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Upload failed.'); return }
    setCaption(''); reload()
  }
  const removePhoto = async (photoId: string) => {
    setBusy(true); setErr('')
    const r = await fetch(`/api/work/shifts/${s.id}/photos?photoId=${photoId}`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not remove.'); return }
    reload()
  }
  const rateStudio = async (stars: number) => {
    setRating(stars); setBusy(true); setErr('')
    const r = await fetch(`/api/work/shifts/${s.id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: stars }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not save rating.'); return }
    reload()
  }

  const pillBtn: React.CSSProperties = { background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer' }
  const ghostBtn: React.CSSProperties = { background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '9px 16px', fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer' }

  const photoStrip = (removable: boolean) => (
    s.photos.length > 0 && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {s.photos.map(p => (
          <div key={p.id} style={{ position: 'relative' }}>
            <a href={p.url} target="_blank" rel="noreferrer">
              <img src={p.url} alt={p.caption || 'closeout'} title={p.caption} style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}`, display: 'block' }} />
            </a>
            {removable && (
              <button onClick={() => removePhoto(p.id)} disabled={busy} aria-label="Remove photo"
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#1c1c1f', color: '#ff6b6b', border: `1px solid ${C.line}`, fontSize: 12, lineHeight: '18px', cursor: 'pointer', padding: 0 }}>×</button>
            )}
          </div>
        ))}
      </div>
    )
  )

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtRange(s.starts_at, s.ends_at)}</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{s.label}{s.notes ? ` · ${s.notes}` : ''}</div>
        </div>
        {s.phase === 'clock_in_open' && s.can_clock_in && (
          <button onClick={() => clock('in')} disabled={busy} style={pillBtn}>{busy ? '…' : 'CLOCK IN'}</button>
        )}
        {(s.phase === 'upcoming' || s.phase === 'clock_in_open') && (
          <button onClick={drop} disabled={busy} style={ghostBtn}>{busy ? '…' : 'DROP'}</button>
        )}
      </div>

      {s.phase === 'upcoming' && (
        <div style={{ fontSize: 12, color: C.dim, marginTop: 10 }}>Clock-in opens 30 minutes before your start time.</div>
      )}

      {s.phase === 'missed' && (
        <div style={{ fontSize: 12, color: C.warn, marginTop: 10 }}>This shift ended and you never clocked in. Message the studio to sort out the hours.</div>
      )}

      {s.phase === 'working' && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: C.good, marginBottom: 10 }}>● Clocked in at {fmtTime(s.clock_in_at!)}</div>

          <div style={{ fontSize: 12, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Closeout photos</div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
            Snap each set once it&apos;s reset to photo-ready. You need at least {s.photo_min} to clock out.
          </div>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption (optional) — e.g. Set B reset"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontSize: 13, padding: '9px 12px', borderRadius: 6, flex: '1 1 180px', minWidth: 140, outline: 'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...ghostBtn, color: C.text }}>{busy ? '…' : '+ ADD PHOTO'}</button>
          </div>

          {photoStrip(true)}

          <button onClick={() => clock('out')} disabled={busy || s.photos.length < s.photo_min}
            style={{ ...pillBtn, marginTop: 14, opacity: s.photos.length < s.photo_min ? 0.4 : 1, cursor: s.photos.length < s.photo_min ? 'not-allowed' : 'pointer' }}>
            {busy ? '…' : 'CLOCK OUT'}
          </button>
          {s.photos.length < s.photo_min && (
            <div style={{ fontSize: 12, color: C.warn, marginTop: 8 }}>Add {s.photo_min - s.photos.length} more closeout photo{s.photo_min - s.photos.length === 1 ? '' : 's'} to clock out.</div>
          )}
        </div>
      )}

      {s.phase === 'done' && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <div style={{ fontSize: 13, color: C.good }}>
            ✓ Completed · {fmtTime(s.clock_in_at!)} – {fmtTime(s.clock_out_at!)} · {workedLabel(s.clock_in_at!, s.clock_out_at!)} · {s.photos.length} photo{s.photos.length === 1 ? '' : 's'}
          </div>
          {photoStrip(false)}
          {s.can_review && (
            <div style={{ marginTop: 12 }}>
              {s.worker_review ? (
                <div style={{ fontSize: 12, color: C.dim }}>
                  You rated this shift <span style={{ color: C.warn }}>{'★'.repeat(s.worker_review.rating)}{'☆'.repeat(5 - s.worker_review.rating)}</span>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>How was this shift?</div>
                  <span>{[1, 2, 3, 4, 5].map(i => (
                    <span key={i} onClick={() => !busy && rateStudio(i)} style={{ cursor: busy ? 'default' : 'pointer', color: C.warn, fontSize: 24, opacity: i <= rating ? 1 : 0.3, padding: '0 2px' }}>★</span>
                  ))}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  )
}

export default function WorkShiftsPage() {
  const [view, setView] = useState<View | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const r = await fetch('/api/work/shifts')
    if (r.status === 401) { window.location.href = '/login?next=/work/shifts'; return }
    setView(await r.json().catch(() => null)); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const claim = async (id: string) => {
    setBusyId(id); setErr('')
    const r = await fetch(`/api/work/shifts/${id}`, { method: 'POST' })
    setBusyId(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not claim.'); load(); return }
    load()
  }

  if (loading) return <div style={{ color: C.dim }}>Loading…</div>

  if (view && !view.enrolled) {
    return (
      <div>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '0 0 8px' }}>SHIFTS</h1>
        <p style={{ color: C.dim, marginTop: 0 }}>You haven&apos;t applied to work yet.</p>
        <Link href="/work/onboarding" style={{ color: C.accent, fontSize: 14 }}>Start orientation →</Link>
      </div>
    )
  }

  const elig = view!.eligibility
  const canClaim = elig.active && elig.certified
  let banner: { text: string; tone: 'good' | 'warn' | 'dim'; cta?: boolean } | null = null
  if (!elig.certified) banner = { text: 'Finish your orientation modules to unlock shifts.', tone: 'warn', cta: true }
  else if (!elig.active) banner = { text: 'You’re certified — your application is under review. Once the studio marks you active, open shifts will appear here.', tone: 'warn' }
  else banner = { text: `You’re active and certified as ${elig.label}. Claim any open shift below.`, tone: 'good' }

  const claimCard = (s: PublicShift) => (
    <div key={s.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtRange(s.starts_at, s.ends_at)}</div>
        <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{s.label}{s.notes ? ` · ${s.notes}` : ''}</div>
      </div>
      <button onClick={() => claim(s.id)} disabled={busyId === s.id} style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '9px 18px', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' }}>{busyId === s.id ? '…' : 'CLAIM'}</button>
    </div>
  )

  const toneColor = banner.tone === 'good' ? C.good : banner.tone === 'warn' ? C.warn : C.dim
  const toneBg = banner.tone === 'good' ? 'rgba(91,208,138,0.12)' : banner.tone === 'warn' ? 'rgba(224,182,74,0.12)' : C.card
  const toneBorder = banner.tone === 'good' ? 'rgba(91,208,138,0.4)' : banner.tone === 'warn' ? 'rgba(224,182,74,0.35)' : C.line

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '0 0 6px' }}>SHIFTS</h1>
        <Link href="/work/onboarding" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>Orientation →</Link>
      </div>

      <div style={{ background: toneBg, border: `1px solid ${toneBorder}`, borderRadius: 10, padding: '12px 16px', margin: '10px 0 24px', color: toneColor, fontSize: 14 }}>
        {banner.text}{banner.cta && <> <Link href="/work/onboarding" style={{ color: C.accent }}>Go to orientation →</Link></>}
      </div>

      {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {view!.mine.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Your shifts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{view!.mine.map(s => <MineCard key={s.id} s={s} reload={load} />)}</div>
        </div>
      )}

      {canClaim && (
        <div>
          <div style={{ fontSize: 12, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Open shifts</div>
          {view!.open.length === 0
            ? <div style={{ color: C.dim, fontSize: 14 }}>No open shifts for your role right now. Check back soon.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{view!.open.map(s => claimCard(s))}</div>}
        </div>
      )}
    </div>
  )
}

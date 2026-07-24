'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', good: '#5bd08a', warn: '#e0b64a' }

type PublicShift = { id: string; starts_at: string; ends_at: string; worker_class: string; label: string; notes: string }
type View = {
  enrolled: boolean
  eligibility: { active: boolean; certified: boolean; worker_class: string | null; label: string | null }
  open: PublicShift[]
  mine: PublicShift[]
}

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso)
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sameDay = s.toDateString() === e.toDateString()
  return sameDay ? `${day} · ${t(s)} – ${t(e)}` : `${day} ${t(s)} → ${e.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${t(e)}`
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
  const drop = async (id: string) => {
    setBusyId(id); setErr('')
    const r = await fetch(`/api/work/shifts/${id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not drop.'); load(); return }
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

  const card = (s: PublicShift, action: 'claim' | 'drop') => (
    <div key={s.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtRange(s.starts_at, s.ends_at)}</div>
        <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{s.label}{s.notes ? ` · ${s.notes}` : ''}</div>
      </div>
      {action === 'claim'
        ? <button onClick={() => claim(s.id)} disabled={busyId === s.id} style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '9px 18px', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' }}>{busyId === s.id ? '…' : 'CLAIM'}</button>
        : <button onClick={() => drop(s.id)} disabled={busyId === s.id} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '9px 16px', fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>{busyId === s.id ? '…' : 'DROP'}</button>}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{view!.mine.map(s => card(s, 'drop'))}</div>
        </div>
      )}

      {canClaim && (
        <div>
          <div style={{ fontSize: 12, color: C.dim, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Open shifts</div>
          {view!.open.length === 0
            ? <div style={{ color: C.dim, fontSize: 14 }}>No open shifts for your role right now. Check back soon.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{view!.open.map(s => card(s, 'claim'))}</div>}
        </div>
      )}
    </div>
  )
}

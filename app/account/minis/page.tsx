'use client'
// /account/minis — Mini Sessions: pick one of your upcoming bookings and turn
// it into a mini-session day with a sign-up link for your clients.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ShootsTabs from '@/components/ShootsTabs'

type Plan = { id: string; title: string | null; start_time: string; end_time: string; place: string; requested: number }
type Row = { id: string; start_time: string; end_time: string; place: string; mini: { status: string; title: string | null; booked: number } | null }

const TZ = 'America/Chicago'
const day = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))
const time = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`

export default function MinisPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [error, setError] = useState('')
  const [planning, setPlanning] = useState(false)
  useEffect(() => {
    fetch('/api/account/minis', { cache: 'no-store' })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) { setRows(d.bookings ?? []); setPlans(d.plans ?? []) } else setError(d.error || 'Could not load your bookings.') })
      .catch(() => setError('Could not load your bookings.'))
  }, [])

  return (
    <div>
      <ShootsTabs />
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>MINI SESSIONS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.55), margin: '0 0 22px', maxWidth: 560, lineHeight: 1.6 }}>
        Running minis? Turn a booking into time slots and share one link. Your clients pick a time and tell you how many are coming;
        you get a roster. You collect payment your own way — we just keep the day organized.
      </p>
      <div style={{ background: 'var(--t-surface)', border: `1px solid rgba(var(--t-gold-rgb), 0.35)`, borderRadius: 8, padding: '16px 18px', marginBottom: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)', lineHeight: 1.5, maxWidth: 520 }}>
            <b>Not booked yet?</b> Plan a mini day first and share the link — see how many clients sign up before you book the studio.
          </div>
          {!planning && <button onClick={() => setPlanning(true)} style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--t-fg)', color: 'var(--t-on-fg)', cursor: 'pointer' }}>Plan a mini day</button>}
        </div>
        {planning && <PlanForm onCancel={() => setPlanning(false)} />}
      </div>

      {plans.length > 0 && (
        <>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted(0.5), margin: '0 0 8px' }}>Planned — not booked yet</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            {plans.map(p => (
              <Link key={p.id} href={`/account/minis/${p.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', background: 'var(--t-surface)', border: `1px dashed rgba(var(--t-gold-rgb), 0.5)`, borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: 'var(--t-fg)' }}>{day(p.start_time)} · {time(p.start_time)} – {time(p.end_time)}</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.5), marginTop: 4 }}>{p.place}{p.title ? ` · ${p.title}` : ''}</div>
                </div>
                <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '5px 10px', borderRadius: 4, background: 'rgba(var(--t-gold-rgb), 0.15)', color: 'var(--t-gold)' }}>PLANNED · {p.requested} REQUESTED</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {error && <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-err)' }}>{error}</div>}
      {!rows && !error && <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.4) }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.5), lineHeight: 1.6 }}>
          You don’t have any upcoming bookings. <Link href="/book" style={{ color: 'var(--t-gold)' }}>Book a set or the full warehouse</Link>, or plan a mini day above and book once clients sign up.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows?.map(b => (
          <Link key={b.id} href={`/account/minis/${b.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', background: 'var(--t-surface)', border: `1px solid ${muted(0.08)}`, borderRadius: 8, padding: '16px 18px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: 'var(--t-fg)' }}>{day(b.start_time)} · {time(b.start_time)} – {time(b.end_time)}</div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.5), marginTop: 4 }}>{b.place}{b.mini?.title ? ` · ${b.mini.title}` : ''}</div>
            </div>
            {b.mini ? (
              <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '5px 10px', borderRadius: 4, background: 'rgba(var(--t-gold-rgb), 0.15)', color: 'var(--t-gold)' }}>
                {b.mini.status === 'cancelled' ? 'CANCELLED' : `${b.mini.booked} BOOKED${b.mini.status === 'closed' ? ' · CLOSED' : ''}`}
              </span>
            ) : (
              <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 6, background: 'var(--t-fg)', color: 'var(--t-on-fg)' }}>Set up minis</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

const HOURS = Array.from({ length: 27 }, (_, i) => 9 + i / 2)   // 9:00 AM – 10:00 PM (studio hours)
const hourLabel = (h: number) => { const hr = Math.floor(h), m = h % 1 ? '30' : '00'; return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}` }

function PlanForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const [sets, setSets] = useState<{ id: string; name: string }[]>([])
  const [where, setWhere] = useState('')            // set id, or 'buyout'
  const [date, setDate] = useState('')
  const [start, setStart] = useState(10)
  const [end, setEnd] = useState(14)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { fetch('/api/sets').then(r => r.json()).then(d => setSets((d.sets ?? []).map((s: any) => ({ id: s.id, name: s.name })))).catch(() => {}) }, [])
  const field: React.CSSProperties = { fontFamily: 'Inter', fontSize: 14, padding: '9px 10px', borderRadius: 6, border: `1px solid ${muted(0.15)}`, background: 'var(--t-surface-lo)', color: 'var(--t-fg)', colorScheme: 'var(--t-scheme)' as any }
  const opt: React.CSSProperties = { background: 'var(--t-surface)', color: 'var(--t-fg)' }
  const submit = async () => {
    setErr('')
    if (!where || !date) { setErr('Pick a set and a date.'); return }
    setBusy(true)
    const r = await fetch('/api/account/minis', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(where === 'buyout' ? { buyout: true } : { setId: where }), date, startHour: start, endHour: end }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not plan that.'); return }
    router.push(`/account/minis/${d.id}`)
  }
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={field} value={where} onChange={e => setWhere(e.target.value)}>
          <option value="" style={opt}>Which set?</option>
          {sets.map(s => <option key={s.id} value={s.id} style={opt}>{s.name}</option>)}
          <option value="buyout" style={opt}>Full warehouse</option>
        </select>
        <input type="date" style={field} value={date} onChange={e => setDate(e.target.value)} />
        <select style={field} value={start} onChange={e => { const v = Number(e.target.value); setStart(v); if (end < v + 1) setEnd(v + 1) }}>
          {HOURS.filter(h => Number.isInteger(h) && h <= 21).map(h => <option key={h} value={h} style={opt}>{hourLabel(h)}</option>)}
        </select>
        <span style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.5) }}>to</span>
        <select style={field} value={end} onChange={e => setEnd(Number(e.target.value))}>
          {HOURS.filter(h => h >= start + 1).map(h => <option key={h} value={h} style={opt}>{hourLabel(h)}</option>)}
        </select>
      </div>
      <p style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.5), margin: '10px 0', lineHeight: 1.6 }}>
        Plan at least 3 days out. A plan doesn’t hold the studio — someone else can still book that time, and we’ll tell you if they do. Clients see the day as pending until you book it; if it isn’t booked by 48 hours before, it’s called off and they’re told.
      </p>
      {err && <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={busy} onClick={submit} style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 6, border: 'none', background: 'var(--t-fg)', color: 'var(--t-on-fg)', cursor: 'pointer' }}>{busy ? 'Planning…' : 'Create plan'}</button>
        <button onClick={onCancel} style={{ fontFamily: 'Inter', fontSize: 13, padding: '9px 16px', borderRadius: 6, border: `1px solid ${muted(0.2)}`, background: 'transparent', color: 'var(--t-fg)', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

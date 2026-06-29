'use client'

import { useEffect, useState, useCallback } from 'react'
import { ROLE_LABELS, type StaffRole } from '@/lib/staff-permissions'
import ChargePanel from './ChargePanel'
import GearPanel from './GearPanel'

type Booking = {
  id: string; start_time: string; end_time: string; status: string
  guest_count: number | null; arrived_guest_count: number | null
  checked_in_at: string | null; checked_out_at: string | null; notes: string | null
  total_amount: number | null
  sets: { name: string } | null
  customers: { name: string | null; phone: string | null; email: string | null; banned: boolean | null } | null
  booking_add_ons: { quantity: number; paid: boolean; equipment: { name: string } | null }[] | null
}
type Me = { staff: { id: string; name: string; role: StaffRole } | null; permissions?: Record<string, boolean> }

const C = {
  bg: '#0f0f10', card: '#1a1a1c', line: '#2a2a2e', text: '#f4f4f5',
  dim: '#a1a1aa', accent: '#ef6354', good: '#22c55e', amber: '#f59e0b', input: '#232327',
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
const setNameOf = (b: Booking) => b.sets?.name ?? 'Full Studio Takeover'

const btn = (kind: 'solid' | 'ghost' | 'danger' = 'solid'): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
  fontSize: 13, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.03em',
  background: kind === 'solid' ? C.accent : 'transparent',
  color: kind === 'solid' ? '#fff' : kind === 'danger' ? C.accent : C.dim,
  border: kind === 'solid' ? 'none' : `1px solid ${kind === 'danger' ? C.accent : C.line}`,
})

export default function Desk() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'today' | 'upcoming'>('today')
  const [busy, setBusy] = useState<string | null>(null)
  const [gearFor, setGearFor] = useState<Booking | null>(null)

  useEffect(() => {
    fetch('/api/staff/me', { cache: 'no-store' }).then(r => r.json()).then((m: Me) => { setMe(m); setLoading(false) })
  }, [])

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim()); else params.set('scope', scope)
    const r = await fetch(`/api/desk/bookings?${params}`, { cache: 'no-store' })
    if (r.ok) setBookings((await r.json()).bookings)
  }, [q, scope])

  useEffect(() => { if (me?.staff) load() }, [me, load])

  const act = async (url: string, body: any, label: string) => {
    setBusy(label)
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(null)
    if (!r.ok) { alert((await r.json()).error ?? 'Action failed.'); return false }
    await load(); return true
  }
  const checkIn = (b: Booking) => {
    const g = prompt(`Check in ${b.customers?.name ?? 'guest'} — how many arrived? (optional, booked ${b.guest_count ?? '—'})`)
    if (g === null) return
    act(`/api/desk/bookings/${b.id}/checkin`, { action: 'check_in', guests: g ? Number(g) : undefined }, b.id)
  }
  const checkOut = (b: Booking) => act(`/api/desk/bookings/${b.id}/checkin`, { action: 'check_out' }, b.id)
  const cancel = (b: Booking) => {
    if (!confirm(`Cancel ${b.customers?.name ?? 'this booking'} — ${setNameOf(b)} ${fmtTime(b.start_time)}? This does not auto-refund.`)) return
    const reason = prompt('Reason (optional, logged):') ?? ''
    act(`/api/desk/bookings/${b.id}/cancel`, { reason }, b.id)
  }
  const addTime = async (b: Booking) => {
    const h = prompt(`Add how many hours to ${b.customers?.name ?? 'this booking'} (${setNameOf(b)})?`)
    if (h === null) return
    const hours = Number(h)
    if (!(hours > 0 && hours <= 12)) { alert('Enter 1–12 hours.'); return }
    setBusy(b.id)
    const pv = await fetch(`/api/desk/bookings/${b.id}/add-time?hours=${hours}`, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    setBusy(null)
    if (!pv || pv.error) { alert(pv?.error ?? 'Could not price the extension.'); return }
    if (pv.conflict) { alert('The set is booked right after — can’t extend into another booking.'); return }
    const price = (pv.priceCents / 100).toFixed(2)
    const msg = pv.hasCardOnFile
      ? `Add ${hours} hr to ${pv.setName} — $${price}.\nCharge the card on file?`
      : `Add ${hours} hr to ${pv.setName} — $${price}.\nNo card on file — extend now and collect $${price} manually?`
    if (!confirm(msg)) return
    setBusy(b.id)
    const r = await fetch(`/api/desk/bookings/${b.id}/add-time`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours, charge: pv.hasCardOnFile }) })
    const d = await r.json()
    setBusy(null)
    if (!r.ok) { alert(d.error ?? 'Could not add time.'); return }
    alert(d.charged ? `✓ $${price} charged and booking extended.` : `✓ Extended. Collect $${price} manually.`)
    load()
  }
  const signOut = async () => { await fetch('/api/staff/logout', { method: 'POST' }); window.location.href = '/staff' }

  if (loading) return <Shell><p style={{ color: C.dim }}>Loading…</p></Shell>
  if (!me?.staff) return (
    <Shell><div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 28, maxWidth: 400, margin: '40px auto', textAlign: 'center' }}>
      <p style={{ color: C.dim }}>You need to sign in to use the front desk.</p>
      <a href="/staff" style={{ ...btn(), display: 'inline-block', textDecoration: 'none' }}>Go to sign in</a>
    </div></Shell>
  )

  const canCancel = !!me.permissions?.['booking.cancel']
  const canAddOn = !!me.permissions?.['addon.add']

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 26 }}>FRONT DESK</div>
          <div style={{ color: C.dim, fontSize: 14 }}>{me.staff.name} · <span style={{ color: C.accent }}>{ROLE_LABELS[me.staff.role]}</span></div>
        </div>
        <button style={btn('ghost')} onClick={signOut}>Lock</button>
      </div>

      {!!me.permissions?.['payment.terminal'] && <ChargePanel />}

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, or booking #…"
          style={{ flex: '1 1 280px', padding: '10px 14px', background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, fontSize: 15 }}
        />
        {!q && (['today', 'upcoming'] as const).map(s => (
          <button key={s} onClick={() => setScope(s)} style={{ ...btn(scope === s ? 'solid' : 'ghost') }}>{s === 'today' ? 'Today' : 'Upcoming'}</button>
        ))}
        {q && <button onClick={() => setQ('')} style={btn('ghost')}>Clear</button>}
      </div>

      {bookings.length === 0 && <p style={{ color: C.dim }}>{q ? 'No matches.' : scope === 'today' ? 'No bookings today.' : 'Nothing upcoming.'}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {bookings.map(b => {
          const isToday = !q && scope === 'today'
          const unpaidGear = (b.booking_add_ons ?? []).filter(a => !a.paid)
          return (
            <div key={b.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>
                    {b.customers?.name ?? 'Guest'}
                    {b.customers?.banned && <span style={{ color: C.accent, fontSize: 12, marginLeft: 8 }}>⚠ FLAGGED</span>}
                  </div>
                  <div style={{ color: C.dim, fontSize: 14 }}>
                    {setNameOf(b)} · {isToday ? '' : fmtDay(b.start_time) + ' · '}{fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                  </div>
                  <div style={{ color: C.dim, fontSize: 13, marginTop: 2 }}>
                    👥 {b.arrived_guest_count ?? '—'}/{b.guest_count ?? '—'}
                    {b.customers?.phone ? ` · ${b.customers.phone}` : ''}
                    {unpaidGear.length ? ` · 🎒 ${unpaidGear.length} unpaid gear` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <StatusBadge b={b} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {!b.checked_in_at && <button disabled={busy === b.id} style={btn('solid')} onClick={() => checkIn(b)}>Check in</button>}
                {b.checked_in_at && !b.checked_out_at && <button disabled={busy === b.id} style={btn('solid')} onClick={() => checkOut(b)}>Check out</button>}
                {canAddOn && !b.checked_out_at && <button disabled={busy === b.id} style={btn('ghost')} onClick={() => addTime(b)}>+ Add time</button>}
                {canAddOn && !b.checked_out_at && <button disabled={busy === b.id} style={btn('ghost')} onClick={() => setGearFor(b)}>+ Add gear</button>}
                {canCancel && <button disabled={busy === b.id} style={btn('danger')} onClick={() => cancel(b)}>Cancel</button>}
              </div>
            </div>
          )
        })}
      </div>

      {gearFor && (
        <GearPanel
          bookingId={gearFor.id}
          label={`${gearFor.customers?.name ?? 'Guest'} · ${setNameOf(gearFor)} · ${fmtTime(gearFor.start_time)}–${fmtTime(gearFor.end_time)}`}
          onClose={() => setGearFor(null)}
          onDone={load}
        />
      )}
    </Shell>
  )
}

function StatusBadge({ b }: { b: Booking }) {
  let label = 'Upcoming', color = C.dim
  if (b.checked_out_at) { label = 'Checked out'; color = C.dim }
  else if (b.checked_in_at) { label = 'Here now'; color = C.good }
  return <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color, border: `1px solid ${color}`, borderRadius: 6, padding: '3px 8px' }}>{label}</span>
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter Tight, system-ui, sans-serif', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 820, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

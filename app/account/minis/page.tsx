'use client'
// /account/minis — Mini Sessions: pick one of your upcoming bookings and turn
// it into a mini-session day with a sign-up link for your clients.
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Row = { id: string; start_time: string; end_time: string; place: string; mini: { status: string; title: string | null; booked: number } | null }

const TZ = 'America/Chicago'
const day = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))
const time = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`

export default function MinisPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/api/account/minis', { cache: 'no-store' })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => ok ? setRows(d.bookings ?? []) : setError(d.error || 'Could not load your bookings.'))
      .catch(() => setError('Could not load your bookings.'))
  }, [])

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>MINI SESSIONS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.55), margin: '0 0 22px', maxWidth: 560, lineHeight: 1.6 }}>
        Running minis? Turn a booking into time slots and share one link. Your clients pick a time and tell you how many are coming;
        you get a roster. You collect payment your own way — we just keep the day organized.
      </p>
      {error && <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-err)' }}>{error}</div>}
      {!rows && !error && <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.4) }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.5), lineHeight: 1.6 }}>
          You don’t have any upcoming bookings. <Link href="/book" style={{ color: 'var(--t-gold)' }}>Book a set or the full warehouse</Link>, then come back to set up your minis.
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

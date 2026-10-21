'use client'
// Admin — Balances (2026-10-21). Every payment link that went out and hasn't
// been paid, across all bookings. Source: /api/admin/balances.
//
// Paid by card → the Square webhook clears it AND pushes "X paid $Y".
// Paid by cash/Zelle → "Mark paid" (also kills the Square link).
// Not owed after all → "Cancel charge" (existing cancel-link endpoint).
//
// ⚠️ Links sent from Edit Booking before 2026-10-21 were never recorded and
// can't show here.

import { useEffect, useState } from 'react'

interface Row {
  id: string; bookingId: string; label: string; amount: number; hasLink: boolean
  linkSentAt: string | null; reminderSentAt: string | null
  bookingStart: string | null; bookingEnd: string | null; bookingStatus: string | null
  setName: string; customerName: string; customerPhone: string; customerEmail: string
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', gold: '#d4a843', red: '#e57373' }
const TZ = 'America/Chicago'

// Studio time ALWAYS through Intl with an explicit timeZone (server runs UTC).
function bookingWhen(iso: string | null) {
  if (!iso) return 'No date'
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
function ago(iso: string | null) {
  if (!iso) return 'unknown'
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}
const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`

export default function BalancesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    const r = await fetch('/api/admin/balances', { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    // A failed load must never render as "nobody owes anything".
    if (!r.ok) { setErr(d?.error || 'Could not load balances'); setLoading(false); return }
    setRows(d.rows ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const act = async (row: Row, action: 'resend' | 'mark_paid' | 'cancel') => {
    const who = row.customerName || 'this customer'
    const confirmText = action === 'resend'
      ? `Text ${who} the ${money(row.amount)} link again?`
      : action === 'mark_paid'
        ? `Mark ${money(row.amount)} from ${who} as PAID (cash/Zelle)? This adds it to the booking total and turns off the Square link.`
        : `Cancel the ${money(row.amount)} charge for ${who}? They won't owe it and the link stops working.`
    if (!window.confirm(confirmText)) return
    setBusy(row.id); setErr(''); setMsg('')
    const r = action === 'cancel'
      ? await fetch(`/api/admin/bookings/${row.bookingId}/cancel-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addOnId: row.id }) })
      : await fetch('/api/admin/balances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addOnId: row.id, action }) })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok || d?.error) { setErr(d?.error || 'That did not work'); return }
    setMsg(action === 'resend' ? `Link re-sent to ${who}.` : action === 'mark_paid' ? `Marked paid.${d?.note ? ' ' + d.note : ''}` : 'Charge cancelled.')
    load()
  }

  if (unauth) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Admin sign-in required.</main>

  const active = rows.filter(r => r.bookingStatus !== 'cancelled')
  const cancelled = rows.filter(r => r.bookingStatus === 'cancelled')
  const total = active.reduce((s, r) => s + r.amount, 0)
  const btn = (bg: string, fg: string) => ({ background: bg, color: fg, border: `1px solid ${C.line}`, borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as const)

  const card = (r: Row) => (
    <div key={r.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 10, opacity: busy === r.id ? 0.5 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r.customerName || 'Unknown customer'}</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            {r.label} · {r.setName} · {bookingWhen(r.bookingStart)}
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>
            Link sent {ago(r.linkSentAt)}
            {' · '}
            {r.reminderSentAt
              ? <span>reminder sent {ago(r.reminderSentAt)}</span>
              : <span style={{ color: C.accent }}>no reminder yet (auto after 48h)</span>}
            {!r.hasLink && <span style={{ color: C.red }}> · no Square link on record</span>}
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.gold }}>{money(r.amount)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button disabled={!!busy || !r.hasLink} onClick={() => act(r, 'resend')} style={btn('transparent', C.text)}>Resend link</button>
        <button disabled={!!busy} onClick={() => act(r, 'mark_paid')} style={btn(C.gold, '#0b0b0d')}>Mark paid (cash/Zelle)</button>
        <button disabled={!!busy} onClick={() => act(r, 'cancel')} style={btn('transparent', C.red)}>Cancel charge</button>
      </div>
    </div>
  )

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 34, letterSpacing: '0.04em', margin: 0 }}>Balances</h1>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>
          Payment links that went out and haven&apos;t been paid. Card payments clear here on their own and you get a notification.
        </p>
        {!loading && !err && (
          <div style={{ margin: '18px 0', fontSize: 14 }}>
            {active.length
              ? <><b style={{ color: C.gold }}>{money(total)}</b> outstanding across {active.length} link{active.length === 1 ? '' : 's'}</>
              : <span style={{ color: C.accent }}>Nobody owes anything right now.</span>}
          </div>
        )}
        {err && <div style={{ background: 'rgba(229,115,115,0.12)', border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 13 }}>{err}</div>}
        {msg && <div style={{ background: 'rgba(201,178,126,0.12)', border: `1px solid ${C.accent}`, borderRadius: 8, padding: 12, margin: '12px 0', fontSize: 13 }}>{msg}</div>}
        {loading ? <div style={{ color: C.dim }}>Loading…</div> : active.map(card)}
        {cancelled.length > 0 && (
          <>
            <div style={{ color: C.dim, fontSize: 11, letterSpacing: '0.15em', margin: '24px 0 10px' }}>ON CANCELLED BOOKINGS</div>
            {cancelled.map(card)}
          </>
        )}
      </div>
    </main>
  )
}

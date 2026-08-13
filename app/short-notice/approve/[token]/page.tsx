'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

function fmt12(h: number) {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  const ampm = hr >= 12 ? 'PM' : 'AM', h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}:${mn} ${ampm}`
}
function fmtDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function plusDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }

interface Req {
  customer_name: string; customer_email: string
  desired_set_name: string | null; desired_date: string | null; desired_start: number | null
  desired_hours: number | null; quoted_cents: number | null; card_label: string | null
  note: string | null; status: string
  granted_until: string | null; granted_expires_at: string | null
}

// What the POST came back with, so the page can say what actually happened
// rather than a generic "approved" — charged, held pending payment, or unlocked
// are three different outcomes and only one of them took money.
interface Outcome {
  outcome: 'charged' | 'held' | 'unlocked' | 'denied'
  amount?: string
  minsHeld?: number
  declineReason?: string
  channel?: string
  doorCode?: string | null
}

export default function ApprovePage() {
  const params = useParams()
  const token = String(params.token)
  const [req, setReq]       = useState<Req | null>(null)
  const [chargeable, setChargeable] = useState(false)
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState<string | null>(null)
  const [done, setDone]     = useState<Outcome | null>(null)
  const [until, setUntil]   = useState('')
  const [grantMins, setGrantMins] = useState(60)
  const [err, setErr]       = useState('')
  // Declining sends the customer a note. One tap picks a reason; the box is
  // optional. They were getting silence before this.
  const [denying, setDenying] = useState(false)
  const [denyNote, setDenyNote] = useState('')

  useEffect(() => {
    fetch(`/api/short-notice/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.request) {
          setReq(d.request)
          setChargeable(!!d.chargeable)
          if (typeof d.grantMinutes === 'number') setGrantMins(d.grantMinutes)
          if (d.request.status !== 'pending') {
            // ⚠️ Derive what actually happened — never assume "unlocked". A
            // resolved request that produced a CONFIRMED booking was charged,
            // one still pending_payment is on the link/hold path, and only one
            // with no booking at all took no money.
            const r = d.request
            const held = r.booking_id && d.bookingStatus === 'pending_payment'
            setDone({
              outcome: r.status === 'denied' ? 'denied'
                : !r.booking_id ? 'unlocked'
                : held ? 'held' : 'charged',
              amount: r.quoted_cents != null ? (r.quoted_cents / 100).toFixed(2) : undefined,
              minsHeld: held && r.hold_expires_at
                ? Math.max(0, Math.round((Date.parse(r.hold_expires_at) - Date.now()) / 60000))
                : undefined,
            })
          }
        } else setErr(d.error || 'Not found')
      })
      .catch(() => setErr('Could not load the request.'))
      .finally(() => setLoad(false))
  }, [token])

  const resolve = async (action: string, untilDate?: string, reason?: string) => {
    setBusy(action); setErr('')
    try {
      const res = await fetch(`/api/short-notice/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, until: untilDate, reason, note: denyNote || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      // A refusal (slot taken, price moved, session already started) leaves the
      // request PENDING on purpose — the error shows and every button is still
      // live, so it can be retried or sent down the unlock path instead.
      if (res.ok) setDone({ outcome: d.outcome ?? (action === 'deny' ? 'denied' : 'unlocked'), amount: d.amount, minsHeld: d.minsHeld, declineReason: d.declineReason, channel: d.channel, doorCode: d.doorCode })
      else setErr(d.error || 'Something went wrong.')
    } catch { setErr('Something went wrong.') }
    finally { setBusy(null) }
  }

  const wrap: React.CSSProperties = { background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }
  const box: React.CSSProperties = { maxWidth: 460, width: '100%', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 28 }
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: 8 }
  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.4)' }

  if (loading) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div></div>

  if (err && !req) return <div style={wrap}><div style={box}><div style={{ color: '#ff6b6b' }}>{err}</div></div></div>

  const price = req?.quoted_cents != null ? (req.quoted_cents / 100).toFixed(2) : null
  const endHour = req?.desired_start != null && req?.desired_hours != null
    ? req.desired_start + req.desired_hours : null

  if (done) {
    const title =
      done.outcome === 'denied'  ? 'DENIED' :
      done.outcome === 'charged' ? 'BOOKED & PAID ✓' :
      done.outcome === 'held'    ? 'APPROVED — AWAITING PAYMENT' : 'APPROVED ✓'
    return (
      <div style={wrap}><div style={box}>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, letterSpacing: '0.02em', marginBottom: 8 }}>{title}</div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
          {done.outcome === 'denied' && `${req?.customer_name}'s request was denied.`}
          {done.outcome === 'charged' && `${req?.customer_name} was charged $${done.amount} and is confirmed for ${req?.desired_set_name} on ${req?.desired_date ? fmtDate(req.desired_date) : ''}${req?.desired_start != null ? ` at ${fmt12(req.desired_start)}` : ''}. Their confirmation and door code have been sent.`}
          {done.outcome === 'held' && `Their card didn't go through, so the slot is held${done.minsHeld != null ? ` for ${done.minsHeld} more minute${done.minsHeld === 1 ? '' : 's'}` : ''} and a payment link was sent${done.channel ? (done.channel === 'sms' ? ' by text' : ' by email') : ''}. No door code is issued until they pay. If they don't, the slot reopens on its own.`}
          {done.outcome === 'unlocked' && `${req?.customer_name} can now book short-notice${req?.granted_expires_at ? ' for a limited window' : req?.granted_until ? ` through ${fmtDate(req.granted_until)}` : ''}. They've been notified. Nothing was charged.`}
        </p>
        {done.outcome === 'held' && done.declineReason && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 12, lineHeight: 1.5 }}>
            Reason: {done.declineReason}
          </p>
        )}
      </div></div>
    )
  }

  return (
    <div style={wrap}><div style={box}>
      <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>SHORT-NOTICE REQUEST</div>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28, letterSpacing: '0.02em', marginBottom: 4 }}>{req?.customer_name}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>{req?.customer_email}</div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 0', marginBottom: 22, fontSize: 14 }}>
        {req?.desired_set_name && (
          <div style={rowStyle}><span style={labelStyle}>Set</span><span>{req.desired_set_name}</span></div>
        )}
        <div style={rowStyle}>
          <span style={labelStyle}>When</span>
          <span>{req?.desired_date ? `${fmtDate(req.desired_date)}${req.desired_start != null ? ' · ' + fmt12(req.desired_start) : ''}` : 'Any near-term slot'}</span>
        </div>
        {req?.desired_hours != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>Length</span>
            <span>{req.desired_hours} hr{endHour != null && req.desired_start != null ? ` · ${fmt12(req.desired_start)}–${fmt12(endHour)}` : ''}</span>
          </div>
        )}
        {price && (
          <div style={rowStyle}>
            <span style={labelStyle}>Price</span>
            <span style={{ color: '#d4a843', fontWeight: 600 }}>${price}</span>
          </div>
        )}
        {chargeable && (
          <div style={{ ...rowStyle, marginBottom: req?.note ? 8 : 0 }}>
            <span style={labelStyle}>Card</span>
            <span>{req?.card_label || 'None on file — link'}</span>
          </div>
        )}
        {req?.note && <div style={{ color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>“{req.note}”</div>}
      </div>

      {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>{err}</div>}

      {chargeable ? (
        <>
          <button onClick={() => resolve('approve_charge')} disabled={!!busy}
            style={{ width: '100%', background: '#d4a843', color: '#080808', border: 'none', padding: '16px', cursor: busy ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 6, opacity: busy ? 0.6 : 1 }}>
            {busy === 'approve_charge'
              ? (req?.card_label ? 'CHARGING…' : 'APPROVING…')
              : req?.card_label ? `APPROVE & CHARGE $${price}` : `APPROVE — SEND $${price} PAYMENT LINK`}
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: 18, lineHeight: 1.5 }}>
            {req?.card_label
              ? `Charges ${req.card_label} now, books the session and sends their door code. If the card fails, the slot is held and they get a payment link instead.`
              : 'No card on file, so this holds the slot and sends them a payment link. The door code is only issued once they pay.'}
          </div>

          <button onClick={() => resolve('approve_1h')} disabled={!!busy}
            style={{ width: '100%', background: 'transparent', border: '1px solid rgba(212,168,67,0.5)', color: '#d4a843', padding: '13px', cursor: busy ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', marginBottom: 6 }}>
            {busy === 'approve_1h' ? 'APPROVING…' : 'APPROVE WITHOUT CHARGING'}
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: 18, lineHeight: 1.5 }}>
            Takes no money. Opens booking for {grantMins === 60 ? 'one hour' : `${grantMins} minutes`} so they can book it themselves — for a comp, a different price, or a second look.
          </div>
        </>
      ) : (
        <>
          <button onClick={() => resolve('approve_1h')} disabled={!!busy}
            style={{ width: '100%', background: '#d4a843', color: '#080808', border: 'none', padding: '14px', cursor: busy ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', marginBottom: 6, opacity: busy ? 0.6 : 1 }}>
            ALLOW · {grantMins === 60 ? '1 HOUR' : `${grantMins} MIN`} TO BOOK
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: 14, lineHeight: 1.5 }}>
            Opens short-notice booking for {grantMins === 60 ? 'one hour' : `${grantMins} minutes`}. If they don&apos;t book in time, it closes and they&apos;ll have to request again.
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="date" value={until} min={plusDays(0)} onChange={e => setUntil(e.target.value)}
          style={{ flex: 1, background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', colorScheme: 'dark', padding: '12px', fontFamily: 'Inter', fontSize: 14, boxSizing: 'border-box' }} />
        <button onClick={() => until ? resolve('approve_until', until) : setErr('Pick a date first.')} disabled={!!busy}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', padding: '12px 16px', cursor: busy ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          ALLOW UNTIL
        </button>
      </div>

      {!denying ? (
        <button onClick={() => setDenying(true)} disabled={!!busy}
          style={{ width: '100%', background: 'transparent', color: 'rgba(255,120,120,0.8)', border: '1px solid rgba(255,100,100,0.3)', padding: '11px', cursor: busy ? 'default' : 'pointer', fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.12em' }}>
          Deny request
        </button>
      ) : (
        <div style={{ border: '1px solid rgba(255,100,100,0.3)', padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 10, lineHeight: 1.5 }}>
            Why? They get a text either way — a reason just saves them guessing.
          </div>
          {[
            { key: 'booked', label: 'Already booked then' },
            { key: 'closed', label: 'We’re not open then' },
            { key: 'notice', label: 'Too short notice' },
          ].map(r => (
            <button key={r.key} onClick={() => resolve('deny', undefined, r.key)} disabled={!!busy}
              style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '10px', marginBottom: 6, cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, textAlign: 'left' }}>
              {r.label}
            </button>
          ))}
          <textarea value={denyNote} onChange={e => setDenyNote(e.target.value)} rows={2}
            placeholder="Or say it in your own words (optional)"
            style={{ width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px', fontFamily: 'Inter', fontSize: 13, boxSizing: 'border-box', marginTop: 4, marginBottom: 8, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => resolve('deny', undefined, 'other')} disabled={!!busy}
              style={{ flex: 1, background: 'rgba(255,100,100,0.15)', border: '1px solid rgba(255,100,100,0.4)', color: '#ff8080', padding: '10px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em' }}>
              {busy === 'deny' ? 'SENDING…' : 'SEND DECLINE'}
            </button>
            <button onClick={() => { setDenying(false); setDenyNote('') }} disabled={!!busy}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', padding: '10px 16px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em' }}>
              BACK
            </button>
          </div>
        </div>
      )}
    </div></div>
  )
}

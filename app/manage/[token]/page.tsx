'use client'

// Customer-facing "your booking" page, opened from the link in the confirmation
// email. Matches the kiosk / extend pages' luxury-dark language.
//
// ⚠️ This is the page a GUEST uses. Booking without an account was a one-way
// door — /account/... needs a Supabase session, so a guest could see nothing and
// change nothing, and every reschedule went through Teddy by text.
//
// The picker itself is components/RescheduleModal, the same one signed-in
// customers get; only the endpoint differs (submitUrl), and both endpoints call
// the same lib/reschedule.ts. Nothing about the rules lives in this file.

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import RescheduleModal from '@/components/RescheduleModal'

const CHAMP = '#c9b27e'
const INK = '#0b0b0d'

function fmt12(h: number): string {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  return `${hr % 12 === 0 ? 12 : hr % 12}:${mn} ${hr >= 12 ? 'PM' : 'AM'}`
}

function dateLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

export default function ManageBookingPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData]   = useState<any>(null)
  const [error, setError] = useState('')
  const [open, setOpen]   = useState(false)
  const [done, setDone]   = useState<string | null>(null)

  const load = useCallback(() => {
    fetch(`/api/manage/${token}`, { cache: 'no-store' })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || !d.booking) { setError(d.error || 'That link is not valid.'); return }
        setData(d)
      })
      .catch(() => setError('Something went wrong loading your booking.'))
  }, [token])

  useEffect(() => { load() }, [load])

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: INK, color: '#fff', padding: '48px 20px',
    fontFamily: 'system-ui, sans-serif', display: 'flex', justifyContent: 'center',
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 520, background: '#121214',
    border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 28,
  }
  const label: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)', marginBottom: 4,
  }
  const value: React.CSSProperties = { fontSize: 17, marginBottom: 20 }

  if (error) {
    return (
      <div style={wrap}><div style={card}>
        <div style={{ fontSize: 22, marginBottom: 12, color: CHAMP }}>Made Kulture</div>
        <p style={{ lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>{error}</p>
      </div></div>
    )
  }
  if (!data) {
    return <div style={wrap}><div style={{ ...card, color: 'rgba(255,255,255,0.5)' }}>Loading your booking…</div></div>
  }

  const b = data.booking

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: CHAMP, marginBottom: 24 }}>
          Made Kulture
        </div>

        {done && (
          <div style={{
            background: 'rgba(201,178,126,0.10)', border: `1px solid ${CHAMP}55`,
            padding: '14px 16px', borderRadius: 8, marginBottom: 24, lineHeight: 1.6,
          }}>
            {done}
          </div>
        )}

        <div style={label}>Your session</div>
        <div style={{ ...value, fontSize: 24, color: CHAMP }}>{b.setName}</div>

        <div style={label}>When</div>
        <div style={value}>
          {dateLabel(b.date)}<br />
          {fmt12(b.startHour)} – {fmt12(b.endHour)}
        </div>

        {(b.doorCode || b.doorCodeBack) && (
          <>
            <div style={label}>Door code</div>
            <div style={value}>
              {b.doorCode && <>Front: <strong style={{ color: CHAMP }}>{b.doorCode}</strong><br /></>}
              {b.doorCodeBack && <>Back: <strong style={{ color: CHAMP }}>{b.doorCodeBack}</strong><br /></>}
              {/* ⚠️ A PIN alone does NOT open an igloohome lock — the guest has to
                  press unlock. This sentence is the single most common support
                  question; it is repeated on every surface that shows a code. */}
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                Enter the code, then press the unlock button to open.
              </span>
            </div>
          </>
        )}

        {data.canReschedule ? (
          <button
            onClick={() => setOpen(true)}
            style={{
              width: '100%', padding: '14px 0', marginTop: 8, background: CHAMP, color: INK,
              border: 'none', borderRadius: 8, fontSize: 14, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
            }}>
            Change my time
          </button>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.04)', padding: '14px 16px', borderRadius: 8,
            fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.7)',
          }}>
            {data.lockedReason}
          </div>
        )}

        {data.canSaveWithPlus && (() => {
          // ⚠️ Plus lives on an ACCOUNT, so a guest can't buy it on this page.
          // Signup/login carry ?save=<id> through to /account/bookings, which
          // finds the booking by the account's email and opens the offer there.
          // The account MUST use the email the booking was made with — hence the
          // masked hint. Encoded because it rides inside another query string.
          const next = encodeURIComponent(`/account/bookings?save=${b.id}`)
          const price = data.plusPriceCents ? `$${(data.plusPriceCents / 100).toFixed(0)}/year` : ''
          return (
            <div style={{
              marginTop: 16, padding: '18px 18px 16px', borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(201,178,126,0.14), rgba(201,178,126,0.03))',
              border: `1px solid ${CHAMP}55`,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: CHAMP, marginBottom: 6 }}>Plans changed? Save this booking with Plus.</div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(255,255,255,0.72)', marginBottom: 14 }}>
                Plus members can move a booking or cancel it for full studio credit, right up until it starts.
                Create a free account{data.bookingEmailHint ? <> with <strong style={{ color: '#fff' }}>{data.bookingEmailHint}</strong> (the email you booked with)</> : ''},
                then join Plus{price ? ` for ${price}` : ''} — this booking will be waiting in your account.
              </div>
              <a href={`/signup?next=${next}`} style={{
                display: 'block', textAlign: 'center', padding: '13px 0', background: CHAMP, color: INK,
                borderRadius: 8, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
                fontWeight: 600, textDecoration: 'none',
              }}>
                Create account &amp; save it
              </a>
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Already have an account? <a href={`/login?next=${next}`} style={{ color: CHAMP }}>Sign in</a>
              </div>
            </div>
          )
        })()}

        <div style={{ marginTop: 28, fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.45)' }}>
          Need anything else — a different set, more time, or to cancel? Text us at{' '}
          <a href="sms:+18324081631" style={{ color: CHAMP }}>(832) 408-1631</a>.
        </div>
      </div>

      {open && (
        <RescheduleModal
          booking={{
            id: b.id,
            start_time: b.start_time,
            end_time: b.end_time,
            setName: b.setName,
            setSlug: b.setSlug,
          }}
          // ⚠️ Deliberately FALSE, not data.isPlus. The Plus branch of the picker
          // calls /api/plus/open-blocks, which identifies the member from their
          // session — there is none here, so it would return no open blocks and
          // grey out every slot with no reason given. Anything inside 48 hours
          // is refused up front by lockedReason instead, which tells a Plus
          // member to sign in. See the matching note in the API route.
          isPlus={false}
          submitUrl={`/api/manage/${token}`}
          onClose={() => setOpen(false)}
          onDone={(msg) => { setOpen(false); setDone(msg); load() }}
        />
      )}
    </div>
  )
}

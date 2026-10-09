'use client'
// /minis/[token] — a photographer's public Mini Sessions sign-up page. No
// account: clients pick a time, say who's coming, and get an email.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CHAMP, wrap, card, kicker, h1, label, input, option, primary, body, fine, Cover, PayButton, MkFooter, column } from '../minis-ui'

export default function MiniSignupPage() {
  const { token } = useParams<{ token: string }>()
  const [d, setD] = useState<any>(null)
  const [error, setError] = useState('')
  const [slot, setSlot] = useState<number | null>(null)
  const [f, setF] = useState({ name: '', email: '', phone: '', party: 1, smsOk: false })
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState<{ when: string; token: string } | null>(null)

  const load = useCallback(() => {
    fetch(`/api/minis/${token}`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => ok ? setD(j) : setError(j.error || 'This link isn’t valid.'))
      .catch(() => setError('Something went wrong loading this page.'))
  }, [token])
  useEffect(() => { load() }, [load])

  async function submit() {
    if (slot == null) { setFormError('Pick a time first.'); return }
    setBusy(true); setFormError('')
    const r = await fetch(`/api/minis/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, slot }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setFormError(j.error || 'That didn’t go through.'); if (r.status === 409) { setSlot(null); load() } return }
    setDone({ when: j.when, token: j.token })
  }

  if (error) return <div style={wrap}><div style={card}><div style={kicker}>Made Kulture</div><p style={body}>{error}</p></div></div>
  if (!d) return <div style={wrap}><div style={{ ...card, color: 'rgba(255,255,255,0.5)' }}>Loading…</div></div>

  const title = d.title || `Mini sessions with ${d.photographer}`
  const header = (
    <>
      <Cover url={d.coverUrl} alt={title} />
      <div style={kicker}>Mini sessions · Made Kulture</div>
      <h1 style={h1}>{title}</h1>
      <p style={{ ...body, marginBottom: 6 }}>with <b style={{ color: '#fff' }}>{d.photographer}</b></p>
      <p style={{ ...body, color: CHAMP, marginBottom: d.priceText ? 6 : 16 }}>{d.day}</p>
      {d.priceText && <p style={{ ...body, marginBottom: 16 }}>{d.priceText}</p>}
      {d.note && <p style={{ ...body, whiteSpace: 'pre-wrap', borderLeft: `2px solid ${CHAMP}`, paddingLeft: 12 }}>{d.note}</p>}
      {d.pending && d.state === 'open' && (
        <p style={{ ...body, fontSize: 14, border: `1px solid ${CHAMP}`, borderRadius: 8, padding: '10px 12px', color: '#fff' }}>
          <b style={{ color: CHAMP }}>Pending date.</b> {d.photographer} is confirming this day with the studio. Request your spot now — you’ll get an email the moment it’s confirmed, or if it isn’t happening.
        </p>
      )}
    </>
  )

  if (done) return (
    <div style={wrap}><div style={column}><div style={card}>
      {header}
      <div style={{ ...label, color: CHAMP, marginTop: 8 }}>{d.pending ? 'Requested — pending' : 'You’re booked'}</div>
      <p style={{ ...body, fontSize: 18, color: '#fff' }}>{done.when}</p>
      <p style={body}>{d.pending
        ? `Your spot is held for you. ${d.photographer} is confirming the day with the studio — we’ll email you the moment it’s confirmed.`
        : 'A confirmation is on its way to your email. Arrive at your time and wait outside until your slot starts — the set has a strict headcount.'}</p>
      <p style={body}>{d.address}</p>
      <PayButton url={d.payUrl} host={d.payHost} photographer={d.photographer} />
      <a href={`/minis/c/${done.token}`} style={{ color: CHAMP, fontSize: 14, display: 'inline-block', marginTop: 10 }}>View or change my slot</a>
      <p style={{ ...fine, marginTop: 18 }}>Payment and your photos go through {d.photographer} directly.</p>
    </div><MkFooter /></div></div>
  )

  const openSlots = d.slots.filter((s: any) => s.open)
  return (
    <div style={wrap}><div style={column}><div style={card}>
      {header}

      {d.state !== 'open' ? (
        <p style={{ ...body, color: '#fff' }}>
          {d.state === 'cancelled' ? 'This mini session day was cancelled. Reach out to your photographer.'
            : d.state === 'over' ? 'This mini session day has passed.'
            : 'Sign-ups are closed. Reach out to your photographer directly.'}
        </p>
      ) : openSlots.length === 0 ? (
        <p style={{ ...body, color: '#fff' }}>Every time is taken. Reach out to {d.photographer} to get on a waitlist.</p>
      ) : (
        <>
          <span style={label}>Pick a time</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 22 }}>
            {d.slots.map((s: any) => (
              <button key={s.index} disabled={!s.open} onClick={() => setSlot(s.index)}
                style={{
                  padding: '12px 8px', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', cursor: s.open ? 'pointer' : 'default',
                  border: slot === s.index ? `1px solid ${CHAMP}` : '1px solid rgba(255,255,255,0.14)',
                  background: slot === s.index ? 'rgba(201,178,126,0.16)' : 'transparent',
                  color: s.open ? '#fff' : 'rgba(255,255,255,0.25)', textDecoration: s.open ? 'none' : 'line-through',
                }}>{s.label}</button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            <div><span style={label}>Your name</span><input style={input} autoComplete="name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
            <div><span style={label}>Email</span><input style={input} type="email" autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
            <div><span style={label}>Phone</span><input style={input} type="tel" autoComplete="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
            <div>
              <span style={label}>How many people are coming, including you?</span>
              <select style={input} value={f.party} onChange={e => setF({ ...f, party: Number(e.target.value) })}>
                {Array.from({ length: d.maxParty }, (_, i) => i + 1).map(n => <option key={n} value={n} style={option}>{n}</option>)}
              </select>
              <div style={{ ...fine, marginTop: 6 }}>
                {d.maxParty > d.includedParty
                  ? `Up to ${d.maxParty} per slot. Bigger groups are covered by ${d.photographer} — just pick your real number so the studio knows who’s coming.`
                  : `Up to ${d.maxParty} per slot — the studio has a strict headcount, so please don’t bring extra people.`}
              </div>
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              <input type="checkbox" checked={f.smsOk} onChange={e => setF({ ...f, smsOk: e.target.checked })} style={{ marginTop: 3 }} />
              <span>Text me a reminder the morning of my session. Msg &amp; data rates may apply. Reply STOP to opt out.</span>
            </label>
          </div>

          {formError && <p style={{ color: '#ff8a8a', fontSize: 14, margin: '16px 0 0' }}>{formError}</p>}
          <button style={{ ...primary, marginTop: 20, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>{busy ? 'Sending…' : d.pending ? 'Request my spot' : 'Book my slot'}</button>
          <p style={{ ...fine, marginTop: 16 }}>
            Made Kulture, {d.address}. Arrive at your time and wait outside until your slot starts. Payment goes through {d.photographer} directly{d.payUrl ? ' — you’ll get their pay link once you book.' : '.'}
          </p>
        </>
      )}
    </div><MkFooter /></div></div>
  )
}

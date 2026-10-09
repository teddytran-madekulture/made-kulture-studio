'use client'
// /minis/c/[token] — a client's own Mini Sessions slot: see it, switch it, or
// cancel it (until the photographer's cutoff). Linked from their emails.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CHAMP, wrap, card, kicker, h1, label, input, option, primary, ghost, body, fine } from '../../minis-ui'

export default function MiniClientPage() {
  const { token } = useParams<{ token: string }>()
  const [d, setD] = useState<any>(null)
  const [error, setError] = useState('')
  const [to, setTo] = useState<number | ''>('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    fetch(`/api/minis/client/${token}`, { cache: 'no-store' })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => ok ? setD(j) : setError(j.error || 'This link isn’t valid.'))
      .catch(() => setError('Something went wrong loading your slot.'))
  }, [token])
  useEffect(() => { load() }, [load])

  async function post(payload: any, ok: string) {
    setBusy(true); setMsg('')
    const r = await fetch(`/api/minis/client/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error || 'That didn’t work.'); load(); return }
    setMsg(ok); setTo(''); setConfirmCancel(false); load()
  }

  if (error) return <div style={wrap}><div style={card}><div style={kicker}>Made Kulture</div><p style={body}>{error}</p></div></div>
  if (!d) return <div style={wrap}><div style={{ ...card, color: 'rgba(255,255,255,0.5)' }}>Loading…</div></div>

  const gone = d.status !== 'booked'
  return (
    <div style={wrap}><div style={card}>
      <div style={kicker}>Your mini session · Made Kulture</div>
      <h1 style={h1}>{d.title || `Mini sessions with ${d.photographer}`}</h1>
      <p style={{ ...body, marginBottom: 18 }}>with <b style={{ color: '#fff' }}>{d.photographer}</b></p>

      {gone ? (
        <p style={{ ...body, color: '#fff' }}>
          {d.status === 'cancelled' ? 'This slot is cancelled.' : d.status === 'bumped' ? `Your slot needs a new time — ${d.photographer} will be in touch.` : 'This slot was released.'}
          {' '}Reach out to {d.photographer} for anything else.
        </p>
      ) : (
        <>
          <span style={label}>Your slot</span>
          <p style={{ ...body, fontSize: 20, color: '#fff', marginBottom: 4 }}>{d.day}</p>
          <p style={{ ...body, fontSize: 20, color: CHAMP }}>{d.slot}</p>
          <p style={body}>Party of {d.party} · {d.address}</p>
          <p style={body}>Arrive at your time and <b style={{ color: '#fff' }}>wait outside until your slot starts</b> — everyone inside counts toward the set’s headcount. Limited parking out front, street parking in the rear.</p>
          {d.note && <p style={{ ...body, whiteSpace: 'pre-wrap', borderLeft: `2px solid ${CHAMP}`, paddingLeft: 12 }}>{d.note}</p>}

          {d.canChange ? (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 18, marginTop: 8 }}>
              {d.openSlots.length > 0 && (
                <>
                  <span style={label}>Switch to another time</span>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <select style={{ ...input, flex: 1 }} value={to} onChange={e => setTo(e.target.value === '' ? '' : Number(e.target.value))}>
                      <option value="" style={option}>Pick a time…</option>
                      {d.openSlots.map((s: any) => <option key={s.index} value={s.index} style={option}>{s.label}</option>)}
                    </select>
                    <button style={{ ...primary, width: 'auto' }} disabled={busy || to === ''} onClick={() => post({ action: 'switch', slot: to }, 'Switched — a new confirmation is on its way.')}>Switch</button>
                  </div>
                </>
              )}
              {!confirmCancel
                ? <button style={ghost} onClick={() => setConfirmCancel(true)}>Cancel my slot</button>
                : <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14 }}>Cancel and free up this time?</span>
                    <button style={{ ...ghost, borderColor: '#ff8a8a', color: '#ff8a8a' }} disabled={busy} onClick={() => post({ action: 'cancel' }, 'Your slot is cancelled.')}>Yes, cancel</button>
                    <button style={ghost} onClick={() => setConfirmCancel(false)}>Keep it</button>
                  </div>}
              <p style={{ ...fine, marginTop: 12 }}>Refunds or payment questions go to {d.photographer} directly.</p>
            </div>
          ) : (
            <p style={fine}>Changes are closed for this day. Reach out to {d.photographer} directly.</p>
          )}
        </>
      )}
      {msg && <p style={{ fontSize: 14, color: CHAMP, marginTop: 16 }}>{msg}</p>}
    </div></div>
  )
}

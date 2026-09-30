'use client'
// The owner's approve/decline page for a Plus member's reschedule request.
// Reached from the text + push. The dashboard banner is the other surface; both
// POST /api/reschedule-request/[token].
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Req {
  customer_name: string | null; customer_email: string | null; set_name: string | null
  when_old: string | null; when_new: string | null; status: string; decision_note: string | null
}

const btn: React.CSSProperties = { border: 'none', padding: '14px 20px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em' }

export default function ApproveReschedulePage() {
  const { token } = useParams() as { token: string }
  const [r, setR] = useState<Req | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [reason, setReason] = useState('unavailable')

  useEffect(() => {
    fetch(`/api/reschedule-request/${token}`, { cache: 'no-store' })
      .then(async res => { const d = await res.json().catch(() => ({})); if (!res.ok) setErr(d.error || 'Request not found.'); else setR(d.request) })
      .catch(() => setErr('Could not load the request.'))
  }, [token])

  const act = async (action: 'approve' | 'decline') => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/reschedule-request/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Something went wrong — nothing was moved.'); setBusy(false); return }
      setDone(action === 'approve'
        ? `Approved. The booking now runs ${d.when}, and the member was texted their new door code.`
        : 'Declined. The member was texted and emailed, and keeps their original time.')
    } catch {
      setErr('Something went wrong — check the booking before retrying.')
    }
    setBusy(false)
  }

  const pending = r?.status === 'pending'
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#f4f4f5', fontFamily: 'Inter, sans-serif', padding: '48px 20px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>MADE KULTURE · RESCHEDULE REQUEST</div>
        {!r && !err && <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}
        {r && (
          <>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, marginBottom: 6 }}>
              {r.customer_name || r.customer_email}
              <span style={{ marginLeft: 10, fontFamily: 'Inter', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: '#080808', background: '#d4a843', padding: '2px 6px', verticalAlign: 'middle' }}>PLUS</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 22 }}>{r.set_name}</div>
            <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: 16, marginBottom: 20, lineHeight: 1.8, fontSize: 14 }}>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Booked now:</span> {r.when_old}</div>
              <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Wants:</span> <strong style={{ color: '#e6c07a' }}>{r.when_new}</strong></div>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 22 }}>
              Nobody else has the studio open at the new time. Approve only if you can be there. Approving moves the booking, makes new door codes and texts them to the member.
            </p>
          </>
        )}
        {done && <div style={{ border: '1px solid rgba(143,224,174,0.4)', color: '#8fe0ae', padding: 14, fontSize: 14, lineHeight: 1.5 }}>{done}</div>}
        {err && <div style={{ color: '#ff8080', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{err}</div>}
        {r && !pending && !done && (
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>This request is already <strong>{r.status}</strong>{r.decision_note && r.status === 'failed' ? ` — ${r.decision_note}` : ''}.</div>
        )}
        {r && pending && !done && (
          <div style={{ display: 'grid', gap: 12 }}>
            <button disabled={busy} onClick={() => act('approve')} style={{ ...btn, background: '#d4a843', color: '#080808' }}>
              {busy ? 'WORKING…' : 'APPROVE MOVE'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={reason} onChange={e => setReason(e.target.value)}
                style={{ flex: 1, background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', colorScheme: 'dark', padding: '12px 10px', fontSize: 13 }}>
                <option value="unavailable" style={{ background: '#0d0d0d', color: '#fff' }}>Can’t be there then</option>
                <option value="booked" style={{ background: '#0d0d0d', color: '#fff' }}>Already committed then</option>
                <option value="other" style={{ background: '#0d0d0d', color: '#fff' }}>No reason given</option>
              </select>
              <button disabled={busy} onClick={() => act('decline')} style={{ ...btn, background: 'transparent', border: '1px solid rgba(255,100,100,0.4)', color: '#ff6b6b' }}>DECLINE</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

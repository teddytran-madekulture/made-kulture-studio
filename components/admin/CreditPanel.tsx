'use client'
// One customer's studio credit, in the dashboard's customer detail panel.
// History is the ledger itself (never edited). Add / Remove write a correcting
// `adjustment` row with a required reason — see /api/admin/credit/account.
import { useEffect, useState } from 'react'

const lbl: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }
const inp: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark', boxSizing: 'border-box' }
const btn = (c: string): React.CSSProperties => ({ background: 'transparent', border: `1px solid ${c}`, color: c, padding: '8px 10px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em' })
const money = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`
const when = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))

export default function CreditPanel({ customerId }: { customerId: string }) {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<'add' | 'remove' | null>(null)
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = async () => {
    setErr(null)
    try {
      const r = await fetch(`/api/admin/credit/account?customerId=${customerId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) { setErr(j.error || 'Could not load credit.'); return }
      setD(j)
    } catch { setErr('Could not load credit.') }
  }
  useEffect(() => { setD(null); setMode(null); setMsg(null); load() }, [customerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const cents = Math.round(Number(amt) * 100)
    if (!(cents > 0)) { setMsg('⚠️ Enter an amount.'); return }
    if (!reason.trim()) { setMsg('⚠️ Add a reason — it goes in the history.'); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/credit/account', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, direction: mode, amountCents: cents, reason, notify: mode === 'add' && notify }),
      })
      const j = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${j.error || 'Not saved.'}`); return }
      setD(j); setMode(null); setAmt(''); setReason('')
      setMsg(`${j.appliedCents > 0 ? 'Added' : 'Removed'} ${money(Math.abs(j.appliedCents))}${j.capped ? ' (capped at their balance)' : ''}.${j.notified === 'text' ? ' Text sent to Twilio (delivery not confirmed).' : j.notified === 'email' ? ' Emailed them.' : j.notified === 'email_after_text_failed' ? ' ⚠️ Text failed, emailed them instead.' : j.notified === 'failed' ? ' ⚠️ Could not notify them.' : ''}`)
    } catch { setMsg('⚠️ Not saved — check your connection.') }
    finally { setBusy(false) }
  }

  if (err) return <div style={{ ...lbl, marginBottom: 16 }}>STUDIO CREDIT · {err}</div>
  if (!d) return <div style={{ ...lbl, marginBottom: 16 }}>STUDIO CREDIT · …</div>

  const hist: any[] = d.history ?? []
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={lbl}>STUDIO CREDIT</span>
        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, color: d.balanceCents > 0 ? '#d4a843' : '#fff' }}>{money(d.balanceCents)}</span>
      </div>
      {!d.hasAccount ? (
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          No account with this email, so no credit can be held. They need to sign up with {d.email || 'their email'} first.
        </div>
      ) : (<>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 10 }}>
          Rewards {money(d.rewardCents)}{d.rewardExpiresAt ? ` · expire ${when(d.rewardExpiresAt)} if they don't book` : ''}
          <br />Cancellation / other credit {money(d.otherCents)} · never expires
        </div>

        {hist.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            {(showAll ? hist : hist.slice(0, 8)).map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 8, fontFamily: 'Inter, sans-serif', fontSize: 12, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', width: 78, flexShrink: 0 }}>{when(h.created_at)}</span>
                <span style={{ flex: 1, color: 'rgba(255,255,255,0.75)', minWidth: 0 }}>
                  {h.label}{h.reason ? <span style={{ color: 'rgba(255,255,255,0.45)' }}> · {h.reason}</span> : null}
                  {h.created_by === 'admin' && <span style={{ color: '#9cc0ff', fontSize: 10, marginLeft: 6 }}>ADMIN</span>}
                </span>
                <span style={{ color: h.amount_cents >= 0 ? '#4ade80' : '#ff8a8a', whiteSpace: 'nowrap' }}>{h.amount_cents >= 0 ? '+' : ''}{money(h.amount_cents)}</span>
              </div>
            ))}
            {hist.length > 8 && (
              <button onClick={() => setShowAll(s => !s)} style={{ background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>
                {showAll ? 'Show less' : `Show all ${hist.length}`}
              </button>
            )}
          </div>
        )}

        {!mode ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setMode('add'); setMsg(null) }} style={{ ...btn('rgba(74,222,128,0.7)'), flex: 1 }}>+ ADD CREDIT</button>
            <button onClick={() => { setMode('remove'); setMsg(null) }} disabled={d.balanceCents <= 0} style={{ ...btn('rgba(255,107,107,0.6)'), flex: 1, opacity: d.balanceCents <= 0 ? 0.4 : 1 }}>− REMOVE CREDIT</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', padding: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: mode === 'add' ? '#4ade80' : '#ff8a8a', width: 70 }}>{mode === 'add' ? 'ADD $' : 'REMOVE $'}</span>
              <input value={amt} onChange={e => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0.00" style={{ ...inp, flex: 1 }} />
            </div>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (goes in the history)" style={inp} />
            {mode === 'add' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Let them know (text, or email if no phone)
              </label>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={busy} style={{ ...btn(mode === 'add' ? '#4ade80' : '#ff6b6b'), flex: 1 }}>{busy ? 'SAVING…' : 'SAVE'}</button>
              <button onClick={() => setMode(null)} disabled={busy} style={btn('rgba(255,255,255,0.3)')}>CANCEL</button>
            </div>
          </div>
        )}
      </>)}
      {msg && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: msg.startsWith('⚠️') ? '#fbbf24' : '#4ade80', marginTop: 8 }}>{msg}</div>}
    </div>
  )
}

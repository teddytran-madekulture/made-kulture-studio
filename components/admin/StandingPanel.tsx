'use client'
// Account standing meter + incident log for ONE customer (migration 109).
// Dropped into the booking detail panel and the customer detail panel on the
// admin dashboard. Self-contained on purpose: the dashboard is 5,000 lines, and
// everything this needs comes from /api/admin/incidents.
import { useEffect, useState } from 'react'
import { LEVEL_COLOR, LEVEL_LABEL, SEVERITIES, severityAtLeast, type Severity, type StandingConfig, type Standing } from '@/lib/standing'

interface Incident {
  id: string; occurred_on: string; category: string; severity: Severity; points: number
  details: string; fee_cents: number | null; customer_notified_at: string | null
  voided_at: string | null; void_reason: string | null
}
interface Meter {
  customer: { id: string; name: string | null; email: string | null; banned: boolean | null; suspended_until: string | null }
  standing: Standing; incidents: Incident[]; config: StandingConfig
}

const lbl: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }
const inp: React.CSSProperties = {
  width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
  padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark', boxSizing: 'border-box',
}
const optStyle: React.CSSProperties = { background: '#141414', color: '#fff' }
const btn = (c: string): React.CSSProperties => ({
  background: 'transparent', border: `1px solid ${c}`, color: c, padding: '10px', cursor: 'pointer',
  fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.15em',
})

const todayCentral = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())

export function StandingChip({ level, points, size = 9 }: { level: string; points?: number; size?: number }) {
  if (!level || level === 'good') return null
  const color = (LEVEL_COLOR as any)[level] ?? '#fbbf24'
  return (
    <span title={`${(LEVEL_LABEL as any)[level] ?? level}${points != null ? ` · ${points} pts` : ''}`} style={{
      fontFamily: 'Inter, sans-serif', fontSize: size, letterSpacing: '0.1em', fontWeight: 700, color,
      border: `1px solid ${color}`, padding: '1px 5px', borderRadius: 3, lineHeight: 1.4, whiteSpace: 'nowrap',
    }}>{String((LEVEL_LABEL as any)[level] ?? level).toUpperCase()}</span>
  )
}

export default function StandingPanel({ customerId, bookingId }: { customerId?: string | null; bookingId?: string | null }) {
  const [m, setM] = useState<Meter | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [f, setF] = useState({ category: '', severity: 'minor' as Severity, occurredOn: todayCentral(), details: '', notify: false })
  const [notifyTouched, setNotifyTouched] = useState(false)

  const q = customerId ? `customerId=${customerId}` : bookingId ? `bookingId=${bookingId}` : ''
  const load = async () => {
    if (!q) return
    setErr(null)
    try {
      const r = await fetch(`/api/admin/incidents?${q}`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Could not load standing.'); setM(null); return }
      setM(d)
    } catch { setErr('Could not load standing.') }
  }
  useEffect(() => { setM(null); setOpen(false); setMsg(null); load() }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!q) return null
  if (err) return <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>STANDING · {err}</div>
  if (!m) return <div style={{ ...lbl }}>STANDING · …</div>

  const cfg = m.config
  const st = m.standing
  const color = LEVEL_COLOR[st.level]
  const pickCategory = (key: string) => {
    const c = cfg.categories.find(x => x.key === key)
    const sev = c?.severity ?? 'minor'
    setF(p => ({ ...p, category: key, severity: sev, notify: notifyTouched ? p.notify : severityAtLeast(sev, cfg.emailFrom) }))
  }
  const pickSeverity = (sev: Severity) =>
    setF(p => ({ ...p, severity: sev, notify: notifyTouched ? p.notify : severityAtLeast(sev, cfg.emailFrom) }))

  const save = async () => {
    if (!f.category) { setMsg('Pick a category.'); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: m.customer.id, bookingId: bookingId ?? null, ...f }),
      })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not saved.'}`); return }
      setM(d); setOpen(false); setNotifyTouched(false)
      setF({ category: '', severity: 'minor', occurredOn: todayCentral(), details: '', notify: false })
      setMsg(`Logged. ${d.emailed ? 'Customer emailed.' : d.emailError ? `⚠️ Email failed: ${d.emailError}` : 'No email sent.'} Now: ${LEVEL_LABEL[d.standing.level as keyof typeof LEVEL_LABEL]}.`)
    } catch { setMsg('⚠️ Not saved — check your connection.') }
    finally { setBusy(false) }
  }

  const voidIt = async (id: string) => {
    const reason = window.prompt('Why is this incident being voided? (kept on the record)')
    if (!reason?.trim()) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/incidents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ incidentId: id, voidReason: reason }) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not voided.'}`); return }
      setM(d); setMsg('Voided. Standing recalculated.')
    } finally { setBusy(false) }
  }

  const suspend = async (until: string | null) => {
    setBusy(true)
    try {
      const r = await fetch('/api/admin/incidents', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: m.customer.id, suspendedUntil: until }) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not saved.'}`); return }
      setM(d); setMsg(until ? `Suspended until ${until}.` : 'Dated suspension lifted.')
    } finally { setBusy(false) }
  }

  const catLabel = (k: string) => cfg.categories.find(c => c.key === k)?.label ?? k

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 18, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={lbl}>ACCOUNT STANDING</span>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color }}>{LEVEL_LABEL[st.level].toUpperCase()}</span>
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 10 }}>
        {st.points} point{st.points === 1 ? '' : 's'} · warning at {cfg.thresholds.warning}, probation {cfg.thresholds.probation}, suspended {cfg.thresholds.suspended}
        {st.nextDropOff && <><br />Next points drop off {st.nextDropOff}</>}
        {st.reason === 'banned' && <><br />Banned by hand (customer record switch).</>}
        {st.suspendedUntil && <><br />Suspended until {st.suspendedUntil.slice(0, 10)}</>}
      </div>

      {m.incidents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {m.incidents.map(i => (
            <div key={i.id} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px', opacity: i.voided_at ? 0.45 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#fff' }}>
                <span style={{ textDecoration: i.voided_at ? 'line-through' : 'none' }}>{catLabel(i.category)}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>{i.severity} · {i.points} pt</span>
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {i.occurred_on}{i.customer_notified_at ? ' · emailed' : ''}{i.fee_cents ? ` · $${(i.fee_cents / 100).toFixed(2)} fee` : ''}
                {i.voided_at ? ` · VOIDED: ${i.void_reason ?? ''}` : ''}
              </div>
              {i.details && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, lineHeight: 1.5 }}>{i.details}</div>}
              {!i.voided_at && (
                <button onClick={() => voidIt(i.id)} disabled={busy} style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>void</button>
              )}
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} style={{ ...btn('rgba(251,191,36,0.6)'), width: '100%' }}>LOG INCIDENT</button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)', padding: 12 }}>
          <select value={f.category} onChange={e => pickCategory(e.target.value)} style={inp}>
            <option value="" style={optStyle}>What happened…</option>
            {cfg.categories.map(c => <option key={c.key} value={c.key} style={optStyle}>{c.label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={f.severity} onChange={e => pickSeverity(e.target.value as Severity)} style={inp}>
              {SEVERITIES.map(s => <option key={s} value={s} style={optStyle}>{s} · {cfg.points[s]} pt</option>)}
            </select>
            <input type="date" value={f.occurredOn} onChange={e => setF(p => ({ ...p, occurredOn: e.target.value }))} style={inp} />
          </div>
          <textarea value={f.details} onChange={e => setF(p => ({ ...p, details: e.target.value }))} rows={3}
            placeholder="Details (the customer sees this if emailed)" style={{ ...inp, resize: 'vertical' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            <input type="checkbox" checked={f.notify} onChange={e => { setNotifyTouched(true); setF(p => ({ ...p, notify: e.target.checked })) }} />
            Email the customer
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={busy} style={{ ...btn('#fbbf24'), flex: 1 }}>{busy ? 'SAVING…' : 'SAVE INCIDENT'}</button>
            <button onClick={() => setOpen(false)} disabled={busy} style={{ ...btn('rgba(255,255,255,0.3)') }}>CANCEL</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {st.suspendedUntil ? (
          <button onClick={() => suspend(null)} disabled={busy} style={{ ...btn('rgba(74,222,128,0.6)'), padding: '6px 10px' }}>LIFT DATED SUSPENSION</button>
        ) : (
          <button onClick={() => {
            const d = window.prompt('Suspend booking until which date? (YYYY-MM-DD, lifts itself the day after)')
            if (d && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) suspend(`${d.trim()}T23:59:59-05:00`)
          }} disabled={busy} style={{ ...btn('rgba(239,68,68,0.5)'), padding: '6px 10px' }}>SUSPEND UNTIL…</button>
        )}
      </div>
      {msg && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: msg.startsWith('⚠️') ? '#fbbf24' : '#4ade80', marginTop: 8, lineHeight: 1.5 }}>{msg}</div>}
    </div>
  )
}

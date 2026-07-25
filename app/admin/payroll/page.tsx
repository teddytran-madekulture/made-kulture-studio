'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type WClass = 'attendant' | 'sanitation' | 'intern' | 'freelancer'
type PayrollRow = {
  shift_id: string; starts_at: string; clock_in_at: string; clock_out_at: string
  worked_minutes: number; worker_id: string; worker_name: string | null
  worker_class: WClass; worker_label: string; provisioned: boolean; synced_at: string | null; auto_clock_out: boolean
  sets_covered: number; bonus: number
}
type WorkerSummary = { worker_id: string; worker_name: string | null; worker_label: string; shifts: number; hours: number; bonus: number; unsynced: number }
type Overview = { configured: boolean; settings: Record<WClass, boolean>; perSetRate: number; queue: PayrollRow[]; workers: WorkerSummary[] }

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const GREEN = '#6ee7a8', AMBER = '#ffb066', RED = '#ff6b6b'
const CLASSES: { key: WClass; label: string; hint: string }[] = [
  { key: 'attendant', label: 'Attendant', hint: 'W-2 hourly — safe default' },
  { key: 'sanitation', label: 'Sanitation', hint: 'W-2 hourly — safe default' },
  { key: 'intern', label: 'Intern', hint: 'confirm classification first' },
  { key: 'freelancer', label: 'Freelancer', hint: 'confirm 1099 vs W-2 first' },
]

function fmtDay(iso: string) { return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function worked(mins: number) { const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h}h ${m}m` : `${m}m` }
function money(n: number) { return '$' + (n || 0).toFixed(2) }

function Toggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy} aria-pressed={on} style={{
      width: 44, height: 24, borderRadius: 12, border: `1px solid ${on ? GREEN : C.line}`,
      background: on ? 'rgba(110,231,168,0.25)' : 'rgba(255,255,255,0.06)', position: 'relative', cursor: busy ? 'default' : 'pointer', flexShrink: 0,
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: on ? GREEN : C.dim, transition: 'left 0.12s' }} />
    </button>
  )
}

export default function PayrollPage() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; team: boolean; labor: boolean; error?: string } | null>(null)
  const [rateVal, setRateVal] = useState('')

  const load = async () => {
    const r = await fetch('/api/admin/payroll')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load payroll.'); setLoading(false); return }
    setOv(d); setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (ov) setRateVal(String(ov.perSetRate)) }, [ov])

  const toggle = async (cls: WClass, enabled: boolean) => {
    setBusyKey('cls:' + cls); setErr('')
    setOv(o => o ? { ...o, settings: { ...o.settings, [cls]: enabled } } : o) // optimistic
    const r = await fetch('/api/admin/payroll', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ worker_class: cls, enabled }) })
    setBusyKey(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not update.') }
    load()
  }
  const saveRate = async () => {
    const n = parseFloat(rateVal); if (isNaN(n)) return
    setBusyKey('rate'); setErr('')
    const r = await fetch('/api/admin/payroll', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ per_set: n }) })
    setBusyKey(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not save rate.') }
    load()
  }
  const runTest = async () => {
    setTesting(true); setTest(null); setErr('')
    const r = await fetch('/api/admin/payroll/test', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setTesting(false); setTest(d)
  }
  const send = async (row: PayrollRow) => {
    setBusyKey('shift:' + row.shift_id); setErr('')
    const r = await fetch('/api/admin/payroll/timecard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shift_id: row.shift_id }) })
    setBusyKey(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not send to Square.'); return }
    load()
  }

  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 20 }

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>PAYROLL</h1>
          <Link href="/admin/shifts" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>Shifts →</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 22 }}>
          Two layers: <b>hours</b> go to Square as timecards (Square multiplies by the base rate you set there), and the <b>per-set bonus</b> is computed here and added as a bonus line at payroll. Wages + tax classification live on the Square side.
        </p>

        {unauth ? (
          <div style={card}>Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link></div>
        ) : loading ? (
          <div style={{ color: C.dim }}>Loading…</div>
        ) : ov && (
          <>
            {err && <div style={{ color: RED, fontSize: 13, marginBottom: 14 }}>{err}</div>}

            {/* Square connection */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Square connection</div>
                  <div style={{ fontSize: 12, color: C.dim }}>
                    {!ov.configured ? <span style={{ color: RED }}>Square isn&apos;t configured.</span>
                      : test == null ? 'Confirm the live token can write Team + Labor before your first push.'
                      : test.ok ? <span style={{ color: GREEN }}>✓ Team + Labor permissions confirmed — ready to sync.</span>
                      : <span style={{ color: RED }}>Team {test.team ? '✓' : '✗'} · Labor {test.labor ? '✓' : '✗'} — {test.error}</span>}
                  </div>
                </div>
                <button onClick={runTest} disabled={testing || !ov.configured} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: '9px 16px', fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {testing ? 'TESTING…' : 'TEST CONNECTION'}
                </button>
              </div>
            </div>

            {/* Per-class toggles */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Which roles sync to payroll</div>
              <p style={{ fontSize: 12, color: C.dim, marginTop: 0, marginBottom: 14 }}>
                Attendants &amp; sanitation are on by default (on-call <b>W-2 hourly</b>). Interns &amp; freelancers are off — turn them on only once you&apos;ve confirmed their classification (intern = DOL primary-beneficiary test; freelancer = genuine 1099). Not tax advice.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {CLASSES.map(c => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{c.label}</div>
                      <div style={{ fontSize: 12, color: ov.settings[c.key] ? C.dim : AMBER }}>{c.hint}</div>
                    </div>
                    <Toggle on={!!ov.settings[c.key]} busy={busyKey === 'cls:' + c.key} onClick={() => toggle(c.key, !ov.settings[c.key])} />
                  </div>
                ))}
              </div>
            </div>

            {/* Per-set bonus rate */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Set bonus</div>
              <p style={{ fontSize: 12, color: C.dim, marginTop: 0, marginBottom: 12 }}>
                On top of the Square hourly base, each worker earns this for every booking (&ldquo;set&rdquo;) that ran during their shift. Square never sees it — the app counts the sets and you add the total as a bonus line at payroll.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: C.dim }}>$</span>
                <input type="number" min="0" step="0.5" value={rateVal} onChange={e => setRateVal(e.target.value)} style={{ width: 90, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontSize: 15, padding: '9px 10px', borderRadius: 6, outline: 'none' }} />
                <span style={{ color: C.dim, fontSize: 13 }}>per set covered</span>
                <button onClick={saveRate} disabled={busyKey === 'rate'} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: '8px 14px', fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer' }}>{busyKey === 'rate' ? '…' : 'SAVE'}</button>
              </div>
            </div>

            {/* Bonuses to enter in Square (per worker) */}
            {ov.workers.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Bonuses to enter in Square</div>
                <p style={{ fontSize: 12, color: C.dim, marginTop: 0, marginBottom: 14 }}>When you run a Square pay period, add each worker&apos;s set bonus as a one-time bonus/commission line. Hours import automatically from the timecards you send below.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ov.workers.map(w => (
                    <div key={w.worker_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{w.worker_name || '(worker)'} <span style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>· {w.worker_label}</span></div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{w.shifts} shift{w.shifts === 1 ? '' : 's'} · {w.hours} hrs{w.unsynced > 0 ? ` · ${w.unsynced} not sent yet` : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: C.accent }}>{money(w.bonus)}</div>
                        <div style={{ fontSize: 10, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>set bonus</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timecard queue */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Completed shifts to approve</div>
              <p style={{ fontSize: 12, color: C.dim, marginTop: 0, marginBottom: 14 }}>Sending pushes the hours to Square (auto-creating the worker&apos;s Team profile the first time).</p>
              {ov.queue.length === 0 ? (
                <div style={{ color: C.dim, fontSize: 13 }}>No completed shifts for a payroll-enabled role yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ov.queue.map(row => (
                    <div key={row.shift_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{row.worker_name || '(worker)'} <span style={{ fontSize: 11, color: C.dim, fontWeight: 400 }}>· {row.worker_label}</span></div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{fmtDay(row.clock_in_at)} · {fmtTime(row.clock_in_at)}–{fmtTime(row.clock_out_at)} · {worked(row.worked_minutes)} · {row.sets_covered} set{row.sets_covered === 1 ? '' : 's'} · <span style={{ color: C.accent }}>+{money(row.bonus)}</span></div>
                        {row.auto_clock_out && !row.synced_at && <div style={{ fontSize: 12, color: AMBER, marginTop: 3 }}>⚠ Auto-closed at the scheduled end — check the hours (edit on the Shifts board) before sending.</div>}
                      </div>
                      {row.synced_at ? (
                        <span style={{ fontSize: 12, color: GREEN, whiteSpace: 'nowrap' }}>✓ Sent to Square</span>
                      ) : (
                        <button onClick={() => send(row)} disabled={busyKey === 'shift:' + row.shift_id} style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {busyKey === 'shift:' + row.shift_id ? '…' : 'SEND TO SQUARE'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

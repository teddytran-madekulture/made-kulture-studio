'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type WClass = 'attendant' | 'sanitation' | 'intern' | 'freelancer'
type ShiftState = 'open' | 'claimed' | 'cancelled' | 'past'
type ShiftPhoto = { id: string; url: string; caption: string; created_at: string; captured_live: boolean | null }
type CoverageIssue = {
  kind: 'booking_cancelled' | 'window_moved' | 'uncovered_tail' | 'unlogged_set'
  message: string
  gap_start?: string
  gap_end?: string
}
type ShiftDrift = { post_closeout: boolean; issues: CoverageIssue[] }
interface Shift {
  id: string
  starts_at: string
  ends_at: string
  worker_class: WClass
  notes: string
  claimed_by: string | null
  claimed_at: string | null
  cancelled_at: string | null
  clock_in_at: string | null
  clock_out_at: string | null
  clock_edited_at: string | null
  auto_clock_out: boolean
  label: string
  state: ShiftState
  claimer: { name: string | null; email: string | null } | null
  worked_minutes: number | null
  photos: ShiftPhoto[]
  studio_review: { rating: number; note: string; created_at: string } | null
  drift: ShiftDrift | null
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const GREEN = '#6ee7a8', AMBER = '#ffb066', RED = '#ff6b6b'
const CLASSES: { key: WClass; label: string }[] = [
  { key: 'attendant', label: 'Attendant' },
  { key: 'sanitation', label: 'Sanitation' },
  { key: 'intern', label: 'Intern' },
  { key: 'freelancer', label: 'Freelancer' },
]

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso)
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sameDay = s.toDateString() === e.toDateString()
  return sameDay ? `${day} · ${t(s)} – ${t(e)}` : `${day} ${t(s)} → ${e.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${t(e)}`
}
function fmtTime(iso: string): string { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function workedLabel(mins: number): string { const h = Math.floor(mins / 60), m = mins % 60; return h ? `${h}h ${m}m` : `${m}m` }

function statePill(st: ShiftState) {
  const m = ({
    open: { bg: 'rgba(110,231,168,0.14)', fg: GREEN, txt: 'OPEN' },
    claimed: { bg: 'rgba(201,178,126,0.16)', fg: C.accent, txt: 'CLAIMED' },
    cancelled: { bg: 'rgba(255,107,107,0.14)', fg: RED, txt: 'CANCELLED' },
    past: { bg: 'rgba(255,255,255,0.06)', fg: C.dim, txt: 'PAST' },
  } as Record<ShiftState, { bg: string; fg: string; txt: string }>)[st]
  return <span style={{ background: m.bg, color: m.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{m.txt}</span>
}

// Clock + closeout-photo summary for a claimed shift.
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso); const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}

function ClockBlock({ s, reload }: { s: Shift; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [cin, setCin] = useState('')
  const [cout, setCout] = useState('')
  const [busy, setBusy] = useState(false)
  const [cerr, setCerr] = useState('')
  if (!s.claimed_by) return null

  const openEdit = () => { setCin(toLocalInput(s.clock_in_at)); setCout(toLocalInput(s.clock_out_at)); setCerr(''); setEditing(true) }
  const save = async () => {
    setBusy(true); setCerr('')
    const r = await fetch(`/api/admin/shifts/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_clock', clock_in_at: cin ? new Date(cin).toISOString() : null, clock_out_at: cout ? new Date(cout).toISOString() : null }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setCerr(d.error || 'Could not save.'); return }
    setEditing(false); reload()
  }

  let clockLine: { text: string; color: string }
  if (s.clock_in_at && s.clock_out_at) clockLine = { text: `Worked ${fmtTime(s.clock_in_at)} – ${fmtTime(s.clock_out_at)}${s.worked_minutes != null ? ` · ${workedLabel(s.worked_minutes)}` : ''}`, color: GREEN }
  else if (s.clock_in_at) clockLine = { text: `On the clock since ${fmtTime(s.clock_in_at)}`, color: C.accent }
  else clockLine = { text: 'Not clocked in yet', color: C.dim }

  const cinp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontSize: 13, padding: '7px 9px', borderRadius: 6, outline: 'none', marginTop: 3 }

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: clockLine.color }}>{clockLine.text}</span>
        {s.auto_clock_out && <span style={{ background: 'rgba(255,176,102,0.16)', color: AMBER, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', padding: '2px 7px', borderRadius: 4 }}>⚠ AUTO-CLOSED · REVIEW</span>}
        {s.clock_edited_at && !s.auto_clock_out && <span style={{ fontSize: 10, color: C.dim }}>✎ time adjusted</span>}
        {!editing && <button onClick={openEdit} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 11, cursor: 'pointer', padding: 0 }}>Edit times</button>}
      </div>

      {editing && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: C.dim, display: 'block' }}>Clock in<br /><input type="datetime-local" style={cinp} value={cin} onChange={e => setCin(e.target.value)} /></label>
            <label style={{ fontSize: 11, color: C.dim, display: 'block' }}>Clock out<br /><input type="datetime-local" style={cinp} value={cout} onChange={e => setCout(e.target.value)} /></label>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Leave a field blank to clear it — use this when someone forgot to punch or the time is off.</div>
          {cerr && <div style={{ color: RED, fontSize: 12, marginTop: 6 }}>{cerr}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={save} disabled={busy} style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer' }}>{busy ? '…' : 'SAVE TIMES'}</button>
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
      {s.photos.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Closeout photos ({s.photos.length})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {s.photos.map(p => {
              // Only false is worth flagging — null just means the photo predates
              // the live camera, and claiming those are suspect would be noise.
              const notLive = p.captured_live === false
              return (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ position: 'relative', display: 'block' }}
                  title={notLive
                    ? `${p.caption || 'Closeout'} · ${fmtTime(p.created_at)} — picked from the device, not shot in the app`
                    : (p.caption ? `${p.caption} · ${fmtTime(p.created_at)}` : fmtTime(p.created_at))}>
                  <img src={p.url} alt={p.caption || 'closeout'} style={{ width: 66, height: 66, objectFit: 'cover', borderRadius: 8, border: `1px solid ${notLive ? AMBER : C.line}`, display: 'block' }} />
                  {notLive && (
                    <span style={{ position: 'absolute', bottom: 3, left: 3, background: 'rgba(11,11,13,0.85)', color: AMBER, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', padding: '1px 4px', borderRadius: 3 }}>FROM FILES</span>
                  )}
                </a>
              )
            })}
          </div>
        </div>
      ) : s.clock_in_at ? (
        <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>No closeout photos yet.</div>
      ) : null}
    </div>
  )
}

// Bookings move after a shift is posted — extended, rescheduled, cancelled, set
// swapped. This surfaces that drift on the shift itself (louder when the change
// landed after the worker already closed out) and staffs an uncovered tail in one
// click, so a session that ran long doesn't quietly go unattended.
function DriftBlock({ s, reload }: { s: Shift; reload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!s.drift || s.drift.issues.length === 0) return null

  const staffGap = async (i: CoverageIssue) => {
    if (!i.gap_start || !i.gap_end) return
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/staffing/from-block', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starts_at: i.gap_start, ends_at: i.gap_end, worker_class: s.worker_class, notes: 'Coverage gap — session ran long' }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not post a shift for the gap.'); return }
    reload()
  }

  return (
    <div style={{ marginTop: 10, background: 'rgba(255,176,102,0.08)', border: '1px solid rgba(255,176,102,0.35)', borderRadius: 8, padding: '10px 12px' }}>
      <span style={{ display: 'inline-block', background: 'rgba(255,176,102,0.18)', color: AMBER, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, marginBottom: 7 }}>
        {s.drift.post_closeout ? '⚠ CHANGED AFTER CLOSEOUT' : '⚠ NEEDS ATTENTION'}
      </span>
      {s.drift.issues.map((i, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: idx ? 7 : 0 }}>
          <span style={{ fontSize: 12, color: C.text }}>{i.message}</span>
          {i.kind === 'uncovered_tail' && i.gap_start && i.gap_end && (
            <button onClick={() => staffGap(i)} disabled={busy}
              style={{ background: AMBER, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '5px 11px', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {busy ? '…' : 'STAFF THE GAP'}
            </button>
          )}
        </div>
      ))}
      {err && <div style={{ color: RED, fontSize: 12, marginTop: 7 }}>{err}</div>}
    </div>
  )
}

// Static star row (filled/empty).
function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return (
    <span style={{ color: '#e0b64a', fontSize: size, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(i => <span key={i} style={{ opacity: i <= n ? 1 : 0.25 }}>★</span>)}
    </span>
  )
}

// Rate the worker who did a finished shift (studio → worker). Editable stars if
// unrated; shows the saved rating (still re-clickable to change) once set.
function WorkerRating({ s, reload }: { s: Shift; reload: () => void }) {
  const reviewable = !!s.claimed_by && (s.state === 'past' || !!s.clock_out_at)
  const [rating, setRating] = useState(s.studio_review?.rating ?? 0)
  const [note, setNote] = useState(s.studio_review?.note ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!reviewable) return null

  const submit = async (stars: number) => {
    setRating(stars); setBusy(true); setErr('')
    const r = await fetch(`/api/admin/shifts/${s.id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: stars, note }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not save.'); return }
    reload()
  }

  const star = (i: number) => (
    <span key={i} onClick={() => !busy && submit(i)} style={{ cursor: busy ? 'default' : 'pointer', color: '#e0b64a', fontSize: 20, opacity: i <= rating ? 1 : 0.28, padding: '0 1px' }}>★</span>
  )

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
      {s.studio_review && !open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: C.dim }}>
          <span>Your rating:</span> <Stars n={s.studio_review.rating} />
          {s.studio_review.note ? <span>· “{s.studio_review.note}”</span> : null}
          <button onClick={() => setOpen(true)} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '3px 9px', fontSize: 11, cursor: 'pointer' }}>Change</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Rate {s.claimer?.name || s.claimer?.email || 'the worker'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{[1, 2, 3, 4, 5].map(star)}</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
              style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontSize: 13, padding: '7px 10px', borderRadius: 6, flex: '1 1 180px', minWidth: 140, outline: 'none' }} />
          </div>
          {err && <div style={{ color: RED, fontSize: 12, marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}

type CoverageBlock = {
  key: string
  start_time: string
  end_time: string
  booking_count: number
  bookings: { start_time: string; end_time: string; set_name: string | null }[]
  sets: string[]
  cut_points: string[]
  shift: { id: string; worker_class: WClass; state: ShiftState; claimer_name: string | null } | null
}

// Staff by coverage block: overlapping / back-to-back bookings are merged so one
// shift covers a natural stretch and one worker owns every booking in it.
function StaffFromBookings({ onPosted }: { onPosted: () => void }) {
  const [items, setItems] = useState<CoverageBlock[] | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [splitKey, setSplitKey] = useState<string | null>(null)
  const [role, setRole] = useState<Record<string, WClass>>({})
  const [err, setErr] = useState('')

  const load = async () => {
    const r = await fetch('/api/admin/staffing/bookings')
    if (!r.ok) { setItems([]); return }
    const d = await r.json().catch(() => ({}))
    setItems(d.blocks ?? [])
  }
  useEffect(() => { load() }, [])

  const post = async (bl: CoverageBlock) => {
    setBusyKey(bl.key); setErr('')
    const r = await fetch('/api/admin/staffing/from-block', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starts_at: bl.start_time, ends_at: bl.end_time, worker_class: role[bl.key] || 'attendant', notes: bl.sets.join(', ') }),
    })
    setBusyKey(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not post.') }
    load(); onPosted()
  }

  // Split one block into two back-to-back shifts at a clean booking boundary.
  // Posts [start, cut] then [cut, end] — same role, whole bookings on each side.
  const postSplit = async (bl: CoverageBlock, cut: string) => {
    setBusyKey(bl.key); setErr('')
    const wc = role[bl.key] || 'attendant'
    const windows: [string, string][] = [[bl.start_time, cut], [cut, bl.end_time]]
    for (const [s, e] of windows) {
      const r = await fetch('/api/admin/staffing/from-block', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starts_at: s, ends_at: e, worker_class: wc, notes: bl.sets.join(', ') }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not split the block.'); break }
    }
    setBusyKey(null); setSplitKey(null); load(); onPosted()
  }

  if (!items) return null
  const needing = items.filter(b => !b.shift || b.shift.state === 'cancelled')

  const statusText = (sh: NonNullable<CoverageBlock['shift']>) => {
    if (sh.state === 'claimed') return { txt: `Claimed by ${sh.claimer_name || 'a worker'}`, color: C.accent }
    if (sh.state === 'open') return { txt: 'Shift posted · open', color: GREEN }
    if (sh.state === 'past') return { txt: 'Shift done', color: C.dim }
    return { txt: 'Shift cancelled', color: RED }
  }
  const desc = (bl: CoverageBlock) => `${bl.booking_count} booking${bl.booking_count === 1 ? '' : 's'} · ${bl.sets.length ? bl.sets.join(', ') : 'Booking'}`

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em' }}>Staff a coverage block</div>
        <div style={{ fontSize: 12, color: C.dim }}>{needing.length} block{needing.length === 1 ? '' : 's'} unstaffed</div>
      </div>
      <p style={{ fontSize: 12, color: C.dim, marginTop: 0, marginBottom: 14 }}>Overlapping and back-to-back bookings are merged into one block. Post a shift for the block and one worker covers every booking in it.</p>
      {items.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 13 }}>No upcoming bookings.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(bl => {
            const staffed = bl.shift && bl.shift.state !== 'cancelled'
            const canSplit = !staffed && (bl.cut_points?.length ?? 0) > 0
            return (
            <div key={bl.key} style={{ padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtRange(bl.start_time, bl.end_time)}</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{desc(bl)}</div>
                </div>
                {staffed ? (
                  <span style={{ fontSize: 12, color: statusText(bl.shift!).color, whiteSpace: 'nowrap' }}>{statusText(bl.shift!).txt}</span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <select value={role[bl.key] || 'attendant'} onChange={e => setRole({ ...role, [bl.key]: e.target.value as WClass })}
                      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontSize: 12, padding: '6px 8px', borderRadius: 6 }}>
                      {CLASSES.map(c => <option key={c.key} value={c.key} style={{ background: C.card }}>{c.label}</option>)}
                    </select>
                    {canSplit && (
                      <button onClick={() => setSplitKey(splitKey === bl.key ? null : bl.key)} disabled={busyKey === bl.key}
                        style={{ background: 'none', border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: '8px 12px', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {splitKey === bl.key ? 'CANCEL' : 'SPLIT'}
                      </button>
                    )}
                    <button onClick={() => post(bl)} disabled={busyKey === bl.key}
                      style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '8px 14px', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {busyKey === bl.key ? '…' : 'POST SHIFT'}
                    </button>
                  </div>
                )}
              </div>
              {canSplit && splitKey === bl.key && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>Split into two back-to-back shifts at a booking boundary — each side covers whole bookings, never mid-shoot. The same worker can claim both and stays clocked in across them.</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {bl.cut_points.map(cut => (
                      <button key={cut} onClick={() => postSplit(bl, cut)} disabled={busyKey === bl.key}
                        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {fmtTime(bl.start_time)}–{fmtTime(cut)}  +  {fmtTime(cut)}–{fmtTime(bl.end_time)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
      {err && <div style={{ color: RED, fontSize: 13, marginTop: 10 }}>{err}</div>}
    </div>
  )
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [f, setF] = useState({ starts_at: '', ends_at: '', worker_class: 'attendant' as WClass, notes: '' })

  const load = async () => {
    const r = await fetch('/api/admin/shifts')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load shifts.'); setLoading(false); return }
    setShifts(d.shifts ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const post = async () => {
    setErr('')
    if (!f.starts_at || !f.ends_at) { setErr('Enter a start and end time.'); return }
    const sd = new Date(f.starts_at), ed = new Date(f.ends_at)
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) { setErr('Enter a valid start and end time.'); return }
    setBusy(true)
    const r = await fetch('/api/admin/shifts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starts_at: sd.toISOString(), ends_at: ed.toISOString(), worker_class: f.worker_class, notes: f.notes }),
    })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not post shift.'); return }
    setF({ starts_at: '', ends_at: '', worker_class: f.worker_class, notes: '' }); load()
  }

  const act = async (id: string, action: string) => {
    setErr('')
    const r = await fetch(`/api/admin/shifts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not update.'); return }
    load()
  }
  const del = async (id: string) => {
    setErr(''); setConfirmDel(null)
    const r = await fetch(`/api/admin/shifts/${id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not delete.'); return }
    load()
  }

  const counts = useMemo(() => ({
    open: shifts.filter(s => s.state === 'open').length,
    claimed: shifts.filter(s => s.state === 'claimed').length,
    attention: shifts.filter(s => (s.drift?.issues.length ?? 0) > 0).length,
  }), [shifts])

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }
  const smallBtn = (color: string): React.CSSProperties => ({ background: 'none', border: `1px solid ${C.line}`, color, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' })

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>SHIFTS</h1>
          <Link href="/admin/workers" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>Worker roster →</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 22 }}>
          Post a shift for a role and an <b>active, certified</b> worker of that class can claim it. {counts.open} open · {counts.claimed} claimed
          {counts.attention > 0 && <> · <b style={{ color: AMBER }}>{counts.attention} need{counts.attention === 1 ? 's' : ''} attention</b></>}.
        </p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            {/* Staff from bookings */}
            <StaffFromBookings onPosted={load} />

            {/* Post a one-off shift */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 14 }}>Post a one-off shift</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div><span style={lbl}>Starts</span><input type="datetime-local" style={inp} value={f.starts_at} onChange={e => setF({ ...f, starts_at: e.target.value })} /></div>
                <div><span style={lbl}>Ends</span><input type="datetime-local" style={inp} value={f.ends_at} onChange={e => setF({ ...f, ends_at: e.target.value })} /></div>
                <div>
                  <span style={lbl}>Role needed</span>
                  <select style={inp} value={f.worker_class} onChange={e => setF({ ...f, worker_class: e.target.value as WClass })}>
                    {CLASSES.map(c => <option key={c.key} value={c.key} style={{ background: C.card }}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <span style={lbl}>Notes (optional)</span>
                <input style={inp} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="e.g. buyout — expect a big crew, keep Commons tidy" />
              </div>
              {err && <div style={{ color: RED, fontSize: 13, marginTop: 12 }}>{err}</div>}
              <button onClick={post} disabled={busy} style={{ marginTop: 16, background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                {busy ? 'POSTING…' : '+ POST SHIFT'}
              </button>
            </div>

            {/* Board */}
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : shifts.length === 0 ? (
              <div style={{ color: C.dim }}>No shifts yet. Post one above.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shifts.map(s => (
                  <div key={s.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', opacity: s.state === 'cancelled' ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{fmtRange(s.starts_at, s.ends_at)}</span>
                          {statePill(s.state)}
                          <span style={{ fontSize: 11, color: C.dim, border: `1px solid ${C.line}`, borderRadius: 20, padding: '2px 10px' }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                          {s.claimer ? `Claimed by ${s.claimer.name || s.claimer.email || 'a worker'}` : s.state === 'open' ? 'Unclaimed' : ''}
                          {s.notes ? `${s.claimer || s.state === 'open' ? ' · ' : ''}${s.notes}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                        {s.state === 'claimed' && <button onClick={() => act(s.id, 'release')} style={smallBtn(C.text)}>RELEASE</button>}
                        {s.state === 'cancelled'
                          ? <button onClick={() => act(s.id, 'uncancel')} style={smallBtn(C.text)}>RESTORE</button>
                          : s.state !== 'past' && <button onClick={() => act(s.id, 'cancel')} style={smallBtn(AMBER)}>CANCEL</button>}
                        {confirmDel === s.id
                          ? <button onClick={() => del(s.id)} style={smallBtn(RED)}>CONFIRM DELETE</button>
                          : <button onClick={() => setConfirmDel(s.id)} style={smallBtn(C.dim)}>DELETE</button>}
                      </div>
                    </div>
                    <DriftBlock s={s} reload={load} />
                    <ClockBlock s={s} reload={load} />
                    <WorkerRating s={s} reload={load} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

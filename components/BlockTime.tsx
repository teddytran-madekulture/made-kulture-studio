'use client'
// Block time / closures UI, shared by the dashboard CALENDAR (where you create
// them) and /admin/closures (holidays + the full list). Migration 143.
//   BlockTimeForm       the form itself (POST /api/admin/closures)
//   BlockTimeModal      the form in a modal, opened from the calendar
//   ClosureDetailModal  tap a closure band: remove it, or open one holiday date
import { useEffect, useState } from 'react'

export type SetOpt = { id: string; name: string }
export type Conflict = { id: string; start: string; end: string; set: string; customer: string; status: string }
export type Occurrence = {
  id: string; kind: 'closure' | 'holiday'; startISO: string; endISO: string
  setIds: string[] | null; setNames: string[] | null
  publicLabel: string | null; note: string | null; holidayKey?: string; date?: string
}
export type BlockPrefill = { date: string; startHour?: number; endHour?: number; setIds?: string[] }

export const TZ = 'America/Chicago'
const label: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.14em', color: '#888', fontWeight: 700, marginBottom: 6, display: 'block' }
const input: React.CSSProperties = { background: '#0d0d0f', color: '#eee', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '9px 10px', fontSize: 14, fontFamily: 'Inter, sans-serif', colorScheme: 'dark' }
// Native <option> popups follow the visitor's OS theme — set both colours.
const opt: React.CSSProperties = { background: '#0d0d0f', color: '#eee' }
export const btn = (tone: 'light' | 'ghost' | 'danger'): React.CSSProperties => ({
  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
  background: tone === 'light' ? '#f2f2f2' : 'transparent', color: tone === 'light' ? '#111' : tone === 'danger' ? '#f0a0a0' : '#bbb',
  border: tone === 'light' ? 'none' : `1px solid ${tone === 'danger' ? 'rgba(240,160,160,0.4)' : 'rgba(255,255,255,0.18)'}`,
})
// Grey diagonal stripes — the one look for "closed" everywhere it's drawn.
export const CLOSED_BG = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.07) 0 6px, rgba(255,255,255,0.02) 6px 12px)'

const HOURS = Array.from({ length: 49 }, (_, i) => i / 2)
const hourLabel = (h: number) => {
  if (h === 0) return '12:00 AM'
  if (h === 24) return '12:00 AM (midnight)'
  const hh = Math.floor(h), mm = h % 1 ? '30' : '00'
  return `${hh % 12 === 0 ? 12 : hh % 12}:${mm} ${hh < 12 ? 'AM' : 'PM'}`
}
export const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
export const centralDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
const isMidnight = (iso: string) => fmtClock(iso) === '12:00 AM'
const todayCentral = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

// "Thu, Nov 26, 2026 · all day" / "Tue, Oct 6, 2:00 PM – 6:00 PM"
export function describeWindow(startISO: string, endISO: string): string {
  if (isMidnight(startISO) && isMidnight(endISO)) {
    const first = centralDate(startISO)
    const last = centralDate(new Date(Date.parse(endISO) - 60_000).toISOString())
    return first === last ? `${fmtDate(first)} · all day` : `${fmtDate(first)} → ${fmtDate(last)} · all day`
  }
  return centralDate(startISO) === centralDate(endISO) || isMidnight(endISO)
    ? `${fmtWhen(startISO)} – ${fmtClock(endISO)}`
    : `${fmtWhen(startISO)} → ${fmtWhen(endISO)}`
}

// Every Central date a window touches (end is exclusive).
export function datesCovered(startISO: string, endISO: string): string[] {
  const out: string[] = []
  let d = centralDate(startISO)
  const last = centralDate(new Date(Date.parse(endISO) - 60_000).toISOString())
  for (let i = 0; i < 400 && d <= last; i++) {
    out.push(d)
    const [y, m, dd] = d.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1, dd + 1))
    d = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
  }
  return out
}

export function ConflictList({ list }: { list: Conflict[] }) {
  if (!list.length) return null
  return (
    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'rgba(230,192,122,0.08)', border: '1px solid rgba(230,192,122,0.35)', fontSize: 12.5, color: '#e6c07a', lineHeight: 1.6 }}>
      ⚠ {list.length} existing booking{list.length === 1 ? '' : 's'} in this window — still on, nothing was cancelled:
      {list.map(c => <div key={c.id} style={{ color: '#ccc' }}>· {c.customer} — {c.set}, {fmtWhen(c.start)}–{fmtClock(c.end)}{c.status !== 'confirmed' ? ` (${c.status})` : ''}</div>)}
    </div>
  )
}

export function BlockTimeForm({ sets, prefill, onSaved }: { sets: SetOpt[]; prefill?: BlockPrefill; onSaved?: () => void }) {
  const today = todayCentral()
  const partial = prefill?.startHour !== undefined
  const [startDate, setStartDate] = useState(prefill?.date ?? today)
  const [endDate, setEndDate] = useState(prefill?.date ?? today)
  const [allDay, setAllDay] = useState(!partial)
  const [startHour, setStartHour] = useState(prefill?.startHour ?? 9)
  const [endHour, setEndHour] = useState(prefill?.endHour ?? 22)
  const [whole, setWhole] = useState(!prefill?.setIds?.length)
  const [picked, setPicked] = useState<string[]>(prefill?.setIds ?? [])
  const [publicLabel, setPublicLabel] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; conflicts: Conflict[] } | null>(null)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!whole && !picked.length) { setErr('Pick at least one set, or choose Whole studio.'); return }
    setBusy(true); setMsg(null); setErr('')
    const r = await fetch('/api/admin/closures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate: allDay ? endDate : startDate, allDay, startHour, endHour, setIds: whole ? null : picked, publicLabel, note }),
    }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r || !r.ok) { setErr(d.error || 'That did not save.'); return }
    setMsg({ text: 'Blocked. Customers can no longer book that time.', conflicts: d.conflicts ?? [] })
    setNote(''); setPublicLabel('')
    onSaved?.()
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: '#eee' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" style={btn(allDay ? 'light' : 'ghost')} onClick={() => setAllDay(true)}>FULL DAY(S)</button>
        <button type="button" style={btn(!allDay ? 'light' : 'ghost')} onClick={() => setAllDay(false)}>PART OF A DAY</button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><span style={label}>{allDay ? 'FROM' : 'DATE'}</span>
          <input type="date" value={startDate} min={today} onChange={e => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} style={input} /></div>
        {allDay ? (
          <div><span style={label}>THROUGH</span>
            <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={input} /></div>
        ) : (<>
          <div><span style={label}>FROM</span>
            <select value={startHour} onChange={e => { const v = Number(e.target.value); setStartHour(v); if (endHour <= v) setEndHour(Math.min(24, v + 1)) }} style={input}>
              {HOURS.filter(h => h < 24).map(h => <option key={h} value={h} style={opt}>{hourLabel(h)}</option>)}
            </select></div>
          <div><span style={label}>UNTIL</span>
            <select value={endHour} onChange={e => setEndHour(Number(e.target.value))} style={input}>
              {HOURS.filter(h => h > startHour).map(h => <option key={h} value={h} style={opt}>{hourLabel(h)}</option>)}
            </select></div>
        </>)}
      </div>

      <span style={label}>WHAT&apos;S CLOSED</span>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btn(whole ? 'light' : 'ghost')} onClick={() => setWhole(true)}>WHOLE STUDIO</button>
        <button type="button" style={btn(!whole ? 'light' : 'ghost')} onClick={() => setWhole(false)}>CERTAIN SETS</button>
      </div>
      {!whole && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {sets.map(s => {
            const on = picked.includes(s.id)
            return <button key={s.id} type="button" onClick={() => setPicked(p => on ? p.filter(x => x !== s.id) : [...p, s.id])}
              style={{ ...btn(on ? 'light' : 'ghost'), fontSize: 12, letterSpacing: '0.02em' }}>{s.name}</button>
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, marginTop: whole ? 4 : 0 }}>
        <div style={{ flex: '1 1 220px' }}><span style={label}>SHOWN TO CUSTOMERS (OPTIONAL)</span>
          <input value={publicLabel} maxLength={80} placeholder="e.g. Closed for a private event" onChange={e => setPublicLabel(e.target.value)} style={{ ...input, width: '100%', boxSizing: 'border-box' }} /></div>
        <div style={{ flex: '1 1 220px' }}><span style={label}>PRIVATE NOTE (JUST YOU)</span>
          <input value={note} maxLength={500} placeholder="e.g. Repainting Set C backdrop" onChange={e => setNote(e.target.value)} style={{ ...input, width: '100%', boxSizing: 'border-box' }} /></div>
      </div>
      <button type="button" disabled={busy} onClick={save} style={{ ...btn('light'), padding: '11px 18px', opacity: busy ? 0.5 : 1 }}>{busy ? 'SAVING…' : 'BLOCK THIS TIME'}</button>
      {err && <div style={{ marginTop: 10, fontSize: 13, color: '#f0a0a0' }}>{err}</div>}
      {msg && <div style={{ marginTop: 12, fontSize: 13, color: '#9fd8a8' }}>{msg.text}<ConflictList list={msg.conflicts} /></div>}
    </div>
  )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#141416', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 18, width: '100%', maxWidth: 560, maxHeight: 'calc(90 * var(--svh, 1vh))', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, letterSpacing: '0.05em', color: '#fff' }}>{title}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function BlockTimeModal({ sets, prefill, onClose, onSaved }: { sets: SetOpt[]; prefill?: BlockPrefill; onClose: () => void; onSaved?: () => void }) {
  return (
    <Shell title="BLOCK TIME" onClose={onClose}>
      <BlockTimeForm sets={sets} prefill={prefill} onSaved={onSaved} />
      <div style={{ marginTop: 16, fontSize: 12, color: '#777', lineHeight: 1.5 }}>
        Customers can&apos;t book, reschedule or add time into blocked hours. You still can from the admin. Holidays live on <a href="/admin/closures" style={{ color: '#e6c07a' }}>Manage holidays</a>.
      </div>
    </Shell>
  )
}

export function ClosureDetailModal({ occ, onClose, onChanged }: { occ: Occurrence; onClose: () => void; onChanged?: () => void }) {
  const [confirm, setConfirm] = useState(false)   // two-tap, never window.confirm()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const act = async (method: 'DELETE' | 'PATCH', body: any) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/closures', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r || !r.ok) { setErr(d.error || 'That did not work.'); return }
    onChanged?.(); onClose()
  }
  const holiday = occ.kind === 'holiday'
  return (
    <Shell title={holiday ? 'HOLIDAY — CLOSED' : 'BLOCKED TIME'} onClose={onClose}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{describeWindow(occ.startISO, occ.endISO)}</div>
      <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>{occ.setNames?.length ? occ.setNames.join(', ') : 'Whole studio'}</div>
      {occ.publicLabel && <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>Customers see “{occ.publicLabel}”</div>}
      {occ.note && <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Note: {occ.note}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {holiday ? (<>
          <button type="button" disabled={busy} style={btn(confirm ? 'danger' : 'ghost')}
            onClick={() => confirm ? act('PATCH', { key: occ.holidayKey, skipDate: occ.date, skip: true }) : setConfirm(true)}>
            {busy ? 'WORKING…' : confirm ? 'TAP AGAIN — OPEN THIS DATE' : 'OPEN THIS YEAR'}
          </button>
          <a href="/admin/closures" style={{ ...btn('ghost'), textDecoration: 'none' }}>MANAGE HOLIDAYS</a>
        </>) : (
          <button type="button" disabled={busy} style={btn('danger')}
            onClick={() => confirm ? act('DELETE', { id: occ.id }) : setConfirm(true)}>
            {busy ? 'WORKING…' : confirm ? 'TAP AGAIN TO REMOVE' : 'REMOVE — OPEN IT BACK UP'}
          </button>
        )}
      </div>
      {err && <div style={{ marginTop: 10, fontSize: 13, color: '#f0a0a0' }}>{err}</div>}
    </Shell>
  )
}

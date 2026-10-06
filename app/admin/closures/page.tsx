'use client'
// /admin/closures — Manage holidays + the list of everything blocked (migration 143).
// Day-to-day blocking happens on the dashboard CALENDAR (BLOCK TIME, or tap an
// empty slot); this page is reached from the calendar's "Manage holidays" link
// and is deliberately NOT in the sidebars — one obvious place to block time.
import { useEffect, useState } from 'react'
import { BlockTimeModal, ConflictList, btn, describeWindow, fmtDate, type Conflict, type SetOpt } from '@/components/BlockTime'

type ClosureRow = { id: string; starts_at: string; ends_at: string; set_ids: string[] | null; note: string | null; public_label: string | null; conflicts: Conflict[] }
type Holiday = { key: string; label: string; enabled: boolean; upcoming: { date: string; skipped: boolean; conflicts: Conflict[] }[] }

const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }

export default function ClosuresPage() {
  const [closures, setClosures] = useState<ClosureRow[] | null>(null)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [sets, setSets] = useState<SetOpt[]>([])
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)   // two-tap remove, never window.confirm()

  const load = () => fetch('/api/admin/closures', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(`${d.error || 'Could not load closures.'}${d.hint ? ` — ${d.hint}` : ''}`); return }   // never render a failed read as "nothing blocked"
    setErr(''); setClosures(d.closures ?? []); setHolidays(d.holidays ?? []); setSets(d.sets ?? [])
  }).catch(() => setErr('Could not load closures.'))
  useEffect(() => { load() }, [])

  const call = async (method: 'DELETE' | 'PATCH', body: any) => {
    const r = await fetch('/api/admin/closures', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) setErr(d.error || 'That did not work.')
    setConfirmId(null); load()
  }
  const setName = (id: string) => sets.find(s => s.id === id)?.name ?? 'Unknown set'

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1000, fontFamily: 'Inter, sans-serif', color: '#eee' }}>
      <a href="/admin/dashboard" style={{ color: '#888', fontSize: 12, textDecoration: 'none', letterSpacing: '0.08em' }}>← BACK TO CALENDAR</a>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, margin: '8px 0 6px', letterSpacing: '0.02em' }}>HOLIDAYS &amp; CLOSURES</h1>
      <p style={{ color: '#999', fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 }}>
        Block time from the calendar (BLOCK TIME, or tap an empty slot). This page holds the yearly holidays and a list of everything blocked. Customers can&apos;t book, reschedule or add time into a closure; you still can from the admin. Bookings already inside a closure are flagged, never cancelled. Acuity doesn&apos;t know about these — block the same time there by hand while it&apos;s still live.
      </p>
      <button type="button" style={{ ...btn('light'), marginBottom: 22 }} onClick={() => setAdding(true)}>+ BLOCK TIME</button>
      {err && <div style={{ color: '#f0a0a0', marginBottom: 12 }}>{err}</div>}

      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 4px' }}>YEARLY HOLIDAYS</div>
      <p style={{ color: '#888', fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.5 }}>Closed all day, every year, whole studio. OPEN THIS YEAR keeps it on for good but lets one date be booked.</p>
      <div style={{ display: 'grid', gap: 10, marginBottom: 26 }}>
        {holidays.map(h => (
          <div key={h.key} style={{ ...card, opacity: h.enabled ? 1 : 0.65 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{h.label}</div>
              <button type="button" style={btn(h.enabled ? 'light' : 'ghost')} onClick={() => call('PATCH', { key: h.key, enabled: !h.enabled })}>
                {h.enabled ? 'CLOSED ✓' : 'OPEN — TAP TO CLOSE'}
              </button>
            </div>
            {h.enabled && h.upcoming.map(u => (
              <div key={u.date} style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: u.skipped ? '#888' : '#ccc' }}>
                  <span>{fmtDate(u.date)}{u.skipped ? ' — open this year' : ' — closed'}</span>
                  <button type="button" style={{ ...btn('ghost'), padding: '5px 9px', fontSize: 10 }} onClick={() => call('PATCH', { key: h.key, skipDate: u.date, skip: !u.skipped })}>
                    {u.skipped ? 'CLOSE IT AGAIN' : 'OPEN THIS YEAR'}
                  </button>
                </div>
                <ConflictList list={u.conflicts} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', margin: '0 0 10px' }}>UPCOMING BLOCKED TIME</div>
      {!closures && !err && <div style={{ color: '#888' }}>Loading…</div>}
      {closures && closures.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Nothing blocked yet.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {(closures ?? []).map(r => (
          <div key={r.id} style={{ ...card, borderColor: r.conflicts.length ? 'rgba(230,192,122,0.45)' : 'rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{describeWindow(r.starts_at, r.ends_at)}</div>
                <div style={{ fontSize: 12.5, color: '#aaa', marginTop: 3 }}>
                  {r.set_ids?.length ? r.set_ids.map(setName).join(', ') : 'Whole studio'}
                  {r.public_label && <> · customers see “{r.public_label}”</>}
                </div>
                {r.note && <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>Note: {r.note}</div>}
              </div>
              <button type="button" style={btn('danger')} onClick={() => confirmId === r.id ? call('DELETE', { id: r.id }) : setConfirmId(r.id)}>
                {confirmId === r.id ? 'TAP AGAIN TO REMOVE' : 'REMOVE'}
              </button>
            </div>
            <ConflictList list={r.conflicts} />
          </div>
        ))}
      </div>

      {adding && <BlockTimeModal sets={sets} onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  )
}

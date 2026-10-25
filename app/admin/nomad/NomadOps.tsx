'use client'
// Nomad admin: Members · Stays · House · Settings (2026-10-25). Rendered by
// app/admin/nomad/page.tsx next to the Applications tab.
import { useCallback, useEffect, useState } from 'react'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', gold: '#d4a843', green: '#4ade80', amber: '#fbbf24', red: '#f87171' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 16 }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.6 }
const input: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: '8px 10px', fontSize: 16, fontFamily: 'Inter, sans-serif', colorScheme: 'dark', boxSizing: 'border-box' }
const btn = (color: string, filled = false): React.CSSProperties => ({
  background: filled ? color : 'transparent', color: filled ? '#080808' : color, border: `1px solid ${color}`,
  borderRadius: 4, padding: '6px 11px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
})
const money = (c: number) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`
const day = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso)) : '—'
const STATUS_COLOR: Record<string, string> = { pending: C.gold, starting: C.gold, active: C.green, past_due: C.amber, paused: C.red, ended: C.dim, confirmed: C.green, requested: C.amber, cancelled: C.dim, declined: C.dim }
const Pill = ({ s }: { s: string }) => <span style={{ ...btn(STATUS_COLOR[s] || C.text, true), cursor: 'default', padding: '3px 8px' }}>{s.replace('_', ' ').toUpperCase()}</span>

export default function NomadOps({ section }: { section: 'members' | 'stays' | 'house' | 'settings' }) {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/nomad/members', { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not load.'); return }
    setErr(null); setD(j)
  }, [])
  useEffect(() => { load() }, [load])

  async function act(body: Record<string, unknown>, ok = 'Saved.') {
    setBusy(true); setNotice(null)
    try {
      const r = await fetch('/api/admin/nomad/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      setNotice(r.ok ? ok : `⚠️ ${j.error || 'Failed.'}`)
      await load()
      return r.ok
    } finally { setBusy(false) }
  }

  if (err) return <div style={{ ...small, color: C.amber }}>⚠️ {err}</div>
  if (!d) return <div style={small}>Loading…</div>

  return (
    <div>
      {notice && <div style={{ ...small, color: notice.startsWith('⚠️') ? C.amber : C.green, marginBottom: 14 }}>{notice}</div>}
      {section === 'members' && <Members d={d} act={act} busy={busy} />}
      {section === 'stays' && <Stays d={d} act={act} busy={busy} />}
      {section === 'house' && <House d={d} />}
      {section === 'settings' && <Settings d={d} act={act} busy={busy} />}
    </div>
  )
}

function Members({ d, act, busy }: any) {
  const [adj, setAdj] = useState<Record<string, string>>({})
  const live = d.members.filter((m: any) => ['active', 'past_due'].includes(m.status))
  const mrr = live.reduce((n: number, m: any) => n + (m.dues_cents || d.settings.dues_cents), 0)
  const open = d.charges.filter((c: any) => c.status === 'link_sent')
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[['Active members', String(live.length)], ['Monthly dues', money(mrr)], ['Waiting to start', String(d.members.filter((m: any) => m.status === 'pending').length)], ['Open payment links', String(open.length)]].map(([k, v]) => (
          <div key={k} style={card}><div style={small}>{k}</div><div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 26 }}>{v}</div></div>
        ))}
      </div>
      <p style={{ ...small, marginBottom: 14 }}>To add a member: approve their application, then press CREATE MEMBERSHIP on it. They start it themselves from their account (house rules + card), which is what authorizes the monthly charge.</p>
      {d.members.length === 0 && <div style={small}>No members yet.</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {d.members.map((m: any) => (
          <div key={m.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{m.name || m.email} {m.founding && <span style={{ color: C.gold, fontSize: 11 }}>FOUNDING</span>}</div>
                <div style={small}>{m.email} · {money(m.dues_cents || d.settings.dues_cents)}/mo{m.dues_cents ? ' (locked rate)' : ''} · paid through {day(m.paid_through)}{m.cancel_at_period_end ? ' · cancelling' : ''}</div>
                <div style={small}>Night bank: <strong style={{ color: C.text }}>{m.balance}</strong> · last charge: {m.last_charge ? `${money(m.last_charge.amount_cents)} ${m.last_charge.status} ${day(m.last_charge.created_at)}` : 'none'}</div>
              </div>
              <Pill s={m.status} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              {['past_due', 'paused'].includes(m.status) && <button disabled={busy} onClick={() => act({ action: 'retry_charge', id: m.id }, 'Charged.')} style={btn(C.green)}>RETRY CHARGE</button>}
              {m.status === 'active' && <button disabled={busy} onClick={() => act({ action: 'set_status', id: m.id, status: 'paused' })} style={btn(C.amber)}>PAUSE</button>}
              {m.status === 'paused' && <button disabled={busy} onClick={() => act({ action: 'set_status', id: m.id, status: 'active' })} style={btn(C.green)}>RESUME</button>}
              {m.status === 'starting' && <button disabled={busy} onClick={() => act({ action: 'set_status', id: m.id, status: 'pending' }, 'Reset. Check Recent charges before they try again.')} style={btn(C.amber)}>RESET STUCK START</button>}
              {m.status !== 'ended' && <button disabled={busy} onClick={() => { if (confirmEnd()) act({ action: 'set_status', id: m.id, status: 'ended' }) }} style={btn(C.red)}>END NOW</button>}
              <button disabled={busy} onClick={() => act({ action: 'update_member', id: m.id, founding: !m.founding })} style={btn(C.gold)}>{m.founding ? 'UNMARK FOUNDING' : 'MARK FOUNDING'}</button>
              <input placeholder="± nights" value={adj[m.id] ?? ''} onChange={e => setAdj(x => ({ ...x, [m.id]: e.target.value }))} style={{ ...input, width: 90, padding: '5px 8px' }} />
              <button disabled={busy || !adj[m.id]} onClick={() => act({ action: 'adjust_nights', id: m.id, delta: Number(adj[m.id]), note: 'admin adjustment' }, 'Nights adjusted.').then(ok => ok && setAdj(x => ({ ...x, [m.id]: '' })))} style={btn(C.text)}>ADJUST NIGHTS</button>
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, margin: '26px 0 10px' }}>RECENT CHARGES</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        {d.charges.length === 0 && <div style={small}>None yet.</div>}
        {d.charges.map((c: any) => (
          <div key={c.id} style={{ ...small, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', color: 'rgba(255,255,255,0.75)' }}>
            <span>{day(c.created_at)}</span><span>{c.who}</span><span>{c.kind === 'dues' ? 'Dues' : 'Extra nights'}</span><span>{money(c.amount_cents)}</span><Pill s={c.status === 'charged' || c.status === 'paid_link' ? 'confirmed' : c.status === 'link_sent' ? 'requested' : 'cancelled'} /><span>{c.status.replace('_', ' ')}{c.error ? ` · ${c.error}` : ''}</span>
            {['link_sent', 'failed'].includes(c.status) && c.kind === 'dues' && <button disabled={busy} onClick={() => act({ action: 'mark_paid', chargeId: c.id }, 'Marked paid.')} style={btn(C.green)}>MARK PAID</button>}
          </div>
        ))}
      </div>
    </>
  )
}
const confirmEnd = () => typeof window !== 'undefined' && window.confirm('End this membership now? Plus is removed and future stays stay booked until you cancel them.')

function Stays({ d, act, busy }: any) {
  const upcoming = d.stays.filter((x: any) => ['confirmed', 'requested'].includes(x.status))
  return (
    <>
      <p style={{ ...small, marginBottom: 14 }}>Upcoming and recent stays. Door codes show here only. They’re live codes, so never paste them into a group chat.</p>
      {upcoming.length === 0 && <div style={small}>No upcoming stays.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {d.stays.map((x: any) => (
          <div key={x.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{x.who} · {x.check_in} → {x.check_out}</div>
                <div style={small}>{x.visibility === 'private' ? 'Private' : x.visibility === 'any' ? 'Open to any member (with approval)' : `Shared with ${x.share_with?.length || 0} chosen`} · {x.nights_cost} bank nights{x.extra_nights ? ` + ${x.extra_nights} extra (${money(x.extra_cents)})` : ''}</div>
                {x.door_code && <div style={{ ...small, color: C.gold }}>Door code: {x.door_code}</div>}
              </div>
              <Pill s={x.status} />
            </div>
            {['confirmed', 'requested'].includes(x.status) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button disabled={busy} onClick={() => act({ action: 'cancel_stay', stayId: x.id, refund: true }, 'Cancelled, nights returned.')} style={btn(C.amber)}>CANCEL + RETURN NIGHTS</button>
                <button disabled={busy} onClick={() => act({ action: 'cancel_stay', stayId: x.id, refund: false }, 'Cancelled.')} style={btn(C.red)}>CANCEL, KEEP NIGHTS</button>
                {x.status === 'confirmed' && !x.door_code && <button disabled={busy || !d.doorReady || !d.settings.door_codes_enabled} onClick={() => act({ action: 'mint_code', stayId: x.id }, 'Door code made.')} style={btn(C.gold)}>MAKE DOOR CODE</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function House({ d }: any) {
  const h = d.house
  const List = ({ title, rows, render }: any) => (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.14em', fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? <div style={small}>None.</div> : rows.map(render)}
    </div>
  )
  return (
    <>
      <p style={{ ...small, marginBottom: 14 }}>The next 7 days at the house (Mexico City dates). This is the view to share with the resident manager.</p>
      <List title="IN THE HOUSE NOW" rows={h.inHouse} render={(x: any) => <div key={x.id} style={small}>{x.nomad_memberships?.name} · until {x.check_out}</div>} />
      <List title="ARRIVING" rows={h.arrivals} render={(x: any) => <div key={x.id} style={small}>{x.check_in} · {x.nomad_memberships?.name} · {x.check_in} → {x.check_out}</div>} />
      <List title="LEAVING (CLEANING DUE)" rows={h.departures} render={(x: any) => <div key={x.id} style={small}>{x.check_out} · {x.nomad_memberships?.name}</div>} />
      <List title="VISITORS REGISTERED" rows={h.visitors} render={(v: any) => <div key={v.id} style={small}>{v.day} · {v.name}{v.role ? ` (${v.role})` : ''}{v.phone ? ` · ${v.phone}` : ''} · guest of {v.host}</div>} />
      <List title="STUDIO ROOM" rows={h.blocks} render={(b: any) => <div key={b.id} style={small}>{b.day} · {b.start_hour}:00–{b.start_hour + b.hours}:00 · {b.who}</div>} />
    </>
  )
}

function Settings({ d, act, busy }: any) {
  const [s, setS] = useState<any>(d.settings)
  const [ranges, setRanges] = useState<string>((d.settings.busy_ranges || []).map((r: any) => `${r.start} ${r.end} ${r.label || ''}`.trim()).join('\n'))
  const num = (k: string, label: string, hint?: string, cents = false) => (
    <label key={k} style={{ display: 'block', marginBottom: 12 }}>
      <div style={small}>{label}{hint ? ` · ${hint}` : ''}</div>
      <input type="number" value={cents ? (s[k] ?? 0) / 100 : s[k] ?? 0} onChange={e => setS((x: any) => ({ ...x, [k]: cents ? Math.round(Number(e.target.value) * 100) : Number(e.target.value) }))} style={{ ...input, width: 140 }} />
    </label>
  )
  function save() {
    const busy_ranges = ranges.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [start, end, ...rest] = l.split(/\s+/); return { start, end, label: rest.join(' ') } })
    act({ action: 'settings', settings: { ...s, busy_ranges } }, 'Settings saved.')
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Money and nights</div>
        {num('dues_cents', 'Monthly dues ($)', 'locked rates override this', true)}
        {num('nights_per_month', 'Nights added each month')}
        {num('night_cap', 'Most nights a bank can hold')}
        {num('extra_night_cents', 'Extra night price ($)', 'past the bank', true)}
        {num('busy_multiplier', 'Busy-date multiplier', '2 = a busy night costs 2')}
        {num('past_due_grace_days', 'Days unpaid before pausing')}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Stays</div>
        {num('max_nights_per_stay', 'Max nights per stay')}
        {num('max_members_at_once', 'Max members in the house')}
        {num('booking_window_days', 'Book this many days ahead')}
        {num('second_stay_lead_days', 'Next stay opens when the current one is within (days)')}
        {num('free_cancel_days', 'Free cancellation (days before)')}
        {num('check_in_hour', 'Check-in hour (Mexico City, 24h)')}
        {num('check_out_hour', 'Check-out hour')}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Studio and visitors</div>
        {num('studio_block_hours', 'Studio block length (hours)')}
        {num('studio_open_hour', 'Studio opens (hour)')}
        {num('studio_close_hour', 'Studio closes (hour)')}
        {num('max_visitors_per_day', 'Visitors per day (whole house)')}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>House</div>
        <label style={{ display: 'block', marginBottom: 12 }}><div style={small}>Name</div><input value={s.house_name} onChange={e => setS((x: any) => ({ ...x, house_name: e.target.value }))} style={{ ...input, width: '100%' }} /></label>
        <label style={{ display: 'block', marginBottom: 12 }}><div style={small}>Address (members only see it while active)</div><input value={s.house_address} onChange={e => setS((x: any) => ({ ...x, house_address: e.target.value }))} style={{ ...input, width: '100%' }} /></label>
        <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input type="checkbox" checked={!!s.door_codes_enabled} onChange={e => setS((x: any) => ({ ...x, door_codes_enabled: e.target.checked }))} /> Make door codes for confirmed stays
        </label>
        <div style={{ ...small, color: d.doorReady ? C.green : C.amber, marginBottom: 12 }}>{d.doorReady ? 'Lock paired (NOMAD_IGLOOHOME_DEVICE_ID set).' : 'No lock yet: add NOMAD_IGLOOHOME_DEVICE_ID in Vercel once the house lock is paired.'}</div>
        <div style={small}>Busy dates: one per line, “start end label”, e.g. 2027-03-20 2027-03-27 Fashion week</div>
        <textarea value={ranges} onChange={e => setRanges(e.target.value)} rows={4} style={{ ...input, width: '100%', fontSize: 14 }} />
      </div>
      <div><button disabled={busy} onClick={save} style={btn(C.gold, true)}>SAVE SETTINGS</button></div>
    </div>
  )
}

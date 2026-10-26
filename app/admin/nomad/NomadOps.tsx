'use client'
// Nomad admin: Members · Stays · This week · Houses · Settings (2026-10-25).
// Rendered by app/admin/nomad/page.tsx next to the Applications tab.
// Houses (migration 175): each house has its own time zone, lock and any rule
// that differs from the program defaults in Settings.
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

export default function NomadOps({ section }: { section: 'members' | 'stays' | 'house' | 'houses' | 'settings' | 'flights' | 'credit' }) {
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
      {section === 'houses' && <Houses d={d} act={act} busy={busy} />}
      {section === 'settings' && <Settings d={d} act={act} busy={busy} />}
      {section === 'flights' && <Flights d={d} act={act} busy={busy} />}
      {section === 'credit' && <CreditLog d={d} act={act} busy={busy} />}
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
                <div style={small}>Flights: <strong style={{ color: C.text }}>{m.flights_enabled ? 'ON' : 'off'}</strong>{m.flights_next !== null && m.flights_next !== undefined ? ` (turns ${m.flights_next ? 'on' : 'off'} at renewal)` : ''} · flight credit <strong style={{ color: C.text }}>{money(m.flight_balance)}</strong>{m.flight_paused ? ' · add-on paused (credit full)' : ''}</div>
                <div style={small}>{d.settings.model !== 'bank' ? 'This month’s trip' : 'Night bank'}: <strong style={{ color: C.text }}>{d.settings.model !== 'bank' ? (m.balance >= d.settings.nights_per_month ? 'not booked' : 'booked') : m.balance}</strong> · last charge: {m.last_charge ? `${money(m.last_charge.amount_cents)} ${m.last_charge.status} ${day(m.last_charge.created_at)}` : 'none'}</div>
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
              <button disabled={busy} onClick={() => act({ action: 'set_flights', id: m.id, on: !m.flights_enabled }, m.flights_enabled ? 'Flights off (from now).' : 'Flights on (from now).')} style={btn(C.text)}>{m.flights_enabled ? 'FLIGHTS OFF NOW' : 'FLIGHTS ON NOW'}</button>
              <input placeholder="± flight $" value={adj['f' + m.id] ?? ''} onChange={e => setAdj(x => ({ ...x, ['f' + m.id]: e.target.value }))} style={{ ...input, width: 100, padding: '5px 8px' }} />
              <button disabled={busy || !adj['f' + m.id]} onClick={() => act({ action: 'flight_adjust', id: m.id, deltaCents: Math.round(Number(adj['f' + m.id]) * 100), note: 'admin adjustment' }, 'Flight credit adjusted.').then(ok => ok && setAdj(x => ({ ...x, ['f' + m.id]: '' })))} style={btn(C.text)}>ADJUST FLIGHT CREDIT</button>
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
            <span>{day(c.created_at)}</span><span>{c.who}</span><span>{c.kind === 'dues' ? (c.flight_cents ? 'Dues + flights' : 'Dues') : c.kind === 'flight_difference' ? 'Flight difference' : 'Extra nights'}</span><span>{money(c.amount_cents)}</span><Pill s={c.status === 'charged' || c.status === 'paid_link' ? 'confirmed' : c.status === 'link_sent' ? 'requested' : 'cancelled'} /><span>{c.status.replace('_', ' ')}{c.error ? ` · ${c.error}` : ''}</span>
            {['link_sent', 'failed'].includes(c.status) && c.kind === 'dues' && <button disabled={busy} onClick={() => act({ action: 'mark_paid', chargeId: c.id }, 'Marked paid.')} style={btn(C.green)}>MARK PAID</button>}
          </div>
        ))}
      </div>
    </>
  )
}
const confirmEnd = () => typeof window !== 'undefined' && window.confirm('End this membership now? Plus is removed and their future stays are cancelled. An unused month and any leftover flight credit become studio credit.')

function HousePicker({ d, value, onChange, all = true }: any) {
  if ((d.houses || []).length < 2) return null
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...input, marginBottom: 14 }}>
      {all && <option value="" style={{ background: C.card, color: C.text }}>All houses</option>}
      {d.houses.map((h: any) => <option key={h.id} value={h.id} style={{ background: C.card, color: C.text }}>{h.name}{h.active ? '' : ' (closed)'}</option>)}
    </select>
  )
}

function Stays({ d, act, busy }: any) {
  const [houseId, setHouseId] = useState('')
  const rows = d.stays.filter((x: any) => !houseId || x.house_id === houseId)
  const upcoming = rows.filter((x: any) => ['confirmed', 'requested'].includes(x.status))
  const multi = (d.houses || []).length > 1
  const houseOf = (id: string) => (d.houses || []).find((h: any) => h.id === id)
  return (
    <>
      <p style={{ ...small, marginBottom: 14 }}>Upcoming and recent stays. Door codes show here only. They’re live codes, so never paste them into a group chat.</p>
      <HousePicker d={d} value={houseId} onChange={setHouseId} />
      {upcoming.length === 0 && <div style={small}>No upcoming stays.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((x: any) => (
          <div key={x.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{x.who} · {x.check_in} → {x.check_out}</div>
                {multi && <div style={{ ...small, color: C.gold }}>{x.house}</div>}
                <div style={small}>{x.visibility === 'private' ? 'Private' : x.visibility === 'any' ? 'Open to any member (with approval)' : `Shared with ${x.share_with?.length || 0} chosen`} · {x.nights_cost} bank nights{x.extra_nights ? ` + ${x.extra_nights} extra (${money(x.extra_cents)})` : ''}</div>
                {x.door_code && <div style={{ ...small, color: C.gold }}>Door code: {x.door_code}</div>}
              </div>
              <Pill s={x.status} />
            </div>
            {x.checkout && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...small, color: C.green }}>Checked out {day(x.checkout.at)} · checklist complete{x.checkout.notes ? ` · “${x.checkout.notes}”` : ''}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {x.checkout.photos.map((u: string, i: number) => <a key={i} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.line}` }} /></a>)}
                </div>
              </div>
            )}
            {!x.checkout && x.status === 'confirmed' && x.check_out < d.today && <div style={{ ...small, color: C.amber, marginTop: 8 }}>No check-out submitted.</div>}
            {['confirmed', 'requested'].includes(x.status) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button disabled={busy} onClick={() => act({ action: 'cancel_stay', stayId: x.id, refund: true }, 'Cancelled, nights returned.')} style={btn(C.amber)}>CANCEL + RETURN NIGHTS</button>
                <button disabled={busy} onClick={() => act({ action: 'cancel_stay', stayId: x.id, refund: false }, 'Cancelled.')} style={btn(C.red)}>CANCEL, KEEP NIGHTS</button>
                {x.status === 'confirmed' && !x.door_code && <button disabled={busy || !houseOf(x.house_id)?.doorReady || !houseOf(x.house_id)?.doorCodesOn} onClick={() => act({ action: 'mint_code', stayId: x.id }, 'Door code made.')} style={btn(C.gold)}>MAKE DOOR CODE</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function House({ d }: any) {
  const [houseId, setHouseId] = useState(d.houses?.[0]?.id || '')
  const house = (d.houses || []).find((x: any) => x.id === houseId) || d.houses?.[0]
  if (!house) return <div style={small}>No houses yet. Add one in the Houses tab.</div>
  const h = house.week
  const List = ({ title, rows, render }: any) => (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={{ fontSize: 12, letterSpacing: '0.14em', fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? <div style={small}>None.</div> : rows.map(render)}
    </div>
  )
  return (
    <>
      <HousePicker d={d} value={house.id} onChange={setHouseId} all={false} />
      <p style={{ ...small, marginBottom: 14 }}>The next 7 days at {house.name} ({house.city} dates, today is {house.today}). This is the view to share with the resident manager.</p>
      <List title="IN THE HOUSE NOW" rows={h.inHouse} render={(x: any) => <div key={x.id} style={small}>{x.nomad_memberships?.name} · until {x.check_out}</div>} />
      <List title="ARRIVING" rows={h.arrivals} render={(x: any) => <div key={x.id} style={small}>{x.check_in} · {x.nomad_memberships?.name} · {x.check_in} → {x.check_out}</div>} />
      <List title="LEAVING (CLEANING DUE)" rows={h.departures} render={(x: any) => <div key={x.id} style={small}>{x.check_out} · {x.nomad_memberships?.name}</div>} />
      <List title="VISITORS REGISTERED" rows={h.visitors} render={(v: any) => <div key={v.id} style={small}>{v.day} · {v.name}{v.role ? ` (${v.role})` : ''}{v.phone ? ` · ${v.phone}` : ''} · guest of {v.host}</div>} />
      {house.has_studio && d.settings.model === 'bank' && <List title="STUDIO ROOM" rows={h.blocks} render={(b: any) => <div key={b.id} style={small}>{b.day} · {b.start_hour}:00–{b.start_hour + b.hours}:00 · {b.who}</div>} />}
    </>
  )
}

// Locked by the simple model (mirror of SIMPLE_LOCKED_KEYS in lib/nomad.ts).
const SIMPLE_LOCKED = ['night_cap', 'extra_night_cents', 'busy_multiplier', 'busy_ranges', 'max_members_at_once']

function Settings({ d, act, busy }: any) {
  // Edit the SAVED values, so the bank-model numbers survive while simple is on.
  const raw = d.rawSettings || d.settings
  const [s, setS] = useState<any>({ ...raw, model: raw.model === 'bank' ? 'bank' : 'simple' })
  const simple = s.model !== 'bank'
  const [ranges, setRanges] = useState<string>((raw.busy_ranges || []).map((r: any) => `${r.start} ${r.end} ${r.label || ''}`.trim()).join('\n'))
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
    <>
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Program model</div>
      <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, cursor: 'pointer' }}>
        <input type="radio" name="nomad-model" checked={simple} onChange={() => setS((x: any) => ({ ...x, model: 'simple' }))} style={{ marginTop: 3 }} />
        <span><strong style={{ color: C.text }}>Simple</strong> · one member in the house at a time, flat monthly price, the nights below every month with no rollover, no extra nights, every night counts as one.</span>
      </label>
      <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
        <input type="radio" name="nomad-model" checked={!simple} onChange={() => setS((x: any) => ({ ...x, model: 'bank' }))} style={{ marginTop: 3 }} />
        <span><strong style={{ color: C.text }}>Night bank</strong> · the original: nights roll over up to a cap, paid extra nights, busy dates, members can share stays.</span>
      </label>
    </div>
    <p style={{ ...small, marginBottom: 14 }}>Program defaults. Membership money and the night bank apply everywhere. The stay, studio and visitor rules are the default for every house, and a house can set its own in the Houses tab.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Money and nights</div>
        {num('dues_cents', 'Monthly dues ($)', 'locked rates override this', true)}
        {num('nights_per_month', simple ? 'Nights included each month' : 'Nights added each month', simple ? 'reset every renewal' : undefined)}
        {!simple && num('night_cap', 'Most nights a bank can hold')}
        {!simple && num('extra_night_cents', 'Extra night price ($)', 'past the bank', true)}
        {!simple && num('busy_multiplier', 'Busy-date multiplier', '2 = a busy night costs 2')}
        {num('past_due_grace_days', 'Days unpaid before pausing')}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Stays</div>
        {num('max_nights_per_stay', 'Max nights per stay')}
        {!simple && num('max_members_at_once', 'Max members in the house')}
        {num('booking_window_days', 'Book this many days ahead')}
        {num('second_stay_lead_days', 'Next stay opens when the current one is within (days)')}
        {num('free_cancel_days', 'Free cancellation (days before)')}
        {num('check_in_hour', 'Check-in hour (house time, 24h)')}
        {num('check_out_hour', 'Check-out hour')}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Flights add-on</div>
        <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}><input type="checkbox" checked={s.flights_offered !== false} onChange={e => setS((x: any) => ({ ...x, flights_offered: e.target.checked }))} /> Offer Nomad + Flights</label>
        {num('flight_addon_cents', 'Add-on price per month ($)', undefined, true)}
        {num('flight_credit_cents', 'Of which goes to flight credit ($)', 'the rest is the handling fee', true)}
        {num('flight_credit_cap_cents', 'Flight credit cap ($)', 'add-on pauses while full', true)}
        {num('flight_request_lead_days', 'Flight requests close (days before check-in)')}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Studio credit from Nomad</div>
        <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}><input type="checkbox" checked={s.unused_to_studio_credit !== false} onChange={e => setS((x: any) => ({ ...x, unused_to_studio_credit: e.target.checked }))} style={{ marginTop: 3 }} /> A paid month with no trip comes back as studio credit. Simple model only.</label>
        {num('unused_credit_percent', 'Unused month: % returned as studio credit', 'the rest stays with Nomad')}
        {num('studio_credit_expiry_days', 'Nomad studio credit expires after (days)', '0 = never')}
        {num('stay_min_lead_days', 'Stays need at least (days’ notice)')}
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Studio and visitors</div>
        {num('studio_block_hours', 'Studio block length (hours)')}
        {num('studio_open_hour', 'Studio opens (hour)')}
        {num('studio_close_hour', 'Studio closes (hour)')}
        {num('max_visitors_per_day', 'Visitors per day (whole house)')}
      </div>
      {!simple && <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Busy dates (default)</div>
        <div style={small}>One per line, “start end label”, e.g. 2027-03-20 2027-03-27 Fashion week. A house can list its own instead.</div>
        <textarea value={ranges} onChange={e => setRanges(e.target.value)} rows={4} style={{ ...input, width: '100%', fontSize: 14 }} />
      </div>}
      <div><button disabled={busy} onClick={save} style={btn(C.gold, true)}>SAVE SETTINGS</button></div>
    </div>
    </>
  )
}

// ── Houses ────────────────────────────────────────────────────────────────
const OVERRIDE_LABELS: Record<string, [string, boolean?]> = {
  extra_night_cents: ['Extra night price ($)', true], busy_multiplier: ['Busy-date multiplier'],
  max_nights_per_stay: ['Max nights per stay'], max_members_at_once: ['Max members in the house'],
  booking_window_days: ['Book this many days ahead'], free_cancel_days: ['Free cancellation (days before)'],
  check_in_hour: ['Check-in hour (24h)'], check_out_hour: ['Check-out hour'],
  studio_block_hours: ['Studio block length (hours)'], studio_open_hour: ['Studio opens (hour)'], studio_close_hour: ['Studio closes (hour)'],
  max_visitors_per_day: ['Visitors per day'],
}
const rangesToText = (r: any[]) => (r || []).map((x: any) => `${x.start} ${x.end} ${x.label || ''}`.trim()).join('\n')
const textToRanges = (txt: string) => txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [start, end, ...rest] = l.split(/\s+/); return { start, end, label: rest.join(' ') } })

function Houses({ d, act, busy }: any) {
  const [adding, setAdding] = useState(false)
  const [n, setN] = useState({ name: '', city: '', slug: '', timezone: 'America/Los_Angeles' })
  return (
    <>
      <p style={{ ...small, marginBottom: 14 }}>Each house runs on its own time zone and calendar. Members use one membership and one night bank at every open house. Leave a rule blank to use the program default from Settings. New houses start closed; open one when it’s ready to book.</p>
      <div style={{ display: 'grid', gap: 14 }}>
        {(d.houses || []).map((h: any) => <HouseCard key={h.id} h={h} d={d} act={act} busy={busy} />)}
      </div>
      <div style={{ marginTop: 18 }}>
        {!adding && <button onClick={() => setAdding(true)} style={btn(C.gold)}>+ ADD A HOUSE</button>}
        {adding && (
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>New house</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label><div style={small}>Name</div><input value={n.name} onChange={e => setN(x => ({ ...x, name: e.target.value }))} placeholder="Nomad House, Los Angeles" style={{ ...input, width: 240 }} /></label>
              <label><div style={small}>City</div><input value={n.city} onChange={e => setN(x => ({ ...x, city: e.target.value }))} placeholder="Los Angeles" style={{ ...input, width: 160 }} /></label>
              <label><div style={small}>Short code (permanent)</div><input value={n.slug} onChange={e => setN(x => ({ ...x, slug: e.target.value }))} placeholder="la" style={{ ...input, width: 100 }} /></label>
              <label><div style={small}>Time zone</div><TzSelect d={d} value={n.timezone} onChange={(v: string) => setN(x => ({ ...x, timezone: v }))} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button disabled={busy} onClick={() => act({ action: 'house_save', house: n }, 'House added (closed for now).').then(ok => { if (ok) { setAdding(false); setN({ name: '', city: '', slug: '', timezone: 'America/Los_Angeles' }) } })} style={btn(C.gold, true)}>ADD HOUSE</button>
              <button onClick={() => setAdding(false)} style={btn(C.dim)}>CANCEL</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function TzSelect({ d, value, onChange }: any) {
  const list: string[] = Array.from(new Set([value, ...(d.timezones || [])].filter(Boolean)))
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={input}>
      {list.map(z => <option key={z} value={z} style={{ background: C.card, color: C.text }}>{z.replace(/_/g, ' ')}</option>)}
    </select>
  )
}

function HouseCard({ h, d, act, busy }: any) {
  const [f, setF] = useState<any>({ name: h.name, city: h.city, timezone: h.timezone, address: h.address || '', lock_device_id: h.lock_device_id || '', active: h.active, has_studio: h.has_studio, sort: h.sort })
  // Door codes: start from what the house actually does, and always save an explicit yes/no.
  const [o, setO] = useState<any>({ ...(h.overrides || {}), door_codes_enabled: h.doorCodesOn === true })
  const [ranges, setRanges] = useState<string>(rangesToText(h.overrides?.busy_ranges))
  const def = d.settings
  const field = (k: string) => {
    const [label, cents] = OVERRIDE_LABELS[k]
    const v = o[k]
    const shown = v === undefined || v === null || v === '' ? '' : cents ? Number(v) / 100 : v
    const placeholder = String(cents ? Number(def[k]) / 100 : def[k])
    return (
      <label key={k} style={{ display: 'block', marginBottom: 10 }}>
        <div style={small}>{label}</div>
        <input type="number" value={shown} placeholder={placeholder} onChange={e => setO((x: any) => ({ ...x, [k]: e.target.value === '' ? '' : cents ? Math.round(Number(e.target.value) * 100) : Number(e.target.value) }))} style={{ ...input, width: 120 }} />
      </label>
    )
  }
  function save() {
    const overrides: any = { ...o }
    for (const k of Object.keys(overrides)) if (overrides[k] === '' || overrides[k] === null) delete overrides[k]
    overrides.door_codes_enabled = o.door_codes_enabled === true
    const r = textToRanges(ranges)
    if (r.length) overrides.busy_ranges = r; else delete overrides.busy_ranges
    act({ action: 'house_save', house: { id: h.id, ...f, overrides } }, `${f.name} saved.`)
  }
  const isFirst = h.slug === 'cdmx'
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{h.name}</div>
          <div style={small}>Code “{h.slug}” · today there is {h.today}</div>
        </div>
        <span style={{ ...btn(h.active ? C.green : C.dim, true), cursor: 'default', padding: '3px 8px' }}>{h.active ? 'OPEN' : 'CLOSED'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 10 }}><div style={small}>Name</div><input value={f.name} onChange={e => setF((x: any) => ({ ...x, name: e.target.value }))} style={{ ...input, width: '100%' }} /></label>
          <label style={{ display: 'block', marginBottom: 10 }}><div style={small}>City</div><input value={f.city} onChange={e => setF((x: any) => ({ ...x, city: e.target.value }))} style={{ ...input, width: '100%' }} /></label>
          <label style={{ display: 'block', marginBottom: 10 }}><div style={small}>Time zone</div><TzSelect d={d} value={f.timezone} onChange={(v: string) => setF((x: any) => ({ ...x, timezone: v }))} /></label>
          <label style={{ display: 'block', marginBottom: 10 }}><div style={small}>Address (members see it only while active)</div><input value={f.address} onChange={e => setF((x: any) => ({ ...x, address: e.target.value }))} style={{ ...input, width: '100%' }} /></label>
          <label style={{ display: 'block', marginBottom: 10 }}><div style={small}>igloohome lock device ID{isFirst ? ' (blank = the NOMAD_IGLOOHOME_DEVICE_ID in Vercel)' : ''}</div><input value={f.lock_device_id} onChange={e => setF((x: any) => ({ ...x, lock_device_id: e.target.value }))} style={{ ...input, width: '100%' }} /></label>
          <div style={{ ...small, color: h.doorReady ? C.green : C.amber, marginBottom: 10 }}>{h.doorReady ? 'Lock paired.' : 'No lock yet. Door codes start once a lock is added and turned on below.'}</div>
          <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><input type="checkbox" checked={!!f.active} onChange={e => setF((x: any) => ({ ...x, active: e.target.checked }))} /> Open for booking</label>
          <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><input type="checkbox" checked={f.has_studio !== false} onChange={e => setF((x: any) => ({ ...x, has_studio: e.target.checked }))} /> Has a studio room</label>
          <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><input type="checkbox" checked={o.door_codes_enabled === true} onChange={e => setO((x: any) => ({ ...x, door_codes_enabled: e.target.checked }))} /> Make door codes for confirmed stays</label>
        </div>
        <div>
          <div style={{ ...small, marginBottom: 8, color: C.text }}>House rules (blank = program default, shown faded)</div>
          {Object.keys(OVERRIDE_LABELS).filter(k => (h.has_studio !== false || !k.startsWith('studio_')) && (def.model === 'bank' || !SIMPLE_LOCKED.includes(k))).map(field)}
          {def.model === 'bank' && <>
          <div style={small}>Busy dates for this house (blank = program default)</div>
          <textarea value={ranges} onChange={e => setRanges(e.target.value)} rows={3} placeholder={rangesToText(def.busy_ranges)} style={{ ...input, width: '100%', fontSize: 14 }} />
          </>}
        </div>
      </div>
      <button disabled={busy} onClick={save} style={{ ...btn(C.gold, true), marginTop: 12 }}>SAVE HOUSE</button>
    </div>
  )
}

// ── Flights queue (2026-10-26) ───────────────────────────────────────────
const PREF_LABEL: Record<string, string> = { either: 'IAH or Hobby', IAH: 'IAH', HOU: 'Hobby', any: 'any time', morning: 'morning', afternoon: 'afternoon', evening: 'evening' }
function Flights({ d, act, busy }: any) {
  const reqs: any[] = d.flightRequests || []
  const open = reqs.filter(r => ['requested', 'options_sent', 'chosen'].includes(r.status))
  const done = reqs.filter(r => !['requested', 'options_sent', 'chosen'].includes(r.status))
  return (
    <>
      <p style={{ ...small, marginBottom: 14 }}>Members on Nomad + Flights request flights for a confirmed stay. Send 1 to 4 options, they pick one, you book it (main cabin, their name exactly as on their passport, their email on the booking) and mark it booked. The fare comes off their flight credit and anything above it is charged to their Nomad card.</p>
      {open.length === 0 && <div style={small}>No open flight requests.</div>}
      <div style={{ display: 'grid', gap: 12 }}>{open.map(r => <FlightCard key={r.id} r={r} act={act} busy={busy} city={(d.houses || []).find((h: any) => h.id === r.stay?.house_id)?.city || 'Mexico City'} />)}</div>
      {done.length > 0 && <>
        <h3 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, margin: '26px 0 10px' }}>RECENT</h3>
        <div style={{ display: 'grid', gap: 6 }}>
          {done.map(r => (
            <div key={r.id} style={{ ...small, color: 'rgba(255,255,255,0.75)' }}>
              {day(r.created_at)} · {r.who} · {r.stay ? `${r.stay.check_in} → ${r.stay.check_out}` : ''} · <strong>{r.status}</strong>
              {r.status === 'booked' && ` · ${r.confirmation} · ${money(r.cost_cents)} (${money(r.credit_used_cents)} credit${r.charged_cents ? `, ${money(r.charged_cents)} card` : ''}${r.cost_cents - r.credit_used_cents - r.charged_cents > 0 ? `, ${money(r.cost_cents - r.credit_used_cents - r.charged_cents)} NOT COLLECTED` : ''})`}
            </div>
          ))}
        </div>
      </>}
    </>
  )
}

/** Google Flights, pre-filled: Houston airport(s) → the house's city, the stay's dates, round trip. */
function googleFlightsUrl(r: any, city: string) {
  const p = r.prefs || {}
  const from = p.airport === 'IAH' ? 'IAH' : p.airport === 'HOU' ? 'HOU' : 'Houston'
  const q = `Flights from ${from} to ${city} on ${r.stay?.check_in} through ${r.stay?.check_out}`
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`
}

function FlightCard({ r, act, busy, city }: any) {
  const p = r.prefs || {}
  const [opts, setOpts] = useState<{ label: string; price: string }[]>(
    (r.options || []).length ? r.options.map((o: any) => ({ label: o.label, price: String(o.price_cents / 100) })) : [{ label: '', price: '' }, { label: '', price: '' }])
  const [note, setNote] = useState(r.admin_note || '')
  const [cost, setCost] = useState(r.status === 'chosen' && r.options?.[r.chosen_index] ? String(r.options[r.chosen_index].price_cents / 100) : '')
  const [conf, setConf] = useState('')
  const chosen = r.status === 'chosen' ? r.options?.[r.chosen_index] : null
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{r.who} · {r.stay ? `${r.stay.check_in} → ${r.stay.check_out}` : 'stay removed'}</div>
          <div style={small}>{r.email} · flight credit <strong style={{ color: C.text }}>{money(r.flight_balance)}</strong></div>
          <div style={small}>Wants: {PREF_LABEL[p.airport] || p.airport} · out {PREF_LABEL[p.out_time] || 'any'} · back {PREF_LABEL[p.back_time] || 'any'} · {p.bag ? 'checked bag' : 'no bag'}{p.airline ? ` · prefers ${p.airline}` : ''}{p.ff_number ? ` · FF# ${p.ff_number}` : ''}</div>
          {p.notes && <div style={small}>“{p.notes}”</div>}
          {r.stay && r.status !== 'chosen' && (
            <a href={googleFlightsUrl(r, city)} target="_blank" rel="noopener noreferrer" style={{ ...btn(C.gold), display: 'inline-block', marginTop: 10, textDecoration: 'none' }}>SEARCH GOOGLE FLIGHTS ↗</a>
          )}
        </div>
        <Pill s={r.status === 'chosen' ? 'confirmed' : r.status === 'options_sent' ? 'requested' : 'pending'} />
      </div>

      {chosen ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...small, color: C.green }}>They picked: {chosen.label} · {money(chosen.price_cents)}. Book it, then mark it booked.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            <input placeholder="Final cost $" value={cost} onChange={e => setCost(e.target.value)} style={{ ...input, width: 120 }} />
            <input placeholder="Confirmation #" value={conf} onChange={e => setConf(e.target.value)} style={{ ...input, width: 160 }} />
            <button disabled={busy || !cost || !conf} onClick={() => act({ action: 'flight_booked', requestId: r.id, costCents: Math.round(Number(cost) * 100), confirmation: conf }, 'Booked. Credit deducted and the member was emailed.')} style={btn(C.green, true)}>MARK BOOKED</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...small, marginBottom: 6 }}>{r.status === 'options_sent' ? 'Options sent. Waiting for them to pick (you can edit and resend).' : 'Options to send'}</div>
          {opts.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <input placeholder="e.g. United 1234 IAH 7:05am → MEX · back UA 1235 6:40pm · bag incl." value={o.label} onChange={e => setOpts(x => x.map((y, j) => j === i ? { ...y, label: e.target.value } : y))} style={{ ...input, flex: '1 1 320px' }} />
              <input placeholder="$" value={o.price} onChange={e => setOpts(x => x.map((y, j) => j === i ? { ...y, price: e.target.value } : y))} style={{ ...input, width: 90 }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {opts.length < 4 && <button onClick={() => setOpts(x => [...x, { label: '', price: '' }])} style={btn(C.text)}>+ OPTION</button>}
            <input placeholder="Note to member (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ ...input, flex: '1 1 220px' }} />
            <button disabled={busy} onClick={() => act({ action: 'flight_options', requestId: r.id, note, options: opts.map(o => ({ label: o.label, price_cents: Math.round(Number(o.price) * 100) })) }, 'Options sent to the member.')} style={btn(C.gold, true)}>SEND OPTIONS</button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button disabled={busy} onClick={() => { if (window.confirm('Cancel this flight request?')) act({ action: 'flight_cancel', requestId: r.id }, 'Request cancelled.') }} style={btn(C.red)}>CANCEL REQUEST</button>
      </div>
    </div>
  )
}

// ── Nomad → studio money log (2026-10-26) ────────────────────────────────
function CreditLog({ d, act, busy }: any) {
  const L = d.moneyLog || { months: [], transfers: [] }
  const owed = (L.months || []).reduce((n: number, m: any) => n + m.owed_cents, 0)
  const [amt, setAmt] = useState<Record<string, string>>({})
  return (
    <>
      <p style={{ ...small, marginBottom: 14 }}>Studio credit that came from Nomad (unused months and leftover flight credit) is paid for by the Nomad account. When a member spends it on a Houston booking, that amount belongs to the studio. Move it from the Nomad bank account to the studio account, then mark it here so it isn’t counted twice. Nomad credit is counted as spent first when a member also has other studio credit.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[['Owed to studio now', money(owed)], ['Spent at the studio (all time)', money(L.used_cents)], ['Transferred (all time)', money(L.transferred_cents)], ['Issued, not spent yet', money(L.unspent_cents)]].map(([k, v]) => (
          <div key={k} style={card}><div style={small}>{k}</div><div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 26 }}>{v}</div></div>
        ))}
      </div>
      <h3 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, margin: '6px 0 10px' }}>BY MONTH</h3>
      {(L.months || []).length === 0 && <div style={small}>No Nomad credit has been spent at the studio yet.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {(L.months || []).map((m: any) => (
          <div key={m.month} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{m.month}</div>
              <div style={small}>Spent at studio {money(m.used_cents)} · transferred {money(m.transferred_cents)} · <strong style={{ color: m.owed_cents ? C.amber : C.green }}>{m.owed_cents ? `owed ${money(m.owed_cents)}` : 'settled'}</strong></div>
            </div>
            {m.owed_cents > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input placeholder={String(m.owed_cents / 100)} value={amt[m.month] ?? ''} onChange={e => setAmt(x => ({ ...x, [m.month]: e.target.value }))} style={{ ...input, width: 100 }} />
                <button disabled={busy} onClick={() => act({ action: 'transfer_mark', month: m.month, amountCents: Math.round(Number(amt[m.month] || m.owed_cents / 100) * 100) }, 'Transfer recorded.').then(ok => ok && setAmt(x => ({ ...x, [m.month]: '' })))} style={btn(C.green, true)}>MARK TRANSFERRED</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {(L.transfers || []).length > 0 && <>
        <h3 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, margin: '26px 0 10px' }}>TRANSFERS</h3>
        {(L.transfers || []).map((t: any) => <div key={t.id} style={small}>{day(t.created_at)} · {t.month} · {money(t.amount_cents)}{t.note ? ` · ${t.note}` : ''}</div>)}
      </>}
    </>
  )
}

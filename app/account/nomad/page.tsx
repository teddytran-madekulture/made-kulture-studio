'use client'
// /account/nomad — the member side of Nomad (2026-10-25): start the membership,
// the night bank, book / share / join stays, studio blocks, visitors.
// HOUSES: every stay belongs to a house. Its dates, hours and rules come from
// that house (d.houses[i], with its own `today`), never the program defaults.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`
const money = (c: number) => `$${(Number(c || 0) / 100).toFixed(Number(c) % 100 ? 2 : 0)}`
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
const fmtIso = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`
/** A house's member-facing settings; falls back to the program defaults. */
const houseOf = (d: any, id?: string) => (d.houses || []).find((h: any) => h.id === id) || { ...d.settings, today: d.today, name: 'the house', city: '', has_studio: true }
const multiHouse = (d: any) => (d.houses || []).length > 1

const T: Record<string, React.CSSProperties> = {
  h1: { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' },
  h2: { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, margin: '0 0 10px', letterSpacing: '0.02em' },
  p: { fontFamily: 'Inter', fontSize: 14, color: muted(0.65), lineHeight: 1.6, margin: '0 0 12px' },
  small: { fontFamily: 'Inter', fontSize: 12, color: muted(0.5), lineHeight: 1.6 },
  label: { fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted(0.5), display: 'block', marginBottom: 6 },
  card: { background: 'var(--t-surface)', border: `1px solid ${muted(0.08)}`, borderRadius: 8, padding: '16px 18px', marginBottom: 14 },
  input: { fontFamily: 'Inter', fontSize: 16, padding: '9px 10px', borderRadius: 6, border: `1px solid ${muted(0.18)}`, background: 'transparent', color: 'var(--t-fg)', colorScheme: 'light dark', boxSizing: 'border-box' },
}
const btn = (primary = false): React.CSSProperties => ({
  fontFamily: 'Inter', fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 6, cursor: 'pointer',
  border: primary ? 'none' : `1px solid ${muted(0.25)}`, background: primary ? 'var(--t-fg)' : 'transparent', color: primary ? 'var(--t-on-fg)' : 'var(--t-fg)',
})
const gold: React.CSSProperties = { fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 4, background: 'rgba(var(--t-gold-rgb), 0.15)', color: 'var(--t-gold)' }

const RULES = [
  'Stays open up to the booking window ahead. Hold one upcoming stay at a time until it’s close.',
  'Two members in the house at once, one per room. A third only on the couch, by agreement.',
  'The studio room books in blocks. When two members are in, each gets one block a day before anyone takes a second.',
  'Register every model or collaborator by the day before. No overnight guests who aren’t members.',
  'Reset the studio after your block. Leave your room ready for the cleaner.',
  'Quiet hours 10 pm to 8 am. Shoots run inside studio hours.',
  'Swimwear, lingerie or implied nudity: closed set, with notice to housemates the day before.',
]

export default function NomadAccountPage() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/account/nomad', { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not load Nomad.'); return }
    setErr(''); setD(j)
  }, [])
  useEffect(() => { load() }, [load])

  async function post(body: Record<string, unknown>, ok = 'Done.') {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/account/nomad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok && !j.needsExtra) setMsg({ ok: false, text: j.error || 'Something went wrong.' })
      else if (!j.needsExtra) { setMsg({ ok: true, text: ok }); await load() }
      return { ok: r.ok, j }
    } finally { setBusy(false) }
  }

  if (err) return <div style={{ ...T.p, color: 'var(--t-err)' }}>{err}</div>
  if (!d) return <div style={T.small}>Loading…</div>

  const m = d.membership
  const houses: any[] = d.houses || []
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={T.h1}>NOMAD</h1>
      <p style={T.p}>{houses.length > 1 ? `Your home bases: ${houses.map(h => h.city).join(' · ')}.` : houses[0] ? `Your home base in ${houses[0].city}.` : 'Your creative home base.'}</p>
      {houses.filter(h => h.address).map(h => <p key={h.id} style={{ ...T.small, margin: '-6px 0 12px' }}>{h.name} · {h.address}</p>)}
      {msg && <div style={{ ...T.card, borderColor: msg.ok ? 'rgba(var(--t-gold-rgb),0.4)' : 'var(--t-err)', color: msg.ok ? 'var(--t-fg)' : 'var(--t-err)', fontFamily: 'Inter', fontSize: 14 }}>{msg.text}</div>}

      {!m && <NotMember d={d} />}
      {m && ['pending', 'ended'].includes(m.status) && <Start d={d} post={post} busy={busy} />}
      {m && m.status === 'starting' && <div style={T.card}><p style={T.p}>Starting your membership… refresh in a moment.</p></div>}
      {m && ['active', 'past_due', 'paused'].includes(m.status) && <Member d={d} post={post} busy={busy} />}
    </div>
  )
}

function NotMember({ d }: any) {
  const a = d.application
  return (
    <div style={T.card}>
      {!a && <p style={T.p}>You haven’t applied yet. <Link href="/nomad" style={{ color: 'var(--t-gold)' }}>Read about Nomad and apply</Link>.</p>}
      {a?.status === 'new' && <p style={T.p}>Your application is in. We’ll reach out personally.</p>}
      {a?.status === 'waitlisted' && <p style={T.p}>You’re on the waitlist. We’ll reach out when a spot opens.</p>}
      {a?.status === 'approved' && <p style={T.p}>You’re approved. Your membership will appear here once the studio sets it up.</p>}
      {a?.status === 'declined' && <p style={T.p}>Thanks for applying. The founding group is set for now.</p>}
    </div>
  )
}

function CardPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [cards, setCards] = useState<any[] | null>(null)
  useEffect(() => {
    fetch('/api/account/cards?dedupe=1', { cache: 'no-store' }).then(r => r.json()).then(j => {
      const list = (j.cards ?? []) as any[]
      setCards(list)
      if (!value && list[0]) onChange(list[0].id)
    }).catch(() => setCards([]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cards) return <div style={T.small}>Loading your cards…</div>
  if (!cards.length) return <div style={T.p}>No saved card yet. <Link href="/account/payment" style={{ color: 'var(--t-gold)' }}>Add one in Payment methods</Link>, then come back.</div>
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...T.input, width: '100%' }}>
      {cards.map(c => <option key={c.id} value={c.id} style={{ background: 'var(--t-surface)', color: 'var(--t-fg)' }}>{c.card_brand} ···· {c.last_4} (exp {c.exp_month}/{String(c.exp_year).slice(-2)})</option>)}
    </select>
  )
}

function Start({ d, post, busy }: any) {
  const s = d.settings
  const open = (d.houses || []).filter((h: any) => h.active)
  // With one house, state its real rules; with several, they differ, and each is shown before booking.
  const h1 = open.length === 1 ? open[0] : null
  const [card, setCard] = useState('')
  const [agree, setAgree] = useState(false)
  return (
    <div style={T.card}>
      <h2 style={T.h2}>Start your membership</h2>
      <p style={T.p}><strong style={{ color: 'var(--t-fg)' }}>{money(s.dues_cents)} a month.</strong> Each paid month adds {s.nights_per_month} nights to your night bank (it holds up to {s.night_cap}). {h1
        ? <>Stays up to {h1.max_nights_per_stay} nights. Extra nights past your bank are {money(h1.extra_night_cents)} each{h1.busy_multiplier > 1 ? `, and busy dates count ${h1.busy_multiplier}× nights` : ''}.</>
        : <>Stay lengths and extra-night prices are set by each house ({open.map((h: any) => h.city).join(', ')}). You’ll see them, and confirm any extra charge, before you book.</>} Made Kulture Plus is included while you’re a member.</p>
      <div style={{ ...T.label, marginTop: 14 }}>House rules</div>
      <ol style={{ ...T.p, paddingLeft: 18 }}>{RULES.map(r => <li key={r} style={{ marginBottom: 4 }}>{r}</li>)}</ol>
      <div style={{ ...T.label, marginTop: 14 }}>Card for Nomad</div>
      <CardPicker value={card} onChange={setCard} />
      <label style={{ ...T.p, display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
        <span>I agree to the house rules, and I authorize Made Kulture to charge {money(s.dues_cents)} to this card today and every month until I cancel. I can cancel anytime; it ends when the paid month runs out.</span>
      </label>
      <button disabled={busy || !agree || !card} onClick={() => post({ action: 'start', cardId: card, agree: true }, 'Welcome to Nomad. Your first nights are in your bank.')} style={{ ...btn(true), opacity: busy || !agree || !card ? 0.5 : 1 }}>
        {busy ? 'Starting…' : `Start for ${money(s.dues_cents)}`}
      </button>
    </div>
  )
}

function Member({ d, post, busy }: any) {
  const m = d.membership, s = d.settings
  const [changingCard, setChangingCard] = useState(false)
  const [card, setCard] = useState(m.square_card_id || '')
  const [prefill, setPrefill] = useState<{ checkIn: string; checkOut: string; houseId: string } | null>(null)
  const upcoming = (d.myStays || []).filter((x: any) => ['confirmed', 'requested'].includes(x.status) && x.check_out >= d.today)
  return (
    <>
      {m.status !== 'active' && (
        <div style={{ ...T.card, borderColor: 'var(--t-err)' }}>
          <p style={{ ...T.p, color: 'var(--t-err)', margin: 0 }}>
            {m.status === 'past_due' ? 'Your last renewal didn’t go through. Update your card below, or use the payment link we emailed.' : 'Your membership is paused because dues are unpaid. Update your card to resume.'}
          </p>
        </div>
      )}

      <div style={{ ...T.card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        <div><div style={T.label}>Night bank</div><div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34 }}>{d.balance}</div><div style={T.small}>+{s.nights_per_month} each month, up to {s.night_cap}</div></div>
        <div><div style={T.label}>Membership</div><div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600 }}>{money(m.dues_cents)}/mo {m.founding && <span style={gold}>FOUNDING</span>}</div><div style={T.small}>{m.cancel_at_period_end ? `Ends ${fmtIso(m.paid_through)}` : `Renews ${fmtIso(m.paid_through)}`}</div></div>
        <div><div style={T.label}>Included</div><div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600 }}>Made Kulture Plus</div><div style={T.small}><Link href="/account/plus" style={{ color: 'var(--t-gold)' }}>See Plus perks</Link></div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <button onClick={() => setChangingCard(x => !x)} style={btn()}>{changingCard ? 'Close' : 'Change card'}</button>
        {m.cancel_at_period_end
          ? <button disabled={busy} onClick={() => post({ action: 'undo_cancel' }, 'You’re staying. Renewal is back on.')} style={btn()}>Keep my membership</button>
          : <button disabled={busy} onClick={() => post({ action: 'cancel_membership' }, `Cancelled. You keep everything until ${fmtIso(m.paid_through)}.`)} style={btn()}>Cancel membership</button>}
      </div>
      {changingCard && (
        <div style={T.card}>
          <CardPicker value={card} onChange={setCard} />
          <button disabled={busy || !card} onClick={() => post({ action: 'update_card', cardId: card }, 'Card updated.')} style={{ ...btn(true), marginTop: 10 }}>Save card</button>
        </div>
      )}

      {(d.joinRequests || []).length > 0 && (
        <div style={{ ...T.card, borderColor: 'rgba(var(--t-gold-rgb),0.5)' }}>
          <h2 style={T.h2}>Join requests</h2>
          {d.joinRequests.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <span style={T.p}>{r.who} wants to stay {fmt(r.check_in)} to {fmt(r.check_out)}{multiHouse(d) ? ` in ${houseOf(d, r.house_id).city}` : ''}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy} onClick={() => post({ action: 'approve_join', stayId: r.id }, 'Approved.')} style={btn(true)}>Approve</button>
                <button disabled={busy} onClick={() => post({ action: 'decline_join', stayId: r.id }, 'Declined.')} style={btn()}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ ...T.h2, marginTop: 8 }}>Your stays</h2>
      {upcoming.length === 0 && <p style={T.p}>No upcoming stays.</p>}
      {upcoming.map((x: any) => <StayCard key={x.id} x={x} d={d} post={post} busy={busy} />)}

      {m.status === 'active' && <BookForm d={d} post={post} busy={busy} prefill={prefill} />}

      <h2 style={{ ...T.h2, marginTop: 22 }}>Who’s going when</h2>
      {(d.calendar || []).length === 0 && <p style={T.p}>Nobody else is booked yet.</p>}
      {(d.calendar || []).map((c: any) => (
        <div key={c.id} style={{ ...T.card, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Inter', fontSize: 14 }}><strong>{c.who}</strong> · {multiHouse(d) ? `${houseOf(d, c.house_id).city} · ` : ''}{fmt(c.check_in)} to {fmt(c.check_out)} {c.status === 'requested' && <span style={gold}>PENDING</span>}</span>
          {m.status === 'active' && c.join !== 'no' && c.status === 'confirmed' && (d.houses || []).some((h: any) => h.id === c.house_id && h.active) && (
            <button onClick={() => { setPrefill({ checkIn: c.check_in, checkOut: c.check_out, houseId: c.house_id }); if (typeof window !== 'undefined') document.getElementById('nomad-book')?.scrollIntoView({ behavior: 'smooth' }) }} style={btn()}>
              {c.join === 'instant' ? 'Join' : 'Ask to join'}
            </button>
          )}
          {c.join === 'no' && <span style={T.small}>{c.status === 'confirmed' ? 'Not open to join' : ''}</span>}
        </div>
      ))}
    </>
  )
}

function StayCard({ x, d, post, busy }: any) {
  const s = houseOf(d, x.house_id)
  const today = s.today || d.today
  const [blockDay, setBlockDay] = useState(x.check_in >= today ? x.check_in : today)
  const [blockHour, setBlockHour] = useState(s.studio_open_hour)
  const [v, setV] = useState({ day: addDays(today, 1) > x.check_in ? addDays(today, 1) : x.check_in, name: '', role: '', phone: '' })
  const days: string[] = []; for (let dd = x.check_in; dd <= x.check_out; dd = addDays(dd, 1)) days.push(dd)
  const hours: number[] = []; for (let h = s.studio_open_hour; h + s.studio_block_hours <= s.studio_close_hour; h++) hours.push(h)
  const myBlocks = (d.studio || []).filter((b: any) => b.stay_id === x.id)
  const taken = (d.studio || []).filter((b: any) => b.day === blockDay && b.house_id === x.house_id)
  const visitors = (d.visitors || []).filter((y: any) => y.stay_id === x.id)
  return (
    <div style={T.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600 }}>{multiHouse(d) ? `${s.city} · ` : ''}{fmt(x.check_in)} → {fmt(x.check_out)}</div>
          <div style={T.small}>Check-in from {hourLabel(s.check_in_hour)}, check-out by {hourLabel(s.check_out_hour)} ({s.city || 'house'} time) · {x.visibility === 'private' ? 'Private' : x.visibility === 'any' ? 'Open to any member' : 'Shared with people you chose'} · {x.nights_cost} bank nights{x.extra_nights ? ` + ${x.extra_nights} extra` : ''}</div>
        </div>
        <span style={gold}>{x.status === 'requested' ? 'WAITING ON APPROVAL' : 'CONFIRMED'}</span>
      </div>
      {x.door_code && <div style={{ ...T.p, marginTop: 10 }}>Door code: <strong style={{ color: 'var(--t-fg)', letterSpacing: '0.1em' }}>{x.door_code}</strong>. Enter the code, then press the unlock button.</div>}
      {x.status === 'confirmed' && !x.door_code && <div style={{ ...T.small, marginTop: 8 }}>Your door code appears here 3 days before check-in.</div>}

      {x.status === 'confirmed' && (
        <>
          {s.has_studio !== false && <>
          <div style={{ ...T.label, marginTop: 14 }}>Studio room · {s.studio_block_hours}-hour blocks</div>
          {myBlocks.map((b: any) => (
            <div key={b.id} style={{ ...T.small, display: 'flex', gap: 10, alignItems: 'center' }}>
              {fmt(b.day)} · {hourLabel(b.start_hour)}–{hourLabel(b.start_hour + b.hours)}
              <button disabled={busy} onClick={() => post({ action: 'cancel_block', blockId: b.id }, 'Block cancelled.')} style={{ ...btn(), padding: '4px 8px' }}>Cancel</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <select value={blockDay} onChange={e => setBlockDay(e.target.value)} style={T.input}>{days.filter(dd => dd >= today).map(dd => <option key={dd} value={dd}>{fmt(dd)}</option>)}</select>
            <select value={blockHour} onChange={e => setBlockHour(Number(e.target.value))} style={T.input}>
              {hours.map(h => { const clash = taken.some((b: any) => h < b.start_hour + b.hours && b.start_hour < h + s.studio_block_hours); return <option key={h} value={h} disabled={clash}>{hourLabel(h)}–{hourLabel(h + s.studio_block_hours)}{clash ? ' (taken)' : ''}</option> })}
            </select>
            <button disabled={busy} onClick={() => post({ action: 'studio_block', stayId: x.id, day: blockDay, startHour: blockHour }, 'Studio booked.')} style={btn(true)}>Book studio</button>
          </div>
          </>}

          <div style={{ ...T.label, marginTop: 16 }}>Visitors · register by the day before</div>
          {visitors.map((y: any) => (
            <div key={y.id} style={{ ...T.small, display: 'flex', gap: 10, alignItems: 'center' }}>
              {fmt(y.day)} · {y.name}{y.role ? ` (${y.role})` : ''}
              <button disabled={busy} onClick={() => post({ action: 'cancel_visitor', visitorId: y.id }, 'Visitor removed.')} style={{ ...btn(), padding: '4px 8px' }}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <select value={v.day} onChange={e => setV(o => ({ ...o, day: e.target.value }))} style={T.input}>{days.filter(dd => dd > today).map(dd => <option key={dd} value={dd}>{fmt(dd)}</option>)}</select>
            <input placeholder="Name" value={v.name} onChange={e => setV(o => ({ ...o, name: e.target.value }))} style={{ ...T.input, width: 150 }} />
            <input placeholder="Model, MUA…" value={v.role} onChange={e => setV(o => ({ ...o, role: e.target.value }))} style={{ ...T.input, width: 130 }} />
            <input placeholder="Phone" value={v.phone} onChange={e => setV(o => ({ ...o, phone: e.target.value }))} style={{ ...T.input, width: 130 }} />
            <button disabled={busy || !v.name} onClick={async () => { const r = await post({ action: 'visitor', stayId: x.id, ...v }, 'Visitor registered.'); if (r.ok) setV(o => ({ ...o, name: '', role: '', phone: '' })) }} style={btn(true)}>Add visitor</button>
          </div>
        </>
      )}

      {x.check_in > today && (
        <button disabled={busy} onClick={() => post({ action: 'cancel_stay', stayId: x.id }, 'Stay cancelled.')} style={{ ...btn(), marginTop: 14 }}>Cancel this stay</button>
      )}
      {x.check_in > today && <div style={{ ...T.small, marginTop: 6 }}>Cancel {s.free_cancel_days}+ days before check-in and your nights come back to your bank. Later than that, they’re used.</div>}
    </div>
  )
}

function BookForm({ d, post, busy, prefill }: any) {
  const open = (d.houses || []).filter((h: any) => h.active)
  const [houseId, setHouseId] = useState<string>(open[0]?.id || '')
  const s = houseOf(d, houseId)
  const today = s.today || d.today
  const [checkIn, setCheckIn] = useState(addDays(today, 14))
  const [checkOut, setCheckOut] = useState(addDays(today, 18))
  const [visibility, setVisibility] = useState('chosen')
  const [shareWith, setShareWith] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [extra, setExtra] = useState<any>(null)
  useEffect(() => { if (prefill) { setCheckIn(prefill.checkIn); setCheckOut(prefill.checkOut); if (prefill.houseId) setHouseId(prefill.houseId); setExtra(null) } }, [prefill])
  if (!open.length) return <div style={{ ...T.card, marginTop: 8 }}><p style={{ ...T.p, margin: 0 }}>No house is open for booking right now.</p></div>

  async function book(acceptExtra = false) {
    const r = await post({ action: 'book', houseId, checkIn, checkOut, visibility, shareWith, notes, acceptExtra }, 'Booked. Check your stays above.')
    if (r.j?.needsExtra) setExtra(r.j)
    else if (r.ok) { setExtra(null); setNotes('') }
  }

  return (
    <div id="nomad-book" style={{ ...T.card, marginTop: 8 }}>
      <h2 style={T.h2}>Book a stay</h2>
      {open.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {open.map((h: any) => (
            <button key={h.id} onClick={() => { setHouseId(h.id); setExtra(null) }} style={{ ...btn(houseId === h.id), padding: '8px 14px' }}>{h.city}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label><span style={T.label}>Check-in</span><input type="date" value={checkIn} min={addDays(today, 1)} max={addDays(today, s.booking_window_days)} onChange={e => { setCheckIn(e.target.value); setExtra(null) }} style={T.input} /></label>
        <label><span style={T.label}>Check-out</span><input type="date" value={checkOut} min={addDays(checkIn, 1)} max={addDays(checkIn, s.max_nights_per_stay)} onChange={e => { setCheckOut(e.target.value); setExtra(null) }} style={T.input} /></label>
      </div>
      <div style={{ ...T.label, marginTop: 14 }}>Who can stay at the same time</div>
      {[['private', 'Private: the house to myself'], ['chosen', 'Members I pick can join'], ['any', 'Any member can ask to join']].map(([k, l]) => (
        <label key={k} style={{ ...T.p, display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 6px', cursor: 'pointer' }}>
          <input type="radio" name="vis" checked={visibility === k} onChange={() => setVisibility(k)} /> {l}
        </label>
      ))}
      {visibility !== 'private' && (d.members || []).length > 0 && (
        <div style={{ margin: '8px 0 4px' }}>
          <div style={T.small}>{visibility === 'chosen' ? 'Who can join without asking:' : 'Who can join without asking (everyone else asks):'}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
            {d.members.map((p: any) => (
              <label key={p.id} style={{ ...T.p, margin: 0, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={shareWith.includes(p.id)} onChange={e => setShareWith(x => e.target.checked ? [...x, p.id] : x.filter(y => y !== p.id))} /> {p.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <label style={{ display: 'block', marginTop: 12 }}><span style={T.label}>Notes for the host (optional)</span><input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Flight time, what you’re shooting…" style={{ ...T.input, width: '100%' }} /></label>

      {extra ? (
        <div style={{ ...T.card, marginTop: 12, borderColor: 'rgba(var(--t-gold-rgb),0.5)' }}>
          <p style={T.p}>This stay uses {extra.cost} nights. {extra.fromBank} come from your bank, and {extra.extraNights} extra night{extra.extraNights === 1 ? '' : 's'} cost {money(extra.extraCents)}, charged to your Nomad card{d.calendar?.some((c: any) => c.join === 'request' && c.house_id === houseId) ? ' (when the stay is confirmed)' : ''}.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy} onClick={() => book(true)} style={btn(true)}>Book and pay {money(extra.extraCents)}</button>
            <button onClick={() => setExtra(null)} style={btn()}>Change dates</button>
          </div>
        </div>
      ) : (
        <button disabled={busy} onClick={() => book(false)} style={{ ...btn(true), marginTop: 14 }}>{busy ? 'Booking…' : 'Book stay'}</button>
      )}
      <div style={{ ...T.small, marginTop: 8 }}>Up to {s.max_nights_per_stay} nights, up to {s.booking_window_days} days ahead.{s.busy_ranges?.length ? ` Busy dates count ${s.busy_multiplier}× nights.` : ''}</div>
    </div>
  )
}

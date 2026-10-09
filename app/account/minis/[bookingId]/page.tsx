'use client'
// /account/minis/[bookingId] — set up Mini Sessions on one booking, share the
// sign-up link, and run the day from the roster.
//
// Everything here is the photographer's view. The rules (headcount, one client
// per slot, locked grid once people are booked) are enforced by the API —
// this page only explains them.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { slotsFor, maxParty, SLOT_CHOICES, DEFAULTS, fmtPhone } from '@/lib/mini-sessions'
import { shrinkImage } from '@/lib/shrink-image'

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`
const font = { fontFamily: 'Inter' }
const input: React.CSSProperties = { ...font, fontSize: 14, padding: '10px 12px', borderRadius: 6, border: `1px solid ${muted(0.15)}`, background: 'var(--t-surface-lo)', color: 'var(--t-fg)', colorScheme: 'var(--t-scheme)' as any, width: '100%', boxSizing: 'border-box' }
const card: React.CSSProperties = { background: 'var(--t-surface)', border: `1px solid ${muted(0.08)}`, borderRadius: 8, padding: '18px 18px', marginBottom: 14 }
const lbl: React.CSSProperties = { ...font, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted(0.5), marginBottom: 6, display: 'block' }
const btn = (primary = false): React.CSSProperties => ({ ...font, fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 6, cursor: 'pointer', border: primary ? 'none' : `1px solid ${muted(0.2)}`, background: primary ? 'var(--t-fg)' : 'transparent', color: primary ? 'var(--t-on-fg)' : 'var(--t-fg)' })
const small: React.CSSProperties = { ...font, fontSize: 12, padding: '6px 10px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${muted(0.18)}`, background: 'transparent', color: 'var(--t-fg)' }
const optStyle: React.CSSProperties = { background: 'var(--t-surface)', color: 'var(--t-fg)' }

type Data = any

export default function MiniSetupPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [cards, setCards] = useState<{ id: string; card_brand: string; last_4: string }[] | null>(null)
  useEffect(() => { fetch('/api/account/cards?dedupe=1').then(r => r.ok ? r.json() : { cards: [] }).then(j => setCards(j.cards ?? [])).catch(() => setCards([])) }, [])
  const [form, setForm] = useState({ title: '', slot_minutes: DEFAULTS.slot_minutes, break_minutes: DEFAULTS.break_minutes, crew_count: DEFAULTS.crew_count, cutoff_hours: DEFAULTS.cutoff_hours, note: '', price_text: '', payment_url: '', approve_switches: false, allow_extra_guests: false, extra_card_id: '' })

  const load = useCallback(async () => {
    const r = await fetch(`/api/account/minis/${bookingId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load this booking.'); return }
    setD(j)
    if (j.attachedPlan) setNotice(`We attached your planned day to this booking — ${j.attachedPlan.confirmed} client${j.attachedPlan.confirmed === 1 ? '' : 's'} confirmed${j.attachedPlan.bumped ? `, ${j.attachedPlan.bumped} need a new time (listed below)` : ''}.`)
    if (j.mini) setForm({
      title: j.mini.title ?? '', slot_minutes: j.mini.slot_minutes, break_minutes: j.mini.break_minutes,
      crew_count: j.mini.crew_count, cutoff_hours: j.mini.cutoff_hours, note: j.mini.note ?? '', price_text: j.mini.price_text ?? '', payment_url: j.mini.payment_url ?? '',
      approve_switches: !!j.mini.approve_switches,
      allow_extra_guests: !!j.mini.allow_extra_guests, extra_card_id: '',
    })
  }, [bookingId])
  useEffect(() => { load() }, [load])

  const preview = useMemo(() => {
    if (!d) return null
    const n = slotsFor(d.booking, form).length
    const room = maxParty(d.limit, form.crew_count)
    const big = form.allow_extra_guests && !d.booking.isBuyout ? Math.max(room, maxParty(d.hardLimit, form.crew_count)) : room
    return { slots: n, room, big }
  }, [d, form])

  async function save() {
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/account/minis/${bookingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, extra_card_id: form.extra_card_id || undefined }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(j.error || 'Could not save.'); return }
    setEditing(false); setNotice(d?.mini ? 'Saved.' : 'Your sign-up link is ready — share it with your clients.')
    load()
  }

  async function act(body: any, okMsg?: string) {
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/account/minis/${bookingId}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(j.error || 'That didn’t work.'); return false }
    if (okMsg) setNotice(typeof okMsg === 'string' ? okMsg : '')
    if (body.action === 'message') setNotice(`Sent — ${j.emailed} email${j.emailed === 1 ? '' : 's'}${j.texted ? `, ${j.texted} text${j.texted === 1 ? '' : 's'}` : ''}.${j.smsSkipped ? ' Texts go out once every 12 hours, so this one went by email only.' : ''}`)
    await load()
    return true
  }

  if (error && !d) return <div style={{ ...font, color: 'var(--t-err)' }}>{error} <Link href="/account/minis" style={{ color: 'var(--t-gold)' }}>Back</Link></div>
  if (!d) return <div style={{ ...font, color: muted(0.4) }}>Loading…</div>

  const b = d.booking, m = d.mini, roster = d.roster
  const locked = !!roster && roster.counts.booked > 0

  const settings = (
    <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Title clients see</label>
          <input style={input} value={form.title} maxLength={80} placeholder={`Mini sessions with ${d.photographer}`} onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label style={lbl}>Slot length</label>
          <select style={input} disabled={locked} value={form.slot_minutes} onChange={e => setForm({ ...form, slot_minutes: Number(e.target.value) })}>
            {SLOT_CHOICES.map(n => <option key={n} value={n} style={optStyle}>{n} min</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Break between</label>
          <select style={input} disabled={locked} value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: Number(e.target.value) })}>
            {[0, 5, 10, 15].map(n => <option key={n} value={n} style={optStyle}>{n === 0 ? 'None' : `${n} min`}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Your crew (incl. you)</label>
          <select style={input} value={form.crew_count} onChange={e => setForm({ ...form, crew_count: Number(e.target.value) })}>
            {Array.from({ length: Math.max(1, d.limit - 1) }, (_, i) => i + 1).map(n => <option key={n} value={n} style={optStyle}>{n}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Sign-ups close</label>
          <select style={input} value={form.cutoff_hours} onChange={e => setForm({ ...form, cutoff_hours: Number(e.target.value) })}>
            {[2, 6, 12, 24, 48].map(n => <option key={n} value={n} style={optStyle}>{n} hours before</option>)}
          </select>
        </div>
        <label style={{ gridColumn: '1 / -1', ...font, fontSize: 14, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', color: 'var(--t-fg)' }}>
          <input type="checkbox" checked={form.approve_switches} onChange={e => setForm({ ...form, approve_switches: e.target.checked })} style={{ marginTop: 3 }} />
          <span>Approve time changes<br /><span style={{ fontSize: 12, color: muted(0.55) }}>When a client asks to switch slots, hold the new time and wait for your OK. Off: they switch instantly and you get an email.</span></span>
        </label>
        {!d.booking.isBuyout && d.hardLimit > d.limit && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ ...font, fontSize: 14, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', color: 'var(--t-fg)' }}>
              <input type="checkbox" checked={form.allow_extra_guests} onChange={e => setForm({ ...form, allow_extra_guests: e.target.checked })} style={{ marginTop: 3 }} />
              <span>Allow bigger groups (billed to me)<br /><span style={{ fontSize: 12, color: muted(0.55) }}>
                Families can bring up to {d.hardLimit} people on set including your crew. Each person over what’s included is ${d.extraFee} per slot, charged to your card once after the session — clients never pay us.
              </span></span>
            </label>
            {form.allow_extra_guests && (
              <div style={{ marginTop: 10, maxWidth: 360 }}>
                <label style={lbl}>Card for extra guests</label>
                {cards && cards.length === 0 ? (
                  <div style={{ ...font, fontSize: 13, color: muted(0.65) }}>No saved card yet — <Link href="/account/payment" style={{ color: 'var(--t-gold)' }}>add one in Payment Methods</Link>, then come back.</div>
                ) : (
                  <select style={input} value={form.extra_card_id} onChange={e => setForm({ ...form, extra_card_id: e.target.value })}>
                    <option value="" style={optStyle}>{m?.extra_card_id ? 'Keep the card already chosen' : 'Choose a card…'}</option>
                    {(cards ?? []).map(c => <option key={c.id} value={c.id} style={optStyle}>{c.card_brand} ···· {c.last_4}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Price shown to clients (optional — you collect it)</label>
          <input style={input} value={form.price_text} maxLength={80} placeholder="e.g. $250 · 20 min · 10 edited photos" onChange={e => setForm({ ...form, price_text: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Your pay link (optional)</label>
          <input style={input} value={form.payment_url} maxLength={300} inputMode="url" placeholder="venmo.com/u/yourname · cash.app/$you · paypal.me/you · Square or Stripe link" onChange={e => setForm({ ...form, payment_url: e.target.value })} />
          <div style={{ ...font, fontSize: 12, color: muted(0.55), marginTop: 6, lineHeight: 1.5 }}>
            Clients get a “Pay {d.photographer || 'you'}” button after they book, in their confirmation email and on their slot page. The money goes straight to you — Made Kulture never touches it. Hidden while a day is still pending.
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Note for clients (optional)</label>
          <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} maxLength={600} value={form.note} placeholder="What to wear, how you take payment, what’s included…" onChange={e => setForm({ ...form, note: e.target.value })} />
        </div>
      </div>
      {preview && (
        <p style={{ ...font, fontSize: 13, color: preview.room < 1 ? 'var(--t-err)' : muted(0.6), margin: '14px 0 0', lineHeight: 1.6 }}>
          {preview.slots} slot{preview.slots === 1 ? '' : 's'} of {form.slot_minutes} min.{' '}
          {preview.room < 1 ? `Your booking allows ${d.limit} people at once, so this crew leaves no room for clients.`
            : `This booking allows ${d.limit} people at once, so each client can bring a party of up to ${preview.room} (including themselves).`}
          {preview.room >= 1 && preview.big > preview.room && ` With bigger groups on, families can bring up to ${preview.big}; each person over ${preview.room} costs you $${d.extraFee} per slot.`}
          {locked && ' Slot length and break are locked because clients are booked.'}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button style={btn(true)} disabled={busy || !preview || preview.room < 1 || preview.slots < 1} onClick={save}>{m ? 'Save changes' : 'Create my sign-up link'}</button>
        {m && <button style={btn()} onClick={() => { setEditing(false); load() }}>Cancel</button>}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/account/minis" style={{ ...font, fontSize: 12, color: muted(0.5), textDecoration: 'none' }}>← Mini Sessions</Link>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '8px 0 4px' }}>{(m?.title || 'MINI SESSIONS').toUpperCase()}</h1>
      <div style={{ ...font, fontSize: 14, color: muted(0.6), marginBottom: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span>{b.day} · {b.time} · {b.place}</span>
        {b.status !== 'cancelled' && !b.over && <Link href={b.crewLink} style={{ fontSize: 13, color: 'var(--t-gold)', textDecoration: 'none' }}>Need an assistant or MUA? Post a casting for this day →</Link>}
      </div>

      {notice && <div style={{ ...font, fontSize: 13, color: 'var(--t-ok)', marginBottom: 12 }}>{notice}</div>}
      {error && <div style={{ ...font, fontSize: 13, color: 'var(--t-err)', marginBottom: 12 }}>{error}</div>}

      {b.status === 'cancelled' && <div style={{ ...card, ...font, fontSize: 14, color: muted(0.7) }}>{b.planned ? 'This plan was called off and your clients were told.' : `This booking is cancelled${m ? ' and your clients were told.' : '.'}`}</div>}

      {b.planned && b.status !== 'cancelled' && d.plan && <PlanPanel d={d} busy={busy} act={act} reload={load} setError={setError} setNotice={setNotice} />}

      {!m && b.status !== 'cancelled' && (
        <>
          <p style={{ ...font, fontSize: 14, color: muted(0.65), lineHeight: 1.6, margin: '0 0 14px' }}>
            Pick how long each slot is and how many people you’re bringing. Clients get a link to pick a time; the next client waits outside until their slot, so the set stays within its headcount.
          </p>
          {settings}
        </>
      )}

      {m && m.status === 'cancelled' && b.status !== 'cancelled' && (
        <div style={{ ...card, ...font, fontSize: 14, color: muted(0.7) }}>
          This mini session day was cancelled along with your booking, and your clients were told. Your booking is active again —
          <button style={{ ...small, marginLeft: 8 }} disabled={busy} onClick={() => act({ action: 'open' }, 'Reopened. Share your link again — earlier sign-ups were released.')}>Reopen sign-ups</button>
        </div>
      )}

      {m && m.status !== 'cancelled' && (
        <>
          <div style={card}>
            <label style={lbl}>Your sign-up link</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ ...input, flex: 1, minWidth: 220 }} readOnly value={m.shareUrl} onFocus={e => e.currentTarget.select()} />
              <button style={btn(true)} onClick={() => { navigator.clipboard?.writeText(m.shareUrl).then(() => setNotice('Link copied.')).catch(() => {}) }}>Copy</button>
              <a href={m.shareUrl} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration: 'none', display: 'inline-block' }}>Open ↗</a>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, ...font, fontSize: 13, color: muted(0.65) }}>
              <span><b style={{ color: 'var(--t-fg)' }}>{roster.counts.booked}</b> booked</span>
              <span><b style={{ color: 'var(--t-fg)' }}>{roster.counts.open}</b> open</span>
              <span><b style={{ color: 'var(--t-fg)' }}>{roster.counts.people}</b> client guests total</span>
              <span>Parties up to <b style={{ color: 'var(--t-fg)' }}>{m.maxParty}</b></span>
              {(m.allow_extra_guests || roster.counts.extraGuests > 0) && (
                <span>Extra guests: <b style={{ color: 'var(--t-fg)' }}>{roster.counts.extraGuests}</b> · ${(roster.counts.extraCents / 100).toFixed(0)}
                  {roster.extraCharge.status === 'charged' ? ' · charged' : roster.extraCharge.status === 'link_sent' ? ' · payment link emailed' : roster.extraCharge.status === 'review' ? ' · being reviewed by the studio' : m.allow_extra_guests ? ' · billed after the session' : ''}</span>
              )}
              {roster.counts.requests > 0 && <span style={{ color: 'var(--t-gold)' }}><b>{roster.counts.requests}</b> switch request{roster.counts.requests === 1 ? '' : 's'}</span>}
              <span>{m.approve_switches ? 'You approve time changes' : 'Time changes are instant'}</span>
              <span>{m.status === 'closed' ? 'Sign-ups stopped' : m.signupsClosed ? 'Sign-ups closed (cutoff passed)' : `Sign-ups close ${m.cutoff_hours}h before`}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button style={small} onClick={() => setEditing(!editing)}>{editing ? 'Hide settings' : 'Edit settings'}</button>
              {m.status === 'open'
                ? <button style={small} disabled={busy} onClick={() => act({ action: 'close' }, 'Sign-ups stopped. Booked clients keep their slots.')}>Stop sign-ups</button>
                : <button style={small} disabled={busy} onClick={() => act({ action: 'open' }, 'Sign-ups reopened.')}>Reopen sign-ups</button>}
            </div>
          </div>

          <ShareKit bookingId={bookingId} m={m} busy={busy} setBusy={setBusy} setError={setError} setNotice={setNotice} reload={load} />

          {editing && settings}

          {roster.bumped.length > 0 && (
            <div style={{ ...card, borderColor: 'var(--t-err)' }}>
              <label style={{ ...lbl, color: 'var(--t-err)' }}>Need a new time</label>
              <p style={{ ...font, fontSize: 13, color: muted(0.65), margin: '0 0 10px' }}>Your booking changed and these clients no longer fit. They were told you’d reach out — move them to an open slot below or remove them.</p>
              {roster.bumped.map((c: any) => (
                <BumpedRow key={c.id} c={c} slots={roster.slots} busy={busy} act={act} />
              ))}
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {roster.slots.map((s: any) => <SlotRow key={s.index} s={s} roster={roster} maxP={m.maxParty} busy={busy} act={act} />)}
          </div>

          <Broadcast busy={busy} act={act} disabled={roster.counts.booked === 0} />
        </>
      )}
    </div>
  )
}

function SlotRow({ s, roster, maxP, busy, act }: { s: any; roster: any; maxP: number; busy: boolean; act: (b: any, m?: string) => Promise<boolean> }) {
  const [mode, setMode] = useState<'' | 'add' | 'move' | 'remove'>('')
  const [f, setF] = useState({ name: '', email: '', phone: '', party: 1 })
  const [to, setTo] = useState<number | ''>('')
  const [notify, setNotify] = useState(true)
  const c = s.client
  const row: React.CSSProperties = { padding: '14px 18px', borderBottom: `1px solid ${muted(0.07)}`, opacity: s.blocked ? 0.55 : 1 }
  const open = roster.slots.filter((x: any) => !x.client && !x.blocked && !x.heldFor && x.index !== s.index)

  return (
    <div style={row}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...font, fontSize: 14, fontWeight: 600, width: 150, flexShrink: 0 }}>{s.label}</div>
        <div style={{ flex: 1, minWidth: 160, ...font, fontSize: 14 }}>
          {c ? (
            <>
              <span style={{ fontWeight: 600 }}>{c.name || 'Client'}</span>
              <span style={{ color: muted(0.55) }}> · party of {c.party}</span>
              {c.extras > 0 && <span style={{ color: 'var(--t-gold)', fontSize: 12 }}> · {c.extras} extra (${c.extras * roster.extraFee})</span>}
              {c.checkedIn && <span style={{ color: 'var(--t-ok)', fontSize: 12, marginLeft: 8 }}>✓ here</span>}
              <div style={{ fontSize: 12, color: muted(0.5), marginTop: 3 }}>
                {c.phone && <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{fmtPhone(c.phone)}</a>}
                {c.phone && c.email && ' · '}
                {c.email && <a href={`mailto:${c.email}`} style={{ color: 'inherit' }}>{c.email}</a>}
                {c.addedBy === 'photographer' && ' · added by you'}
              </div>
            </>
          ) : s.blocked ? <span style={{ color: muted(0.5) }}>Blocked</span>
            : s.heldFor ? <span style={{ color: 'var(--t-gold)' }}>Held — {s.heldFor} asked to switch here</span>
            : <span style={{ color: muted(0.4) }}>Open</span>}
          {c?.pendingLabel && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: 'var(--t-gold)' }}>
              Wants to switch to {c.pendingLabel}
              <button style={small} disabled={busy} onClick={() => act({ action: 'approve_switch', clientId: c.id }, 'Approved — they’ve been emailed their new time.')}>Approve</button>
              <button style={small} disabled={busy} onClick={() => act({ action: 'decline_switch', clientId: c.id }, 'Declined — they keep their original time.')}>Decline</button>
            </div>
          )}
        </div>
        <div style={{ ...font, fontSize: 11, color: s.headcount > roster.limit ? 'var(--t-err)' : muted(0.45), width: 74, textAlign: 'right' }}>
          {c ? `${s.headcount} of ${roster.limit}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {c ? (
            <>
              <button style={small} disabled={busy} onClick={() => act({ action: 'checkin', clientId: c.id, on: !c.checkedIn })}>{c.checkedIn ? 'Undo' : 'Here'}</button>
              <button style={small} onClick={() => setMode(mode === 'move' ? '' : 'move')}>Move</button>
              <button style={small} onClick={() => setMode(mode === 'remove' ? '' : 'remove')}>Remove</button>
            </>
          ) : (
            <>
              {!s.blocked && !s.heldFor && <button style={small} onClick={() => setMode(mode === 'add' ? '' : 'add')}>Add client</button>}
              {!s.heldFor && <button style={small} disabled={busy} onClick={() => act({ action: s.blocked ? 'unblock' : 'block', slot: s.index })}>{s.blocked ? 'Unblock' : 'Block'}</button>}
            </>
          )}
        </div>
      </div>

      {mode === 'add' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 12 }}>
          <input style={input} placeholder="Name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input style={input} placeholder="Email (sends confirmation)" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
          <input style={input} placeholder="Phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
          <select style={input} value={f.party} onChange={e => setF({ ...f, party: Number(e.target.value) })}>
            {Array.from({ length: maxP }, (_, i) => i + 1).map(n => <option key={n} value={n} style={optStyle}>Party of {n}{n > roster.included ? ` (+${n - roster.included} extra, $${(n - roster.included) * roster.extraFee})` : ''}</option>)}
          </select>
          <button style={btn(true)} disabled={busy} onClick={async () => { if (await act({ action: 'add', slot: s.index, ...f }, 'Client added.')) { setMode(''); setF({ name: '', email: '', phone: '', party: 1 }) } }}>Add</button>
        </div>
      )}
      {mode === 'move' && c && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={{ ...input, width: 'auto', minWidth: 180 }} value={to} onChange={e => setTo(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="" style={optStyle}>Move to…</option>
            {open.map((x: any) => <option key={x.index} value={x.index} style={optStyle}>{x.label}</option>)}
          </select>
          <label style={{ ...font, fontSize: 12, color: muted(0.6), display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Email them the new time</label>
          <button style={btn(true)} disabled={busy || to === ''} onClick={async () => { if (await act({ action: 'move', clientId: c.id, slot: to, notify }, 'Moved.')) setMode('') }}>Move</button>
        </div>
      )}
      {mode === 'remove' && c && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ ...font, fontSize: 12, color: muted(0.6), display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Email {c.name?.split(' ')[0] || 'them'} that the slot was released</label>
          <button style={{ ...btn(true), background: 'var(--t-err)', color: '#fff' }} disabled={busy} onClick={async () => { if (await act({ action: 'remove', clientId: c.id, notify }, 'Removed.')) setMode('') }}>Remove {c.name?.split(' ')[0] || 'client'}</button>
        </div>
      )}
    </div>
  )
}

function BumpedRow({ c, slots, busy, act }: { c: any; slots: any[]; busy: boolean; act: (b: any, m?: string) => Promise<boolean> }) {
  const [to, setTo] = useState<number | ''>('')
  const open = slots.filter(x => !x.client && !x.blocked && !x.heldFor)
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', ...font, fontSize: 13 }}>
      <span style={{ minWidth: 160 }}><b>{c.name || 'Client'}</b> · party of {c.party}{c.phone ? ` · ${fmtPhone(c.phone)}` : ''}</span>
      <select style={{ ...input, width: 'auto', minWidth: 160 }} value={to} onChange={e => setTo(e.target.value === '' ? '' : Number(e.target.value))}>
        <option value="" style={optStyle}>Move to…</option>
        {open.map(x => <option key={x.index} value={x.index} style={optStyle}>{x.label}</option>)}
      </select>
      <button style={small} disabled={busy || to === ''} onClick={() => act({ action: 'move', clientId: c.id, slot: to, notify: true }, 'Moved and emailed.')}>Move</button>
      <button style={small} disabled={busy} onClick={() => act({ action: 'remove', clientId: c.id, notify: false }, 'Removed.')}>Remove</button>
    </div>
  )
}

function Broadcast({ busy, act, disabled }: { busy: boolean; act: (b: any) => Promise<boolean>; disabled: boolean }) {
  const [text, setText] = useState('')
  const [sms, setSms] = useState(false)
  return (
    <div style={card}>
      <label style={lbl}>Message everyone booked</label>
      <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} maxLength={600} value={text} placeholder="Running 10 minutes behind — no rush!" onChange={e => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <label style={{ ...font, fontSize: 12, color: muted(0.6), display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} /> Also text clients who opted in to texts
        </label>
        <button style={btn(true)} disabled={busy || disabled || text.trim().length < 3} onClick={async () => { if (await act({ action: 'message', text, sms })) setText('') }}>Send</button>
      </div>
      <p style={{ ...font, fontSize: 12, color: muted(0.45), margin: '10px 0 0' }}>Clients can reply to the email to reach you directly.</p>
    </div>
  )
}

const PLAN_HOURS = Array.from({ length: 27 }, (_, i) => 9 + i / 2)   // studio hours
const planHour = (h: number) => { const hr = Math.floor(h), mm = h % 1 ? '30' : '00'; return `${hr % 12 === 0 ? 12 : hr % 12}:${mm} ${hr >= 12 ? 'PM' : 'AM'}` }

/** A planned day: book it, attach the booking, move it, or call it off. */
function PlanPanel({ d, busy, act, reload, setError, setNotice }: { d: any; busy: boolean; act: (b: any, m?: string) => Promise<boolean>; reload: () => Promise<void>; setError: (s: string) => void; setNotice: (s: string) => void }) {
  const p = d.plan
  const [attachId, setAttachId] = useState('')
  const [moving, setMoving] = useState(false)
  const [mv, setMv] = useState({ date: p.date, start: p.startHour, end: p.endHour })
  const [askOff, setAskOff] = useState(false)
  const requested = d.roster?.counts?.booked ?? 0
  const saveMove = async () => {
    setError(''); setNotice('')
    const r = await fetch(`/api/account/minis/${d.booking.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planDate: mv.date, planStartHour: mv.start, planEndHour: mv.end }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not move the plan.'); return }
    setMoving(false); setNotice(requested ? 'Moved — your pending clients were emailed their new times.' : 'Moved.')
    await reload()
  }
  const attach = async () => {
    setError(''); setNotice('')
    const r = await fetch(`/api/account/minis/${d.booking.id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'attach', bookingId: attachId }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not attach that booking.'); return }
    window.location.href = `/account/minis/${j.bookingId}`
  }
  return (
    <div style={{ ...card, borderColor: 'rgba(var(--t-gold-rgb), 0.55)', borderStyle: 'dashed' }}>
      <label style={{ ...lbl, color: 'var(--t-gold)' }}>Planned — not booked yet</label>
      <p style={{ ...font, fontSize: 14, color: muted(0.75), lineHeight: 1.6, margin: '0 0 12px' }}>
        <b style={{ color: 'var(--t-fg)' }}>{requested}</b> client{requested === 1 ? ' has' : 's have'} requested a slot. They see this day as <b>pending</b> until you book the studio.
        This plan doesn’t hold the time — book when you’re ready.
      </p>
      {p.conflicts > 0 && (
        <p style={{ ...font, fontSize: 13, color: 'var(--t-err)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Someone else has booked this time. Move your plan to another time or set — your pending clients move with it.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <a href={p.bookLink} style={{ ...btn(true), textDecoration: 'none', display: 'inline-block' }}>Book this day →</a>
        <button style={btn()} onClick={() => setMoving(!moving)}>{moving ? 'Close' : 'Move plan'}</button>
        {!askOff ? <button style={btn()} onClick={() => setAskOff(true)}>Call it off</button>
          : <><button style={{ ...btn(true), background: 'var(--t-err)', color: '#fff' }} disabled={busy} onClick={() => act({ action: 'cancel_plan' }, 'Called off — your pending clients were told.')}>Call it off{requested ? ` & email ${requested}` : ''}</button>
             <button style={btn()} onClick={() => setAskOff(false)}>Keep it</button></>}
      </div>
      {moving && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input type="date" style={{ ...input, width: 'auto' }} value={mv.date} onChange={e => setMv({ ...mv, date: e.target.value })} />
          <select style={{ ...input, width: 'auto' }} value={mv.start} onChange={e => { const v = Number(e.target.value); setMv({ ...mv, start: v, end: Math.max(mv.end, v + 1) }) }}>
            {PLAN_HOURS.filter(h => Number.isInteger(h) && h <= 21).map(h => <option key={h} value={h} style={optStyle}>{planHour(h)}</option>)}
          </select>
          <span style={{ ...font, fontSize: 13, color: muted(0.5) }}>to</span>
          <select style={{ ...input, width: 'auto' }} value={mv.end} onChange={e => setMv({ ...mv, end: Number(e.target.value) })}>
            {PLAN_HOURS.filter(h => h >= mv.start + 1).map(h => <option key={h} value={h} style={optStyle}>{planHour(h)}</option>)}
          </select>
          <button style={btn(true)} onClick={saveMove}>Save</button>
        </div>
      )}
      <div style={{ borderTop: `1px solid ${muted(0.08)}`, paddingTop: 12 }}>
        <label style={lbl}>Already booked it?</label>
        {p.candidates.length === 0 ? (
          <div style={{ ...font, fontSize: 13, color: muted(0.55) }}>Once you book that day, your booking shows up here so you can attach it — your pending clients get a “you’re confirmed” email.</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select style={{ ...input, width: 'auto', minWidth: 220 }} value={attachId} onChange={e => setAttachId(e.target.value)}>
              <option value="" style={optStyle}>Pick your booking…</option>
              {p.candidates.map((c: any) => <option key={c.id} value={c.id} style={optStyle}>{c.label}</option>)}
            </select>
            <button style={btn(true)} disabled={!attachId} onClick={attach}>Attach & confirm clients</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Cover photo + flyer (migration 162) ─────────────────────────────────────
function ShareKit({ bookingId, m, busy, setBusy, setError, setNotice, reload }: {
  bookingId: string; m: any; busy: boolean; setBusy: (b: boolean) => void
  setError: (s: string) => void; setNotice: (s: string) => void; reload: () => void
}) {
  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(''); setNotice('')
    try {
      const blob = await shrinkImage(file, 1600, 0.86)
      const fd = new FormData(); fd.append('photo', new File([blob], 'cover.jpg', { type: 'image/jpeg' }))
      const r = await fetch(`/api/account/minis/${bookingId}/cover`, { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'Upload failed.'); return }
      setNotice('Cover photo saved — it now tops your sign-up page, link previews and flyers.')
      reload()
    } catch { setError('That photo couldn’t be read. Try a JPG or PNG.') }
    finally { setBusy(false) }
  }
  async function remove() {
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/account/minis/${bookingId}/cover`, { method: 'DELETE' })
    setBusy(false)
    if (!r.ok) { setError('Could not remove the photo.'); return }
    setNotice('Cover photo removed.'); reload()
  }
  const flyer = (size: 'story' | 'square') => `/api/account/minis/${bookingId}/flyer?size=${size}&download=1&v=${encodeURIComponent(m.updated_at || '')}`
  return (
    <div style={card}>
      <label style={lbl}>Share it like a flyer</label>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ width: 120, height: 150, borderRadius: 6, overflow: 'hidden', background: 'var(--t-surface-lo)', border: `1px solid ${muted(0.12)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {m.cover_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={m.cover_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ ...font, fontSize: 11, color: muted(0.45), textAlign: 'center', padding: 8 }}>No cover photo yet</span>}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ ...font, fontSize: 13, color: muted(0.65), margin: '0 0 10px', lineHeight: 1.55 }}>
            Add a photo from a past mini and your link looks like a flyer everywhere — on the sign-up page and when it’s texted or posted. Download a ready-to-post flyer with a QR code that opens your sign-up page.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...small, display: 'inline-block', opacity: busy ? 0.5 : 1 }}>
              {m.cover_url ? 'Change photo' : 'Add cover photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" style={{ display: 'none' }} disabled={busy}
                onChange={e => { upload(e.target.files?.[0]); e.currentTarget.value = '' }} />
            </label>
            {m.cover_url && <button style={small} disabled={busy} onClick={remove}>Remove</button>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <a href={flyer('story')} style={{ ...btn(true), textDecoration: 'none', display: 'inline-block' }}>Download story flyer</a>
            <a href={flyer('square')} style={{ ...btn(), textDecoration: 'none', display: 'inline-block' }}>Download square post</a>
          </div>
        </div>
      </div>
    </div>
  )
}

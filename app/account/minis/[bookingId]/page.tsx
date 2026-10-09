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
  const [form, setForm] = useState({ title: '', slot_minutes: DEFAULTS.slot_minutes, break_minutes: DEFAULTS.break_minutes, crew_count: DEFAULTS.crew_count, cutoff_hours: DEFAULTS.cutoff_hours, note: '', price_text: '' })

  const load = useCallback(async () => {
    const r = await fetch(`/api/account/minis/${bookingId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load this booking.'); return }
    setD(j)
    if (j.mini) setForm({
      title: j.mini.title ?? '', slot_minutes: j.mini.slot_minutes, break_minutes: j.mini.break_minutes,
      crew_count: j.mini.crew_count, cutoff_hours: j.mini.cutoff_hours, note: j.mini.note ?? '', price_text: j.mini.price_text ?? '',
    })
  }, [bookingId])
  useEffect(() => { load() }, [load])

  const preview = useMemo(() => {
    if (!d) return null
    const n = slotsFor(d.booking, form).length
    return { slots: n, room: maxParty(d.limit, form.crew_count) }
  }, [d, form])

  async function save() {
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/account/minis/${bookingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
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
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Price shown to clients (optional — you collect it)</label>
          <input style={input} value={form.price_text} maxLength={80} placeholder="e.g. $250 · 20 min · 10 edited photos" onChange={e => setForm({ ...form, price_text: e.target.value })} />
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
      <div style={{ ...font, fontSize: 14, color: muted(0.6), marginBottom: 18 }}>{b.day} · {b.time} · {b.place}</div>

      {notice && <div style={{ ...font, fontSize: 13, color: 'var(--t-ok)', marginBottom: 12 }}>{notice}</div>}
      {error && <div style={{ ...font, fontSize: 13, color: 'var(--t-err)', marginBottom: 12 }}>{error}</div>}

      {b.status === 'cancelled' && <div style={{ ...card, ...font, fontSize: 14, color: muted(0.7) }}>This booking is cancelled{m ? ' and your clients were told.' : '.'}</div>}

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
              <span>{m.status === 'closed' ? 'Sign-ups stopped' : m.signupsClosed ? 'Sign-ups closed (cutoff passed)' : `Sign-ups close ${m.cutoff_hours}h before`}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button style={small} onClick={() => setEditing(!editing)}>{editing ? 'Hide settings' : 'Edit settings'}</button>
              {m.status === 'open'
                ? <button style={small} disabled={busy} onClick={() => act({ action: 'close' }, 'Sign-ups stopped. Booked clients keep their slots.')}>Stop sign-ups</button>
                : <button style={small} disabled={busy} onClick={() => act({ action: 'open' }, 'Sign-ups reopened.')}>Reopen sign-ups</button>}
            </div>
          </div>

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
  const open = roster.slots.filter((x: any) => !x.client && !x.blocked && x.index !== s.index)

  return (
    <div style={row}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...font, fontSize: 14, fontWeight: 600, width: 150, flexShrink: 0 }}>{s.label}</div>
        <div style={{ flex: 1, minWidth: 160, ...font, fontSize: 14 }}>
          {c ? (
            <>
              <span style={{ fontWeight: 600 }}>{c.name || 'Client'}</span>
              <span style={{ color: muted(0.55) }}> · party of {c.party}</span>
              {c.checkedIn && <span style={{ color: 'var(--t-ok)', fontSize: 12, marginLeft: 8 }}>✓ here</span>}
              <div style={{ fontSize: 12, color: muted(0.5), marginTop: 3 }}>
                {c.phone && <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{fmtPhone(c.phone)}</a>}
                {c.phone && c.email && ' · '}
                {c.email && <a href={`mailto:${c.email}`} style={{ color: 'inherit' }}>{c.email}</a>}
                {c.addedBy === 'photographer' && ' · added by you'}
              </div>
            </>
          ) : s.blocked ? <span style={{ color: muted(0.5) }}>Blocked</span> : <span style={{ color: muted(0.4) }}>Open</span>}
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
              {!s.blocked && <button style={small} onClick={() => setMode(mode === 'add' ? '' : 'add')}>Add client</button>}
              <button style={small} disabled={busy} onClick={() => act({ action: s.blocked ? 'unblock' : 'block', slot: s.index })}>{s.blocked ? 'Unblock' : 'Block'}</button>
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
            {Array.from({ length: maxP }, (_, i) => i + 1).map(n => <option key={n} value={n} style={optStyle}>Party of {n}</option>)}
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
  const open = slots.filter(x => !x.client && !x.blocked)
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

'use client'
// Admin — Open Calls (migration 149). Review entries, shortlist, pick a winner,
// and set up the next call (one per temp set: The Patient, then Christmas…).
//
// Picking a winner here does NOT feature it or grant the prize. Feature it in
// Website Editor → Featured Editorial, and comp the Plus year from the
// customer's Plus panel — both are deliberate, separate steps.

import { useEffect, useState } from 'react'
import { shrinkImage } from '@/lib/shrink-image'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', green: '#7bd88f', red: '#ff8a80' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '9px 11px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.5 }
const btn: React.CSSProperties = { ...small, background: 'transparent', border: `1px solid ${C.line}`, color: C.text, padding: '6px 10px', cursor: 'pointer' }
const h2: React.CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.03em', margin: '0 0 12px' }

interface Entry {
  id: string; email: string; title: string; photographer: string; photographer_ig: string | null
  credits: { role: string; name: string; handle: string }[]; shoot_date: string | null; note: string | null
  mature: boolean; status: string; admin_note: string | null; created_at: string; images: string[]; hasBooking: boolean
  votes: { total: number; existing: number; fresh: number }
  duplicates: { title: string; photographer: string; earlier: boolean }[]
  matureIdx: number[]
}
interface Call {
  id: string; slug: string; title: string; tagline: string | null; set_slug: string | null; set_name: string | null
  prize: string | null; cover_url: string | null; opens_at: string; closes_at: string | null; rolling: boolean
  voting_opens_at: string | null; voting_closes_at: string | null; max_images: number; status: string; phase: string; entries: Entry[]
}

// Dates are edited as Central calendar days. Opening/voting-open = start of day,
// closing = 11:59:59 PM, with the offset for THAT date (DST ends Nov 1).
const centralDay = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso)) : ''
function centralIso(day: string, end: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const noon = new Date(`${day}T12:00:00Z`)
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'shortOffset' }).formatToParts(noon).find(p => p.type === 'timeZoneName')?.value || 'GMT-6'
  const h = Number(off.replace('GMT', '')) || -6
  const sign = h < 0 ? '-' : '+'
  return `${day}T${end ? '23:59:59' : '00:00:00'}${sign}${String(Math.abs(h)).padStart(2, '0')}:00`
}
const STATUS_COLOR: Record<string, string> = { pending: C.dim, shortlisted: C.accent, declined: C.red, winner: C.green }

export default function OpenCallsAdmin() {
  const [calls, setCalls] = useState<Call[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState<string | null>(null)

  const load = async () => {
    const r = await fetch('/api/admin/open-calls', { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(d.error || 'Could not load.'); setLoading(false); return }
    setCalls(d.calls ?? [])
    setSel(s => s ?? d.calls?.[0]?.id ?? null)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const patch = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/admin/open-calls', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(d.error || 'Not saved.'); return false }
    setMsg(null); await load(); return true
  }

  if (unauth) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Admin sign-in required.</main>
  if (loading) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Loading…</main>

  const call = calls.find(c => c.id === sel) ?? null
  const counts = call ? call.entries.reduce<Record<string, number>>((a, e) => { a[e.status] = (a[e.status] ?? 0) + 1; return a }, {}) : {}
  const shown = call ? call.entries.filter(e => filter === 'all' || e.status === filter) : []

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 24px 80px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ ...h2, fontSize: 32, margin: 0 }}>OPEN CALLS</h1>
        <select value={sel ?? ''} onChange={e => setSel(e.target.value)} style={{ ...inp, width: 'auto' }}>
          {calls.map(c => <option key={c.id} value={c.id}>{c.title} · {c.phase}</option>)}
        </select>
        {call && <a href={`/submissions#${call.slug}`} target="_blank" rel="noreferrer" style={{ ...small, color: C.accent }}>View public page ↗</a>}
      </div>
      <p style={{ ...small, marginBottom: 20 }}>Members only see the shortlist during voting, and never see the counts. Picking a winner doesn&rsquo;t publish anything. Feature it in Website Editor → Featured Editorial and comp the Plus year from the customer&rsquo;s Plus panel.</p>
      {msg && <p style={{ color: C.red, fontSize: 13 }}>{msg}</p>}

      {call && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {['all', 'pending', 'shortlisted', 'winner', 'declined'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ ...btn, borderColor: filter === f ? C.accent : C.line, color: filter === f ? C.accent : C.text }}>
                {f.toUpperCase()} {f === 'all' ? call.entries.length : counts[f] ?? 0}
              </button>
            ))}
          </div>

          {shown.length === 0 && <p style={small}>No entries here yet.</p>}
          <div style={{ display: 'grid', gap: 12 }}>
            {shown.map(e => (
              <div key={e.id} style={{ background: C.card, border: `1px solid ${C.line}`, padding: 14 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: open === e.id ? '100%' : 340, cursor: 'pointer' }} onClick={() => setOpen(o => o === e.id ? null : e.id)}>
                    {(open === e.id ? e.images : e.images.slice(0, 3)).map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={u} alt="" style={{ height: open === e.id ? 360 : 130, width: 'auto', background: '#000' , outline: e.matureIdx?.includes(i) ? '2px solid #ff8a80' : 'none', outlineOffset: -2 }} />
                    ))}
                    {open !== e.id && e.images.length > 3 && <span style={{ ...small, alignSelf: 'center' }}>+{e.images.length - 3}</span>}
                  </div>
                  <div style={{ flex: '1 1 280px', minWidth: 240 }}>
                    <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: '0.02em' }}>{e.title.toUpperCase()}</div>
                    <div style={{ fontSize: 13, margin: '2px 0 6px' }}>by {e.photographer}{e.photographer_ig ? ` · @${e.photographer_ig}` : ''}</div>
                    <div style={small}>
                      {e.email} · submitted {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(e.created_at))}
                      {e.shoot_date ? ` · shot ${e.shoot_date}` : ''}
                    </div>
                    <div style={{ ...small, color: e.hasBooking ? C.green : C.red, marginTop: 4 }}>
                      {call.set_slug
                        ? (e.hasBooking ? `✓ Submitter has a ${call.set_name || 'set'} booking since the call opened` : `✗ No booking on this set under the submitter's account (the booker may be someone else)`)
                        : (e.hasBooking ? '✓ Submitter has booked the studio before' : `✗ No bookings under the submitter's account (the booker may be someone else)`)}
                    </div>
                    {(e.status === 'shortlisted' || e.status === 'winner' || e.votes.total > 0) && (
                      <div style={{ ...small, color: C.text, marginTop: 4 }}>
                        <b style={{ color: C.accent }}>{e.votes.total} vote{e.votes.total === 1 ? '' : 's'}</b>
                        {e.votes.total > 0 && ` · ${e.votes.existing} from members who joined before voting opened · ${e.votes.fresh} from accounts made during the vote`}
                      </div>
                    )}
                    {e.duplicates?.map((d, i) => (
                      <div key={i} style={{ ...small, color: C.red }}>⚠ Shares images with &ldquo;{d.title}&rdquo; by {d.photographer} ({d.earlier ? 'submitted earlier' : 'submitted later'}). One series = one entry: keep one, decline the other.</div>
                    ))}
                    {e.mature && <div style={{ ...small, color: C.accent }}>{e.matureIdx?.length || 'Some'} frame{e.matureIdx?.length === 1 ? '' : 's'} marked 18+ (red outline). Never use those on the home page, kiosks, Instagram or email.</div>}
                    {e.credits?.length > 0 && <div style={{ ...small, marginTop: 6 }}>{e.credits.map(c => `${c.role}: ${c.name || ''}${c.handle ? ` @${c.handle}` : ''}`).join(' · ')}</div>}
                    {e.note && <p style={{ ...small, color: C.text, opacity: 0.8, margin: '8px 0 0' }}>{e.note}</p>}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                      <span style={{ ...small, color: STATUS_COLOR[e.status], fontWeight: 600, marginRight: 6 }}>{(call.rolling && e.status === 'winner' ? 'featured' : e.status).toUpperCase()}</span>
                      {e.status !== 'shortlisted' && <button style={btn} onClick={() => patch({ submissionId: e.id, status: 'shortlisted' })}>Shortlist</button>}
                      {e.status !== 'declined' && <button style={btn} onClick={() => patch({ submissionId: e.id, status: 'declined' })}>Decline</button>}
                      {e.status !== 'winner' && <button style={btn} onClick={() => { if (confirm(call.rolling ? `Feature "${e.title}"? Everyone credited gets the Featured Editorial badge.` : `Mark "${e.title}" as the winner? The submitter gets the prize; everyone credited gets the Featured Editorial badge.`)) patch({ submissionId: e.id, status: 'winner' }) }}>{call.rolling ? 'Feature' : 'Winner'}</button>}
                      {e.status !== 'pending' && <button style={btn} onClick={() => patch({ submissionId: e.id, status: 'pending' })}>Back to pending</button>}
                    </div>
                    <input defaultValue={e.admin_note ?? ''} placeholder="Private note" onBlur={ev => { if (ev.target.value !== (e.admin_note ?? '')) patch({ submissionId: e.id, admin_note: ev.target.value }) }} style={{ ...inp, marginTop: 8 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <CallSettings key={call.id} call={call} onSave={row => patch({ callId: call.id, ...row })} />
        </>
      )}

      <NewCall onCreated={async id => { await load(); setSel(id) }} />
    </main>
  )
}

// Outside the component on purpose: a component defined inside render remounts
// its children every keystroke and the input loses focus.
function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label style={{ display: 'block' }}><span style={{ ...small, display: 'block', marginBottom: 4 }}>{t}</span>{children}</label>
}

function CallSettings({ call, onSave }: { call: Call; onSave: (row: Record<string, unknown>) => Promise<boolean> }) {
  const [f, setF] = useState({
    title: call.title, tagline: call.tagline ?? '', set_slug: call.set_slug ?? '', set_name: call.set_name ?? '', prize: call.prize ?? '',
    cover_url: call.cover_url ?? '', opens: centralDay(call.opens_at), closes: centralDay(call.closes_at),
    vOpens: centralDay(call.voting_opens_at), vCloses: centralDay(call.voting_closes_at), max_images: call.max_images, status: call.status, rolling: !!call.rolling,
  })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }))

  const uploadCover = async (file: File) => {
    setBusy(true); setNote('Uploading cover…')
    try {
      const blob = await shrinkImage(file, 2200, 0.86)
      const fd = new FormData(); fd.append('file', new File([blob], 'cover.jpg', { type: 'image/jpeg' }))
      const r = await fetch('/api/admin/featured-editorial', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      setF(x => ({ ...x, cover_url: d.url })); setNote('Cover uploaded. Press SAVE to use it.')
    } catch (e: any) { setNote(e.message) } finally { setBusy(false) }
  }

  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, padding: 20, marginTop: 32 }}>
      <h2 style={h2}>CALL SETTINGS</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <L t="Title"><input value={f.title} onChange={set('title')} style={inp} /></L>
        <L t="Set slug (entries must be shot here)"><input value={f.set_slug} onChange={set('set_slug')} style={inp} /></L>
        <L t="Set display name"><input value={f.set_name} onChange={set('set_name')} style={inp} /></L>
        <L t="Max images per entry"><input type="number" min={3} max={12} value={f.max_images} onChange={set('max_images')} style={inp} /></L>
        <L t="Submissions open (Central)"><input type="date" value={f.opens} onChange={set('opens')} style={inp} /></L>
        <L t="Submissions close (11:59 PM Central)"><input type="date" value={f.closes} onChange={set('closes')} disabled={f.rolling} style={{ ...inp, opacity: f.rolling ? 0.4 : 1 }} /></L>
        <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', paddingTop: 18 }}>
          <input type="checkbox" checked={f.rolling} onChange={e => setF(x => ({ ...x, rolling: e.target.checked }))} />
          Always open (no deadline, no vote, one series under review per member)
        </label>
        <L t="Voting opens"><input type="date" value={f.vOpens} onChange={set('vOpens')} style={inp} /></L>
        <L t="Voting closes (11:59 PM)"><input type="date" value={f.vCloses} onChange={set('vCloses')} style={inp} /></L>
        <L t="Status"><select value={f.status} onChange={set('status')} style={inp}>
          {['draft', 'announced', 'open', 'closed', 'voting', 'decided'].map(s => <option key={s} value={s}>{s === 'announced' ? 'announced (TBA)' : s}</option>)}
        </select></L>
      </div>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <L t="Tagline"><input value={f.tagline} onChange={set('tagline')} style={inp} /></L>
        <L t="Prize (shown on the page)"><textarea value={f.prize} onChange={set('prize')} rows={2} style={inp} /></L>
        <div>
          <span style={{ ...small, display: 'block', marginBottom: 4 }}>Cover photo (falls back to the set&rsquo;s photo)</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.cover_url && <img src={f.cover_url} alt="" style={{ height: 90 }} />}
            <input type="file" accept="image/*" disabled={busy} onChange={e => { const x = e.target.files?.[0]; if (x) uploadCover(x); e.target.value = '' }} style={small} />
            {f.cover_url && <button style={btn} onClick={() => setF(x => ({ ...x, cover_url: '' }))}>Remove</button>}
          </div>
        </div>
      </div>
      <p style={small}>Phase follows the dates on its own: open until the close date, then reviewing, then voting during the voting window. &ldquo;Draft&rdquo; hides it; &ldquo;announced&rdquo; shows it as TBA with no form; &ldquo;closed&rdquo; stops submissions early; &ldquo;decided&rdquo; ends it.</p>
      {note && <p style={{ ...small, color: C.accent }}>{note}</p>}
      <button disabled={busy} style={{ ...btn, borderColor: C.accent, color: C.accent, padding: '10px 18px' }} onClick={async () => {
        setBusy(true)
        const ok = await onSave({
          title: f.title, tagline: f.tagline, set_slug: f.set_slug, set_name: f.set_name, prize: f.prize, cover_url: f.cover_url,
          max_images: Number(f.max_images), status: f.status, rolling: f.rolling,
          opens_at: centralIso(f.opens, false), closes_at: f.rolling ? null : (f.closes ? centralIso(f.closes, true) : null),
          voting_opens_at: f.vOpens ? centralIso(f.vOpens, false) : null, voting_closes_at: f.vCloses ? centralIso(f.vCloses, true) : null,
        })
        setNote(ok ? 'Saved.' : ''); setBusy(false)
      }}>SAVE</button>
    </section>
  )
}

function NewCall({ onCreated }: { onCreated: (id: string) => void }) {
  const [f, setF] = useState({ title: '', slug: '', set_slug: '', closes: '', rolling: false })
  const [err, setErr] = useState('')
  return (
    <section style={{ border: `1px dashed ${C.line}`, padding: 20, marginTop: 24 }}>
      <h2 style={h2}>NEW OPEN CALL</h2>
      <p style={small}>Starts as a draft. Fill in the rest in Call Settings, then set it to open.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        <input placeholder="Title (e.g. Christmas)" value={f.title} onChange={e => setF({ ...f, title: e.target.value, slug: f.slug || '' })} style={inp} />
        <input placeholder="URL slug (e.g. christmas-2026)" value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} style={inp} />
        <input placeholder="Set slug" value={f.set_slug} onChange={e => setF({ ...f, set_slug: e.target.value })} style={inp} />
        <input type="date" value={f.closes} disabled={f.rolling} onChange={e => setF({ ...f, closes: e.target.value })} style={{ ...inp, opacity: f.rolling ? 0.4 : 1 }} />
      </div>
      <label style={{ ...small, display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="checkbox" checked={f.rolling} onChange={e => setF({ ...f, rolling: e.target.checked })} /> Always open (no deadline)
      </label>
      {err && <p style={{ color: C.red, fontSize: 13 }}>{err}</p>}
      <button style={{ ...btn, marginTop: 10 }} onClick={async () => {
        setErr('')
        const r = await fetch('/api/admin/open-calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: f.title, slug: f.slug, set_slug: f.set_slug, rolling: f.rolling, closes_at: f.rolling ? null : centralIso(f.closes, true) }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setErr(d.error || 'Not created.'); return }
        setF({ title: '', slug: '', set_slug: '', closes: '', rolling: false }); onCreated(d.id)
      }}>CREATE DRAFT</button>
    </section>
  )
}

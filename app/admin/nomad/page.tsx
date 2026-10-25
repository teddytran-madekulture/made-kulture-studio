'use client'
// Nomad applications — Phase 1 of the Nomad backend (2026-10-25).
// Review /nomad applications: approve (sends the founding-group invite),
// waitlist (sends the waitlist email), decline, plus private notes.
// Linked from BOTH admin sidebars.
import { useCallback, useEffect, useState } from 'react'
import NomadOps from './NomadOps'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', gold: '#d4a843', green: '#4ade80', amber: '#fbbf24', red: '#f87171' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 16 }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.6 }
const day = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso)) : '—'
const btn = (color: string, filled = false): React.CSSProperties => ({
  background: filled ? color : 'transparent', color: filled ? '#080808' : color, border: `1px solid ${color}`,
  borderRadius: 4, padding: '7px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
})
const STATUS_COLOR: Record<string, string> = { new: C.gold, approved: C.green, waitlisted: C.amber, declined: C.red }
const TABS = ['new', 'approved', 'waitlisted', 'declined', 'all'] as const
const SECTIONS = ['applications', 'members', 'stays', 'house', 'houses', 'settings'] as const
const SECTION_LABEL: Record<string, string> = { applications: 'APPLICATIONS', members: 'MEMBERS', stays: 'STAYS', house: 'THIS WEEK', houses: 'HOUSES', settings: 'SETTINGS' }

export default function NomadAdminPage() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [unauth, setUnauth] = useState(false)
  const [tab, setTab] = useState<(typeof TABS)[number]>('new')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [section, setSectionState] = useState<(typeof SECTIONS)[number]>('applications')
  // ?tab= deep links (the sidebar's NOMAD section links straight to each tab).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('tab')
      if (q && (SECTIONS as readonly string[]).includes(q)) setSectionState(q as any)
    } catch {}
  }, [])
  const setSection = (x: (typeof SECTIONS)[number]) => {
    setSectionState(x)
    try { const u = new URL(window.location.href); u.searchParams.set('tab', x); window.history.replaceState(null, '', u.toString()); window.dispatchEvent(new Event('nomad-tab')) } catch {}
  }

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/nomad', { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); return }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not load applications.'); return }
    setErr(null); setD(j)
  }, [])
  useEffect(() => { load() }, [load])

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id); setNotice(null)
    try {
      const r = await fetch('/api/admin/nomad', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setNotice(`⚠️ ${j.error || 'Update failed.'}`); return }
      if (j.emailError) setNotice(`⚠️ Saved, but the email did not send: ${j.emailError}`)
      else if (j.emailed === 'invite') setNotice('Approved and invite sent.')
      else if (j.emailed === 'waitlist') setNotice('Waitlisted and notified.')
      else setNotice('Saved.')
      await load()
    } finally { setBusy(null) }
  }

  async function createMembership(id: string) {
    setBusy(id); setNotice(null)
    try {
      const r = await fetch('/api/admin/nomad/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'invite', applicationId: id }) })
      const j = await r.json().catch(() => ({}))
      setNotice(r.ok ? (j.emailed ? 'Membership created. They were emailed a link to start it.' : '⚠️ Membership created, but the email did not send.') : `⚠️ ${j.error || 'Failed.'}`)
    } finally { setBusy(null) }
  }

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>
  const apps: any[] = d?.applications ?? []
  const shown = apps
    .filter(a => tab === 'all' || a.status === tab)
    .sort((a, b) => tab === 'waitlisted' ? (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0) : 0)

  return (
    <div style={{ padding: '32px 24px', maxWidth: 980, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 12px' }}>NOMAD</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {SECTIONS.map(x => <button key={x} onClick={() => setSection(x)} style={btn(C.gold, section === x)}>{SECTION_LABEL[x]}</button>)}
      </div>
      {section !== 'applications' && <NomadOps section={section} />}
      {section === 'applications' && <>
      <p style={{ ...small, margin: '0 0 20px' }}>
        People who applied on <a href="/nomad" target="_blank" rel="noreferrer" style={{ color: C.gold }}>/nomad</a>. Approving sends the founding-group invite. Waitlisting sends a short waitlist note. Declining sends nothing. Each email goes out once.
      </p>
      {err && <div style={{ ...small, color: C.amber, marginBottom: 16 }}>⚠️ {err}</div>}
      {notice && <div style={{ ...small, color: notice.startsWith('⚠️') ? C.amber : C.green, marginBottom: 16 }}>{notice}</div>}
      {!d && !err && <div style={small}>Loading…</div>}

      {d && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ ...btn(t === 'all' ? C.text : STATUS_COLOR[t], tab === t) }}>
                {t.toUpperCase()} {t === 'all' ? apps.length : d.counts?.[t] ?? 0}
              </button>
            ))}
          </div>
          <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Email them when I approve or waitlist
          </label>

          {shown.length === 0 && <div style={small}>Nothing here.</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            {shown.map(a => {
              const draft = drafts[a.id] ?? a.admin_notes ?? ''
              const ig = a.instagram ? `https://instagram.com/${a.instagram}` : null
              return (
                <div key={a.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700 }}>{a.name}</div>
                      <div style={small}>
                        {a.role}{a.based_in ? ` · ${a.based_in}` : ''}{a.trips_per_year ? ` · trips: ${a.trips_per_year}` : ''} · applied {day(a.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...btn(STATUS_COLOR[a.status] || C.text, true), cursor: 'default' }}>
                        {String(a.status).toUpperCase()}{a.waitlist_position ? ` #${a.waitlist_position}` : ''}
                      </span>
                      <div style={{ ...small, marginTop: 6 }}>{a.has_login ? 'Has a member login' : 'No member login yet'}</div>
                    </div>
                  </div>

                  <div style={{ ...small, marginTop: 10, color: 'rgba(255,255,255,0.75)' }}>
                    <a href={`mailto:${a.email}`} style={{ color: C.gold }}>{a.email}</a>
                    {a.phone ? ` · ${a.phone}` : ''}
                    {ig && <> · <a href={ig} target="_blank" rel="noreferrer" style={{ color: C.gold }}>@{a.instagram}</a></>}
                    {a.portfolio_url && <> · <a href={a.portfolio_url} target="_blank" rel="noreferrer" style={{ color: C.gold }}>portfolio</a></>}
                  </div>
                  {a.notes && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ ...small, fontSize: 10.5, letterSpacing: '0.14em' }}>WHAT THEY'D SHOOT OR CREATE</div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.notes}</div>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <div style={{ ...small, fontSize: 10.5, letterSpacing: '0.14em' }}>YOUR NOTES (PRIVATE)</div>
                    <textarea
                      value={draft}
                      onChange={e => setDrafts(x => ({ ...x, [a.id]: e.target.value }))}
                      rows={2}
                      style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: 10, fontSize: 16, fontFamily: 'Inter, sans-serif', resize: 'vertical' }}
                    />
                    {draft !== (a.admin_notes ?? '') && (
                      <button disabled={busy === a.id} onClick={() => patch(a.id, { admin_notes: draft })} style={{ ...btn(C.gold), marginTop: 6 }}>SAVE NOTE</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    {a.status !== 'approved' && <button disabled={busy === a.id} onClick={() => patch(a.id, { status: 'approved', notify })} style={btn(C.green)}>APPROVE{notify && !a.invited_at ? ' + INVITE' : ''}</button>}
                    {a.status !== 'waitlisted' && <button disabled={busy === a.id} onClick={() => patch(a.id, { status: 'waitlisted', notify })} style={btn(C.amber)}>WAITLIST</button>}
                    {a.status !== 'declined' && <button disabled={busy === a.id} onClick={() => patch(a.id, { status: 'declined' })} style={btn(C.red)}>DECLINE</button>}
                    {a.status !== 'new' && <button disabled={busy === a.id} onClick={() => patch(a.id, { status: 'new' })} style={btn(C.dim)}>BACK TO NEW</button>}
                    {a.status === 'approved' && !a.invited_at && <button disabled={busy === a.id} onClick={() => patch(a.id, { notify: true })} style={btn(C.gold)}>SEND INVITE</button>}
                    {a.status === 'approved' && <button disabled={busy === a.id} onClick={() => createMembership(a.id)} style={btn(C.green, true)}>CREATE MEMBERSHIP</button>}
                  </div>
                  <div style={{ ...small, marginTop: 8 }}>
                    {a.invited_at ? `Invite sent ${day(a.invited_at)}. ` : ''}{a.waitlist_notified_at ? `Waitlist note sent ${day(a.waitlist_notified_at)}.` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      </>}
    </div>
  )
}

'use client'
// /admin/rosters — Company rosters (migration 165). A bigger vendor's people
// (first case: a model agency) synced nightly from the company's OWN website.
// A new roster always starts as a DRAFT that only shows here, so it can be
// built and previewed before the company has said yes. MAKE LIVE puts it on
// the owner's directory profile; HIDE switches it off and stops the sync.
import { useEffect, useState } from 'react'
import RosterTab from '@/components/RosterTab'
import type { RosterTalent } from '@/lib/roster'

type Roster = {
  id: string; owner_id: string; label: string; source_url: string; include_tag: string
  status: 'draft' | 'live' | 'hidden'
  last_synced_at: string | null; last_sync_count: number | null; last_error: string | null
  owner_name: string; owner_email: string | null; owner_listed: boolean; owner_blockers: string[]
}

const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '10px 12px', color: '#eee', fontFamily: 'Inter, sans-serif', fontSize: 13, outline: 'none' }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: '#888', marginBottom: 6, display: 'block' }
const btn = (tone: 'light' | 'ghost' | 'danger' | 'go'): React.CSSProperties => ({
  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
  background: tone === 'light' ? '#f2f2f2' : tone === 'go' ? '#d4a843' : 'transparent',
  color: tone === 'light' || tone === 'go' ? '#111' : tone === 'danger' ? '#f0a0a0' : '#bbb',
  border: tone === 'light' || tone === 'go' ? 'none' : `1px solid ${tone === 'danger' ? 'rgba(240,160,160,0.4)' : 'rgba(255,255,255,0.18)'}`,
})
const PILL: Record<Roster['status'], { text: string; bg: string; fg: string }> = {
  draft:  { text: 'DRAFT · ONLY YOU SEE IT', bg: 'rgba(212,168,67,0.15)', fg: '#d4a843' },
  live:   { text: 'LIVE ON THEIR PROFILE',   bg: 'rgba(107,255,170,0.12)', fg: '#6bffaa' },
  hidden: { text: 'HIDDEN · NOT SYNCING',    bg: 'rgba(255,255,255,0.08)', fg: '#999' },
}

function central(iso: string | null): string {
  if (!iso) return 'never'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
function host(url: string) { try { return new URL(url).host.replace(/^www\./, '') } catch { return url } }

export default function AdminRostersPage() {
  const [rows, setRows] = useState<Roster[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<Record<string, RosterTalent[] | 'loading' | { error: string }>>({})
  const [form, setForm] = useState({ email: '', url: '', include_tag: '', label: 'Roster' })
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState('')

  const load = () => fetch('/api/admin/rosters', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load rosters.'); return }   // never render a failed read as "none"
    setErr(''); setRows(d.rosters ?? [])
  }).catch(() => setErr('Could not load rosters.'))
  useEffect(() => { load() }, [])

  const loadPreview = async (id: string) => {
    setPreview(p => ({ ...p, [id]: 'loading' }))
    const r = await fetch(`/api/admin/rosters?id=${id}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    setPreview(p => ({ ...p, [id]: r.ok ? (d.talent ?? []) : { error: d.error || 'Could not load the roster.' } }))
  }
  const togglePreview = (id: string) => {
    if (preview[id]) setPreview(p => { const n = { ...p }; delete n[id]; return n })
    else loadPreview(id)
  }

  const syncSummary = (d: any) => d.ok
    ? `Synced ${d.count} ${d.count === 1 ? 'person' : 'people'}${d.removed ? `, ${d.removed} removed (gone from their site)` : ''}${d.skippedMinor ? `, ${d.skippedMinor} youth left out` : ''}${d.skippedNotTalent ? `, ${d.skippedNotTalent} other products skipped` : ''}.`
    : `Sync failed: ${d.error || 'unknown error'}`

  const sync = async (id: string) => {
    setBusy(id)
    const r = await fetch('/api/admin/rosters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', id }) })
    const d = await r.json().catch(() => ({ ok: false, error: 'No response.' }))
    setNote(n => ({ ...n, [id]: syncSummary(d) }))
    setBusy(null); load()
    if (preview[id]) loadPreview(id)
  }

  const patch = async (id: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return
    setBusy(id)
    const r = await fetch('/api/admin/rosters', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) alert(d.error || 'That did not work.')
    setBusy(null); load()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this roster? It comes off the directory. Nothing on their website is touched, and you can add it again any time.')) return
    setBusy(id)
    const r = await fetch('/api/admin/rosters', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) alert(d.error || 'That did not work.')
    setBusy(null); load()
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdding(true); setAddMsg('')
    const r = await fetch('/api/admin/rosters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', ...form }) })
    const d = await r.json().catch(() => ({}))
    setAdding(false)
    if (!r.ok && !d.id) { setAddMsg(d.error || 'Could not add the roster.'); return }
    setAddMsg(`Added as a draft. ${syncSummary(d)}`)
    setForm({ email: '', url: '', include_tag: '', label: 'Roster' })
    await load()
    if (d.id && d.ok) loadPreview(d.id)
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: 'Inter, sans-serif', color: '#eee' }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, margin: '0 0 6px', letterSpacing: '0.02em' }}>COMPANY ROSTERS</h1>
      <p style={{ color: '#999', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6, maxWidth: 760 }}>
        For bigger vendors like model agencies: their roster is pulled from their own website every night, so they never fill anything in.
        Each person links back to their page on the company&apos;s site, where booking happens.
        A new roster starts as a <b style={{ color: '#d4a843' }}>draft only you can see</b>. Make it live once they&apos;ve said yes.
        Youth are always left out. Works with Shopify-built sites.
      </p>

      {/* Add */}
      <form onSubmit={add} style={{ ...card, marginBottom: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 14 }}>ADD A ROSTER</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <span style={label}>THEIR WEBSITE ACCOUNT EMAIL</span>
            <input style={input} type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="the email they signed up with" />
          </div>
          <div>
            <span style={label}>COMPANY WEBSITE</span>
            <input style={input} required value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="neiljouagency.com" />
          </div>
          <div>
            <span style={label}>ONLY PRODUCTS TAGGED (OPTIONAL)</span>
            <input style={input} value={form.include_tag} onChange={e => setForm(f => ({ ...f, include_tag: e.target.value }))} placeholder="e.g. nmodel" />
          </div>
          <div>
            <span style={label}>TAB NAME</span>
            <input style={input} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Roster" />
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 10, lineHeight: 1.5 }}>
          The tag keeps out things they sell that aren&apos;t people (classes, gift cards). For Neil Jou Agency it&apos;s <code style={{ color: '#ccc' }}>nmodel</code>.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="submit" disabled={adding} style={btn('light')}>{adding ? 'ADDING + SYNCING…' : 'ADD AS DRAFT + SYNC'}</button>
          {addMsg && <span style={{ fontSize: 12.5, color: addMsg.startsWith('Added') ? '#6bffaa' : '#f0a0a0' }}>{addMsg}</span>}
        </div>
      </form>

      {err && <div style={{ ...card, color: '#f0a0a0', marginBottom: 16 }}>{err}</div>}
      {!err && rows === null && <div style={{ color: '#888', fontSize: 13 }}>Loading…</div>}
      {rows?.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>No rosters yet.</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {(rows ?? []).map(r => {
          const pill = PILL[r.status]
          const pv = preview[r.id]
          return (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{r.owner_name || r.owner_email || 'Unnamed account'}</div>
                  <div style={{ fontSize: 12.5, color: '#999', marginTop: 3 }}>
                    {r.owner_email} · <a href={r.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#8ab4f8' }}>{host(r.source_url)}</a>
                    {r.include_tag ? <> · tag <code style={{ color: '#ccc' }}>{r.include_tag}</code></> : null}
                    {' '}· tab “{r.label}”
                  </div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', padding: '6px 10px', borderRadius: 999, background: pill.bg, color: pill.fg, whiteSpace: 'nowrap' }}>{pill.text}</span>
              </div>

              <div style={{ fontSize: 12.5, color: '#bbb', marginTop: 12, lineHeight: 1.6 }}>
                {r.last_sync_count ?? 0} people · last synced {central(r.last_synced_at)}
                {r.status !== 'hidden' && <span style={{ color: '#777' }}> · refreshes nightly</span>}
              </div>
              {r.last_error && <div style={{ fontSize: 12.5, color: '#f0a0a0', marginTop: 6 }}>Last sync problem: {r.last_error}</div>}
              {!r.owner_listed && (
                <div style={{ fontSize: 12.5, color: '#fbbf24', marginTop: 6, lineHeight: 1.5 }}>
                  Their own profile isn&apos;t listed in the directory yet ({r.owner_blockers.join(', ') || 'incomplete'}), so members can&apos;t reach the roster even when it&apos;s live.
                </div>
              )}
              {note[r.id] && <div style={{ fontSize: 12.5, color: note[r.id].startsWith('Sync failed') ? '#f0a0a0' : '#6bffaa', marginTop: 6 }}>{note[r.id]}</div>}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button type="button" style={btn('light')} onClick={() => togglePreview(r.id)}>{pv ? 'CLOSE PREVIEW' : 'PREVIEW'}</button>
                <button type="button" style={btn('ghost')} disabled={busy === r.id} onClick={() => sync(r.id)}>{busy === r.id ? 'WORKING…' : 'SYNC NOW'}</button>
                {r.status !== 'live' && (
                  <button type="button" style={btn('go')} disabled={busy === r.id}
                    onClick={() => patch(r.id, { status: 'live' }, `Put this roster on ${r.owner_name || 'their'} directory profile? Only do this once they've said yes.`)}>MAKE LIVE</button>
                )}
                {r.status === 'live' && <button type="button" style={btn('ghost')} disabled={busy === r.id} onClick={() => patch(r.id, { status: 'draft' })}>BACK TO DRAFT</button>}
                {r.status !== 'hidden' && <button type="button" style={btn('ghost')} disabled={busy === r.id} onClick={() => patch(r.id, { status: 'hidden' })}>HIDE</button>}
                {r.status === 'hidden' && <button type="button" style={btn('ghost')} disabled={busy === r.id} onClick={() => patch(r.id, { status: 'draft' })}>UNHIDE AS DRAFT</button>}
                <button type="button" style={btn('ghost')} disabled={busy === r.id} onClick={() => {
                  const t = prompt('Only include products with this tag (leave blank for all):', r.include_tag)
                  if (t !== null) patch(r.id, { include_tag: t })
                }}>EDIT TAG</button>
                <button type="button" style={btn('danger')} disabled={busy === r.id} onClick={() => remove(r.id)}>DELETE</button>
              </div>

              {pv && (
                <div style={{ marginTop: 18, padding: 18, borderRadius: 8, background: 'var(--t-bg)', border: '1px dashed rgba(255,255,255,0.15)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: '#d4a843', marginBottom: 14 }}>PREVIEW · WHAT MEMBERS WILL SEE ON THEIR PROFILE</div>
                  {pv === 'loading' ? <div style={{ color: '#888', fontSize: 13 }}>Loading…</div>
                    : 'error' in (pv as any) ? <div style={{ color: '#f0a0a0', fontSize: 13 }}>{(pv as any).error}</div>
                    : (pv as RosterTalent[]).length === 0 ? <div style={{ color: '#888', fontSize: 13 }}>Nobody synced yet. Try SYNC NOW.</div>
                    : <RosterTab preview memberId={r.owner_id} memberName={r.owner_name}
                        roster={{ label: r.label, company_url: r.source_url, talent: pv as RosterTalent[] }} />}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

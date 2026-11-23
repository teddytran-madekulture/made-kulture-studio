'use client'
// /admin/gigs — approve member-posted gigs, post one for an outside company,
// and keep an eye on reports. ?filter=flagged opens on reported/pulled gigs
// (the report push deep-links here).
import { useEffect, useMemo, useState } from 'react'
import { CREATIVE_ROLES } from '@/lib/roles'
import { gigDateLabel, GIG_STATUS_LABEL, GIG_REPORT_LABEL, GIG_PAY_TBD, centralToday } from '@/lib/gigs'

type Row = {
  id: string; is_test?: boolean; posted_by: 'member' | 'studio' | 'client'; poster_id: string | null; poster_name: string | null; poster_type: string | null
  company_name: string; company_email: string | null; manage_url: string | null; title: string; description: string | null
  roles_needed: string[]; pay: string; gig_date: string | null; date_note: string | null; location: string | null; at_studio: boolean
  apply_by: string | null; status: string; decline_reason: string | null; pull_reason: string | null
  alerts_sent_at: string | null; alerts_count: number | null; expires_at: string | null; created_at: string
  applicants: number; reports: { reason: string; note: string | null }[]
  views: { views: number; viewers: number; push: number; email: number; board: number } | null
  cover_url?: string | null
}
type Filter = 'drafts' | 'pending' | 'live' | 'flagged' | 'all'

const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
const btn = (tone: 'light' | 'ghost' | 'danger' | 'gold'): React.CSSProperties => ({
  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
  background: tone === 'light' ? '#f2f2f2' : tone === 'gold' ? '#d4a843' : 'transparent', color: tone === 'light' || tone === 'gold' ? '#111' : tone === 'danger' ? '#f0a0a0' : '#bbb',
  border: tone === 'light' || tone === 'gold' ? 'none' : `1px solid ${tone === 'danger' ? 'rgba(240,160,160,0.4)' : 'rgba(255,255,255,0.18)'}`,
})
const input: React.CSSProperties = { width: '100%', background: '#0e0e10', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#eee', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, letterSpacing: '0.08em', color: '#888', margin: '14px 0 6px' }
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

const BLANK = { test: false, pay_tbd: false, cover_url: '', company_name: '', company_email: '', title: '', description: '', pay: '', gig_date: '', date_note: '', location: '', at_studio: false, apply_by: '' }

// Shrink a photo in the browser before upload: a function request body caps at
// 4.5 MB, and a cover never needs more than 2000px. Always re-encoded as JPEG.
async function shrinkImage(file: File, max = 2000): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.86))
  } finally { URL.revokeObjectURL(url) }
}

export default function AdminGigsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [roles, setRoles] = useState<string[]>([])
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])
  const [roleQ, setRoleQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)   // the gig open in the form
  const [editingLive, setEditingLive] = useState(false)               // it's already posted: SAVE CHANGES only
  const [uploading, setUploading] = useState(false)

  const load = () => fetch('/api/admin/gigs', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load gigs.'); return }   // never render a failed read as "none"
    setErr(''); setRows(d.gigs ?? [])
  }).catch(() => setErr('Could not load gigs.'))

  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('filter') === 'flagged') setFilter('flagged') } catch {}
    fetch('/api/roles').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
    load()
  }, [])

  const counts = useMemo(() => {
    const r = rows ?? []
    return { drafts: r.filter(g => g.status === 'draft').length, pending: r.filter(g => g.status === 'pending').length, live: r.filter(g => g.status === 'live').length, flagged: r.filter(g => g.status === 'pulled' || g.reports.length > 0).length, all: r.length }
  }, [rows])
  const shown = useMemo(() => (rows ?? []).filter(g =>
    filter === 'all' ? true : filter === 'drafts' ? g.status === 'draft' : filter === 'flagged' ? (g.status === 'pulled' || g.reports.length > 0) : g.status === filter), [rows, filter])

  const call = async (method: string, body: any) => {
    setNote('')
    const r = await fetch('/api/admin/gigs', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setNote(d.error || 'That did not work.'); return null }
    return d
  }
  const act = async (id: string, action: string) => {
    let reason = ''
    if (action === 'decline') { reason = prompt('Why are you declining it? The poster sees this.') || ''; if (!reason.trim()) return }
    setBusy(id)
    const d = await call('PATCH', { id, action, reason })
    if (d?.alerts) setNote(`${d.linkEmailed === true ? 'Live, and the client got their applicant link by email. ' : d.linkEmailed === false ? 'Live, but the client link email did NOT send. Use COPY COMPANY LINK. ' : 'Live. '}Alerted ${d.alerts.recipients} matching member${d.alerts.recipients === 1 ? '' : 's'} (${d.alerts.pushed} by push, ${d.alerts.emailed} by email).${d.alerts.error ? ` Alert problem: ${d.alerts.error}` : ''}`)
    else if (d && action === 'resend_link') setNote('Link emailed to the company.')
    setBusy(null); load()
  }
  const del = async (id: string) => {
    if (!confirm('Delete this gig, its applications and conversations? This cannot be undone.')) return
    setBusy(id); await call('DELETE', { id }); setBusy(null); load()
  }
  const fields = () => ({ ...form, pay: form.pay_tbd ? '' : form.pay, roles_needed: roles, gig_date: form.gig_date || null, apply_by: form.apply_by || null })
  const closeForm = () => { setForm({ ...BLANK }); setRoles([]); setRoleQ(''); setEditingId(null); setEditingLive(false); setShowForm(false) }
  const uploadCover = async (file: File | undefined) => {
    if (!file) return
    setUploading(true); setNote('')
    try {
      const blob = await shrinkImage(file)
      const fd = new FormData(); fd.append('file', new File([blob], 'cover.jpg', { type: 'image/jpeg' }))
      const r = await fetch('/api/admin/gigs/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) { setNote(d.error || 'The image did not upload.'); return }
      setForm(f => ({ ...f, cover_url: d.url }))
    } catch { setNote('Could not read that image. Try a JPG or PNG.') }
    finally { setUploading(false) }
  }
  const saveLive = async () => {
    setBusy('new')
    const d = await call('PATCH', { id: editingId, action: 'save', ...fields() })
    setBusy(null)
    if (!d) return
    setNote('Changes saved. No new alerts were sent.')
    closeForm(); load()
  }
  // SAVE DRAFT: only a title is needed; nothing reaches members or the company.
  const saveDraft = async () => {
    setBusy('new')
    const d = editingId ? await call('PATCH', { id: editingId, action: 'save', ...fields() }) : await call('POST', { ...fields(), draft: true })
    setBusy(null)
    if (!d) return
    setNote('Draft saved. Nothing was sent. It is under DRAFTS; open it with EDIT to finish and post it.')
    closeForm(); setFilter('drafts'); load()
  }
  const editDraft = (g: Row) => {
    setForm({
      test: !!g.is_test, pay_tbd: g.pay === GIG_PAY_TBD, cover_url: g.cover_url || '', company_name: g.company_name || '', company_email: g.company_email || '', title: g.title || '',
      description: g.description || '', pay: g.pay === GIG_PAY_TBD ? '' : (g.pay || ''), gig_date: g.gig_date || '', date_note: g.date_note || '',
      location: g.location || '', at_studio: !!g.at_studio, apply_by: g.apply_by || '',
    })
    setRoles(g.roles_needed ?? []); setRoleQ(''); setEditingId(g.id); setEditingLive(g.status !== 'draft'); setShowForm(true); setNote('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const submit = async () => {
    setBusy('new')
    const d = editingId ? await call('PATCH', { id: editingId, action: 'publish', ...fields() }) : await call('POST', fields())
    setBusy(null)
    if (!d) return
    setNote(`Posted${form.test ? ' as a TEST: no members were alerted and it is hidden from the board. Open it with MEMBER VIEW to apply from your member account.' : `. Alerted ${d.alerts?.recipients ?? 0} matching members.`}${form.company_email ? (d.linkEmailed ? ' The company got its private link by email.' : ' The company email did NOT send — copy the link from the gig below.') : ' No company email given — copy the private link from the gig below and send it to them.'}`)
    closeForm(); setFilter('live'); load()
  }
  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => setNote('Private link copied.')).catch(() => setNote(text)) }

  const roleMatches = roleQ.trim() ? roleOptions.filter(r => r.toLowerCase().includes(roleQ.trim().toLowerCase()) && !roles.includes(r)).slice(0, 8) : []

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: 'Inter, sans-serif', color: '#eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, margin: 0, letterSpacing: '0.02em' }}>GIGS</h1>
        <button type="button" style={btn('gold')} onClick={() => (showForm ? closeForm() : setShowForm(true))}>{showForm ? 'CANCEL' : '+ POST FOR A COMPANY'}</button>
      </div>
      <p style={{ color: '#999', fontSize: 13, margin: '6px 0 18px', lineHeight: 1.5 }}>
        Paid work for the directory. Gigs from Brand and Vendor accounts wait here until you approve them; approving puts them live and alerts every listed member whose roles match (push, plus email if they have it on). Gigs you post for an outside company go live right away, and the company gets a private link to see applicants and reply. Three member reports pull a gig until you look at it.
      </p>

      {showForm && (
        <div style={{ ...card, marginBottom: 20, borderColor: 'rgba(212,168,67,0.35)' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.1em', color: '#d4a843', fontWeight: 700 }}>{editingId ? (editingLive ? 'EDITING A POSTED GIG' : 'EDITING A DRAFT') : 'POST A GIG FOR AN OUTSIDE COMPANY'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 14px' }}>
            <div><label style={lbl}>COMPANY NAME</label><input style={input} value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
            <div><label style={lbl}>COMPANY EMAIL — private, gets the applicant link</label><input style={input} type="email" value={form.company_email} onChange={e => setForm({ ...form, company_email: e.target.value })} /></div>
            <div><label style={lbl}>TITLE</label><input style={input} value={form.title} maxLength={120} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <label style={lbl}>PAY</label>
              <input style={{ ...input, opacity: form.pay_tbd ? 0.45 : 1 }} disabled={form.pay_tbd} value={form.pay_tbd ? GIG_PAY_TBD : form.pay} placeholder="$400 / day" maxLength={80} onChange={e => setForm({ ...form, pay: e.target.value })} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12, color: '#ccc' }}>
                <input type="checkbox" checked={form.pay_tbd} onChange={e => setForm({ ...form, pay_tbd: e.target.checked })} /> Paid, rate TBD (they confirmed it&apos;s paid)
              </label>
            </div>
            <div><label style={lbl}>DATE</label><input style={input} type="date" min={centralToday()} value={form.gig_date} onChange={e => setForm({ ...form, gig_date: e.target.value })} /></div>
            <div><label style={lbl}>OR DATE NOTE</label><input style={input} value={form.date_note} maxLength={80} placeholder="Dec 3–5, flexible…" onChange={e => setForm({ ...form, date_note: e.target.value })} /></div>
            <div><label style={lbl}>LOCATION</label><input style={input} value={form.location} maxLength={120} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div><label style={lbl}>APPLY BY (optional, else 30 days)</label><input style={input} type="date" min={centralToday()} value={form.apply_by} onChange={e => setForm({ ...form, apply_by: e.target.value })} /></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#ccc' }}>
            <input type="checkbox" checked={form.at_studio} onChange={e => setForm({ ...form, at_studio: e.target.checked })} /> Shooting at Made Kulture
          </label>
          <label style={lbl}>COVER IMAGE (optional — shows on the gig, the board and the company page)</label>
          {form.cover_url ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={form.cover_url} alt="" style={{ width: 220, aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)' }} />
              <button type="button" style={btn('ghost')} onClick={() => setForm({ ...form, cover_url: '' })}>REMOVE</button>
            </div>
          ) : (
            <label style={{ ...btn('ghost'), display: 'inline-block', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'UPLOADING…' : '+ ADD A PHOTO'}
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} disabled={uploading} onChange={e => { uploadCover(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          )}
          <label style={lbl}>ROLES NEEDED</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {roles.map(r => <button key={r} type="button" onClick={() => setRoles(roles.filter(x => x !== r))} style={{ ...btn('light'), padding: '5px 10px' }}>{r} ×</button>)}
          </div>
          <input style={input} value={roleQ} placeholder="Type to add a role…" onChange={e => setRoleQ(e.target.value)} />
          {roleMatches.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {roleMatches.map(r => <button key={r} type="button" onClick={() => { if (roles.length < 8) setRoles([...roles, r]); setRoleQ('') }} style={{ ...btn('ghost'), padding: '5px 10px' }}>+ {r}</button>)}
            </div>
          )}
          <label style={lbl}>DESCRIPTION</label>
          <textarea style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} rows={5} maxLength={3000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          {!editingLive && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 16, fontSize: 13, color: '#d4a843', lineHeight: 1.5 }}>
            <input type="checkbox" checked={form.test} onChange={e => setForm({ ...form, test: e.target.checked })} style={{ marginTop: 3 }} />
            <span>Test only, don&apos;t alert members. Hidden from the members&apos; board; open it with MEMBER VIEW. The company link still emails to the address above (use your own).</span>
          </label>}
          {editingLive ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy === 'new'} style={{ ...btn('gold'), padding: '11px 18px' }} onClick={saveLive}>{busy === 'new' ? 'SAVING…' : 'SAVE CHANGES'}</button>
            </div>
          ) : <>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy === 'new'} style={{ ...btn('gold'), padding: '11px 18px' }} onClick={submit}>{busy === 'new' ? 'WORKING…' : form.test ? 'POST TEST GIG' : 'POST + ALERT MEMBERS'}</button>
            <button type="button" disabled={busy === 'new'} style={{ ...btn('ghost'), padding: '11px 18px' }} onClick={saveDraft}>SAVE DRAFT</button>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>A draft only needs a title. It stays here under DRAFTS; nothing goes to members or the company until you post it.</div>
          </>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['drafts', 'pending', 'live', 'flagged', 'all'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)} style={{ ...btn(filter === f ? 'light' : 'ghost'), fontSize: 12 }}>
            {f.toUpperCase()} ({counts[f]})
          </button>
        ))}
      </div>
      {note && <div style={{ ...card, marginBottom: 14, fontSize: 13, color: '#ddd', lineHeight: 1.5 }}>{note}</div>}
      {err && <div style={{ color: '#f0a0a0', fontSize: 13 }}>{err}</div>}
      {!rows && !err && <div style={{ color: '#888', fontSize: 13 }}>Loading…</div>}
      {rows && shown.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Nothing here.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shown.map(g => {
          const when = [gigDateLabel(g.gig_date), g.date_note].filter(Boolean).join(' · ')
          const expired = g.expires_at && new Date(g.expires_at) < new Date()
          return (
            <div key={g.id} style={{ ...card, borderColor: g.status === 'pending' ? 'rgba(212,168,67,0.4)' : g.reports.length ? 'rgba(240,160,160,0.35)' : 'rgba(255,255,255,0.08)' }}>
              {g.cover_url && <img src={g.cover_url} alt="" style={{ display: 'block', width: 260, maxWidth: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 6, marginBottom: 12 }} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{g.title}</div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                    {g.company_name} · {g.posted_by === 'studio' ? 'posted by you' : g.posted_by === 'client' ? `${g.poster_name} (studio client, no directory profile)` : `${g.poster_name} (${g.poster_type})`} · submitted {fmt(g.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {g.posted_by === 'client' && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 8px', borderRadius: 4, background: 'rgba(120,170,255,0.15)', color: '#9cc0ff' }}>CLIENT</span>}
                  {g.is_test && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 8px', borderRadius: 4, background: 'rgba(212,168,67,0.2)', color: '#d4a843' }}>TEST</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: g.status === 'live' ? '#7be09a' : g.status === 'pending' ? '#d4a843' : '#ccc', textTransform: 'uppercase' }}>{expired && g.status === 'live' ? 'Expired' : GIG_STATUS_LABEL[g.status as keyof typeof GIG_STATUS_LABEL]}</span>
                  {g.pay && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(60,255,120,0.12)', color: '#7be09a' }}>{g.pay}</span>}
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#bbb', marginTop: 10, lineHeight: 1.6 }}>
                {[when, g.location, g.at_studio ? 'at Made Kulture' : ''].filter(Boolean).join(' · ')}
                {g.roles_needed.length > 0 && <div>Hiring: {g.roles_needed.join(', ')}</div>}
                {g.apply_by && <div>Apply by {gigDateLabel(g.apply_by)}</div>}
              </div>
              {g.description && <p style={{ fontSize: 13, color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.55, margin: '10px 0 0' }}>{g.description}</p>}
              {g.decline_reason && <div style={{ fontSize: 12, color: '#f0a0a0', marginTop: 8 }}>Declined: {g.decline_reason}</div>}
              {g.reports.length > 0 && (
                <div style={{ fontSize: 12, color: '#f0a0a0', marginTop: 8 }}>
                  {g.reports.length} open report{g.reports.length === 1 ? '' : 's'}: {g.reports.map(r => GIG_REPORT_LABEL[r.reason] + (r.note ? ` (“${r.note}”)` : '')).join(' · ')}
                </div>
              )}
              {g.status !== 'draft' && g.status !== 'pending' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {([
                    ['Alerted', g.alerts_sent_at ? String(g.alerts_count ?? 0) : '–'],
                    ['Viewed by', g.views ? String(g.views.viewers) : 'n/a'],
                    ['Applied', String(g.applicants)],
                    ['View → apply', g.views && g.views.viewers ? `${Math.round((Math.min(g.applicants, g.views.viewers) / g.views.viewers) * 100)}%` : '–'],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} style={{ background: '#0e0e10', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 12px', minWidth: 88 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#eee' }}>{v}</div>
                      <div style={{ fontSize: 10, letterSpacing: '0.08em', color: '#888', textTransform: 'uppercase', marginTop: 2 }}>{k}</div>
                    </div>
                  ))}
                  {g.views && g.views.views > 0 && <div style={{ fontSize: 11, color: '#777', alignSelf: 'center' }}>Opens: {g.views.push} from push · {g.views.email} from email · {g.views.board} from the board</div>}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                {g.applicants} applicant{g.applicants === 1 ? '' : 's'}
                {g.alerts_sent_at ? ` · alerted ${g.alerts_count ?? 0} member${g.alerts_count === 1 ? '' : 's'} ${fmt(g.alerts_sent_at)}` : ''}
                {g.posted_by !== 'member' && ` · ${g.posted_by === 'client' ? 'client' : 'company'} email: ${g.company_email || 'none'}`}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {g.status === 'draft' && <button type="button" style={btn('gold')} onClick={() => editDraft(g)}>EDIT</button>}
                {g.posted_by === 'studio' && (g.status === 'live' || g.status === 'pulled') && <button type="button" style={btn('ghost')} onClick={() => editDraft(g)}>EDIT</button>}
                {(g.status === 'pending' || g.status === 'declined') && <button type="button" disabled={busy === g.id} style={btn('gold')} onClick={() => act(g.id, 'approve')}>{busy === g.id ? '…' : 'APPROVE + ALERT'}</button>}
                {g.status === 'pending' && <button type="button" disabled={busy === g.id} style={btn('ghost')} onClick={() => act(g.id, 'decline')}>DECLINE</button>}
                {g.status === 'live' && <button type="button" disabled={busy === g.id} style={btn('ghost')} onClick={() => act(g.id, 'pull')}>PULL</button>}
                {g.status === 'pulled' && <button type="button" disabled={busy === g.id} style={btn('light')} onClick={() => act(g.id, 'restore')}>RESTORE</button>}
                {(g.status === 'draft' || g.status === 'pending') && <a href={`/account/gigs/${g.id}`} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>PREVIEW</a>}
                {g.status !== 'draft' && <a href={`/account/gigs/${g.id}`} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>MEMBER VIEW</a>}
                {g.manage_url && <button type="button" style={btn('ghost')} onClick={() => copy(g.manage_url!)}>COPY COMPANY LINK</button>}
                {g.manage_url && <a href={g.manage_url} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), textDecoration: 'none' }}>OPEN APPLICANTS</a>}
                {g.posted_by !== 'member' && g.company_email && g.status !== 'draft' && g.status !== 'pending' && <button type="button" disabled={busy === g.id} style={btn('ghost')} onClick={() => act(g.id, 'resend_link')}>RE-EMAIL LINK</button>}
                <button type="button" disabled={busy === g.id} style={btn('danger')} onClick={() => del(g.id)}>DELETE</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'
// /account/hire — CLIENT GIGS (migration 188, 2026-11-23). A studio customer
// (no directory profile needed) posts a paid gig: "need a photographer for a
// birthday". Teddy approves it, matching creatives get alerted, and applicants
// show up on the customer's private applicant page (manage link). Their email
// and phone are never shown to creatives.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import RolePicker from '@/components/RolePicker'
import { CREATIVE_ROLES } from '@/lib/roles'
import { GIG_POSTER_TERMS, GIG_STATUS_LABEL, gigDateLabel, centralToday, type GigStatus } from '@/lib/gigs'

type Mine = {
  id: string; title: string; pay: string; roles_needed: string[]; gig_date: string | null; date_note: string | null
  location: string | null; status: GigStatus; decline_reason: string | null; expires_at: string | null
  created_at: string; applicants: number; manage_url: string | null
}

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`
const BLANK = { title: '', description: '', pay: '', gig_date: '', date_note: '', location: '', at_studio: false }
// The roles most customers ask for first; the full list is a search away.
const COMMON = ['Photographer', 'Videographer', 'Makeup Artist', 'Hair Stylist', 'Content Creator', 'Model']

export default function HirePage() {
  const [mine, setMine] = useState<Mine[] | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ ...BLANK })
  const [roles, setRoles] = useState<string[]>([])
  const [terms, setTerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof f, v: any) => setF(prev => ({ ...prev, [k]: v }))

  const load = () => fetch('/api/hire', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setLoadErr(d.error || 'Could not load your posts.'); return }   // never show a failed read as "none"
    setLoadErr(''); setMine(d.gigs ?? [])
  }).catch(() => setLoadErr('Could not load your posts.'))

  useEffect(() => {
    fetch('/api/roles').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
    load()
  }, [])

  const submit = async () => {
    setError('')
    if (!f.title.trim()) return setError('Give your post a title, like "Birthday party photographer".')
    if (!roles.length) return setError('Pick who you need.')
    if (!/\d/.test(f.pay)) return setError('Add your budget, like "$250 for 2 hours".')
    if (!terms) return setError('Please agree to the terms.')
    setSaving(true)
    const r = await fetch('/api/hire', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, roles_needed: roles, gig_date: f.gig_date || null, terms: true }),
    })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setError(d.error || 'Could not send it.'); return }
    setF({ ...BLANK }); setRoles([]); setTerms(false); setShowForm(false); setSent(true); load()
  }

  const input: React.CSSProperties = { width: '100%', background: 'var(--t-surface)', border: `1px solid ${muted(0.12)}`, borderRadius: 6, padding: '12px 14px', fontFamily: 'Inter', fontSize: 16, color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }
  const label: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: muted(0.4), margin: '20px 0 8px' }
  const chip = (on: boolean): React.CSSProperties => ({ background: on ? 'var(--t-fg)' : 'transparent', color: on ? 'var(--t-on-fg)' : muted(0.75), border: `1px solid ${on ? 'var(--t-fg)' : muted(0.2)}`, borderRadius: 20, padding: '7px 14px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' })
  const toggleRole = (r: string) => setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : prev.length >= 8 ? prev : [...prev, r])

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '0 0 4px' }}>HIRE A CREATIVE</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.6), margin: '0 0 18px', lineHeight: 1.6 }}>
        Need a photographer for a birthday, a videographer for an event, or a makeup artist for your shoot? Post what you need and your budget. We review it, then share it with Houston creatives in the Made Kulture directory whose work matches. They apply, and you pick.
      </p>

      {sent && (
        <div style={{ background: 'rgba(var(--t-gold-rgb), 0.08)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 8, padding: '12px 14px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-fg)', lineHeight: 1.55, marginBottom: 16 }}>
          Sent. We&apos;ll review it shortly. Once it&apos;s live you&apos;ll get an email with your private applicant page, where you can see each creative&apos;s work and reply to them.
        </div>
      )}

      {!showForm ? (
        <button type="button" onClick={() => { setShowForm(true); setSent(false) }} style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 6, padding: '13px 22px', fontFamily: 'Inter', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer' }}>
          + POST WHAT YOU NEED
        </button>
      ) : (
        <div style={{ background: 'var(--t-surface)', border: `1px solid ${muted(0.1)}`, borderRadius: 10, padding: '6px 16px 18px' }}>
          {error && <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 6, padding: '10px 14px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginTop: 14 }}>{error}</div>}

          <label style={label}>WHO DO YOU NEED?</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            {COMMON.filter(r => roleOptions.includes(r)).map(r => <button key={r} type="button" onClick={() => toggleRole(r)} style={chip(roles.includes(r))}>{r}</button>)}
          </div>
          <RolePicker value={roles} onChange={setRoles} options={roleOptions} max={8} label="Someone else?" hint="(search all roles)" />

          <label style={label}>TITLE</label>
          <input value={f.title} onChange={e => set('title', e.target.value)} placeholder='e.g. "Photographer for my daughter’s 5th birthday"' maxLength={120} style={input} />

          <label style={label}>BUDGET</label>
          <input value={f.pay} onChange={e => set('pay', e.target.value)} placeholder='e.g. "$250 for 2 hours"' maxLength={80} style={input} />

          <label style={label}>DETAILS</label>
          <textarea value={f.description} onChange={e => set('description', e.target.value)} placeholder="What's the occasion, how long, how many people, what you'd like to get back (photos, a video, edited or not)." rows={5} maxLength={3000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={label}>DATE <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional</span></label>
              <input type="date" min={centralToday()} value={f.gig_date} onChange={e => set('gig_date', e.target.value)} style={input} />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <label style={label}>OR WHEN</label>
              <input value={f.date_note} onChange={e => set('date_note', e.target.value)} placeholder='e.g. "Saturday afternoon"' maxLength={80} style={input} />
            </div>
          </div>

          <label style={label}>WHERE</label>
          <input value={f.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Houston Heights, or a park" maxLength={120} style={input} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, fontFamily: 'Inter', fontSize: 13, color: muted(0.7), cursor: 'pointer' }}>
            <input type="checkbox" checked={f.at_studio} onChange={e => set('at_studio', e.target.checked)} style={{ width: 16, height: 16 }} />
            At Made Kulture
          </label>

          <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.5), lineHeight: 1.55, marginTop: 18 }}>
            Creatives see your first name only. Your email and phone stay private; you talk with applicants on your applicant page.
          </div>

          <div style={{ border: `1px solid ${muted(0.1)}`, borderRadius: 8, padding: '12px 14px', marginTop: 14 }}>
            <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontFamily: 'Inter', fontSize: 12, color: muted(0.65), lineHeight: 1.6 }}>
              {GIG_POSTER_TERMS.map(t => <li key={t}>{t}</li>)}
            </ul>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-fg)', cursor: 'pointer' }}>
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} style={{ width: 16, height: 16 }} />
              I agree
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" onClick={submit} disabled={saving} style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 6, padding: '13px 22px', fontFamily: 'Inter', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Sending…' : 'Send for review'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ background: 'transparent', color: muted(0.7), border: `1px solid ${muted(0.2)}`, borderRadius: 6, padding: '13px 18px', fontFamily: 'Inter', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <h2 style={{ fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.1em', color: muted(0.45), margin: '32px 0 10px' }}>YOUR POSTS</h2>
      {loadErr && <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)' }}>{loadErr}</div>}
      {!mine && !loadErr && <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.4) }}>Loading…</div>}
      {mine && mine.length === 0 && <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.4) }}>Nothing posted yet.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(mine ?? []).map(g => {
          const expired = g.status === 'live' && g.expires_at && new Date(g.expires_at) < new Date()
          const when = [gigDateLabel(g.gig_date), g.date_note].filter(Boolean).join(' · ')
          return (
            <div key={g.id} style={{ background: 'var(--t-surface)', border: `1px solid ${muted(0.08)}`, borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600 }}>{g.title}</div>
                <span style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4, background: muted(0.08), color: g.status === 'live' && !expired ? '#7be09a' : g.status === 'pending' ? 'var(--t-gold)' : muted(0.7), textTransform: 'uppercase', flexShrink: 0, alignSelf: 'flex-start' }}>
                  {expired ? 'Expired' : g.status === 'pending' ? 'In review' : GIG_STATUS_LABEL[g.status]}
                </span>
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.55), marginTop: 6 }}>{[g.pay, when, g.location].filter(Boolean).join(' · ')}</div>
              {g.decline_reason && g.status === 'declined' && <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--t-err)', marginTop: 6 }}>Not approved: {g.decline_reason}</div>}
              {g.manage_url && (
                <a href={g.manage_url} style={{ display: 'inline-block', marginTop: 10, fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: 'var(--t-fg)', textDecoration: 'none', border: `1px solid ${muted(0.25)}`, borderRadius: 6, padding: '8px 12px' }}>
                  {g.applicants ? `SEE ${g.applicants} APPLICANT${g.applicants === 1 ? '' : 'S'}` : 'APPLICANT PAGE'} →
                </a>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.4), lineHeight: 1.6, marginTop: 28 }}>
        Made Kulture connects you with creatives; you agree on the details and pay them directly. Questions? <Link href="/account/support" style={{ color: muted(0.7) }}>Help &amp; Support</Link>
      </p>
    </div>
  )
}

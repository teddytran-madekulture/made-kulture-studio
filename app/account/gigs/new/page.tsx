'use client'
// /account/gigs/new — a Brand or Vendor posts a paid gig (?edit=<id> to fix a
// pending or declined one). Goes to Teddy for approval before anyone sees it.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import RolePicker from '@/components/RolePicker'
import { CREATIVE_ROLES } from '@/lib/roles'
import { GIG_POSTER_TERMS, centralToday } from '@/lib/gigs'

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`

export default function NewGigPage() {
  const router = useRouter()
  const [editId, setEditId] = useState<string | null>(null)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])
  const [f, setF] = useState({ company_name: '', title: '', description: '', pay: '', gig_date: '', date_note: '', location: '', at_studio: false, apply_by: '' })
  const [roles, setRoles] = useState<string[]>([])
  const [terms, setTerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, v: any) => setF(prev => ({ ...prev, [k]: v }))

  useEffect(() => {
    fetch('/api/roles').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
    const id = new URLSearchParams(window.location.search).get('edit')
    if (id) {
      setEditId(id)
      fetch(`/api/gigs/${id}`, { cache: 'no-store' }).then(r => r.json()).then(d => {
        const g = d.gig
        if (!g) return
        setF({ company_name: g.company_name || '', title: g.title || '', description: g.description || '', pay: g.pay || '', gig_date: g.gig_date || '', date_note: g.date_note || '', location: g.location || '', at_studio: !!g.at_studio, apply_by: g.apply_by || '' })
        setRoles(g.roles_needed || [])
      }).catch(() => {})
    }
  }, [])

  const submit = async () => {
    setError('')
    if (!f.title.trim()) return setError('Give the gig a title.')
    if (!/\d/.test(f.pay)) return setError('Add the rate or budget, like "$400 / day".')
    if (!roles.length) return setError('Pick at least one role you are hiring for.')
    if (!terms) return setError('Please agree to the poster terms.')
    setSaving(true)
    const payload = { ...f, roles_needed: roles, gig_date: f.gig_date || null, apply_by: f.apply_by || null, terms: true, ...(editId ? { action: 'edit' } : {}) }
    const r = await fetch(editId ? `/api/gigs/${editId}` : '/api/gigs', { method: editId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (r.ok) router.push(`/account/gigs/${editId ?? d.id}?posted=1`)
    else setError(d.error || 'Could not save.')
  }

  const input: React.CSSProperties = { width: '100%', background: 'var(--t-surface)', border: `1px solid ${muted(0.12)}`, borderRadius: 6, padding: '12px 14px', fontFamily: 'Inter', fontSize: 16, color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }
  const label: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: muted(0.4), margin: '20px 0 8px' }
  const today = centralToday()

  return (
    <div style={{ maxWidth: 560 }}>
      <Link href="/account/gigs" style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.5), textDecoration: 'none' }}>← Gigs</Link>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '8px 0 4px' }}>{editId ? 'EDIT GIG' : 'POST A GIG'}</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.45), margin: '0 0 8px', lineHeight: 1.5 }}>
        Paid work only. Made Kulture reviews every gig before it goes live, then alerts members whose roles match.
      </p>

      {error && <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 6, padding: '10px 14px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginTop: 16 }}>{error}</div>}

      <label style={label}>TITLE</label>
      <input value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Photographer for spring swim campaign" maxLength={120} style={input} />

      <label style={label}>COMPANY NAME <span style={{ textTransform: 'none', letterSpacing: 0 }}>— leave blank to use your profile name</span></label>
      <input value={f.company_name} onChange={e => set('company_name', e.target.value)} maxLength={80} style={input} />

      <RolePicker value={roles} onChange={setRoles} options={roleOptions} max={8} label="Who are you hiring?" hint="(pick up to 8)" />

      <label style={label}>PAY</label>
      <input value={f.pay} onChange={e => set('pay', e.target.value)} placeholder='e.g. "$400 / day" or "$1,500 flat"' maxLength={80} style={input} />

      <label style={label}>DESCRIPTION</label>
      <textarea value={f.description} onChange={e => set('description', e.target.value)} placeholder="What the job is, what you need from them, usage, deliverables, anything they should know." rows={6} maxLength={3000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label}>DATE <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional</span></label>
          <input type="date" min={today} value={f.gig_date} onChange={e => set('gig_date', e.target.value)} style={input} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={label}>OR DATE NOTE</label>
          <input value={f.date_note} onChange={e => set('date_note', e.target.value)} placeholder='e.g. "Dec 3–5" or "flexible"' maxLength={80} style={input} />
        </div>
      </div>

      <label style={label}>LOCATION</label>
      <input value={f.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Houston, Montrose" maxLength={120} style={input} />
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, fontFamily: 'Inter', fontSize: 13, color: muted(0.7), cursor: 'pointer' }}>
        <input type="checkbox" checked={f.at_studio} onChange={e => set('at_studio', e.target.checked)} style={{ width: 16, height: 16 }} />
        Shooting at Made Kulture
      </label>

      <label style={label}>APPLY BY <span style={{ textTransform: 'none', letterSpacing: 0 }}>— optional; otherwise it stays up 30 days</span></label>
      <input type="date" min={today} value={f.apply_by} onChange={e => set('apply_by', e.target.value)} style={input} />

      <div style={{ background: 'var(--t-surface)', border: `1px solid ${muted(0.1)}`, borderRadius: 8, padding: '14px 16px', marginTop: 24 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: muted(0.45), marginBottom: 8 }}>POSTER TERMS</div>
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontFamily: 'Inter', fontSize: 13, color: muted(0.7), lineHeight: 1.6 }}>
          {GIG_POSTER_TERMS.map(t => <li key={t}>{t}</li>)}
        </ul>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-fg)', cursor: 'pointer' }}>
          <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} style={{ width: 16, height: 16 }} />
          I agree
        </label>
      </div>

      <button type="button" onClick={submit} disabled={saving} style={{ marginTop: 22, width: '100%', background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 6, padding: '14px', fontFamily: 'Inter', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Sending…' : editId ? 'Resubmit for approval' : 'Send for approval'}
      </button>
    </div>
  )
}

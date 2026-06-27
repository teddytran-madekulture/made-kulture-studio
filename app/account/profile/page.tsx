'use client'
import { useEffect, useState } from 'react'

interface Profile {
  full_name: string
  email: string
  phone: string
  instagram: string
  sms_opt_in: boolean
}

export default function ProfilePage() {
  const [form, setForm]     = useState<Profile>({ full_name: '', email: '', phone: '', instagram: '', sms_opt_in: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    fetch('/api/account/profile')
      .then(r => r.json())
      .then(d => { if (d.profile) setForm(d.profile); setLoading(false) })
  }, [])

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/account/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: form.full_name, phone: form.phone, instagram: form.instagram, sms_opt_in: form.sms_opt_in }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Save failed'); setSaving(false) }
    else { setSaved(true); setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  )

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingTop: 40 }}>Loading...</div>

  return (
    <div>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, margin: '0 0 32px' }}>PROFILE</h1>
      <form onSubmit={save} style={{ maxWidth: 480 }}>
        {error && (
          <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b', marginBottom: 20 }}>
            {error}
          </div>
        )}
        {saved && (
          <div style={{ background: 'rgba(60,255,120,0.1)', border: '1px solid rgba(60,255,120,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#6bffaa', marginBottom: 20 }}>
            Profile saved successfully.
          </div>
        )}

        <Field label="FULL NAME">
          <input value={form.full_name} onChange={set('full_name')} placeholder="Your full name" style={inputStyle} />
        </Field>
        <Field label="EMAIL">
          <input value={form.email} disabled style={{ ...inputStyle, opacity: 0.4 }} />
        </Field>
        <Field label="PHONE">
          <input value={form.phone} onChange={set('phone')} placeholder="(832) 000-0000" style={inputStyle} />
        </Field>
        <Field label="INSTAGRAM">
          <div style={{ display: 'flex', alignItems: 'center', background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.3)', padding: '14px 0 14px 16px' }}>@</span>
            <input value={form.instagram?.replace('@', '') ?? ''} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="yourusername" style={{ ...inputStyle, border: 'none', paddingLeft: 4 }} />
          </div>
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <input type="checkbox" id="sms_opt_in" checked={!!form.sms_opt_in} onChange={set('sms_opt_in')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="sms_opt_in" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            Send me SMS reminders before my bookings
          </label>
        </div>

        <button type="submit" disabled={saving} style={{
          background: '#fff', color: '#000', border: 'none', borderRadius: 4,
          padding: '14px 32px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600,
          letterSpacing: '0.1em', cursor: 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>
      </form>
    </div>
  )
}

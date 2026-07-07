'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [show, setShow]         = useState(false)
  const supabase = createClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setSaving(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setSaving(false) }
    else router.push('/account')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }

  const eye = () => (show ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
  ))

  const pwField = (placeholder: string, value: string, onChange: (v: string) => void) => (
    <div style={{ position: 'relative' }}>
      <input type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} required minLength={6} style={{ ...inputStyle, paddingRight: 46 }} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 4, top: 0, bottom: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 12px', display: 'flex', alignItems: 'center' }}>
        {eye()}
      </button>
    </div>
  )

  return (
    <div>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, margin: '0 0 32px' }}>NEW PASSWORD</h1>
      <form onSubmit={submit} style={{ maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b' }}>{error}</div>}
        {pwField('New password', password, setPassword)}
        {pwField('Confirm password', confirm, setConfirm)}
        <button type="submit" disabled={saving} style={{ background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer', opacity: saving ? 0.6 : 1, marginTop: 4 }}>
          {saving ? 'UPDATING...' : 'UPDATE PASSWORD'}
        </button>
      </form>
    </div>
  )
}

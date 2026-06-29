'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff',
  outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.35)', marginBottom: 8,
}
const btnStyle = (busy: boolean): React.CSSProperties => ({
  background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '13px 28px',
  fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, marginTop: 4, alignSelf: 'flex-start',
})
const okBox: React.CSSProperties = { background: 'rgba(60,255,120,0.1)', border: '1px solid rgba(60,255,120,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#6bffaa' }
const errBox: React.CSSProperties = { background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b' }

export default function SecurityPage() {
  const supabase = createClient()
  const [currentEmail, setCurrentEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentEmail(data.user?.email ?? ''))
  }, [supabase])

  // Password
  const [pw, setPw] = useState(''); const [pwc, setPwc] = useState('')
  const [pwSaving, setPwSaving] = useState(false); const [pwMsg, setPwMsg] = useState(''); const [pwErr, setPwErr] = useState('')
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setPwMsg(''); setPwErr('')
    if (pw !== pwc) { setPwErr('Passwords do not match.'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setPwErr(error.message)
    else { setPwMsg('Password updated.'); setPw(''); setPwc('') }
    setPwSaving(false)
  }

  // Email
  const [email, setEmail] = useState(''); const [emSaving, setEmSaving] = useState(false); const [emMsg, setEmMsg] = useState(''); const [emErr, setEmErr] = useState('')
  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setEmMsg(''); setEmErr('')
    if (!email.trim()) { setEmErr('Enter a new email.'); return }
    setEmSaving(true)
    const { error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account` }
    )
    if (error) setEmErr(error.message)
    else { setEmMsg(`We sent a confirmation link to ${email.trim()}. Click it to finish switching your email — it won't change until you confirm.`); setEmail('') }
    setEmSaving(false)
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 32px' }}>LOGIN &amp; SECURITY</h1>

      {/* Change password */}
      <div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '24px', marginBottom: 24, maxWidth: 480 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Change password</div>
        <form onSubmit={changePw} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pwErr && <div style={errBox}>{pwErr}</div>}
          {pwMsg && <div style={okBox}>{pwMsg}</div>}
          <div>
            <label style={labelStyle}>NEW PASSWORD</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} placeholder="Min 6 characters" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>CONFIRM NEW PASSWORD</label>
            <input type="password" value={pwc} onChange={e => setPwc(e.target.value)} required minLength={6} style={inputStyle} />
          </div>
          <button type="submit" disabled={pwSaving} style={btnStyle(pwSaving)}>{pwSaving ? 'UPDATING…' : 'UPDATE PASSWORD'}</button>
        </form>
      </div>

      {/* Change email */}
      <div style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '24px', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Change email</div>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
          Current: {currentEmail || '—'}
        </div>
        <form onSubmit={changeEmail} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {emErr && <div style={errBox}>{emErr}</div>}
          {emMsg && <div style={okBox}>{emMsg}</div>}
          <div>
            <label style={labelStyle}>NEW EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={inputStyle} />
          </div>
          <button type="submit" disabled={emSaving} style={btnStyle(emSaving)}>{emSaving ? 'SENDING…' : 'UPDATE EMAIL'}</button>
        </form>
      </div>
    </div>
  )
}

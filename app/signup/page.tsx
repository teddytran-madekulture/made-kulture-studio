'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [nextUrl, setNextUrl]  = useState('/account')
  const [form, setForm]       = useState({ full_name: '', email: '', password: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [showPw, setShowPw]   = useState(false)
  const supabase = createClient()

  useEffect(() => {
    setNextUrl(new URLSearchParams(window.location.search).get('next') ?? '/account')
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const signUpEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.full_name, phone: form.phone },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${nextUrl}`,
      },
    })
    if (error) { setError(error.message); setLoading(false) }
    else setSuccess(true)
  }

  const signInGoogle = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${nextUrl}` },
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }

  if (success) return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
      <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, marginBottom: 12 }}>CHECK YOUR EMAIL</h2>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 360 }}>
        We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account.
      </p>
    </div>
  )

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <Link href="/" style={{ textDecoration: 'none', marginBottom: 48 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', color: '#fff', textAlign: 'center', lineHeight: 1 }}>
          MADE KULTURE
        </div>
      </Link>

      <div style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.03em', margin: '0 0 8px', textAlign: 'center' }}>
          CREATE ACCOUNT
        </h1>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 32 }}>
          Already have one?{' '}
          <Link href={`/login?next=${nextUrl}`} style={{ color: '#fff', textDecoration: 'underline' }}>Sign in</Link>
        </p>

        {/* Google */}
        <button onClick={signInGoogle} disabled={loading} style={{
          width: '100%', background: '#fff', color: '#000', border: 'none',
          borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 13,
          fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginBottom: 24,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          SIGN UP WITH GOOGLE
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        </div>

        <form onSubmit={signUpEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b' }}>
              {error}
            </div>
          )}
          <input placeholder="Full name" value={form.full_name} onChange={set('full_name')} required style={inputStyle} />
          <input type="email" placeholder="Email address" value={form.email} onChange={set('email')} required style={inputStyle} />
          <input placeholder="Phone number" value={form.phone} onChange={set('phone')} style={inputStyle} />
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} placeholder="Password (min 6 characters)" value={form.password} onChange={set('password')} required minLength={6} style={{ ...inputStyle, paddingRight: 44 }} />
            <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 4, lineHeight: 1 }} aria-label={showPw ? 'Hide password' : 'Show password'}>
              {showPw
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
          <button type="submit" disabled={loading} style={{
            width: '100%', background: '#fff', color: '#000', border: 'none',
            borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13,
            fontWeight: 600, letterSpacing: '0.1em', cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1, marginTop: 4,
          }}>
            {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
          </button>
        </form>
      </div>
    </div>
  )
}

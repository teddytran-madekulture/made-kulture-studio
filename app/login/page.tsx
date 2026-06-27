'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [nextUrl, setNextUrl]   = useState('/account')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const supabase = createClient()

  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('next') ?? '/account'
    setNextUrl(n)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(n)
    })
  }, [])

  const signInEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push(nextUrl)
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

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <Link href="/" style={{ textDecoration: 'none', marginBottom: 48 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', color: '#fff', textAlign: 'center', lineHeight: 1 }}>
          MADE KULTURE
        </div>
      </Link>

      <div style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, letterSpacing: '0.03em', margin: '0 0 8px', textAlign: 'center' }}>
          SIGN IN
        </h1>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 32 }}>
          New here?{' '}
          <Link href={`/signup?next=${nextUrl}`} style={{ color: '#fff', textDecoration: 'underline' }}>Create an account</Link>
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
          CONTINUE WITH GOOGLE
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        </div>

        {/* Email form */}
        <form onSubmit={signInEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b' }}>
              {error}
            </div>
          )}
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          <Link href="/forgot-password" style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'right', textDecoration: 'none' }}>
            Forgot password?
          </Link>
          <button type="submit" disabled={loading} style={{
            width: '100%', background: '#fff', color: '#000', border: 'none',
            borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13,
            fontWeight: 600, letterSpacing: '0.1em', cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1, marginTop: 4,
          }}>
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>
      </div>
    </div>
  )
}

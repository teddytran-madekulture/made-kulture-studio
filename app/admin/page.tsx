'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

// Google "G" logo SVG
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 6.294C4.672 4.169 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

type View = 'login' | 'forgot' | 'sent'

export default function AdminLogin() {
  const [view,        setView]        = useState<View>('login')
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router       = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const err = searchParams.get('error')
    if (err) setError(err)
  }, [searchParams])

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    setError('')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/admin/auth/callback`,
      },
    })
    // Page will navigate — no need to reset loading
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/admin/dashboard')
    } else {
      const data = await res.json()
      setError(data.error || 'Incorrect password.')
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/auth/magic', { method: 'POST' })
      if (res.ok) {
        setView('sent')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to send email.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const container: React.CSSProperties = {
    background: '#080808',
    minHeight:  '100vh',
    display:    'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  }

  const card: React.CSSProperties = {
    width:      '100%',
    maxWidth:   380,
    display:    'flex',
    flexDirection: 'column',
  }

  const divider: React.CSSProperties = {
    display:    'flex',
    alignItems: 'center',
    gap:        12,
    margin:     '4px 0',
    color:      'rgba(255,255,255,0.2)',
    fontSize:   11,
    letterSpacing: '0.1em',
  }

  const btnBase: React.CSSProperties = {
    width:       '100%',
    padding:     '13px 16px',
    border:      'none',
    cursor:      'pointer',
    fontFamily:  'Inter, sans-serif',
    fontSize:    12,
    fontWeight:  500,
    letterSpacing: '0.12em',
    transition:  'opacity 0.15s',
  }

  // ── Views ───────────────────────────────────────────────────────────────────

  if (view === 'sent') {
    return (
      <div style={container}>
        <div style={card}>
          <Wordmark />
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✉️</div>
            <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#fff', fontFamily: 'Inter, sans-serif' }}>
              Check your inbox
            </p>
            <p style={{ margin: '0 0 28px', fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}>
              A sign-in link was sent to<br />
              <span style={{ color: '#d4a843' }}>teddytran@madekulture.com</span>
              <br />It expires in 30 minutes.
            </p>
            <button
              onClick={() => setView('login')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif' }}
            >
              ← BACK TO LOGIN
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'forgot') {
    return (
      <div style={container}>
        <div style={card}>
          <Wordmark />
          <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            Forgot your password?
          </p>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}>
            We&apos;ll email a one-time sign-in link to<br />
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>teddytran@madekulture.com</span>
          </p>

          {error && <ErrorMsg msg={error} />}

          <button
            onClick={handleForgotPassword}
            disabled={loading}
            style={{ ...btnBase, background: '#fff', color: '#080808', marginBottom: 12, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'SENDING...' : 'SEND SIGN-IN LINK'}
          </button>

          <button
            onClick={() => { setView('login'); setError('') }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', padding: '8px 0' }}
          >
            ← BACK TO LOGIN
          </button>
        </div>
      </div>
    )
  }

  // Default: login view
  return (
    <div style={container}>
      <div style={card}>
        <Wordmark />

        {error && <ErrorMsg msg={error} />}

        {/* Google Sign-In */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          style={{
            ...btnBase,
            background:    'rgba(255,255,255,0.05)',
            border:        '1px solid rgba(255,255,255,0.14)',
            color:         '#fff',
            display:       'flex',
            alignItems:    'center',
            justifyContent: 'center',
            gap:           10,
            marginBottom:  16,
            opacity:       googleLoading ? 0.6 : 1,
          }}
        >
          <GoogleIcon />
          {googleLoading ? 'REDIRECTING...' : 'CONTINUE WITH GOOGLE'}
        </button>

        {/* Divider */}
        <div style={divider}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          OR
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {/* Password form */}
        <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width:       '100%',
                background:  'transparent',
                border:      '1px solid rgba(255,255,255,0.14)',
                color:       '#fff',
                padding:     '13px 44px 13px 16px',
                fontSize:    14,
                fontFamily:  'Inter, sans-serif',
                outline:     'none',
                boxSizing:   'border-box',
              }}
              onFocus={e  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)')}
              onBlur={e   => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
            />
            {/* Show/hide toggle */}
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              tabIndex={-1}
              style={{
                position:   'absolute',
                right:      12,
                top:        '50%',
                transform:  'translateY(-50%)',
                background: 'transparent',
                border:     'none',
                cursor:     'pointer',
                color:      'rgba(255,255,255,0.35)',
                padding:    4,
                lineHeight: 1,
              }}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff /> : <EyeOn />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              ...btnBase,
              background:  (!loading && password) ? '#fff' : 'rgba(255,255,255,0.08)',
              color:       (!loading && password) ? '#080808' : 'rgba(255,255,255,0.25)',
              cursor:      (!loading && password) ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'SIGNING IN...' : 'SIGN IN ↗'}
          </button>
        </form>

        <button
          onClick={() => { setView('forgot'); setError('') }}
          style={{
            background:    'transparent',
            border:        'none',
            cursor:        'pointer',
            fontSize:      11,
            color:         'rgba(255,255,255,0.25)',
            letterSpacing: '0.08em',
            fontFamily:    'Inter, sans-serif',
            padding:       '14px 0 0',
            textAlign:     'left',
          }}
        >
          Forgot password?
        </button>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: '#fff', letterSpacing: '0.05em' }}>
        MADE KULTURE
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
        ADMIN ACCESS
      </div>
      <div style={{ marginTop: 10, width: 28, height: 2, background: '#d4a843' }} />
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{
      marginBottom:  16,
      padding:       '10px 14px',
      background:    'rgba(255,107,107,0.08)',
      border:        '1px solid rgba(255,107,107,0.25)',
      color:         '#ff6b6b',
      fontSize:      12,
      fontFamily:    'Inter, sans-serif',
      lineHeight:    1.5,
    }}>
      {msg}
    </div>
  )
}

function EyeOn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

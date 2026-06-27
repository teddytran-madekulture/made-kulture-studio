'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')
  const supabase = createClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/reset-password`,
    })
    if (error) { setError(error.message); setLoading(false) }
    else setSent(true)
  }

  if (sent) return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
      <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, marginBottom: 12 }}>CHECK YOUR EMAIL</h2>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 360 }}>
        We sent a password reset link to <strong>{email}</strong>.
      </p>
    </div>
  )

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <Link href="/" style={{ textDecoration: 'none', marginBottom: 48 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', color: '#fff', textAlign: 'center' }}>MADE KULTURE</div>
      </Link>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, margin: '0 0 8px', textAlign: 'center' }}>RESET PASSWORD</h1>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 32 }}>
          Enter your email and we'll send a reset link.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b' }}>{error}</div>}
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
          <button type="submit" disabled={loading} style={{ width: '100%', background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'SENDING...' : 'SEND RESET LINK'}
          </button>
          <Link href="/login" style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', textDecoration: 'none' }}>Back to sign in</Link>
        </form>
      </div>
    </div>
  )
}

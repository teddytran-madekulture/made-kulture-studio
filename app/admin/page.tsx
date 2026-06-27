'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/admin/dashboard')
    } else {
      setError('Incorrect password.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: '#080808', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 360 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: '#fff', letterSpacing: '0.05em', marginBottom: 8 }}>
          MADE KULTURE
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 48 }}>
          ADMIN ACCESS
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', padding: '14px 16px', fontSize: 14,
              fontFamily: 'Inter, sans-serif', outline: 'none', width: '100%',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)')}
            onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
          />

          {error && (
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#ff6b6b' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              background: (!loading && password) ? '#fff' : 'rgba(255,255,255,0.1)',
              border: 'none', padding: '14px', cursor: (!loading && password) ? 'pointer' : 'not-allowed',
              fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500,
              letterSpacing: '0.18em', color: '#080808',
            }}
          >
            {loading ? 'ENTERING...' : 'ENTER ↗'}
          </button>
        </form>
      </div>
    </div>
  )
}

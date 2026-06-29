'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CheckinKioskPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState<string | null>(null)
  const kiosk = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('kiosk') === '1'

  const find = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/checkin/lookup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'No booking found.'); setBusy(false); return }
      router.push(`/checkin/${d.token}${kiosk ? '?kiosk=1' : ''}`)
    } catch {
      setErr('Something went wrong. Please try again.'); setBusy(false)
    }
  }

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.05em', marginBottom: 40, lineHeight: 1 }}>MADE<br />KULTURE</div>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 44, lineHeight: 0.95, marginBottom: 12 }}>CHECK IN</h1>
        <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Enter the phone number on your booking.</p>
        <input
          type="tel" inputMode="tel" placeholder="(832) 000-0000" value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && phone) find() }}
          style={{ width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '18px 16px', fontSize: 18, fontFamily: 'Inter', textAlign: 'center', outline: 'none', marginBottom: 16 }}
        />
        {err && <p style={{ color: '#f0a0a0', fontFamily: 'Inter', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <button onClick={find} disabled={busy || !phone}
          style={{ width: '100%', padding: '20px', border: 'none', background: '#fff', color: '#080808', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 14, fontWeight: 600, letterSpacing: '0.2em', cursor: busy ? 'wait' : 'pointer', opacity: (busy || !phone) ? 0.6 : 1 }}>
          {busy ? 'FINDING…' : 'FIND MY BOOKING'}
        </button>
      </div>
    </div>
  )
}

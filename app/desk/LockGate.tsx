'use client'

import { useEffect, useRef, useState } from 'react'
import FloorBoard from '@/components/FloorBoard'

const C = { bg: '#0f0f10', card: '#1a1a1c', line: '#2a2a2e', text: '#f4f4f5', dim: '#a1a1aa', accent: '#ef6354', input: '#232327' }
const IDLE_MS = 5 * 60 * 1000 // 5 minutes

// Locks the screen after 5 minutes of inactivity; the signed-in staff dismisses
// it with their quick-unlock PIN (no full re-login). "Sign out" switches user.
export default function LockGate({ staffName }: { staffName: string }) {
  const [locked, setLocked] = useState(false)
  // The PIN pad is not shown until the board is tapped.
  const [showPin, setShowPin] = useState(false)
  // Which room the tap was on, so unlocking lands on that room's controls
  // instead of dumping you on the booking list to find it yourself.
  const [wantRoom, setWantRoom] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Actually SUSPEND the session server-side (clears the full cookie), so no
    // URL — /staff, /admin — can be opened around the lock. PIN restores it.
    const doLock = async () => {
      try { await fetch('/api/staff/lock', { method: 'POST' }) } catch { /* still show the overlay */ }
      setLocked(true); setShowPin(false); setWantRoom(null)
    }
    const arm = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(doLock, IDLE_MS)
    }
    const onActivity = () => { if (!locked) arm() }
    const onManualLock = () => { doLock() } // fired by the header "Lock" button
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    window.addEventListener('mk-lock', onManualLock)
    arm()
    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity))
      window.removeEventListener('mk-lock', onManualLock)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [locked])

  const unlock = async () => {
    setBusy(true); setErr('')
    const r = await fetch('/api/staff/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Wrong PIN.'); setPin(''); return }
    setPin(''); setLocked(false); setShowPin(false)
    if (wantRoom) { window.location.href = `/desk/atlas?room=${encodeURIComponent(wantRoom)}` }
  }
  const signOut = async () => { await fetch('/api/staff/logout', { method: 'POST' }); window.location.href = '/staff' }

  if (!locked) return null

  // ⚠️ THE LOCK SCREEN IS THE FLOOR BOARD. The whole point of the board is
  // seeing the building without walking it, so hiding it behind the PIN would
  // defeat it. Colours and room names render while the session is SUSPENDED
  // (the locked cookie is identity-only and authorises nothing) — and no guest
  // names are ever on this screen, because a front desk is a public place.
  // Everything actionable still costs a PIN.
  if (!showPin) {
    return (
      <div
        onClick={() => setShowPin(true)}
        data-lock-board="1"
        style={{
          position: 'fixed', inset: 0, zIndex: 100, cursor: 'pointer',
          background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
        }}
      >
        <FloorBoard onRoomTap={a => { setWantRoom(a.code); setShowPin(true) }} />
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          fontSize: 11, letterSpacing: '.2em', color: 'rgba(255,255,255,.34)',
          fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
        }}>
          LOCKED · {staffName.toUpperCase()} · TAP TO UNLOCK
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, padding: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.28, pointerEvents: 'none' }}>
        <FloorBoard />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28, width: '100%', maxWidth: 340, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 24, marginBottom: 4 }}>LOCKED</div>
        <div style={{ color: C.dim, fontSize: 14, marginBottom: 18 }}>{staffName} · enter your PIN</div>
        <input
          type="password" inputMode="numeric" autoFocus value={pin}
          onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && unlock()}
          placeholder="••••"
          style={{ width: '100%', textAlign: 'center', letterSpacing: '0.4em', fontSize: 24, padding: '12px', background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, boxSizing: 'border-box' }}
        />
        {err && <p style={{ color: C.accent, fontSize: 13, marginTop: 10 }}>{err}</p>}
        <button onClick={unlock} disabled={busy || !pin}
          style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 14, cursor: 'pointer', opacity: busy || !pin ? 0.6 : 1 }}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
        <button onClick={signOut}
          style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 8, border: `1px solid ${C.line}`, background: 'transparent', color: C.dim, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, cursor: 'pointer' }}>
          Sign out / switch user
        </button>
      </div>
    </div>
  )
}

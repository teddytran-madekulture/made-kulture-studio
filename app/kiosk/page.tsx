'use client'

// In-studio kiosk (wall tablet / rolling touchscreen).
// URL: /kiosk  (or /kiosk?key=XXXX when KIOSK_KEY is set in Vercel)
//
// Design: modern luxury — deep charcoal with muted warm gradients, bold
// typography, champagne hairlines, thin monotone stroke icons. No emoji.
// Shared-device privacy: returns HOME + wipes the June chat after 90s idle.

import { useCallback, useEffect, useRef, useState } from 'react'

const IDLE_MS = 90_000

// Muted champagne palette (luxury, not loud)
const CHAMP = '#c9b27e'
const CHAMP_DIM = 'rgba(201,178,126,0.55)'
const HAIR = 'rgba(201,178,126,0.22)'
const INK = '#0b0b0d'

type Screen = 'home' | 'checkin' | 'june' | 'team'
interface Msg { id?: string; role: string; content: string; created_at?: string }

const QUICK_QUESTIONS = [
  'Where are the restrooms?',
  'Where can I change or do makeup?',
  'How do props work?',
  'Can I add more time to my session?',
  'What lighting comes with my set?',
  'Can I rent more gear right now?',
]

// ── Thin stroke icons (monotone champagne) ─────────────────────────────────
const ico = { fill: 'none', stroke: CHAMP, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const IconEnter = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" {...ico}>
    <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
    <path d="M4 12h11" /><path d="M11 8l4 4-4 4" />
  </svg>
)
const IconJune = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" {...ico}>
    <circle cx="12" cy="12" r="9" strokeOpacity="0.6" />
    <path d="M14.5 7.5v6a3 3 0 0 1-3 3 2.6 2.6 0 0 1-2.4-1.6" />
  </svg>
)
const IconBell = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" {...ico}>
    <path d="M4.5 17h15" /><path d="M6 17a6 6 0 0 1 12 0" />
    <path d="M12 11V9" /><path d="M10 19.5h4" />
  </svg>
)

export default function KioskPage() {
  const [kioskKey, setKioskKey] = useState<string | undefined>(undefined)
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('key')
    if (k) setKioskKey(k)
  }, [])

  // Real visible height in px — old WebViews misreport 100vh / lack dvh.
  const [vh, setVh] = useState<number | null>(null)
  useEffect(() => {
    // Site global CSS zooms body 1.25x — fatal for fixed-height layouts.
    document.body.style.zoom = '1'
    const measure = () => setVh(window.innerHeight)
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [])

  const [screen, setScreen]   = useState<Screen>('home')
  const [phone, setPhone]     = useState('')
  const [ciResult, setCi]     = useState<any>(null)
  const [ciError, setCiError] = useState('')
  const [busy, setBusy]       = useState(false)
  const [msgs, setMsgs]       = useState<Msg[]>([])
  const [input, setInput]     = useState('')
  const [sending, setSending] = useState(false)
  const [summoned, setSummoned] = useState(false)
  const chatToken = useRef<string | null>(null)
  const lastTs = useRef<string | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const resetToHome = useCallback(() => {
    setScreen('home'); setPhone(''); setCi(null); setCiError('')
    setMsgs([]); setInput(''); setSummoned(false)
    chatToken.current = null
    lastTs.current = null
  }, [])

  const touch = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(resetToHome, IDLE_MS)
  }, [resetToHome])

  useEffect(() => {
    touch()
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [screen, touch])

  // ── Check-in ─────────────────────────────────────────────────────────────
  const digits = phone.replace(/\D/g, '')
  const tapDigit = (d: string) => {
    touch()
    if (d === '⌫') setPhone(p => p.slice(0, -1))
    else if (digits.length < 10) setPhone(p => p + d)
    setCiError('')
  }

  const doCheckin = async () => {
    if (digits.length < 10 || busy) return
    setBusy(true); setCiError('')
    try {
      const r = await fetch('/api/kiosk/checkin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, key: kioskKey }),
      })
      const d = await r.json()
      if (r.ok) setCi(d)
      else setCiError(d.error || 'Something went wrong.')
    } catch { setCiError('Connection hiccup — try again.') }
    setBusy(false)
  }

  // ── June chat ────────────────────────────────────────────────────────────
  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || sending) return
    touch()
    setSending(true); setInput('')
    setMsgs(prev => [...prev, { role: 'user', content: text }])
    requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
    try {
      const r = await fetch('/api/agent/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: chatToken.current ?? undefined,
          message: text,
          kiosk: true,
          kioskGuest: ciResult
            ? `${ciResult.firstName} — checked in, ${ciResult.setName} until ${ciResult.until}`
            : undefined,
          kioskBookingId: ciResult?.bookingId ?? undefined,
        }),
      })
      const d = await r.json()
      if (d.token) chatToken.current = d.token
      if (d.error) setMsgs(prev => [...prev, { role: 'system', content: d.error }])
      // Pull the canonical transcript (our message + June's reply — or just our
      // message if Teddy has taken over, in which case his reply arrives via poll).
      await refreshAll()
    } catch {
      setMsgs(prev => [...prev, { role: 'system', content: 'Connection hiccup — try again.' }])
    }
    setSending(false)
    requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
  }

  // Pull the whole transcript from the server (canonical rows, with ids/timestamps).
  const refreshAll = useCallback(async () => {
    const token = chatToken.current
    if (!token) return
    try {
      const url = new URL('/api/agent/chat', window.location.origin)
      url.searchParams.set('token', token)
      const res = await fetch(url.toString())
      if (!res.ok) return
      const data = await res.json()
      const all: Msg[] = data.messages ?? []
      setMsgs(all)
      lastTs.current = all.length ? (all[all.length - 1].created_at ?? null) : null
      requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
    } catch {}
  }, [])

  // Poll for async replies — most importantly a human takeover from the inbox,
  // which arrives as role 'teddy' with no synchronous response.
  const poll = useCallback(async () => {
    const token = chatToken.current
    if (!token) return
    try {
      const url = new URL('/api/agent/chat', window.location.origin)
      url.searchParams.set('token', token)
      if (lastTs.current) url.searchParams.set('after', lastTs.current)
      const res = await fetch(url.toString())
      if (!res.ok) return
      const data = await res.json()
      const all: Msg[] = data.messages ?? []
      if (!all.length) return
      let fresh = false
      setMsgs(prev => {
        const seen = new Set(prev.map(p => p.id).filter(Boolean))
        const add = all.filter(m => m.id && !seen.has(m.id))
        if (!add.length) return prev
        fresh = true
        return [...prev, ...add]
      })
      lastTs.current = all[all.length - 1].created_at ?? lastTs.current
      if (fresh) {
        touch() // an incoming reply keeps the kiosk awake past the idle wipe
        requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
      }
    } catch {}
  }, [touch])

  // While the June chat is open, poll every 4s so takeover replies show up live.
  useEffect(() => {
    if (screen !== 'june') return
    const iv = setInterval(poll, 4000)
    return () => clearInterval(iv)
  }, [screen, poll])

  // ── Get the team ─────────────────────────────────────────────────────────
  const summon = async () => {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/kiosk/summon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: kioskKey }),
      })
      setSummoned(true)
    } catch {}
    setBusy(false)
  }

  // ── Styles — luxury dark ─────────────────────────────────────────────────
  const wrap: React.CSSProperties = {
    background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
    height: vh ? `${vh}px` : '100vh', color: '#fff',
    fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column',
    userSelect: 'none', overflow: 'hidden',
  }
  const card: React.CSSProperties = {
    flex: 1, margin: '10px 14px', borderRadius: 22, cursor: 'pointer', minHeight: 120,
    background: 'linear-gradient(150deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.015) 60%, rgba(201,178,126,0.05) 100%)',
    border: `1px solid ${HAIR}`,
    boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
    color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 10, fontFamily: 'Inter, sans-serif',
  }
  const backBtn: React.CSSProperties = {
    position: 'absolute', top: 18, left: 18, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.7)', borderRadius: 12,
    padding: '12px 22px', fontSize: 12, letterSpacing: '0.15em', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  }
  const champBtn: React.CSSProperties = {
    background: `linear-gradient(135deg, #d7c08b 0%, #b59a63 55%, #9c8250 100%)`,
    color: INK, border: 'none', padding: '17px 40px', borderRadius: 14,
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.18em',
    cursor: 'pointer', boxShadow: '0 10px 26px rgba(201,178,126,0.18)',
  }

  const header = (
    <div style={{ textAlign: 'center', padding: '26px 20px 2px', flexShrink: 0 }}>
      <div style={{ fontWeight: 900, letterSpacing: '0.3em', fontSize: 21 }}>MADE KULTURE</div>
      <div style={{ fontSize: 10, color: CHAMP_DIM, letterSpacing: '0.42em', marginTop: 7 }}>FRONT DESK</div>
    </div>
  )

  // ── Screens ──────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <main style={wrap} onPointerDown={touch}>
      {header}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '8px 14px 20px', maxWidth: 680, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <button style={card} onClick={() => setScreen('checkin')}>
          <IconEnter />
          <span style={{ fontSize: 23, fontWeight: 800, letterSpacing: '0.2em' }}>CHECK IN</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)' }}>Here for your booking</span>
        </button>
        <button style={card} onClick={() => { setScreen('june'); touch() }}>
          <IconJune />
          <span style={{ fontSize: 23, fontWeight: 800, letterSpacing: '0.2em' }}>ASK JUNE</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)' }}>Sets · gear · rules · directions</span>
        </button>
        <button style={card} onClick={() => setScreen('team')}>
          <IconBell />
          <span style={{ fontSize: 23, fontWeight: 800, letterSpacing: '0.2em' }}>GET THE TEAM</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)' }}>Need a human — we'll come find you</span>
        </button>
      </div>
    </main>
  )

  if (screen === 'checkin') return (
    <main style={{ ...wrap, position: 'relative' }} onPointerDown={touch}>
      <button style={backBtn} onClick={resetToHome}>← BACK</button>
      {header}
      {ciResult ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.34em', color: CHAMP_DIM, marginBottom: 18 }}>
            {ciResult.alreadyCheckedIn ? 'ALREADY CHECKED IN' : 'CHECKED IN'}
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.02em', marginBottom: 12 }}>
            Welcome, {ciResult.firstName}
          </div>
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6 }}>
            {ciResult.setName} · {ciResult.startsAt ? `starts ${ciResult.startsAt}, ` : ''}until {ciResult.until}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 16, maxWidth: 430, lineHeight: 1.7 }}>
            Wrap up and return props before your time ends — overages past 15 minutes auto-charge an hour. Have a great shoot.
          </div>
          <button onClick={resetToHome} style={{ ...champBtn, marginTop: 28 }}>DONE</button>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 14, overflowY: 'auto' }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '2px 0 12px' }}>Enter the phone number you booked with</div>
          <div style={{ fontSize: 30, letterSpacing: 6, fontWeight: 700, minHeight: 42, color: digits.length ? CHAMP : 'rgba(255,255,255,0.18)' }}>
            {digits.length ? digits.replace(/(\d{3})(\d{0,3})(\d{0,4})/, (_m, a, b, c) => [a, b, c].filter(Boolean).join('-')) : '___ ___ ____'}
          </div>
          {ciError && <div style={{ color: 'rgba(255,255,255,0.75)', borderLeft: `2px solid ${CHAMP_DIM}`, paddingLeft: 10, fontSize: 14, margin: '8px 0', maxWidth: 430, textAlign: 'left', lineHeight: 1.5 }}>{ciError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 90px)', gap: 10, marginTop: 12 }}>
            {['1','2','3','4','5','6','7','8','9','⌫','0','GO'].map(k => (
              <button key={k}
                onClick={() => k === 'GO' ? doCheckin() : tapDigit(k)}
                disabled={k === 'GO' && (digits.length < 10 || busy)}
                style={{
                  height: 70, borderRadius: 16, fontSize: k === 'GO' ? 14 : 23, fontWeight: k === 'GO' ? 800 : 500,
                  fontFamily: 'Inter, sans-serif', cursor: 'pointer', letterSpacing: k === 'GO' ? '0.16em' : undefined,
                  background: k === 'GO'
                    ? (digits.length >= 10 ? 'linear-gradient(135deg, #d7c08b, #9c8250)' : 'rgba(255,255,255,0.03)')
                    : 'linear-gradient(150deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))',
                  color: k === 'GO' ? (digits.length >= 10 ? INK : 'rgba(255,255,255,0.25)') : '#fff',
                  border: k === 'GO' && digits.length >= 10 ? 'none' : '1px solid rgba(255,255,255,0.13)',
                }}>
                {k === 'GO' && busy ? '…' : k}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  )

  if (screen === 'june') return (
    <main style={{ ...wrap, position: 'relative' }} onPointerDown={touch}>
      <button style={backBtn} onClick={resetToHome}>← BACK</button>
      {header}
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px', maxWidth: 780, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <div style={{ display: 'inline-flex' }}><IconJune /></div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8, marginTop: 10 }}>
              I'm June — ask me anything about the studio.
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em', marginTop: 4 }}>
              AI ASSISTANT · CHATS MONITORED BY THE TEAM
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            {m.role === 'teddy' && (
              <div style={{ fontSize: 10, letterSpacing: '0.14em', color: CHAMP_DIM, marginBottom: 4, marginLeft: 4 }}>MADE KULTURE TEAM</div>
            )}
            <div style={{
              maxWidth: '80%', padding: '13px 17px', fontSize: 16, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              background: m.role === 'user'
                ? 'linear-gradient(135deg, #f4ede0, #e4d9c4)'
                : 'linear-gradient(150deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))',
              color: m.role === 'user' ? INK : 'rgba(255,255,255,0.92)',
              border: m.role === 'user' ? 'none' : `1px solid rgba(255,255,255,0.12)`,
              borderRadius: m.role === 'user' ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && <div style={{ fontSize: 11, color: CHAMP_DIM, letterSpacing: '0.18em' }}>JUNE IS TYPING…</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 16px 0', maxWidth: 780, width: '100%', margin: '0 auto', boxSizing: 'border-box', flexShrink: 0, justifyContent: 'center' }}>
        {QUICK_QUESTIONS.map(q => (
          <button key={q} disabled={sending} onClick={() => send(q)} style={{
            background: 'rgba(255,255,255,0.035)', border: `1px solid ${HAIR}`, color: 'rgba(255,255,255,0.7)',
            padding: '10px 18px', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          }}>{q}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 16, maxWidth: 780, width: '100%', margin: '0 auto', boxSizing: 'border-box', flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => { setInput(e.target.value); touch() }}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          onFocus={e => { touch(); setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 350) }}
          placeholder="Or type your own question…"
          maxLength={1000}
          style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 16, padding: '15px 18px', outline: 'none', borderRadius: 14 }}
        />
        <button onClick={() => send()} disabled={sending || !input.trim()} style={{
          ...(input.trim()
            ? { background: 'linear-gradient(135deg, #d7c08b, #9c8250)', color: INK, border: 'none' }
            : { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.12)' }),
          padding: '0 26px', borderRadius: 14, fontSize: 12, fontWeight: 800, letterSpacing: '0.16em',
          cursor: input.trim() ? 'pointer' : 'default', fontFamily: 'Inter, sans-serif',
        }}>SEND</button>
      </div>
    </main>
  )

  // screen === 'team'
  return (
    <main style={{ ...wrap, position: 'relative' }} onPointerDown={touch}>
      <button style={backBtn} onClick={resetToHome}>← BACK</button>
      {header}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <IconBell />
        {summoned ? (
          <>
            <div style={{ fontSize: 11, letterSpacing: '0.34em', color: CHAMP_DIM, margin: '18px 0 12px' }}>TEAM NOTIFIED</div>
            <div style={{ fontSize: 27, fontWeight: 800, marginBottom: 12 }}>Someone's on the way</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 420 }}>
              In a hurry? Text us at (832) 408-1631.
            </div>
            <button onClick={resetToHome} style={{ ...champBtn, marginTop: 28 }}>DONE</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 27, fontWeight: 800, margin: '16px 0 12px' }}>Need a human?</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 28, maxWidth: 420, lineHeight: 1.7 }}>
              Tap below and the team gets a notification that you're waiting up front.
            </div>
            <button disabled={busy} onClick={summon} style={{ ...champBtn, padding: '20px 52px' }}>
              {busy ? '…' : 'RING THE TEAM'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

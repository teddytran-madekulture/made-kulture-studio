'use client'

// In-studio kiosk (wall tablet, e.g. Fire HD 10 in Fully Kiosk Browser).
// URL: /kiosk  (or /kiosk?key=XXXX when KIOSK_KEY is set in Vercel)
//
// Design: monotone, typographic — matches the site's black/white language.
// Screens: HOME (3 buttons) → CHECK IN / ASK JUNE / GET THE TEAM.
// Shared-device privacy: returns to HOME + wipes the June chat after 90s idle.

import { useCallback, useEffect, useRef, useState } from 'react'

const IDLE_MS = 90_000

type Screen = 'home' | 'checkin' | 'june' | 'team'
interface Msg { role: string; content: string }

const QUICK_QUESTIONS = [
  'Where are the restrooms?',
  'Where can I change or do makeup?',
  'How do props work?',
  'Can I add more time to my session?',
  'What lighting comes with my set?',
  'Can I rent more gear right now?',
]

export default function KioskPage() {
  // Read ?key= without useSearchParams (avoids the Suspense requirement).
  const [kioskKey, setKioskKey] = useState<string | undefined>(undefined)
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('key')
    if (k) setKioskKey(k)
  }, [])

  // Real visible height in px — old WebViews (Fire HD) misreport 100vh and
  // don't support dvh. innerHeight is the truth everywhere.
  const [vh, setVh] = useState<number | null>(null)
  useEffect(() => {
    // The site's global CSS zooms body 1.25x (marketing pages). On a fixed-
    // height kiosk that inflates the layout past the screen — kill it here.
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
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ── Idle reset (privacy on a shared tablet) ──────────────────────────────
  const resetToHome = useCallback(() => {
    setScreen('home'); setPhone(''); setCi(null); setCiError('')
    setMsgs([]); setInput(''); setSummoned(false)
    chatToken.current = null
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
        }),
      })
      const d = await r.json()
      if (d.token) chatToken.current = d.token
      if (d.reply) setMsgs(prev => [...prev, { role: 'agent', content: d.reply }])
      else if (d.error) setMsgs(prev => [...prev, { role: 'system', content: d.error }])
    } catch {
      setMsgs(prev => [...prev, { role: 'system', content: 'Connection hiccup — try again.' }])
    }
    setSending(false)
    requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })
  }

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

  // ── Styles — monotone, typographic ───────────────────────────────────────
  const wrap: React.CSSProperties = {
    background: '#080808', height: vh ? `${vh}px` : '100vh', color: '#fff',
    fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column',
    userSelect: 'none', overflow: 'hidden',
  }
  const bigBtn: React.CSSProperties = {
    flex: 1, margin: '10px 12px', border: '1px solid rgba(255,255,255,0.18)',
    background: 'transparent', color: '#fff', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, fontFamily: 'Inter, sans-serif', minHeight: 120,
  }
  const backBtn: React.CSSProperties = {
    position: 'absolute', top: 18, left: 18, background: 'transparent',
    border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.65)',
    padding: '12px 22px', fontSize: 12, letterSpacing: '0.15em', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  }
  const solidBtn: React.CSSProperties = {
    background: '#fff', color: '#080808', border: 'none', padding: '16px 36px',
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.18em',
    cursor: 'pointer',
  }
  const rule: React.CSSProperties = { width: 28, height: 1, background: 'rgba(255,255,255,0.35)' }

  const header = (
    <div style={{ textAlign: 'center', padding: '28px 20px 4px', flexShrink: 0 }}>
      <div style={{ fontWeight: 800, letterSpacing: '0.3em', fontSize: 20 }}>MADE KULTURE</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.35em', marginTop: 6 }}>FRONT DESK</div>
    </div>
  )

  // ── Screens ──────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <main style={wrap} onPointerDown={touch}>
      {header}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 16px 22px', maxWidth: 680, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <button style={bigBtn} onClick={() => setScreen('checkin')}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.22em' }}>CHECK IN</span>
          <span style={rule} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>Here for your booking</span>
        </button>
        <button style={bigBtn} onClick={() => { setScreen('june'); touch() }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.22em' }}>ASK JUNE</span>
          <span style={rule} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>Sets · gear · rules · directions</span>
        </button>
        <button style={bigBtn} onClick={() => setScreen('team')}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.22em' }}>GET THE TEAM</span>
          <span style={rule} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>Need a human — we'll come find you</span>
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
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>
            {ciResult.alreadyCheckedIn ? 'ALREADY CHECKED IN' : 'CHECKED IN'}
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 12 }}>
            Welcome, {ciResult.firstName}
          </div>
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            {ciResult.setName} · {ciResult.startsAt ? `starts ${ciResult.startsAt}, ` : ''}until {ciResult.until}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 16, maxWidth: 420, lineHeight: 1.7 }}>
            Wrap up and return props before your time ends — overages past 15 minutes auto-charge an hour. Have a great shoot.
          </div>
          <button onClick={resetToHome} style={{ ...solidBtn, marginTop: 28 }}>DONE</button>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 14, overflowY: 'auto' }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '4px 0 14px', letterSpacing: '0.04em' }}>Enter the phone number you booked with</div>
          <div style={{ fontSize: 30, letterSpacing: 6, fontWeight: 700, minHeight: 42, color: digits.length ? '#fff' : 'rgba(255,255,255,0.2)' }}>
            {digits.length ? digits.replace(/(\d{3})(\d{0,3})(\d{0,4})/, (_m, a, b, c) => [a, b, c].filter(Boolean).join('-')) : '___-___-____'}
          </div>
          {ciError && <div style={{ color: 'rgba(255,255,255,0.75)', borderLeft: '2px solid rgba(255,255,255,0.4)', paddingLeft: 10, fontSize: 14, margin: '8px 0', maxWidth: 420, textAlign: 'left', lineHeight: 1.5 }}>{ciError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 88px)', gap: 10, marginTop: 12 }}>
            {['1','2','3','4','5','6','7','8','9','⌫','0','GO'].map(k => (
              <button key={k}
                onClick={() => k === 'GO' ? doCheckin() : tapDigit(k)}
                disabled={k === 'GO' && (digits.length < 10 || busy)}
                style={{
                  height: 70, fontSize: k === 'GO' ? 15 : 24, fontWeight: k === 'GO' ? 800 : 500,
                  fontFamily: 'Inter, sans-serif', cursor: 'pointer', letterSpacing: k === 'GO' ? '0.15em' : undefined,
                  background: k === 'GO' ? (digits.length >= 10 ? '#fff' : 'transparent') : 'transparent',
                  color: k === 'GO' ? (digits.length >= 10 ? '#080808' : 'rgba(255,255,255,0.25)') : '#fff',
                  border: '1px solid rgba(255,255,255,0.18)',
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
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 20px', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {msgs.length === 0 && (
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, textAlign: 'center', marginTop: 26, letterSpacing: '0.02em' }}>
            I'm June — ask me anything about the studio.<br />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>AI assistant · chats are monitored by the team</span>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '80%', padding: '12px 16px', fontSize: 16, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? '#fff' : 'transparent',
              color: m.role === 'user' ? '#080808' : 'rgba(255,255,255,0.9)',
              border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.16)',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>JUNE IS TYPING…</div>}
      </div>
      {/* Tap-to-ask — most guests never need the keyboard */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '6px 16px 0', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box', flexShrink: 0, justifyContent: 'center' }}>
        {QUICK_QUESTIONS.map(q => (
          <button key={q} disabled={sending} onClick={() => send(q)} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.65)',
            padding: '10px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em',
          }}>{q}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 16, maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box', flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => { setInput(e.target.value); touch() }}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          onFocus={e => { touch(); setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 350) }}
          placeholder="Or type your own question…"
          maxLength={1000}
          style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 16, padding: '15px 17px', outline: 'none' }}
        />
        <button onClick={() => send()} disabled={sending || !input.trim()} style={{
          background: input.trim() ? '#fff' : 'transparent', color: input.trim() ? '#080808' : 'rgba(255,255,255,0.25)',
          border: input.trim() ? 'none' : '1px solid rgba(255,255,255,0.18)', padding: '0 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em',
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
        {summoned ? (
          <>
            <div style={{ fontSize: 11, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.45)', marginBottom: 18 }}>TEAM NOTIFIED</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 12 }}>Someone's on the way</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 420 }}>
              In a hurry? Text us at (832) 408-1631.
            </div>
            <button onClick={resetToHome} style={{ ...solidBtn, marginTop: 28 }}>DONE</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.04em', marginBottom: 12 }}>Need a human?</div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 28, maxWidth: 420, lineHeight: 1.7 }}>
              Tap below and the team gets a notification that you're waiting up front.
            </div>
            <button disabled={busy} onClick={summon} style={{ ...solidBtn, padding: '20px 48px' }}>
              {busy ? '…' : 'RING THE TEAM'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

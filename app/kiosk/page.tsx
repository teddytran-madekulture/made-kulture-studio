'use client'

// In-studio kiosk (wall tablet, e.g. Fire HD 10 in Fully Kiosk Browser).
// URL: /kiosk  (or /kiosk?key=XXXX when KIOSK_KEY is set in Vercel)
//
// Screens: HOME (3 big buttons) → CHECK IN / ASK JUNE / GET THE TEAM.
// Shared-device privacy: returns to HOME + wipes the June chat after 90s idle.

import { useCallback, useEffect, useRef, useState } from 'react'

const GOLD = '#d4a843'
const IDLE_MS = 90_000

type Screen = 'home' | 'checkin' | 'june' | 'team'
interface Msg { role: string; content: string }

export default function KioskPage() {
  // Read ?key= without useSearchParams (avoids the Suspense requirement).
  const [kioskKey, setKioskKey] = useState<string | undefined>(undefined)
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('key')
    if (k) setKioskKey(k)
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
          // If they checked in during this kiosk session, June knows who's talking.
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

  // ── Styles ───────────────────────────────────────────────────────────────
  // 100dvh = the REAL visible height (Fire/mobile browsers misreport 100vh,
  // which pushed the chat input off-screen). Falls back to 100vh where dvh
  // is unsupported.
  const wrap: React.CSSProperties = {
    background: '#080808', height: '100vh', maxHeight: '100dvh', color: '#fff',
    fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column',
    userSelect: 'none', overflow: 'hidden',
  }
  const bigBtn: React.CSSProperties = {
    flex: 1, margin: 12, borderRadius: 16, border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.04)', color: '#fff', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 14, fontFamily: 'Inter, sans-serif', minHeight: 160,
  }
  const backBtn: React.CSSProperties = {
    position: 'absolute', top: 18, left: 18, background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)',
    padding: '12px 20px', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  }

  const header = (
    <div style={{ textAlign: 'center', padding: '30px 20px 6px' }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '0.25em', fontSize: 22 }}>MADE KULTURE</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', marginTop: 4 }}>FRONT DESK</div>
    </div>
  )

  // ── Screens ──────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <main style={wrap} onPointerDown={touch}>
      {header}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, maxWidth: 700, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <button style={bigBtn} onClick={() => setScreen('checkin')}>
          <span style={{ fontSize: 44 }}>🎬</span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.1em' }}>CHECK IN</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Here for your booking? Tap here.</span>
        </button>
        <button style={bigBtn} onClick={() => { setScreen('june'); touch() }}>
          <span style={{ width: 54, height: 54, borderRadius: '50%', background: GOLD, color: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 26 }}>J</span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.1em' }}>ASK JUNE</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Questions about sets, gear, rules, anything.</span>
        </button>
        <button style={bigBtn} onClick={() => setScreen('team')}>
          <span style={{ fontSize: 44 }}>🛎️</span>
          <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.1em' }}>GET THE TEAM</span>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>Need a human? We'll come find you.</span>
        </button>
      </div>
    </main>
  )

  if (screen === 'checkin') return (
    <main style={{ ...wrap, position: 'relative' }} onPointerDown={touch}>
      <button style={backBtn} onClick={resetToHome}>← BACK</button>
      {header}
      {ciResult ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 60, marginBottom: 18 }}>{ciResult.alreadyCheckedIn ? '👍' : '✅'}</div>
          <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 10 }}>
            {ciResult.alreadyCheckedIn ? `You're already in, ${ciResult.firstName}!` : `Welcome, ${ciResult.firstName}!`}
          </div>
          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
            {ciResult.setName} · {ciResult.startsAt ? `starts ${ciResult.startsAt}, ` : ''}until {ciResult.until}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 16, maxWidth: 420, lineHeight: 1.6 }}>
            Wrap up and return props before your time ends — overages past 15 min auto-charge an hour. Have a great shoot! 🎥
          </div>
          <button onClick={resetToHome} style={{ marginTop: 26, background: GOLD, color: '#080808', border: 'none', padding: '16px 34px', borderRadius: 10, fontSize: 16, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>DONE</button>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16 }}>
          <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', margin: '6px 0 14px' }}>Enter the phone number you booked with</div>
          <div style={{ fontSize: 34, letterSpacing: 6, fontWeight: 700, minHeight: 46, color: digits.length ? '#fff' : 'rgba(255,255,255,0.25)' }}>
            {digits.length ? digits.replace(/(\d{3})(\d{0,3})(\d{0,4})/, (_m, a, b, c) => [a, b, c].filter(Boolean).join('-')) : '___-___-____'}
          </div>
          {ciError && <div style={{ color: '#f87171', fontSize: 15, margin: '8px 0', maxWidth: 420, textAlign: 'center' }}>{ciError}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 92px)', gap: 12, marginTop: 14 }}>
            {['1','2','3','4','5','6','7','8','9','⌫','0','GO'].map(k => (
              <button key={k}
                onClick={() => k === 'GO' ? doCheckin() : tapDigit(k)}
                disabled={k === 'GO' && (digits.length < 10 || busy)}
                style={{
                  height: 76, borderRadius: 12, fontSize: k === 'GO' ? 18 : 26, fontWeight: 800,
                  fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                  background: k === 'GO' ? (digits.length >= 10 ? GOLD : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.06)',
                  color: k === 'GO' ? (digits.length >= 10 ? '#080808' : 'rgba(255,255,255,0.3)') : '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
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
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 20px', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {msgs.length === 0 && (
          <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, textAlign: 'center', marginTop: 30 }}>
            Hey, I'm June 👋 Ask me anything about the studio — sets, gear, rules, where things are. (I'm an AI assistant; chats are monitored by the team.)
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
            <div style={{
              maxWidth: '80%', padding: '12px 16px', fontSize: 17, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? '#fff' : 'rgba(255,255,255,0.07)',
              color: m.role === 'user' ? '#080808' : 'rgba(255,255,255,0.92)',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.1)',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>June is typing…</div>}
      </div>
      {/* Tap-to-ask — most guests never need the keyboard */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 16px 0', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {[
          '🚻 Where are the restrooms?',
          '💄 Where can I change or do makeup?',
          '🛋 How do props work?',
          '⏰ Can I add more time to my session?',
          '💡 What lighting comes with my set?',
          '🎥 Can I rent more gear right now?',
        ].map(q => (
          <button key={q} disabled={sending} onClick={() => send(q.replace(/^\S+\s/, ''))} style={{
            background: 'rgba(212,168,67,0.1)', border: `1px solid rgba(212,168,67,0.4)`, color: GOLD,
            padding: '10px 14px', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}>{q}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 16, maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <input
          value={input}
          onChange={e => { setInput(e.target.value); touch() }}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          onFocus={e => { touch(); setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 350) }}
          placeholder="Or type your own question…"
          maxLength={1000}
          style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 17, padding: '16px 18px', outline: 'none', borderRadius: 10 }}
        />
        <button onClick={() => send()} disabled={sending || !input.trim()} style={{
          background: input.trim() ? GOLD : 'rgba(255,255,255,0.1)', color: input.trim() ? '#080808' : 'rgba(255,255,255,0.3)',
          border: 'none', padding: '0 26px', borderRadius: 10, fontSize: 15, fontWeight: 800, letterSpacing: '0.08em',
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        {summoned ? (
          <>
            <div style={{ fontSize: 60, marginBottom: 18 }}>🛎️</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>The team's been pinged!</div>
            <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, maxWidth: 420 }}>
              Someone will be with you shortly. In a hurry? Text us at (832) 408-1631.
            </div>
            <button onClick={resetToHome} style={{ marginTop: 26, background: GOLD, color: '#080808', border: 'none', padding: '16px 34px', borderRadius: 10, fontSize: 16, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>DONE</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 60, marginBottom: 18 }}>🛎️</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 10 }}>Need a human?</div>
            <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginBottom: 26 }}>
              Tap below and we'll get a notification that you're waiting up front.
            </div>
            <button disabled={busy} onClick={summon} style={{ background: GOLD, color: '#080808', border: 'none', padding: '20px 44px', borderRadius: 12, fontSize: 19, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              {busy ? '…' : '🛎️ RING THE TEAM'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

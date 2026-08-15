'use client'

// In-studio kiosk (wall tablet / rolling touchscreen).
// URL: /kiosk                              — the original shared tablet
//      /kiosk?set=set-a&key=XXXX          — a tablet bolted inside one set
//
// THE URL IS THE TABLET'S IDENTITY. Same pattern as the jukebox players.
// Rejected alternatives: a localStorage device UUID (a cleared cache silently
// orphans a tablet) and hardware fingerprinting (unreliable on Fire OS/Silk).
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

type Screen = 'home' | 'checkin' | 'june' | 'team' | 'addtime'
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
  <svg width="54" height="54" viewBox="0 0 24 24" {...ico}>
    <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
    <path d="M4 12h11" /><path d="M11 8l4 4-4 4" />
  </svg>
)
const IconJune = () => (
  <svg width="54" height="54" viewBox="0 0 24 24" {...ico}>
    <circle cx="12" cy="12" r="9" strokeOpacity="0.6" />
    <path d="M14.5 7.5v6a3 3 0 0 1-3 3 2.6 2.6 0 0 1-2.4-1.6" />
  </svg>
)
const IconClock = () => (
  <svg width="54" height="54" viewBox="0 0 24 24" {...ico}>
    <circle cx="12" cy="12" r="9" strokeOpacity="0.6" />
    <path d="M12 7v5l3.5 2" />
  </svg>
)
const IconBell = () => (
  <svg width="54" height="54" viewBox="0 0 24 24" {...ico}>
    <path d="M4.5 17h15" /><path d="M6 17a6 6 0 0 1 12 0" />
    <path d="M12 11V9" /><path d="M10 19.5h4" />
  </svg>
)

export default function KioskPage() {
  const [kioskKey, setKioskKey] = useState<string | undefined>(undefined)
  const [setSlug, setSetSlug]   = useState<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const k = q.get('key')
    if (k) setKioskKey(k)
    setSetSlug(q.get('set'))
  }, [])

  // ── Who is on this set ────────────────────────────────────────────────────
  // ⚠️ POLLING IS THE #1 COST IN THIS PROJECT. A flat 5s jukebox poll once ate
  // 78% of all Vercel compute and hit 100% of the free CPU cap — which would
  // have killed door codes for booked guests. Occupancy changes a handful of
  // times a day, so this refreshes every 5 MINUTES (plus on return to home).
  // The countdown ticks locally off endISO and costs nothing.
  const [ctx, setCtx] = useState<any>(null)
  const fetchCtx = useCallback(async () => {
    if (!setSlug) return
    try {
      const q = new URLSearchParams({ set: setSlug })
      const k = new URLSearchParams(window.location.search).get('key')
      if (k) q.set('key', k)
      const r = await fetch(`/api/kiosk/context?${q}`, { cache: 'no-store' })
      if (r.ok) setCtx(await r.json())
    } catch { /* offline — keep showing the last known state */ }
  }, [setSlug])
  useEffect(() => {
    if (!setSlug) return
    fetchCtx()
    const iv = setInterval(fetchCtx, 5 * 60_000)
    return () => clearInterval(iv)
  }, [setSlug, fetchCtx])

  // Local clock so the countdown moves without touching the network.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(iv)
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
  // ── ADD TIME ──────────────────────────────────────────────────────────────
  // 'pick' choose a length -> 'confirm' the server's price -> 'done' or 'phone'.
  // ⚠️ The PRICE IS NEVER COMPUTED HERE. The tablet knows how many hours are
  // available but not what an hour costs (per-customer overrides live in
  // lib/extensions), so it asks the server and prints what comes back.
  const [extStep,  setExtStep]  = useState<'pick' | 'confirm' | 'done' | 'phone'>('pick')
  const [extReq,   setExtReq]   = useState<any>(null)
  const [extError, setExtError] = useState('')
  const [extUntil, setExtUntil] = useState('')
  const [msgs, setMsgs]       = useState<Msg[]>([])
  const [input, setInput]     = useState('')
  const [sending, setSending] = useState(false)
  // null = hasn't rung | 'waiting' | 'onway' | 'noanswer' | 'failed'.
  // The old boolean could only say "I sent a fetch", which is not the same
  // fact as "a human is coming" — and the screen printed the second one.
  const [summonState, setSummonState] = useState<string | null>(null)
  const [summonPhone, setSummonPhone] = useState('')
  const chatToken = useRef<string | null>(null)
  const lastTs = useRef<string | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ringOpen  = useRef(false)   // a guest is waiting on a human right now
  const listRef = useRef<HTMLDivElement>(null)
  const buildVer = useRef<string | null>(null)   // build the tablet loaded with
  const needsReload = useRef(false)               // a newer build is live, waiting for idle
  const screenRef = useRef<Screen>('home')

  const resetToHome = useCallback(() => {
    // ⚠️ Never yank the screen away from someone waiting on a human. The 90s
    // idle reset would fire long before Teddy walked over, and the answer they
    // were waiting for would land on a screen nobody was looking at.
    if (ringOpen.current) return
    setScreen('home'); setPhone(''); setCi(null); setCiError('')
    setMsgs([]); setInput(''); setSummonState(null); setSummonPhone('')
    setExtStep('pick'); setExtReq(null); setExtError(''); setExtUntil('')
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

  // ── Self-update ────────────────────────────────────────────────────────────
  // The tablet's WebView keeps serving the old app after we deploy. Poll a tiny
  // version endpoint; when the live build changes, reload — but only while idle
  // on HOME so we never interrupt a check-in or a June chat. If a new build lands
  // while someone's mid-use, we flag it and reload the moment they return home.
  useEffect(() => { screenRef.current = screen }, [screen])

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const { version } = await r.json()
        if (!version) return
        if (buildVer.current === null) { buildVer.current = version; return }
        if (version !== buildVer.current) {
          if (screenRef.current === 'home') window.location.reload()
          else needsReload.current = true
        }
      } catch {}
    }
    check()
    const iv = setInterval(check, 120_000)
    return () => clearInterval(iv)
  }, [])

  // Flush a pending update the moment the kiosk falls back to HOME.
  useEffect(() => {
    if (screen === 'home' && needsReload.current) window.location.reload()
  }, [screen])

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
      const r = await fetch('/api/kiosk/summon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: kioskKey, set: setSlug }),
      })
      // ⚠️ READ THE RESPONSE. This used to setSummoned(true) on any resolved
      // fetch, so a throttled call that notified NOBODY still told the guest
      // someone was on the way.
      const j = await r.json().catch(() => ({}))
      if (j?.phone) setSummonPhone(j.phone)
      setSummonState(j?.state || (r.ok ? 'waiting' : 'failed'))
    } catch { setSummonState('failed') }
    setBusy(false)
  }

  // Keep the idle reset off this screen while a ring is outstanding.
  useEffect(() => { ringOpen.current = summonState === 'waiting' }, [summonState])

  // Poll ONLY while a ring is actually outstanding and the guest is on this
  // screen — it stops the moment Teddy commits or we give up, so there is no
  // always-on poll here. (The jukebox's flat 5s poll once ate 78% of all
  // Vercel compute; every poll in this project has to justify itself.)
  useEffect(() => {
    if (screen !== 'team' || summonState !== 'waiting') return
    const iv = setInterval(async () => {
      try {
        const q = new URLSearchParams()
        if (kioskKey) q.set('key', kioskKey)
        const r = await fetch(`/api/kiosk/summon?${q}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (j?.state) setSummonState(j.state)
      } catch { /* offline — keep showing "ringing", never downgrade to a promise */ }
    }, 5000)
    return () => clearInterval(iv)
  }, [screen, summonState, kioskKey])

  // Render June's [label](url) markdown links as tappable champagne buttons
  // (mirrors the web widget). Internal paths open in-tab; full URLs (e.g. prop
  // photos on Supabase storage) open a new tab.
  const renderContent = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    const re = /(!?)\[([^\]]+)\]\((\/[^\s)]+|https?:\/\/[^\s)]+)\)/g
    let last = 0, k = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) parts.push(text.slice(last, match.index))
      const isImg = match[1] === '!'
      const label = match[2]
      const href = match[3]
      if (isImg) {
        // Inline prop photo — keeps the guest in the kiosk (a link would navigate away).
        parts.push(
          <img key={k++} src={href} alt={label} style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 14, margin: '8px 0 4px' }} />
        )
      } else {
        // Hard guardrail: the kiosk is a shared in-studio tablet — it must NEVER
        // navigate away. Render any would-be link as plain, non-tappable text so
        // a stray link from June can't strand the tablet off the kiosk.
        parts.push(<span key={k++} style={{ fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{label}</span>)
      }
      last = match.index + match[0].length
    }
    if (last < text.length) parts.push(text.slice(last))
    return parts
  }

  // ── Styles — luxury dark ─────────────────────────────────────────────────
  const wrap: React.CSSProperties = {
    background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
    height: vh ? `${vh}px` : '100vh', color: '#fff',
    fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column',
    userSelect: 'none', overflow: 'hidden',
    // Kills double-tap-to-zoom, which the viewport meta does not cover.
    touchAction: 'manipulation',
  }
  const card: React.CSSProperties = {
    flex: '1 1 0', margin: '9px 14px', borderRadius: 22, cursor: 'pointer',
    // Capped. These were `flex: 1` with no ceiling, so on a tall tablet they
    // stretched into near-empty slabs while the type stayed at 23px — the
    // boxes grew with the screen and the words didn't.
    minHeight: 150, maxHeight: 240,
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

  // ── Ambient room state ────────────────────────────────────────────────────
  // Deliberately NOT wiped by the 90-second idle reset. The June chat is
  // somebody's private conversation and must be wiped; who is booked in this
  // room is the state of the room itself, visible to anyone standing in it.
  const occ = ctx?.occupancy
  const occLive = occ && occ.kind !== 'none' && occ.endISO
  const minsLeft = occLive ? Math.round((Date.parse(occ.endISO) - nowMs) / 60000) : 0
  const notStarted = occLive && Date.parse(occ.startISO) > nowMs
  const clock = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

  // ⚠️ RUNNING OVER IS CHARGED AN EXTRA HOUR, and this tablet is the only
  // thing in the room that knows the clock. It used to render "15 min left" in
  // the same 12px 45%-grey it had used for "until 7:00 PM" an hour earlier — the
  // most urgent moment of the session drawn as the least prominent line on the
  // screen. The session-reminder cron texts them; the screen said nothing.
  const started  = occLive && !notStarted
  // ⚠️ DO NOT PUT A GUEST'S NAME ON THE WALL BEFORE THEIR SESSION STARTS.
  // Occupancy reaches 30 minutes ahead so an early arrival can still one-tap
  // check in — that part is right. Printing their first name that early is not:
  // the room may still hold the previous shoot, and during shared hours anyone
  // walking past reads it. Once they have started or checked in they are here,
  // and greeting them by name is the whole point.
  const nameOk = !!(started || occ?.checkedIn)
  const urgency  = !started || minsLeft > 15 ? null : minsLeft > 5 ? 'soon' : 'now'
  const urgColor = urgency === 'now' ? '#ff6b6b' : '#e8a33d'

  // Half-hour label. lib/extensions has durationLabel() but that module pulls in
  // supabaseAdmin and node:crypto — it cannot be imported into a client bundle.
  const hoursLabel = (h: number) => {
    const m = Math.round(h * 60)
    if (m < 60) return `${m} min`
    const hh = Math.floor(m / 60), mm = m % 60
    return mm ? `${hh} hr ${mm} min` : `${hh} hour${hh > 1 ? 's' : ''}`
  }

  // What happens AFTER them. The 15-minute wrap-up text already says this (see
  // app/api/cron/session-reminder); this is the same fact on the surface the
  // guest is actually looking at, for the one whose phone is in a bag across the
  // room. ⚠️ NEVER the next guest's NAME — the person who rented this room
  // agreed to be greeted by name on a wall screen. The next one didn't.
  const nextStart = occ?.nextStartISO ?? null
  const headroom  = occ?.headroomHours ?? 0
  // Same one-hour handover window the wrap-up text uses, so the screen and the
  // SMS can never contradict each other about whether someone is "right after".
  const handoverSoon = !!(nextStart && occLive && Date.parse(nextStart) - Date.parse(occ.endISO) <= 60 * 60_000)
  const canAddTime = !!(occLive && started && occ.extendable && headroom >= 0.5)

  // ⚠️ FOUR STACKED TILES DO NOT FIT A LANDSCAPE FIRE HD 10. Measured: the
  // column needs 913px of viewport at the 150px tile floor, and the tablet has
  // about 800 CSS px (1920 / 1.5 dpr). GET THE TEAM would sit below the fold on
  // a kiosk with no scrollbar and nobody to scroll it. Shrinking the tiles is no
  // fix either — icon + title + subtitle is ~138px on its own. So the fourth
  // tile changes the SHAPE: one column becomes a 2x2 grid, which is the better
  // use of a wide screen anyway.
  const tile: React.CSSProperties = canAddTime
    ? { ...card, flex: '1 1 calc(50% - 28px)', minHeight: 200 }
    : card

  const occupancyLine = !setSlug ? null : (
    <div style={{ textAlign: 'center', padding: '0 20px 4px', flexShrink: 0 }}>
      <style>{'@keyframes mkPulse{0%,100%{opacity:1}50%{opacity:0.45}}'}</style>
      <div style={{ fontSize: 17, fontWeight: 700, color: CHAMP_DIM, letterSpacing: '0.34em' }}>
        {ctx?.set?.name?.toUpperCase() ?? setSlug.toUpperCase()}
      </div>
      {occLive ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '0.01em', lineHeight: 1.05 }}>
            {nameOk ? `${occ.firstName}${occ.buyout ? ' · full studio' : ''}` : 'Next session'}
          </div>
          {urgency ? (
            <div style={{
              display: 'inline-block', marginTop: 12, padding: '10px 20px',
              border: `2px solid ${urgColor}`, borderRadius: 14,
              animation: 'mkPulse 1.6s ease-in-out infinite',
            }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: urgColor }}>
                {minsLeft > 0 ? `${minsLeft} MIN LEFT` : 'TIME IS UP'}
              </div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', marginTop: 3 }}>
                {minsLeft > 0
                  ? `Wrap up and return props · ends ${clock(occ.endISO)}`
                  : 'Past 15 minutes over is charged an extra hour'}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
              {notStarted ? `starts ${clock(occ.startISO)}` : `until ${clock(occ.endISO)}`}
            </div>
          )}
          {started && (handoverSoon || headroom >= 0.5) && (
            <div style={{
              // The handover warning is the line that costs somebody an hour if it
              // is missed, so it is NOT drawn at the same size as the calm one.
              fontSize: handoverSoon ? 26 : 21, marginTop: 12, lineHeight: 1.45,
              fontWeight: handoverSoon ? 700 : 500,
              color: handoverSoon ? '#e8a33d' : 'rgba(255,255,255,0.58)',
            }}>
              {handoverSoon
                ? `Booked again at ${clock(nextStart!)} — please be packed up by then`
                : nextStart
                  ? `Up to ${hoursLabel(headroom)} available · booked again at ${clock(nextStart)}`
                  : `Need longer? Up to ${hoursLabel(headroom)} available`}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.34)', marginTop: 10 }}>
          {ctx ? 'No session booked right now' : ' '}
        </div>
      )}
    </div>
  )

  // One-tap check-in. Sends ONLY the set — the server resolves who that is, so a
  // forged request can at worst check in whoever is genuinely booked there.
  const doSetCheckin = async () => {
    if (!setSlug || busy) return
    setBusy(true); setCiError('')
    try {
      const res = await fetch('/api/kiosk/checkin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set: setSlug, key: kioskKey }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setCiError(d.error || 'Could not check you in.'); setScreen('checkin') }
      else { setCi(d); setScreen('checkin'); fetchCtx() }
    } catch {
      setCiError('Could not check you in.'); setScreen('checkin')
    }
    setBusy(false)
  }

  const header = (
    <div style={{ textAlign: 'center', padding: '26px 20px 2px', flexShrink: 0 }}>
      <div style={{ fontWeight: 900, letterSpacing: '0.3em', fontSize: 25 }}>MADE KULTURE</div>
      {/* A tablet bolted inside a set is NOT the front desk. occupancyLine
          prints the set's own name directly below this, so on a set tablet
          this line was both wrong and redundant. Door tablets keep it. */}
      {!setSlug && (
        <div style={{ fontSize: 13, color: CHAMP_DIM, letterSpacing: '0.42em', marginTop: 8 }}>FRONT DESK</div>
      )}
    </div>
  )

  // ── Screens ──────────────────────────────────────────────────────────────
  if (screen === 'home') return (
    <main style={wrap} onPointerDown={touch}>
      {header}
      {occupancyLine}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center',
        flexDirection: canAddTime ? 'row' : 'column',
        flexWrap: canAddTime ? 'wrap' : 'nowrap',
        alignContent: 'center',
        padding: '8px 14px 20px', maxWidth: canAddTime ? 980 : 680,
        width: '100%', margin: '0 auto', boxSizing: 'border-box',
      }}>
        {/* One tap when the tablet knows whose session this is — the numpad only
            exists because a shared tablet couldn't know. It still does, for the
            no-set tablet and for anyone whose booking isn't the one on this set. */}
        <button style={tile} onClick={() => (occLive && !occ.checkedIn ? doSetCheckin() : setScreen('checkin'))}>
          <IconEnter />
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.2em' }}>
            {busy ? 'CHECKING IN…' : occLive && occ.checkedIn ? 'CHECKED IN' : 'CHECK IN'}
          </span>
          <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.42)' }}>
            {occLive
              ? (occ.checkedIn
                  ? `${occ.firstName} · you're all set`
                  : nameOk ? `Tap once — ${occ.firstName}` : 'Tap once to check in')
              : 'Here for your booking'}
          </span>
        </button>
        {canAddTime && (
          <button
            style={{ ...tile, border: `1px solid ${minsLeft <= 30 ? 'rgba(201,178,126,0.55)' : HAIR}` }}
            onClick={() => { setExtStep('pick'); setExtReq(null); setExtError(''); setExtUntil(''); setScreen('addtime'); touch() }}
          >
            <IconClock />
            <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.2em' }}>ADD TIME</span>
            <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.42)' }}>
              Stay longer — up to {hoursLabel(headroom)}
            </span>
          </button>
        )}
        <button style={tile} onClick={() => { setScreen('june'); touch() }}>
          <IconJune />
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.2em' }}>ASK JUNE</span>
          <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.42)' }}>Sets · gear · rules · directions</span>
        </button>
        <button style={tile} onClick={() => setScreen('team')}>
          <IconBell />
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.2em' }}>GET THE TEAM</span>
          <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.42)' }}>Need a human — we'll come find you</span>
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
            Wrap up and return props before your time ends — overages past 15 minutes are charged an hour. Have a great shoot.
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
              {m.role === 'user' ? m.content : renderContent(m.content)}
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

  // ── ADD TIME actions ──────────────────────────────────────────────────────
  // Ask the server what N more hours costs and mint the request. ⚠️ The tablet
  // sends only its SET, never a booking id — the server re-derives whose session
  // this is, same as check-in.
  const askForTime = async (hours: number) => {
    if (busy || !setSlug) return
    setBusy(true); setExtError('')
    try {
      const r = await fetch('/api/kiosk/extend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ set: setSlug, key: kioskKey, hours }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setExtError(d.error || 'Could not price that right now.')
      else { setExtReq({ ...d, hours }); setExtStep(d.hasCardOnFile ? 'confirm' : 'phone') }
    } catch { setExtError('Could not reach the studio system.') }
    setBusy(false)
  }

  // Charge the card on file, through the very same public endpoint the SMS link
  // uses — so there is one payment path, not two that can drift. It re-plans and
  // re-checks the conflict before taking a cent.
  const confirmTime = async () => {
    if (busy || !extReq?.token) return
    setBusy(true); setExtError('')
    try {
      const r = await fetch(`/api/extensions/${extReq.token}`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.success) { setExtUntil(d.until || ''); setExtStep('done'); fetchCtx() }
      // ⚠️ A Square PROFILE is not a saved CARD. hasCardOnFile is optimistic, so
      // this miss is expected and is not the guest's fault — hand them the link.
      else if (d.needsCard) { setExtStep('phone'); setExtError('') }
      else setExtError(d.error || 'That did not go through.')
    } catch { setExtError('Could not reach the studio system.') }
    setBusy(false)
  }

  if (screen === 'addtime') {
    // Never offer more than the room actually has. headroom is already floored
    // to a half hour by the server against the next booking AND closing time.
    const options = [0.5, 1, 1.5, 2, 3, 4].filter(h => h <= headroom).slice(0, 4)
    const setLabel = ctx?.set?.name ?? 'this set'
    return (
      <main style={{ ...wrap, position: 'relative' }} onPointerDown={touch}>
        <button style={backBtn} onClick={resetToHome}>&larr; BACK</button>
        {header}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
          <IconClock />

          {extStep === 'pick' && (
            <>
              <div style={{ fontSize: 38, fontWeight: 800, margin: '16px 0 10px' }}>Add time</div>
              <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.55)', marginBottom: 26, maxWidth: 540, lineHeight: 1.6 }}>
                {nextStart
                  ? `Up to ${hoursLabel(headroom)} — ${setLabel} is booked again at ${clock(nextStart)}.`
                  : `You can add up to ${hoursLabel(headroom)} on ${setLabel}.`}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
                {options.map(h => (
                  <button key={h} disabled={busy} onClick={() => askForTime(h)}
                    style={{ ...champBtn, padding: '22px 34px', fontSize: 15, opacity: busy ? 0.5 : 1 }}>
                    {`+ ${hoursLabel(h).toUpperCase()}`}
                  </button>
                ))}
              </div>
            </>
          )}

          {extStep === 'confirm' && extReq && (
            <>
              <div style={{ fontSize: 13, letterSpacing: '0.34em', color: CHAMP_DIM, margin: '18px 0 12px' }}>CONFIRM</div>
              <div style={{ fontSize: 42, fontWeight: 800, marginBottom: 12, color: CHAMP }}>
                {`+ ${hoursLabel(extReq.hours)} · $${(extReq.priceCents / 100).toFixed(2)}`}
              </div>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 500 }}>
                Charged to the card on file for this booking.
                {extReq.smsSent ? ' We also texted you the link if you would rather pay on your phone.' : ''}
              </div>
              <button disabled={busy} onClick={confirmTime} style={{ ...champBtn, marginTop: 28, padding: '24px 56px', fontSize: 16 }}>
                {busy ? '…' : 'CONFIRM & CHARGE'}
              </button>
              <button onClick={() => { setExtStep('pick'); setExtReq(null) }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', fontSize: 14, letterSpacing: '0.12em', marginTop: 18, cursor: 'pointer' }}>
                PICK A DIFFERENT LENGTH
              </button>
            </>
          )}

          {extStep === 'phone' && (
            <>
              <div style={{ fontSize: 13, letterSpacing: '0.34em', color: CHAMP_DIM, margin: '18px 0 12px' }}>ONE MORE STEP</div>
              <div style={{ fontSize: 38, fontWeight: 800, marginBottom: 14 }}>
                {extReq?.smsSent ? 'Finish on your phone' : 'We need a hand with this one'}
              </div>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, maxWidth: 500 }}>
                {extReq?.smsSent
                  ? 'We just texted you a secure link to add a card and confirm. Card details are never typed on this screen.'
                  : 'There is no mobile number on this booking, so we cannot send you a payment link. Tap GET THE TEAM and someone will sort it out.'}
              </div>
              {!extReq?.smsSent && (
                <button onClick={() => { setScreen('team'); touch() }} style={{ ...champBtn, marginTop: 26 }}>GET THE TEAM</button>
              )}
            </>
          )}

          {extStep === 'done' && (
            <>
              <div style={{ fontSize: 13, letterSpacing: '0.34em', color: CHAMP, margin: '18px 0 12px' }}>ADDED</div>
              <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 14, color: CHAMP }}>
                {extUntil ? `Yours until ${extUntil}` : 'Time added'}
              </div>
              <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 480 }}>
                Your session has been extended and your door code still works. Enjoy the extra time.
              </div>
            </>
          )}

          {extError && (
            <div style={{ color: 'rgba(255,255,255,0.8)', borderLeft: `2px solid ${CHAMP_DIM}`, paddingLeft: 14, fontSize: 17, marginTop: 22, maxWidth: 500, textAlign: 'left', lineHeight: 1.6 }}>
              {extError}
            </div>
          )}

          {(extStep === 'done' || extStep === 'phone' || extError) && (
            <button onClick={resetToHome} style={
              (extStep === 'phone' && !extReq?.smsSent)
                ? { background: 'none', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.55)',
                    borderRadius: 14, padding: '15px 38px', fontFamily: 'Inter, sans-serif', fontSize: 13,
                    fontWeight: 700, letterSpacing: '0.18em', cursor: 'pointer', marginTop: 16 }
                : { ...champBtn, marginTop: 26 }
            }>DONE</button>
          )}
        </div>
      </main>
    )
  }

  // screen === 'team'
  return (
    <main style={{ ...wrap, position: 'relative' }} onPointerDown={touch}>
      <button style={backBtn} onClick={resetToHome}>← BACK</button>
      {header}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <IconBell />
        {summonState ? (
          <>
            {summonState === 'onway' ? (
              <>
                <div style={{ fontSize: 13, letterSpacing: '0.34em', color: CHAMP, margin: '18px 0 12px' }}>ANSWERED</div>
                <div style={{ fontSize: 38, fontWeight: 800, marginBottom: 14, color: CHAMP }}>Someone's on the way</div>
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 460 }}>
                  Hang tight — they're walking over now.
                </div>
              </>
            ) : summonState === 'waiting' ? (
              <>
                <div style={{ fontSize: 13, letterSpacing: '0.34em', color: CHAMP_DIM, margin: '18px 0 12px' }}>SENT</div>
                <div style={{ fontSize: 38, fontWeight: 800, marginBottom: 14 }}>Ringing the team</div>
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 460 }}>
                  This screen changes the moment someone picks it up.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, letterSpacing: '0.34em', color: '#ff9b9b', margin: '18px 0 12px' }}>NO ANSWER YET</div>
                <div style={{ fontSize: 38, fontWeight: 800, marginBottom: 14 }}>We haven't reached anyone</div>
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, maxWidth: 460 }}>
                  Sorry about that — text us and someone will see it right away.
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, color: CHAMP, marginTop: 14 }}>
                  {summonPhone || '(832) 408-1631'}
                </div>
              </>
            )}
            <button
              onClick={() => { ringOpen.current = false; setSummonState(null); resetToHome() }}
              style={{ ...champBtn, marginTop: 30 }}
            >DONE</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 38, fontWeight: 800, margin: '16px 0 14px' }}>Need a human?</div>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', marginBottom: 30, maxWidth: 460, lineHeight: 1.7 }}>
              Tap below and the team gets a notification that you're waiting.
            </div>
            <button disabled={busy} onClick={summon} style={{ ...champBtn, padding: '24px 60px', fontSize: 16 }}>
              {busy ? '…' : 'RING THE TEAM'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}

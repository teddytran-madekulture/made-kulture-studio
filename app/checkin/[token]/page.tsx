'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface CheckinData {
  name: string | null
  setName: string
  isBuyout: boolean
  startTime: string
  endTime: string
  status: string
  declaredGuests: number | null
  guestLimit: number
  arrivedGuests: number | null
  checkedInAt: string | null
  codeRevealedAt?: string | null
  checkedOutAt: string | null
  // Door code (2026-10-01): revealed by CHECK IN, never sent. Null until then.
  codeOpensAt?: string
  doorCode?: string | null
  doorCodeBack?: string | null
  hasDoorCode?: boolean
  doorHowTo?: string
}

// The revealed code is kept on THIS phone so a dropped signal between the car
// and the keypad can't take it away. Per booking token; cleared on check-out.
const codeKey = (token: string) => `mk_door_code_${token}`
const spaced = (c: string) => c.replace(/(\d{3})(?=\d)/g, '$1 ')

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

export default function CheckinPage({ params }: { params: { token: string } }) {
  const [data, setData]       = useState<CheckinData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [guests, setGuests]   = useState(1)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [checkedIn, setCheckedIn]   = useState(false)
  const [checkedOut, setCheckedOut] = useState(false)
  const [justActed, setJustActed]   = useState(false)
  const [kiosk, setKiosk]           = useState(false)
  const [codes, setCodes] = useState<{ front: string | null; back: string | null } | null>(null)
  const router = useRouter()

  useEffect(() => {
    setKiosk(new URLSearchParams(window.location.search).get('kiosk') === '1')
  }, [])

  // On a shared kiosk, return to the lookup screen for the next guest.
  const scheduleReset = () => {
    if (new URLSearchParams(window.location.search).get('kiosk') === '1') {
      setTimeout(() => router.push('/checkin?kiosk=1'), 6000)
    }
  }

  const load = () => {
    fetch(`/api/checkin/${params.token}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((d: CheckinData) => {
        setData(d)
        setGuests(d.declaredGuests ?? 1)
        setCheckedIn(!!d.checkedInAt || !!d.codeRevealedAt)
        setCheckedOut(!!d.checkedOutAt)
        if (d.doorCode || d.doorCodeBack) {
          setCodes({ front: d.doorCode ?? null, back: d.doorCodeBack ?? null })
          try { localStorage.setItem(codeKey(params.token), JSON.stringify({ front: d.doorCode ?? null, back: d.doorCodeBack ?? null })) } catch {}
        } else if ((d.checkedInAt || d.codeRevealedAt) && !d.checkedOutAt) {
          try { const c = localStorage.getItem(codeKey(params.token)); if (c) setCodes(JSON.parse(c)) } catch {}
        }
      })
      .catch(() => {
        // Offline at the door: fall back to the code this phone already saw.
        try { const c = localStorage.getItem(codeKey(params.token)); if (c) { setCodes(JSON.parse(c)); setCheckedIn(true); return } } catch {}
        setNotFound(true)
      })
  }
  useEffect(load, [params.token])

  const act = async (action: 'check_in' | 'check_out') => {
    setBusy(true); setErr(null)
    try {
      // On a self-check-in (not the on-site kiosk), grab the visitor's location so
      // the studio knows they're actually there. Denied/unavailable is fine — the
      // server just flags it as unconfirmed.
      let coords: { lat: number; lng: number } | null = null
      if (action === 'check_in' && !kiosk && typeof navigator !== 'undefined' && navigator.geolocation) {
        coords = await new Promise(resolve => {
          navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
          )
        })
      }
      const res = await fetch(`/api/checkin/${params.token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          guests: action === 'check_in' && !data?.isBuyout ? guests : undefined,
          lat: coords?.lat, lng: coords?.lng,
          kiosk,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Something went wrong.'); setBusy(false); return }
      if (action === 'check_in') {
        setCheckedIn(true)
        if (d.doorCode || d.doorCodeBack) {
          setCodes({ front: d.doorCode ?? null, back: d.doorCodeBack ?? null })
          try { localStorage.setItem(codeKey(params.token), JSON.stringify({ front: d.doorCode ?? null, back: d.doorCodeBack ?? null })) } catch {}
        }
      } else {
        setCheckedOut(true)
        try { localStorage.removeItem(codeKey(params.token)) } catch {}
      }
      setJustActed(true)
      setBusy(false)
      scheduleReset()
    } catch {
      setErr('Something went wrong. Please try again.'); setBusy(false)
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{ background: '#080808', minHeight: 'var(--vh-full)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.05em', marginBottom: 40, lineHeight: 1 }}>MADE<br />KULTURE</div>
      <div style={{ width: '100%', maxWidth: 420 }}>{children}</div>
    </div>
  )

  const label = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' } as const
  const bigBtn = (bg: string, color: string) => ({
    width: '100%', padding: '20px', border: 'none', background: bg, color,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 14, fontWeight: 600, letterSpacing: '0.2em',
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
  } as const)

  const doneButton = kiosk ? (
    <button onClick={() => router.push('/checkin?kiosk=1')} style={{ ...bigBtn('transparent', '#fff'), border: '1px solid rgba(255,255,255,0.3)', marginTop: 20 }}>DONE — NEXT GUEST</button>
  ) : null

  if (notFound) return wrap(<p style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter' }}>We couldn’t find that booking. Text us at (832) 408-1631.</p>)

  // The door-code panel — the whole reason the guest opened this page.
  const codePanel = codes && (codes.front || codes.back) ? (
    <div style={{ border: '1px solid #c9b27e', background: '#111', padding: '22px 20px', marginBottom: 24 }}>
      <div style={{ ...label, color: '#c9b27e', marginBottom: 12 }}>YOUR DOOR CODE</div>
      {codes.front && <>
        <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)' }}>FRONT DOOR</div>
        <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 40, fontWeight: 700, letterSpacing: '0.18em', margin: '2px 0 12px' }}>{spaced(codes.front)}</div>
      </>}
      {codes.back && <>
        <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.45)' }}>BACK DOOR</div>
        <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 40, fontWeight: 700, letterSpacing: '0.18em', margin: '2px 0 12px' }}>{spaced(codes.back)}</div>
      </>}
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
        {data?.doorHowTo ?? 'Enter the code, then press the unlock button to open.'} It only works during your booked time.
      </p>
    </div>
  ) : null

  if (!data) {
    // Offline but we have a cached code: still show it.
    return wrap(codePanel ?? <p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter' }}>Loading…</p>)
  }

  const summary = (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '18px 20px', marginBottom: 28, textAlign: 'left' }}>
      <div style={{ ...label, marginBottom: 6 }}>{fmtDay(data.startTime)}</div>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28, lineHeight: 1, marginBottom: 6 }}>{data.setName.toUpperCase()}</div>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{fmt(data.startTime)} – {fmt(data.endTime)}</div>
    </div>
  )

  // ── Checked out ──
  if (checkedOut) return wrap(<>
    <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 48, lineHeight: 0.95, marginBottom: 16 }}>SEE YOU<br />NEXT TIME.</h1>
    <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>You’re checked out. Thanks for keeping the space clean.</p>
    {doneButton}
  </>)

  // ── Kiosk: just checked in → confirm + auto-return (no check-out here yet) ──
  if (checkedIn && justActed && kiosk) return wrap(<>
    <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 48, lineHeight: 0.95, marginBottom: 16 }}>YOU’RE IN.</h1>
    <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 24 }}>{data.name ? `Welcome, ${data.name.split(' ')[0]}. ` : ''}The owner’s been notified. Come back to this screen and look up your number to check out when you leave.</p>
    {summary}
    {doneButton}
  </>)

  // ── Checked in → enjoy session, then check out at the end ──
  if (checkedIn) return wrap(<>
    <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 44, lineHeight: 0.95, marginBottom: 16 }}>YOU’RE IN.</h1>
    <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>{data.name ? `Enjoy your session, ${data.name.split(' ')[0]}. ` : 'Enjoy your session. '}When you’re done and packed up, check out below.</p>
    {codePanel}
    {summary}
    <div style={{ ...label, marginBottom: 10, textAlign: 'left' }}>BEFORE YOU CHECK OUT</div>
    <ul style={{ textAlign: 'left', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, margin: '0 0 28px', paddingLeft: 18 }}>
      <li>Return all props to where you found them</li>
      <li>Take all your gear and trash with you</li>
      <li>Turn off any lights/equipment you used</li>
    </ul>
    {err && <p style={{ color: '#f0a0a0', fontFamily: 'Inter', fontSize: 13, marginBottom: 12 }}>{err}</p>}
    <button onClick={() => act('check_out')} disabled={busy} style={{ ...bigBtn('transparent', '#fff'), border: '1px solid rgba(255,255,255,0.3)' }}>
      {busy ? 'SAVING…' : 'CHECK OUT — I’M LEAVING'}
    </button>
  </>)

  // ── Not yet checked in ──
  return wrap(<>
    <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 44, lineHeight: 0.95, marginBottom: 16 }}>WELCOME{data.name ? `,\n${data.name.split(' ')[0].toUpperCase()}` : ''}</h1>
    {summary}
    {data.hasDoorCode && !kiosk && (
      <div style={{ border: '1px solid rgba(201,178,126,0.45)', padding: '14px 16px', marginBottom: 24, textAlign: 'left' }}>
        <div style={{ ...label, color: '#c9b27e', marginBottom: 6 }}>YOUR DOOR CODE</div>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55 }}>
          {data.codeOpensAt && new Date(data.codeOpensAt).getTime() > Date.now()
            ? <>Appears here when you check in. Check-in opens at <strong style={{ color: '#fff' }}>{fmt(data.codeOpensAt)}</strong>, once you’re at the studio.</>
            : <>Tap <strong style={{ color: '#fff' }}>CHECK IN</strong> once you’re at the studio and your code appears here.</>}
        </p>
      </div>
    )}
    {!data.isBuyout && <>
      <div style={{ ...label, marginBottom: 6, textAlign: 'left' }}>CONFIRM THE GUESTS IN YOUR PARTY</div>
      <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'left', margin: '0 0 14px' }}>Your total party size for this booking — not everyone has to be here yet.</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 8 }}>
        <button onClick={() => setGuests(g => Math.max(1, g - 1))} style={{ width: 52, height: 52, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 24, cursor: 'pointer' }}>−</button>
        <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 48, minWidth: 60 }}>{guests}</span>
        <button onClick={() => setGuests(g => Math.min(30, g + 1))} style={{ width: 52, height: 52, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 24, cursor: 'pointer' }}>+</button>
      </div>
      {guests > data.guestLimit && (
        <p style={{ fontFamily: 'Inter', fontSize: 12, color: '#e0a44c', marginBottom: 16 }}>Heads up: this booking allows up to {data.guestLimit} people. Extra guests may be charged.</p>
      )}
    </>}
    <div style={{ height: 16 }} />
    {err && <p style={{ color: '#f0a0a0', fontFamily: 'Inter', fontSize: 13, marginBottom: 12 }}>{err}</p>}
    <button onClick={() => act('check_in')} disabled={busy} style={bigBtn('#fff', '#080808')}>
      {busy ? 'CHECKING IN…' : (data.hasDoorCode && !kiosk ? 'CHECK IN — SHOW MY CODE' : 'CHECK IN')}
    </button>
  </>)
}

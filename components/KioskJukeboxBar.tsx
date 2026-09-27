'use client'
// NOW PLAYING bar on the kiosk tablets — option C, picked by Teddy 2026-09-27.
// Replaces the white corner card (KioskJukeboxQR). A strip along the bottom:
// scan code · what's playing · REQUEST A SONG · (STAFF, passed in as `right`).
//
// ── When it checks, and when it doesn't ────────────────────────────────────
// ⚠️ Polling is the #1 cost in this project (a 5s jukebox poll once ate 78% of
// all Vercel compute). So:
//   • 9am–10pm Central → one read a minute of /api/jukebox/now, which is
//     CDN-cached for 30s, so ten tablets cost about the same as one.
//   • Outside those hours → NO reads at all and no bar, UNLESS a session is
//     live on this set (`sessionLive`, which the tablet already knows from its
//     own 5-minute occupancy check — buyouts included). That is the after-hours
//     buyout case, the only time anyone is here to hear music at night.
//   • Door tablets have no session context, so overnight they simply go dark.
//
// ⚠️ The code is GENERATED from window.location.origin, never a baked PNG, so it
// follows the madekulture.com cutover by itself. Guests get the public /jukebox
// page only — never the player's ?key=.
// ⚠️ Dark modules on CREAM, not gold and not inverted — phone cameras read
// dark-on-light far more reliably.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import qrcode from 'qrcode-generator'

// Every tablet shows the main studio's music. Set tablets link straight to
// that zone; door tablets open the zone picker so guests choose.
// ⚠️ Never rename a zone SLUG — the printed QR codes point at it too.
const ZONE = 'main-studio'
const OPEN_HOUR = 9, CLOSE_HOUR = 22
const POLL_MS = 60_000

const CHAMP = '#c9b27e'
const HAIR = 'rgba(201,178,126,0.22)'

function centralHour(): number {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date())
    return Number(p.find(x => x.type === 'hour')?.value ?? 12)
  } catch { return 12 } // fail OPEN on a clock error, same as the player
}
const inStudioHours = () => { const h = centralHour(); return h >= OPEN_HOUR && h < CLOSE_HOUR }

interface Now { open: boolean; paused: boolean; title: string | null; artist: string | null }

export const BAR_HEIGHT = 116

export default function KioskJukeboxBar({
  setSlug, sessionLive, suppress, right, onShow,
}: {
  setSlug: string | null
  /** A session (incl. a buyout) is live on this set — keeps the bar alive after hours. */
  sessionLive: boolean
  /** Hide without stopping, e.g. the last 15 minutes — guests should be packing up. */
  suppress?: boolean
  /** Rendered at the bar's right edge (the STAFF button). */
  right?: ReactNode
  /** Tells the page whether the bar is on screen, so it can size the tiles. */
  onShow?: (shown: boolean) => void
}) {
  const [now, setNow] = useState<Now | null>(null)
  const liveRef = useRef(sessionLive)
  liveRef.current = sessionLive

  useEffect(() => {
    let dead = false
    let t: ReturnType<typeof setTimeout>
    const tick = async () => {
      const active = inStudioHours() || (!!setSlug && liveRef.current)
      if (!active) {
        setNow(null) // after hours with nobody here: dark, and zero network
      } else {
        try {
          const r = await fetch(`/api/jukebox/now?zone=${ZONE}`)
          if (r.ok) { const d = await r.json(); if (!dead) setNow(d) }
          // A failed read keeps the last answer rather than blinking the bar.
        } catch { /* offline — keep the last answer */ }
      }
      if (!dead) t = setTimeout(tick, POLL_MS)
    }
    tick()
    return () => { dead = true; clearTimeout(t) }
  }, [setSlug])

  // A session starting after hours shouldn't wait up to a minute for the bar.
  useEffect(() => {
    if (sessionLive && !inStudioHours()) {
      fetch(`/api/jukebox/now?zone=${ZONE}`).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setNow(d) }).catch(() => {})
    }
  }, [sessionLive])

  const shown = !!now?.open && !suppress

  useEffect(() => { onShow?.(shown) }, [shown, onShow])

  const qr = useMemo(() => {
    if (typeof window === 'undefined') return null
    const url = setSlug ? `${window.location.origin}/jukebox?zone=${ZONE}` : `${window.location.origin}/jukebox`
    const q = qrcode(0, 'M'); q.addData(url); q.make()
    const n = q.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { d, n }
  }, [setSlug])

  if (!shown || !qr) return null
  const quiet = 2
  const code = 96
  const playing = now!.title
    ? `${now!.title}${now!.artist ? ` — ${now!.artist}` : ''}`
    : null

  return (
    <div style={{
      flexShrink: 0, height: BAR_HEIGHT, display: 'flex', alignItems: 'center', gap: 24,
      padding: '0 22px', borderTop: `1px solid ${HAIR}`, boxSizing: 'border-box',
      background: 'linear-gradient(90deg, rgba(201,178,126,0.08), rgba(255,255,255,0.02) 55%, rgba(0,0,0,0.2))',
    }}>
      <style>{'@keyframes mkEq{0%,100%{height:4px}50%{height:14px}}'}</style>
      <div style={{ width: code, height: code, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#efe6d2' }}>
        <svg viewBox={`${-quiet} ${-quiet} ${qr.n + quiet * 2} ${qr.n + quiet * 2}`} width={code} height={code}
          shapeRendering="crispEdges" style={{ display: 'block' }} aria-label="Scan to request a song">
          <path d={qr.d} fill="#16130d" />
        </svg>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, letterSpacing: '0.3em', color: CHAMP, fontWeight: 700 }}>
          {playing && !now!.paused && (
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'flex-end', height: 14 }}>
              {[0, 1, 2, 3].map(i => (
                <i key={i} style={{ width: 3, height: 10, background: CHAMP, animation: `mkEq 1s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </span>
          )}
          {playing && !now!.paused ? 'NOW PLAYING' : 'MUSIC'}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>
          <Marquee text={playing && !now!.paused ? playing : 'Pick the next song'} />
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '0.18em' }}>REQUEST A SONG</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', marginTop: 6 }}>Point your phone camera at the code</div>
      </div>
      {right}
    </div>
  )
}

// Scrolls the title when it is too long to fit, sits still when it fits.
// Teddy 2026-09-27: an ellipsised title "defeats why it would be there".
// ⚠️ Measured, not guessed from character count — the bar's width changes with
// the screen and the REQUEST A SONG block beside it. Re-measured on resize and
// whenever the song changes. The animation is a CSS transform (GPU, no JS
// timer), so it costs the tablet nothing and makes ZERO network calls.
const GAP = 90        // px between the end of the title and its repeat
const SPEED = 45      // px per second — readable from a few feet away
function Marquee({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const txtRef = useRef<HTMLSpanElement>(null)
  const [w, setW] = useState(0) // text width when it overflows, else 0

  useEffect(() => {
    const measure = () => {
      const box = boxRef.current, t = txtRef.current
      if (!box || !t) return
      const tw = t.scrollWidth
      setW(tw > box.clientWidth + 1 ? tw : 0)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    if (ro && boxRef.current) ro.observe(boxRef.current)
    window.addEventListener('resize', measure)
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure) }
  }, [text])

  const dist = w + GAP
  return (
    <div ref={boxRef} style={{
      overflow: 'hidden', whiteSpace: 'nowrap', position: 'relative',
      // Soft fade at both edges so the text slides in and out instead of being chopped.
      ...(w ? { WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)',
                maskImage: 'linear-gradient(90deg, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)' } : {}),
    }}>
      {w > 0 && <style>{`@keyframes mkMarquee{0%,12%{transform:translateX(0)}100%{transform:translateX(-${dist}px)}}`}</style>}
      <div key={text} style={{
        display: 'inline-flex',
        ...(w ? { animation: `mkMarquee ${(dist / SPEED) * 1.14}s linear infinite`, paddingLeft: 24 } : {}),
      }}>
        <span ref={txtRef}>{text}</span>
        {/* The repeat, so the loop is seamless: when the first copy has slid
            exactly one title+gap to the left, the second sits where it began. */}
        {w > 0 && <span aria-hidden style={{ paddingLeft: GAP }}>{text}</span>}
      </div>
    </div>
  )
}

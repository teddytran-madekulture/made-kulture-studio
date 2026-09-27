'use client'
// "Scan to request a song" — the jukebox QR on the kiosk tablets. 2026-09-27.
//
// ⚠️ GENERATED LIVE from window.location.origin, never a baked PNG. The printed
// qr_main-studio.png / qr_vanity.png point at the vercel.app URL and have to be
// reprinted after the madekulture.com cutover; these follow the domain on their
// own. Guests get the PUBLIC /jukebox page — never the player's ?key=.
//
// ⚠️ HIDDEN WHEN THE ZONE IS CLOSED (Admin → Jukebox music OFF), so nobody is
// invited to request into silence. That check is one tiny read every 5 MINUTES —
// never shorten it. A flat 5s jukebox poll once ate 78% of all Vercel compute and
// nearly paused the project, door codes included. See vercel-cpu-jukebox-polling.
//
// Drawn as SVG on a WHITE card: phone cameras read dark-on-light far more
// reliably than an inverted code, and the card is small, so on a set with the
// blackout curtains closed it is not much of a light source.
import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'

// Every set tablet sends guests to the main studio zone. Door tablets (no
// ?set=) open the zone picker instead. ⚠️ Never rename a zone SLUG — the
// printed codes point at it too.
const SET_TABLET_ZONE = 'main-studio'

interface Zone { slug: string; is_open: boolean }

export default function KioskJukeboxQR({ setSlug, size }: { setSlug: string | null; size: number }) {
  const [zones, setZones] = useState<Zone[] | null>(null)

  useEffect(() => {
    let dead = false
    const load = () => fetch('/api/jukebox/zones', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!dead && d?.zones) setZones(d.zones) })
      .catch(() => { /* offline: keep the last answer */ })
    load()
    const iv = setInterval(load, 5 * 60_000)
    return () => { dead = true; clearInterval(iv) }
  }, [])

  // Which page the code opens, or null when music is off / unknown.
  const target = useMemo(() => {
    if (!zones || typeof window === 'undefined') return null
    const origin = window.location.origin
    if (setSlug) {
      const z = zones.find(x => x.slug === SET_TABLET_ZONE)
      // Zone missing (renamed?) → fall back to the picker rather than vanish.
      if (!z) return zones.some(x => x.is_open) ? `${origin}/jukebox` : null
      return z.is_open ? `${origin}/jukebox?zone=${SET_TABLET_ZONE}` : null
    }
    return zones.some(x => x.is_open) ? `${origin}/jukebox` : null
  }, [zones, setSlug])

  const path = useMemo(() => {
    if (!target) return null
    const qr = qrcode(0, 'M')
    qr.addData(target)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    }
    return { d, n }
  }, [target])

  if (!path) return null
  const quiet = 2 // plus the card padding, gives phones a clean margin

  return (
    <div aria-label="Scan to request a song" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      background: '#fff', borderRadius: 12, padding: 8, width: size,
      boxShadow: '0 4px 18px rgba(0,0,0,0.35)', boxSizing: 'border-box',
    }}>
      <svg viewBox={`${-quiet} ${-quiet} ${path.n + quiet * 2} ${path.n + quiet * 2}`}
        width={size - 16} height={size - 16} shapeRendering="crispEdges" style={{ display: 'block' }}>
        <path d={path.d} fill="#0b0b0d" />
      </svg>
      <div style={{
        fontFamily: 'Inter, sans-serif', fontSize: Math.max(10, Math.round(size * 0.085)),
        fontWeight: 800, letterSpacing: '0.12em', color: '#0b0b0d', textAlign: 'center', lineHeight: 1.25,
        paddingBottom: 2,
      }}>
        SCAN TO<br />REQUEST A SONG
      </div>
    </div>
  )
}

// MINI SESSIONS — shareable images (migration 162). Server only.
//   flyer  — 1080×1920 story / 1080×1080 square, with a QR to the sign-up page
//   og     — 1200×630 link preview (iMessage, Instagram DMs, Facebook…)
// Rendered with next/og (Satori): every element with more than one child must
// be display:flex, and only JPEG/PNG photos render.
import { ImageResponse } from 'next/og'
import qrcode from 'qrcode-generator'

const INK = '#0b0b0d'
const CHAMP = '#c9b27e'

export interface FlyerInfo {
  title: string
  photographer: string
  day: string            // "Saturday, November 21"
  time: string           // "10:00 AM – 2:00 PM"
  priceText: string | null
  coverUrl: string | null
  link: string           // the public sign-up page
  pending: boolean       // planned day, not booked yet
}

// Anton (OFL) ships in /public/fonts. Fetched over HTTP so it works the same in
// every runtime; if it can't load, the image still renders in the default font.
let anton: ArrayBuffer | null | undefined
async function display(origin: string): Promise<ArrayBuffer | null> {
  if (anton !== undefined) return anton
  try {
    const r = await fetch(`${origin}/fonts/anton-latin-400.woff`, { cache: 'force-cache' })
    anton = r.ok ? await r.arrayBuffer() : null
  } catch { anton = null }
  return anton
}
const fonts = (f: ArrayBuffer | null) => (f ? [{ name: 'Anton', data: f, weight: 400 as const, style: 'normal' as const }] : undefined)

/** Satori only draws JPEG / PNG — a WebP cover is skipped rather than breaking the image. */
const drawable = (url: string | null) => (url && /\.(jpe?g|png)(\?|$)/i.test(url) ? url : null)

const titleSize = (t: string, big: number) => (t.length > 34 ? big * 0.62 : t.length > 22 ? big * 0.78 : big)

function Qr({ text, size }: { text: string; size: number }) {
  const q = qrcode(0, 'M'); q.addData(text); q.make()
  const n = q.getModuleCount()
  const quiet = 3
  const cell = Math.floor(size / (n + quiet * 2))
  const rows = []
  for (let r = 0; r < n; r++) {
    // Runs of dark modules become one bar — far fewer nodes for Satori.
    const segs = []
    let c = 0
    while (c < n) {
      const dark = q.isDark(r, c)
      let e = c
      while (e < n && q.isDark(r, e) === dark) e++
      segs.push(<div key={c} style={{ width: (e - c) * cell, height: cell, background: dark ? '#000' : '#fff' }} />)
      c = e
    }
    rows.push(<div key={r} style={{ display: 'flex' }}>{segs}</div>)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', padding: cell * quiet, borderRadius: 12 }}>{rows}</div>
  )
}

export type FlyerSize = 'story' | 'portrait' | 'square'

export async function flyerImage(info: FlyerInfo, size: FlyerSize, origin: string): Promise<ImageResponse> {
  const W = 1080, H = size === 'story' ? 1920 : size === 'portrait' ? 1350 : 1080   // portrait = Instagram 4:5 feed post
  const photo = drawable(info.coverUrl)
  const f = await display(origin)
  const head = f ? 'Anton' : undefined

  if (size === 'story') {
    return new ImageResponse(
      (
        <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: INK, color: '#fff' }}>
          <div style={{ display: 'flex', width: W, height: 1000, position: 'relative', background: '#16161a' }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            {photo && <img src={photo} width={W} height={1000} style={{ width: W, height: 1000, objectFit: 'cover' }} />}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 360, display: 'flex', backgroundImage: `linear-gradient(to bottom, rgba(11,11,13,0), ${INK})` }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0 80px', marginTop: -120 }}>
            <div style={{ display: 'flex', fontSize: 30, letterSpacing: 8, color: CHAMP, textTransform: 'uppercase' }}>Mini sessions</div>
            <div style={{ display: 'flex', fontFamily: head, fontSize: titleSize(info.title, 128), lineHeight: 1.0, textTransform: 'uppercase', marginTop: 14 }}>{info.title}</div>
            <div style={{ display: 'flex', fontSize: 40, color: 'rgba(255,255,255,0.8)', marginTop: 18 }}>with {info.photographer}</div>
            <div style={{ display: 'flex', fontSize: 46, color: CHAMP, marginTop: 34 }}>{info.day}</div>
            <div style={{ display: 'flex', fontSize: 36, color: 'rgba(255,255,255,0.75)', marginTop: 8 }}>{info.time}{info.pending ? ' · pending' : ''}</div>
            {info.priceText && <div style={{ display: 'flex', fontSize: 36, color: '#fff', marginTop: 8 }}>{info.priceText}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 80px', marginTop: 'auto', marginBottom: 90 }}>
            <Qr text={info.link} size={300} />
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 44, flex: 1 }}>
              <div style={{ display: 'flex', fontFamily: head, fontSize: 64, textTransform: 'uppercase', lineHeight: 1 }}>Scan to book</div>
              <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.6)', marginTop: 14 }}>or tap the link in bio</div>
              <div style={{ display: 'flex', fontSize: 26, color: CHAMP, marginTop: 28, letterSpacing: 2 }}>MADE KULTURE · HOUSTON</div>
            </div>
          </div>
        </div>
      ),
      { width: W, height: H, fonts: fonts(f) },
    )
  }

  // Square + 4:5 portrait: the photo fills the frame, text sits on a dark fade.
  const k = size === 'portrait' ? 1.15 : 1
  const fade = size === 'portrait' ? 'rgba(11,11,13,0.05) 34%, rgba(11,11,13,0.92) 74%' : 'rgba(11,11,13,0.05) 20%, rgba(11,11,13,0.92) 68%'
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: INK, color: '#fff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        {photo && <img src={photo} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', backgroundImage: `linear-gradient(to bottom, ${fade}, ${INK})` }} />
        <div style={{ position: 'absolute', left: 64, right: 64, bottom: 60 * k, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 36 }}>
            <div style={{ display: 'flex', fontSize: 24 * k, letterSpacing: 7, color: CHAMP, textTransform: 'uppercase' }}>Mini sessions</div>
            <div style={{ display: 'flex', fontFamily: head, fontSize: titleSize(info.title, 92 * k), lineHeight: 1.0, textTransform: 'uppercase', marginTop: 10 }}>{info.title}</div>
            <div style={{ display: 'flex', fontSize: 30 * k, color: 'rgba(255,255,255,0.8)', marginTop: 12 }}>with {info.photographer}</div>
            <div style={{ display: 'flex', fontSize: 34 * k, color: CHAMP, marginTop: 20 }}>{info.day}</div>
            <div style={{ display: 'flex', fontSize: 27 * k, color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>{[info.time + (info.pending ? ' · pending' : ''), info.priceText].filter(Boolean).join('  ·  ')}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Qr text={info.link} size={Math.round(220 * k)} />
            <div style={{ display: 'flex', fontSize: 20, letterSpacing: 4, color: '#fff', marginTop: 12, textTransform: 'uppercase' }}>Scan to book</div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: 64, top: 52, display: 'flex', fontSize: 20, letterSpacing: 4, color: 'rgba(255,255,255,0.85)' }}>MADE KULTURE · HOUSTON</div>
      </div>
    ),
    { width: W, height: H, fonts: fonts(f) },
  )
}

/** 1200×630 link preview. */
export async function ogImage(info: FlyerInfo | null, origin: string): Promise<ImageResponse> {
  const f = await display(origin)
  const head = f ? 'Anton' : undefined
  const W = 1200, H = 630
  if (!info) {
    return new ImageResponse(
      (<div style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', background: INK, color: '#fff', fontFamily: head, fontSize: 90, textTransform: 'uppercase' }}>Made Kulture</div>),
      { width: W, height: H, fonts: fonts(f) },
    )
  }
  const photo = drawable(info.coverUrl)
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', background: INK, color: '#fff' }}>
        {photo && (
          <div style={{ display: 'flex', width: 520, height: H }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={photo} width={520} height={H} style={{ width: 520, height: H, objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 64px' }}>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 6, color: CHAMP, textTransform: 'uppercase' }}>Mini sessions</div>
          <div style={{ display: 'flex', fontFamily: head, fontSize: titleSize(info.title, photo ? 76 : 96), lineHeight: 1.02, textTransform: 'uppercase', marginTop: 12 }}>{info.title}</div>
          <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.8)', marginTop: 14 }}>with {info.photographer}</div>
          <div style={{ display: 'flex', fontSize: 32, color: CHAMP, marginTop: 26 }}>{info.day}</div>
          {info.priceText && <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.75)', marginTop: 8 }}>{info.priceText}</div>}
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#fff', marginTop: 34, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 20 }}>BOOK YOUR SLOT · MADE KULTURE</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fonts(f) },
  )
}

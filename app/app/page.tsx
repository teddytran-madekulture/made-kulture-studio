// /app — the ONE link for the Made Kulture app (2026-10-20). Put this address on
// QR codes, IG and emails, never the raw store URLs (lib/app-links.ts).
//   iPhone / iPad  → App Store
//   Android        → Google Play
//   anything else  → this page: both stores + a QR to scan with a phone
// ⚠️ iPadOS Safari reports itself as a Mac, so an iPad can land on the page
// instead of the redirect. The App Store button on it still works.
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import qrcode from 'qrcode-generator'
import { APP_STORE_URL, PLAY_STORE_URL, platformFromUA } from '@/lib/app-links'
import { StoreButtons } from '@/components/AppLinks'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Get the app',
  description: 'The Made Kulture app for iPhone and Android: your bookings, the Creative Directory and your messages in one tap.',
}

function qrPath(url: string) {
  const q = qrcode(0, 'M'); q.addData(url); q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  return { d, n }
}

export default function AppLinkPage() {
  const platform = platformFromUA(headers().get('user-agent'))
  if (platform === 'ios') redirect(APP_STORE_URL)
  if (platform === 'android') redirect(PLAY_STORE_URL)

  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://madekulture.com').replace(/\/$/, '')
  const { d, n } = qrPath(`${base}/app`)
  const pad = 2

  return (
    <main style={{ background: '#080808', minHeight: 'var(--vh-full, 100vh)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <Link href="/" style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', textDecoration: 'none', lineHeight: 1 }}>MADE KULTURE</Link>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(48px, 9vw, 72px)', lineHeight: 0.9, margin: '36px 0 18px', letterSpacing: '0.01em' }}>
          GET THE<br />APP.
        </h1>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, margin: '0 auto 30px', maxWidth: 380 }}>
          Your bookings, the Creative Directory and your messages, one tap away. Plus a notification the moment someone messages you.
        </p>
        <div style={{ display: 'inline-block', background: '#fff', padding: 14, borderRadius: 10, marginBottom: 12 }}>
          <svg width="168" height="168" viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`} shapeRendering="crispEdges" role="img" aria-label="QR code for madekulture.com/app">
            <path d={d} fill="#080808" />
          </svg>
        </div>
        <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.4)', marginBottom: 30 }}>
          SCAN WITH YOUR PHONE
        </div>
        <StoreButtons show="both" align="center" />
      </div>
    </main>
  )
}

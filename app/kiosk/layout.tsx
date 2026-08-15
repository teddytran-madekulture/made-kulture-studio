import type { Viewport } from 'next'

// ⚠️ ZOOM IS DISABLED FOR THE KIOSK ROUTE ONLY.
//
// The root layout sets `maximumScale: 5` on purpose — a real visitor on the
// public site must be able to pinch a price or a set photo larger, and taking
// that away from everybody is an accessibility regression, not a kiosk setting.
// This layout overrides it for /kiosk (and therefore for /t/<code>, which
// redirects here) and nothing else.
//
// Android WebView — which is what Fully Kiosk runs — DOES honour
// `user-scalable=no`. iOS Safari has ignored it since iOS 10, so this would not
// be enough on an iPad; on the Fire HD 10 it is.
//
// Double-tap zoom is a separate gesture and survives this; `touchAction:
// 'manipulation'` on the kiosk's own wrapper kills that one.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

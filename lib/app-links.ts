// The Made Kulture store apps (2026-10-20, both live) — the ONE place their
// links live. Everything customer-facing points at /app (app/app/page.tsx),
// which sends each phone to its own store, so QR codes, IG and emails carry ONE
// address and never go stale if a store URL changes.
//
// ⚠️ The apps are a Capacitor shell that LOADS madekulture.com, so every web
// surface that says "get the app" must hide itself inside the app
// (inNativeApp() from lib/native-push) — otherwise members are asked to
// install the app they are already using.

export const APP_STORE_ID = '6820196763'
export const APP_STORE_URL = `https://apps.apple.com/us/app/made-kulture/id${APP_STORE_ID}`
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.madekulture.app'
export const APP_LINK_PATH = '/app'

export type Platform = 'ios' | 'android' | 'other'

export function platformFromUA(ua: string | null | undefined): Platform {
  const u = ua || ''
  if (/android/i.test(u)) return 'android'
  if (/iphone|ipad|ipod/i.test(u)) return 'ios'
  return 'other'
}

/** iOS browsers that are NOT Safari never show Apple's Smart App Banner
 *  (Chrome, Firefox, Edge, and the Instagram/Facebook/Google in-app browsers —
 *  where most IG traffic lands), so those get our own strip instead. */
export function isIosNonSafari(ua: string | null | undefined): boolean {
  const u = ua || ''
  return /iphone|ipad|ipod/i.test(u) && /CriOS|FxiOS|EdgiOS|Instagram|FBAN|FBAV|GSA\/|Line\//i.test(u)
}

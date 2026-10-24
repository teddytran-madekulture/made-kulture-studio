// Push notifications INSIDE the Made Kulture App Store app (2026-10-07).
//
// Talks to @capacitor/push-notifications through window.Capacitor's bridge
// (same approach as lib/native-auth.ts) so the website gains no dependency.
// Outside the app every export is a no-op.
//
// Flow: checkPermissions → requestPermissions (only when the member taps the
// button, or once after first sign-in) → register → the 'registration' event
// carries the APNs token → POST /api/push/native. The token is remembered in
// localStorage so the settings screen can tell whether THIS phone is on.
//
// ⚠️ Needs an app build that includes the PushNotifications plugin (TestFlight
// build after 2026-10-07). Older builds report unavailable and the UI says to
// update.

type Cap = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  isPluginAvailable?: (name: string) => boolean
  nativePromise: (plugin: string, method: string, opts?: unknown) => Promise<any>
  nativeCallback: (plugin: string, method: string, opts: unknown, cb: (data: any, err?: any) => void) => string
}

const PLUGIN = 'PushNotifications'
const TOKEN_KEY = 'mk-native-push-token'

function cap(): Cap | null {
  if (typeof window === 'undefined') return null
  const c = (window as any).Capacitor as Cap | undefined
  return c?.isNativePlatform?.() ? c : null
}

export function inNativeApp(): boolean { return cap() !== null }

export function nativePushAvailable(): boolean {
  const c = cap()
  return !!c && (!c.isPluginAvailable || c.isPluginAvailable(PLUGIN))
}

function platform(): 'ios' | 'android' {
  return cap()?.getPlatform?.() === 'android' ? 'android' : 'ios'
}

function storedToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

export async function nativePushPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  const c = cap()
  if (!c || !nativePushAvailable()) return 'denied'
  try {
    const r = await c.nativePromise(PLUGIN, 'checkPermissions')
    const v = r?.receive
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'prompt'
  } catch { return 'denied' }
}

/** Is THIS phone registered for the signed-in member? */
export async function nativePushStatus(): Promise<boolean> {
  const token = storedToken()
  if (!token || (await nativePushPermission()) !== 'granted') return false
  const r = await fetch(`/api/push/native?token=${encodeURIComponent(token)}`, { cache: 'no-store' }).catch(() => null)
  const d = r?.ok ? await r.json().catch(() => ({})) : {}
  return !!d.enabled
}

function getToken(c: Cap): Promise<string> {
  return new Promise((resolve, reject) => {
    const ids: { eventName: string; callbackId: string }[] = []
    const cleanup = () => ids.forEach(l => c.nativePromise(PLUGIN, 'removeListener', l).catch(() => {}))
    const timer = setTimeout(() => { cleanup(); reject(new Error('Your phone didn’t answer. Please try again.')) }, 15000)
    const listen = (eventName: string, cb: (ev: any) => void) =>
      ids.push({ eventName, callbackId: c.nativeCallback(PLUGIN, 'addListener', { eventName }, cb) })
    listen('registration', (ev) => {
      clearTimeout(timer); cleanup()
      ev?.value ? resolve(String(ev.value)) : reject(new Error('No device token.'))
    })
    listen('registrationError', (ev) => {
      clearTimeout(timer); cleanup()
      reject(new Error(ev?.error || 'Registration failed.'))
    })
    c.nativePromise(PLUGIN, 'register').catch(e => { clearTimeout(timer); cleanup(); reject(e) })
  })
}

/** Ask (if needed), register, and save this phone. `ask:false` never shows
 *  the iOS prompt — used to silently refresh the token on launch. */
export async function nativePushEnable(ask = true): Promise<{ ok: boolean; error?: string }> {
  const c = cap()
  if (!c) return { ok: false, error: 'Not running in the app.' }
  if (!nativePushAvailable()) return { ok: false, error: 'Please update the Made Kulture app to turn on notifications.' }
  let perm = await nativePushPermission()
  if (perm === 'prompt' && ask) {
    const r = await c.nativePromise(PLUGIN, 'requestPermissions').catch(() => null)
    perm = r?.receive === 'granted' ? 'granted' : 'denied'
  }
  if (perm !== 'granted') {
    return { ok: false, error: 'Notifications are off for Made Kulture. Turn them on in your phone’s Settings → Made Kulture → Notifications.' }
  }
  try {
    const token = await getToken(c)
    const r = await fetch('/api/push/native', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, platform: platform() }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: d.error || 'Couldn’t save this phone.' }
    try { localStorage.setItem(TOKEN_KEY, token) } catch {}
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Couldn’t turn on notifications.' }
  }
}

export async function nativePushDisable(): Promise<void> {
  const token = storedToken()
  if (token) await fetch('/api/push/native', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => {})
  try { localStorage.removeItem(TOKEN_KEY) } catch {}
}

// 2026-10-23 — NOTIFICATION TAP → THE RIGHT PAGE, with no homepage flash.
// The app always loads the homepage first. The plugin HOLDS a tap that arrives
// before anyone is listening (iOS retainUntilConsumed; Android BridgeActivity
// replays the launch intent), so a cold-start tap was never lost, but the
// listener only went on after React hydrated, so the guest watched the whole
// homepage draw and THEN got thrown to the thread. It looked like "it opens
// the homepage". Now an inline <script> at the top of <body> (app/layout.tsx)
// listens while the page is still parsing, blanks the page and replaces it.
// installNativePushTapHandler() stays as the fallback for when window.Capacitor
// wasn't injected yet at parse time; window.__mkPushTap stops a double listener.
// ⚠️ Same-page taps (only the #hash differs) must NOT blank the page: replace()
// would just change the hash and leave it hidden forever.
const TAP_NAV_JS = `function(ev){var u=ev&&ev.notification&&ev.notification.data&&ev.notification.data.url;if(typeof u!=='string'||u.charAt(0)!=='/'||u.charAt(1)==='/')return;var a=document.createElement('a');a.href=u;if(a.pathname===location.pathname&&a.search===location.search){if(a.hash)location.hash=a.hash;return}var d=document.documentElement;d.style.background='#080808';d.style.visibility='hidden';location.replace(u)}`

/** Inline boot script for the root layout. Plain ES5, no imports. */
export const PUSH_TAP_BOOT_SCRIPT = `(function(){try{var c=window.Capacitor;if(!c||!c.isNativePlatform||!c.isNativePlatform())return;if(c.isPluginAvailable&&!c.isPluginAvailable('${PLUGIN}'))return;if(window.__mkPushTap)return;window.__mkPushTap=c.nativeCallback('${PLUGIN}','addListener',{eventName:'pushNotificationActionPerformed'},${TAP_NAV_JS})}catch(e){}})()`

/** Fallback: tapping a notification opens the page it's about. Once per page load. */
export function installNativePushTapHandler(): void {
  const c = cap()
  const w = window as any
  if (!c || !nativePushAvailable() || w.__mkPushTap) return
  // Run the SAME boot script, so there is one copy of the tap logic.
  const el = document.createElement('script')
  el.text = PUSH_TAP_BOOT_SCRIPT
  document.head.appendChild(el)
}

const ASKED_KEY = 'mk-native-push-asked'

/** Mounted once in the root layout. Inside the app: wires notification taps,
 *  silently refreshes this phone's token on launch, and — the first time a
 *  signed-in member reaches their account — asks once for permission. */
export async function bootNativePush(pathname: string): Promise<void> {
  if (!inNativeApp() || !nativePushAvailable()) return
  installNativePushTapHandler()
  const perm = await nativePushPermission()
  if (perm === 'granted') {
    if (storedToken()) await nativePushEnable(false)
    return
  }
  if (perm !== 'prompt' || !pathname.startsWith('/account')) return
  let asked = false
  try { asked = localStorage.getItem(ASKED_KEY) === '1'; localStorage.setItem(ASKED_KEY, '1') } catch {}
  if (!asked) await nativePushEnable(true)
}

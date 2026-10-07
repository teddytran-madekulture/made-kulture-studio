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

/** Tapping a notification opens the page it's about. Install once per page load. */
export function installNativePushTapHandler(): void {
  const c = cap()
  const w = window as any
  if (!c || !nativePushAvailable() || w.__mkPushTap) return
  w.__mkPushTap = c.nativeCallback(PLUGIN, 'addListener', { eventName: 'pushNotificationActionPerformed' }, (ev) => {
    const url = ev?.notification?.data?.url
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) window.location.href = url
  })
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

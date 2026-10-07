// Google (and later Apple) sign-in INSIDE the Made Kulture iPhone/Android app.
// Added 2026-10-07.
//
// Why this exists: the app is a Capacitor shell that loads madekulture.com in
// a web view. Google refuses (or half-works) inside embedded web views, and its
// 2-step prompt finishes in SAFARI -- so the user ends up signed in in Safari
// while the app sits on "Signing in..." forever.
//
// Inside the app we instead:
//   1. ask Supabase for the Google URL without navigating (skipBrowserRedirect)
//      -- this still stores the PKCE code_verifier cookie in the app's web view
//   2. open that URL in the native in-app browser sheet (@capacitor/browser)
//   3. Supabase redirects to com.madekulture.app://auth/callback?code=...
//      which iOS hands back to the app (CFBundleURLTypes in Info.plist)
//   4. we close the sheet and send the web view to the SAME /auth/callback
//      route the website uses, so the code exchange, email-change reconcile
//      and redirect all run exactly as on the web.
//
// Outside the app every export here is a no-op / returns false, so the
// website's normal OAuth redirect is untouched.
//
// ⚠️ We talk to the native plugins through window.Capacitor's bridge
// (nativePromise / nativeCallback) instead of importing @capacitor/core, so
// the website gets no new dependency. Plugin names: 'Browser', 'App'.
// ⚠️ Supabase -> Auth -> URL Configuration -> Redirect URLs MUST include
// com.madekulture.app://** or Supabase silently falls back to the Site URL
// and the sheet just loads the website.

import type { SupabaseClient } from '@supabase/supabase-js'

export const APP_AUTH_REDIRECT = 'com.madekulture.app://auth/callback'

type Cap = {
  isNativePlatform?: () => boolean
  nativePromise: (plugin: string, method: string, opts?: unknown) => Promise<any>
  nativeCallback: (plugin: string, method: string, opts: unknown, cb: (data: any, err?: any) => void) => string
}

function cap(): Cap | null {
  if (typeof window === 'undefined') return null
  const c = (window as any).Capacitor as Cap | undefined
  return c?.isNativePlatform?.() ? c : null
}

export function isNativeApp(): boolean {
  return cap() !== null
}

/**
 * Starts an OAuth sign-in in the native browser sheet. Resolves once the sheet
 * is open; on success the web view navigates to /auth/callback by itself.
 * Calls onError with a readable message if anything fails.
 */
export async function nativeOAuthSignIn(
  supabase: SupabaseClient,
  provider: 'google' | 'apple',
  nextUrl: string,
  onError: (msg: string) => void,
): Promise<void> {
  const c = cap()
  if (!c) { onError('Not running in the app.'); return }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: APP_AUTH_REDIRECT,
      skipBrowserRedirect: true,
      ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  })
  if (error || !data?.url) { onError(error?.message || 'Could not start sign-in.'); return }

  // One listener at a time: a user who closes the sheet and taps Google again
  // must not end up with two listeners racing to navigate.
  const w = window as any
  const stop = () => {
    const id = w.__mkAuthListener
    if (id) c.nativePromise('App', 'removeListener', { eventName: 'appUrlOpen', callbackId: id }).catch(() => {})
    w.__mkAuthListener = ''
  }
  stop()

  w.__mkAuthListener = c.nativeCallback('App', 'addListener', { eventName: 'appUrlOpen' }, (ev) => {
    const url: string = ev?.url || ''
    if (!url.startsWith(APP_AUTH_REDIRECT)) return
    stop()
    c.nativePromise('Browser', 'close').catch(() => {})
    const q = new URL(url.replace('com.madekulture.app://', 'https://app.invalid/')).searchParams
    const code = q.get('code')
    if (!code) {
      onError(q.get('error_description') || 'Sign-in was cancelled.')
      return
    }
    // Same route the website uses -- the PKCE verifier cookie lives in this
    // web view, so the server-side exchange finds it.
    window.location.href = `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(nextUrl)}`
  })

  try {
    await c.nativePromise('Browser', 'open', { url: data.url, presentationStyle: 'popover' })
  } catch (e: any) {
    stop()
    onError(e?.message || 'Could not open the sign-in window.')
  }
}

'use client'
// Cloudflare Turnstile bot check (2026-10-05). Bots were signing up with
// stolen addresses (random-letter names + handles) to make our confirmation
// emails flood strangers' inboxes. Supabase Auth verifies the token itself
// once "Enable Captcha protection" is on (Auth → Attack Protection), which
// also stops bots that call the Supabase API directly and skip this form.
//
// ⚠️ With captcha ON in Supabase, EVERY email/password auth call must send a
// token: signUp, signInWithPassword (login AND the re-auth on /account/security),
// and resetPasswordForEmail. Google sign-in is unaffected. Add a token to any
// new call or it fails with "captcha protection: request disallowed".
//
// Tokens are single-use: call reset() after every attempt, success or fail.
// With NEXT_PUBLIC_TURNSTILE_SITE_KEY unset this renders nothing and
// `required` is false, so pages behave exactly as before.
import { useCallback, useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let loader: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SRC; s.async = true; s.defer = true
      s.onload = () => resolve(); s.onerror = () => { loader = null; reject(new Error('turnstile load failed')) }
      document.head.appendChild(s)
    })
  }
  return loader
}

/** const bot = useTurnstile(); … {bot.widget} … signUp({ options: { captchaToken: bot.token } }); bot.reset() */
export function useTurnstile(theme: 'dark' | 'light' | 'auto' = 'dark') {
  const ref = useRef<HTMLDivElement | null>(null)
  const idRef = useRef<string | null>(null)
  const [token, setToken] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile || idRef.current) return
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        theme,
        // Invisible for almost everyone; a checkbox appears only if Cloudflare is unsure.
        appearance: 'interaction-only',
        callback: (t: string) => { setToken(t); setFailed(false) },
        'expired-callback': () => setToken(undefined),
        'error-callback': () => { setToken(undefined); setFailed(true) },
      })
    }).catch(() => setFailed(true))
    return () => {
      cancelled = true
      if (idRef.current && window.turnstile) { try { window.turnstile.remove(idRef.current) } catch {} }
      idRef.current = null
    }
  }, [theme])

  const reset = useCallback(() => {
    setToken(undefined)
    if (idRef.current && window.turnstile) { try { window.turnstile.reset(idRef.current) } catch {} }
  }, [])

  const widget = SITE_KEY
    ? (
      <div>
        <div ref={ref} />
        {failed && <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#e6a0a0', marginTop: 6 }}>Couldn&apos;t run the security check. Refresh the page and try again.</div>}
      </div>
    )
    : null

  return {
    widget,
    token,
    reset,
    /** true when a token is needed and not ready yet — disable the submit button */
    waiting: !!SITE_KEY && !token,
  }
}

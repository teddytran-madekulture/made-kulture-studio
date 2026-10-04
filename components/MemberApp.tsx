'use client'
// THE MADE KULTURE APP — installable from the website, no App Store (2026-10-03).
//
// Three pieces:
//   <InstallCatcher/>  mounted in the root layout. Chrome/Android fire
//                      `beforeinstallprompt` ONCE, early, on whatever page the
//                      visitor lands on — if nothing is listening it's gone,
//                      so it's caught globally and parked on window.
//   useMemberApp()     state + actions: installed? iPhone? can we one-tap
//                      install? are notifications on for THIS device?
//   <GetAppCard/> / <GetAppBanner/>  the full setup screen (/account/app) and
//                      the small nudge shown where it matters (messages,
//                      service listings).
//
// ⚠️ iPhone: a website cannot install itself. The user taps Share → Add to Home
// Screen in Safari, and web push only works once it's opened FROM the home
// screen (iOS 16.4+). So on iOS the card shows install steps first and only
// offers notifications inside the installed app.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

declare global { interface Window { __mkInstall?: any } }

export function InstallCatcher() {
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); window.__mkInstall = e; window.dispatchEvent(new Event('mk-install-ready')) }
    const onInstalled = () => { window.__mkInstall = undefined; window.dispatchEvent(new Event('mk-install-ready')) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  return null
}

function urlB64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(Array.from(raw, c => c.charCodeAt(0)))
}

export type AppState = {
  ready: boolean
  standalone: boolean
  ios: boolean
  canPrompt: boolean
  pushSupported: boolean
  pushOn: boolean
  permission: NotificationPermission | 'unsupported'
}

export function useMemberApp() {
  const [s, setS] = useState<AppState>({ ready: false, standalone: false, ios: false, canPrompt: false, pushSupported: false, pushOn: false, permission: 'unsupported' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refresh = useCallback(async () => {
    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    let pushOn = false
    if (pushSupported) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/')
        const sub = reg ? await reg.pushManager.getSubscription() : null
        if (sub) {
          const r = await fetch(`/api/push/member?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: 'no-store' })
          const d = await r.json().catch(() => ({}))
          pushOn = !!d.enabled
        }
      } catch { /* treat as off */ }
    }
    setS({ ready: true, ios, standalone, canPrompt: !!window.__mkInstall, pushSupported, pushOn, permission: pushSupported ? Notification.permission : 'unsupported' })
  }, [])

  useEffect(() => {
    refresh()
    const on = () => refresh()
    window.addEventListener('mk-install-ready', on)
    return () => window.removeEventListener('mk-install-ready', on)
  }, [refresh])

  const install = async () => {
    const p = window.__mkInstall
    if (!p) return
    p.prompt()
    try { await p.userChoice } catch {}
    window.__mkInstall = undefined
    refresh()
  }

  const enable = async () => {
    setBusy(true); setMsg('')
    try {
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapid) { setMsg('Notifications aren’t set up yet.'); return }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setMsg('Notifications are blocked for this site. Turn them on in your phone or browser settings, then try again.'); return }
      const reg = await navigator.serviceWorker.register('/member-sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapid) as any })
      const r = await fetch('/api/push/member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(d.error || 'Couldn’t save this device.'); return }
      setMsg('Notifications are on for this device.')
    } catch (e: any) {
      setMsg(`Couldn’t turn on notifications${e?.message ? `: ${e.message}` : '.'}`)
    } finally { setBusy(false); refresh() }
  }

  const disable = async () => {
    setBusy(true); setMsg('')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await fetch('/api/push/member', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setMsg('Notifications are off for this device.')
    } finally { setBusy(false); refresh() }
  }

  const test = async () => {
    setBusy(true); setMsg('')
    const r = await fetch('/api/push/member/test', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    // "Sent", never "delivered" — the push service accepting it is all we know.
    setMsg(r.ok ? (d.accepted ? 'Test sent — it should pop up in a few seconds.' : 'No device is set up to receive it yet.') : (d.error || 'Test failed.'))
  }

  return { s, busy, msg, install, enable, disable, test }
}

const fg = 'var(--t-fg)'
const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const line = '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))'
const btn: React.CSSProperties = { background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4, padding: '13px 22px', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', color: muted, border: line, fontWeight: 600 }

function ShareIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-3px' }}><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
}

/** The full setup screen — /account/app. */
export function GetAppCard() {
  const { s, busy, msg, install, enable, disable, test } = useMemberApp()
  if (!s.ready) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted }}>Checking this device…</div>

  const step = (n: number, title: string, done: boolean, body: React.ReactNode) => (
    <div style={{ border: line, borderRadius: 10, padding: '16px 18px', marginBottom: 12, opacity: done ? 0.75 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: done ? 0 : 10 }}>
        <span style={{ width: 24, height: 24, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: done ? 'var(--t-gold)' : 'transparent', color: done ? 'var(--t-on-fg)' : fg, border: done ? 'none' : line }}>{done ? '✓' : n}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: fg }}>{title}</span>
      </div>
      {!done && <div style={{ fontSize: 13.5, color: muted, lineHeight: 1.6 }}>{body}</div>}
    </div>
  )

  const installBody = s.ios ? (
    <ol style={{ margin: 0, paddingLeft: 18 }}>
      <li>Open <strong style={{ color: fg }}>madekulture.com</strong> in <strong style={{ color: fg }}>Safari</strong>.</li>
      <li>Tap the <strong style={{ color: fg }}>Share</strong> button <ShareIcon /> at the bottom of the screen.</li>
      <li>Scroll down and tap <strong style={{ color: fg }}>Add to Home Screen</strong>, then <strong style={{ color: fg }}>Add</strong>.</li>
      <li>Open <strong style={{ color: fg }}>Made Kulture</strong> from your home screen and come back to this page to turn on notifications.</li>
    </ol>
  ) : s.canPrompt ? (
    <><div style={{ marginBottom: 12 }}>One tap — it goes on your home screen like any app.</div><button type="button" onClick={install} style={btn}>INSTALL THE APP</button></>
  ) : (
    <>Open your browser menu (<strong style={{ color: fg }}>⋮</strong>) and choose <strong style={{ color: fg }}>Install app</strong> or <strong style={{ color: fg }}>Add to Home screen</strong>. On a computer, look for the install icon at the right end of the address bar.</>
  )

  const iosNeedsInstall = s.ios && !s.standalone
  const notifBody = iosNeedsInstall ? (
    <>On iPhone, notifications work once the app is on your home screen. Finish step 1, open the app, and turn them on there.</>
  ) : !s.pushSupported ? (
    <>This browser doesn’t support notifications. You’ll still get every request and message by email.</>
  ) : (
    <><div style={{ marginBottom: 12 }}>Get a buzz the moment someone messages you or requests one of your listings.</div><button type="button" onClick={enable} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'TURNING ON…' : 'TURN ON NOTIFICATIONS'}</button></>
  )

  return (
    <div style={{ fontFamily: 'Inter', maxWidth: 560 }}>
      <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, marginTop: 0 }}>
        Made Kulture works like an app on your phone, straight from the website. No App Store: your bookings, door codes, the directory and your messages, one tap away.
      </p>
      {step(1, 'Put Made Kulture on your home screen', s.standalone, installBody)}
      {step(2, 'Turn on notifications', s.pushOn, notifBody)}
      {s.pushOn && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <button type="button" onClick={test} disabled={busy} style={btn}>SEND A TEST</button>
          <button type="button" onClick={disable} disabled={busy} style={ghost}>TURN OFF ON THIS DEVICE</button>
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: 'var(--t-gold)', marginTop: 14 }}>{msg}</div>}
      <p style={{ fontSize: 12, color: muted, lineHeight: 1.5, marginTop: 20 }}>Email notifications keep working either way. Notifications are per device, so turn them on for each phone or computer you use.</p>
    </div>
  )
}

/** The compact nudge. Renders nothing once notifications are on for this
 *  device, or after it's dismissed (remembered per device). */
export function GetAppBanner({ reason, storageKey = 'mk-app-banner' }: { reason: string; storageKey?: string }) {
  const { s } = useMemberApp()
  const [hidden, setHidden] = useState(true)
  useEffect(() => { try { setHidden(localStorage.getItem(storageKey) === '1') } catch { setHidden(false) } }, [storageKey])
  if (!s.ready || s.pushOn || hidden) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(var(--t-gold-rgb), 0.45)', background: 'rgba(var(--t-gold-rgb), 0.07)', borderRadius: 10, padding: '12px 14px', margin: '0 0 16px', fontFamily: 'Inter' }}>
      <div style={{ flex: 1, fontSize: 13, color: fg, lineHeight: 1.45 }}>
        <strong>Get the Made Kulture app.</strong> <span style={{ color: muted }}>{reason}</span>
      </div>
      <Link href="/account/app" style={{ ...btn, padding: '9px 14px', fontSize: 11, textDecoration: 'none', whiteSpace: 'nowrap' }}>SET UP</Link>
      <button type="button" aria-label="Dismiss" onClick={() => { setHidden(true); try { localStorage.setItem(storageKey, '1') } catch {} }}
        style={{ background: 'none', border: 'none', color: muted, fontSize: 18, cursor: 'pointer', padding: 4 }}>×</button>
    </div>
  )
}

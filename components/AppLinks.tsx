'use client'
// "Get the app" pieces for the website (2026-10-20). Links come from
// lib/app-links.ts. ⚠️ Every piece renders NOTHING inside the store app itself
// (it loads this same website), so nobody is asked to install the app they're in.
//
//   <StoreButtons/>   App Store / Google Play buttons. show="auto" shows only the
//                     phone's own store (both on a computer).
//   <AppPromoCard/>   the card on the booking success screen.
//   <AppStrip/>       the slim top strip AnnouncementBar falls back to on Android
//                     and in iPhone browsers that aren't Safari (Safari gets
//                     Apple's own Smart App Banner from app/layout.tsx instead).
//
// The buttons are text, not Apple's/Google's official badge artwork, which
// can't be downloaded from here. Swap in the official badges later if wanted.
import { useEffect, useState } from 'react'
import { inNativeApp } from '@/lib/native-push'
import { APP_STORE_URL, PLAY_STORE_URL, APP_LINK_PATH, platformFromUA, isIosNonSafari, type Platform } from '@/lib/app-links'

export type AppEnv = { ready: boolean; native: boolean; platform: Platform; iosNonSafari: boolean }

export function useAppEnv(): AppEnv {
  const [env, setEnv] = useState<AppEnv>({ ready: false, native: false, platform: 'other', iosNonSafari: false })
  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    let native = false
    try { native = inNativeApp() } catch {}
    setEnv({ ready: true, native, platform: platformFromUA(ua), iosNonSafari: isIosNonSafari(ua) })
  }, [])
  return env
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
  minWidth: 150, padding: '9px 16px', borderRadius: 8, textDecoration: 'none',
  border: '1px solid rgba(255,255,255,0.35)', background: '#000', color: '#fff', lineHeight: 1.1,
}
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.7)' }
const big: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 2 }

function StoreButton({ store }: { store: 'ios' | 'android' }) {
  const ios = store === 'ios'
  return (
    <a href={ios ? APP_STORE_URL : PLAY_STORE_URL} target="_blank" rel="noreferrer" style={btnBase}
      aria-label={ios ? 'Download Made Kulture on the App Store' : 'Get Made Kulture on Google Play'}>
      <span style={small}>{ios ? 'Download on the' : 'Get it on'}</span>
      <span style={big}>{ios ? 'App Store' : 'Google Play'}</span>
    </a>
  )
}

export function StoreButtons({ show = 'auto', align = 'left' }: { show?: 'auto' | 'both'; align?: 'left' | 'center' }) {
  const env = useAppEnv()
  if (env.native) return null
  if (show === 'auto' && !env.ready) return null
  const which: ('ios' | 'android')[] =
    show === 'both' || env.platform === 'other' ? ['ios', 'android'] : [env.platform]
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
      {which.map(s => <StoreButton key={s} store={s} />)}
    </div>
  )
}

/** The success-screen card. Text matches what the app does TODAY: push covers
 *  messages, casting interest and listing requests — booking reminders and door
 *  codes still go by text/email, so don't promise those here. */
export function AppPromoCard() {
  const env = useAppEnv()
  if (!env.ready || env.native) return null
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '22px 22px', marginBottom: 32, textAlign: 'left' }}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 24, color: '#fff', letterSpacing: '0.02em', marginBottom: 8 }}>GET THE APP</div>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 16px' }}>
        Your bookings, the Creative Directory and your messages, one tap away. Free for iPhone and Android.
      </p>
      <StoreButtons show="auto" />
    </div>
  )
}

const STRIP_KEY = 'mk_app_strip_closed'

/** True when the strip should show on this device (hidden-path check is the
 *  caller's — AnnouncementBar already does it). */
export function useAppStripEligible(): [boolean, () => void] {
  const env = useAppEnv()
  const [closed, setClosed] = useState(true)
  useEffect(() => { try { setClosed(localStorage.getItem(STRIP_KEY) === '1') } catch { setClosed(false) } }, [])
  const eligible = env.ready && !env.native && !closed && (env.platform === 'android' || env.iosNonSafari)
  const dismiss = () => { setClosed(true); try { localStorage.setItem(STRIP_KEY, '1') } catch {} }
  return [eligible, dismiss]
}

export function AppStrip({ onClose }: { onClose: () => void }) {
  return (
    <>
      <span style={{ fontWeight: 600 }}>Made Kulture is on your phone now.</span>{' '}
      <a href={APP_LINK_PATH} style={{ color: '#d4a843', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>GET THE APP →</a>
      <button aria-label="Close" onClick={onClose}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer', opacity: 0.7, padding: 6 }}>×</button>
    </>
  )
}

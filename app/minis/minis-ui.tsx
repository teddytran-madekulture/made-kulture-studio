// Shared look for the two public Mini Sessions pages (sign-up + "my slot").
// Same luxury-dark language as /manage and the kiosk.
import type { CSSProperties } from 'react'

export const CHAMP = '#c9b27e'
export const INK = '#0b0b0d'
export const wrap: CSSProperties = { minHeight: 'var(--vh-full, 100vh)', background: INK, color: '#fff', padding: '40px 16px 64px', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', justifyContent: 'center' }
export const card: CSSProperties = { width: '100%', maxWidth: 560, background: '#121214', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '28px 22px', boxSizing: 'border-box' }
export const kicker: CSSProperties = { fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: CHAMP, marginBottom: 10 }
export const h1: CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, lineHeight: 1.05, margin: '0 0 8px', letterSpacing: '0.01em' }
export const label: CSSProperties = { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 6, display: 'block' }
export const input: CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)', background: '#0d0d10', color: '#fff', colorScheme: 'dark', fontFamily: 'inherit' }
export const option: CSSProperties = { background: '#121214', color: '#fff' }
export const primary: CSSProperties = { width: '100%', padding: '15px 18px', borderRadius: 8, border: 'none', background: CHAMP, color: '#000', fontWeight: 700, fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }
export const ghost: CSSProperties = { padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }
export const body: CSSProperties = { fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.78)', margin: '0 0 14px' }
export const fine: CSSProperties = { fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' }

/** The photographer's cover photo, bleeding to the card's edges. */
export function Cover({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} style={{ display: 'block', width: 'calc(100% + 44px)', margin: '-28px -22px 22px', maxHeight: 460, objectFit: 'cover', borderRadius: '12px 12px 0 0' }} />
  )
}

/**
 * The photographer's OWN pay link. Made Kulture only shows the button — the
 * money goes straight to them. The host is printed so clients see where it leads.
 */
export function PayButton({ url, host, photographer }: { url: string | null | undefined; host: string | null | undefined; photographer: string }) {
  if (!url) return null
  return (
    <div style={{ margin: '18px 0 6px' }}>
      <a href={url} target="_blank" rel="noopener noreferrer nofollow"
        style={{ ...primary, display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
        Pay {photographer} →
      </a>
      <div style={{ ...fine, marginTop: 8, textAlign: 'center' }}>
        Opens {host || 'their pay page'}. Payment goes straight to {photographer} — Made Kulture never handles it.
      </div>
    </div>
  )
}

/** Under every public Mini Sessions page: who runs this, and how to run your own. */
export function MkFooter() {
  return (
    <a href="/mini-sessions" style={{ display: 'block', textAlign: 'center', marginTop: 18, fontSize: 12, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', textDecoration: 'none' }}>
      Mini Sessions by <span style={{ color: CHAMP }}>Made Kulture</span> — run yours here →
    </a>
  )
}

export const column: CSSProperties = { width: '100%', maxWidth: 560 }

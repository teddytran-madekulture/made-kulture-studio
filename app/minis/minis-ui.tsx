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

'use client'
import { useEffect, useState } from 'react'

// Light/dark switch for the account area. The startup script in
// app/account/layout.tsx sets html[data-acct-theme] before first paint (saved
// choice, else the device's light/dark setting); this button flips and saves it.
const KEY = 'mk-acct-theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)

  useEffect(() => {
    setTheme(document.documentElement.dataset.acctTheme === 'light' ? 'light' : 'dark')
  }, [])

  const flip = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.acctTheme = next
    try { localStorage.setItem(KEY, next) } catch {}
    setTheme(next)
  }

  const light = theme === 'light'
  return (
    <button type="button" onClick={flip}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Dark mode' : 'Light mode'}
      style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid rgba(var(--t-fg-rgb), calc(0.15 * var(--t-a)))', borderRadius: 4, color: 'var(--t-fg)', cursor: 'pointer', padding: 0, visibility: theme ? 'visible' : 'hidden' }}>
      {light ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" /></svg>
      )}
    </button>
  )
}

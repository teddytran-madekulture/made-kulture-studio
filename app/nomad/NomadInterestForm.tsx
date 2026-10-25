'use client'

// The Nomad interest form. Posts JSON to /api/nomad/interest.
// ⚠️ Inputs are 16px: iOS zooms on anything smaller and the app never zooms
// back out. ⚠️ <option>s set background AND color + colorScheme dark, or the
// popup follows the visitor's OS theme (see the dark-mode-select note).

import { useState } from 'react'

const GOLD = '#c9b27e'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const ROLES = ['Photographer', 'Model', 'Makeup artist', 'Hair stylist', 'Wardrobe stylist', 'Videographer', 'Other']
const TRIPS = ['Every month', 'Every 2–3 months', 'A few times a year', 'Not sure yet']

const label: React.CSSProperties = {
  display: 'block', fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)', marginBottom: 8,
}
const field: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)',
  color: '#fff', padding: '13px 14px', fontSize: 16, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
  borderRadius: 0, colorScheme: 'dark',
}
const opt: React.CSSProperties = { background: '#111', color: '#fff' }

function F({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label htmlFor={`nomad-${name}`} style={label}>{title}</label>
      {children}
    </div>
  )
}

export default function NomadInterestForm() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget).entries())
      const r = await fetch('/api/nomad/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Something went wrong. Please try again.'); return }
      setDone(true)
    } catch {
      setErr('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ border: `1px solid ${GOLD}`, padding: 32 }}>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, textTransform: 'uppercase', marginBottom: 10 }}>Application received</div>
        <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, margin: 0 }}>
          Thanks. We review every application and will reach out. If the founding group is full, you&rsquo;re on the waitlist and we&rsquo;ll contact you when a spot opens.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', columnGap: 18 }}>
        <F name="name" title="Name *"><input id="nomad-name" name="name" required autoComplete="name" style={field} /></F>
        <F name="email" title="Email *"><input id="nomad-email" name="email" type="email" required autoComplete="email" style={field} /></F>
        <F name="role" title="What you do *">
          <select id="nomad-role" name="role" required defaultValue="" style={field}>
            <option value="" disabled style={opt}>Choose one</option>
            {ROLES.map(r => <option key={r} value={r} style={opt}>{r}</option>)}
          </select>
        </F>
        <F name="based_in" title="Where you're based"><input id="nomad-based_in" name="based_in" placeholder="Houston, TX" style={field} /></F>
        <F name="instagram" title="Instagram"><input id="nomad-instagram" name="instagram" placeholder="@yourhandle" style={field} /></F>
        <F name="phone" title="Phone"><input id="nomad-phone" name="phone" type="tel" autoComplete="tel" style={field} /></F>
        <F name="portfolio_url" title="Portfolio link"><input id="nomad-portfolio_url" name="portfolio_url" type="url" placeholder="https://" style={field} /></F>
        <F name="trips_per_year" title="How often you'd stay at a Nomad house">
          <select id="nomad-trips_per_year" name="trips_per_year" defaultValue="" style={field}>
            <option value="" style={opt}>Choose one</option>
            {TRIPS.map(t => <option key={t} value={t} style={opt}>{t}</option>)}
          </select>
        </F>
      </div>
      <F name="notes" title="What would you shoot or create there?">
        <textarea id="nomad-notes" name="notes" rows={4} style={{ ...field, resize: 'vertical' }} />
      </F>

      {err && <p role="alert" style={{ color: '#ff8a80', fontFamily: 'Inter', fontSize: 14, margin: '0 0 16px' }}>{err}</p>}

      <button type="submit" disabled={busy} style={{
        background: GOLD, color: '#080808', border: 'none', padding: '16px 26px', cursor: busy ? 'default' : 'pointer',
        fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: busy ? 0.6 : 1,
      }}>
        {busy ? 'Sending…' : 'Apply →'}
      </button>
      <p style={{ fontFamily: 'Inter', fontSize: 12.5, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginTop: 14 }}>
        No payment, no commitment. We only use this to reach out about Nomad.
      </p>
    </form>
  )
}

'use client'
// Settings → Edit profile: "YOUR OWN WORK" (migration 170). Renders NOTHING
// unless the account is a VENDOR, so creatives and customers never see it.
//
// A vendor's profile is their business (listings, maybe a roster). This lets
// them give the PORTFOLIO tab its own name and identity — while a visitor has
// that tab open, the header shows this tagline / bio / Instagram / site.
// Neil Jou: agency profile + "Neil Jou Studios". A film lab: the lab + the
// owner's own photography.
//
// Its own card with its own SAVE — it sits OUTSIDE the profile <form>, because
// a nested form is invalid and its button would submit the profile instead.
import { useEffect, useState } from 'react'
import { SECOND_PROFILE_LIMITS as L } from '@/lib/second-profile'

type Second = { label: string; tagline: string; bio: string; instagram: string; website: string }

const muted = 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))'
const input: React.CSSProperties = {
  width: '100%', background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))',
  borderRadius: 4, padding: '12px 14px', fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box',
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', marginBottom: 7 }}>
        {label}{hint && <span style={{ marginLeft: 8, color: 'var(--t-gold)', fontSize: 10, letterSpacing: '0.04em' }}>· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

export default function SecondProfileEditor() {
  const [row, setRow] = useState<Second | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/account/second-profile', { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setLoadErr(d.error || 'Could not load your second profile.'); return }
      setRow(d.eligible ? d.second : null)
    }).catch(() => setLoadErr('Could not load your second profile.'))
  }, [])

  if (loadErr) return <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err, #f0a0a0)', marginTop: 28 }}>{loadErr}</div>
  if (!row) return null

  const set = (k: keyof Second) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setRow(r => r && { ...r, [k]: e.target.value }); setMsg(null) }

  const save = async () => {
    setSaving(true); setMsg(null)
    const r = await fetch('/api/account/second-profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row),
    })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (r.ok && d.second) { setRow(d.second); setMsg({ ok: true, text: 'Saved. Your profile shows it now.' }) }
    else setMsg({ ok: false, text: d.error || 'That did not save.' })
  }

  const tabName = row.label.trim() || 'Portfolio'

  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))' }}>
      <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>YOUR OWN WORK</div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted, lineHeight: 1.55, margin: '0 0 20px' }}>
        Your profile is your business. If you also shoot or create under your own name, give your portfolio tab its own name and
        identity here. When someone opens the {tabName} tab, the top of your profile switches to what you write below.
        Leave it blank and your business profile shows on every tab.
      </p>

      <F label="PORTFOLIO TAB NAME" hint="optional">
        <input style={input} value={row.label} onChange={set('label')} maxLength={L.label} placeholder="e.g. Neil Jou Studios" />
      </F>
      <F label="TAGLINE" hint="the line under your name on that tab">
        <input style={input} value={row.tagline} onChange={set('tagline')} maxLength={L.tagline} placeholder="e.g. Film photographer · Houston" />
      </F>
      <F label="BIO">
        <textarea style={{ ...input, resize: 'vertical', minHeight: 110, lineHeight: 1.5 }} value={row.bio} onChange={set('bio')} maxLength={L.bio} rows={4} />
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: muted, textAlign: 'right', marginTop: 4 }}>{row.bio.length}/{L.bio}</div>
      </F>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 14px' }}>
        <F label="INSTAGRAM"><input style={input} value={row.instagram} onChange={set('instagram')} maxLength={80} placeholder="@handle" /></F>
        <F label="WEBSITE"><input style={input} value={row.website} onChange={set('website')} maxLength={L.website} placeholder="yoursite.com" /></F>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={saving} style={{
          background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4, padding: '12px 26px',
          fontFamily: 'Inter', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'SAVING...' : 'SAVE YOUR OWN WORK'}</button>
        {msg && <span style={{ fontFamily: 'Inter', fontSize: 13, color: msg.ok ? 'var(--t-ok, #6bffaa)' : 'var(--t-err, #f0a0a0)' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

'use client'
// Settings → Edit profile: "YOUR COMPANY PAGE" (migration 168). Renders NOTHING
// for an account without a roster, so ordinary members never see it.
//
// A profile with a roster shows two businesses: the roster tab (e.g. Neil Jou
// Agency) and the portfolio tab (e.g. Neil Jou Studios). Whatever is filled in
// here replaces the profile header while a visitor has the roster tab open;
// the normal profile fields above stay the header for the portfolio tab.
//
// Its own card with its own SAVE — it sits OUTSIDE the profile <form>, because
// a nested form is invalid and its button would submit the profile instead.
import { useEffect, useState } from 'react'
import { ROSTER_ABOUT_LIMITS as L } from '@/lib/roster'

type Row = {
  status: string; label: string; source_url: string
  about_tagline: string; about_bio: string; about_instagram: string; about_website: string; portfolio_label: string
}

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

function host(u: string) { try { return new URL(u).host.replace(/^www\./, '') } catch { return u } }

export default function RosterAboutEditor() {
  const [row, setRow] = useState<Row | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/account/roster', { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setLoadErr(d.error || 'Could not load your company page.'); return }
      setRow(d.roster ?? null)
    }).catch(() => setLoadErr('Could not load your company page.'))
  }, [])

  if (loadErr) return <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err, #f0a0a0)', marginTop: 28 }}>{loadErr}</div>
  if (!row) return null

  const set = (k: keyof Row) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setRow(r => r && { ...r, [k]: e.target.value }); setMsg(null) }

  const save = async () => {
    setSaving(true); setMsg(null)
    const r = await fetch('/api/account/roster', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: row.label, portfolio_label: row.portfolio_label, about_tagline: row.about_tagline,
        about_bio: row.about_bio, about_instagram: row.about_instagram, about_website: row.about_website,
      }),
    })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (r.ok && d.roster) { setRow(d.roster); setMsg({ ok: true, text: 'Saved. Your profile shows it now.' }) }
    else setMsg({ ok: false, text: d.error || 'That did not save.' })
  }

  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))' }}>
      <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 6 }}>YOUR COMPANY PAGE</div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted, lineHeight: 1.55, margin: '0 0 20px' }}>
        Your profile has two tabs: your roster and your own portfolio. When someone opens the roster tab, the top of your profile switches to what you write here.
        Leave it blank and your normal profile shows on both.
        {row.status !== 'live' && <><br /><span style={{ color: 'var(--t-gold)' }}>Your roster isn&apos;t live yet, so members can&apos;t see this part yet.</span></>}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 14px' }}>
        <F label="ROSTER TAB NAME"><input style={input} value={row.label} onChange={set('label')} maxLength={L.label} placeholder="e.g. Neil Jou Agency" /></F>
        <F label="PORTFOLIO TAB NAME" hint="optional"><input style={input} value={row.portfolio_label} onChange={set('portfolio_label')} maxLength={L.label} placeholder="e.g. Neil Jou Studios" /></F>
      </div>
      <F label="TAGLINE" hint="the line under your name">
        <input style={input} value={row.about_tagline} onChange={set('about_tagline')} maxLength={L.tagline} placeholder="e.g. Model & Talent Agency · Houston" />
      </F>
      <F label="COMPANY BIO">
        <textarea style={{ ...input, resize: 'vertical', minHeight: 110, lineHeight: 1.5 }} value={row.about_bio} onChange={set('about_bio')} maxLength={L.bio} rows={4} />
        <div style={{ fontFamily: 'Inter', fontSize: 11, color: muted, textAlign: 'right', marginTop: 4 }}>{row.about_bio.length}/{L.bio}</div>
      </F>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 14px' }}>
        <F label="COMPANY INSTAGRAM"><input style={input} value={row.about_instagram} onChange={set('about_instagram')} maxLength={80} placeholder="@handle" /></F>
        <F label="COMPANY WEBSITE"><input style={input} value={row.about_website} onChange={set('about_website')} maxLength={L.website} placeholder={host(row.source_url)} /></F>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={saving} style={{
          background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4, padding: '12px 26px',
          fontFamily: 'Inter', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'SAVING...' : 'SAVE COMPANY PAGE'}</button>
        {msg && <span style={{ fontFamily: 'Inter', fontSize: 13, color: msg.ok ? 'var(--t-ok, #6bffaa)' : 'var(--t-err, #f0a0a0)' }}>{msg.text}</span>}
      </div>
    </div>
  )
}

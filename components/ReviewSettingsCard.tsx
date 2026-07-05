'use client'
import { useEffect, useState } from 'react'

// Admin card (Settings -> Emails) for the post-session Google-review ask.
// Paste the Google "write a review" link, flip the switch, and the cron
// (/api/cron/review-requests) handles the rest: text + email 2-3 hours after
// each session, one email follow-up days later if the link wasn't clicked.
export default function ReviewSettingsCard() {
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/admin/review-settings', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setEnabled(!!d.enabled); setUrl(d.reviewUrl || ''); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const save = async (next?: { enabled?: boolean }) => {
    setSaving(true); setErr(''); setSaved(false)
    try {
      const r = await fetch('/api/admin/review-settings', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewUrl: url, enabled: next?.enabled ?? enabled }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Save failed.'); return }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  if (!loaded) return null

  return (
    <div style={{ background: 'rgba(212,168,67,0.04)', border: '1px solid rgba(212,168,67,0.2)', padding: '20px 24px', marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: '#d4a843' }}>★ GOOGLE REVIEW REQUESTS</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          <input type="checkbox" checked={enabled} disabled={saving}
            onChange={e => { setEnabled(e.target.checked); save({ enabled: e.target.checked }) }}
            style={{ width: 16, height: 16, accentColor: '#d4a843' }} />
          {enabled ? 'On' : 'Off'}
        </label>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14, lineHeight: 1.5 }}>
        2–3 hours after a session ends, the customer gets a text + email asking for a Google review
        (max one ask per customer every 90 days). If they don&apos;t click, one email follow-up goes out a few
        days later. Paste your Google &quot;write a review&quot; link below — find it in your Google Business
        Profile under <em>Ask for reviews</em>.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={url}
          onChange={e => { setUrl(e.target.value); setSaved(false) }}
          placeholder="https://g.page/r/…/review"
          style={{ flex: 1, minWidth: 260, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }}
        />
        <button onClick={() => save()} disabled={saving}
          style={{ background: '#d4a843', border: 'none', padding: '10px 18px', cursor: saving ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'SAVING…' : saved ? 'SAVED ✓' : 'SAVE'}
        </button>
      </div>
      {err && <div style={{ color: '#f0a0a0', fontSize: 12, marginTop: 10 }}>{err}</div>}
      {enabled && !url && <div style={{ color: '#fbbf24', fontSize: 12, marginTop: 10 }}>Turned on, but nothing will send until the review link is saved.</div>}
    </div>
  )
}

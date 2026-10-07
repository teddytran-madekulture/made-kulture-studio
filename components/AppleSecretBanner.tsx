'use client'
// Red admin banner when the Sign in with Apple secret is within 30 days of
// expiring (or has expired). Rendered in BOTH admin surfaces -- AdminShell and
// the dashboard's own layout (see the two-sidebars gotcha). Added 2026-10-07.
import { useEffect, useState } from 'react'

type Status = { generatedOn: string; expiresOn: string; daysLeft: number; warn: boolean }

export default function AppleSecretBanner() {
  const [s, setS] = useState<Status | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/admin/apple-secret', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.daysLeft === 'number') setS(d) })
      .catch(() => {})
  }, [])

  if (!s || !s.warn) return null

  const renewed = async () => {
    if (!confirm('Only press this after you pasted a NEW Apple secret into Supabase and saved it. Continue?')) return
    setSaving(true); setErr('')
    const r = await fetch('/api/admin/apple-secret', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (r.ok && typeof d.daysLeft === 'number') setS(d)
    else setErr(d.error || 'Could not save')
    setSaving(false)
  }

  const expired = s.daysLeft <= 0
  return (
    <div style={{ background: expired ? '#7f1d1d' : '#451a03', borderBottom: `1px solid ${expired ? '#ef4444' : '#f59e0b'}`, color: '#fff', padding: '10px 16px', fontFamily: 'Inter, sans-serif', fontSize: 13, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <strong style={{ letterSpacing: '0.04em' }}>
        {expired ? 'SIGN IN WITH APPLE HAS EXPIRED' : `SIGN IN WITH APPLE EXPIRES IN ${s.daysLeft} DAY${s.daysLeft === 1 ? '' : 'S'}`}
      </strong>
      <span style={{ opacity: 0.85 }}>
        ({s.expiresOn}). Generate a new secret in the{' '}
        <a href="https://supabase.com/docs/guides/auth/social-login/auth-apple#configuration-web-oauth" target="_blank" rel="noreferrer" style={{ color: '#fcd34d' }}>Supabase generator</a>
        {' '}(Account 3WWCP2ML95 · Service com.madekulture.signin · Key UYB6SVW3GW · .p8 in Bitwarden), paste it into{' '}
        <a href="https://supabase.com/dashboard/project/vvaftjcjydxdlkojnrfm/auth/providers?provider=Apple" target="_blank" rel="noreferrer" style={{ color: '#fcd34d' }}>Supabase → Apple</a>, Save.
      </span>
      <button onClick={renewed} disabled={saving} style={{ marginLeft: 'auto', background: '#fff', color: '#000', border: 'none', padding: '6px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>
        {saving ? 'SAVING…' : 'I RENEWED IT'}
      </button>
      {err && <span style={{ color: '#fca5a5', width: '100%' }}>{err}</span>}
    </div>
  )
}

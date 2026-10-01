'use client'
// "Change email" for a member's login, from admin lists (Recent Signups,
// Directory). Calls /api/admin/accounts/<id>/email — see lib/email-change.ts.
// ⚠️ Rows on Recent Signups are <a> links, so the click must not bubble.
import { useState } from 'react'

export default function ChangeEmailButton({ authUserId, current, onChanged, style }: {
  authUserId: string; current: string | null; onChanged?: (email: string) => void; style?: React.CSSProperties
}) {
  const [busy, setBusy] = useState(false)
  const go = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const next = window.prompt(
      `Change the login email for ${current || 'this member'} to:\n\nThe new address is marked confirmed (no verification email) and they get a heads-up email there. The old address is kept on file.`,
      '',
    )
    if (!next || !next.trim()) return
    setBusy(true)
    const r = await fetch(`/api/admin/accounts/${authUserId}/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: next.trim() }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { window.alert(d.error || 'Could not change the email — nothing was changed.'); return }
    window.alert(`Done — the login is now ${d.email}.`)
    onChanged?.(d.email)
  }
  return (
    <button type="button" onClick={go} disabled={busy}
      style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: '5px 10px', fontSize: 11, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap', ...style }}>
      {busy ? 'CHANGING…' : 'CHANGE EMAIL'}
    </button>
  )
}

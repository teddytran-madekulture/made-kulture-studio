'use client'
// "Blocked members" on /account/security (migration 148). A blocked member
// disappears from the directory and inbox, so this list is the one place to
// find them again and unblock.
import { useEffect, useState } from 'react'

type Row = { id: string; name: string; avatar_url: string | null; at: string }
const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`

export default function BlockedMembers() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/directory/block').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr((d as any).error ?? 'Could not load blocked members.'); return }
      setRows((d as any).blocked ?? [])
    }).catch(() => setErr('Could not load blocked members.'))
  }, [])

  const unblock = async (id: string) => {
    setBusy(id); setErr('')
    const r = await fetch(`/api/directory/block?userId=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setBusy(null)
    if (r.ok) setRows(list => (list ?? []).filter(x => x.id !== id))
    else setErr('Could not unblock. Try again.')
  }

  return (
    <div style={{ marginTop: 32, background: 'var(--t-surface-lo)', border: `1px solid ${muted(0.1)}`, borderRadius: 8, padding: 24, maxWidth: 480 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Blocked members</div>
      <div style={{ fontFamily: 'Inter', fontSize: 13, lineHeight: 1.55, color: muted(0.6), marginBottom: 14 }}>
        People you block can't see you in the directory or message you, and you won't see them. They aren't told. Block someone from their profile or a message thread.
      </div>
      {err && <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginBottom: 10 }}>{err}</div>}
      {rows === null && !err && <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.4) }}>Loading…</div>}
      {rows && rows.length === 0 && <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.4) }}>You haven't blocked anyone.</div>}
      {rows && rows.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${muted(0.08)}` }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {r.avatar_url ? <img src={r.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.5) }}>{r.name.charAt(0).toUpperCase()}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
          <button type="button" onClick={() => unblock(r.id)} disabled={busy === r.id}
            style={{ background: 'transparent', color: 'var(--t-fg)', border: `1px solid ${muted(0.2)}`, borderRadius: 16, padding: '6px 14px', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: busy === r.id ? 0.6 : 1 }}>
            {busy === r.id ? '…' : 'Unblock'}
          </button>
        </div>
      ))}
    </div>
  )
}

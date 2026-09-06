'use client'
// Admin — notification history (migration 105).
//
// Exists because a push that the OS declines to display is otherwise GONE.
// 2026-09-05: Teddy's iPhone renders pushes; his Windows Chrome accepts them and
// shows nothing. This page is the copy that does not depend on the device.
//
// ⚠️ "Sent to N devices" means the push service ACCEPTED it (HTTP 201). It does
// NOT mean anyone saw it, and this page must never imply otherwise — that
// conflation is the whole reason this page had to be built.

import { useEffect, useState } from 'react'

interface Notification {
  id: string; title: string; body: string; url: string | null; tag: string | null
  subscriptions: number; accepted: number; read_at: string | null; created_at: string
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

// ALWAYS render studio time through Intl with an explicit timeZone. The server
// runs UTC; offset arithmetic here lands 5 hours out and, late in the evening,
// on the wrong DAY.
function when(iso: string) {
  const d = new Date(iso)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(d)
  if (day === today) return `Today ${time}`
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }).format(d)
  return `${date} ${time}`
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const r = await fetch('/api/admin/notifications', { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json()
    // Read the error. A failed load rendered as an empty list reads as "nothing
    // ever happened", which is the exact failure this page exists to prevent.
    if (!r.ok) { setErr(d?.error || 'Could not load notifications'); setLoading(false); return }
    setItems(d.notifications ?? []); setUnread(d.unread ?? 0); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const markRead = async (id?: string) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/notifications', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : { allRead: true }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d?.error || 'Could not mark as read'); return }
    load()
  }

  const sendTest = async () => {
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/push/test', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!d?.ok) { setErr(d?.reason || 'Test push failed'); return }
    // Say what was ACCEPTED, and say plainly that accepted is not seen.
    setErr(`Test sent to ${d.accepted}/${d.subscriptions} device(s) at ${d.sentAt}. If nothing appeared, the device suppressed it — the history below is the record.`)
    load()
  }

  if (unauth) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Admin sign-in required.</main>

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 24, margin: 0, letterSpacing: 0.5 }}>
            NOTIFICATIONS {unread > 0 && <span style={{ color: C.accent, fontSize: 16 }}>· {unread} unread</span>}
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={sendTest} disabled={busy}
              style={{ background: 'transparent', color: C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: '8px 12px', cursor: busy ? 'default' : 'pointer' }}>
              Send test
            </button>
            <button onClick={() => markRead()} disabled={busy || unread === 0}
              style={{ background: 'transparent', color: unread === 0 ? C.dim : C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: '8px 12px', cursor: busy || unread === 0 ? 'default' : 'pointer' }}>
              Mark all read
            </button>
          </div>
        </div>

        <p style={{ color: C.dim, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          Every alert the studio sent, whether or not your device displayed it.
          &ldquo;Sent to N devices&rdquo; means the push service accepted it — not that it appeared on a screen.
        </p>

        {err && <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>{err}</div>}

        {loading && <p style={{ color: C.dim, marginTop: 24 }}>Loading…</p>}
        {!loading && items.length === 0 && (
          <p style={{ color: C.dim, marginTop: 24 }}>
            Nothing yet. History starts from when this shipped — earlier alerts were never recorded.
          </p>
        )}

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(n => (
            <div key={n.id} style={{
              background: C.card, border: `1px solid ${n.read_at ? C.line : C.accent}`, borderRadius: 10, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>{n.title}</strong>
                <span style={{ color: C.dim, fontSize: 12, whiteSpace: 'nowrap' }}>{when(n.created_at)}</span>
              </div>
              {n.body && <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.45 }}>{n.body}</div>}
              <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: C.dim }}>
                <span>
                  {n.subscriptions === 0
                    ? 'No devices registered — this one had nowhere to go'
                    : `Sent to ${n.accepted}/${n.subscriptions} device${n.subscriptions === 1 ? '' : 's'}`}
                </span>
                {n.url && <a href={n.url} style={{ color: C.accent, textDecoration: 'none' }}>Open →</a>}
                {!n.read_at && (
                  <button onClick={() => markRead(n.id)} disabled={busy}
                    style={{ background: 'transparent', color: C.dim, border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

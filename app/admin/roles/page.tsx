'use client'
import { useEffect, useState } from 'react'

interface Suggestion {
  id: string
  role: string
  suggested_email: string | null
  created_at: string
}
interface RoleRow { name: string; source: 'builtin' | 'custom'; hidden: boolean }

export default function AdminRolesPage() {
  const [items, setItems]   = useState<Suggestion[]>([])
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState<string | null>(null)
  const [unauth, setUnauth] = useState(false)

  // Role manager
  const [roles, setRoles]   = useState<RoleRow[]>([])
  const [newRole, setNewRole] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [rErr, setRErr]     = useState('')

  const loadSuggestions = () => {
    setLoad(true)
    fetch('/api/admin/role-suggestions')
      .then(async r => {
        if (r.status === 401) { setUnauth(true); setLoad(false); return }
        const d = await r.json().catch(() => ({}))
        setItems(d.suggestions ?? []); setLoad(false)
      })
      .catch(() => setLoad(false))
  }
  const loadRoles = () => {
    fetch('/api/admin/roles')
      .then(async r => { if (r.status === 401) { setUnauth(true); return } const d = await r.json().catch(() => ({})); setRoles(d.roles ?? []) })
      .catch(() => {})
  }
  useEffect(() => { loadSuggestions(); loadRoles() }, [])

  const resolve = async (id: string, action: 'approve' | 'dismiss') => {
    setBusy(id)
    await fetch('/api/admin/role-suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setItems(list => list.filter(s => s.id !== id))
    setBusy(null)
    loadRoles() // an approved suggestion becomes a managed role
  }

  const roleAction = async (role: string, action: 'add' | 'remove' | 'restore') => {
    setRErr('')
    if (action === 'add') setAddBusy(true); else setBusy(role)
    const r = await fetch('/api/admin/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, action }),
    })
    const d = await r.json().catch(() => ({}))
    setAddBusy(false); setBusy(null)
    if (!r.ok) { setRErr(d.error || 'Something went wrong.'); return }
    if (action === 'add') setNewRole('')
    loadRoles()
  }

  const wrap: React.CSSProperties = { background: '#080808', minHeight: '100vh', color: '#fff', padding: '48px 24px', fontFamily: 'Inter, sans-serif' }
  const inner: React.CSSProperties = { maxWidth: 720, margin: '0 auto' }
  const pill = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', borderRadius: 4, padding: '2px 6px', ...extra })

  if (unauth) return (
    <div style={wrap}><div style={inner}>
      <p style={{ color: 'rgba(255,255,255,0.6)' }}>Please sign in to the <a href="/admin" style={{ color: '#e6c07a' }}>admin dashboard</a> first, then reload this page.</p>
    </div></div>
  )

  const active = roles.filter(r => !r.hidden)
  const hidden = roles.filter(r => r.hidden)

  return (
    <div style={wrap}><div style={inner}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '0 0 6px' }}>ROLES</h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 28px' }}>
        Manage the creative roles shown across signup, profiles, and the directory. Add your own, or remove any you don&apos;t want — including the built-in ones.
      </p>

      {/* ── Manage roles ─────────────────────────────────────────── */}
      <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Add a role</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={newRole} onChange={e => setNewRole(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newRole.trim()) roleAction(newRole.trim(), 'add') }}
            placeholder="e.g. Drone Operator"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontFamily: 'Inter', fontSize: 14, padding: '10px 12px', borderRadius: 6, outline: 'none' }} />
          <button onClick={() => newRole.trim() && roleAction(newRole.trim(), 'add')} disabled={addBusy || !newRole.trim()}
            style={{ background: '#fff', color: '#080808', border: 'none', borderRadius: 6, padding: '10px 20px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', opacity: addBusy || !newRole.trim() ? 0.5 : 1 }}>
            {addBusy ? 'ADDING…' : '+ ADD'}
          </button>
        </div>
        {rErr && <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 10 }}>{rErr}</div>}

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '22px 0 10px' }}>
          Active roles ({active.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {active.map(r => (
            <span key={r.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '6px 8px 6px 13px', fontSize: 13 }}>
              {r.name}
              {r.source === 'custom' && <span style={pill({ color: '#8ab4f8', border: '1px solid rgba(138,180,248,0.4)' })}>CUSTOM</span>}
              <button onClick={() => roleAction(r.name, 'remove')} disabled={busy === r.name}
                title="Remove / hide this role"
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>

        {hidden.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '22px 0 10px' }}>
              Hidden ({hidden.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {hidden.map(r => (
                <span key={r.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: 20, padding: '6px 12px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                  {r.name}
                  <button onClick={() => roleAction(r.name, 'restore')} disabled={busy === r.name}
                    style={{ background: 'transparent', border: 'none', color: '#5dca8f', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: 0 }}>RESTORE</button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Member suggestions ───────────────────────────────────── */}
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.02em', margin: '0 0 6px' }}>SUGGESTIONS</div>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 16px' }}>
        Custom roles members typed in. <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Approve</strong> to add it as a standard option everywhere, or <strong style={{ color: 'rgba(255,255,255,0.7)' }}>dismiss</strong>. (The member keeps it on their own profile either way.)
      </p>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.35)' }}>No pending role suggestions.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(s => (
            <div key={s.id} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{s.role}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  {s.suggested_email || 'unknown'} · {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => resolve(s.id, 'approve')} disabled={busy === s.id}
                  style={{ background: '#5dca8f', color: '#080808', border: 'none', borderRadius: 4, padding: '9px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', opacity: busy === s.id ? 0.5 : 1 }}>
                  APPROVE
                </button>
                <button onClick={() => resolve(s.id, 'dismiss')} disabled={busy === s.id}
                  style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '9px 16px', fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer' }}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div></div>
  )
}

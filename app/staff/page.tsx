'use client'

import { useEffect, useState, useCallback } from 'react'
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/lib/staff-permissions'
import TerminalPairing from './TerminalPairing'

type Me = {
  staff: { id: string; name: string; role: StaffRole } | null
  permissions?: Record<string, boolean>
  needsBootstrap?: boolean
}
type Employee = {
  id: string; name: string; email: string; role: StaffRole
  is_active: boolean; created_at: string; last_login_at: string | null
}
type AuditEntry = {
  id: number; staff_name: string; action: string
  entity_type: string | null; entity_id: string | null
  amount_cents: number | null; details: any; created_at: string
}

const C = {
  bg: '#0f0f10', card: '#1a1a1c', line: '#2a2a2e', text: '#f4f4f5',
  dim: '#a1a1aa', accent: '#ef6354', good: '#22c55e', input: '#232327',
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function StaffConsole() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    const r = await fetch('/api/staff/me', { cache: 'no-store' })
    setMe(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { refreshMe() }, [refreshMe])

  if (loading) return <Shell><p style={{ color: C.dim }}>Loading…</p></Shell>
  if (me?.needsBootstrap) return <Shell><Bootstrap onDone={refreshMe} /></Shell>
  if (!me?.staff) return <Shell><Login onDone={refreshMe} /></Shell>

  return <Console me={me} onSignedOut={refreshMe} />
}

// ── Layout shell ───────────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter Tight, system-ui, sans-serif', display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 960 }}>{children}</div>
    </div>
  )
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
      <input {...rest} style={{ width: '100%', padding: '10px 12px', background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, fontSize: 15, boxSizing: 'border-box' }} />
    </label>
  )
}

const btn = (primary = true): React.CSSProperties => ({
  padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: primary ? C.accent : 'transparent', color: primary ? '#fff' : C.dim,
  fontWeight: 600, fontSize: 14, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '.04em',
  ...(primary ? {} : { border: `1px solid ${C.line}` }),
})

// ── First-run owner setup ──────────────────────────────────────────────────────
function Bootstrap({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ adminPassword: '', name: '', email: '', password: '', pin: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setErr('')
    const r = await fetch('/api/staff/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setErr(d.error ?? 'Setup failed.')
    onDone()
  }
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28, maxWidth: 440, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Anton, sans-serif', fontSize: 26, margin: '0 0 4px' }}>FRONT DESK SETUP</h1>
      <p style={{ color: C.dim, fontSize: 14, marginTop: 0 }}>Create the first owner account. Authorize with the current admin password.</p>
      <Field label="Admin password" type="password" value={f.adminPassword} onChange={e => setF({ ...f, adminPassword: e.target.value })} />
      <Field label="Your name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <Field label="Email" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      <Field label="Password (8+ chars)" type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
      <Field label="Quick-unlock PIN (4–6 digits, optional)" inputMode="numeric" value={f.pin} onChange={e => setF({ ...f, pin: e.target.value })} />
      {err && <p style={{ color: C.accent, fontSize: 13 }}>{err}</p>}
      <button style={{ ...btn(), width: '100%', marginTop: 8 }} disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create owner account'}</button>
    </div>
  )
}

// ── Login ──────────────────────────────────────────────────────────────────────
function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setErr('')
    const r = await fetch('/api/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setErr(d.error ?? 'Login failed.')
    onDone()
  }
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 28, maxWidth: 400, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Anton, sans-serif', fontSize: 28, margin: '0 0 16px' }}>MADE KULTURE — FRONT DESK</h1>
      <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      <Field label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      {err && <p style={{ color: C.accent, fontSize: 13 }}>{err}</p>}
      <button style={{ ...btn(), width: '100%', marginTop: 8 }} disabled={busy} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </div>
  )
}

// ── Signed-in console ────────────────────────────────────────────────────────────
function Console({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  const staff = me.staff!
  const isOwner = !!me.permissions?.['staff.manage']
  const signOut = async () => { await fetch('/api/staff/logout', { method: 'POST' }); onSignedOut() }

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 24 }}>MADE KULTURE — FRONT DESK</div>
          <div style={{ color: C.dim, fontSize: 14 }}>{staff.name} · <span style={{ color: C.accent }}>{ROLE_LABELS[staff.role]}</span></div>
        </div>
        <button style={btn(false)} onClick={signOut}>Lock</button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <p style={{ margin: 0, color: C.dim, fontSize: 14 }}>
          The full front-desk workflow lives at <a href="/desk" style={{ color: C.accent }}>/desk</a> — search, check-in, and card charges. This console manages staff and settings.
        </p>
        {me.permissions?.['admin.access'] && <p style={{ margin: '10px 0 0', fontSize: 14 }}><a href="/admin/dashboard" style={{ color: C.accent }}>Admin Dashboard →</a></p>}
      </div>

      {isOwner && <StaffManager />}
      {isOwner && <TerminalPairing />}
      {isOwner && <AuditLog />}
    </Shell>
  )
}

// ── Owner: staff manager ─────────────────────────────────────────────────────────
function StaffManager() {
  const [list, setList] = useState<Employee[]>([])
  const [adding, setAdding] = useState(false)
  const [nf, setNf] = useState({ name: '', email: '', role: 'front_desk' as StaffRole, password: '', pin: '' })
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/staff', { cache: 'no-store' })
    if (r.ok) setList((await r.json()).staff)
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    setErr('')
    const r = await fetch('/api/admin/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nf) })
    const d = await r.json()
    if (!r.ok) return setErr(d.error ?? 'Could not add employee.')
    setNf({ name: '', email: '', role: 'front_desk', password: '', pin: '' }); setAdding(false); load()
  }
  const patch = async (id: string, body: any) => {
    await fetch(`/api/admin/staff/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    load()
  }
  const deactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}? They won’t be able to sign in.`)) return
    await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' }); load()
  }
  const resetPw = async (id: string, name: string) => {
    const pw = prompt(`New password for ${name} (8+ chars):`); if (!pw) return
    const r = await fetch(`/api/admin/staff/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
    if (!r.ok) alert((await r.json()).error ?? 'Failed.'); else alert('Password updated.')
  }
  const setPin = async (id: string, name: string) => {
    const pin = prompt(`Quick-unlock PIN for ${name} (4–6 digits; blank to clear):`)
    if (pin === null) return
    const r = await fetch(`/api/admin/staff/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pin === '' ? null : pin }) })
    if (!r.ok) alert((await r.json()).error ?? 'Failed.'); else alert(pin === '' ? 'PIN cleared.' : 'PIN set.')
  }
  const editInfo = async (emp: Employee) => {
    const name = prompt('Name:', emp.name); if (name === null) return
    const email = prompt('Email:', emp.email); if (email === null) return
    const r = await fetch(`/api/admin/staff/${emp.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email }) })
    if (!r.ok) { alert((await r.json()).error ?? 'Failed.'); return }
    load()
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, margin: 0 }}>STAFF</h2>
        <button style={btn()} onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ Add employee'}</button>
      </div>

      {adding && (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Name" value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} />
            <Field label="Email" type="email" value={nf.email} onChange={e => setNf({ ...nf, email: e.target.value })} />
            <Field label="Password (8+ chars)" type="password" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} />
            <Field label="PIN (4–6 digits, optional)" inputMode="numeric" value={nf.pin} onChange={e => setNf({ ...nf, pin: e.target.value })} />
          </div>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>Role</span>
            <select value={nf.role} onChange={e => setNf({ ...nf, role: e.target.value as StaffRole })} style={{ width: '100%', padding: '10px 12px', background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, fontSize: 15 }}>
              {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </label>
          {err && <p style={{ color: C.accent, fontSize: 13 }}>{err}</p>}
          <button style={btn()} onClick={create}>Create employee</button>
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {list.length === 0 && <p style={{ color: C.dim, padding: 18, margin: 0 }}>No employees yet.</p>}
        {list.map(emp => (
          <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: `1px solid ${C.line}`, opacity: emp.is_active ? 1 : 0.5, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontWeight: 600 }}>{emp.name} {!emp.is_active && <span style={{ color: C.dim, fontSize: 12 }}>(inactive)</span>}</div>
              <div style={{ color: C.dim, fontSize: 13 }}>{emp.email} · last in {fmtDate(emp.last_login_at)}</div>
            </div>
            <select value={emp.role} onChange={e => patch(emp.id, { role: e.target.value })} style={{ padding: '6px 8px', background: C.input, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, fontSize: 13 }}>
              {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <button style={{ ...btn(false), padding: '6px 10px' }} onClick={() => editInfo(emp)}>Edit</button>
            <button style={{ ...btn(false), padding: '6px 10px' }} onClick={() => resetPw(emp.id, emp.name)}>Reset PW</button>
            <button style={{ ...btn(false), padding: '6px 10px' }} onClick={() => setPin(emp.id, emp.name)}>Set PIN</button>
            {emp.is_active
              ? <button style={{ ...btn(false), padding: '6px 10px', color: C.accent, borderColor: C.accent }} onClick={() => deactivate(emp.id, emp.name)}>Deactivate</button>
              : <button style={{ ...btn(false), padding: '6px 10px', color: C.good, borderColor: C.good }} onClick={() => patch(emp.id, { is_active: true })}>Reactivate</button>}
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Owner: audit log ─────────────────────────────────────────────────────────────
function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  useEffect(() => {
    fetch('/api/admin/audit', { cache: 'no-store' }).then(r => r.ok && r.json()).then(d => d && setEntries(d.entries))
  }, [])
  return (
    <section>
      <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, margin: '0 0 12px' }}>AUDIT LOG</h2>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
        {entries.length === 0 && <p style={{ color: C.dim, padding: 18, margin: 0 }}>No activity yet.</p>}
        {entries.map(e => (
          <div key={e.id} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderTop: `1px solid ${C.line}`, fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: C.dim, minWidth: 120 }}>{fmtDate(e.created_at)}</span>
            <span style={{ minWidth: 130, fontWeight: 600 }}>{e.staff_name}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: C.accent }}>{e.action}</span>
            <span style={{ color: C.dim }}>
              {e.entity_type ? `${e.entity_type}${e.entity_id ? ` ${e.entity_id.slice(0, 8)}` : ''}` : ''}
              {e.amount_cents != null ? ` · $${(e.amount_cents / 100).toFixed(2)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

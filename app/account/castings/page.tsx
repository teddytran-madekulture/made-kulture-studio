'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CREATIVE_ROLES } from '@/lib/roles'

type Casting = {
  id: string
  title: string
  compensation_type: 'paid' | 'unpaid' | 'tfp'
  roles_needed: string[]
  shoot_date: string | null
  estimated_cost: number | null
  status: string
  created_at: string
  author: { id: string; name: string; avatar_url: string | null }
  counts: { interested: number; confirmed: number }
  has_unread_team?: boolean
  expires_at?: string | null
}

const COMP_LABEL: Record<string, string> = { paid: 'Paid', unpaid: 'Unpaid', tfp: 'TFP' }
const COMP_COLOR: Record<string, { bg: string; fg: string }> = {
  paid: { bg: 'rgba(60,255,120,0.12)', fg: '#6bffaa' },
  tfp: { bg: 'rgba(230,192,122,0.15)', fg: '#e6c07a' },
  unpaid: { bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.6)' },
}

export default function CastingsPage() {
  const [items, setItems] = useState<Casting[]>([])
  const [loading, setLoading] = useState(true)
  const [optedOut, setOptedOut] = useState(false)
  const [comp, setComp] = useState('')
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [mine, setMine] = useState(false)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])

  useEffect(() => {
    fetch('/api/roles').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (comp) p.set('comp', comp)
    if (role) p.set('role', role)
    if (q.trim()) p.set('q', q.trim())
    if (mine) p.set('mine', '1')
    fetch('/api/castings?' + p.toString())
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (r.status === 403 && d.optedOut) { setOptedOut(true); setItems([]) }
        else { setOptedOut(false); setItems(d.castings ?? []) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [comp, role, q, mine])

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{
      background: active ? '#fff' : 'transparent', color: active ? '#080808' : 'rgba(255,255,255,0.7)',
      border: active ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)', borderRadius: 20,
      padding: '6px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
  const input: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '9px 12px', fontFamily: 'Inter', fontSize: 13, color: '#fff', outline: 'none' }

  if (optedOut) return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 8px' }}>CASTINGS</h1>
      <div style={{ background: '#141414', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 8, padding: '24px', maxWidth: 520, marginTop: 16 }}>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 16px' }}>
          The casting board is members-only. Turn on directory visibility in your{' '}
          <a href="/account/profile" style={{ color: '#e6c07a' }}>profile</a> to browse and post castings.
        </p>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>CASTINGS</h1>
        <Link href="/account/castings/new" style={{ background: '#fff', color: '#080808', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '10px 18px', borderRadius: 6 }}>+ Post a casting</Link>
      </div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: '0 0 20px' }}>
        Projects members want to shoot at the studio. Find one to join, or post your own.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {chip('All', comp === '' && !mine, () => { setComp(''); setMine(false) })}
        {chip('Paid', comp === 'paid', () => setComp(comp === 'paid' ? '' : 'paid'))}
        {chip('Unpaid', comp === 'unpaid', () => setComp(comp === 'unpaid' ? '' : 'unpaid'))}
        {chip('TFP', comp === 'tfp', () => setComp(comp === 'tfp' ? '' : 'tfp'))}
        {chip('My castings', mine, () => setMine(!mine))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search castings…" style={{ ...input, flex: 1, minWidth: 180 }} />
        <select value={role} onChange={e => setRole(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
          <option value="">Any role</option>
          {roleOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>
          {mine ? "You haven't posted any castings yet." : 'No castings match. Be the first to post one.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(c => {
            const cc = COMP_COLOR[c.compensation_type]
            return (
              <Link key={c.id} href={`/account/castings/${c.id}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {c.has_unread_team && <span title="New team messages" style={{ width: 8, height: 8, borderRadius: '50%', background: '#e6c07a', flexShrink: 0 }} />}
                    <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: '#fff' }}>{c.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {c.expires_at && new Date(c.expires_at) < new Date() && <span style={{ background: 'rgba(255,120,120,0.12)', color: '#ff9b9b', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 }}>EXPIRED</span>}
                    <span style={{ background: cc.bg, color: cc.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 }}>{COMP_LABEL[c.compensation_type]}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', background: '#1f1f1f', flexShrink: 0 }}>
                    {c.author.avatar_url && <img src={c.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{c.author.name}</span>
                  {c.shoot_date && <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>· {new Date(c.shoot_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  {c.estimated_cost != null && c.estimated_cost > 0 && <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>· est. ${c.estimated_cost}</span>}
                </div>
                {c.roles_needed.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {c.roles_needed.map(r => (
                      <span key={r} style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 7px' }}>{r}</span>
                    ))}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

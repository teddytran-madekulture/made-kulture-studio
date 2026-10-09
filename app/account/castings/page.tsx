'use client'
import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/track'
import Link from 'next/link'
import { CREATIVE_ROLES } from '@/lib/roles'
import FinishProfileCard from '@/components/FinishProfileCard'
import ShootsTabs from '@/components/ShootsTabs'

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
  mature?: boolean
}

const COMP_LABEL: Record<string, string> = { paid: 'Paid', unpaid: 'Unpaid', tfp: 'TFP' }
const COMP_COLOR: Record<string, { bg: string; fg: string }> = {
  paid: { bg: 'rgba(60,255,120,0.12)', fg: 'var(--t-ok)' },
  tfp: { bg: 'rgba(var(--t-gold-rgb), 0.15)', fg: 'var(--t-gold)' },
  unpaid: { bg: 'rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', fg: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' },
}

export default function CastingsPage() {
  const [items, setItems] = useState<Casting[]>([])
  const [loading, setLoading] = useState(true)
  const [optedOut, setOptedOut] = useState(false)
  const [incomplete, setIncomplete] = useState<string[] | null>(null)
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
        if (r.status === 403 && d.incomplete) { setIncomplete(d.blockers ?? []); setItems([]) }
        else if (r.status === 403 && d.optedOut) { setOptedOut(true); setItems([]) }
        else { setOptedOut(false); setIncomplete(null); setItems(d.castings ?? []) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [comp, role, q, mine])

  // Analytics: casting searches + filters, logged once they settle for 1.2s
  // (the list refetches per keystroke; the log must not).
  const lastCastingQ = useRef('')
  useEffect(() => {
    if (loading || mine) return
    const qq = q.trim().toLowerCase()
    if (qq.length < 2 && !comp && !role) return
    const key = `${qq}|${comp}|${role}`
    const t = setTimeout(() => {
      if (key === lastCastingQ.current) return
      lastCastingQ.current = key
      track('search', { query: qq || undefined, meta: { kind: 'casting', comp, role, results: items.length } })
    }, 1200)
    return () => clearTimeout(t)
  }, [q, comp, role, mine, loading, items.length])

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{
      background: active ? 'var(--t-fg)' : 'transparent', color: active ? 'var(--t-on-fg)' : 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))',
      border: active ? '1px solid var(--t-fg)' : '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 20,
      padding: '6px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
  const input: React.CSSProperties = { background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', borderRadius: 6, padding: '9px 12px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-fg)', outline: 'none' }

  if (incomplete) return (
    <div>
      <ShootsTabs />
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 24px' }}>CASTINGS</h1>
      <FinishProfileCard blockers={incomplete} what="The casting board" />
    </div>
  )

  if (optedOut) return (
    <div>
      <ShootsTabs />
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 8px' }}>CASTINGS</h1>
      <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 8, padding: '24px', maxWidth: 520, marginTop: 16 }}>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', lineHeight: 1.6, margin: '0 0 16px' }}>
          The casting board is members-only. Turn on directory visibility in your{' '}
          <a href="/account/profile" style={{ color: 'var(--t-gold)' }}>profile</a> to browse and post castings.
        </p>
      </div>
    </div>
  )

  return (
    <div>
      <ShootsTabs />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>CASTINGS</h1>
        <Link href="/account/castings/new" style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '10px 18px', borderRadius: 6 }}>+ Post a casting</Link>
      </div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', margin: '0 0 20px' }}>
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
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>
          {mine ? "You haven't posted any castings yet." : 'No castings match. Be the first to post one.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(c => {
            const cc = COMP_COLOR[c.compensation_type]
            return (
              <Link key={c.id} href={`/account/castings/${c.id}`}
                style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {c.has_unread_team && <span title="New team messages" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--t-gold)', flexShrink: 0 }} />}
                    <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: 'var(--t-fg)' }}>{c.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {c.expires_at && new Date(c.expires_at) < new Date() && <span style={{ background: 'rgba(255,120,120,0.12)', color: 'var(--t-err)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 }}>EXPIRED</span>}
                    {c.mature && <span style={{ background: 'rgba(var(--t-gold-rgb), 0.15)', color: 'var(--t-gold)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 }}>18+</span>}
                    <span style={{ background: cc.bg, color: cc.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 }}>{COMP_LABEL[c.compensation_type]}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', flexShrink: 0 }}>
                    {c.author.avatar_url && <img src={c.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' }}>{c.author.name}</span>
                  {c.shoot_date && <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>· {new Date(c.shoot_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  {c.estimated_cost != null && c.estimated_cost > 0 && <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>· est. ${c.estimated_cost}</span>}
                </div>
                {c.roles_needed.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {c.roles_needed.map(r => (
                      <span key={r} style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', borderRadius: 4, padding: '3px 7px' }}>{r}</span>
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

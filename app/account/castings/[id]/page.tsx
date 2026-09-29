'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { estimatePlan, type Rates } from '@/lib/estimate'
import CastingTeamChannel from '@/components/CastingTeamChannel'
import MoodBoard from '@/components/MoodBoard'

type Participant = { id: string; status: string; role: string | null; name: string; avatar_url: string | null; roles: string[] }
type Casting = {
  id: string; title: string; description: string | null
  compensation_type: 'paid' | 'unpaid' | 'tfp'; roles_needed: string[]
  plan_mode: 'none' | 'set' | 'buyout'; set_slug: string | null; hours: number | null; guests: number | null
  equipment: { id: string; name: string; rate: number; quantity: number }[]
  shoot_date: string | null; start_hour: number | null; estimated_cost: number | null; status: string
  mood_board?: { url: string; mature?: boolean }[]; expires_at?: string | null; mature?: boolean
  author: { id: string; name: string; avatar_url: string | null }
}

const COMP: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: 'Paid', bg: 'rgba(60,255,120,0.12)', fg: 'var(--t-ok)' },
  tfp: { label: 'TFP', bg: 'rgba(var(--t-gold-rgb), 0.15)', fg: 'var(--t-gold)' },
  unpaid: { label: 'Unpaid', bg: 'rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', fg: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' },
}

export default function CastingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [casting, setCasting] = useState<Casting | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [isAuthor, setIsAuthor] = useState(false)
  const [myStatus, setMyStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rates, setRates] = useState<Rates | null>(null)
  const [roleChoice, setRoleChoice] = useState<Record<string, string>>({}) // per-interested-person role picker

  const load = () => fetch(`/api/castings/${id}`).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load.'); setLoading(false); return }
    setCasting(d.casting); setParticipants(d.participants ?? []); setIsAuthor(d.isAuthor); setMyStatus(d.myStatus); setLoading(false)
  }).catch(() => { setError('Could not load.'); setLoading(false) })

  useEffect(() => {
    load()
    fetch('/api/sets').then(r => r.json()).then(d => setRates({
      sets: (d.sets ?? []).map((s: { slug: string; name: string; rate_per_hour: number; capacity?: number; min_hours?: number }) => ({ slug: s.slug, name: s.name, rate_per_hour: Number(s.rate_per_hour), capacity: s.capacity, min_hours: s.min_hours })),
      buyoutRate: Number(d.buyoutRate) || 400,
      guestPricing: { capacityPerSet: d.guestPricing?.capacityPerSet ?? 5, perPersonFee: d.guestPricing?.perPersonFee ?? 10 },
    })).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const estimate = useMemo(() => {
    if (!casting || !rates || casting.plan_mode === 'none') return null
    return estimatePlan({ mode: casting.plan_mode, setSlug: casting.set_slug, hours: casting.hours, guests: casting.guests, equipment: casting.equipment }, rates)
  }, [casting, rates])

  const confirmed = participants.filter(p => p.status === 'confirmed')
  const interested = participants.filter(p => p.status === 'interested')
  const total = estimate?.total ?? casting?.estimated_cost ?? 0
  const expired = !!casting?.expires_at && new Date(casting.expires_at).getTime() < Date.now()
  const active = casting?.status === 'open' && !expired

  const interestClick = async () => {
    setBusy(true)
    const res = await fetch(`/api/castings/${id}/interest`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && d.conversationId) router.push(`/account/messages/${d.conversationId}`)
    else { setMyStatus('interested'); load() }
  }
  const messageAuthor = async () => {
    if (!casting) return
    setBusy(true)
    const res = await fetch('/api/messages/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toUserId: casting.author.id }) })
    const d = await res.json().catch(() => ({})); setBusy(false)
    if (res.ok && d.conversationId) router.push(`/account/messages/${d.conversationId}`)
  }
  const setParticipant = async (userId: string, action: string, role?: string) => {
    setBusy(true)
    await fetch(`/api/castings/${id}/participants`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, action, role }) })
    setBusy(false); load()
  }
  const setStatus = async (status: string) => {
    setBusy(true)
    await fetch(`/api/castings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setBusy(false); load()
  }
  const del = async () => {
    if (!window.confirm('Delete this casting?')) return
    setBusy(true)
    const res = await fetch(`/api/castings/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/account/castings'); else setBusy(false)
  }
  const renew = async () => {
    setBusy(true)
    await fetch(`/api/castings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renew: true }) })
    setBusy(false); load()
  }

  const bookHref = (() => {
    if (!casting || casting.plan_mode === 'none') return null
    const p = new URLSearchParams()
    if (casting.plan_mode === 'set') { p.set('type', 'set'); if (casting.set_slug) p.set('set', casting.set_slug) }
    else p.set('type', 'studio')
    if (casting.shoot_date) p.set('date', casting.shoot_date)
    if (casting.start_hour != null) p.set('start', String(casting.start_hour))
    return '/book?' + p.toString()
  })()

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', paddingTop: 20 }}>Loading…</div>
  if (error || !casting) return (
    <div style={{ paddingTop: 20 }}>
      <Link href="/account/castings" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'none' }}>← Castings</Link>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', paddingTop: 20 }}>{error || 'Not found.'}</div>
    </div>
  )

  const cc = COMP[casting.compensation_type]
  const pill = (p: Participant, actions: React.ReactNode) => (
    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', borderRadius: 8, padding: '10px 12px' }}>
      <Link href={`/account/directory/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', flexShrink: 0 }}>
          {p.avatar_url && <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'var(--t-fg)' }}>{p.name}</div>
          {p.roles.length > 0 && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.roles.join(' · ')}</div>}
        </div>
      </Link>
      {p.role && <span style={{ background: 'rgba(var(--t-gold-rgb), 0.15)', color: 'var(--t-gold)', fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>{p.role}</span>}
      {actions}
    </div>
  )
  const selectStyle: React.CSSProperties = { background: 'var(--t-surface-lo)', color: 'var(--t-fg)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 4, padding: '5px 7px', fontFamily: 'Inter', fontSize: 11, cursor: 'pointer', flexShrink: 0 }
  const smallBtn = (txt: string, onClick: () => void, danger = false): React.ReactNode => (
    <button type="button" disabled={busy} onClick={onClick} style={{ background: 'transparent', border: `1px solid ${danger ? 'rgba(255,80,80,0.4)' : 'rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))'}`, color: danger ? 'var(--t-err)' : 'rgba(var(--t-fg-rgb), calc(0.8 * var(--t-a)))', borderRadius: 4, padding: '5px 9px', fontFamily: 'Inter', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>{txt}</button>
  )

  return (
    <div style={{ maxWidth: 620 }}>
      <Link href="/account/castings" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'none' }}>← Castings</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, margin: '14px 0 6px' }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, margin: 0, lineHeight: 1.1 }}>{casting.title}</h1>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {casting.mature && <span style={{ background: 'rgba(var(--t-gold-rgb), 0.15)', color: 'var(--t-gold)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 4 }}>18+</span>}
          <span style={{ background: cc.bg, color: cc.fg, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 4 }}>{cc.label}</span>
        </div>
      </div>
      {(casting.status === 'closed' || expired) && (
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--t-err)', marginBottom: 8 }}>
          {expired ? 'This casting has expired — renew it to put it back on the board.' : 'This casting is closed.'}
        </div>
      )}

      <Link href={`/account/directory/${casting.author.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit', marginBottom: 14 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)' }}>
          {casting.author.avatar_url && <img src={casting.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' }}>{casting.author.name}{isAuthor ? ' (you)' : ''}</span>
      </Link>

      {casting.description && <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.75 * var(--t-a)))', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '0 0 16px' }}>{casting.description}</p>}

      <MoodBoard castingId={id} canEdit={isAuthor} initial={casting.mood_board ?? []} castingMature={!!casting.mature} />


      {casting.roles_needed.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', marginBottom: 8 }}>ROLES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {casting.roles_needed.map(r => {
              const fillers = confirmed.filter(p => p.role === r)
              const filled = fillers.length > 0
              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter', fontSize: 12 }}>
                  <span style={{ color: filled ? 'var(--t-ok)' : 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', fontSize: 13, width: 14, flexShrink: 0 }}>{filled ? '✓' : '○'}</span>
                  <span style={{ color: filled ? 'var(--t-fg)' : 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))', fontWeight: 600, flexShrink: 0 }}>{r}</span>
                  <span style={{ color: filled ? 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' : 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {filled ? `— ${fillers.map(f => f.name).join(', ')}` : '— open'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Not the author — interest / message */}
      {!isAuthor && active && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {myStatus == null
            ? <button onClick={interestClick} disabled={busy} style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 6, padding: '11px 20px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>I&apos;m interested</button>
            : <>
                <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-ok)', alignSelf: 'center' }}>✓ You&apos;re {myStatus === 'confirmed' ? 'confirmed' : 'interested'}</span>
                <button onClick={messageAuthor} disabled={busy} style={{ background: 'transparent', color: 'var(--t-fg)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.25 * var(--t-a)))', borderRadius: 6, padding: '11px 20px', fontFamily: 'Inter', fontSize: 13, cursor: 'pointer' }}>Message {casting.author.name.split(' ')[0]}</button>
              </>}
        </div>
      )}

      {/* Estimate */}
      {estimate && estimate.total > 0 && (
        <div style={{ background: 'rgba(var(--t-gold-rgb), 0.06)', border: '1px solid rgba(var(--t-gold-rgb), 0.25)', borderRadius: 8, padding: '14px 16px', marginBottom: 18 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'var(--t-gold)', marginBottom: 8 }}>
            ESTIMATED STUDIO COST{casting.shoot_date ? ` · ${new Date(casting.shoot_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
          </div>
          {estimate.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', marginBottom: 4 }}><span>{l.label}</span><span>${l.amount}</span></div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: 'var(--t-fg)', borderTop: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', paddingTop: 8, marginTop: 6 }}><span>Estimate</span><span>${total}</span></div>
          <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 8 }}>Estimate only. The organizer books &amp; pays the studio.</div>
        </div>
      )}

      {/* Author controls */}
      {isAuthor && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {bookHref && <Link href={bookHref} style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', textDecoration: 'none', borderRadius: 6, padding: '10px 16px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600 }}>Book this →</Link>}
          <Link href={`/account/castings/new?id=${id}`} style={{ background: 'transparent', border: '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', color: 'rgba(var(--t-fg-rgb), calc(0.8 * var(--t-a)))', borderRadius: 4, padding: '6px 12px', fontFamily: 'Inter', fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Edit</Link>
          {casting.status === 'open'
            ? smallBtn('Close casting', () => setStatus('closed'))
            : smallBtn('Reopen', () => setStatus('open'))}
          {expired && smallBtn('Renew (30 days)', renew)}
          {smallBtn('Delete', del, true)}
        </div>
      )}

      {/* Participants */}
      {(confirmed.length > 0 || interested.length > 0) && (
        <div style={{ marginTop: 6 }}>
          {confirmed.length > 0 && (
            <>
              <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', margin: '0 0 8px' }}>THE TEAM ({confirmed.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {confirmed.map(p => pill(p, isAuthor ? <>{smallBtn('Remove', () => setParticipant(p.id, 'unconfirm'))}</> : null))}
              </div>
            </>
          )}
          {interested.length > 0 && (
            <>
              <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', margin: '0 0 8px' }}>INTERESTED ({interested.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {interested.map(p => pill(p, isAuthor ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {casting.roles_needed.length > 0 && (
                      <select value={roleChoice[p.id] ?? ''} onChange={e => setRoleChoice(s => ({ ...s, [p.id]: e.target.value }))} style={selectStyle}>
                        <option value="">Role…</option>
                        {casting.roles_needed.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                    {smallBtn('Approve', () => setParticipant(p.id, 'confirm', roleChoice[p.id] || undefined))}
                    {smallBtn('✕', () => setParticipant(p.id, 'remove'), true)}
                  </div>
                ) : null))}
              </div>
            </>
          )}
        </div>
      )}

      {(isAuthor || myStatus === 'confirmed') && <CastingTeamChannel castingId={id} />}
    </div>
  )
}

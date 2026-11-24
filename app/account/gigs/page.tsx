'use client'
// /account/gigs — the Gigs board (migration 185). Paid work for the community,
// posted by Brand / Vendor accounts (approved by Teddy) or by the studio for an
// outside company. Members-only, like the rest of the directory.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CREATIVE_ROLES } from '@/lib/roles'
import FinishProfileCard from '@/components/FinishProfileCard'
import { gigDateLabel, GIG_STATUS_LABEL, GIG_SAFETY_LINE, type GigStatus } from '@/lib/gigs'

type Gig = {
  id: string; posted_by: 'member' | 'studio' | 'client'; company_name: string; title: string; roles_needed: string[]; pay: string
  gig_date: string | null; date_note: string | null; location: string | null; at_studio: boolean; apply_by: string | null
  status: GigStatus; created_at: string; applied?: boolean; applicants?: number; decline_reason?: string | null
  cover_url?: string | null
}

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`

export default function GigsPage() {
  const [items, setItems] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [optedOut, setOptedOut] = useState(false)
  // 2026-11-23: gigs on MY account that run through the private applicant page
  // (a company gig linked to this account, or one I posted via Hire a Creative).
  // Shown even when this account isn't listed in the directory.
  const [linked, setLinked] = useState<{ id: string; title: string; status: GigStatus; applicants: number; manage_url: string | null; expires_at: string | null }[]>([])
  useEffect(() => { fetch('/api/hire', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.gigs) setLinked(d.gigs) }).catch(() => {}) }, [])
  const [incomplete, setIncomplete] = useState<string[] | null>(null)
  const [canPost, setCanPost] = useState(false)
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [mine, setMine] = useState(false)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])

  useEffect(() => {
    fetch('/api/roles').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
    try { if (new URLSearchParams(window.location.search).get('mine') === '1') setMine(true) } catch {}
  }, [])

  useEffect(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (role) p.set('role', role)
    if (q.trim()) p.set('q', q.trim())
    if (mine) p.set('mine', '1')
    const t = setTimeout(() => {
      fetch('/api/gigs?' + p.toString(), { cache: 'no-store' }).then(async r => {
        const d = await r.json().catch(() => ({}))
        if (r.status === 403 && d.incomplete) { setIncomplete(d.blockers ?? []); setItems([]) }
        else if (r.status === 403 && d.optedOut) { setOptedOut(true); setItems([]) }
        else if (!r.ok) setErr(d.error || 'Could not load gigs.')   // never show a failed read as "no gigs"
        else { setErr(''); setOptedOut(false); setIncomplete(null); setItems(d.gigs ?? []); setCanPost(!!d.canPost) }
        setLoading(false)
      }).catch(() => { setErr('Could not load gigs.'); setLoading(false) })
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [role, q, mine])

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{
      background: active ? 'var(--t-fg)' : 'transparent', color: active ? 'var(--t-on-fg)' : muted(0.7),
      border: active ? '1px solid var(--t-fg)' : `1px solid ${muted(0.2)}`, borderRadius: 20,
      padding: '6px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
  const input: React.CSSProperties = { background: 'var(--t-surface)', border: `1px solid ${muted(0.12)}`, borderRadius: 6, padding: '9px 12px', fontFamily: 'Inter', fontSize: 16, color: 'var(--t-fg)', outline: 'none', colorScheme: 'dark' }
  const opt: React.CSSProperties = { background: 'var(--t-surface)', color: 'var(--t-fg)' }
  const H1 = <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>GIGS</h1>

  const mineBlock = linked.length > 0 && (
    <div style={{ margin: '16px 0 22px', maxWidth: 620 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: muted(0.45), marginBottom: 8 }}>YOUR LISTINGS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {linked.map(g => {
          const expired = g.status === 'live' && !!g.expires_at && new Date(g.expires_at) < new Date()
          return (
            <div key={g.id} style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 8, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, color: 'var(--t-fg)' }}>{g.title}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.5), marginTop: 3 }}>{expired ? 'Expired' : g.status === 'pending' ? 'In review' : GIG_STATUS_LABEL[g.status]} · {g.applicants} applicant{g.applicants === 1 ? '' : 's'}</div>
              </div>
              {g.manage_url && <a href={g.manage_url} style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: 'var(--t-on-fg)', background: 'var(--t-fg)', borderRadius: 6, padding: '9px 13px', textDecoration: 'none', whiteSpace: 'nowrap' }}>SEE APPLICANTS →</a>}
            </div>
          )
        })}
      </div>
    </div>
  )

  if (incomplete) return <div>{H1}{mineBlock}<div style={{ height: 20 }} /><FinishProfileCard blockers={incomplete} what="Gigs" /><div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.55), marginTop: 16, maxWidth: 520, lineHeight: 1.6 }}>Looking to hire someone instead? <Link href="/account/hire" style={{ color: 'var(--t-gold)' }}>Post what you need</Link>, no profile required.</div></div>
  if (optedOut) return (
    <div>{H1}{mineBlock}
      <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 8, padding: 24, maxWidth: 520, marginTop: 16 }}>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.6), lineHeight: 1.6, margin: 0 }}>
          Gigs are for directory members. Turn on directory visibility in your <a href="/account/profile" style={{ color: 'var(--t-gold)' }}>profile</a> to see paid work and get alerts.
        </p>
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.55), marginTop: 16, maxWidth: 520, lineHeight: 1.6 }}>Looking to hire someone instead? <Link href="/account/hire" style={{ color: 'var(--t-gold)' }}>Post what you need</Link>, no profile required.</div>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        {H1}
        {canPost && <Link href="/account/gigs/new" style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, textDecoration: 'none', padding: '10px 18px', borderRadius: 6 }}>+ Post a gig</Link>}
      </div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.4), margin: '0 0 6px' }}>
        Paid work from brands and companies, shared with the Made Kulture community. You get an alert when one matches your roles.
      </p>
      <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--t-gold)', margin: '0 0 20px' }}>{GIG_SAFETY_LINE}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {chip('All gigs', !mine, () => setMine(false))}
        {canPost && chip('My gigs', mine, () => setMine(true))}
      </div>
      {!mine && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search gigs…" style={{ ...input, flex: 1, minWidth: 180 }} />
          <select value={role} onChange={e => setRole(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            <option value="" style={opt}>Any role</option>
            {roleOptions.map(r => <option key={r} value={r} style={opt}>{r}</option>)}
          </select>
        </div>
      )}

      {err ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-err)' }}>{err}</div>
      ) : loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.4) }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.4), lineHeight: 1.6 }}>
          {mine ? "You haven't posted any gigs yet." : 'No open gigs right now. We’ll let you know when one matches your roles.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(g => {
            const when = [gigDateLabel(g.gig_date), g.date_note].filter(Boolean).join(' · ')
            return (
              <Link key={g.id} href={`/account/gigs/${g.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--t-surface)', border: `1px solid ${muted(0.08)}`, borderRadius: 8, padding: g.cover_url ? 0 : '16px 18px', overflow: 'hidden' }}>
                {g.cover_url && <img src={g.cover_url} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '16 / 7', objectFit: 'cover' }} />}
                <div style={{ padding: g.cover_url ? '14px 18px 16px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, color: 'var(--t-fg)' }}>{g.title}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.5), marginTop: 4 }}>
                      {g.company_name}{when ? ` · ${when}` : ''}{g.location ? ` · ${g.location}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {mine && g.status !== 'live' && <span style={{ background: muted(0.08), color: g.status === 'declined' || g.status === 'pulled' ? 'var(--t-err)' : muted(0.7), fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase' }}>{GIG_STATUS_LABEL[g.status]}</span>}
                    {g.applied && <span style={{ background: 'rgba(var(--t-gold-rgb), 0.15)', color: 'var(--t-gold)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 }}>APPLIED</span>}
                    <span style={{ background: 'rgba(60,255,120,0.12)', color: 'var(--t-ok)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>{g.pay}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
                  {g.roles_needed.map(r => <span key={r} style={{ fontFamily: 'Inter', fontSize: 10, color: muted(0.6), border: `1px solid ${muted(0.12)}`, borderRadius: 4, padding: '3px 7px' }}>{r}</span>)}
                  {g.at_studio && <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'var(--t-gold)', border: '1px solid rgba(var(--t-gold-rgb), 0.35)', borderRadius: 4, padding: '3px 7px' }}>AT MADE KULTURE</span>}
                  {mine && typeof g.applicants === 'number' && <span style={{ fontFamily: 'Inter', fontSize: 11, color: muted(0.5), marginLeft: 'auto' }}>{g.applicants} applicant{g.applicants === 1 ? '' : 's'}</span>}
                </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

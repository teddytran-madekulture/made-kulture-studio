'use client'
import { useEffect, useRef, useState } from 'react'
import { track, trackNow } from '@/lib/track'
import { HexCrest } from '@/components/FoundingBadge'
import { colorVars, colorByKey } from '@/lib/profile-colors'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type PortfolioImg = { id: string; url: string; is_mature: boolean }
type Member = {
  id: string
  full_name: string
  account_type?: string
  founding_number?: number | null
  profile_color?: string | null
  cover_url?: string | null
  roles: string[]
  instagram: string | null
  avatar_url: string | null
  bio: string
  links: { label: string; url: string }[]
  video_url: string | null
  email: string | null
  phone: string | null
  portfolio: PortfolioImg[]
  is_self: boolean
  followers: number
  following: number
  is_following: boolean
}

// Turn a YouTube/Vimeo watch URL into an embeddable one. Returns null if we
// can't recognise it (we then just show a plain link).

// Ensure a link has a protocol so href points outward (not to a relative path).
// e.g. "www.teddytran.com" -> "https://www.teddytran.com".
function withProtocol(url: string): string {
  const u = (url || '').trim()
  if (!u) return u
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('//')) return `https:${u}`
  return `https://${u}`
}

function embedUrl(url: string): string | null {
  try {
    const u = new URL(withProtocol(url))
    const host = u.hostname.replace('www.', '')
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
      if (u.pathname.startsWith('/embed/')) return url
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
  } catch { /* not a URL */ }
  return null
}

export default function MemberProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revealMature, setRevealMature] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [followBusy, setFollowBusy] = useState(false)
  const [myCastings, setMyCastings] = useState<{ id: string; title: string }[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitedIds, setInvitedIds] = useState<string[]>([])
  const [listOpen, setListOpen] = useState<null | 'followers' | 'following'>(null)
  const [listMembers, setListMembers] = useState<{ id: string; name: string; avatar_url: string | null; roles: string[] }[]>([])
  const [listLoading, setListLoading] = useState(false)

  const openList = (type: 'followers' | 'following') => {
    if (!member) return
    setListOpen(type); setListLoading(true); setListMembers([])
    fetch(`/api/follows/${member.id}?type=${type}`).then(r => (r.ok ? r.json() : null)).then(d => {
      setListMembers(d?.members ?? []); setListLoading(false)
    }).catch(() => setListLoading(false))
  }

  const invite = async (castingId: string) => {
    if (!member) return
    const res = await fetch(`/api/castings/${castingId}/invite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: member.id }),
    })
    if (res.ok) { setInvitedIds(prev => (prev.includes(castingId) ? prev : [...prev, castingId])); track('contact_click', { target_id: member.id, meta: { what: 'invite' } }) }
    else { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Could not invite.') }
  }

  const toggleFollow = async () => {
    if (!member || followBusy) return
    setFollowBusy(true)
    const next = !following
    track('contact_click', { target_id: member.id, meta: { what: next ? 'follow' : 'unfollow' } })
    setFollowing(next); setFollowers(c => Math.max(0, c + (next ? 1 : -1))) // optimistic
    const res = await fetch('/api/follow', {
      method: next ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: member.id }),
    })
    setFollowBusy(false)
    if (!res.ok) {
      setFollowing(!next); setFollowers(c => Math.max(0, c + (next ? -1 : 1))) // revert
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not update follow.')
    }
  }

  const startChat = async () => {
    if (!member || starting) return
    trackNow('contact_click', { target_id: member.id, meta: { what: 'message' } })
    setStarting(true)
    const res = await fetch('/api/messages/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toUserId: member.id }),
    })
    const d = await res.json().catch(() => ({}))
    setStarting(false)
    if (res.ok && d.conversationId) router.push(`/account/messages/${d.conversationId}`)
    else setError(d.error ?? 'Could not start a conversation.')
  }

  useEffect(() => {
    fetch(`/api/directory/${params.id}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(d.error ?? 'Could not load profile.'); setMember(null) }
        else {
          setMember(d.member); setFollowing(!!d.member.is_following); setFollowers(d.member.followers ?? 0)
          if (!d.member.is_self) track('profile_view', { target_id: d.member.id, meta: { photos: d.member.portfolio?.length ?? 0 } })
        }
        setLoading(false)
      })
      .catch(() => { setError('Could not load profile.'); setLoading(false) })
  }, [params.id])

  // Load the viewer's own open castings so they can invite this member to one.
  useEffect(() => {
    if (!member || member.is_self) return
    fetch('/api/castings?mine=1').then(r => (r.ok ? r.json() : null)).then(d => {
      const now = Date.now()
      const open = (d?.castings ?? []).filter((c: { status: string; expires_at?: string | null }) => c.status === 'open' && (!c.expires_at || new Date(c.expires_at).getTime() > now))
      setMyCastings(open.map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })))
    }).catch(() => {})
  }, [member])

  // Analytics: did the viewer actually scroll down to the portfolio? Logged
  // once per profile visit when at least a third of the grid is on screen.
  const portfolioRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = portfolioRef.current
    if (!el || !member || member.is_self || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        track('portfolio_seen', { target_id: member.id, meta: { photos: member.portfolio.length } })
        obs.disconnect()
      }
    }, { threshold: 0.33 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [member, loading])

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', paddingTop: 40 }}>Loading…</div>
  if (error || !member) return (
    <div style={{ paddingTop: 20 }}>
      <Link href="/account/directory" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'none' }}>← Back to directory</Link>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', paddingTop: 24 }}>{error || 'Member not found.'}</div>
    </div>
  )

  const embed = member.video_url ? embedUrl(member.video_url) : null
  const hasMature = member.portfolio.some(p => p.is_mature)

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/account/directory" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'none' }}>← Back to directory</Link>

      {/* Banner: cover photo (Founding) or chosen color (migration 121) */}
      {(member.cover_url || colorByKey(member.profile_color)) && (
        <div className={member.cover_url ? undefined : 'pc-fill'}
          style={{ ...colorVars(member.profile_color), marginTop: 20, height: member.cover_url ? 'clamp(140px, 26vw, 240px)' : 110, borderRadius: 12, overflow: 'hidden', background: member.cover_url ? 'var(--t-surface-hi)' : undefined }}>
          {member.cover_url && <img src={member.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
      )}

      {/* Header — Instagram-style: big photo left, details stacked right */}
      <style>{`
        .pf-head { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "av top" "av body"; column-gap: 40px; align-items: start; margin: 22px 0 8px; }
        .pf-avatar { grid-area: av; }
        .pf-top { grid-area: top; min-width: 0; }
        .pf-body { grid-area: body; min-width: 0; }
        .pf-stats { display: flex; gap: 22px; margin-top: 14px; font-family: Inter; font-size: 15px; }
        .pf-head.has-banner { margin-top: 0; padding-left: 20px; }
        .pf-avatar { width: 150px; height: 150px; }
        .pf-head.has-banner .pf-avatar { margin-top: -56px; }
        .pf-head.has-banner .pf-top { padding-top: 16px; }
        .pf-link { display: flex; align-items: center; gap: 9px; color: var(--t-gold); text-decoration: none; font-family: Inter; font-size: 14px; font-weight: 500; padding: 3px 0; width: fit-content; max-width: 100%; }
        .pf-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pf-link:hover span { text-decoration: underline; }
        .pf-link svg { flex-shrink: 0; opacity: 0.85; }
        /* Phones: Instagram layout — photo + name/stats side by side, then
           roles, bio, links and buttons full width underneath. */
        @media (max-width: 640px) {
          .pf-head { grid-template-areas: "av top" "body body"; column-gap: 16px; }
          .pf-head.has-banner { padding-left: 12px; padding-right: 12px; }
          .pf-avatar { width: 88px; height: 88px; }
          .pf-head.has-banner .pf-avatar { margin-top: -34px; }
          .pf-head.has-banner .pf-top { padding-top: 8px; }
          .pf-top h1 { font-size: 26px !important; }
          .pf-stats { gap: 16px; font-size: 13.5px; margin-top: 10px; }
          .pf-stats button { font-size: 13.5px !important; }
          .pf-body { margin-top: 6px; }
          .pf-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 2px !important; margin-left: -24px; margin-right: -24px; }
          .pf-grid > div { border-radius: 0 !important; border: none !important; }
        }
      `}</style>
      <div className={`pf-head${(member.cover_url || colorByKey(member.profile_color)) ? ' has-banner' : ''}`}>
        <div className="pf-avatar" style={{ borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', border: (member.cover_url || colorByKey(member.profile_color)) ? '4px solid var(--t-bg)' : '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {member.avatar_url
            ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>{(member.full_name || '?').charAt(0).toUpperCase()}</span>}
        </div>

        <div className="pf-top">
          {/* Name + First 100 crest, like a verified mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: 0, lineHeight: 1.05 }}>{member.full_name}</h1>
            {member.founding_number ? <HexCrest size={26} title={`First 100 · No. ${String(member.founding_number).padStart(2, '0')}`} /> : null}
          </div>
          {member.founding_number ? (
            <div style={{ fontFamily: 'Inter', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--t-gold)', marginTop: 6 }}>
              FIRST 100 · NO. {String(member.founding_number).padStart(2, '0')}
            </div>
          ) : null}

          {/* Stats */}
          <div className="pf-stats">
            <span style={{ color: 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))' }}><strong style={{ color: 'var(--t-fg)' }}>{member.portfolio.length}</strong> photo{member.portfolio.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => openList('followers')} style={{ background: 'transparent', border: 'none', padding: 0, color: 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))', fontFamily: 'Inter', fontSize: 15, cursor: 'pointer' }}>
              <strong style={{ color: 'var(--t-fg)' }}>{followers}</strong> follower{followers === 1 ? '' : 's'}
            </button>
            <button type="button" onClick={() => openList('following')} style={{ background: 'transparent', border: 'none', padding: 0, color: 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))', fontFamily: 'Inter', fontSize: 15, cursor: 'pointer' }}>
              <strong style={{ color: 'var(--t-fg)' }}>{member.following}</strong> following
            </button>
          </div>
        </div>

        <div className="pf-body">

          {/* Roles — a quiet category line, like Instagram's */}
          {(member.roles.length > 0 || member.account_type === 'brand') && (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', marginTop: 14 }}>
              {[member.account_type === 'brand' ? 'Brand' : null, ...member.roles].filter(Boolean).join(' · ')}
            </div>
          )}

          {member.bio && (
            <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'var(--t-fg)', lineHeight: 1.55, margin: '6px 0 0', whiteSpace: 'pre-line' }}>{member.bio}</p>
          )}

          {/* Links — stacked, no borders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
            {member.instagram && (
              <a className="pf-link" href={`https://instagram.com/${member.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'instagram' } })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                <span>@{member.instagram.replace('@', '')}</span>
              </a>
            )}
            {member.email && (
              <a className="pf-link" href={`mailto:${member.email}`} onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'email' } })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                <span>{member.email}</span>
              </a>
            )}
            {member.phone && (
              <a className="pf-link" href={`tel:${member.phone}`} onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'phone' } })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
                <span>{member.phone}</span>
              </a>
            )}
            {member.links.map((l, i) => {
              let host = l.url
              try { host = new URL(withProtocol(l.url)).hostname.replace('www.', '') } catch { /* keep raw */ }
              return (
                <a key={i} className="pf-link" href={withProtocol(l.url)} target="_blank" rel="noopener noreferrer" onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'link' } })}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                  <span>{l.label || host}</span>
                </a>
              )
            })}
          </div>

      {!member.is_self && (
            <div style={{ margin: '18px 0 4px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={toggleFollow} disabled={followBusy}
                  style={following
                    ? { background: 'transparent', color: 'rgba(var(--t-fg-rgb), calc(0.75 * var(--t-a)))', border: '1px solid rgba(var(--t-fg-rgb), calc(0.25 * var(--t-a)))', borderRadius: 6, padding: '11px 22px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', cursor: followBusy ? 'default' : 'pointer', opacity: followBusy ? 0.6 : 1 }
                    : { background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 6, padding: '11px 22px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', cursor: followBusy ? 'default' : 'pointer', opacity: followBusy ? 0.6 : 1 }}>
                  {following ? 'Following' : 'Follow'}
                </button>
                <button type="button" onClick={startChat} disabled={starting}
                  style={{ background: 'transparent', color: 'var(--t-fg)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.25 * var(--t-a)))', borderRadius: 6, padding: '11px 22px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1 }}>
                  {starting ? 'Opening…' : 'Message'}
                </button>
                {myCastings.length > 0 && (
                  <button type="button" onClick={() => setInviteOpen(o => !o)}
                    style={{ background: 'transparent', color: 'var(--t-fg)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.25 * var(--t-a)))', borderRadius: 6, padding: '11px 22px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer' }}>
                    Invite {inviteOpen ? '▴' : '▾'}
                  </button>
                )}
              </div>
              {inviteOpen && myCastings.length > 0 && (
                <div style={{ marginTop: 10, border: '1px solid rgba(var(--t-fg-rgb), calc(0.15 * var(--t-a)))', borderRadius: 8, padding: 8, maxWidth: 380, background: 'var(--t-surface)' }}>
                  <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', padding: '4px 6px 8px' }}>INVITE {member.full_name.split(' ')[0].toUpperCase()} TO…</div>
                  {myCastings.map(c => {
                    const done = invitedIds.includes(c.id)
                    return (
                      <button key={c.id} type="button" onClick={() => invite(c.id)} disabled={done}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '9px 10px', fontFamily: 'Inter', fontSize: 13, color: done ? 'var(--t-ok)' : 'var(--t-fg)', cursor: done ? 'default' : 'pointer' }}>
                        {done ? '✓ Invited — ' : ''}{c.title}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Video */}
      {member.video_url && (
        <div style={{ margin: '24px 0' }}>
          {embed ? (
            <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))' }}>
              <iframe src={embed} title="Reel" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
            </div>
          ) : (
            <a href={withProtocol(member.video_url)} target="_blank" rel="noopener noreferrer" onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'reel' } })} style={pillLink}>▶ Watch reel</a>
          )}
        </div>
      )}

      {/* Portfolio */}
      {member.portfolio.length > 0 && (
        <div ref={portfolioRef} style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', margin: 0 }}>PORTFOLIO</h2>
            {hasMature && !revealMature && (
              <button type="button" onClick={() => setRevealMature(true)}
                style={{ background: 'transparent', border: '1px solid rgba(var(--t-gold-rgb), 0.5)', color: 'var(--t-gold)', borderRadius: 4, padding: '7px 12px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
                Reveal 18+ work — I&apos;m over 18
              </button>
            )}
          </div>
          <div className="pf-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {member.portfolio.map((img, idx) => {
              const hidden = img.is_mature && !revealMature
              return (
                <div key={img.id}
                  onClick={() => { if (!hidden) { setLightbox(img.url); track('portfolio_open', { target_id: member.id, meta: { index: idx + 1, of: member.portfolio.length } }) } }}
                  style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', background: 'var(--t-surface)', cursor: hidden ? 'default' : 'zoom-in' }}>
                  <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: hidden ? 'blur(18px)' : 'none' }} />
                  {hidden && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
                      <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--t-gold)', border: '1px solid rgba(var(--t-gold-rgb), 0.5)', borderRadius: 4, padding: '4px 8px' }}>18+</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {member.portfolio.length === 0 && !member.bio && member.links.length === 0 && !member.video_url && (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', marginTop: 24 }}>
          {member.is_self ? 'Your profile is looking empty — add a bio and some work.' : 'This member hasn’t added work yet.'}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100, cursor: 'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} />
        </div>
      )}

      {/* Followers / following list */}
      {listOpen && (
        <div onClick={() => setListOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--t-surface-lo)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', borderRadius: 10, width: '100%', maxWidth: 380, maxHeight: 'calc(70 * var(--svh))', overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.03em' }}>{listOpen === 'followers' ? 'FOLLOWERS' : 'FOLLOWING'}</div>
              <button type="button" onClick={() => setListOpen(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {listLoading ? (
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', padding: '12px 0' }}>Loading…</div>
            ) : listMembers.length === 0 ? (
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', padding: '12px 0' }}>{listOpen === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {listMembers.map(m => (
                  <Link key={m.id} href={`/account/directory/${m.id}`} onClick={() => setListOpen(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', padding: '8px 6px', borderRadius: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {m.avatar_url ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' }}>{m.name.charAt(0).toUpperCase()}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'var(--t-fg)' }}>{m.name}</div>
                      {m.roles.length > 0 && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.roles.join(' · ')}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const pillLink: React.CSSProperties = {
  fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', textDecoration: 'none',
  border: '1px solid rgba(232,200,120,0.3)', borderRadius: 20, padding: '6px 13px',
}

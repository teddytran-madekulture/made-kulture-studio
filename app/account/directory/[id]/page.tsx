'use client'
import { useEffect, useRef, useState } from 'react'
import { track, trackNow } from '@/lib/track'
import { HexCrest } from '@/components/FoundingBadge'
import { colorVars, colorByKey } from '@/lib/profile-colors'
import { groupCredits, type Credit } from '@/lib/profile-credits'
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
  credits?: Credit[]
  cv_url?: string | null
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
  const [tab, setTab] = useState<'portfolio' | 'credits'>('portfolio')
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

  const hasBanner = !!(member.cover_url || colorByKey(member.profile_color))
  const no = member.founding_number ? String(member.founding_number).padStart(2, '0') : null
  const btn = (primary: boolean): React.CSSProperties => ({
    background: primary ? 'var(--t-fg)' : 'rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', color: primary ? 'var(--t-on-fg)' : 'var(--t-fg)',
    border: 'none', borderRadius: 8, padding: '8px 18px', fontFamily: 'Inter', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  })
  const icon = (d: React.ReactNode) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
  const linkRows: { key: string; href: string; label: string; what: string; external: boolean; ico: React.ReactNode }[] = []
  if (member.instagram) linkRows.push({ key: 'ig', href: `https://instagram.com/${member.instagram.replace('@', '')}`, label: `@${member.instagram.replace('@', '')}`, what: 'instagram', external: true, ico: icon(<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /></>) })
  if (member.email) linkRows.push({ key: 'em', href: `mailto:${member.email}`, label: member.email, what: 'email', external: false, ico: icon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>) })
  if (member.phone) linkRows.push({ key: 'ph', href: `tel:${member.phone}`, label: member.phone, what: 'phone', external: false, ico: icon(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />) })
  member.links.forEach((l, i) => {
    let host = l.url
    try { host = new URL(withProtocol(l.url)).hostname.replace('www.', '') } catch { /* keep raw */ }
    linkRows.push({ key: 'l' + i, href: withProtocol(l.url), label: l.label || host, what: 'link', external: true, ico: icon(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>) })
  })
  const links = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
      {linkRows.map(l => (
        <a key={l.key} className="ig-link" href={l.href} {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: l.what } })}>
          {l.ico}<span>{l.label}</span>
        </a>
      ))}
    </div>
  )
  const actions = member.is_self ? (
    <Link href="/account/profile" style={{ ...btn(false), textDecoration: 'none', display: 'inline-block' }}>Edit profile</Link>
  ) : (
    <>
      <button type="button" onClick={toggleFollow} disabled={followBusy} style={{ ...btn(!following), opacity: followBusy ? 0.6 : 1 }}>{following ? 'Following' : 'Follow'}</button>
      <button type="button" onClick={startChat} disabled={starting} style={{ ...btn(false), opacity: starting ? 0.6 : 1 }}>{starting ? 'Opening…' : 'Message'}</button>
      {myCastings.length > 0 && (
        <button type="button" onClick={() => setInviteOpen(o => !o)} style={btn(false)}>Invite {inviteOpen ? '▴' : '▾'}</button>
      )}
    </>
  )
  const stats = (
    <div className="ig-stats">
      <span><b>{member.portfolio.length}</b> photo{member.portfolio.length === 1 ? '' : 's'}</span>
      <button type="button" onClick={() => openList('followers')}><b>{followers}</b> follower{followers === 1 ? '' : 's'}</button>
      <button type="button" onClick={() => openList('following')}><b>{member.following}</b> following</button>
    </div>
  )
  const category = [member.account_type === 'brand' ? 'Brand' : null, ...member.roles].filter(Boolean).join(' · ')

  return (
    <div className="ig-page">
      <style>{`
        .ig-page { max-width: 935px; margin: 0 auto; }
        .ig-cover { border-radius: 12px; overflow: hidden; height: clamp(120px, 20vw, 210px); margin-bottom: 30px; }
        .ig-head { display: grid; grid-template-columns: 290px minmax(0, 1fr); padding-bottom: 36px; border-bottom: 1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a))); }
        .ig-av-wrap { display: flex; justify-content: center; }
        .ig-av { width: 150px; height: 150px; border-radius: 50%; overflow: hidden; background: var(--t-surface-hi); display: flex; align-items: center; justify-content: center; }
        .ig-row1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .ig-name { font-family: Inter; font-size: 21px; font-weight: 700; margin: 0 6px 0 0; line-height: 1.2; }
        .ig-no { font-family: Inter; font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--t-gold); margin-top: 6px; }
        .ig-stats { display: flex; gap: 34px; margin: 18px 0 16px; font-family: Inter; font-size: 15.5px; }
        .ig-stats b { font-weight: 700; color: var(--t-fg); }
        .ig-stats span, .ig-stats button { color: rgba(var(--t-fg-rgb), calc(0.75 * var(--t-a))); background: none; border: none; padding: 0; font: inherit; cursor: pointer; }
        .ig-stats span { cursor: default; }
        .ig-cat { font-family: Inter; font-size: 14px; color: rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a))); }
        .ig-bio { font-family: Inter; font-size: 14.5px; line-height: 1.5; margin: 2px 0 0; white-space: pre-line; }
        .ig-link { display: flex; align-items: center; gap: 8px; color: var(--t-gold); text-decoration: none; font-family: Inter; font-size: 14px; font-weight: 700; width: fit-content; max-width: 100%; }
        .ig-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ig-link:hover span { text-decoration: underline; }
        .ig-m { display: none; }
        .ig-tabs { display: flex; justify-content: center; gap: 60px; }
        .ig-tab { display: flex; align-items: center; gap: 7px; background: none; border: none; border-top: 1px solid transparent; margin-top: -1px; padding: 16px 0; font-family: Inter; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; color: rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a))); cursor: pointer; }
        .ig-tab.on { color: var(--t-fg); border-top-color: var(--t-fg); }
        .ig-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
        .ig-about { max-width: 620px; margin: 8px auto 0; font-family: Inter; }
        .ig-about h3 { font-size: 11px; letter-spacing: 0.12em; color: rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a))); font-weight: 700; margin: 26px 0 8px; }
        @media (max-width: 768px) {
          .ig-cover { height: 130px; border-radius: 10px; margin-bottom: 16px; }
          .ig-head { grid-template-columns: 96px minmax(0, 1fr); column-gap: 18px; padding-bottom: 18px; }
          .ig-av-wrap { justify-content: flex-start; }
          .ig-av { width: 86px; height: 86px; }
          .ig-name { font-size: 17px; }
          .ig-stats { gap: 18px; margin: 10px 0 0; font-size: 13.5px; }
          .ig-d { display: none !important; }
          .ig-m { display: block; }
          .ig-body { grid-column: 1 / -1; margin-top: 14px; }
          .ig-mbtns { display: flex; gap: 6px; margin-top: 14px; }
          .ig-mbtns > * { flex: 1; text-align: center; }
          .ig-tabs { gap: 0; justify-content: space-around; }
          .ig-grid { gap: 2px; margin: 0 -16px; }
        }
      `}</style>

      <Link href="/account/directory" style={{ display: 'inline-block', fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'none', marginBottom: 14 }}>← Directory</Link>

      {/* Banner: cover photo (First 100) or chosen color */}
      {hasBanner && (
        <div className={`ig-cover${member.cover_url ? '' : ' pc-fill'}`} style={colorVars(member.profile_color)}>
          {member.cover_url && <img src={member.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
      )}

      <div className="ig-head" style={{ marginTop: hasBanner ? 0 : 16 }}>
        <div className="ig-av-wrap">
          <div className="ig-av">
            {member.avatar_url
              ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>{(member.full_name || '?').charAt(0).toUpperCase()}</span>}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="ig-row1">
            <h1 className="ig-name">{member.full_name}</h1>
            {no ? <HexCrest size={22} title={`First 100 · No. ${no}`} /> : null}
            <div className="ig-d" style={{ display: 'flex', gap: 8, marginLeft: 8 }}>{actions}</div>
          </div>
          {no ? <div className="ig-no">FIRST 100 · NO. {no}</div> : null}
          {stats}
          {/* Desktop: details sit here beside the photo */}
          <div className="ig-d">
            {category && <div className="ig-cat">{category}</div>}
            {member.bio && <p className="ig-bio">{member.bio}</p>}
            {links}
          </div>
        </div>

        {/* Phone: details run full width under the photo row */}
        <div className="ig-body ig-m">
          {category && <div className="ig-cat">{category}</div>}
          {member.bio && <p className="ig-bio">{member.bio}</p>}
          {links}
          <div className="ig-mbtns">{actions}</div>
        </div>
      </div>

      {inviteOpen && myCastings.length > 0 && (
        <div style={{ margin: '12px 0 0', border: '1px solid rgba(var(--t-fg-rgb), calc(0.15 * var(--t-a)))', borderRadius: 8, padding: 8, maxWidth: 380, background: 'var(--t-surface)' }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', padding: '4px 6px 8px' }}>INVITE {member.full_name.split(' ')[0].toUpperCase()} TO…</div>
          {myCastings.map(c => {
            const done = invitedIds.includes(c.id)
            return (
              <button key={c.id} type="button" onClick={() => invite(c.id)} disabled={done}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 6, padding: '9px 10px', fontFamily: 'Inter', fontSize: 13, color: done ? 'var(--t-ok)' : 'var(--t-fg)', cursor: done ? 'default' : 'pointer' }}>
                {done ? '✓ Invited: ' : ''}{c.title}
              </button>
            )
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="ig-tabs">
        <button type="button" className={`ig-tab${tab === 'portfolio' ? ' on' : ''}`} onClick={() => setTab('portfolio')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
          PORTFOLIO
        </button>
        <button type="button" className={`ig-tab${tab === 'credits' ? ' on' : ''}`} onClick={() => setTab('credits')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
          CREDITS
        </button>
      </div>

      {tab === 'portfolio' ? (
        member.portfolio.length > 0 ? (
          <div ref={portfolioRef}>
            {hasMature && !revealMature && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button type="button" onClick={() => setRevealMature(true)}
                  style={{ background: 'transparent', border: '1px solid rgba(var(--t-gold-rgb), 0.5)', color: 'var(--t-gold)', borderRadius: 6, padding: '6px 12px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
                  Reveal 18+ work (I&apos;m over 18)
                </button>
              </div>
            )}
            <div className="ig-grid">
              {member.portfolio.map((img, idx) => {
                const hidden = img.is_mature && !revealMature
                return (
                  <div key={img.id}
                    onClick={() => { if (!hidden) { setLightbox(img.url); track('portfolio_open', { target_id: member.id, meta: { index: idx + 1, of: member.portfolio.length } }) } }}
                    style={{ position: 'relative', aspectRatio: '4 / 5', overflow: 'hidden', background: 'var(--t-surface)', cursor: hidden ? 'default' : 'zoom-in' }}>
                    <img src={img.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: hidden ? 'blur(18px)' : 'none' }} />
                    {hidden && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
                        <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#e6c07a', border: '1px solid rgba(230,192,122,0.5)', borderRadius: 4, padding: '4px 8px' }}>18+</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', textAlign: 'center', padding: '48px 0' }}>
            {member.is_self ? 'No photos yet. Add some from your profile editor.' : 'No photos yet.'}
          </div>
        )
      ) : (
        <div className="ig-about">
          {(member.cv_url || no) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              {no ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))' }}><HexCrest size={24} /> First 100 · Member No. {no}</div> : <span />}
              {member.cv_url && (
                <a href={member.cv_url} target="_blank" rel="noopener noreferrer" onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'cv' } })}
                  style={{ ...btn(true), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                  Download CV
                </a>
              )}
            </div>
          )}

          {groupCredits(member.credits ?? []).map(g => (
            <div key={g.type}>
              <h3>{g.type.toUpperCase()}</h3>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {g.items.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(var(--t-fg-rgb), calc(0.07 * var(--t-a)))' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {c.url ? (
                        <a href={withProtocol(c.url)} target="_blank" rel="noopener noreferrer" onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'credit' } })}
                          style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-fg)', textDecoration: 'none', borderBottom: '1px solid rgba(var(--t-gold-rgb), 0.6)' }}>{c.title}</a>
                      ) : <span style={{ fontSize: 15, fontWeight: 700 }}>{c.title}</span>}
                      {c.role && <div style={{ fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))', marginTop: 2 }}>{c.role}</div>}
                    </div>
                    {c.year && <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12.5, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' }}>{c.year}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {member.video_url && (
            <>
              <h3>REEL</h3>
              {embed ? (
                <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))' }}>
                  <iframe src={embed} title="Reel" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
                </div>
              ) : (
                <a className="ig-link" href={withProtocol(member.video_url)} target="_blank" rel="noopener noreferrer" onClick={() => trackNow('contact_click', { target_id: member.id, meta: { what: 'reel' } })}><span>▶ Watch reel</span></a>
              )}
            </>
          )}

          {(member.credits ?? []).length === 0 && !member.video_url && !member.cv_url && (
            <div style={{ fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', textAlign: 'center', padding: '40px 0' }}>
              {member.is_self ? <>No credits yet. <Link href="/account/profile" style={{ color: 'var(--t-gold)' }}>Add your publications, campaigns and more</Link>.</> : 'No credits listed yet.'}
            </div>
          )}
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

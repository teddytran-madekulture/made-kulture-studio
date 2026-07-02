'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type PortfolioImg = { id: string; url: string; is_mature: boolean }
type Member = {
  id: string
  full_name: string
  account_type?: string
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

  const startChat = async () => {
    if (!member || starting) return
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
        else setMember(d.member)
        setLoading(false)
      })
      .catch(() => { setError('Could not load profile.'); setLoading(false) })
  }, [params.id])

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingTop: 40 }}>Loading…</div>
  if (error || !member) return (
    <div style={{ paddingTop: 20 }}>
      <Link href="/account/directory" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Back to directory</Link>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingTop: 24 }}>{error || 'Member not found.'}</div>
    </div>
  )

  const embed = member.video_url ? embedUrl(member.video_url) : null
  const hasMature = member.portfolio.some(p => p.is_mature)

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/account/directory" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Back to directory</Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, margin: '20px 0 8px' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {member.avatar_url
            ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No photo</span>}
        </div>
        <div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '0 0 6px', lineHeight: 1 }}>{member.full_name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {member.account_type === 'brand' && (
              <span style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#8ab4f8', border: '1px solid rgba(138,180,248,0.4)', borderRadius: 4, padding: '3px 8px' }}>BRAND</span>
            )}
            {member.roles.map(r => (
              <span key={r} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px' }}>{r}</span>
            ))}
          </div>
        </div>
      </div>

      {member.bio && (
        <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '16px 0' }}>{member.bio}</p>
      )}

      {!member.is_self && (
        <button type="button" onClick={startChat} disabled={starting}
          style={{ background: '#fff', color: '#080808', border: 'none', borderRadius: 6, padding: '11px 22px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1, margin: '4px 0 12px' }}>
          {starting ? 'Opening…' : 'Message'}
        </button>
      )}

      {/* Contact + links */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0 8px' }}>
        {member.instagram && (
          <a href={`https://instagram.com/${member.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
            style={pillLink}>@{member.instagram.replace('@', '')}</a>
        )}
        {member.email && <a href={`mailto:${member.email}`} style={pillLink}>{member.email}</a>}
        {member.phone && <a href={`tel:${member.phone}`} style={pillLink}>{member.phone}</a>}
        {member.links.map((l, i) => {
          let host = l.url
          try { host = new URL(withProtocol(l.url)).hostname.replace('www.', '') } catch { /* keep raw */ }
          return (
            <a key={i} href={withProtocol(l.url)} target="_blank" rel="noopener noreferrer" style={pillLink}>{l.label || host}</a>
          )
        })}
      </div>

      {/* Video */}
      {member.video_url && (
        <div style={{ margin: '24px 0' }}>
          {embed ? (
            <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <iframe src={embed} title="Reel" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
            </div>
          ) : (
            <a href={withProtocol(member.video_url)} target="_blank" rel="noopener noreferrer" style={pillLink}>▶ Watch reel</a>
          )}
        </div>
      )}

      {/* Portfolio */}
      {member.portfolio.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.04em', margin: 0 }}>PORTFOLIO</h2>
            {hasMature && !revealMature && (
              <button type="button" onClick={() => setRevealMature(true)}
                style={{ background: 'transparent', border: '1px solid rgba(230,192,122,0.5)', color: '#e6c07a', borderRadius: 4, padding: '7px 12px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
                Reveal 18+ work — I&apos;m over 18
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {member.portfolio.map(img => {
              const hidden = img.is_mature && !revealMature
              return (
                <div key={img.id}
                  onClick={() => { if (!hidden) setLightbox(img.url) }}
                  style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#141414', cursor: hidden ? 'default' : 'zoom-in' }}>
                  <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: hidden ? 'blur(18px)' : 'none' }} />
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
      )}

      {member.portfolio.length === 0 && !member.bio && member.links.length === 0 && !member.video_url && (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.35)', marginTop: 24 }}>
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
    </div>
  )
}

const pillLink: React.CSSProperties = {
  fontFamily: 'Inter', fontSize: 13, color: '#e8c878', textDecoration: 'none',
  border: '1px solid rgba(232,200,120,0.3)', borderRadius: 20, padding: '6px 13px',
}

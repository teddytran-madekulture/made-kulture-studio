'use client'
// "Production services" row on the directory home (2026-10-05). Featured
// listings lead (Admin → Service Listings → FEATURE), then the newest, 3 max —
// the API decides the order. Tapping a card or REQUEST deep-links to the
// Services page, which opens the SAME detail pop-up / request form as
// everywhere else (components/ListingsTab), so there's one request flow.
//
// The dark card is a REFERRAL, not "list a service": most people reading this
// page are creatives, who can't post listings. It shares the Vendor sign-up
// link (/signup?as=vendor) so members bring in the car, prop and animal people
// they already know. With 3 listings it shrinks to a single line underneath.
import { useState } from 'react'
import Link from 'next/link'

export type ShowcaseListing = {
  id: string; category: string; title: string; details: string; rate: string; price_extras: string
  photos: string[]; tags: string[]; featured: boolean; is_self: boolean
  vendor: { id: string; name: string; avatar_url: string | null }
}

const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const hair = '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))'
const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }
const btn = (filled: boolean, onDark = false): React.CSSProperties => ({
  ...mono, flex: 1, display: 'inline-block', padding: '13px 16px', textDecoration: 'none', textAlign: 'center', cursor: 'pointer',
  border: `1px solid ${onDark ? 'var(--t-on-fg)' : 'var(--t-fg)'}`,
  background: filled ? (onDark ? 'var(--t-on-fg)' : 'var(--t-fg)') : 'transparent',
  color: filled ? (onDark ? 'var(--t-fg)' : 'var(--t-on-fg)') : (onDark ? 'var(--t-on-fg)' : 'var(--t-fg)'),
})
const clamp = (n: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden' })

const openHref = (l: ShowcaseListing) => `/account/directory/services?open=${l.id}`
const requestHref = (l: ShowcaseListing) => `/account/directory/services?request=${l.id}`

function Photo({ l, aspect, minHeight }: { l: ShowcaseListing; aspect?: string; minHeight?: number }) {
  return (
    <Link href={openHref(l)} style={{ position: 'relative', display: 'block', background: 'var(--t-surface-hi)', aspectRatio: aspect, minHeight, overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {l.photos[0] && <img src={l.photos[0]} alt={l.title} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {l.featured && <span style={{ ...mono, fontSize: 9, position: 'absolute', top: 12, left: 12, color: '#fff', border: '1px solid rgba(255,255,255,0.75)', background: 'rgba(0,0,0,0.3)', padding: '3px 7px' }}>Featured</span>}
      {l.photos.length > 1 && <span style={{ fontFamily: 'Inter', fontSize: 11, position: 'absolute', bottom: 10, right: 10, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 9px', borderRadius: 999 }}>{l.photos.length} photos</span>}
    </Link>
  )
}

function Actions({ l }: { l: ShowcaseListing }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 14 }}>
      <Link href={openHref(l)} style={btn(false)}>Details</Link>
      {l.is_self
        ? <Link href="/account/profile?s=listings" style={btn(true)}>Your listing</Link>
        : <Link href={requestHref(l)} style={btn(true)}>Request</Link>}
    </div>
  )
}

function Referral({ compact, isMobile }: { compact?: boolean; isMobile: boolean }) {
  const [msg, setMsg] = useState('')
  const share = async () => {
    const url = `${window.location.origin}/signup?as=vendor`
    const text = 'Rent out cars, props or gear, or work with animals? List it on the Made Kulture directory so photographers and crews can request it.'
    try {
      if (navigator.share) { await navigator.share({ title: 'List your services on Made Kulture', text, url }); return }
    } catch (e: any) { if (e?.name === 'AbortError') return }
    try { await navigator.clipboard.writeText(url); setMsg('Link copied. Send it to them.') }
    catch { setMsg(url) }
  }
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 18, fontFamily: 'Inter', fontSize: 14, color: muted }}>
        <span>Know someone who rents cars, props or gear for shoots? {msg && <span style={{ color: 'var(--t-gold)' }}>{msg}</span>}</span>
        <button type="button" onClick={share} style={{ ...btn(false), flex: 'none' }}>Share the vendor link</button>
      </div>
    )
  }
  return (
    <aside style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', borderRadius: 10, padding: isMobile ? 22 : 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...mono, fontSize: 10, color: '#d9be86' }}>Know a vendor?</div>
      <div style={{ fontFamily: 'Inter', fontSize: isMobile ? 22 : 26, fontWeight: 500, lineHeight: 1.15 }}>Bring the car, prop and animal people you shoot with.</div>
      <p style={{ fontFamily: 'Inter', fontSize: 13, lineHeight: 1.55, margin: 0, opacity: 0.72 }}>
        Vendors list what they rent, and members request it right here. Send them the sign-up link.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['Picture cars', 'Prop rental', 'Wardrobe', 'Animal wranglers'].map(c => (
          <span key={c} style={{ fontFamily: 'Inter', fontSize: 11, border: '1px solid currentColor', borderRadius: 999, padding: '3px 9px', opacity: 0.6 }}>{c}</span>
        ))}
      </div>
      <button type="button" onClick={share} style={{ ...btn(false, true), marginTop: 'auto', flex: 'none' }}>Share the vendor link</button>
      {msg && <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#d9be86', wordBreak: 'break-all' }}>{msg}</div>}
    </aside>
  )
}

export default function ServicesShowcase({ listings, total, isMobile, serifClass, sectionStyle, head }: {
  listings: ShowcaseListing[]; total: number; isMobile: boolean; serifClass: string
  sectionStyle: React.CSSProperties; head: React.ReactNode
}) {
  if (!listings.length) return null
  const one = listings.length === 1

  const body = (l: ShowcaseListing, big: boolean) => (
    <div style={{ padding: big ? (isMobile ? '20px 20px 22px' : '26px 26px 24px') : '16px 16px 18px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, fontFamily: 'Inter' }}>
      <div style={{ ...mono, fontSize: 10, color: 'var(--t-gold)' }}>{l.category}</div>
      <Link href={openHref(l)} className={serifClass} style={{ fontSize: big ? (isMobile ? 30 : 36) : 26, lineHeight: 1.05, fontStyle: 'italic', color: 'var(--t-fg)', textDecoration: 'none' }}>{l.title}</Link>
      <Link href={`/account/directory/${l.vendor.id}`} style={{ fontSize: 13, color: muted, textDecoration: 'none' }}>by {l.vendor.name}</Link>
      {l.rate && <div style={{ fontSize: big ? 16 : 14, fontWeight: 500, marginTop: 4 }}>{l.rate}</div>}
      {big && l.price_extras && <div style={{ fontSize: 12, color: muted }}>{l.price_extras}</div>}
      {big && l.details && <p style={{ ...clamp(isMobile ? 2 : 3), fontSize: 14, lineHeight: 1.55, margin: '6px 0 0', color: 'rgba(var(--t-fg-rgb), calc(0.75 * var(--t-a)))' }}>{l.details}</p>}
      {big && !isMobile && l.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {l.tags.slice(0, 4).map(t => <span key={t} style={{ fontSize: 11, border: hair, borderRadius: 999, padding: '3px 9px', color: muted }}>{t}</span>)}
        </div>
      )}
      <Actions l={l} />
    </div>
  )

  return (
    <section style={sectionStyle}>
      {head}
      {one ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr', gap: 16 }}>
          <article style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 1fr', background: 'var(--t-surface)', border: hair, borderRadius: 10, overflow: 'hidden' }}>
            <Photo l={listings[0]} aspect={isMobile ? '4 / 3' : undefined} minHeight={isMobile ? undefined : 320} />
            {body(listings[0], true)}
          </article>
          <Referral isMobile={isMobile} />
        </div>
      ) : (<>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16 }}>
          {listings.map(l => (
            <article key={l.id} style={{ display: 'flex', flexDirection: 'column', background: 'var(--t-surface)', border: hair, borderRadius: 10, overflow: 'hidden' }}>
              <Photo l={l} aspect="4 / 3" />
              {body(l, false)}
            </article>
          ))}
          {listings.length === 2 && <Referral isMobile={isMobile} />}
        </div>
        {listings.length >= 3 && <Referral compact isMobile={isMobile} />}
      </>)}
      {total > listings.length && (
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted, marginTop: 14 }}>
          <Link href="/account/directory/services" style={{ color: 'var(--t-fg)' }}>{total} listings in Services →</Link>
        </div>
      )}
    </section>
  )
}

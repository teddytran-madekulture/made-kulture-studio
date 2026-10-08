'use client'
// THE DIRECTORY — home (2026-10-02, Directory Plan). The grid that used to live
// here is now /account/directory/explore. Light by default (see the THEME_BOOT
// note in app/account/layout.tsx) so the network reads as its own place, not
// the dark studio site. All colours are theme tokens, so dark mode still works.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Instrument_Serif } from 'next/font/google'
import DirectoryHeader from '@/components/DirectoryHeader'
import FinishProfileCard from '@/components/FinishProfileCard'
import ServicesShowcase, { type ShowcaseListing } from '@/components/ServicesShowcase'
import SubmissionsRow, { type SubmissionCall } from '@/components/SubmissionsRow'
import { useIsMobile } from '@/lib/use-is-mobile'

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'] })

type Credit = { role: string; handle: string; memberId: string | null }
type Home = {
  me: { name: string | null; avatar: string | null; foundingNumber: number | null; optedIn: boolean; listed: boolean; blockers: string[]; photos: number }
  editorial: { title: string; subtitle: string; setName: string; setSlug: string; postUrl: string; photos: string[]; credits: Credit[] } | null
  total: number
  submissions?: SubmissionCall[]
  newMembers?: { id: string; name: string; roles: string[]; account_type?: string; photo: string | null; isNew: boolean }[]
  fresh?: { id: string; url: string; memberId: string; name: string }[]
  services?: ShowcaseListing[]
  servicesTotal?: number
  castings?: { id: string; title: string; compensation_type: string; roles_needed: string[]; set_slug: string | null; plan_mode: string; shoot_date: string | null; mature: boolean }[]
}

const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const hair = '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))'
const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }
const btn = (filled: boolean): React.CSSProperties => ({
  ...mono, display: 'inline-block', padding: '13px 20px', textDecoration: 'none', textAlign: 'center',
  border: '1px solid var(--t-fg)', background: filled ? 'var(--t-fg)' : 'transparent', color: filled ? 'var(--t-on-fg)' : 'var(--t-fg)',
})

// "SAPEUR EN ROSE" → "Sapeur En Rose" — the serif reads better in title case.
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase())
const setLabel = (slug: string | null) => slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : ''
const day = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
const comp = (c: string) => c === 'paid' ? 'Paid' : c === 'tfp' ? 'TFP / collab' : c === 'unpaid' ? 'Unpaid' : c

function SectionHead({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 0 22px' }}>
      <h2 className={serif.className} style={{ fontSize: 40, lineHeight: 1, margin: 0, fontWeight: 400 }}>{title}</h2>
      {href && <Link href={href} style={{ fontFamily: 'Inter', fontSize: 13, color: muted, textDecoration: 'none' }}>{link} →</Link>}
    </div>
  )
}

export default function DirectoryHome() {
  const isMobile = useIsMobile()
  const [d, setD] = useState<Home | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/directory/home').then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error || 'Could not load the directory.')
      else setD(j)
    }).catch(() => setErr('Could not load the directory.'))
  }, [])

  if (err) return <div><DirectoryHeader active="home" /><p style={{ fontFamily: 'Inter', color: muted }}>{err}</p></div>
  if (!d) return <div><DirectoryHeader active="home" /><p style={{ fontFamily: 'Inter', color: muted }}>Loading…</p></div>

  const e = d.editorial
  const section: React.CSSProperties = { padding: isMobile ? '36px 0' : '52px 0', borderBottom: hair }

  return (
    <div style={{ fontFamily: 'Inter' }}>
      <DirectoryHeader active="home" />

      {/* Not listed yet — the one thing to do, above everything else */}
      {!d.me.listed && (
        <div style={{ marginBottom: 32 }}>
          {d.me.optedIn ? (
            <FinishProfileCard blockers={d.me.blockers as any} what="Seeing who's in the directory" />
          ) : (
            <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-gold-rgb), 0.45)', borderRadius: 8, padding: '24px 24px', maxWidth: 620 }}>
              <div style={{ ...mono, color: 'var(--t-gold)', marginBottom: 8 }}>Your listing is off</div>
              <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 16px', color: 'rgba(var(--t-fg-rgb), calc(0.75 * var(--t-a)))' }}>
                {d.total} members are in the directory. Turn on your listing to see who&apos;s here, get found, and answer castings.
              </p>
              <Link href="/account/profile?s=privacy" style={btn(true)}>Turn on my listing</Link>
            </div>
          )}
        </div>
      )}

      {/* FEATURED EDITORIAL */}
      {e && e.photos.length > 0 && (
        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (e.photos.length > 1 ? '1.25fr 1fr' : 'minmax(0, 520px) 1fr'), border: hair, borderRadius: 10, overflow: 'hidden', background: 'var(--t-surface)', marginBottom: 8 }}>
          {/* Portrait frames (4:5) so editorial photos show whole instead of a wide crop; two side by side on desktop when there are two. */}
          <div style={{ display: 'grid', gridTemplateColumns: !isMobile && e.photos.length > 1 ? '1fr 1fr' : '1fr', gap: 2, background: 'var(--t-surface-hi)' }}>
            {(isMobile ? e.photos.slice(0, 1) : e.photos.slice(0, 2)).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={i === 0 ? e.title : ''} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
            ))}
          </div>
          <div style={{ padding: isMobile ? '28px 22px' : '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
            <div style={{ ...mono, color: 'var(--t-gold)' }}>Featured editorial{e.setName ? ` · Shot on ${e.setName}` : ' · Shot at Made Kulture'}</div>
            <h1 className={serif.className} style={{ fontSize: isMobile ? 48 : 68, lineHeight: 0.95, fontStyle: 'italic', fontWeight: 400, margin: 0 }}>{titleCase(e.title)}</h1>
            {e.subtitle && <p style={{ color: muted, fontSize: 16, margin: 0 }}>{e.subtitle}</p>}
            {e.credits.length > 0 && (
              <div style={{ borderTop: hair }}>
                {e.credits.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: hair, fontSize: 15 }}>
                    <span style={{ color: muted, fontSize: 13 }}>{c.role || 'Credit'}</span>
                    {c.memberId
                      ? <Link href={`/account/directory/${c.memberId}`} style={{ color: 'var(--t-fg)', textDecoration: 'none', borderBottom: '1px solid var(--t-gold)' }}>@{c.handle}</Link>
                      : c.handle ? <a href={`https://www.instagram.com/${c.handle}/`} target="_blank" rel="noreferrer" style={{ color: 'var(--t-fg)', textDecoration: 'none' }}>@{c.handle}</a> : null}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {e.postUrl && <a href={e.postUrl} target="_blank" rel="noreferrer" style={btn(true)}>View the editorial</a>}
              {e.setSlug && <Link href={`/sets/${e.setSlug}`} style={btn(false)}>Shoot on {e.setName || 'this set'}</Link>}
            </div>
          </div>
        </section>
      )}

      {/* SUBMISSIONS — open calls + the always-open Featured Editorial. Shown to
          everyone (submitting needs no listing; the vote is a reason to finish one). */}
      <SubmissionsRow calls={d.submissions ?? []} isMobile={isMobile} serifClass={serif.className} listed={d.me.listed}
        sectionStyle={section} head={<SectionHead title="Submissions" href="/submissions" link="All submissions" />} />

      {d.me.listed && <>
        {/* NEW THIS WEEK */}
        {!!d.newMembers?.length && (
          <section style={section}>
            <SectionHead title="New in the directory" href="/account/directory/explore?view=people" link="See everyone" />
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap: 16 }}>
              {d.newMembers.map(m => (
                <Link key={m.id} href={`/account/directory/${m.id}`} style={{ textDecoration: 'none', color: 'var(--t-fg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ aspectRatio: '4/5', borderRadius: 6, overflow: 'hidden', background: 'var(--t-surface-hi)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.photo
                      ? <img src={m.photo} alt={m.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--t-gold-rgb), 0.12)' }}>
                          <span className={serif.className} style={{ fontSize: 64, fontStyle: 'italic', color: 'var(--t-gold)' }}>{(m.name || '?').trim().charAt(0).toUpperCase()}</span>
                        </div>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>
                    {m.name}
                    {m.isNew && <span style={{ ...mono, fontSize: 9, letterSpacing: '0.15em', color: 'var(--t-gold)', border: '1px solid var(--t-gold)', padding: '2px 5px', marginLeft: 6, verticalAlign: 2 }}>New</span>}
                  </div>
                  <div style={{ fontSize: 12, color: muted }}>{m.account_type === 'brand' ? 'Brand' : (m.roles[0] ?? '')}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* PRODUCTION SERVICES — featured vendor listings + vendor referral */}
        <ServicesShowcase listings={d.services ?? []} total={d.servicesTotal ?? 0} isMobile={isMobile} serifClass={serif.className}
          sectionStyle={section} head={<SectionHead title="Production services" href="/account/directory/services" link="All services" />} />

        {/* CASTINGS + YOU */}
        <section style={{ ...section, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr', gap: 28 }}>
          <div>
            <SectionHead title="Open castings" href="/account/castings" link="All castings" />
            {d.castings?.length ? d.castings.map(c => (
              <Link key={c.id} href={`/account/castings/${c.id}`} style={{ display: 'block', textDecoration: 'none', color: 'var(--t-fg)', background: 'var(--t-surface)', border: hair, borderRadius: 8, padding: '18px 20px', marginBottom: 10 }}>
                <div className={serif.className} style={{ fontSize: 26, fontStyle: 'italic', lineHeight: 1.05 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
                  {[day(c.shoot_date), c.plan_mode === 'buyout' ? 'Full studio' : setLabel(c.set_slug), comp(c.compensation_type), c.mature ? '18+' : ''].filter(Boolean).join(' · ')}
                </div>
                {c.roles_needed?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {c.roles_needed.map(r => <span key={r} style={{ fontSize: 11, border: hair, borderRadius: 999, padding: '4px 10px', background: 'var(--t-bg)' }}>{r}</span>)}
                  </div>
                )}
              </Link>
            )) : (
              <div style={{ fontSize: 14, color: muted, background: 'var(--t-surface)', border: hair, borderRadius: 8, padding: '20px' }}>
                No open castings right now. <Link href="/account/castings/new" style={{ color: 'var(--t-fg)' }}>Post one →</Link>
              </div>
            )}
          </div>

          {/* YOU */}
          <aside style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', borderRadius: 10, padding: 26, display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'start' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: 'rgba(127,127,127,0.4)', flexShrink: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d.me.avatar && <img src={d.me.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 24, letterSpacing: '0.02em', lineHeight: 1.05 }}>{(d.me.name || 'You').toUpperCase()}</div>
                {d.me.foundingNumber && <div style={{ ...mono, fontSize: 10, color: '#d9be86', marginTop: 4 }}>◆ First 100 · #{d.me.foundingNumber}</div>}
              </div>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, opacity: 0.72 }}>
              {d.me.photos < 3
                ? `Your listing is live. Add ${3 - d.me.photos} more portfolio photo${3 - d.me.photos === 1 ? '' : 's'} so people booking can see more of your work.`
                : 'Your listing is live. Keep your portfolio fresh. New work shows up on this page for everyone.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href="/account/profile" style={{ ...btn(false), borderColor: 'var(--t-on-fg)', color: 'var(--t-on-fg)', flex: 1 }}>Edit profile</Link>
              <Link href="/account/me" style={{ ...btn(false), borderColor: 'var(--t-on-fg)', color: 'var(--t-on-fg)', flex: 1 }}>View profile</Link>
            </div>
          </aside>
        </section>

        {/* FRESH WORK */}
        {!!d.fresh?.length && (
          <section style={{ ...section, borderBottom: 'none' }}>
            <SectionHead title="Fresh work" href="/account/directory/explore" link="Explore all" />
            <div style={{ columns: isMobile ? 2 : 4, columnGap: 12 }}>
              {d.fresh.map(f => (
                <Link key={f.id} href={`/account/directory/${f.memberId}`} style={{ display: 'block', breakInside: 'avoid', marginBottom: 12, position: 'relative', borderRadius: 6, overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.name} loading="lazy" style={{ width: '100%', display: 'block' }} />
                  <span style={{ position: 'absolute', left: 8, bottom: 8, fontFamily: 'Inter', fontSize: 11, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 9px', borderRadius: 999 }}>{f.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </>}
    </div>
  )
}

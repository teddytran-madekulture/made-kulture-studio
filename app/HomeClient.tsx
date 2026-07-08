'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'
import type { SiteImages } from '@/lib/site-images'
import { SITE_SETTINGS_DEFAULTS, type SiteSettings } from '@/lib/site-settings'
import type { PageContent } from '@/lib/site-content'
import { parseList } from '@/lib/content-list'
import { fmt as nl } from '@/lib/fmt'


const SETS = [
  { num: '01', slug: 'set-a',         name: 'Set A',             price: '$50', desc: '12×15ft white cinderblock walls, large windows',      photo: '/images/sets/set-a.webp',           gradient: 'linear-gradient(135deg, #1c1c1c 0%, #2a2a2a 100%)' },
  { num: '02', slug: 'set-b',         name: 'Set B',             price: '$50', desc: '12×14ft faux brush walls, duo color smooth walls',    photo: '/images/sets/set-b.webp',           gradient: 'linear-gradient(135deg, #0f1a1a 0%, #1a2a1e 100%)' },
  { num: '03', slug: 'set-c',         name: 'Set C',             price: '$50', desc: '12×14ft white walls, 20ft red vinyl backdrop',        photo: '/images/sets/set-c.webp',           gradient: 'linear-gradient(135deg, #1a0808 0%, #2a0f0f 100%)' },
  { num: '04', slug: 'set-d',         name: 'Set D',             price: '$50', desc: '12×15ft bare cinderblock, concrete floor',            photo: '/images/sets/set-d.jpg',           gradient: 'linear-gradient(135deg, #141414 0%, #1e1e1e 100%)' },
  { num: '05', slug: 'concrete',      name: 'Concrete',          price: '$50', desc: '12×16ft faux concrete walls, mirror wall',            photo: '/images/sets/concrete.webp',        gradient: 'linear-gradient(135deg, #111418 0%, #1a1e22 100%)' },
  { num: '06', slug: 'vintage',       name: 'Vintage',           price: '$50', desc: '12×16ft vintage aesthetic',                           photo: '/images/sets/vintage.webp',         gradient: 'linear-gradient(135deg, #1a1408 0%, #261e0e 100%)' },
  { num: '07', slug: 'cottage',       name: 'Cottage',           price: '$50', desc: '12×16ft slate walls, faux wood flooring',             photo: '/images/sets/cottage.webp',         gradient: 'linear-gradient(135deg, #0e1412 0%, #161e18 100%)' },
  { num: '08', slug: 'watering-hole', name: 'The Watering Hole', price: '$85', desc: '12×16×13 shallow black pool — 2hr min',               photo: '/images/sets/watering-hole.webp',   gradient: 'linear-gradient(135deg, #040e12 0%, #081820 100%)' },
  { num: '09', slug: 'studio-one',    name: 'Studio One',        price: '$75', desc: 'Large open dilapidated warehouse aesthetic, up to 5 people', photo: '/images/sets/studio-one.webp',      gradient: 'linear-gradient(135deg, #161210 0%, #1e1a16 100%)' },
]

const FAQS = [
  { q: 'Can I walk in, or do I need to book?', a: 'Made Kulture is by appointment only — there are no walk-ins. Every session is booked online in advance (at least 48 hours ahead), and the studio is only staffed when there’s a booking. Even during listed hours, we’re not open to the public without a reservation.' },
  { q: 'What is the max occupancy?', a: 'Individual sets hold up to 5 people total — that includes photographers, models, stylists, assistants, and clients. Full studio buyout allows up to 30 people.' },
  { q: 'How does overtime work?', a: 'Sessions running more than 15 minutes past your booked end time are automatically charged an additional hour. A card is required on file at booking to cover any overages.' },
  { q: 'What is your cancellation policy?', a: 'Full refund if cancelled 48+ hours before your booking start time. No refund for cancellations within 48 hours.' },
  { q: 'Can I book the studio privately?', a: 'Yes — the Full Studio Buyout gives you the entire warehouse privately. Perfect for large productions, music videos, and shoots requiring complete creative control.' },
  { q: 'Is the studio soundproofed?', a: 'No — the studio is not soundproofed and sits near I-45. For audio recording we strongly recommend a full buyout or plan accordingly.' },
  { q: 'Can I use fog or haze machines?', a: 'Special effects like fog and haze are only available during full buyouts or when your party is the only booking in the studio.' },
]

// Clean thin line-icons for the feature bar, index-mapped to the 5 tiles.
// (Falls back to the CMS icon character for any extra tiles.)
const FEATURE_ICONS = [
  (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>),
  (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>),
  (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>),
  (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/></svg>),
  (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg>),
]

export default function HomeClient({ images = {}, settings, content = {} }: { images?: SiteImages; settings?: SiteSettings; content?: PageContent }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [heroHover, setHeroHover] = useState<'primary' | 'secondary' | null>(null)
  const isMobile = useIsMobile()
  const c = content
  const tiles = parseList(c.featureTiles)

  const heroHeightVh = settings?.heroHeightVh ?? SITE_SETTINGS_DEFAULTS.heroHeightVh

  // Fixed-height hero on desktop: scale the content to fit the chosen band height
  // so the headline/buttons are never clipped, however short the band is. The
  // content is anchored bottom-left; we shrink from that corner. Mobile is left
  // untouched (flexible min-height, scale = 1).
  const heroContentRef = useRef<HTMLDivElement | null>(null)
  const [heroScale, setHeroScale] = useState(1)

  useEffect(() => {
    if (isMobile) { setHeroScale(1); return }
    const el = heroContentRef.current
    if (!el) return
    const section = el.closest('section') as HTMLElement | null
    if (!section) return

    const fit = () => {
      const cs = getComputedStyle(section)
      const padTop = parseFloat(cs.paddingTop) || 0
      const padBot = parseFloat(cs.paddingBottom) || 0
      const avail = section.clientHeight - padTop - padBot
      // offsetHeight is the natural (pre-transform) height — transforms don't
      // change layout box size, so this is stable regardless of the current scale.
      const natural = el.offsetHeight
      if (avail > 0 && natural > 0) setHeroScale(Math.min(1, avail / natural))
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(section)
    ro.observe(el)
    window.addEventListener('resize', fit)
    // Re-fit once the display font (Anton) has loaded and changed the metrics.
    ;(document as any).fonts?.ready?.then(fit).catch(() => {})
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [isMobile, heroHeightVh])

  // Max content width — everything except the full-bleed hero image is centered
  // in this column. Tune this one number to make the page narrower / wider.
  const PAGE_MAX = 1480

  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>

      {/* NAV */}
      <SiteNav active="home" />

      {/* HERO */}
      <section style={{
        position: 'relative', display: 'flex', alignItems: 'flex-end',
        ...(isMobile ? { minHeight: '85vh' } : { height: `${heroHeightVh}vh` }),
        padding: isMobile ? '96px 0 48px' : '84px 0 60px', border: 'none', overflow: 'hidden',
      }}>
        {/* Background — editable at /admin/homepage (slot: hero) */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #1a0a0a 0%, #0d0d0d 40%, #1a1208 100%)',
        }}>
          {images.hero && (
            <img src={images.hero} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center bottom' }} />
          )}
          {/* Mood/legibility scrim — anchors the headline without dimming the whole image (image stays full opacity) */}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, #080808 0%, rgba(8,8,8,0.55) 24%, rgba(8,8,8,0.15) 50%, transparent 78%)' }} />
        </div>

        {/* Coordinates (hidden on mobile to avoid overlapping the headline) */}
        {!isMobile && (
          <div style={{ position:'absolute', top:100, right:40, textAlign:'right' }}>
            <div className="label">HOUSTON / TX</div>
            <div className="label" style={{ marginTop:4 }}>29.76°N · 95.36°W</div>
          </div>
        )}

        <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:PAGE_MAX, margin:'0 auto', paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, boxSizing:'border-box' }}>
        <div ref={heroContentRef} style={{ maxWidth:700, transform: isMobile ? undefined : `scale(${heroScale})`, transformOrigin: 'left bottom' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
            <div style={{ width:40, height:1, background:'rgba(255,255,255,0.5)' }} />
            <span className="label">{c.heroEyebrow}</span>
          </div>
          <h1 style={{ fontFamily:'Anton, "Bebas Neue", sans-serif', fontSize:'clamp(84px, 17vw, 170px)', color:'#fff', marginBottom:28, lineHeight:0.9, letterSpacing:'0.005em', textTransform:'uppercase' }}>
            {nl(c.heroHeadline)}
          </h1>
          <p style={{ fontSize:16, color:'rgba(255,255,255,0.6)', lineHeight:1.6, marginBottom:40, maxWidth:420 }}>
            {nl(c.heroParagraph)}
          </p>
          <div style={{ display:'flex', gap:12, flexDirection: isMobile ? 'column' : 'row' }}>
            <Link href={c.heroPrimaryHref}
              onMouseEnter={() => setHeroHover('primary')}
              onMouseLeave={() => setHeroHover(null)}
              style={{
              display:'flex', alignItems:'center', justifyContent: isMobile ? 'space-between' : 'flex-start', gap:24,
              background: heroHover === 'secondary' ? 'transparent' : '#fff',
              color: heroHover === 'secondary' ? '#fff' : '#080808',
              border: heroHover === 'secondary' ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
              padding:'16px 24px', textDecoration:'none', transition:'background 0.25s ease, color 0.25s ease, border-color 0.25s ease',
            }}>
              <span style={{ fontFamily:'"JetBrains Mono", ui-monospace, monospace', fontSize:12, fontWeight:500, letterSpacing:'0.25em', textTransform:'uppercase' }}>{c.heroPrimaryLabel}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </Link>
            <Link href={c.heroSecondaryHref}
              onMouseEnter={() => setHeroHover('secondary')}
              onMouseLeave={() => setHeroHover(null)}
              style={{
              display:'flex', alignItems:'center', justifyContent: isMobile ? 'space-between' : 'flex-start', gap:24,
              background: heroHover === 'secondary' ? '#fff' : 'transparent',
              color: heroHover === 'secondary' ? '#080808' : '#fff',
              border: heroHover === 'secondary' ? '1px solid #fff' : '1px solid rgba(255,255,255,0.18)',
              padding:'16px 24px', textDecoration:'none', transition:'background 0.25s ease, color 0.25s ease, border-color 0.25s ease',
            }}>
              <span style={{ fontFamily:'"JetBrains Mono", ui-monospace, monospace', fontSize:12, fontWeight:500, letterSpacing:'0.25em', textTransform:'uppercase' }}>{c.heroSecondaryLabel}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </Link>
          </div>
          <div style={{ marginTop:20, fontFamily:'"JetBrains Mono", ui-monospace, monospace', fontSize:11, letterSpacing:'0.18em', color:'rgba(255,255,255,0.4)', textTransform:'uppercase' }}>
            {nl(c.heroFinePrint)}
          </div>
        </div>
        </div>
      </section>

      {/* FEATURES BAR — full-width top/bottom divider lines (border-y span to the
          screen edge); tiles stay in the centered column. gap:1 + bg draws the
          thin vertical dividers between tiles. Editable at /admin/website/pages/home */}
      <section style={{ borderTop:'1px solid rgba(255,255,255,0.1)', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ maxWidth: PAGE_MAX, margin:'0 auto', display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${Math.max(tiles.length, 1)},1fr)`, gap:1, background:'rgba(255,255,255,0.09)' }}>
          {tiles.map((f, i) => (
            <div key={i} style={{ background:'#080808', padding: isMobile ? '24px 20px' : '40px 40px' }}>
              <div style={{ marginBottom:14, color:'rgba(255,255,255,0.5)', display:'flex' }}>{FEATURE_ICONS[i] || <span style={{ fontSize:20 }}>{f.icon}</span>}</div>
              <div className="label" style={{ color:'#fff', marginBottom:10 }}>{f.title}</div>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.48)', lineHeight:1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Centered content column — the hero image above stays full-bleed ── */}
      <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', width: '100%' }}>

      {/* SETS */}
      <section style={{ padding: isMobile ? '56px 20px' : '100px 40px' }}>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: isMobile ? 40 : 64, flexWrap:'wrap', gap:24 }}>
          <div>
            <div className="label" style={{ marginBottom:20 }}>{c.setsEyebrow}</div>
            <h2 style={{ fontSize:'clamp(48px, 6vw, 88px)', color:'#fff', lineHeight:0.92 }}>
              {nl(c.setsHeading)}
            </h2>
            <div style={{ marginTop:16, fontFamily:'Inter', fontSize:13, color:'#c9b27e' }}>
              {nl(c.setsNote)}
            </div>
          </div>
          <Link href="/sets"
            onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#080808'; e.currentTarget.style.borderColor = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
            style={{ display:'inline-flex', alignItems:'center', gap:24, background:'transparent', color:'#fff', border:'1px solid rgba(255,255,255,0.25)', padding:'16px 24px', textDecoration:'none', transition:'background 0.2s ease, color 0.2s ease, border-color 0.2s ease' }}>
            <span style={{ fontFamily:'"JetBrains Mono", ui-monospace, monospace', fontSize:12, fontWeight:500, letterSpacing:'0.25em', textTransform:'uppercase' }}>VIEW ALL SETS</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </Link>
        </div>

        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: isMobile ? 8 : 10 }}>
          {SETS.map((set, i) => {
            const src = images[set.slug] || set.photo
            return (
              <Link key={i} href={`/sets/${set.slug}`}
                onMouseEnter={e => { const im = e.currentTarget.querySelector('img'); if (im) (im as HTMLImageElement).style.transform = 'scale(1.05)' }}
                onMouseLeave={e => { const im = e.currentTarget.querySelector('img'); if (im) (im as HTMLImageElement).style.transform = 'scale(1)' }}
                style={{ position:'relative', display:'block', aspectRatio:'4/5', background: set.gradient, overflow:'hidden', textDecoration:'none' }}
              >
                {/* Set image — editable at /admin/website/home (slot: set slug) */}
                <img
                  src={src} alt={set.name}
                  style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transition:'transform 0.5s ease' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.25) 42%, transparent 68%)' }} />
                <div style={{ position:'absolute', top:16, left:18, fontFamily:'Inter', fontSize:11, fontWeight:500, letterSpacing:'0.15em', color:'rgba(255,255,255,0.55)' }}>{set.num}</div>
                <div style={{ position:'absolute', left:18, right:18, bottom:18, display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:12 }}>
                  <div>
                    <div style={{ fontFamily:'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 18 : 26, color:'#fff', letterSpacing:'0.02em', lineHeight:1 }}>{set.name.toUpperCase()}</div>
                    <div style={{ fontFamily:'Inter', fontSize:11, fontWeight:500, letterSpacing:'0.12em', color:'rgba(255,255,255,0.6)', marginTop:8 }}>{set.price} / HR</div>
                  </div>
                  <span style={{ flexShrink:0, width:34, height:34, border:'1px solid rgba(255,255,255,0.4)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13 }}>↗</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* BOOKING PATHS */}
      <section style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
        <div style={{ padding:'80px 60px', display:'flex', flexDirection:'column', gap:24 }}>
          <div className="label">PATH A</div>
          <h2 style={{ fontSize:'clamp(40px, 5vw, 72px)', color:'#fff' }}>BOOK INDIVIDUAL SET</h2>
          <p style={{ fontSize:15, color:'rgba(255,255,255,0.5)', lineHeight:1.7, maxWidth:400 }}>
            Reserve a single environment for editorials, portrait shoots, product days, or anything in between. Hourly. Pay for what you need.
          </p>
          <div style={{ marginTop:'auto', paddingTop:40 }}>
            <Link href="/book?type=set" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none', borderTop:'1px solid rgba(255,255,255,0.15)', paddingTop:24 }}>
              <span className="label" style={{ color:'#fff' }}>RESERVE A SET</span>
              <span style={{ fontSize:20, color:'rgba(255,255,255,0.6)' }}>↗</span>
            </Link>
          </div>
        </div>
        <div style={{ padding:'80px 60px', background:'#fff', display:'flex', flexDirection:'column', gap:24 }}>
          <div className="label" style={{ color:'rgba(0,0,0,0.4)' }}>PATH B</div>
          <h2 style={{ fontSize:'clamp(40px, 5vw, 72px)', color:'#000' }}>FULL STUDIO TAKEOVER</h2>
          <p style={{ fontSize:15, color:'rgba(0,0,0,0.5)', lineHeight:1.7, maxWidth:400 }}>
            Take over every set, vanity room, and the open floor. Perfect for full-day productions, music videos, and lookbooks.
          </p>
          <div style={{ marginTop:'auto', paddingTop:40 }}>
            <Link href="/book?type=studio" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', textDecoration:'none', borderTop:'1px solid rgba(0,0,0,0.15)', paddingTop:24 }}>
              <span className="label" style={{ color:'#000' }}>FULL TAKEOVER</span>
              <span style={{ fontSize:20, color:'rgba(0,0,0,0.6)' }}>↗</span>
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: isMobile ? '56px 20px' : '100px 40px' }}>
        <div style={{ marginBottom:80 }}>
          <div className="label" style={{ marginBottom:20 }}>HOW IT WORKS</div>
          <h2 style={{ fontSize:'clamp(48px, 8vw, 100px)', color:'#fff' }}>FROM IDEA<br />TO IN FRAME.</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap:1, background:'rgba(255,255,255,0.06)' }}>
          {[
            { n:'01', title:'CHOOSE YOUR SPACE', desc:'Pick a single set for a focused shoot, or take the whole studio for a full-day production.' },
            { n:'02', title:'PICK YOUR WINDOW', desc:'Reserve by the hour, any day of the week. Same-day windows when available.' },
            { n:'03', title:'CONFIRM & ARRIVE', desc:'We send a code, the props list, and a load-in map. You bring the vision.' },
            { n:'04', title:'SHOOT FREELY', desc:'Lights, mirrors, backdrops, props — already in the room. Stay as long as you booked.' },
          ].map((step, i) => (
            <div key={i} style={{ background:'#080808', padding:'48px 32px' }}>
              <div className="label" style={{ marginBottom:24 }}>{step.n}</div>
              <h3 style={{ fontSize:28, color:'#fff', marginBottom:20, lineHeight:1 }}>{step.title}</h3>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.7 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BUILT FOR THE OBSESSED */}
      <section style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
        {/* Left: studio photo — editable at /admin/homepage (slot: studio-photo) */}
        <div style={{ background:'rgba(255,255,255,0.03)', minHeight:500, position:'relative', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {images['studio-photo']
            ? <img src={images['studio-photo']} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
            : <span style={{ fontSize:11, color:'rgba(255,255,255,0.15)', letterSpacing:'0.1em' }}>STUDIO PHOTO</span>}
        </div>
        {/* Right: copy */}
        <div style={{ padding:'80px 60px', display:'flex', flexDirection:'column', justifyContent:'center', gap:32 }}>
          <div className="label">FOR THE MAKERS</div>
          <h2 style={{ fontSize:'clamp(48px, 5vw, 72px)', color:'#fff' }}>BUILT FOR<br />THE OBSESSED.</h2>
          <p style={{ fontSize:15, color:'rgba(255,255,255,0.5)', lineHeight:1.8, maxWidth:440 }}>
            Photographers chasing the right window of light. Directors blocking a one-take scene. Brands shipping a season's campaign in a day. Madekulture is a quiet, considered space that gets out of your way.
          </p>
          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:1, background:'rgba(255,255,255,0.08)', marginTop:16 }}>
            {[
              { title:'PHOTOGRAPHERS', subs:'EDITORIAL · PORTRAIT · E-COMMERCE' },
              { title:'VIDEOGRAPHERS',  subs:'FILM · MUSIC VIDEOS · COMMERCIAL' },
              { title:'BRANDS',         subs:'LOOKBOOKS · CAMPAIGN · PRODUCT' },
              { title:'MODELS & TALENT',subs:'TEST SHOOTS · PORTFOLIO DAYS' },
            ].map((c, i) => (
              <div key={i} style={{ background:'#080808', padding:'24px 20px' }}>
                <div style={{ fontFamily:'Inter', fontWeight:500, fontSize:12, letterSpacing:'0.1em', color:'#fff', marginBottom:8 }}>{c.title}</div>
                <div className="label" style={{ fontSize:10 }}>{c.subs}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: isMobile ? '56px 20px' : '100px 40px' }}>
        <div style={{ textAlign:'center', marginBottom:80 }}>
          <div className="label" style={{ marginBottom:20 }}>FREQUENTLY ASKED</div>
          <h2 style={{ fontSize:'clamp(48px, 8vw, 100px)', color:'#fff' }}>THE FINE PRINT.</h2>
        </div>
        <div style={{ maxWidth:900, margin:'0 auto' }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderTop:'1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'28px 0', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
                <div style={{ display:'flex', gap:24, alignItems:'center' }}>
                  <span className="label">{String(i+1).padStart(2,'0')}</span>
                  <span style={{ fontFamily:'Inter', fontWeight:400, fontSize:18, color:'#fff' }}>{faq.q}</span>
                </div>
                <span style={{ fontSize:22, color:'rgba(255,255,255,0.4)', flexShrink:0, marginLeft:24 }}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <div style={{ padding:'0 0 28px 58px' }}>
                  <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.8, maxWidth:640 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.1)' }} />
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: isMobile ? '56px 20px' : '100px 40px' }}>
        <div className="label" style={{ marginBottom:20 }}>{c.ctaEyebrow}</div>
        <h2 style={{ fontSize:'clamp(64px, 12vw, 160px)', color:'#fff', marginBottom:60 }}>{nl(c.ctaHeading)}</h2>
        <Link href={c.ctaButtonHref} className="btn">{c.ctaButtonLabel}</Link>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop:'1px solid rgba(255,255,255,0.1)', padding:'60px 40px 40px' }}>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr', gap: isMobile ? 24 : 40, marginBottom:60 }}>
          <div>
            <div style={{ fontFamily:'Anton, "Bebas Neue", sans-serif', fontSize:22, letterSpacing:'0.05em', color:'#fff', lineHeight:1, marginBottom:20 }}>MADE<br />KULTURE</div>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', lineHeight:1.7, maxWidth:260 }}>{nl(c.footerBlurb)}</p>
          </div>
          <div>
            <div className="label" style={{ marginBottom:24 }}>STUDIO</div>
            {['Sets','Pricing','Book','Contact'].map(l => (
              <div key={l} style={{ marginBottom:14 }}>
                <Link href={`/${l.toLowerCase()}`} style={{ fontSize:14, color:'rgba(255,255,255,0.5)', textDecoration:'none' }}>{l}</Link>
              </div>
            ))}
          </div>
          <div>
            <div className="label" style={{ marginBottom:24 }}>VISIT</div>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.8 }}>
              {nl(c.footerAddress)}<br /><br />Mon — Sun · 9am–10pm<br />
              <strong style={{ color:'#c9b27e' }}>By appointment only</strong> — <span style={{ color:'rgba(255,255,255,0.5)' }}>book online in advance. No walk-ins.</span>
            </p>
          </div>
          <div>
            <div className="label" style={{ marginBottom:24 }}>CONTACT</div>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.8 }}>
              <a href={`mailto:${c.footerEmail}`} style={{ color:'rgba(255,255,255,0.5)', textDecoration:'none' }}>{c.footerEmail}</a><br />{c.footerPhone}<br /><span style={{fontSize:12}}>Text only</span>
            </p>
            <div style={{ display:'flex', gap:16, marginTop:24 }}>
              <a href="https://www.instagram.com/madekulture/" target="_blank" rel="noreferrer"
                style={{ fontSize:11, color:'#c9b27e', letterSpacing:'0.12em', textDecoration:'none' }}>INSTAGRAM ↗</a>
            </div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:24, display:'flex', justifyContent:'space-between' }}>
          <span className="label">© 2026 MADEKULTURE STUDIO</span>
          <span className="label">ALL RIGHTS RESERVED</span>
        </div>
      </footer>

      </div>
    </main>
  )
}

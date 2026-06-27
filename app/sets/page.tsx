'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavAuthLink from '@/components/NavAuthLink'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SETS = [
  {
    id: 'set-a', num: '01', name: 'Set A', price: 40, minHours: 1,
    dims: '12 × 15 ft',
    photo: '/images/sets/set-a.jpg',
    gradient: 'linear-gradient(135deg, #1c1c1c 0%, #2a2a2a 100%)',
    desc: 'White cinderblock walls meet smooth plaster in a versatile space flooded with natural light from large windows. A blank canvas that works for editorial, commercial, and portrait work alike.',
    tags: ['Cinderblock', 'Smooth Walls', 'Large Windows', 'Natural Light'],
  },
  {
    id: 'set-b', num: '02', name: 'Set B', price: 40, minHours: 1,
    dims: '12 × 14 ft',
    photo: '/images/sets/set-b.jpg',
    gradient: 'linear-gradient(135deg, #0f1a1a 0%, #1a2a1e 100%)',
    desc: 'Textured faux brush walls on one side, clean duo-color smooth walls on the other. Two distinct looks in one set — ideal for shoots that need variety without changing locations.',
    tags: ['Faux Brush Walls', 'Duo Color', 'Two Looks', 'Textured'],
  },
  {
    id: 'set-c', num: '03', name: 'Set C', price: 40, minHours: 1,
    dims: '12 × 14 ft',
    photo: '/images/sets/set-c.jpg',
    gradient: 'linear-gradient(135deg, #1a0808 0%, #2a0f0f 100%)',
    desc: 'Clean white walls anchored by a striking 8\'6\" × 20\' seamless red vinyl backdrop. When you need a bold, saturated statement background that commands the frame.',
    tags: ['White Walls', 'Red Vinyl Backdrop', '20ft Seamless', 'Bold Color'],
  },
  {
    id: 'set-d', num: '04', name: 'Set D', price: 40, minHours: 1,
    dims: '12 × 15 ft',
    photo: '/images/sets/set-d.jpg',
    gradient: 'linear-gradient(135deg, #141414 0%, #1e1e1e 100%)',
    desc: 'Raw bare cinderblock walls, a single smooth colored accent wall, and concrete floors. Gritty and industrial — perfect for streetwear, music, and anything that needs an edge.',
    tags: ['Bare Cinderblock', 'Colored Wall', 'Concrete Floor', 'Industrial'],
  },
  {
    id: 'concrete', num: '05', name: 'Concrete', price: 40, minHours: 1,
    dims: '12 × 16 ft',
    photo: '/images/sets/concrete.jpg',
    gradient: 'linear-gradient(135deg, #111418 0%, #1a1e22 100%)',
    desc: 'Faux concrete walls, a full mirror wall, and rubber black floors. The mirror opens up the space and creates unique angles — a favorite for fashion, fitness, and beauty work.',
    tags: ['Faux Concrete', 'Mirror Wall', 'Black Rubber Floor', 'Fashion'],
  },
  {
    id: 'vintage', num: '06', name: 'Vintage', price: 40, minHours: 1,
    dims: '12 × 16 ft',
    photo: '/images/sets/vintage.jpg',
    gradient: 'linear-gradient(135deg, #1a1408 0%, #261e0e 100%)',
    desc: 'A warm, character-rich aesthetic loaded with nostalgic details. Bring your retro editorial concepts, lifestyle shoots, or vintage brand campaigns to life in this one-of-a-kind set.',
    tags: ['Vintage Aesthetic', 'Warm Tones', 'Character', 'Lifestyle'],
  },
  {
    id: 'cottage', num: '07', name: 'Cottage', price: 40, minHours: 1,
    dims: '12 × 16 ft',
    photo: '/images/sets/cottage.jpg',
    gradient: 'linear-gradient(135deg, #0e1412 0%, #161e18 100%)',
    desc: 'Slate-toned walls paired with light brown faux wood flooring create a cozy, intimate atmosphere. Great for beauty brands, soft lifestyle content, and any concept that calls for warmth.',
    tags: ['Slate Walls', 'Faux Wood Floor', 'Cozy', 'Beauty'],
  },
  {
    id: 'studio-one', num: '09', name: 'Studio One', price: 65, minHours: 1,
    dims: 'Large open space',
    photo: '/images/sets/studio-one.jpg',
    gradient: 'linear-gradient(135deg, #161210 0%, #1e1a16 100%)',
    desc: 'A large open area with a raw, dilapidated warehouse aesthetic — exposed structure, weathered surfaces, and a gritty industrial atmosphere. No polish. Just character. Up to 5 people.',
    tags: ['Industrial', 'Warehouse Aesthetic', 'Open Space', 'Raw', 'Dilapidated'],
  },
]

const PREMIUM = [
  {
    id: 'watering-hole', num: '08', name: 'The Watering Hole', price: 75, minHours: 2,
    dims: '12 × 16 × 13 ft',
    photo: '/images/sets/watering-hole.jpg',
    gradient: 'linear-gradient(135deg, #040e12 0%, #081820 100%)',
    desc: 'A shallow black reflective pool with dramatic depth. Shoot in the water, on the edge, or use the surrounding space — the visual possibilities are unlike anything else in Houston. 2-hour minimum.',
    tags: ['Black Pool', 'Water Reflections', 'Dramatic', 'Unique'],
    note: '2 HR MINIMUM',
  },
]

const STUDIO = {
  id: 'studio', name: 'Full Studio Takeover', price: 400, minHours: 1,
  photo: '/images/sets/studio-one.jpg',
  gradient: 'linear-gradient(135deg, #0a0806 0%, #161210 100%)',
  desc: 'The entire warehouse is yours. All 9 sets, Studio One\'s open dilapidated industrial space, all equipment, and full creative freedom — with zero other productions on site. Built for large crews, music videos, brand campaigns, and productions that need room to breathe.',
  capacity: '30 people',
  sqft: '~10,000 sq ft',
  sets: 'All 9 sets + Studio One',
  tags: ['Full Warehouse', 'All Sets', 'Studio One', 'Private', 'Up to 30 People'],
}

// ─── Nav (shared) ─────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '24px 40px',
      background: 'linear-gradient(to bottom, rgba(8,8,8,0.95) 0%, transparent 100%)',
    }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>
          MADE<br />KULTURE
        </div>
      </Link>
      <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
        {(['HOME', 'SETS', 'BOOK'] as const).map(item => (
          <Link key={item}
            href={item === 'HOME' ? '/' : `/${item.toLowerCase()}`}
            style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: item === 'SETS' ? '#fff' : 'rgba(255,255,255,0.6)', textDecoration: 'none' }}
          >{item}</Link>
        ))}
        <NavAuthLink />
        <Link href="/book" style={{
          fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
          color: '#080808', background: '#fff', padding: '10px 20px', textDecoration: 'none',
        }}>BOOK NOW ↗</Link>
      </div>
    </nav>
  )
}

// ─── Set Card ─────────────────────────────────────────────────────────────────

function SetCard({ set, large = false }: { set: typeof SETS[0]; large?: boolean }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', flexDirection: 'column', background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}
    >
      {/* Photo / gradient */}
      <div style={{
        position: 'relative',
        aspectRatio: large ? '16/9' : '4/3',
        background: set.gradient,
        overflow: 'hidden',
      }}>
        <img
          src={set.photo}
          alt={set.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hovered ? 0.9 : 0.75, transition: 'opacity 0.4s, transform 0.6s', transform: hovered ? 'scale(1.03)' : 'scale(1)' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        {/* Gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,10,10,1) 0%, rgba(10,10,10,0.1) 60%, transparent 100%)' }} />
        {/* Set number */}
        <div style={{ position: 'absolute', top: 20, left: 24, fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)' }}>
          {set.num}
        </div>
        {/* Price */}
        <div style={{ position: 'absolute', top: 20, right: 24, fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, color: '#fff' }}>
          ${set.price}<span style={{ fontSize: 11, fontFamily: 'Inter', fontWeight: 400, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', marginLeft: 3 }}>/HR</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: large ? '32px 36px 36px' : '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: large ? 36 : 28, letterSpacing: '0.03em', color: '#fff', lineHeight: 1, marginBottom: 6 }}>
            {set.name.toUpperCase()}
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
            {set.dims}
          </div>
        </div>

        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0, flex: 1 }}>
          {set.desc}
        </p>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {set.tags.map(tag => (
            <span key={tag} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px' }}>
              {tag}
            </span>
          ))}
        </div>

        <Link href={`/book?type=set&set=${set.id}`}
          style={{
            fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
            color: '#080808', background: '#fff', padding: '12px 20px', textDecoration: 'none',
            display: 'inline-block', marginTop: 8, textAlign: 'center',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          BOOK {set.name.toUpperCase()} ↗
        </Link>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetsPage() {
  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <Nav />

      {/* Hero */}
      <section style={{ paddingTop: 160, paddingBottom: 80, paddingLeft: 40, paddingRight: 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
              <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>4825 GULF FREEWAY · HOUSTON TX</span>
            </div>
            <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(64px, 10vw, 120px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: 0 }}>
              SETS &<br />SPACES
            </h1>
          </div>
          <div style={{ maxWidth: 360 }}>
            <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 24px' }}>
              Nine distinct sets. One open warehouse. Book a single space or take over the whole studio — every set is a blank canvas styled to your vision.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link href="/book?type=set" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '12px 20px', textDecoration: 'none' }}>
                BOOK A SET ↗
              </Link>
              <Link href="/book?type=studio" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 20px', textDecoration: 'none' }}>
                FULL BUYOUT ↗
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { value: '9', label: 'DISTINCT SETS' },
          { value: '$40', label: 'STARTING / HR' },
          { value: '10K+', label: 'SQ FT TOTAL' },
          { value: '9AM–10PM', label: 'DAILY HOURS' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '32px 40px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40, color: '#fff', letterSpacing: '0.02em', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* Standard sets grid */}
      <section style={{ padding: '80px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>SHARED STUDIO — $40/HR EACH</div>
            <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px, 5vw, 60px)', color: '#fff', letterSpacing: '0.02em', margin: 0 }}>INDIVIDUAL SETS</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2, background: 'rgba(255,255,255,0.04)' }}>
            {SETS.map(set => (
              <SetCard key={set.id} set={set} />
            ))}
          </div>

          <div style={{ marginTop: 16, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
            Each set includes one Amaran 200x LED light. Additional lights available for $25/each. Up to 5 people per set.
          </div>
        </div>
      </section>

      {/* The Watering Hole — featured */}
      {PREMIUM.map(set => (
        <section key={set.id} style={{ padding: '0 40px 80px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>PREMIUM SET — ${set.price}/HR · {set.note}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: 'rgba(255,255,255,0.04)', minHeight: 480 }}>
              {/* Photo side */}
              <div style={{ position: 'relative', background: set.gradient, overflow: 'hidden', minHeight: 400 }}>
                <img src={set.photo} alt={set.name}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 60%, rgba(10,10,10,0.6) 100%)' }} />
                <div style={{ position: 'absolute', top: 24, left: 28, fontFamily: 'Bebas Neue, sans-serif', fontSize: 13, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>{set.num}</div>
              </div>
              {/* Info side */}
              <div style={{ background: '#0a0a0a', padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 48, color: '#fff', letterSpacing: '0.02em', lineHeight: 0.95 }}>
                  {set.name.toUpperCase()}
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)' }}>{set.dims}</div>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0 }}>{set.desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {set.tags.map(tag => (
                    <span key={tag} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px' }}>{tag}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40, color: '#fff' }}>${set.price}</span>
                  <span style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>/HR · 2 HR MIN</span>
                </div>
                <Link href={`/book?type=set&set=${set.id}`}
                  style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '14px 24px', textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}>
                  BOOK THE WATERING HOLE ↗
                </Link>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Full Studio Takeover */}
      <section style={{ padding: '0 40px 100px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>FULL WAREHOUSE — $400 FLAT RATE</div>
          </div>
          <div style={{ position: 'relative', background: STUDIO.gradient, overflow: 'hidden', minHeight: 520 }}>
            <img src={STUDIO.photo} alt="Full Studio"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,8,8,0.98) 0%, rgba(8,8,8,0.5) 50%, rgba(8,8,8,0.2) 100%)' }} />

            <div style={{ position: 'relative', zIndex: 1, padding: '64px 56px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'end', minHeight: 520 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(48px, 7vw, 88px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em' }}>
                  FULL STUDIO<br />TAKEOVER
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, margin: 0 }}>
                  {STUDIO.desc}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {[
                    { label: 'CAPACITY', value: STUDIO.capacity },
                    { label: 'SPACE', value: STUDIO.sqft },
                    { label: 'INCLUDES', value: STUDIO.sets },
                    { label: 'RATE', value: '$400 flat' },
                  ].map(d => (
                    <div key={d.label}>
                      <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>{d.label}</div>
                      <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff' }}>{d.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {STUDIO.tags.map(tag => (
                    <span key={tag} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 8px' }}>{tag}</span>
                  ))}
                </div>
                <Link href="/book?type=studio"
                  style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '14px 24px', textDecoration: 'none', display: 'inline-block', textAlign: 'center', marginTop: 4 }}>
                  BOOK THE FULL STUDIO ↗
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '40px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
          All bookings require 48hr advance notice. Cancellations within 48hrs are non-refundable.
          <br />
          Text us at (832) 408-1631 with questions.
        </div>
        <Link href="/book" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '12px 24px', textDecoration: 'none' }}>
          BOOK NOW
        </Link>
      </section>
    </main>
  )
}

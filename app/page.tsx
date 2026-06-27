'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavAuthLink from '@/components/NavAuthLink'

const SETS = [
  { num: '01', name: 'Set A',             price: '$40', desc: '12×15ft white cinderblock walls, large windows',      photo: '/images/sets/set-a.jpg',           gradient: 'linear-gradient(135deg, #1c1c1c 0%, #2a2a2a 100%)' },
  { num: '02', name: 'Set B',             price: '$40', desc: '12×14ft faux brush walls, duo color smooth walls',    photo: '/images/sets/set-b.jpg',           gradient: 'linear-gradient(135deg, #0f1a1a 0%, #1a2a1e 100%)' },
  { num: '03', name: 'Set C',             price: '$40', desc: '12×14ft white walls, 20ft red vinyl backdrop',        photo: '/images/sets/set-c.jpg',           gradient: 'linear-gradient(135deg, #1a0808 0%, #2a0f0f 100%)' },
  { num: '04', name: 'Set D',             price: '$40', desc: '12×15ft bare cinderblock, concrete floor',            photo: '/images/sets/set-d.jpg',           gradient: 'linear-gradient(135deg, #141414 0%, #1e1e1e 100%)' },
  { num: '05', name: 'Concrete',          price: '$40', desc: '12×16ft faux concrete walls, mirror wall',            photo: '/images/sets/concrete.jpg',        gradient: 'linear-gradient(135deg, #111418 0%, #1a1e22 100%)' },
  { num: '06', name: 'Vintage',           price: '$40', desc: '12×16ft vintage aesthetic',                           photo: '/images/sets/vintage.jpg',         gradient: 'linear-gradient(135deg, #1a1408 0%, #261e0e 100%)' },
  { num: '07', name: 'Cottage',           price: '$40', desc: '12×16ft slate walls, faux wood flooring',             photo: '/images/sets/cottage.jpg',         gradient: 'linear-gradient(135deg, #0e1412 0%, #161e18 100%)' },
  { num: '08', name: 'The Watering Hole', price: '$75', desc: '12×16×13 shallow black pool — 2hr min',               photo: '/images/sets/watering-hole.jpg',   gradient: 'linear-gradient(135deg, #040e12 0%, #081820 100%)' },
  { num: '09', name: 'Studio One',        price: '$65', desc: 'Large open dilapidated warehouse aesthetic, up to 5 people', photo: '/images/sets/studio-one.jpg',      gradient: 'linear-gradient(135deg, #161210 0%, #1e1a16 100%)' },
]

const FAQS = [
  { q: 'What is the max occupancy?', a: 'Individual sets hold up to 5 people total — that includes photographers, models, stylists, assistants, and clients. Full studio buyout allows up to 30 people.' },
  { q: 'How does overtime work?', a: 'Sessions running more than 15 minutes past your booked end time are automatically charged an additional hour. A card is required on file at booking to cover any overages.' },
  { q: 'What is your cancellation policy?', a: 'Full refund if cancelled 48+ hours before your booking start time. No refund for cancellations within 48 hours.' },
  { q: 'Can I book the studio privately?', a: 'Yes — the Full Studio Buyout gives you the entire warehouse privately. Perfect for large productions, music videos, or events requiring complete creative control.' },
  { q: 'Is the studio soundproofed?', a: 'No — the studio is not soundproofed and sits near I-45. For audio recording we strongly recommend a full buyout or plan accordingly.' },
  { q: 'Can I use fog or haze machines?', a: 'Special effects like fog and haze are only available during full buyouts or when your party is the only booking in the studio.' },
]

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>

      {/* NAV */}
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
          {['HOME','SETS','STUDIO RULES','AVAILABILITY','BOOK'].map(item => (
            <Link key={item} href={item === 'HOME' ? '/' : `/${item.toLowerCase().replace(/ /g, '-')}`}
              style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            >{item}</Link>
          ))}
          <NavAuthLink />
          <Link href="/book" className="btn" style={{ padding: '10px 20px', fontSize: 11 }}>
            BOOK NOW ↗
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: 'relative', height: '100vh', display: 'flex', alignItems: 'flex-end',
        padding: '0 40px 80px', border: 'none', overflow: 'hidden',
      }}>
        {/* Background — replace src with real studio photo */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #1a0a0a 0%, #0d0d0d 40%, #1a1208 100%)',
        }}>
          {/* <img src="/images/hero.jpg" alt="" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.6 }} /> */}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(8,8,8,1) 0%, rgba(8,8,8,0.3) 60%, transparent 100%)' }} />
        </div>

        {/* Coordinates */}
        <div style={{ position:'absolute', top:100, right:40, textAlign:'right' }}>
          <div className="label">HOUSTON / TX</div>
          <div className="label" style={{ marginTop:4 }}>29.76°N · 95.36°W</div>
        </div>

        <div style={{ position:'relative', zIndex:1, maxWidth:700 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
            <div style={{ width:40, height:1, background:'rgba(255,255,255,0.5)' }} />
            <span className="label">A CREATIVE SPACE DESIGNED FOR VISIONARIES</span>
          </div>
          <h1 style={{ fontSize:'clamp(80px, 14vw, 160px)', color:'#fff', marginBottom:32 }}>
            CREATE<br />WITHOUT<br />LIMITS
          </h1>
          <p style={{ fontSize:16, color:'rgba(255,255,255,0.6)', lineHeight:1.6, marginBottom:40, maxWidth:420 }}>
            Madekulture is a multi-set creative studio built for photographers, videographers, brands, and creators. Bring your ideas to life.
          </p>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <Link href="/book?type=set" className="btn">BOOK A SET ↗</Link>
            <Link href="/book?type=studio" className="btn btn-ghost">BOOK THE STUDIO ↗</Link>
          </div>
        </div>
      </section>

      {/* FEATURES BAR */}
      <section style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)' }}>
        {[
          { icon:'⊞', title:'MULTIPLE SETS', desc:'Centrally located 4825 Gulf Fwy. Houston TX 77023' },
          { icon:'◎', title:'PRIVATE OR SHARED', desc:'Book a single set or take over the studio.' },
          { icon:'◷', title:'FLEXIBLE HOURS', desc:'By the hour. Stay as long as you need.' },
          { icon:'◈', title:'PROPS & EQUIPMENT', desc:'Everything on hand. Nothing to lug in.' },
          { icon:'◉', title:'EASY ACCESS', desc:'Centrally located in Houston, TX.' },
        ].map((f, i) => (
          <div key={i} style={{ padding:'40px 28px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
            <div style={{ fontSize:20, marginBottom:16, color:'rgba(255,255,255,0.4)' }}>{f.icon}</div>
            <div className="label" style={{ color:'#fff', marginBottom:10 }}>{f.title}</div>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* SETS */}
      <section style={{ padding:'100px 40px' }}>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:64 }}>
          <div>
            <div className="label" style={{ marginBottom:20 }}>EXPLORE OUR SETS</div>
            <h2 style={{ fontSize:'clamp(48px, 7vw, 90px)', color:'#fff', lineHeight:0.9 }}>
              MULTIPLE SETS.<br />ENDLESS POSSIBILITIES.
            </h2>
          </div>
          <Link href="/sets" className="btn">VIEW ALL SETS ↗</Link>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:1, background:'rgba(255,255,255,0.06)' }}>
          {SETS.map((set, i) => (
            <div key={i} style={{
              background:'#080808', padding:'32px 28px', cursor:'pointer',
              transition:'background 0.2s',
              display:'flex', flexDirection:'column', gap:12,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#111')}
              onMouseLeave={e => (e.currentTarget.style.background = '#080808')}
            >
              {/* Set image */}
              <div style={{ width:'100%', aspectRatio:'4/3', background: set.gradient, marginBottom:8, position:'relative', overflow:'hidden' }}>
                <img
                  src={set.photo} alt={set.name}
                  style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
                <div style={{ position:'absolute', bottom:12, left:14, fontFamily:'Bebas Neue, sans-serif', fontSize:13, letterSpacing:'0.12em', color:'rgba(255,255,255,0.18)' }}>{set.name.toUpperCase()}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span className="label" style={{ color:'rgba(255,255,255,0.3)' }}>{set.num}</span>
                <span style={{ fontSize:11, fontFamily:'Inter', fontWeight:500, letterSpacing:'0.1em', color:'rgba(255,255,255,0.5)' }}>{set.price} / HR</span>
              </div>
              <div style={{ fontFamily:'Bebas Neue, sans-serif', fontSize:28, color:'#fff', letterSpacing:'0.02em' }}>{set.name.toUpperCase()}</div>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>{set.desc}</p>
              <div style={{ marginTop:'auto', paddingTop:16 }}>
                <span style={{ fontSize:11, fontFamily:'Inter', fontWeight:500, letterSpacing:'0.15em', color:'rgba(255,255,255,0.4)' }}>BOOK THIS SET ↗</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BOOKING PATHS */}
      <section style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
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
            Take over every set, vanity room, and the open floor. Perfect for full-day productions, music videos, lookbooks, and private events.
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
      <section style={{ padding:'100px 40px' }}>
        <div style={{ marginBottom:80 }}>
          <div className="label" style={{ marginBottom:20 }}>HOW IT WORKS</div>
          <h2 style={{ fontSize:'clamp(48px, 8vw, 100px)', color:'#fff' }}>FROM IDEA<br />TO IN FRAME.</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:1, background:'rgba(255,255,255,0.06)' }}>
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
      <section style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
        {/* Left: image placeholder */}
        <div style={{ background:'rgba(255,255,255,0.03)', minHeight:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.15)', letterSpacing:'0.1em' }}>STUDIO PHOTO</span>
        </div>
        {/* Right: copy */}
        <div style={{ padding:'80px 60px', display:'flex', flexDirection:'column', justifyContent:'center', gap:32 }}>
          <div className="label">FOR THE MAKERS</div>
          <h2 style={{ fontSize:'clamp(48px, 5vw, 72px)', color:'#fff' }}>BUILT FOR<br />THE OBSESSED.</h2>
          <p style={{ fontSize:15, color:'rgba(255,255,255,0.5)', lineHeight:1.8, maxWidth:440 }}>
            Photographers chasing the right window of light. Directors blocking a one-take scene. Brands shipping a season's campaign in a day. Madekulture is a quiet, considered space that gets out of your way.
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'rgba(255,255,255,0.08)', marginTop:16 }}>
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
      <section style={{ padding:'100px 40px' }}>
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
      <section style={{ padding:'100px 40px' }}>
        <div className="label" style={{ marginBottom:20 }}>MADEKULTURE / HOUSTON</div>
        <h2 style={{ fontSize:'clamp(64px, 12vw, 160px)', color:'#fff', marginBottom:60 }}>LET'S<br />MAKE IT.</h2>
        <Link href="/book" className="btn">BOOK THE STUDIO ↗</Link>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop:'1px solid rgba(255,255,255,0.1)', padding:'60px 40px 40px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:40, marginBottom:60 }}>
          <div>
            <div style={{ fontFamily:'Bebas Neue, sans-serif', fontSize:22, letterSpacing:'0.05em', color:'#fff', lineHeight:1, marginBottom:20 }}>MADE<br />KULTURE</div>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', lineHeight:1.7, maxWidth:260 }}>A multi-set creative studio in Houston built for photographers, videographers, brands, and creators.</p>
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
              4825 Gulf Fwy.<br />Houston, TX 77023<br /><br />Mon — Sun · 9am–10pm
            </p>
          </div>
          <div>
            <div className="label" style={{ marginBottom:24 }}>CONTACT</div>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', lineHeight:1.8 }}>
              teddytran@madekulture.com<br />(832) 408-1631<br /><span style={{fontSize:12}}>Text only</span>
            </p>
            <div style={{ display:'flex', gap:16, marginTop:24 }}>
              <a href="https://www.instagram.com/madekulture/" target="_blank" rel="noreferrer"
                style={{ fontSize:11, color:'rgba(255,255,255,0.4)', letterSpacing:'0.1em', textDecoration:'none' }}>IG</a>
            </div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:24, display:'flex', justifyContent:'space-between' }}>
          <span className="label">© 2026 MADEKULTURE STUDIO</span>
          <span className="label">ALL RIGHTS RESERVED</span>
        </div>
      </footer>

    </main>
  )
}

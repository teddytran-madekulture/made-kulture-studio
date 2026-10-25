// /nomad — Made Kulture Nomad, the member creative-travel program (Mexico City
// first). UNLISTED on purpose (2026-10-25): not in nav, not in the sitemap,
// noindex. Teddy shares the link by hand while the program is still being
// shaped, so the copy and pricing here are a working draft, labelled as such.
import type { Metadata } from 'next'
import SiteNav from '@/components/SiteNav'
import NomadInterestForm from './NomadInterestForm'

export const metadata: Metadata = {
  title: 'Nomad — a home base to shoot in Mexico City',
  description: 'A small, vetted group of creatives sharing a live-and-shoot home in Mexico City. Founding group forming now.',
  robots: { index: false, follow: false },
}

const MONO = '"JetBrains Mono", ui-monospace, monospace'
const DISPLAY = 'Anton, "Bebas Neue", sans-serif'
const GOLD = '#c9b27e'
const MUTED = 'rgba(255,255,255,0.6)'
const LINE = '1px solid rgba(255,255,255,0.08)'

// PLACEHOLDER images (2026-10-25): AI-generated in Teddy's Higgsfield account and
// hotlinked from their CDN. Swap for real photos (public/images/nomad/) before
// this page is shared widely — a hotlink can disappear if the account changes.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3FUsRXGFWAHC68DWhd8lIOHljA2/'
const HERO_IMG = CDN + 'hf_20261025_200140_930ceb49-3a77-4375-aa84-d5750271e4d7.png'
const GALLERY = [
  [CDN + 'hf_20261025_200141_74b0b66d-df0b-4104-9e0e-6b9f49a4556a.png', 'The studio room'],
  [CDN + 'hf_20261025_200140_0b5df372-b083-4d0f-8dc0-7ca3acafbd96.png', 'Shooting in the streets'],
  [CDN + 'hf_20261025_200139_13e53d77-19b4-4657-8632-8e9883a260fa.png', 'Evenings on the roof'],
  [CDN + 'hf_20261025_200140_49d52c09-3692-4b6b-a646-a0a8d1dd90e1.png', 'Bellas Artes, a short ride away'],
]

const STEPS = [
  ['Apply', 'Tell us what you shoot or create. Spots are limited and we review every application. When the group is full, you go on the waitlist and we reach out when a spot opens.'],
  ['Join the group', 'Members pay a monthly membership that keeps the house running, whether you travel that month or not.'],
  ['Book a stay', 'Pick your dates on the shared calendar. Stays run up to 10 nights, with at most two members in the house at a time.'],
  ['Shoot and connect', 'The studio room is set up and ready. Our host in the city helps you get settled, find your way around, and meet local creatives.'],
]

const INCLUDED = [
  ['A private room', 'Your own bedroom in a shared home, in a neighborhood picked for safety and easy access.'],
  ['An in-house studio', 'A dedicated shooting room with a seamless backdrop setup that stays up. No moving beds to shoot.'],
  ['A host on the ground', 'Someone who lives there, handles check-in and the house, and knows the city.'],
  ['Travel with friends', 'Reserve a stay and choose who can see it. The members you pick can join you, so you split the ride, share the house and shoot together.'],
  ['Secure gear storage', 'A locked space for cameras and kit, and a building chosen with gear in mind.'],
  ['Made Kulture Plus, included', 'Plus perks at the Houston studio for as long as you’re a Nomad member: short-notice booking and cancellation protection.'],
]

const WHO = ['Photographers', 'Models', 'Makeup artists', 'Hair stylists', 'Wardrobe stylists', 'Videographers']

const RULES = [
  'Stays open 60 days ahead. One upcoming stay at a time until your next one is 14 days out.',
  'Up to 10 nights per stay, and at most 2 members in the house at once, one per room. Keep a stay private, or let members you choose join you.',
  'The studio books in 4-hour blocks. Shoots run 10 am to 9 pm.',
  'Every model or collaborator is registered with the host the day before. Up to 4 visitors at a time, and no overnight guests.',
  'Reset the studio when your block ends. The cleaning between stays is included.',
]

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase', marginBottom: 28 }}>
      {children}
    </div>
  )
}

const section: React.CSSProperties = { padding: 'clamp(52px, 8vw, 96px) clamp(20px, 4vw, 40px)', borderBottom: LINE }
const wrap: React.CSSProperties = { maxWidth: 1180, margin: '0 auto' }
const card: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.1)', padding: 24, background: 'rgba(255,255,255,0.02)' }

export default function NomadPage() {
  return (
    <main style={{ background: '#080808', minHeight: 'var(--vh-full)', color: '#fff' }}>
      <SiteNav />

      {/* Hero */}
      <section style={{ padding: 'clamp(104px, 14vw, 168px) clamp(20px, 4vw, 40px) clamp(48px, 7vw, 84px)', borderBottom: LINE, position: 'relative', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HERO_IMG} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(8,8,8,0.92) 0%, rgba(8,8,8,0.7) 45%, rgba(8,8,8,0.25) 100%), linear-gradient(0deg, #080808 0%, transparent 35%)', pointerEvents: 'none' }} />
        <div style={{ ...wrap, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(201,178,126,0.6)' }} />
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase' }}>Made Kulture Nomad · Mexico City</span>
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 'clamp(54px, 10vw, 128px)', lineHeight: 0.9, textTransform: 'uppercase', margin: '0 0 28px', maxWidth: 1050 }}>
            A home base<br />to shoot in<br />Mexico City.
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 'clamp(15px, 1.4vw, 17px)', color: MUTED, lineHeight: 1.7, maxWidth: 620, margin: '0 0 32px' }}>
            A small, vetted group of creatives sharing one live-and-shoot home. Come down for a week, stay in your own room, shoot in the studio downstairs, and build a network in a city full of fashion, architecture and light. <strong style={{ color: GOLD }}>Spots are limited. The founding group is forming now.</strong>
          </p>
          <a href="#apply" style={{ display: 'inline-block', background: GOLD, color: '#080808', padding: '15px 24px', textDecoration: 'none', fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            Apply for a spot →
          </a>
        </div>
      </section>

      {/* The city (placeholder photos) */}
      <section style={{ padding: 'clamp(20px, 3vw, 32px) clamp(20px, 4vw, 40px)', borderBottom: LINE }}>
        <div style={{ ...wrap, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {GALLERY.map(([src, cap]) => (
            <figure key={src} style={{ margin: 0, position: 'relative', aspectRatio: '4 / 5', overflow: 'hidden', background: '#111' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={cap} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <figcaption style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 14px 12px', background: 'linear-gradient(0deg, rgba(0,0,0,0.75), transparent)', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>{cap}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={section}>
        <div style={wrap}>
          <Eyebrow>How it works</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {STEPS.map(([t, d], i) => (
              <div key={t} style={card}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: GOLD, letterSpacing: '0.18em', marginBottom: 14 }}>0{i + 1}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 26, textTransform: 'uppercase', marginBottom: 10 }}>{t}</div>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: MUTED, lineHeight: 1.65, margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section style={section}>
        <div style={wrap}>
          <Eyebrow>What members get</Eyebrow>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.08)' }}>
            {INCLUDED.map(([t, d]) => (
              <div key={t} style={{ background: '#080808', padding: '26px 24px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t}</div>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: MUTED, lineHeight: 1.65, margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginRight: 6 }}>Built for</span>
            {WHO.map(w => (
              <span key={w} style={{ border: '1px solid rgba(201,178,126,0.35)', color: GOLD, padding: '7px 12px', fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{w}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={section}>
        <div style={{ ...wrap, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 40, alignItems: 'start' }}>
          <div>
            <Eyebrow>Planned pricing</Eyebrow>
            <h2 style={{ fontFamily: DISPLAY, fontSize: 'clamp(36px, 5vw, 60px)', textTransform: 'uppercase', lineHeight: 0.95, margin: '0 0 20px' }}>
              Pay for the house.<br />Pay for your nights.
            </h2>
            <p style={{ fontFamily: 'Inter', fontSize: 15, color: MUTED, lineHeight: 1.7, margin: 0, maxWidth: 480 }}>
              A monthly membership covers the home, the studio and the host. A nightly rate when you stay keeps it fair between members who travel often and members who come down a few times a year.
            </p>
          </div>
          <div style={{ ...card, padding: 32, borderColor: 'rgba(201,178,126,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 64, lineHeight: 1 }}>$150</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: '0.12em' }}>/ MONTH</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: MUTED, marginBottom: 22 }}>membership</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 44, lineHeight: 1 }}>+ $35</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: '0.12em' }}>/ NIGHT</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: MUTED, marginBottom: 18 }}>when you stay, including studio time</div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', color: GOLD, textTransform: 'uppercase', marginBottom: 26 }}>Includes Made Kulture Plus</div>
            <p style={{ fontFamily: 'Inter', fontSize: 12.5, color: 'rgba(255,255,255,0.42)', lineHeight: 1.6, margin: 0, borderTop: LINE, paddingTop: 18 }}>
              Planned pilot pricing for the founding group. Final pricing is set before the first stay. Nothing is charged to apply.
            </p>
          </div>
        </div>
      </section>

      {/* House rules */}
      <section style={section}>
        <div style={{ ...wrap, maxWidth: 820 }}>
          <Eyebrow>How the house runs</Eyebrow>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {RULES.map((r, i) => (
              <li key={i} style={{ display: 'flex', gap: 18, padding: '18px 0', borderBottom: LINE, fontFamily: 'Inter', fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: GOLD, paddingTop: 4 }}>0{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginTop: 20 }}>
            Draft rules. They&rsquo;ll be shaped with the founding group.
          </p>
        </div>
      </section>

      {/* Apply */}
      <section id="apply" style={{ ...section, borderBottom: 'none', scrollMarginTop: 80 }}>
        <div style={{ ...wrap, maxWidth: 720 }}>
          <Eyebrow>Apply</Eyebrow>
          <h2 style={{ fontFamily: DISPLAY, fontSize: 'clamp(36px, 5vw, 60px)', textTransform: 'uppercase', lineHeight: 0.95, margin: '0 0 16px' }}>
            Apply for a spot
          </h2>
          <p style={{ fontFamily: 'Inter', fontSize: 15, color: MUTED, lineHeight: 1.7, margin: '0 0 36px' }}>
            Nomad is capped so the house never gets crowded. We&rsquo;re reviewing applications for the founding group now. If it&rsquo;s full, you&rsquo;ll go on the waitlist and we&rsquo;ll reach out when a spot opens.
          </p>
          <NomadInterestForm />
        </div>
      </section>
    </main>
  )
}

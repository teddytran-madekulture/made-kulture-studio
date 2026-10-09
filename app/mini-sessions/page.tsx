// /mini-sessions — the public "run your mini sessions at Made Kulture" page.
// Linked from the footer of every photographer's sign-up page, so the people
// who land here are often a photographer's clients — or other photographers.
import type { Metadata } from 'next'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'

export const metadata: Metadata = {
  title: 'Mini Sessions — run your mini days in Houston',
  description: 'Book a set or the whole warehouse, share one sign-up link, and let your clients pick their own times. Made Kulture keeps the day organized — you keep every dollar.',
}

const MONO = '"JetBrains Mono", ui-monospace, monospace'
const GOLD = '#c9b27e'

const STEPS = [
  ['Book your time', 'Reserve a set or the full warehouse for the block you want to shoot. Not sure you’ll fill it? Plan the day first and see who signs up before you book.'],
  ['Share one link', 'Pick a slot length and a break. You get a sign-up page with your cover photo, a ready-to-post flyer with a QR code, and a link that unfurls like a flyer when you text it.'],
  ['Clients pick their time', 'They choose an open slot, say how many are coming, and get a confirmation, a reminder the morning of, and a page to switch or cancel.'],
  ['Shoot the day', 'Your roster shows who’s next, who’s checked in, and who’s bringing who. Everyone waits outside until their slot, so the set stays within its headcount.'],
]

const PERKS = [
  'You collect payment — add your Venmo, Cash App, PayPal, Square or Stripe link and clients get a “Pay” button. We never touch the money.',
  'Headcount handled — party sizes are capped to what your booking allows, with an option for bigger family groups.',
  'Time changes your way — let clients switch slots instantly, or approve each one.',
  'Reminders and updates — clients get emails (and texts if they opt in). If your booking moves, everyone is told their new time.',
  'Message everyone at once — running late or a change of plans? One note reaches the whole roster.',
  'Private by design — clients are never in our directory, and their contact details are cleared 90 days after the day.',
]

export default function MiniSessionsPage() {
  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <section style={{ padding: 'clamp(104px, 14vw, 168px) clamp(20px, 4vw, 40px) clamp(48px, 7vw, 84px)', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1100px 500px at 15% -10%, rgba(201,178,126,0.12), transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1180, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(201,178,126,0.6)' }} />
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase' }}>For photographers</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(54px, 10vw, 128px)', lineHeight: 0.9, textTransform: 'uppercase', margin: '0 0 28px', maxWidth: 1000 }}>
            Run your<br />mini sessions here.
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 'clamp(15px, 1.4vw, 17px)', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, maxWidth: 600, margin: '0 0 32px' }}>
            Book a block at Made Kulture, share one sign-up link, and let your clients pick their own times. We keep the day organized and the set within its headcount. <strong style={{ color: GOLD }}>You set the price and keep every dollar</strong> — it’s free with your booking.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/account/minis" style={{ display: 'inline-block', background: GOLD, color: '#080808', padding: '15px 24px', textDecoration: 'none', fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Start a mini day →</Link>
            <Link href="/book" style={{ display: 'inline-block', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '14px 22px', textDecoration: 'none', fontFamily: MONO, fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}>See sets & times</Link>
          </div>
        </div>
      </section>

      <section style={{ padding: 'clamp(52px, 8vw, 96px) clamp(20px, 4vw, 40px)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase', marginBottom: 28 }}>How it works</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {STEPS.map(([t, d], i) => (
              <div key={t} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: '28px 24px' }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: GOLD, marginBottom: 14 }}>0{i + 1}</div>
                <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, lineHeight: 1, textTransform: 'uppercase', margin: '0 0 12px', fontWeight: 400 }}>{t}</h2>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px, 4vw, 40px) clamp(64px, 9vw, 120px)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(28px, 5vw, 64px)', alignItems: 'start' }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase', marginBottom: 18 }}>What you get</div>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 0.92, textTransform: 'uppercase', margin: 0, fontWeight: 400 }}>
              Less texting.<br />More shooting.
            </h2>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {PERKS.map(p => (
              <li key={p} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18, fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                <span style={{ marginTop: 8, width: 6, height: 6, flexShrink: 0, background: GOLD, transform: 'rotate(45deg)' }} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: 'clamp(48px, 7vw, 80px) clamp(20px, 4vw, 40px)', textAlign: 'center' }}>
        <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px' }}>
          Made Kulture · 4825 Gulf Freeway, Houston TX · 10 sets under one roof, 9 AM – 10 PM daily
        </p>
        <Link href="/account/minis" style={{ display: 'inline-block', background: GOLD, color: '#080808', padding: '15px 24px', textDecoration: 'none', fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Start a mini day →</Link>
      </section>
    </main>
  )
}

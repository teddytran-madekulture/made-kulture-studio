'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavAuthLink from '@/components/NavAuthLink'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

const SECTIONS = [
  {
    title: 'BOOKING',
    items: [
      {
        q: 'How far in advance do I need to book?',
        a: 'All bookings must be made at least 48 hours in advance. A card on file is required at checkout to cover any session overages.',
      },
      {
        q: 'What is the cancellation policy?',
        a: 'You may cancel or reschedule up to 48 hours before your session start time for a full refund, including all fees. Cancellations made less than 48 hours before your session are non-refundable.',
      },
      {
        q: 'Can I arrive early?',
        a: 'You and your guests may arrive up to 15 minutes before your session start time. All setup, shooting, and breakdown must be completed within your booked hours — early arrival does not extend your time.',
      },
      {
        q: 'Can I book outside of business hours?',
        a: 'Yes. Outside-hours bookings are available upon request and are billed at the full warehouse rate. Overages that run past closing time are also charged at the full warehouse rate.',
      },
      {
        q: 'Can I add more time during my session?',
        a: 'Yes — if no booking immediately follows yours on that set, you can extend your session on the spot. Additional time is charged at the standard hourly rate for your set.',
      },
    ],
  },
  {
    title: 'GUEST LIMITS',
    items: [
      {
        q: 'How many people can I bring?',
        a: 'Individual set bookings allow up to 5 people total. This includes everyone in your party — photographers, videographers, models, stylists, makeup artists, hair stylists, wardrobe stylists, talent, clients, friends, family, and children. No exceptions.',
      },
      {
        q: 'What is the limit for a full studio buyout?',
        a: 'Full studio buyouts allow up to 30 people on the premises at one time.',
      },
      {
        q: 'What if I need more people than my set allows?',
        a: 'You can book multiple sets simultaneously, which increases your total headcount allowance and gives you access to more space and lighting. Or you can upgrade to a full studio buyout for the most flexibility.',
      },
      {
        q: 'Can extra people wait outside my set?',
        a: 'No. Extra guests are not permitted anywhere on the premises, even if they are not actively on the set. If your party exceeds the limit, you will need to remove guests or upgrade your booking.',
      },
    ],
  },
  {
    title: 'YOUR SET',
    items: [
      {
        q: 'What does my set booking include?',
        a: 'Each set comes with one Amaran 200x LED light. Additional lights can be added for $25 each. Props are available on a first-come, first-served basis during shared studio hours and are included with your standard rental.',
      },
      {
        q: 'Can I switch sets during my session?',
        a: 'No. Your reservation is for the specific set you booked. If you need multiple sets, you must book them at the same time or upgrade to a full studio buyout.',
      },
      {
        q: 'Do I need to clean up before I leave?',
        a: 'Yes. All props and support equipment must be returned to their original locations before your session ends. The space should be left the way you found it for the next booking.',
      },
      {
        q: 'What if I go over my time?',
        a: 'Overages past 15 minutes are automatically charged an additional full hour at your set rate.',
      },
    ],
  },
  {
    title: 'STUDIO RULES',
    items: [
      {
        q: 'Studio etiquette',
        a: 'Made Kulture is a shared creative space. Be respectful of other productions in the studio — do not disturb anyone who prefers privacy during their session. Keep noise at a reasonable level during shared hours.',
      },
      {
        q: 'Is nudity allowed?',
        a: 'Nudity is not permitted during shared studio hours unless your party is the only booking in the studio at that time. Cover up while moving through common areas. For guaranteed privacy, consider a full studio buyout.',
      },
      {
        q: 'Can I record audio?',
        a: 'The studio is not soundproofed and sits near the I-45 freeway. During shared hours, we cannot control noise from fans, other bookings, or ambient traffic. For audio recording, a full studio buyout is strongly recommended.',
      },
      {
        q: 'Are children allowed?',
        a: 'Children are allowed, but keep in mind this is an active shared space. Other productions on-site during shared hours may not always be appropriate for young audiences, and warehouse conditions may not be suitable for small children. Children count toward your guest limit.',
      },
      {
        q: 'What is the messy concept and cleaning fee policy?',
        a: 'Messy concepts — including paint, fake blood, glitter, excessive oils, waxes, smoke bombs, and similar materials — must be pre-approved before your session. Failure to clean up or comply with these rules will result in a minimum $150 cleaning charge.',
      },
      {
        q: 'Can I use fog machines, haze, or special effects?',
        a: 'Atmospheric effects (fog, haze, smoke bombs, etc.) are not permitted during shared studio bookings. They are available for full studio buyouts and solo bookings only. Studio blackout for controlled lighting or projector use follows the same rule — primarily available for buyouts or solo bookings.',
      },
      {
        q: 'Can I use the additional lights on another set?',
        a: 'No. Additional lights must stay within your booked set. Taking lights from a closed-off set without permission will result in an automatic charge. You will not be notified in advance — the charge is applied directly.',
      },
    ],
  },
  {
    title: 'PARKING & ACCESS',
    items: [
      {
        q: 'Where do I park?',
        a: 'There is limited parking at the front of the building. Additional street parking is available in the rear.',
      },
      {
        q: 'Can I drive into the back to access Studio One?',
        a: 'Only taller vehicles — standard-height trucks, SUVs, and vans without tow hitches — can navigate the steep rear ramp without undercarriage damage. Low-clearance vehicles should park at the front or on the street.',
      },
    ],
  },
  {
    title: 'AMENITIES',
    items: [
      {
        q: 'Is there air conditioning?',
        a: 'There is no central A/C. We use large fans to circulate and cool the space, and a natural gas heater for colder months. Partial A/C is being added as part of our Phase 3 upgrades, currently in progress.',
      },
      {
        q: 'Are there props available?',
        a: 'Yes — props are included with your standard rental. During shared studio hours, props are first come, first served. All props must be returned to their original locations before your session ends.',
      },
    ],
  },
]

function Nav() {
  return <SiteNav active="studio rules" />
}

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
          padding: '22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
        }}
      >
        <span style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 500, color: '#fff', textAlign: 'left', lineHeight: 1.4 }}>{q}</span>
        <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, color: 'rgba(255,255,255,0.3)', flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 24, paddingRight: 48 }}>
          <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, margin: 0 }}>{a}</p>
        </div>
      )}
    </div>
  )
}

export default function StudioRulesPage() {
  const isMobile = useIsMobile()
  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <Nav />

      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 52 : 80, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>POLICIES & FAQ</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(64px, 10vw, 110px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: '0 0 32px' }}>
            STUDIO<br />RULES
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 520, margin: 0 }}>
            Everything you need to know before you book. Read through before your session — these policies keep the space running smoothly for everyone.
          </p>
        </div>
      </section>

      <section style={{ padding: isMobile ? '52px 20px 80px' : '80px 40px 120px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 48 : 72 }}>
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 8 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)' }}>{section.title}</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              </div>
              {section.items.map(item => (
                <AccordionItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '60px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, color: '#fff', letterSpacing: '0.02em', marginBottom: 8 }}>READY TO BOOK?</div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            Questions? Text us at (832) 408-1631 — we respond to text only.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/sets" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 24px', textDecoration: 'none' }}>
            VIEW SETS
          </Link>
          <Link href="/book" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '12px 24px', textDecoration: 'none' }}>
            BOOK NOW
          </Link>
        </div>
      </section>
    </main>
  )
}

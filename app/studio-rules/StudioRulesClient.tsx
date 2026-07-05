'use client'
import { useState } from 'react'
import Link from 'next/link'
import NavAuthLink from '@/components/NavAuthLink'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'
import type { PageContent } from '@/lib/site-content'
import { parseList } from '@/lib/content-list'

// Render a \n-delimited string with <br/> between lines.
const nl = (s: string) => (s ?? '').split('\n').flatMap((line, i) => i === 0 ? [line] : [<br key={i} />, line])

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

export default function StudioRulesClient({ content = {} }: { content?: PageContent }) {
  const isMobile = useIsMobile()
  const c = content
  // FAQ sections come from the Website editor; empty sections are hidden.
  const sections = [1, 2, 3, 4, 5, 6].map(n => ({
    title: c[`faq${n}Title`] ?? '',
    items: parseList(c[`faq${n}Items`]),
  })).filter(sec => sec.title.trim() !== '' || sec.items.length > 0)
  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <Nav />

      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 52 : 80, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>{c.eyebrow}</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(64px, 10vw, 110px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: '0 0 32px' }}>
            {nl(c.headline)}
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 520, margin: 0 }}>
            {c.intro}
          </p>
        </div>
      </section>

      <section style={{ padding: isMobile ? '52px 20px 80px' : '80px 40px 120px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 48 : 72 }}>
          {sections.map((section, si) => (
            <div key={si}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 8 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)' }}>{section.title}</div>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              </div>
              {section.items.map((item, ii) => (
                <AccordionItem key={ii + (item.q ?? '')} q={item.q ?? ''} a={item.a ?? ''} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '60px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, color: '#fff', letterSpacing: '0.02em', marginBottom: 8 }}>{c.ctaHeading}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {c.ctaSub}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/rental-agreement" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 24px', textDecoration: 'none' }}>
            RENTAL AGREEMENT
          </Link>
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

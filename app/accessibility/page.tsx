'use client'
// 2026-10-14: accessibility statement (from MK_Accessibility_Audit_2026-10-14).
// Keep "What we've done" honest — only list fixes that are actually live.
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

const sec: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.6)' }
const body: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.8, margin: '0 0 16px' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 style={{ ...sec, margin: '0 0 18px', display: 'flex', alignItems: 'center', gap: 20 }}>
        {title}<span aria-hidden="true" style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
      </h2>
      {children}
    </section>
  )
}
function P({ children }: { children: React.ReactNode }) { return <p style={body}>{children}</p> }
function UL({ items }: { items: React.ReactNode[] }) {
  return <ul style={{ ...body, paddingLeft: 20 }}>{items.map((it, i) => <li key={i} style={{ marginBottom: 10 }}>{it}</li>)}</ul>
}

export default function AccessibilityPage() {
  const isMobile = useIsMobile()
  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav />
      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 40 : 60, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(52px, 9vw, 96px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: '0 0 24px' }}>
            ACCESSIBILITY
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Last updated: October 14, 2026</p>
          <p style={{ ...body, marginTop: 16, maxWidth: 620 }}>
            Made Kulture wants everyone to be able to browse the studio, book a set and use their account, including people who use a keyboard, a screen reader, zoom or other assistive technology.
          </p>
        </div>
      </section>

      <section style={{ padding: isMobile ? '44px 20px 80px' : '64px 40px 110px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 40 : 56 }}>
          <Section title="OUR GOAL">
            <P>We aim for madekulture.com and the Made Kulture app to meet the Web Content Accessibility Guidelines (WCAG) 2.1, level AA. We test the site with automated accessibility tools and by hand, and we fix problems as we find them.</P>
          </Section>

          <Section title="WHAT WE'VE DONE">
            <UL items={[
              'Booking and checkout work with a keyboard and screen reader, including the rental agreement and other required checkboxes.',
              'Checkout fields are labeled and support your browser’s autofill.',
              'You can pinch to zoom on phones.',
              'Images on the site have text descriptions.',
            ]} />
          </Section>

          <Section title="WHAT WE'RE STILL WORKING ON">
            <UL items={[
              'Raising the contrast of some smaller grey text.',
              'Clearer screen-reader labels on the booking date and time pickers.',
              'Keyboard access to every photo gallery.',
            ]} />
          </Section>

          <Section title="NEED HELP OR FOUND A PROBLEM?">
            <P>If anything on the site gets in your way, we&rsquo;ll help you book directly and fix the problem. Tell us what page you were on and what happened.</P>
            <P>
              Text: <a href="sms:+18324081631" style={{ color: '#fff' }}>(832) 408-1631</a><br />
              Email: <a href="mailto:info@madekulture.com" style={{ color: '#fff' }}>info@madekulture.com</a>
            </P>
            <P>We aim to reply within 2 business days.</P>
          </Section>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8 }}>
            <Link href="/support" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)', padding: '12px 24px', textDecoration: 'none' }}>SUPPORT</Link>
            <Link href="/terms" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)', padding: '12px 24px', textDecoration: 'none' }}>TERMS &amp; CONDITIONS</Link>
          </div>
        </div>
      </section>
    </main>
  )
}

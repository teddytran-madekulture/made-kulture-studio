'use client'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

// Content mirrors "Made Kulture - Privacy Policy.md" (last updated Jun 26 2026).

const sec: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)' }
const body: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 15, color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, margin: '0 0 16px' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18 }}>
        <div style={sec}>{title}</div>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
      </div>
      {children}
    </div>
  )
}
function P({ children }: { children: React.ReactNode }) { return <p style={body}>{children}</p> }
function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ ...body, paddingLeft: 20, listStyle: 'none' }}>
      {items.map((it, i) => (
        <li key={i} style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: -18, color: 'rgba(255,255,255,0.3)' }}>—</span>{it}
        </li>
      ))}
    </ul>
  )
}

export default function PrivacyPolicyPage() {
  const isMobile = useIsMobile()
  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav active="privacy" />

      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 40 : 60, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>LEGAL</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(52px, 9vw, 96px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: '0 0 24px' }}>
            PRIVACY<br />POLICY
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Last updated: June 26, 2026</p>
          <p style={{ ...body, marginTop: 16, maxWidth: 580 }}>Made Kulture (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the creative studio rental space located at 4825 Gulf Freeway, Houston TX 77023, and the website madekulture.com. This Privacy Policy explains how we collect, use, and protect your information.</p>
        </div>
      </section>

      <section style={{ padding: isMobile ? '44px 20px 80px' : '64px 40px 110px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 40 : 56 }}>

          <Section title="INFORMATION WE COLLECT">
            <P>When you make a booking through our website, we collect:</P>
            <UL items={[
              'Full name',
              'Email address',
              'Phone number',
              'Payment information (processed securely by Square — we do not store card numbers)',
              'Booking details (date, time, set, add-ons)',
              'Any notes or special requests you provide',
            ]} />
          </Section>

          <Section title="HOW WE USE YOUR INFORMATION">
            <P>We use your information to:</P>
            <UL items={[
              'Confirm and manage your studio booking',
              'Send booking confirmations, appointment reminders, and session notifications via SMS and email',
              'Process payments and handle any overages or additional charges',
              'Respond to your questions or requests',
              'Improve our services',
            ]} />
          </Section>

          <Section title="SMS / TEXT MESSAGE COMMUNICATIONS">
            <P>By submitting a booking through madekulture.com, you agree to receive text messages from Made Kulture at the phone number you provide. These messages may include:</P>
            <UL items={[
              'Booking confirmations',
              'Appointment reminders',
              'Session notifications',
              'Important updates about your reservation',
            ]} />
            <P><strong style={{ color: '#fff' }}>Message and data rates may apply.</strong> Message frequency varies based on your booking activity.</P>
            <P><strong style={{ color: '#fff' }}>To opt out:</strong> Reply STOP to any text message at any time. You will receive a confirmation and no further messages will be sent.</P>
            <P><strong style={{ color: '#fff' }}>For help:</strong> Reply HELP to any message or contact us at (832) 408-1631.</P>
            <P>We will never sell your phone number or use it for marketing purposes unrelated to your booking.</P>
          </Section>

          <Section title="PAYMENT INFORMATION">
            <P>All payments are processed by Square. We store a reference to your payment method on file solely for the purpose of charging any applicable session overages. We do not store your full card number. Square&rsquo;s privacy policy applies to the processing of your payment data: <a href="https://squareup.com/us/en/legal/general/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#c9b27e' }}>squareup.com/us/en/legal/general/privacy</a></P>
          </Section>

          <Section title="DATA SHARING">
            <P>We do not sell, rent, or share your personal information with third parties except:</P>
            <UL items={[
              <><strong style={{ color: '#fff' }}>Square</strong> — to process payments</>,
              <><strong style={{ color: '#fff' }}>Twilio</strong> — to send SMS notifications</>,
              'As required by law',
            ]} />
          </Section>

          <Section title="DATA RETENTION">
            <P>We retain booking records for up to 3 years for business and tax purposes. You may request deletion of your personal data by contacting us at teddytran@madekulture.com.</P>
          </Section>

          <Section title="CONTACT">
            <P>
              Made Kulture<br />
              4825 Gulf Freeway, Houston TX 77023<br />
              Email: teddytran@madekulture.com<br />
              Phone: (832) 408-1631 (text only)
            </P>
          </Section>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8 }}>
            <Link href="/terms" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 24px', textDecoration: 'none' }}>TERMS &amp; CONDITIONS</Link>
            <Link href="/studio-rules" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 24px', textDecoration: 'none' }}>STUDIO RULES</Link>
          </div>
        </div>
      </section>
    </main>
  )
}

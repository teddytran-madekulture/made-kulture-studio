'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

// Content mirrors "Made Kulture - Terms and Conditions.md" (last updated Jul 2 2026).

const sec: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.25)' }
const body: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 15, color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, margin: '0 0 16px' }
const subHead: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: '0.02em', margin: '20px 0 8px' }

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} style={{ scrollMarginTop: 120 }}>
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

export default function TermsPage() {
  const isMobile = useIsMobile()
  // The Rewards section appears only while the program is switched on (it goes
  // live with the new site). Account Standing applies now, so it always shows.
  const [rewards, setRewards] = useState<{ enabled: boolean; memberRate: number; plusRate: number } | null>(null)
  useEffect(() => { fetch('/api/rewards/status').then(r => r.ok ? r.json() : null).then(setRewards).catch(() => {}) }, [])
  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav active="terms" />

      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 40 : 60, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>LEGAL</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(52px, 9vw, 96px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: '0 0 24px' }}>
            TERMS &amp;<br />CONDITIONS
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Last updated: September 27, 2026</p>
          <p style={{ ...body, marginTop: 16, maxWidth: 560 }}>By booking studio time at Made Kulture (madekulture.com), you agree to the following terms. Please read them carefully.</p>
        </div>
      </section>

      <section style={{ padding: isMobile ? '44px 20px 80px' : '64px 40px 110px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: isMobile ? 40 : 56 }}>

          <Section title="BOOKING POLICY" id="booking">
            <UL items={[
              <>All bookings must be made at least <strong style={{ color: '#fff' }}>48 hours in advance</strong></>,
              'Bookings run in 30-minute increments with a 1-hour minimum (some sets have longer minimums)',
              'Your set unlocks at your booked start time — you will not be able to enter before your session begins; arriving a few minutes early to be ready is encouraged. All setup and breakdown must occur within your booked time',
              'Set reservations are for that specific set only — changing sets mid-session is not permitted',
              'Sessions running more than 15 minutes past your booked end time will be charged an additional hour to the card on file',
            ]} />
          </Section>

          <Section title="PAYMENT">
            <UL items={[
              'Full payment is required at the time of booking',
              'Your card will be saved on file to cover any session overages (e.g., overtime, cleaning fees)',
              'All payments are processed securely by Square',
            ]} />
          </Section>

          <Section title="CANCELLATION POLICY">
            <UL items={[
              <>Made Kulture issues <strong style={{ color: '#fff' }}>studio credit, not refunds</strong>. Cancellation credit never expires and applies automatically to your next booking.</>,
              <><strong style={{ color: '#fff' }}>Full value back as studio credit</strong> if cancelled 48 or more hours before your booking start time</>,
              <><strong style={{ color: '#fff' }}>Not credited</strong> for cancellations within 48 hours of the booking start time</>,
              <><strong style={{ color: '#fff' }}>Full-warehouse bookings cancelled within 48 hours</strong> carry a <strong style={{ color: '#fff' }}>25% late cancellation fee</strong>; the remaining 75% returns as studio credit. Because a full-warehouse booking takes the entire building out of availability and cannot be partially re-booked at short notice, this applies to all customers, including Plus.</>,
              <>Made Kulture <strong style={{ color: '#fff' }}>Plus</strong> members receive full studio credit (never a forfeit) when they cancel a booking, and may be credited for a no-show on request — see Membership below</>,
            ]} />
          </Section>

          {/* Linkable as /terms#plus — send this when someone asks how Plus works or why a request was declined. */}
          <Section title="MEMBERSHIP (MADE KULTURE PLUS)" id="plus">
            <div style={subHead}>Billing</div>
            <UL items={[
              <>Made Kulture Plus is an <strong style={{ color: '#fff' }}>annual membership</strong> charged to the card on file. It <strong style={{ color: '#fff' }}>renews automatically</strong> each year at the then-current price unless auto-renew is turned off before the renewal date.</>,
              <>You can <strong style={{ color: '#fff' }}>cancel auto-renew at any time</strong> from your account. Your benefits continue through the end of the paid term; the membership simply does not renew, and you are not charged again.</>,
              <><strong style={{ color: '#fff' }}>Membership fees are non-refundable</strong>, including for partial or unused terms.</>,
              'Plus does not change your per-session booking rate. Introductory pricing applies to sign-ups during the intro period; renewals are billed at the price in effect at the time of renewal.',
            ]} />

            <div style={subHead}>Booking inside 48 hours</div>
            <UL items={[
              'Plus members may book, instantly, hours inside the 48-hour window that the studio is already open for.',
              <>Other times inside the window may be <strong style={{ color: '#fff' }}>requested</strong>. Every request is reviewed by the studio and may be declined. An open time slot shown on the availability calendar is <strong style={{ color: '#fff' }}>not a guarantee</strong>.</>,
            ]} />

            <div id="plus-requests" style={{ ...subHead, scrollMarginTop: 120 }}>Why a short-notice request may not be approved</div>
            <P>Short-notice sessions depend on the studio being ready for you. A request may be declined for reasons including:</P>
            <UL items={[
              'No team member is available to open, prepare or support the set at that time',
              'The set, or the whole studio, is booked, held, or being prepared for another session',
              'There is not enough lead time to get the space ready (for example, a request made minutes before the start time)',
              'Cleaning, turnover, maintenance, renovation, or a private event',
              'The account is not in good standing (see Account Standing)',
            ]} />
            <P>When a request is declined we will tell you by text and email. You are welcome to request a different set or time.</P>

            <div style={subHead}>Rescheduling</div>
            <UL items={[
              'Plus members may move an individual set booking themselves inside the 48-hour window, to another available time on the same set, for the same length and price.',
              'A session cannot be moved once it has started. Full-warehouse bookings are rescheduled by the studio.',
            ]} />

            <div style={subHead}>Cancellation protection and no-shows</div>
            <UL items={[
              <>Plus members may cancel an individual set booking at any time before it starts, and its <strong style={{ color: '#fff' }}>full value returns as studio credit</strong> (never a cash refund).</>,
              'Full-warehouse bookings cancelled inside 48 hours carry the 25% late cancellation fee described under Cancellation Policy, for all customers including Plus.',
              'A no-show may be credited on request, at the studio\u2019s discretion.',
            ]} />

            <div style={subHead}>Saving an existing booking with Plus</div>
            <P>If you join Plus after booking, Plus benefits apply from the moment you join, including to bookings already inside the 48-hour window.</P>

            <div id="plus-fair-use" style={{ ...subHead, scrollMarginTop: 120 }}>Fair use</div>
            <P>Plus benefits exist for genuine changes of plans, not for holding studio time you do not intend to use. We do not set a fixed limit on reschedules or cancellations, but we may act on patterns of misuse, such as:</P>
            <UL items={[
              'Repeatedly booking and then cancelling or rescheduling',
              'Reserving popular times speculatively',
              'Moving the same session again and again',
              'Joining Plus mainly to recover a booking and then repeating the pattern',
            ]} />
            <P>In those cases we may decline a reschedule, request or cancellation credit; require approval for future bookings; pause Plus benefits; or record it under Account Standing. We will let you know if we do, and you can always contact us to talk it through. Paused benefits do not extend or refund the membership term.</P>

            <div style={subHead}>Account standing</div>
            <P>Plus benefits may be paused while an account is below good standing, as described under Account Standing. The membership fee is not refunded while benefits are paused.</P>

            <div style={subHead}>Changes to Plus</div>
            <P>Made Kulture may change Plus benefits or pricing. Changes that reduce benefits take effect at your next renewal, or after notice to you. Studio credit you have already received remains yours.</P>
          </Section>

          <Section title="GUEST POLICY">
            <UL items={[
              <>Individual set bookings: maximum <strong style={{ color: '#fff' }}>5 people total</strong> (photographers, models, stylists, assistants, clients, and children all count)</>,
              <>Full studio takeover: maximum <strong style={{ color: '#fff' }}>30 people</strong></>,
              'Extra guests are not permitted on the premises even if not actively on the set',
            ]} />
          </Section>

          <Section title="STUDIO RULES">
            <UL items={[
              <><strong style={{ color: '#fff' }}>Nudity:</strong> Not permitted during shared bookings unless your party is the only booking in the studio</>,
              <><strong style={{ color: '#fff' }}>Audio recording:</strong> The studio is not soundproofed and sits near I-45. A full studio takeover is recommended for audio work</>,
              <><strong style={{ color: '#fff' }}>Special effects</strong> (fog, haze, smoke bombs): Not permitted during shared bookings. Available for full studio takeovers or solo bookings only, and must be pre-approved</>,
              <><strong style={{ color: '#fff' }}>Messy concepts</strong> (paint, fake blood, glitter, smoke bombs, excessive oils) are not allowed. If your shoot genuinely needs something messy, or anything outside how the studio normally runs, ask us before you book and we will tell you whether a concept review is possible. Approval is case by case and is never guaranteed, and an approved concept carries a refundable cleaning deposit. A minimum $150 cleaning fee is charged if the space is not left clean</>,
              <><strong style={{ color: '#fff' }}>Props:</strong> Included with all rentals on a first-come, first-served basis during shared hours. All props must be returned to their original locations before your session ends</>,
            ]} />
          </Section>

          {rewards?.enabled && (
            <Section title="MADE KULTURE REWARDS & STUDIO CREDIT">
              <P>Members earn studio credit on every completed booking: {rewards.memberRate}% of the amount paid for members and {rewards.plusRate}% for Made Kulture Plus members. Rewards are calculated on set time and equipment rentals paid by card or other payment method, and do not apply to any portion paid with studio credit, taxes, fees, or charges for extra guests, damage, cleaning or overtime. Rewards are added to your account after your session ends. Bookings made without a Made Kulture account do not earn rewards, and accounts that are not in good standing (see Account Standing) do not earn rewards while that remains the case.</P>
              <P>Reward credit expires if your account has no completed booking for 12 consecutive months. We will email you before any reward credit expires. Credit issued for cancellations, no-shows or rescheduling is not reward credit and does not expire. When you use studio credit, reward credit is applied first.</P>
              <P>Studio credit has no cash value, cannot be transferred or exchanged for cash, and can be used toward set bookings and equipment rentals. If a booking that earned rewards is later refunded or credited back, the matching reward is removed. Made Kulture may change reward rates or end the program at any time; credit already earned remains usable under the terms in effect when it was earned.</P>
            </Section>
          )}

          <Section title="ACCOUNT STANDING">
            <P>Every Made Kulture account starts in good standing. If a booking results in an incident, such as props not returned, a set left needing cleanup, guests over the limit, use of a set or equipment that was not booked, unpaid overtime, damage, or a violation of the Studio Rules, we may record it on the account. Each incident carries points based on its severity. Points expire 12 months after the incident; incidents involving theft, threats or serious damage may remain on record.</P>
            <P>An account&rsquo;s standing depends on its points. Accounts below good standing may lose access to rewards, short-notice booking and Plus cancellation protection, may need approval before a booking is confirmed, and may be suspended from booking. We will notify you by email when an incident is recorded. Made Kulture Plus fees are not refunded when perks are paused. Existing studio credit remains yours under the Studio Credit terms.</P>
            <P>If you believe an incident was recorded in error, reply to the notice or contact us, and we will review it. Made Kulture may suspend or close any account at its discretion for serious incidents.</P>
          </Section>

          <Section title="COMMUNITY & MEMBER CONTENT">
            <P>Made Kulture members may create a profile and upload images to a personal portfolio shown in our members-only creative directory. The following applies to any content you upload (&ldquo;Member Content&rdquo;).</P>
            <div style={subHead}>Eligibility</div>
            <UL items={[
              <>You must be <strong style={{ color: '#fff' }}>18 or older</strong> to create a member profile and upload Member Content.</>,
              <><strong style={{ color: '#fff' }}>Every person depicted</strong> in your Member Content must be 18 or older.</>,
            ]} />
            <div style={subHead}>Content Standards</div>
            <P>Made Kulture supports artistic expression, including artistic, editorial, and fashion nudity. To keep the community professional and lawful, the following is <strong style={{ color: '#fff' }}>not permitted</strong>:</P>
            <UL items={[
              <><strong style={{ color: '#fff' }}>Pornographic or sexually explicit content</strong> — including depictions of sexual acts or penetration, or any content whose primary purpose is sexual arousal or gratification (as opposed to artistic or editorial expression).</>,
              <><strong style={{ color: '#fff' }}>Any nude, partially nude, or otherwise sexualized depiction of a minor</strong> (anyone under 18). This is strictly prohibited and will be reported to the appropriate authorities as required by law.</>,
              <><strong style={{ color: '#fff' }}>Non-consensual content</strong> — images of any person who has not consented, including intimate or &ldquo;revenge&rdquo; imagery.</>,
              <>Content that is illegal, harassing, hateful, defamatory, or that infringes another person&rsquo;s intellectual-property or privacy rights.</>,
            ]} />
            <P>Whether nudity is artistic or pornographic is determined by Made Kulture in its reasonable discretion.</P>
            <div style={subHead}>Your Responsibilities</div>
            <P>By uploading Member Content, you represent and warrant that:</P>
            <UL items={[
              'You own the content, or have obtained all rights, licenses, and permissions necessary to post it;',
              'You have the consent and, where applicable, signed model releases of every identifiable person depicted;',
              'Every person depicted is 18 or older; and',
              <>You will tag any content containing nudity or mature themes as <strong style={{ color: '#fff' }}>18+</strong> using the tools provided.</>,
            ]} />
            <div style={subHead}>License to Made Kulture</div>
            <P>You retain ownership of your Member Content. By uploading it, you grant Made Kulture a limited, non-exclusive, royalty-free license to store, display, and reproduce that content solely to operate and promote the members&rsquo; directory and platform. This license ends when the content is removed, except for copies retained in routine backups.</P>
            <div style={subHead}>Moderation & Removal</div>
            <P>Made Kulture is under no obligation to host any content. We may <strong style={{ color: '#fff' }}>archive (hide) or permanently remove</strong> any Member Content, and may suspend or terminate any account, at our sole discretion and without notice — including for any suspected violation of these standards. Archived content is hidden from other members but may be retained by Made Kulture.</P>
            <div style={subHead}>Reporting</div>
            <P>To report content you believe violates these standards, contact us at info@madekulture.com. We review reports and act on violations, prioritizing anything involving minors.</P>
            <div style={{ borderLeft: '2px solid rgba(201,178,126,0.5)', paddingLeft: 18, margin: '8px 0', fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, fontStyle: 'italic' }}>
              At upload, members confirm: &ldquo;I own or have the rights to these images, everyone shown is 18 or older and has consented, and this content follows Made Kulture&rsquo;s content standards.&rdquo;
            </div>
          </Section>

          <Section title="SMS COMMUNICATIONS">
            <P>By providing your phone number during booking, you consent to receive text messages from Made Kulture related to your reservation, including booking confirmations, appointment reminders, and session notifications.</P>
            <P><strong style={{ color: '#fff' }}>Message and data rates may apply.</strong> To opt out, reply STOP to any message. For help, reply HELP or email info@madekulture.com.</P>
          </Section>

          <Section title="LIABILITY">
            <P>Made Kulture is not responsible for loss, theft, or damage to personal equipment or property brought onto the premises. Clients are responsible for any damage caused to studio sets, props, or equipment during their session. Damage costs will be charged to the card on file.</P>
          </Section>

          <Section title="CHANGES TO TERMS">
            <P>We reserve the right to update these terms at any time. Continued use of our booking service constitutes acceptance of the current terms.</P>
          </Section>

          <Section title="CONTACT">
            <P>
              Made Kulture<br />
              4825 Gulf Freeway, Houston TX 77023<br />
              Email: info@madekulture.com<br />
              Website: madekulture.com
            </P>
          </Section>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 8 }}>
            <Link href="/privacy-policy" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 24px', textDecoration: 'none' }}>PRIVACY POLICY</Link>
            <Link href="/studio-rules" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 24px', textDecoration: 'none' }}>STUDIO RULES</Link>
          </div>
        </div>
      </section>
    </main>
  )
}

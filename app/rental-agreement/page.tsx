'use client'
import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

// A block is either a paragraph (string) or a bullet list (string[]).
type Block = string | string[]
interface Section { title: string; blocks: Block[] }
interface Agreement { heading: string; intro: string; sections: Section[] }

const SET_AGREEMENT: Agreement = {
  heading: 'Individual Set Rental Agreement, Release & Waiver',
  intro: 'By booking an individual set at Made Kulture and checking the box at checkout, you ("Renter") agree to the following terms on behalf of yourself and everyone in your party. Please read them carefully. (For full-warehouse bookings, a separate agreement applies.)',
  sections: [
    { title: 'Eligibility', blocks: ['You must be at least 18 years old to book and to act as the responsible party on site. Made Kulture may require a valid photo ID.'] },
    { title: 'Rates & Guests', blocks: [[
      'Individual set rentals start at $40/hour. Certain premium sets (for example, The Watering Hole and Studio One) are priced higher and may carry their own minimum booking lengths. The rate and any minimum for each set are shown at the time of booking.',
      'Each set holds up to 5 people total — this includes photographers, models, stylists, assistants, clients, and children. Everyone present with your party counts toward this limit.',
      'A party of 6–7 may use a single set with a per-person buffer fee added at checkout. Larger parties require additional sets or a full-warehouse buyout.',
      'Arriving with more people than your booking allows may result in additional per-guest charges to the card on file, and — for repeated or serious violations — a note or ban on your account. Extra guests are not permitted on the premises even if not actively on the set.',
    ]] },
    { title: 'Payment', blocks: [[
      'Full payment is required at the time of booking and is processed securely by Square. We accept credit and debit cards. We cannot accept personal checks under any circumstances.',
      'Your card is saved on file and may be charged for session overages and any amounts owed under this agreement, including additional guests, added time or equipment, cleaning fees, and repair or replacement costs for damage.',
    ]] },
    { title: 'Rental Hours', blocks: ['Monday–Sunday, 9:00 AM – 10:00 PM. Bookings outside these hours may be available by request.'] },
    { title: 'Length of Use — Arrive and Leave On Time', blocks: [[
      'Your booked time includes all setup and breakdown. The set must be cleaned and vacated by the end of your rental period.',
      'You may arrive up to 15 minutes early, but all setup and breakdown must occur within your booked time.',
      'Sessions running more than 15 minutes past your booked end time are automatically charged an additional hour to the card on file.',
      'No early drop-off or post-shoot pickup of equipment, props, etc., unless arranged in advance at the time of booking. Additional fees may apply. Any items left more than 48 hours after your rental will be considered abandoned and may be discarded.',
    ]] },
    { title: 'Set Selection (Shared Studio)', blocks: [[
      'Your reservation is for the specific set you booked. Changing sets mid-session is not permitted.',
      'During shared hours, other productions may be present in other sets. Props are included on a first-come, first-served basis and must be returned to their original locations before your session ends.',
    ]] },
    { title: 'Studio Rules', blocks: [[
      'Nudity: Not permitted during shared bookings unless your party is the only booking in the studio at that time.',
      'Audio recording: The studio is not soundproofed and sits near the I-45 freeway. A full-warehouse buyout is recommended for audio work.',
      'Special effects (fog, haze, smoke bombs, etc.): Not permitted during shared bookings; available for full-warehouse buyouts or solo bookings only, and must be pre-approved.',
      'Messy concepts (paint, fake blood, glitter, excessive oils, etc.) must be approved in advance. Floors and surfaces must be protected with plastic or other suitable material so they are not damaged.',
      'Children are welcome but count toward the guest limit; shared-studio conditions may not be suitable for young children.',
      'No illegal activity of any kind is permitted on the premises at any time.',
    ]] },
    { title: 'Cleaning & Damage', blocks: [[
      'Leave the set clean and as you found it — furniture returned to place, and all lights, sound systems, and equipment turned off. Modeling lights and receivers must be turned off when not in use. Failure to do so will result in a cleaning fee of a minimum of $150.',
      'You are responsible for any equipment, furniture, fixtures, props, or other property that is mishandled, broken, damaged, ruined, or stolen during your rental. You agree to replace such items (with equivalent or better) or pay all repair/replacement costs within 48 hours, charged to the card on file if not otherwise paid.',
    ]] },
    { title: 'Smoke-Free Facility', blocks: ['Made Kulture is a smoke-free facility. Smoking and vaping are not permitted anywhere on the premises. Violations are subject to applicable state and local law and will result in cleaning and airing-out charges — including the set’s hourly rate for any time it cannot be used while airing out, plus a cleaning fee (minimum $150).'] },
    { title: 'Cancellations & Refunds', blocks: [[
      'Full refund if you cancel at least 48 hours before your reserved start time.',
      'No refund for cancellations made within 48 hours of the reserved start time.',
    ]] },
    { title: 'Release and Waiver of Liability', blocks: [
      'In this section, "Made Kulture" means Made Kulture LLC and its owners, agents, employees, affiliated independent contractors, management, bookers, related personnel, and any subsidiaries or affiliates.',
      [
        'Made Kulture rents its facility, including limited equipment and props, with the understanding that in no event shall Made Kulture be liable for any direct, indirect, incidental, or consequential damages arising from the use of the building, facility, or equipment.',
        'You release Made Kulture from any and all liability for any injuries, whether physical or mental, sustained while participating in, working at, or shooting in the studio, or during any other activity connected with the space, or arising from any situation you encounter while renting.',
        'You agree not to sue or file any claim against Made Kulture arising out of such participation and/or photo shoots.',
        'Made Kulture is not responsible for any injuries, accidents, loss, or damage that occurs in the studio or on the premises, including loss or theft of personal equipment or property you bring.',
        'Made Kulture’s total liability, should your shoot be delayed or cancelled due to a situation on the premises beyond our control, is limited to the amount of your rental fee.',
        'You agree to indemnify and hold Made Kulture harmless from any incidents, accidents, or claims arising from you or anyone in your party at 4825 Gulf Freeway, Houston, TX 77023 on your reserved date(s) or any dates added later.',
      ],
    ] },
    { title: 'Responsibility for Your Party', blocks: ['You are solely responsible for the conduct and welfare of everyone you bring onto the premises, and you agree to make your representatives responsible for these terms.'] },
    { title: 'Premises & Monitoring', blocks: ['The premises may be monitored, including by security cameras. A Made Kulture representative may be present on-site or reachable during your rental.'] },
    { title: 'Agreement', blocks: ['By checking the box at checkout and completing your booking, you confirm that you have read, understood, and agree to this Individual Set Rental Agreement, Release, and Waiver on behalf of yourself and everyone in your party.'] },
  ],
}

const STUDIO_AGREEMENT: Agreement = {
  heading: 'Full Warehouse Rental Agreement, Release & Waiver',
  intro: 'By booking a full-warehouse buyout at Made Kulture and checking the box at checkout, you ("Renter") agree to the following terms on behalf of yourself and everyone in your party. Please read them carefully. (For individual set bookings, a separate agreement applies.)',
  sections: [
    { title: 'Eligibility', blocks: ['You must be at least 18 years old to book and to act as the responsible party on site. Made Kulture may require a valid photo ID.'] },
    { title: 'Rate & Guests', blocks: [[
      'The full-warehouse buyout is $100/hour with a 4-hour minimum (a $400 minimum), for up to 30 people.',
      'A buyout gives you private use of the entire warehouse and all sets for your booked time, so per-set guest limits do not apply.',
      'The maximum occupancy is 30 people. Parties larger than 30 require advance approval and may incur additional fees. Bringing more people than approved may result in additional charges or termination of the session.',
    ]] },
    { title: 'Payment', blocks: [[
      'Full payment is required at the time of booking and is processed securely by Square. We accept credit and debit cards. We cannot accept personal checks under any circumstances.',
      'Your card is saved on file and may be charged for session overages and any amounts owed under this agreement, including added time or equipment, cleaning fees, and repair or replacement costs for damage.',
    ]] },
    { title: 'Rental Hours', blocks: ['Monday–Sunday, 9:00 AM – 10:00 PM. Outside-hours bookings are available by request at the full-warehouse rate.'] },
    { title: 'Length of Use — Arrive and Leave On Time', blocks: [[
      'Your booked time includes all setup and breakdown. The space must be cleaned and vacated by the end of your rental period.',
      'You may arrive up to 15 minutes early, but all setup and breakdown must occur within your booked time.',
      'Sessions running more than 15 minutes past your booked end time are automatically charged an additional hour (at the full-warehouse rate) to the card on file.',
      'No early drop-off or post-shoot pickup of equipment, props, etc., unless arranged in advance at the time of booking. Additional fees may apply. Any items left more than 48 hours after your rental will be considered abandoned and may be discarded.',
    ]] },
    { title: 'Private Use & Studio Rules', blocks: [[
      'During your buyout you have private, exclusive use of the entire warehouse and all sets.',
      'Nudity is permitted, as your party is the only booking on site.',
      'Special effects (fog, haze, smoke bombs, etc.), studio blackout, and projector use are available during a buyout. Messy concepts (paint, fake blood, glitter, excessive oils, etc.) must be approved in advance, and floors and surfaces must be protected with plastic or other suitable material so they are not damaged.',
      'Audio recording: The building is not soundproofed and sits near the I-45 freeway, so ambient noise may be present even during a private buyout.',
      'No illegal activity of any kind is permitted on the premises at any time.',
    ]] },
    { title: 'Cleaning & Damage', blocks: [[
      'Leave the space clean and as you found it — furniture returned to place, props returned to their original locations, and all lights, sound systems, and equipment turned off. Modeling lights and receivers must be turned off when not in use. Failure to do so will result in a cleaning fee of a minimum of $150.',
      'You are responsible for any equipment, furniture, fixtures, props, or other property that is mishandled, broken, damaged, ruined, or stolen during your rental. You agree to replace such items (with equivalent or better) or pay all repair/replacement costs within 48 hours, charged to the card on file if not otherwise paid.',
    ]] },
    { title: 'Smoke-Free Facility', blocks: ['Made Kulture is a smoke-free facility. Smoking and vaping are not permitted anywhere on the premises. Violations are subject to applicable state and local law and will result in cleaning and airing-out charges — including the hourly rate for any time the space cannot be used while airing out, plus a cleaning fee (minimum $150).'] },
    { title: 'Cancellations & Refunds', blocks: [[
      'Full refund if you cancel at least 48 hours before your reserved start time.',
      'No refund for cancellations made within 48 hours of the reserved start time.',
    ]] },
    { title: 'Release and Waiver of Liability', blocks: [
      'In this section, "Made Kulture" means Made Kulture LLC and its owners, agents, employees, affiliated independent contractors, management, bookers, related personnel, and any subsidiaries or affiliates.',
      [
        'Made Kulture rents its facility, including limited equipment and props, with the understanding that in no event shall Made Kulture be liable for any direct, indirect, incidental, or consequential damages arising from the use of the building, facility, or equipment.',
        'You release Made Kulture from any and all liability for any injuries, whether physical or mental, sustained while participating in, working at, or shooting in the studio, or during any other activity connected with the space, or arising from any situation you encounter while renting.',
        'You agree not to sue or file any claim against Made Kulture arising out of such participation and/or photo shoots.',
        'Made Kulture is not responsible for any injuries, accidents, loss, or damage that occurs in the studio or on the premises, including loss or theft of personal equipment or property you bring.',
        'Made Kulture’s total liability, should your shoot be delayed or cancelled due to a situation on the premises beyond our control, is limited to the amount of your rental fee.',
        'You agree to indemnify and hold Made Kulture harmless from any incidents, accidents, or claims arising from you or anyone in your party at 4825 Gulf Freeway, Houston, TX 77023 on your reserved date(s) or any dates added later.',
      ],
    ] },
    { title: 'Responsibility for Your Party', blocks: ['You are solely responsible for the conduct and welfare of everyone you bring onto the premises, and you agree to make your representatives responsible for these terms.'] },
    { title: 'Premises & Monitoring', blocks: ['The premises may be monitored, including by security cameras. A Made Kulture representative may be present on-site or reachable during your rental.'] },
    { title: 'SMS / Text Message Consent', blocks: [
      'By providing your mobile phone number and completing this rental agreement, you expressly consent to receive SMS/text messages from Made Kulture related to your studio rental. These messages may include booking confirmations, reminders, session notifications, operational updates, and responses to your inquiries.',
      'Message frequency varies based on your booking. Message and data rates may apply. Consent to receive text messages is not a condition of purchase, and messages may be sent using an automated system. You may opt out at any time by replying STOP to any message. For assistance, reply HELP or contact us at (832) 408-1631.',
    ] },
    { title: 'Agreement', blocks: ['By checking the box at checkout and completing your booking, you confirm that you have read, understood, and agree to this Full Warehouse Rental Agreement, Release, and Waiver on behalf of yourself and everyone in your party.'] },
  ],
}

function AgreementView() {
  const params = useSearchParams()
  const isMobile = useIsMobile()
  const initial = params.get('type') === 'studio' ? 'studio' : 'set'
  const [active, setActive] = useState<'set' | 'studio'>(initial)
  useEffect(() => { setActive(params.get('type') === 'studio' ? 'studio' : 'set') }, [params])
  const a = active === 'studio' ? STUDIO_AGREEMENT : SET_AGREEMENT

  const tab = (key: 'set' | 'studio', label: string) => (
    <button onClick={() => setActive(key)} style={{
      background: active === key ? '#fff' : 'transparent',
      color: active === key ? '#080808' : 'rgba(255,255,255,0.55)',
      border: '1px solid rgba(255,255,255,0.18)', padding: '10px 18px', cursor: 'pointer',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.12em',
    }}>{label}</button>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '104px 20px 80px' : '128px 40px 100px' }}>
      <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>RENTAL AGREEMENT</div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 38 : 52, letterSpacing: '0.02em', margin: 0, lineHeight: 1.02 }}>{a.heading}</h1>

      <div style={{ display: 'flex', gap: 8, margin: '28px 0' }}>
        {tab('set', 'INDIVIDUAL SET')}
        {tab('studio', 'FULL WAREHOUSE')}
      </div>

      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 8 }}>{a.intro}</p>

      {a.sections.map((s, i) => (
        <div key={i} style={{ marginTop: 32 }}>
          <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.02em', margin: '0 0 12px' }}>{s.title}</h2>
          {s.blocks.map((b, j) => Array.isArray(b) ? (
            <ul key={j} style={{ margin: '0 0 12px', paddingLeft: 20 }}>
              {b.map((li, k) => (
                <li key={k} style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 8 }}>{li}</li>
              ))}
            </ul>
          ) : (
            <p key={j} style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 12 }}>{b}</p>
          ))}
        </div>
      ))}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 48, paddingTop: 20, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
        Made Kulture LLC · 4825 Gulf Freeway, Houston, TX 77023 · (832) 408-1631 (text) · madekulture.com
      </div>
    </div>
  )
}

export default function RentalAgreementPage() {
  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="" />
      <Suspense fallback={<div style={{ padding: 140, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}>
        <AgreementView />
      </Suspense>
    </div>
  )
}

// The Production Services Vendor Agreement (2026-10-03). A member must accept
// it before they can create a listing; acceptance is stamped on their profile
// (migration 136) and the service_listings INSERT policy refuses rows from
// anyone who hasn't — so the gate holds even if the UI is bypassed.
//
// ⚠️ Changing the substance? Bump VENDOR_AGREEMENT_VERSION. Existing vendors
// keep their recorded version; nothing forces a re-accept (yet).
// ⚠️ Plain-language draft — have an attorney review before relying on it.

export const VENDOR_AGREEMENT_VERSION = '2026-10-03'

export const VENDOR_AGREEMENT_TITLE = 'Production Services Vendor Agreement'

export const VENDOR_AGREEMENT_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Made Kulture is a directory, not a party',
    body: 'Made Kulture provides a members-only directory where members can find and message each other. Made Kulture is not a party to any rental, booking, sale or service arrangement between you and another member, does not act as your agent or the other member’s agent, and does not broker, guarantee or supervise any arrangement.',
  },
  {
    heading: 'No payments through Made Kulture',
    body: 'Made Kulture does not collect, hold, process or refund any money for your services. Pricing, deposits, payment, invoicing, taxes and refunds are handled entirely between you and the member you work with.',
  },
  {
    heading: 'You run your own business',
    body: 'You are an independent business, not an employee, contractor or representative of Made Kulture. You are solely responsible for your services, equipment, vehicles, staff and drivers, and for holding any licenses, permits, registrations and insurance your services require (including commercial auto and liability coverage where applicable).',
  },
  {
    heading: 'Your arrangements are your responsibility',
    body: 'Contracts, pickup and delivery, scheduling, cancellations, no-shows, damage, loss, injury and disputes are between you and the other member. If an arrangement falls through, you and the other member resolve it directly.',
  },
  {
    heading: 'Release and indemnity',
    body: 'You release Made Kulture, its owners and staff from any claim arising from your services or your dealings with other members. You agree to indemnify and hold Made Kulture harmless from claims, losses and costs (including reasonable legal fees) arising from your services, your listings, or your breach of this agreement.',
  },
  {
    heading: 'On Made Kulture premises',
    body: 'If you bring vehicles, equipment or staff onto the Made Kulture studio for a member’s shoot, Made Kulture may require a certificate of insurance beforehand, and you must follow the studio rules. Made Kulture may refuse entry at its discretion.',
  },
  {
    heading: 'Listings',
    body: 'Your listings must be accurate and lawful and must describe things you have the right to offer. Made Kulture does not verify listings and may edit, hide or remove any listing, or remove you from the directory, at any time.',
  },
]

/** Plain-text version (for the record / emails). */
export function vendorAgreementText(): string {
  return `${VENDOR_AGREEMENT_TITLE} (version ${VENDOR_AGREEMENT_VERSION})\n\n` +
    VENDOR_AGREEMENT_SECTIONS.map((s, i) => `${i + 1}. ${s.heading}\n${s.body}`).join('\n\n')
}

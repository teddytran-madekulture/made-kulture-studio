// Default rental-agreement text (Markdown). These are the built-in versions the
// site ships with. The admin "Legal" tab can override either one by saving to
// studio_settings (keys `agreement_set` / `agreement_studio`); the public
// /rental-agreement page falls back to these defaults when no override is set.

export const AGREEMENT_KEYS = {
  set: 'agreement_set',
  studio: 'agreement_studio',
} as const

export const DEFAULT_SET_AGREEMENT = `# Individual Set Rental Agreement, Release & Waiver

By booking an individual set at Made Kulture and checking the box at checkout, you ("Renter") agree to the following terms on behalf of yourself and everyone in your party. Please read them carefully. (For full-warehouse bookings, a separate agreement applies.)

## Eligibility

You must be at least 18 years old to book and to act as the responsible party on site. Made Kulture may require a valid photo ID.

## Rates & Guests

- Individual set rentals start at $40/hour. Certain premium sets (for example, The Watering Hole and Studio One) are priced higher and may carry their own minimum booking lengths. The rate and any minimum for each set are shown at the time of booking.
- Each set holds up to 5 people total — this includes photographers, models, stylists, assistants, clients, and children. Everyone present with your party counts toward this limit.
- A party of 6–7 may use a single set with a per-person buffer fee added at checkout. Larger parties require additional sets or a full-warehouse buyout.
- Arriving with more people than your set's guest limit allows (up to 5 people per set) may result in a per-guest penalty charge to the card on file, and — for repeated or serious violations — a note or ban on your account. Extra guests are not permitted on the premises even if not actively on the set.

## Payment

- Full payment is required at the time of booking and is processed securely by Square. We accept credit and debit cards. We cannot accept personal checks under any circumstances.
- Your card is saved on file and may be charged for session overages and any amounts owed under this agreement, including additional guests, added time or equipment, cleaning fees, and repair or replacement costs for damage.

## Rental Hours

Monday–Sunday, 9:00 AM – 10:00 PM. Bookings outside these hours may be available by request.

## Length of Use — Arrive and Leave On Time

- Your booked time includes all setup and breakdown. The set must be cleaned and vacated by the end of your rental period.
- Your set unlocks at your booked start time — you cannot enter before your session begins; arriving a few minutes early to be ready is encouraged. All setup and breakdown must occur within your booked time.
- Sessions running more than 15 minutes past your booked end time are automatically charged an additional hour to the card on file.
- No early drop-off or post-shoot pickup of equipment, props, etc., unless arranged in advance at the time of booking. Additional fees may apply. Any items left more than 48 hours after your rental will be considered abandoned and may be discarded.

## Set Selection (Shared Studio)

- Your reservation is for the specific set you booked. Changing sets mid-session is not permitted.
- During shared hours, other productions may be present in other sets. Props are included on a first-come, first-served basis and must be returned to their original locations before your session ends.

## Studio Rules

- Nudity: Not permitted during shared bookings unless your party is the only booking in the studio at that time.
- Audio recording: The studio is not soundproofed and sits near the I-45 freeway. A full-warehouse buyout is recommended for audio work.
- Special effects (fog, haze, smoke bombs, etc.): Not permitted during shared bookings; available for full-warehouse buyouts or solo bookings only, and must be pre-approved.
- Messy concepts (paint, fake blood, glitter, excessive oils, etc.) must be approved in advance. Floors and surfaces must be protected with plastic or other suitable material so they are not damaged.
- Children are welcome but count toward the guest limit; shared-studio conditions may not be suitable for young children.
- No illegal activity of any kind is permitted on the premises at any time.

## Cleaning & Damage

- Leave the set clean and as you found it — furniture returned to place, and all lights, sound systems, and equipment turned off. Modeling lights and receivers must be turned off when not in use. A cleaning fee may apply based on the condition of the set — typically starting around $100, with a higher fee for messy concepts (paint, glitter, fake blood, oils, etc.).
- You are responsible for any equipment, furniture, fixtures, props, or other property that is mishandled, broken, damaged, ruined, or stolen during your rental. You agree to replace such items (with equivalent or better) or pay all repair/replacement costs within 48 hours, charged to the card on file if not otherwise paid.

## Smoke-Free Facility

Made Kulture is a smoke-free facility. Smoking and vaping are not permitted anywhere on the premises. Violations are subject to applicable state and local law and will result in cleaning and airing-out charges — including the set's hourly rate for any time it cannot be used while airing out, plus a cleaning fee based on the cleanup required.

## Cancellations & Refunds

- Full refund if you cancel at least 48 hours before your reserved start time.
- No refund for cancellations made within 48 hours of the reserved start time.

## Release and Waiver of Liability

In this section, "Made Kulture" means Made Kulture LLC and its owners, agents, employees, affiliated independent contractors, management, bookers, related personnel, and any subsidiaries or affiliates.

- Made Kulture rents its facility, including limited equipment and props, with the understanding that in no event shall Made Kulture be liable for any direct, indirect, incidental, or consequential damages arising from the use of the building, facility, or equipment.
- You release Made Kulture from any and all liability for any injuries, whether physical or mental, sustained while participating in, working at, or shooting in the studio, or during any other activity connected with the space, or arising from any situation you encounter while renting.
- You agree not to sue or file any claim against Made Kulture arising out of such participation and/or photo shoots.
- Made Kulture is not responsible for any injuries, accidents, loss, or damage that occurs in the studio or on the premises, including loss or theft of personal equipment or property you bring.
- Made Kulture's total liability, should your shoot be delayed or cancelled due to a situation on the premises beyond our control, is limited to the amount of your rental fee.
- You agree to indemnify and hold Made Kulture harmless from any incidents, accidents, or claims arising from you or anyone in your party at 4825 Gulf Freeway, Houston, TX 77023 on your reserved date(s) or any dates added later.

## Responsibility for Your Party

You are solely responsible for the conduct and welfare of everyone you bring onto the premises, and you agree to make your representatives responsible for these terms.

## Premises & Monitoring

The premises may be monitored, including by security cameras. A Made Kulture representative may be present on-site or reachable during your rental.

## Agreement

By checking the box at checkout and completing your booking, you confirm that you have read, understood, and agree to this Individual Set Rental Agreement, Release, and Waiver on behalf of yourself and everyone in your party.`

export const DEFAULT_STUDIO_AGREEMENT = `# Full Warehouse Rental Agreement, Release & Waiver

By booking a full-warehouse buyout at Made Kulture and checking the box at checkout, you ("Renter") agree to the following terms on behalf of yourself and everyone in your party. Please read them carefully. (For individual set bookings, a separate agreement applies.)

## Eligibility

You must be at least 18 years old to book and to act as the responsible party on site. Made Kulture may require a valid photo ID.

## Rate & Guests

- The full-warehouse buyout is $100/hour with a 4-hour minimum (a $400 minimum), for up to 30 people.
- A buyout gives you private use of the entire warehouse and all sets for your booked time, so per-set guest limits do not apply.
- The maximum occupancy is 30 people. Parties larger than 30 require advance approval and may incur additional fees. Bringing more people than approved may result in additional charges or termination of the session.

## Payment

- Full payment is required at the time of booking and is processed securely by Square. We accept credit and debit cards. We cannot accept personal checks under any circumstances.
- Your card is saved on file and may be charged for session overages and any amounts owed under this agreement, including added time or equipment, cleaning fees, and repair or replacement costs for damage.

## Rental Hours

Monday–Sunday, 9:00 AM – 10:00 PM. Outside-hours bookings are available by request at the full-warehouse rate.

## Length of Use — Arrive and Leave On Time

- Your booked time includes all setup and breakdown. The space must be cleaned and vacated by the end of your rental period.
- Your set unlocks at your booked start time — you cannot enter before your session begins; arriving a few minutes early to be ready is encouraged. All setup and breakdown must occur within your booked time.
- Sessions running more than 15 minutes past your booked end time are automatically charged an additional hour (at the full-warehouse rate) to the card on file.
- No early drop-off or post-shoot pickup of equipment, props, etc., unless arranged in advance at the time of booking. Additional fees may apply. Any items left more than 48 hours after your rental will be considered abandoned and may be discarded.

## Private Use & Studio Rules

- During your buyout you have private, exclusive use of the entire warehouse and all sets.
- Nudity is permitted, as your party is the only booking on site.
- Special effects (fog, haze, smoke bombs, etc.), studio blackout, and projector use are available during a buyout. Messy concepts (paint, fake blood, glitter, excessive oils, etc.) must be approved in advance, and floors and surfaces must be protected with plastic or other suitable material so they are not damaged.
- Audio recording: The building is not soundproofed and sits near the I-45 freeway, so ambient noise may be present even during a private buyout.
- No illegal activity of any kind is permitted on the premises at any time.

## Cleaning & Damage

- Leave the space clean and as you found it — furniture returned to place, props returned to their original locations, and all lights, sound systems, and equipment turned off. Modeling lights and receivers must be turned off when not in use. A cleaning fee may apply based on the condition of the space — typically starting around $150, with a higher fee for messy concepts (paint, glitter, fake blood, oils, etc.).
- You are responsible for any equipment, furniture, fixtures, props, or other property that is mishandled, broken, damaged, ruined, or stolen during your rental. You agree to replace such items (with equivalent or better) or pay all repair/replacement costs within 48 hours, charged to the card on file if not otherwise paid.

## Smoke-Free Facility

Made Kulture is a smoke-free facility. Smoking and vaping are not permitted anywhere on the premises. Violations are subject to applicable state and local law and will result in cleaning and airing-out charges — including the hourly rate for any time the space cannot be used while airing out, plus a cleaning fee based on the cleanup required.

## Cancellations & Refunds

- Full refund if you cancel at least 48 hours before your reserved start time.
- No refund for cancellations made within 48 hours of the reserved start time.

## Release and Waiver of Liability

In this section, "Made Kulture" means Made Kulture LLC and its owners, agents, employees, affiliated independent contractors, management, bookers, related personnel, and any subsidiaries or affiliates.

- Made Kulture rents its facility, including limited equipment and props, with the understanding that in no event shall Made Kulture be liable for any direct, indirect, incidental, or consequential damages arising from the use of the building, facility, or equipment.
- You release Made Kulture from any and all liability for any injuries, whether physical or mental, sustained while participating in, working at, or shooting in the studio, or during any other activity connected with the space, or arising from any situation you encounter while renting.
- You agree not to sue or file any claim against Made Kulture arising out of such participation and/or photo shoots.
- Made Kulture is not responsible for any injuries, accidents, loss, or damage that occurs in the studio or on the premises, including loss or theft of personal equipment or property you bring.
- Made Kulture's total liability, should your shoot be delayed or cancelled due to a situation on the premises beyond our control, is limited to the amount of your rental fee.
- You agree to indemnify and hold Made Kulture harmless from any incidents, accidents, or claims arising from you or anyone in your party at 4825 Gulf Freeway, Houston, TX 77023 on your reserved date(s) or any dates added later.

## Responsibility for Your Party

You are solely responsible for the conduct and welfare of everyone you bring onto the premises, and you agree to make your representatives responsible for these terms.

## Premises & Monitoring

The premises may be monitored, including by security cameras. A Made Kulture representative may be present on-site or reachable during your rental.

## SMS / Text Message Consent

By providing your mobile phone number and completing this rental agreement, you expressly consent to receive SMS/text messages from Made Kulture related to your studio rental. These messages may include booking confirmations, reminders, session notifications, operational updates, and responses to your inquiries.

Message frequency varies based on your booking. Message and data rates may apply. Consent to receive text messages is not a condition of purchase, and messages may be sent using an automated system. You may opt out at any time by replying STOP to any message. For assistance, reply HELP or contact us at (832) 408-1631.

## Agreement

By checking the box at checkout and completing your booking, you confirm that you have read, understood, and agree to this Full Warehouse Rental Agreement, Release, and Waiver on behalf of yourself and everyone in your party.`

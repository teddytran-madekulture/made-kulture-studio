// Support Center FAQ (2026-10-07). Shown on /support (public, also the App
// Store + Google Play support URL) and /account/support (signed-in members).
//
// ⚠️ Answers are written from June's live knowledge base (agent_kb) as of
// 2026-10-07. When a policy changes, change it in BOTH places — June and this
// page must never tell customers different things (see the messy-concepts
// "four surfaces" lesson). Prices are deliberately left off: rates change and
// member vs guest pricing differs, so answers point to the booking pages.
//
// Answers are plain strings; [label](/path) becomes a link.

export type FaqItem = { q: string; a: string; tags?: string }
export type FaqSection = { id: string; title: string; items: FaqItem[] }

export const SUPPORT_TEXT = '(832) 408-1631'
export const SUPPORT_TEXT_HREF = 'sms:+18324081631'
export const SUPPORT_EMAIL = 'info@madekulture.com'

export const FAQ: FaqSection[] = [
  {
    id: 'booking',
    title: 'Booking',
    items: [
      { q: 'How do I book a set?', tags: 'reserve schedule appointment',
        a: 'All bookings are made online. Pick a set, choose your date and time, and check out. You can book as a guest or with a free account, which gives you the member rate, saved-card checkout and one place for all your bookings. [Book now](/book)' },
      { q: 'How far ahead do I need to book?', tags: 'advance notice last minute same day 48 hours',
        a: 'At least 48 hours ahead. Made Kulture Plus members can also book inside the 48-hour window: open hours can be booked instantly, and any other time can be requested. [About Plus](/plus)' },
      { q: 'How long can I book for?', tags: 'minimum increments duration hour',
        a: 'Bookings run in 30-minute increments with a 1-hour minimum (1 hour, 1.5 hours, 2 hours and so on). All setup and breakdown has to happen inside your booked time.' },
      { q: 'What’s the difference between a set and a full studio buyout?', tags: 'shared private warehouse buyout whole building',
        a: 'A set booking is one individual set during shared studio hours, for up to 5 people. Other sets may be in use by other customers at the same time. A full studio buyout gives you the entire warehouse for a private production, for up to 30 people.' },
      { q: 'How much does it cost?', tags: 'price rate cost hourly member guest',
        a: 'Each set’s hourly rate is shown on its page and at checkout. Members with a free account get a lower rate than guests. [See the sets](/sets)' },
      { q: 'What are your hours and where are you?', tags: 'address location hours open',
        a: 'Shared studio hours are 9am–10pm, Monday through Sunday. We’re at 4825 Gulf Freeway, Houston TX 77023. Bookings outside those hours are available on request at the full warehouse rate.' },
      { q: 'What’s included with a set?', tags: 'lights props included light',
        a: 'Every set includes one Amaran 200x LED light. Extra lights can be added at checkout. Props are included and are first come, first served during shared hours. Please return every prop to where you found it before your session ends.' },
      { q: 'Can I rent equipment?', tags: 'gear lights strobes haze fog projector camera rental',
        a: 'Yes. Lights, strobes, haze and ice-fog machines, a projector and more can be added to your booking. Equipment is for in-studio use only.' },
      { q: 'Can I switch sets during my session?', tags: 'change set move',
        a: 'No. A booking is for that specific set only. To use more than one set, book each one, or book a full studio buyout.' },
      { q: 'Can I book for a client or have someone else pay?', tags: 'pay for someone else client',
        a: 'Yes. Book under the name of whoever is running the shoot. If someone else is paying, or you need something set up differently, open a support ticket below and we’ll help.' },
    ],
  },
  {
    id: 'arrival',
    title: 'Arriving & door codes',
    items: [
      { q: 'Where do I find my door code?', tags: 'code door entry lock keypad check in',
        a: 'Your door code is NOT in your confirmation. When you arrive, open the check-in link from your confirmation text (or your booking in My Bookings), tap CHECK IN, and your code appears. The button opens 30 minutes before your start time. No signal at the door? Reply CODE to your confirmation text and we’ll text it back.' },
      { q: 'My door code isn’t working.', tags: 'code not working locked out keypad unlock',
        a: 'Type the code on the keypad, then press the UNLOCK button. The code does nothing on its own until you press unlock. Codes only work during your booked time. If you extended your session, you got a new code, so reopen your check-in link for the current one. Still stuck? Text us at (832) 408-1631.' },
      { q: 'Can I arrive early?', tags: 'early setup arrive',
        a: 'Your set unlocks at your booked start time, so guests can’t get in early. Plan to arrive a few minutes ahead and be ready to start on time.' },
      { q: 'Is there parking?', tags: 'parking car truck ramp',
        a: 'There’s limited parking out front and street parking at the rear. Only higher vehicles (SUVs, trucks, vans without tow hitches) should use the steep ramp to Studio One.' },
      { q: 'Is the studio air-conditioned?', tags: 'ac air conditioning heat cold temperature climate',
        a: 'There’s no central A/C. We use large fans for cooling and a heater for warmth, and partial A/C has been added as part of our ongoing upgrades. Dress for the weather.' },
    ],
  },
  {
    id: 'session',
    title: 'During your session',
    items: [
      { q: 'How many people can I bring?', tags: 'guests people party size crew limit',
        a: 'Up to 5 people total for a single set, including photographers, models, stylists, assistants, clients and children. A party of 6–7 can use one set with a per-person fee added at checkout. Larger groups need more sets or a full studio buyout (up to 30 people). Extra guests aren’t allowed on the premises even if they stay off set, and undeclared guests over the limit may be charged to the card on file.' },
      { q: 'Can I add time to my session?', tags: 'extend more time extra hour',
        a: 'Yes, if nobody is booked on your set after you. Ask from the set tablet or text us, and we’ll send a link to confirm and pay for the extra time. Your door code updates to match.' },
      { q: 'What happens if I go over my time?', tags: 'overtime late over time',
        a: 'Going more than 15 minutes over your booked time is charged as an additional hour.' },
      { q: 'How do I get help while I’m at the studio?', tags: 'help tablet team staff',
        a: 'Tap GET THE TEAM on the set tablet, or text us at (832) 408-1631.' },
      { q: 'What do I need to do before I leave?', tags: 'clean up checkout leave props',
        a: 'Put every prop back where you found it, leave the set clean, and finish breakdown before your time ends. A cleaning fee (minimum $150) may apply if the set isn’t left as you found it.' },
    ],
  },
  {
    id: 'rules',
    title: 'Studio rules',
    items: [
      { q: 'Can I use paint, glitter, fake blood or smoke bombs?', tags: 'messy paint glitter blood smoke oil powder',
        a: 'No. Paint, fake blood, glitter, smoke bombs and excessive oils aren’t allowed. Anything messy or outside normal studio use needs written approval from the studio before your shoot, and the answer is no unless it’s been approved in writing.' },
      { q: 'What are the rules for the water sets?', tags: 'pool tank water fish',
        a: 'Nothing goes in or near the water that could contaminate it: no paint, dyes, oils or similar. There are no exceptions, because contaminants stain the set and ruin the filtration. You can still get color with gels, lighting and wardrobe. Each water set is its own set and can’t be moved or combined with another set.' },
      { q: 'Can I use fog or haze?', tags: 'fog haze smoke machine',
        a: 'Only with a full studio buyout or when your party is the only booking in the building.' },
      { q: 'Can I record audio?', tags: 'audio sound video interview podcast noise',
        a: 'The studio isn’t soundproofed and sits near the I-45 freeway. For audio recording, we recommend a full studio buyout.' },
      { q: 'Is nudity allowed?', tags: 'nude implied boudoir',
        a: 'Not during shared bookings, unless your party is the only booking in the building. A full studio buyout is recommended.' },
      { q: 'Can I bring kids?', tags: 'children kids baby family',
        a: 'Yes, children are welcome and count toward your guest limit. Keep in mind it’s a shared working space.' },
      { q: 'Where can I read all the rules?', tags: 'rules terms policy',
        a: 'See our [Studio Rules](/studio-rules) and [Terms & Conditions](/terms).' },
    ],
  },
  {
    id: 'cancel',
    title: 'Changes, cancellations & credit',
    items: [
      { q: 'How do I cancel or reschedule?', tags: 'cancel reschedule change move date',
        a: 'From My Bookings, or the manage link in your confirmation email. Once a session has started it can’t be cancelled online, so text us instead.' },
      { q: 'Do you give refunds?', tags: 'refund money back',
        a: 'Made Kulture gives studio credit instead of refunds. Credit never expires and applies automatically to your next booking.' },
      { q: 'What’s the cancellation policy?', tags: 'cancellation policy 48 hours late fee',
        a: 'Cancel 48 or more hours before your start time and the full booking value comes back as studio credit. Cancellations within 48 hours aren’t credited, unless you’re a Plus member, who gets full credit any time before the session starts. Full warehouse bookings cancelled within 48 hours carry a 25% late fee for everyone, Plus included, and the other 75% comes back as credit.' },
      { q: 'Where do I see my studio credit?', tags: 'credit balance',
        a: 'Your balance shows on your account dashboard and at checkout, where it applies automatically. You can choose not to use it on a booking.' },
      { q: 'I need a receipt or invoice.', tags: 'receipt invoice itemized',
        a: 'Receipts are emailed after payment. Need an itemized receipt or invoice? Open a support ticket below with your booking date.' },
    ],
  },
  {
    id: 'plus',
    title: 'Made Kulture Plus',
    items: [
      { q: 'What is Made Kulture Plus?', tags: 'plus membership member perks',
        a: 'Plus is our paid yearly membership. On top of a free account, it adds short-notice booking inside the 48-hour window, cancellation protection, and no-show credit on request. It doesn’t change the hourly booking rate. [Learn more](/plus)' },
      { q: 'How does short-notice booking work?', tags: 'short notice last minute 48 hours request',
        a: 'Inside the 48-hour window, Plus members can instantly book hours that are already open (at least 2 hours ahead), or request any other time. If we approve a request, your card is charged and the booking is confirmed by text and email. An open-looking time isn’t a guarantee.' },
      { q: 'Does Plus renew automatically?', tags: 'renew auto renew billing cancel plus',
        a: 'Yes, it renews each year on the card on file at the standard annual rate. You can turn off auto-renew any time from your account. Your benefits continue to the end of the paid term and you won’t be charged again. Membership fees aren’t refundable.' },
    ],
  },
  {
    id: 'account',
    title: 'Account & app',
    items: [
      { q: 'Do I need an account to book?', tags: 'guest account sign up free',
        a: 'No, you can book as a guest. A free account gets you the member rate, saved-card checkout, your bookings and credit in one place, and the creative directory. [Create an account](/signup)' },
      { q: 'I can’t sign in.', tags: 'login password forgot reset sign in',
        a: 'Use Forgot password on the login screen. If you signed up with Google or Apple, use that same button. Still stuck? Open a ticket below.' },
      { q: 'How do I change my email or password?', tags: 'email password change security',
        a: 'Go to Settings → Login & Security.' },
      { q: 'How do I add or remove a saved card?', tags: 'card payment method saved',
        a: 'Go to Settings → Payment Methods. A card attached to an upcoming booking can’t be removed until that booking is done.' },
      { q: 'How do I turn notifications on or off?', tags: 'notifications push alerts',
        a: 'In the app, open your phone’s Settings, find Made Kulture, then Notifications. On the website, go to [Get the app](/account/app).' },
      { q: 'How do I update the app?', tags: 'update app version',
        a: 'Most changes show up automatically the next time you open the app. Occasionally there’s an update in the App Store or Google Play. Turn on automatic updates to always have the latest.' },
      { q: 'How do I delete my account?', tags: 'delete account remove data privacy close',
        a: 'Go to Settings → Login & Security → Delete account. This permanently deletes your login, profile, directory listing, portfolio, messages, saved cards and any studio credit. A Plus membership stops renewing and isn’t refunded. Past booking records are kept for our business records. You’ll need to cancel or finish any upcoming bookings first. Can’t sign in? Open a ticket and we’ll delete it for you.' },
    ],
  },
  {
    id: 'community',
    title: 'Directory & castings',
    items: [
      { q: 'How do I get listed in the creative directory?', tags: 'directory listed profile find me',
        a: 'Turn on “List me in the creative directory” in your profile. You’ll need a name, a short bio, at least one role (brands don’t need one), and at least one portfolio photo, link or Instagram handle. If you opted in but can’t find yourself, your profile page shows a checklist of what’s missing.' },
      { q: 'How do castings work?', tags: 'casting call apply post',
        a: 'Members can post castings and apply to others from the Castings tab. The person who posted gets notified when someone applies, and you can message each other directly.' },
      { q: 'Someone is being inappropriate. How do I report it?', tags: 'report abuse harassment block spam',
        a: 'Use Report on their portfolio photo or service listing, or open a support ticket below with their name. We review every report.' },
    ],
  },
  {
    id: 'visit',
    title: 'Tours',
    items: [
      { q: 'Can I tour the studio first?', tags: 'tour visit see walk through',
        a: 'Yes, tours are free and take about 30 minutes. Pick a listed time or request one, and we’ll confirm by text. [Book a tour](/tour)' },
    ],
  },
]

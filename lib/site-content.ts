import { createClient } from '@supabase/supabase-js'

// ── Editable marketing-site text content (the CMS layer) ──────────────────────
// A schema-driven content store. Each editable field is declared once in
// CONTENT_SCHEMA (label, type, group, default). The editor at /admin/website/home
// renders inputs from the schema; the pages read resolved values (override or
// default). Adding a new editable field = add one entry here + read it in the
// page. See migration 065.

export type FieldType = 'text' | 'multiline' | 'url' | 'list'

// For 'list' (repeater) fields: the shape of one item. The field's `default`
// is a JSON string of an array of items; pages parse it with parseList()
// (lib/content-list.ts).
export type ListItemField = {
  key: string
  label: string
  type: 'text' | 'multiline'
}

export type ContentField = {
  key: string           // unique within the page, e.g. 'heroHeadline'
  label: string         // shown in the editor
  type: FieldType
  group: string         // section grouping in the editor, e.g. 'Hero'
  default: string
  hint?: string
  item?: ListItemField[]  // required when type === 'list'
}

export type ContentPage = {
  slug: string          // e.g. 'home'
  label: string         // e.g. 'Home page'
  fields: ContentField[]
}

// ── Home page fields ──────────────────────────────────────────────────────────
// `default` MUST match what the page renders today so nothing changes until the
// admin overrides a field. Multiline values use \n for line breaks.
const HOME_FIELDS: ContentField[] = [
  // Hero
  { key: 'heroEyebrow',       label: 'Eyebrow (small caps line)', type: 'text',      group: 'Hero', default: 'A CREATIVE SPACE DESIGNED FOR VISIONARIES' },
  { key: 'heroHeadline',      label: 'Headline',                  type: 'multiline', group: 'Hero', default: 'CREATE\nWITHOUT\nLIMITS', hint: 'One line per row. Kept in the big display font.' },
  { key: 'heroParagraph',     label: 'Intro paragraph',           type: 'multiline', group: 'Hero', default: 'Madekulture is a multi-set creative studio built for photographers, videographers, brands, and creators. Bring your ideas to life.' },
  { key: 'heroPrimaryLabel',  label: 'Primary button label',      type: 'text',      group: 'Hero', default: 'Book a Set' },
  { key: 'heroPrimaryHref',   label: 'Primary button link',       type: 'url',       group: 'Hero', default: '/book?type=set' },
  { key: 'heroSecondaryLabel',label: 'Secondary button label',    type: 'text',      group: 'Hero', default: 'Full Studio Takeover' },
  { key: 'heroSecondaryHref', label: 'Secondary button link',     type: 'url',       group: 'Hero', default: '/book?type=studio' },
  { key: 'heroFinePrint',     label: 'Fine print under buttons',  type: 'text',      group: 'Hero', default: 'By appointment only · Book online in advance · No walk-ins' },

  // Feature tiles (the 5-up bar under the hero)
  { key: 'featureTiles', label: 'Feature tiles', type: 'list', group: 'Features',
    item: [
      { key: 'icon',  label: 'Icon (symbol/emoji)', type: 'text' },
      { key: 'title', label: 'Title',               type: 'text' },
      { key: 'desc',  label: 'Text',                type: 'multiline' },
    ],
    default: JSON.stringify([
      { icon: '\u229e', title: 'MULTIPLE SETS',     desc: 'Centrally located 4825 Gulf Fwy. Houston TX 77023' },
      { icon: '\u25ce', title: 'PRIVATE OR SHARED', desc: 'Book a single set or take over the studio.' },
      { icon: '\u25f7', title: 'FLEXIBLE HOURS',    desc: 'By the hour. Stay as long as you need.' },
      { icon: '\u25c8', title: 'PROPS & EQUIPMENT', desc: 'Everything on hand. Nothing to lug in.' },
      { icon: '\u25c9', title: 'EASY ACCESS',       desc: 'Centrally located in Houston, TX.' },
    ]),
    hint: 'The row of five tiles under the hero. On phones they show two per row.' },

  // Sets section
  { key: 'setsEyebrow', label: 'Eyebrow',         type: 'text',      group: 'Sets', default: 'EXPLORE OUR SETS' },
  { key: 'setsHeading', label: 'Heading',         type: 'multiline', group: 'Sets', default: 'MULTIPLE SETS.\nENDLESS POSSIBILITIES.' },
  { key: 'setsNote',    label: 'Note under heading', type: 'text',   group: 'Sets', default: 'Rates shown are guest prices — members save $10/hr with a free account.' },

  // Closing CTA
  { key: 'ctaEyebrow',     label: 'Eyebrow',       type: 'text',      group: 'Closing CTA', default: 'MADEKULTURE / HOUSTON' },
  { key: 'ctaHeading',     label: 'Heading',       type: 'multiline', group: 'Closing CTA', default: "LET'S\nMAKE IT." },
  { key: 'ctaButtonLabel', label: 'Button label',  type: 'text',      group: 'Closing CTA', default: 'BOOK THE STUDIO ↗' },
  { key: 'ctaButtonHref',  label: 'Button link',   type: 'url',       group: 'Closing CTA', default: '/book' },

  // Footer
  { key: 'footerBlurb',   label: 'Blurb',      type: 'multiline', group: 'Footer', default: 'A multi-set creative studio in Houston built for photographers, videographers, brands, and creators.' },
  { key: 'footerAddress', label: 'Address block', type: 'multiline', group: 'Footer', default: '4825 Gulf Fwy.\nHouston, TX 77023' },
  { key: 'footerEmail',   label: 'Contact email', type: 'text',    group: 'Footer', default: 'info@madekulture.com' },
  { key: 'footerPhone',   label: 'Contact phone', type: 'text',    group: 'Footer', default: '(832) 408-1631' },
]

// ── Sets page fields ──────────────────────────────────────────────────────────
// Tokens: {sets} = live set count, {min} = lowest hourly rate, {rate} = live
// buyout rate. The page substitutes them at render.
const SETS_FIELDS: ContentField[] = [
  { key: 'heroEyebrow',        label: 'Eyebrow (small caps line)', type: 'text',      group: 'Hero', default: '4825 GULF FREEWAY \u00b7 HOUSTON TX' },
  { key: 'heroHeadline',       label: 'Headline',                  type: 'multiline', group: 'Hero', default: 'SETS &\nSPACES', hint: 'One line per row.' },
  { key: 'heroParagraph',      label: 'Intro paragraph',           type: 'multiline', group: 'Hero', default: 'Distinct sets under one open warehouse. Book a single space or take over the whole studio \u2014 every set is a blank canvas styled to your vision.' },
  { key: 'heroPrimaryLabel',   label: 'Primary button label',      type: 'text',      group: 'Hero', default: 'BOOK A SET \u2197' },
  { key: 'heroPrimaryHref',    label: 'Primary button link',       type: 'url',       group: 'Hero', default: '/book?type=set' },
  { key: 'heroSecondaryLabel', label: 'Secondary button label',    type: 'text',      group: 'Hero', default: 'FULL BUYOUT \u2197' },
  { key: 'heroSecondaryHref',  label: 'Secondary button link',     type: 'url',       group: 'Hero', default: '/book?type=studio' },

  { key: 'stats', label: 'Stats bar', type: 'list', group: 'Stats',
    item: [
      { key: 'value', label: 'Big value', type: 'text' },
      { key: 'label', label: 'Small label', type: 'text' },
    ],
    default: JSON.stringify([
      { value: '{sets}',       label: 'DISTINCT SETS' },
      { value: '${min}',       label: 'STARTING / HR' },
      { value: '10K+',         label: 'SQ FT TOTAL' },
      { value: '9AM\u201310PM',   label: 'DAILY HOURS' },
    ]),
    hint: 'You can use {sets} for the live set count, {min} for the lowest hourly rate, and {rate} for the buyout rate.' },

  { key: 'indivEyebrow',  label: 'Eyebrow above heading', type: 'text', group: 'Individual sets', default: 'SHARED STUDIO \u2014 ${min}/HR EACH', hint: '{min} = lowest hourly rate.' },
  { key: 'indivHeading',  label: 'Heading',               type: 'text', group: 'Individual sets', default: 'INDIVIDUAL SETS' },
  { key: 'indivFootnote', label: 'Footnote under the grid', type: 'multiline', group: 'Individual sets', default: 'Each set includes one Amaran 200x LED light. Additional lights available for $25/each. Up to 5 people per set.' },

  { key: 'buyoutEyebrow',  label: 'Eyebrow', type: 'text',      group: 'Full studio takeover', default: 'FULL WAREHOUSE \u2014 ${rate}/HR \u00b7 4HR MIN', hint: '{rate} = live buyout rate.' },
  { key: 'buyoutHeadline', label: 'Headline', type: 'multiline', group: 'Full studio takeover', default: 'FULL STUDIO\nTAKEOVER', hint: 'One line per row.' },
  { key: 'buyoutDesc',     label: 'Description', type: 'multiline', group: 'Full studio takeover', default: 'The entire warehouse is yours. Every set, all equipment, and full creative freedom \u2014 with zero other productions on site. Built for large crews, music videos, brand campaigns, and productions that need room to breathe.' },
  { key: 'buyoutCapacity', label: 'Capacity', type: 'text', group: 'Full studio takeover', default: '30 people' },
  { key: 'buyoutSqft',     label: 'Space',    type: 'text', group: 'Full studio takeover', default: '~10,000 sq ft' },
  { key: 'buyoutIncludes', label: 'Includes', type: 'text', group: 'Full studio takeover', default: 'All sets + Studio One' },
  { key: 'buyoutTags',     label: 'Tags',     type: 'text', group: 'Full studio takeover', default: 'Full Warehouse, All Sets, Studio One, Private, Up to 30 People', hint: 'Comma-separated.' },

  { key: 'footerNote',     label: 'Bottom note',       type: 'multiline', group: 'Bottom bar', default: 'All bookings require 48hr advance notice. Cancellations within 48hrs are non-refundable.\nText us at (832) 408-1631 with questions.' },
  { key: 'footerCtaLabel', label: 'Bottom button label', type: 'text',    group: 'Bottom bar', default: 'BOOK NOW' },
  { key: 'footerCtaHref',  label: 'Bottom button link',  type: 'url',     group: 'Bottom bar', default: '/book' },
]

// ── Studio Rules page fields ──────────────────────────────────────────────────
const FAQ_ITEM: ListItemField[] = [
  { key: 'q', label: 'Question', type: 'text' },
  { key: 'a', label: 'Answer',   type: 'multiline' },
]

const STUDIO_RULES_FIELDS: ContentField[] = [
  { key: 'eyebrow',  label: 'Eyebrow (small caps line)', type: 'text',      group: 'Header', default: 'POLICIES & FAQ' },
  { key: 'headline', label: 'Headline',                  type: 'multiline', group: 'Header', default: 'STUDIO\nRULES', hint: 'One line per row.' },
  { key: 'intro',    label: 'Intro paragraph',           type: 'multiline', group: 'Header', default: 'Everything you need to know before you book. Read through before your session \u2014 these policies keep the space running smoothly for everyone.' },

  { key: 'faq1Title', label: 'Section title', type: 'text', group: 'Section 1 \u00b7 Booking',       default: 'BOOKING' },
  { key: 'faq1Items', label: 'Questions',     type: 'list', group: 'Section 1 \u00b7 Booking',       item: FAQ_ITEM, default: JSON.stringify([
    { q: 'How far in advance do I need to book?', a: 'All bookings must be made at least 48 hours in advance. A card on file is required at checkout to cover any session overages.' },
    { q: 'What is the cancellation policy?', a: 'You may cancel or reschedule up to 48 hours before your session start time for a full refund, including all fees. Cancellations made less than 48 hours before your session are non-refundable.' },
    { q: 'Can I arrive early?', a: 'Your set unlocks at your booked start time \u2014 the door code activates then, so you will not be able to get in before your session begins. We still recommend arriving a few minutes early so you are ready to make the most of your time. All setup, shooting, and breakdown happen within your booked hours.' },
    { q: 'Can I book outside of business hours?', a: 'Yes. Outside-hours bookings are available upon request and are billed at the full warehouse rate. Overages that run past closing time are also charged at the full warehouse rate.' },
    { q: 'Can I add more time during my session?', a: 'Yes \u2014 if no booking immediately follows yours on that set, you can extend your session on the spot. Additional time is charged at the standard hourly rate for your set.' },
  ]) },

  { key: 'faq2Title', label: 'Section title', type: 'text', group: 'Section 2 \u00b7 Guest limits',  default: 'GUEST LIMITS' },
  { key: 'faq2Items', label: 'Questions',     type: 'list', group: 'Section 2 \u00b7 Guest limits',  item: FAQ_ITEM, default: JSON.stringify([
    { q: 'How many people can I bring?', a: 'Individual set bookings allow up to 5 people total. This includes everyone in your party \u2014 photographers, videographers, models, stylists, makeup artists, hair stylists, wardrobe stylists, talent, clients, friends, family, and children. No exceptions.' },
    { q: 'What is the limit for a full studio buyout?', a: 'Full studio buyouts allow up to 30 people on the premises at one time.' },
    { q: 'What if I need more people than my set allows?', a: 'You can book multiple sets simultaneously, which increases your total headcount allowance and gives you access to more space and lighting. Or you can upgrade to a full studio buyout for the most flexibility.' },
    { q: 'Can extra people wait outside my set?', a: 'No. Extra guests are not permitted anywhere on the premises, even if they are not actively on the set. If your party exceeds the limit, you will need to remove guests or upgrade your booking.' },
  ]) },

  { key: 'faq3Title', label: 'Section title', type: 'text', group: 'Section 3 \u00b7 Your set',      default: 'YOUR SET' },
  { key: 'faq3Items', label: 'Questions',     type: 'list', group: 'Section 3 \u00b7 Your set',      item: FAQ_ITEM, default: JSON.stringify([
    { q: 'What does my set booking include?', a: 'Each set comes with one Amaran 200x LED light. Additional lights can be added for $25 each. Props are available on a first-come, first-served basis during shared studio hours and are included with your standard rental.' },
    { q: 'Can I switch sets during my session?', a: 'No. Your reservation is for the specific set you booked. If you need multiple sets, you must book them at the same time or upgrade to a full studio buyout.' },
    { q: 'Do I need to clean up before I leave?', a: 'Yes. All props and support equipment must be returned to their original locations before your session ends. The space should be left the way you found it for the next booking.' },
    { q: 'What if I go over my time?', a: 'Overages past 15 minutes are automatically charged an additional full hour at your set rate.' },
  ]) },

  { key: 'faq4Title', label: 'Section title', type: 'text', group: 'Section 4 \u00b7 Studio rules',  default: 'STUDIO RULES' },
  { key: 'faq4Items', label: 'Questions',     type: 'list', group: 'Section 4 \u00b7 Studio rules',  item: FAQ_ITEM, default: JSON.stringify([
    { q: 'Studio etiquette', a: 'Made Kulture is a shared creative space. Be respectful of other productions in the studio \u2014 do not disturb anyone who prefers privacy during their session. Keep noise at a reasonable level during shared hours.' },
    { q: 'Is nudity allowed?', a: 'Nudity is not permitted during shared studio hours unless your party is the only booking in the studio at that time. Cover up while moving through common areas. For guaranteed privacy, consider a full studio buyout.' },
    { q: 'Can I record audio?', a: 'The studio is not soundproofed and sits near the I-45 freeway. During shared hours, we cannot control noise from fans, other bookings, or ambient traffic. For audio recording, a full studio buyout is strongly recommended.' },
    { q: 'Are children allowed?', a: 'Children are allowed, but keep in mind this is an active shared space. Other productions on-site during shared hours may not always be appropriate for young audiences, and warehouse conditions may not be suitable for small children. Children count toward your guest limit.' },
    { q: 'What is the messy concept and cleaning fee policy?', a: 'Messy concepts \u2014 including paint, fake blood, glitter, excessive oils, waxes, smoke bombs, and similar materials \u2014 must be pre-approved before your session. Failure to clean up or comply with these rules will result in a minimum $150 cleaning charge.' },
    { q: 'Can I use fog machines, haze, or special effects?', a: 'Atmospheric effects (fog, haze, smoke bombs, etc.) are not permitted during shared studio bookings. They are available for full studio buyouts and solo bookings only. Studio blackout for controlled lighting or projector use follows the same rule \u2014 primarily available for buyouts or solo bookings.' },
    { q: 'Can I use the additional lights on another set?', a: 'No. Additional lights must stay within your booked set. Taking lights from a closed-off set without permission will result in an automatic charge. You will not be notified in advance \u2014 the charge is applied directly.' },
  ]) },

  { key: 'faq5Title', label: 'Section title', type: 'text', group: 'Section 5 \u00b7 Parking & access', default: 'PARKING & ACCESS' },
  { key: 'faq5Items', label: 'Questions',     type: 'list', group: 'Section 5 \u00b7 Parking & access', item: FAQ_ITEM, default: JSON.stringify([
    { q: 'Where do I park?', a: 'There is limited parking at the front of the building. Additional street parking is available in the rear.' },
    { q: 'Can I drive into the back to access Studio One?', a: 'Only taller vehicles \u2014 standard-height trucks, SUVs, and vans without tow hitches \u2014 can navigate the steep rear ramp without undercarriage damage. Low-clearance vehicles should park at the front or on the street.' },
  ]) },

  { key: 'faq6Title', label: 'Section title', type: 'text', group: 'Section 6 \u00b7 Amenities',     default: 'AMENITIES' },
  { key: 'faq6Items', label: 'Questions',     type: 'list', group: 'Section 6 \u00b7 Amenities',     item: FAQ_ITEM, default: JSON.stringify([
    { q: 'Is there air conditioning?', a: 'The studio does not have central A/C. Large fans are available for cooling, and a natural gas heater keeps the space warm in colder months. Phase 3 upgrades \u2014 including partial air conditioning \u2014 are in progress.' },
    { q: 'Are there props available?', a: 'Yes \u2014 props are included with your standard rental. During shared studio hours, props are first come, first served. All props must be returned to their original locations before your session ends.' },
  ]) },

  { key: 'ctaHeading', label: 'Heading',  type: 'text', group: 'Bottom bar', default: 'READY TO BOOK?' },
  { key: 'ctaSub',     label: 'Subline',  type: 'text', group: 'Bottom bar', default: 'Questions? Text us at (832) 408-1631 \u2014 we respond to text only.' },
]

// ── Props page fields ─────────────────────────────────────────────────────────
const PROPS_FIELDS: ContentField[] = [
  { key: 'eyebrow',  label: 'Eyebrow (small caps line)', type: 'text',      group: 'Header', default: 'STUDIO PROPS' },
  { key: 'headline', label: 'Headline',                  type: 'text',      group: 'Header', default: 'A SINGLE PROP CAN MAKE THE SHOT' },
  { key: 'intro',    label: 'Intro paragraph',           type: 'multiline', group: 'Header', default: "A growing directory of what's available. All props are included with the standard booking and live throughout the space \u2014 style your set as simple or elaborate as you like, then return them roughly where you found them before your session ends. Not everything is listed yet; we're always adding more." },
]

// ── Gear (equipment) page fields ──────────────────────────────────────────────
const GEAR_FIELDS: ContentField[] = [
  { key: 'headline', label: 'Headline',        type: 'text',      group: 'Header', default: 'EQUIPMENT' },
  { key: 'intro',    label: 'Intro paragraph', type: 'multiline', group: 'Header', default: 'Everything available to rent in-studio, with pricing. Add any of it to your session during booking \u2014 no need to reserve gear here.' },
  { key: 'ctaLabel', label: 'Button label',    type: 'text',      group: 'Header', default: 'BOOK A SESSION \u2197' },
  { key: 'ctaHref',  label: 'Button link',     type: 'url',       group: 'Header', default: '/book' },
]

// ── Book flow fields (step 1 copy + header) ──────────────────────────────────
// Tokens: {min} / {max} = live set rate range, {rate} = live buyout rate.
const BOOK_FIELDS: ContentField[] = [
  { key: 'headerLabel',     label: 'Top-bar label',            type: 'text', group: 'Header', default: 'BOOK A SESSION' },
  { key: 'setCardTitle',    label: 'Individual set \u2014 title',   type: 'text', group: 'Booking type cards', default: 'INDIVIDUAL SET' },
  { key: 'setCardSub',      label: 'Individual set \u2014 subline', type: 'text', group: 'Booking type cards', default: 'Reserve one set by the hour. ${min}\u2013${max}/hr.', hint: '{min} and {max} are the live set rate range.' },
  { key: 'setCardLimit',    label: 'Individual set \u2014 limit line', type: 'text', group: 'Booking type cards', default: 'Up to 5 people per set' },
  { key: 'studioCardTitle', label: 'Full studio \u2014 title',      type: 'text', group: 'Booking type cards', default: 'FULL STUDIO TAKEOVER' },
  { key: 'studioCardSub',   label: 'Full studio \u2014 subline',    type: 'text', group: 'Booking type cards', default: 'Entire warehouse \u2014 all sets, private.' },
  { key: 'studioCardLimit', label: 'Full studio \u2014 limit line', type: 'text', group: 'Booking type cards', default: 'Up to 30 people' },
]

// ── Tour page fields ──────────────────────────────────────────────────────────
const TOUR_FIELDS: ContentField[] = [
  { key: 'headline', label: 'Headline',        type: 'text',      group: 'Header', default: 'TOUR THE STUDIO' },
  { key: 'intro',    label: 'Intro paragraph', type: 'multiline', group: 'Header', default: 'Free 30-minute walkthrough of all nine sets. Pick a time below \u2014 we confirm every tour by text, usually fast.' },
  { key: 'footnote', label: 'Fine print under the button', type: 'text', group: 'Header', default: 'Tours are confirmed by text. Questions? Text (832) 408-1631.' },
]

export const CONTENT_PAGES: ContentPage[] = [
  { slug: 'home',         label: 'Home page',    fields: HOME_FIELDS },
  { slug: 'sets',         label: 'Sets page',    fields: SETS_FIELDS },
  { slug: 'studio-rules', label: 'Studio Rules', fields: STUDIO_RULES_FIELDS },
  { slug: 'props',        label: 'Props page',   fields: PROPS_FIELDS },
  { slug: 'gear',         label: 'Gear page',    fields: GEAR_FIELDS },
  { slug: 'book',         label: 'Book flow',    fields: BOOK_FIELDS },
  { slug: 'tour',         label: 'Tour page',    fields: TOUR_FIELDS },
]

export function getContentPage(slug: string): ContentPage | undefined {
  return CONTENT_PAGES.find(p => p.slug === slug)
}

// Resolved values for a page: { key: value } with every field present
// (override if set, else the code default). Typed loosely as a string map.
export type PageContent = Record<string, string>

function defaultsFor(slug: string): PageContent {
  const page = getContentPage(slug)
  const out: PageContent = {}
  if (page) for (const f of page.fields) out[f.key] = f.default
  return out
}

// Server-side fetch of a page's content, merged over the code defaults.
export async function getPageContent(slug: string): Promise<PageContent> {
  const base = defaultsFor(slug)
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        // Bypass Next's Data Cache so edits appear immediately (see site-images.ts).
        global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) },
      }
    )
    const { data, error } = await supabase.from('site_content').select('key, value').eq('page', slug)
    if (error || !data) return base
    for (const row of data) {
      if (row.key && row.value != null && base[row.key] !== undefined) {
        base[row.key] = typeof row.value === 'string' ? row.value : String(row.value)
      }
    }
    return base
  } catch {
    return base
  }
}

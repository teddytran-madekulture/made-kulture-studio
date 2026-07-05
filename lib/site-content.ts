import { createClient } from '@supabase/supabase-js'

// ── Editable marketing-site text content (the CMS layer) ──────────────────────
// A schema-driven content store. Each editable field is declared once in
// CONTENT_SCHEMA (label, type, group, default). The editor at /admin/content
// renders inputs from the schema; the pages read resolved values (override or
// default). Adding a new editable field = add one entry here + read it in the
// page. See migration 065.

export type FieldType = 'text' | 'multiline' | 'url'

export type ContentField = {
  key: string           // unique within the page, e.g. 'heroHeadline'
  label: string         // shown in the editor
  type: FieldType
  group: string         // section grouping in the editor, e.g. 'Hero'
  default: string
  hint?: string
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

  // Sets section
  { key: 'setsEyebrow', label: 'Eyebrow',         type: 'text',      group: 'Sets section', default: 'EXPLORE OUR SETS' },
  { key: 'setsHeading', label: 'Heading',         type: 'multiline', group: 'Sets section', default: 'MULTIPLE SETS.\nENDLESS POSSIBILITIES.' },
  { key: 'setsNote',    label: 'Note under heading', type: 'text',   group: 'Sets section', default: 'Rates shown are guest prices — members save $10/hr with a free account.' },

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

export const CONTENT_PAGES: ContentPage[] = [
  { slug: 'home', label: 'Home page', fields: HOME_FIELDS },
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

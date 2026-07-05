import { createClient } from '@supabase/supabase-js'

// ── Editable home-page image slots ────────────────────────────────────────────
// Each slot is a swappable image on the marketing home page. The admin uploads
// replacements at /admin/homepage; uploads land in the public 'site' bucket and
// a row in `site_images` overrides the default below. `aspect` (w/h) drives the
// crop frame so uploads match how the slot is displayed.

export type SiteImageSlot = {
  slug: string
  label: string
  group: 'Hero' | 'Sets' | 'Studio'
  aspect: number      // width / height, for the cropper + preview
  outWidth?: number   // exported JPEG width (defaults to 1000); larger for full-bleed slots
  hint?: string
}

export const SITE_IMAGE_SLOTS: SiteImageSlot[] = [
  { slug: 'hero',         label: 'Hero background', group: 'Hero',   aspect: 16 / 9, outWidth: 3840, hint: 'Full-screen image behind “Create Without Limits”. Upload your full-resolution file for max sharpness.' },
  { slug: 'set-a',        label: 'Set A',            group: 'Sets',   aspect: 4 / 3 },
  { slug: 'set-b',        label: 'Set B',            group: 'Sets',   aspect: 4 / 3 },
  { slug: 'set-c',        label: 'Set C',            group: 'Sets',   aspect: 4 / 3 },
  { slug: 'set-d',        label: 'Set D',            group: 'Sets',   aspect: 4 / 3 },
  { slug: 'concrete',     label: 'Concrete',         group: 'Sets',   aspect: 4 / 3 },
  { slug: 'vintage',      label: 'Vintage',          group: 'Sets',   aspect: 4 / 3 },
  { slug: 'cottage',      label: 'Cottage',          group: 'Sets',   aspect: 4 / 3 },
  { slug: 'watering-hole',label: 'The Watering Hole',group: 'Sets',   aspect: 4 / 3 },
  { slug: 'studio-one',   label: 'Studio One',       group: 'Sets',   aspect: 4 / 3 },
  { slug: 'studio-photo', label: 'Studio photo',     group: 'Studio', aspect: 4 / 5, outWidth: 1600, hint: 'Tall photo in the “Built for the Obsessed” section.' },
]

export const SITE_IMAGE_SLUGS = SITE_IMAGE_SLOTS.map(s => s.slug)

export type SiteImages = Record<string, string>

// Server-side fetch of the current overrides. Returns { slug: url } for every
// slot that has an uploaded image; slots without an upload are simply absent.
export async function getSiteImages(): Promise<SiteImages> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        // Bypass Next.js's Data Cache so freshly uploaded images appear
        // immediately instead of serving a stale (empty) cached read.
        global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) },
      }
    )
    const { data, error } = await supabase.from('site_images').select('slug, url')
    if (error || !data) return {}
    const out: SiteImages = {}
    for (const row of data) if (row.slug && row.url) out[row.slug] = row.url
    return out
  } catch {
    return {}
  }
}

import { createClient } from '@supabase/supabase-js'

// ── Editable home-page settings (non-image knobs) ─────────────────────────────
// Simple key/value store the admin tunes from /admin/homepage. Rows override the
// defaults below; a missing row falls back to the default. See migration 064.

export type SiteSettings = {
  heroHeightVh: number   // desktop hero band height, in vh
}

export const SITE_SETTINGS_DEFAULTS: SiteSettings = {
  heroHeightVh: 85,
}

// Allowed range for the hero band height (keeps the slider + API in sync).
export const HERO_HEIGHT_MIN = 40
export const HERO_HEIGHT_MAX = 100

export function clampHeroHeight(v: number): number {
  if (!Number.isFinite(v)) return SITE_SETTINGS_DEFAULTS.heroHeightVh
  return Math.min(HERO_HEIGHT_MAX, Math.max(HERO_HEIGHT_MIN, Math.round(v)))
}

// Server-side fetch of the current settings, merged over the defaults.
export async function getSiteSettings(): Promise<SiteSettings> {
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
    const { data, error } = await supabase.from('site_settings').select('key, value')
    if (error || !data) return { ...SITE_SETTINGS_DEFAULTS }

    const map: Record<string, string> = {}
    for (const row of data) if (row.key) map[row.key] = row.value

    const out: SiteSettings = { ...SITE_SETTINGS_DEFAULTS }
    if (map.hero_height_vh != null) out.heroHeightVh = clampHeroHeight(parseFloat(map.hero_height_vh))
    return out
  } catch {
    return { ...SITE_SETTINGS_DEFAULTS }
  }
}

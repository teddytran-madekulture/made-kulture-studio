// Shared props directory helpers. Props are a browse-only catalog (no price).

export const PROP_CATEGORIES = ['Misc', 'Bench', 'Tables', 'Sofas', 'Chairs', 'Fitness'] as const

export interface Prop {
  id: string
  name: string
  category: string | null
  description: string | null
  image_url: string | null
  needs_repair: boolean
  is_active: boolean
  sort_order: number
  slug?: string | null
  gallery?: string[]
  created_at?: string
}

export const PROP_COLUMNS = 'id, name, category, description, image_url, needs_repair, is_active, sort_order, slug, gallery, created_at'

// URL-safe slug from a display name.
export function slugify(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Whitelist + coerce an incoming prop payload for insert/update.
export function sanitizeProp(body: any) {
  const row: Record<string, unknown> = {}
  if (typeof body.name === 'string')         row.name         = body.name.trim()
  if (typeof body.category === 'string')     row.category     = body.category.trim() || null
  if (typeof body.description === 'string')  row.description  = body.description.trim() || null
  if (typeof body.image_url === 'string')    row.image_url    = body.image_url.trim() || null
  if (typeof body.slug === 'string')         row.slug         = body.slug.trim() || null
  if (Array.isArray(body.gallery))           row.gallery      = body.gallery.filter((u: any) => typeof u === 'string')
  if (body.needs_repair !== undefined)       row.needs_repair = Boolean(body.needs_repair)
  if (body.is_active !== undefined)          row.is_active    = Boolean(body.is_active)
  if (body.sort_order !== undefined)         row.sort_order   = parseInt(String(body.sort_order), 10) || 0
  return row
}

// Media Library — pure, client-safe helpers and types (no Supabase import).
// Server side: lib/media-library.ts. Migration 118.

export interface MediaItem {
  id: string
  url: string
  thumb_url: string | null
  storage_path: string | null
  name: string
  alt: string
  tags: string[]
  category_id: string | null
  favorite: boolean
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  deleted_at: string | null
  created_at: string
  usedIn?: string[]          // computed at read time — never stored
}

export interface MediaCategory { id: string; name: string; sort_order: number; count?: number }

export const TRASH_DAYS = 30
export const SITE_BUCKET = 'site'
// Uploads are downscaled in the browser to this long edge before they leave it:
// a Vercel function refuses bodies over 4.5 MB, and 3000px is plenty for any
// page on the site (the hero is the widest, at ~2:1).
export const MAX_EDGE = 3000
export const THUMB_EDGE = 480

/** 'site' bucket object path for a public Supabase URL we own, else null. */
export function storagePathFromUrl(url: string): string | null {
  const m = /\/storage\/v1\/object\/public\/site\/([^?#]+)/.exec(url || '')
  return m ? decodeURIComponent(m[1]) : null
}

/** Lowercase, trimmed, de-duplicated, no empties; max 20 tags of 40 chars. */
export function normalizeTags(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : String(input ?? '').split(',')
  const out: string[] = []
  for (const t of arr) {
    const s = String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= 20) break
  }
  return out
}

/** A friendly default name from a URL: 'set-d-1.webp' → 'set d 1'. */
export function nameFromUrl(url: string): string {
  const last = decodeURIComponent((url || '').split(/[?#]/)[0].split('/').pop() || '')
  return last.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 120) || 'photo'
}

export function daysLeftInTrash(deletedAt: string, now = Date.now()): number {
  const left = TRASH_DAYS - (now - Date.parse(deletedAt)) / 86_400_000
  return Math.max(0, Math.ceil(left))
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return ''
  return n < 1_000_000 ? `${Math.round(n / 1000)} KB` : `${(n / 1_000_000).toFixed(1)} MB`
}

/** Photo-only file types the library accepts. */
export const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

// PROJECTOR — the wall projector's live background (2026-10-03, first cut).
//
// The projector laptop opens /projector?key=<KIOSK_KEY> (or its /t/ short link)
// and shows whatever image is newest in portal-media/projector/. A guest scans
// the QR on the wall, picks a photo on their phone, and it replaces the image.
//
// No table, no migration: the newest file in the folder IS the state, and an
// upload deletes the older ones, so the folder only ever holds one image.
// Lives in the PRIVATE portal-media bucket; the wall gets a signed URL.
//
// ⚠️ The upload code is derived from KIOSK_KEY (like /t/ codes) and is printed
// on the wall in the QR, so anyone in the room can post. Fine for v1; rotating
// KIOSK_KEY rotates it. A booking gate is the obvious next step.
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

export const PROJECTOR_BUCKET = 'portal-media'
export const PROJECTOR_DIR = 'projector'
export const PROJECTOR_SLUG = 'projector'   // /t/ short-link identity

export function projectorUploadCode(key: string): string {
  return createHmac('sha256', key).update('projector-upload').digest('hex').slice(0, 12)
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)) } catch { return false }
}

export function projectorKeyOk(k: string | null): boolean {
  const key = process.env.KIOSK_KEY
  return !!key && !!k && same(k, key)
}

export function projectorCodeOk(c: string | null): boolean {
  const key = process.env.KIOSK_KEY
  return !!key && !!c && same(c.toLowerCase(), projectorUploadCode(key))
}

// Every object in the folder, newest first. list() is a DB query, not a CDN
// read, so it can never serve a stale "current" image.
export async function listProjectorFiles(): Promise<string[]> {
  const { data, error } = await supabaseAdmin().storage.from(PROJECTOR_BUCKET)
    .list(PROJECTOR_DIR, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw new Error(error.message)
  return (data ?? []).filter(f => f.name && !f.name.startsWith('.')).map(f => f.name)
}

export async function removeProjectorFiles(names: string[]) {
  if (!names.length) return
  await supabaseAdmin().storage.from(PROJECTOR_BUCKET).remove(names.map(n => `${PROJECTOR_DIR}/${n}`))
}

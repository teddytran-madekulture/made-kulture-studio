// PORTAL — the kiosk's QR hub (2026-09-29).
//
// A guest taps PORTAL on the set tablet, scans the QR with their phone, and gets
// /portal/<token>: a page tied to THIS session on THIS set. Feature one is a
// mood board (public Pinterest board or uploaded photos) that the tablet shows
// full screen. Built as a hub so later features (tethered shots) slot in.
//
// ⚠️ THE TABLET MUST NEVER LEAVE THE KIOSK. Nothing stored here is a link the
// tablet opens: a Pinterest board is read SERVER-SIDE and reduced to image files
// on i.pinimg.com; uploads are images in a private bucket. The tablet renders
// <img> and nothing else. A pasted Spotify/YouTube/any-other URL is refused.
//
// ⚠️ Session-scoped. The token only works while its booking is live, and
// purgeEnded() deletes rows + files once the booking is over, so the next guest
// never sees someone else's references.

import { randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

export const PORTAL_BUCKET = 'portal-media'
export const PORTAL_MAX_ITEMS = 60
// Long enough to outlast any session, so the tablet never has to re-download an
// image because its URL rotated. The board itself is wiped at session end.
const SIGNED_SECONDS = 12 * 60 * 60
// A portal opens this long before the booking starts (matches the kiosk's
// 30-minute early greeting) and dies at the booking's end.
const EARLY_MS = 30 * 60 * 1000

export interface PortalRow { id: string; token: string; booking_id: string; set_slug: string }
export interface PortalItem { id: string; kind: 'pin' | 'upload'; src: string }

export function newToken(): string { return randomBytes(16).toString('hex') }

export function isLive(b: { status: string; start_time: string; end_time: string } | null, now = Date.now()): boolean {
  if (!b || b.status === 'cancelled') return false
  return Date.parse(b.start_time) - EARLY_MS <= now && Date.parse(b.end_time) > now
}

export async function getOrCreatePortal(bookingId: string, setSlug: string): Promise<PortalRow | null> {
  const db = supabaseAdmin()
  const find = async () => {
    const { data } = await db.from('portal_sessions').select('id, token, booking_id, set_slug')
      .eq('booking_id', bookingId).eq('set_slug', setSlug).maybeSingle()
    return (data as PortalRow) ?? null
  }
  const existing = await find()
  if (existing) return existing
  const { data, error } = await db.from('portal_sessions')
    .insert({ token: newToken(), booking_id: bookingId, set_slug: setSlug })
    .select('id, token, booking_id, set_slug')
  // A second tablet tap racing the first hits the unique index — read the winner.
  if (error || !data?.length) return await find()
  // A new portal is the natural moment to clear out finished ones. Non-fatal.
  purgeEnded().catch(e => console.error('[portal] purge failed (non-fatal):', e))
  return data[0] as PortalRow
}

export async function loadPortalByToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const db = supabaseAdmin()
  const { data } = await db.from('portal_sessions')
    .select('id, token, booking_id, set_slug, bookings(status, start_time, end_time)')
    .eq('token', token).maybeSingle()
  if (!data) return null
  const b: any = Array.isArray((data as any).bookings) ? (data as any).bookings[0] : (data as any).bookings
  const { data: setRow } = await db.from('sets').select('name').eq('slug', (data as any).set_slug).maybeSingle()
  return {
    portal: { id: data.id, token: data.token, booking_id: data.booking_id, set_slug: (data as any).set_slug } as PortalRow,
    booking: b ? { status: b.status, start_time: b.start_time, end_time: b.end_time } : null,
    setName: (setRow as any)?.name ?? (data as any).set_slug,
  }
}

export async function listItems(portalId: string): Promise<PortalItem[]> {
  const db = supabaseAdmin()
  const { data, error } = await db.from('portal_items')
    .select('id, kind, url, storage_path').eq('portal_id', portalId).order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  const paths = rows.filter(r => r.kind === 'upload' && r.storage_path).map(r => r.storage_path as string)
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: s } = await db.storage.from(PORTAL_BUCKET).createSignedUrls(paths, SIGNED_SECONDS)
    for (const x of s ?? []) if (x.path && x.signedUrl) signed.set(x.path, x.signedUrl)
  }
  return rows
    .map(r => ({ id: r.id, kind: r.kind, src: r.kind === 'pin' ? r.url : signed.get(r.storage_path) }))
    .filter(r => !!r.src) as PortalItem[]
}

export async function countItems(portalId: string): Promise<number> {
  const { count } = await supabaseAdmin().from('portal_items')
    .select('id', { count: 'exact', head: true }).eq('portal_id', portalId)
  return count ?? 0
}

export async function deleteItems(portalId: string, ids?: string[]) {
  const db = supabaseAdmin()
  let q = db.from('portal_items').select('id, storage_path').eq('portal_id', portalId)
  if (ids) q = q.in('id', ids)
  const { data } = await q
  const paths = ((data ?? []) as any[]).map(r => r.storage_path).filter(Boolean)
  if (paths.length) await db.storage.from(PORTAL_BUCKET).remove(paths)
  const del = db.from('portal_items').delete().eq('portal_id', portalId)
  const { error } = ids ? await del.in('id', ids) : await del
  if (error) throw new Error(error.message)
}

/** Delete portals (rows + files) whose booking ended more than 10 minutes ago. */
export async function purgeEnded() {
  const db = supabaseAdmin()
  const { data } = await db.from('portal_sessions')
    .select('id, bookings(end_time, status)').order('created_at', { ascending: true }).limit(50)
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const p of (data ?? []) as any[]) {
    const b = Array.isArray(p.bookings) ? p.bookings[0] : p.bookings
    const over = !b || b.status === 'cancelled' || Date.parse(b.end_time) < cutoff
    if (!over) continue
    await deleteItems(p.id)
    await db.from('portal_sessions').delete().eq('id', p.id)
  }
}

// ── Pinterest ───────────────────────────────────────────────────────────────
// A PUBLIC board has an RSS feed at pinterest.com/<user>/<board>.rss holding its
// most recent pins (Pinterest caps it at about 25). We keep only the image files.

const PIN_HOST = /(^|\.)pinterest\.[a-z.]+$/i
const UA = 'Mozilla/5.0 (compatible; MadeKultureKiosk/1.0; +https://madekulture.com)'

async function fetchWithTimeout(url: string, ms = 8000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': UA }, cache: 'no-store' }) }
  finally { clearTimeout(t) }
}

export async function pinterestBoardImages(raw: string): Promise<{ ok: true; images: string[] } | { ok: false; error: string }> {
  let u: URL
  try { u = new URL(raw.trim().startsWith('http') ? raw.trim() : `https://${raw.trim()}`) }
  catch { return { ok: false, error: 'That doesn’t look like a link.' } }

  // pin.it short links redirect to the real board — follow it, then re-check.
  if (/^pin\.it$/i.test(u.hostname)) {
    try { const r = await fetchWithTimeout(u.toString()); u = new URL(r.url) }
    catch { return { ok: false, error: 'Couldn’t open that pin.it link — try the full board link.' } }
  }
  if (!PIN_HOST.test(u.hostname)) {
    return { ok: false, error: 'That’s not a Pinterest board. Paste a link to a public Pinterest board.' }
  }
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts[0] === 'pin') return { ok: false, error: 'That’s a single pin — paste the link to the whole board.' }
  if (parts.length < 2) return { ok: false, error: 'Paste the link to a specific board (pinterest.com/name/board).' }
  const [user, board] = parts
  if (!/^[\w.-]+$/.test(user) || !/^[\w%.-]+$/.test(board)) return { ok: false, error: 'That board link looks unusual — try copying it again.' }

  let xml = ''
  try {
    const r = await fetchWithTimeout(`https://www.pinterest.com/${user}/${board}.rss`)
    if (!r.ok) return { ok: false, error: 'Couldn’t read that board. Make sure it’s public (secret boards can’t be shown).' }
    xml = await r.text()
  } catch {
    return { ok: false, error: 'Pinterest didn’t answer — try again in a moment.' }
  }
  const found = xml.match(/https:\/\/i\.pinimg\.com\/[^"'\s<>&]+?\.(?:jpe?g|png|webp)/gi) ?? []
  const images = Array.from(new Set(found.map(s => s.replace(/\/(?:\d+x|originals)\//, '/736x/'))))
  if (!images.length) return { ok: false, error: 'That board has no pictures we can read — is it public?' }
  return { ok: true, images: images.slice(0, 25) }
}

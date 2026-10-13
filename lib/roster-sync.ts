// Company rosters (migration 165) — the SERVER half: fetch a company's public
// Shopify product feed and mirror it into roster_talent. Mapping rules (incl.
// the youth rule) live in lib/roster.ts.
//
// ⚠️ A sync that fetched NOTHING never wipes the roster. If the site is down,
// renamed its tag or blocked us, the last good roster stays up and the error is
// written to company_rosters.last_error for the admin page — a failed read must
// never look like "the agency has no talent". See [[silent-failure-pattern]].
import type { SupabaseClient } from '@supabase/supabase-js'
import { inAllowedCities, mapShopifyProducts, rosterAbout, siteOrigin, type PublicRoster, type RosterTalent } from '@/lib/roster'

const PAGE_SIZE = 250        // Shopify's max for /products.json
const MAX_PAGES = 12         // 3,000 products — far past any agency
const FETCH_TIMEOUT_MS = 15_000

export type SyncResult = {
  ok: boolean
  count: number            // active talent after the sync
  removed: number          // cards switched off because they left the site
  skippedMinor: number
  skippedNotTalent: number
  error?: string
}

async function fetchJson(url: string): Promise<any> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(url, {
      signal: ctl.signal, cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': 'MadeKultureDirectory/1.0 (+https://madekulture.com)' },
    })
    if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`)
    return await r.json()
  } finally { clearTimeout(t) }
}

/** Every product on the site, paged. Throws if the very first page fails. */
async function fetchAllProducts(origin: string): Promise<any[]> {
  const all: any[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const d = await fetchJson(`${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`)
    const items = Array.isArray(d?.products) ? d.products : null
    if (!items) throw new Error('That site does not publish a Shopify product feed.')
    all.push(...items)
    if (items.length < PAGE_SIZE) break
  }
  return all
}

/** Pull one roster from its site. Writes status back to the roster row whether
 *  it worked or not. Never throws — the result says what happened. */
export async function syncRoster(db: SupabaseClient, rosterId: string): Promise<SyncResult> {
  const fail = async (error: string): Promise<SyncResult> => {
    await db.from('company_rosters').update({ last_error: error.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', rosterId)
    return { ok: false, count: 0, removed: 0, skippedMinor: 0, skippedNotTalent: 0, error }
  }

  const { data: roster, error: rErr } = await db.from('company_rosters')
    .select('id, source_url, include_tag, status').eq('id', rosterId).maybeSingle()
  if (rErr) return { ok: false, count: 0, removed: 0, skippedMinor: 0, skippedNotTalent: 0, error: rErr.message }
  if (!roster) return { ok: false, count: 0, removed: 0, skippedMinor: 0, skippedNotTalent: 0, error: 'Roster not found.' }

  let origin: string
  try { origin = siteOrigin(roster.source_url) } catch { return fail('The website address is not valid.') }

  let products: any[]
  try { products = await fetchAllProducts(origin) }
  catch (e: any) { return fail(e?.name === 'AbortError' ? 'The site took too long to answer.' : `Could not read the site: ${e?.message ?? e}`) }

  const mapped = mapShopifyProducts(products, origin, roster.include_tag ?? '')
  if (mapped.talent.length === 0) {
    return fail(products.length
      ? `Read ${products.length} products but none matched${roster.include_tag ? ` the tag "${roster.include_tag}"` : ''}. Roster left as it was.`
      : 'The site returned no products. Roster left as it was.')
  }

  const now = new Date().toISOString()
  const rows = mapped.talent.map(t => ({ ...t, roster_id: rosterId, active: true, synced_at: now }))
  const { error: upErr } = await db.from('roster_talent').upsert(rows, { onConflict: 'roster_id,external_id' })
  if (upErr) return fail(`Saving the roster failed: ${upErr.message}`)

  // Anyone no longer on the site comes off ours. Only reached after a sync that
  // actually returned talent (the empty case returned above).
  const keep = new Set(mapped.talent.map(t => t.external_id))
  const { data: existing, error: exErr } = await db.from('roster_talent')
    .select('id, external_id').eq('roster_id', rosterId).eq('active', true)
  if (exErr) return fail(`Checking for removed talent failed: ${exErr.message}`)
  const gone = (existing ?? []).filter(r => !keep.has(r.external_id)).map(r => r.id)
  if (gone.length) {
    const { error: offErr } = await db.from('roster_talent').update({ active: false }).in('id', gone)
    if (offErr) return fail(`Removing talent who left the site failed: ${offErr.message}`)
  }

  await db.from('company_rosters').update({
    last_synced_at: now, last_sync_count: mapped.talent.length, last_error: null, updated_at: now,
  }).eq('id', rosterId)

  return {
    ok: true, count: mapped.talent.length, removed: gone.length,
    skippedMinor: mapped.skippedMinor, skippedNotTalent: mapped.skippedNotTalent,
  }
}

/** Active talent for a roster, in the site's own order, limited to
 *  `onlyCities` when given (migration 167). Throws on a DB error. */
export async function rosterTalent(db: SupabaseClient, rosterId: string, onlyCities: string[] = []): Promise<RosterTalent[]> {
  const { data, error } = await db.from('roster_talent')
    .select('id, name, division, cities, bio, photos, profile_url')
    .eq('roster_id', rosterId).eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`roster talent lookup failed: ${error.message}`)
  return (data ?? []).map(t => ({ ...t, cities: t.cities ?? [], photos: t.photos ?? [] }))
    .filter(t => inAllowedCities(t.cities, onlyCities))
}

/** The roster a member's directory profile shows — LIVE rosters only, unless
 *  `includeDraft` (the admin viewing a profile, so the owner can see a draft in
 *  place before the company has said yes). Null when there is none. Logs and
 *  returns null on a DB error so a roster problem can never take the whole
 *  profile down. */
export async function liveRosterFor(db: SupabaseClient, ownerId: string, opts: { includeDraft?: boolean } = {}): Promise<PublicRoster | null> {
  const { data: r, error } = await db.from('company_rosters')
    .select('id, label, source_url, status, only_cities, about_tagline, about_bio, about_instagram, about_website, portfolio_label, about_on').eq('owner_id', ownerId)
    .in('status', opts.includeDraft ? ['live', 'draft'] : ['live']).maybeSingle()
  if (error) { console.error('[roster] lookup failed:', error.message); return null }
  if (!r) return null
  try {
    const only: string[] = r.only_cities ?? []
    const talent = await rosterTalent(db, r.id, only)
    if (!talent.length) return null
    let company_url = r.source_url
    try { company_url = siteOrigin(r.source_url) } catch {}
    return {
      label: r.label || 'Roster', company_url, talent, draft: r.status === 'draft', only_cities: only,
      about: rosterAbout(r, company_url), portfolio_label: (r.portfolio_label ?? '').trim(),
      about_on: r.about_on === 'portfolio' ? 'portfolio' : 'roster',
    }
  } catch (e: any) { console.error('[roster]', e?.message ?? e); return null }
}

/** One agency model as directory search shows it. */
export type DirectoryModel = {
  id: string; name: string; division: string; cities: string[]; photo: string
  agencyId: string; agencyName: string
}

/** Every model on a LIVE roster whose agency is in `ownerNames` (the listed,
 *  unblocked members the caller already resolved). Throws on a DB error so the
 *  caller decides; /api/directory treats a failure as "no models" + a log. */
export async function directoryModels(db: SupabaseClient, ownerNames: Map<string, string>): Promise<DirectoryModel[]> {
  if (!ownerNames.size) return []
  // Live rosters are few; filter owners in JS rather than sending every
  // listed member's id in the query string.
  const { data: all, error } = await db.from('company_rosters').select('id, owner_id, only_cities, label').eq('status', 'live')
  if (error) throw new Error(`roster lookup failed: ${error.message}`)
  const rosters = (all ?? []).filter(r => ownerNames.has(r.owner_id))
  if (!rosters.length) return []
  const ownerOf = new Map(rosters.map(r => [r.id, r.owner_id as string]))
  const citiesOf = new Map(rosters.map(r => [r.id, (r.only_cities ?? []) as string[]]))
  // A roster tab named after the company ("Neil Jou Agency") is the name a
  // model card should carry; the generic "Roster" falls back to the member's name.
  const nameOf = new Map(rosters.map(r => [r.id, /^roster$/i.test((r.label ?? '').trim() || 'Roster') ? '' : String(r.label).trim()]))
  const { data: talent, error: tErr } = await db.from('roster_talent')
    .select('id, roster_id, name, division, cities, photos, sort_order')
    .in('roster_id', [...ownerOf.keys()]).eq('active', true)
    .order('sort_order', { ascending: true }).limit(2000)
  if (tErr) throw new Error(`roster talent lookup failed: ${tErr.message}`)
  return (talent ?? []).filter(t => (t.photos ?? []).length && inAllowedCities(t.cities ?? [], citiesOf.get(t.roster_id))).map(t => {
    const agencyId = ownerOf.get(t.roster_id)!
    return {
      id: t.id, name: t.name, division: t.division ?? '', cities: t.cities ?? [], photo: t.photos[0],
      agencyId, agencyName: nameOf.get(t.roster_id) || ownerNames.get(agencyId) || '',
    }
  })
}

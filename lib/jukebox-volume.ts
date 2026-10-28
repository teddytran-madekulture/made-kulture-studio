// Shared jukebox volume (2026-10-27). Admin → Jukebox and the kiosk MUSIC panel
// both write through here, so the two doors can never store it differently.
//   jukebox_zones.volume/_at (migration 178) — read by the player's regular poll,
//                                              the BACKUP path
//   jukebox_live (migration 179)             — Realtime: the player hears it in
//                                              under a second, the MAIN path
// Both get the SAME stamp, so a player that hears it twice applies it once.
// The result type is flat on purpose: tsconfig strict:false disables union narrowing.
export async function setZoneVolume(db: any, zone: { id: string; slug: string }, raw: unknown): Promise<{ ok: boolean; volume?: number; error?: string }> {
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: 'Volume must be a number from 0 to 100.' }
  const volume = Math.max(0, Math.min(100, Math.round(n)))
  const volume_at = new Date().toISOString()
  // .select() so an update that matched nothing is caught, not reported as saved.
  const { data, error } = await db.from('jukebox_zones')
    .update({ volume, volume_at }).eq('id', zone.id).select('id')
  if (error) return { ok: false, error: /volume/.test(error.message || '') ? 'Volume sync needs migration 178 to be run.' : error.message }
  if (!data?.length) return { ok: false, error: 'Unknown zone.' }
  const live = await db.from('jukebox_live').upsert({ slug: zone.slug, volume, volume_at }, { onConflict: 'slug' }).select('slug')
  // Not fatal: the poll still carries it, just slower. Loud so it isn't silent.
  if (live.error || !live.data?.length) console.error('[jukebox-volume] live write failed — players fall back to polling', live.error)
  return { ok: true, volume }
}

/** Wall-tablet credential check, same rule as /api/jukebox/house-now. */
export function playerKeyOk(key: unknown): boolean {
  const required = process.env.JUKEBOX_PLAYER_KEY
  if (!required) { console.error('[auth] JUKEBOX_PLAYER_KEY is not set — refusing'); return false }
  if (typeof key !== 'string' || !key) return false
  return key === required || (!!process.env.KIOSK_KEY && key === process.env.KIOSK_KEY)
}

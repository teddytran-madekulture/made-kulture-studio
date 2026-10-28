// Shared jukebox volume (2026-10-27, migration 178). Admin → Jukebox and the
// kiosk MUSIC panel both write here; the player applies it when volume_at moves.
// One writer so the two doors can never store it differently.
// The result type is flat on purpose: tsconfig strict:false disables union narrowing.
export async function setZoneVolume(db: any, zoneId: string, raw: unknown): Promise<{ ok: boolean; volume?: number; error?: string }> {
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: 'Volume must be a number from 0 to 100.' }
  const volume = Math.max(0, Math.min(100, Math.round(n)))
  // .select() so an update that matched nothing is caught, not reported as saved.
  const { data, error } = await db.from('jukebox_zones')
    .update({ volume, volume_at: new Date().toISOString() }).eq('id', zoneId).select('id')
  if (error) return { ok: false, error: /volume/.test(error.message || '') ? 'Volume sync needs migration 178 to be run.' : error.message }
  if (!data?.length) return { ok: false, error: 'Unknown zone.' }
  return { ok: true, volume }
}

// Shared jukebox rules.

// The longest track a guest can drop into a shared queue.
//
// Why this exists: someone searched, picked what looked like a song, and got an
// hour-long mix — which then owned the room's speakers with no way out. YouTube
// search was already capped at this; Spotify search was not, and the vanity zone
// runs on Spotify, so a long ambient track or DJ set went straight through.
// 15 minutes is well past any real song and well short of a set.
export const MAX_REQUEST_SECONDS = 900

// Unknown duration is NOT treated as too long: the details lookup can fail, and
// silently hiding real songs is worse than the rare long one slipping through
// (a guest can now skip their own track mid-play anyway).
export function tooLongToRequest(sec: number | null | undefined): boolean {
  return typeof sec === 'number' && Number.isFinite(sec) && sec > MAX_REQUEST_SECONDS
}

export function fmtLimit(): string {
  return `${Math.round(MAX_REQUEST_SECONDS / 60)} minutes`
}

// ── Keep the vibe going (2026-10-10) ─────────────────────────────────────────
// After the last guest request ends, a YouTube zone plays YouTube's own Mix for
// that song (playlist id "RD" + videoId) instead of the house playlist, for this
// long. A new request plays first and starts a fresh 30 minutes from itself.
// Tested 2026-10-10: Mixes load and advance inside our embedded player on
// madekulture.com (they DON'T on a bare youtube.com/embed URL — error 153 —
// because YouTube needs the embedding site; that's a test artefact, not a block).
export const VIBE_MINUTES = 30

export type VibeInfo = { seed_id: string; seed_title: string | null; until: string }

// The zone's vibe, as both the player and the guest page need it:
//   vibe          — live: play (or keep playing) the Mix for seed_id
//   winding_down  — time's up: finish the track that's on, THEN go to house.
//                   Only reported for 15 min (MAX_REQUEST_SECONDS) past expiry,
//                   so a stale flag can't hold a player in limbo.
// Neither        — go to house now (ended by a person, switched off, or none).
// Spotify zones have no Mix, so they never get a vibe.
export function readVibe(z: {
  source?: string | null; vibe_enabled?: boolean | null; vibe_seed_id?: string | null
  vibe_seed_title?: string | null; vibe_until?: string | null
}, now: number = Date.now()): { vibe: VibeInfo | null; vibe_winding_down: boolean } {
  const none = { vibe: null, vibe_winding_down: false }
  if (!z || z.vibe_enabled === false || z.source === 'spotify' || !z.vibe_seed_id || !z.vibe_until) return none
  const t = new Date(z.vibe_until).getTime()
  if (!Number.isFinite(t)) return none
  if (t > now) return { vibe: { seed_id: z.vibe_seed_id, seed_title: z.vibe_seed_title ?? null, until: z.vibe_until }, vibe_winding_down: false }
  return { vibe: null, vibe_winding_down: now - t < MAX_REQUEST_SECONDS * 1000 }
}

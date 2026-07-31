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

// THE MUSIC HOST BRIDGE (2026-10-24).
//
// A set tablet that also plays studio music (Set D → main-studio) now runs TWO
// layers in Fully Kiosk:
//   /kiosk/host?set=…&key=…&jukebox=<zone>   — the BOTTOM layer. Holds the
//        YouTube player and almost never reloads (only when JUKEBOX_PLAYER_REV
//        changes, or Admin → Jukebox "Update players now").
//   /kiosk?…  inside an <iframe> on top       — the kiosk UI. Reloads on every
//        deploy like any other set tablet, WITHOUT touching the music.
//
// Why: Android WebView (Fully) only autoplays YouTube MUTED after a page load,
// so every reload of the old single-page tablet left the room silent until
// someone tapped the screen — and the kiosk reloaded on every push.
//
// Both frames are the same origin, so the kiosk calls the host directly through
// a global on the parent window. The host is the ONLY owner of the player; the
// kiosk just reads its state and forwards taps / MUSIC panel actions.
import type { JukeboxDisplay } from '@/components/jukebox/useJukeboxPlayer'

export const MUSIC_HOST_GLOBAL = '__mkMusicHost'

export type MusicHostState = {
  display: JukeboxDisplay
  snapshot: any
  zoneName: string
  needsTap: boolean
}

export type MusicHostApi = {
  getState(): MusicHostState
  /** Returns an unsubscribe. A dead subscriber (reloaded kiosk) is dropped on its first throw. */
  subscribe(cb: () => void): () => void
  skipHouseTrack(): void
  setVolume(v: number): void
  getVolume(): number
  nudge(): void
  refresh(): void
  /** The kiosk reports its screen so the host only reloads while it's on HOME. */
  setKioskScreen(screen: string): void
}

/** The host's API when this page is the kiosk layer inside /kiosk/host, else null. */
export function getMusicHost(): MusicHostApi | null {
  try {
    if (typeof window === 'undefined' || window.parent === window) return null
    return ((window.parent as any)[MUSIC_HOST_GLOBAL] as MusicHostApi) ?? null
  } catch { return null }
}

export function isFramed(): boolean {
  try { return window.self !== window.top } catch { return true }
}

// Jukebox player build revision.
//
// The Fire tablets used to reload themselves on EVERY deploy, because they
// watched the git commit SHA — so shipping anything at all (a booking tweak, an
// admin page) cut the music in the studio. They watch this instead.
//
// BUMP THIS ONLY when a deploy actually changes what the tablets run:
//   app/jukebox/player/page.tsx, or anything it imports, or the shape of
//   /api/jukebox/state or /api/jukebox/advance that the player depends on.
//
// Leave it alone for every other change and the tablets will never notice the
// deploy. When it does change, a tablet finishes the song it's on before
// reloading — see the self-update effect in the player page.
export const JUKEBOX_PLAYER_REV = '2026-07-25.1'

// studio_settings key holding the timestamp of the last "Update players now"
// press in Admin → Jukebox. Any change to it reloads every player on the spot.
export const PLAYER_RELOAD_KEY = 'jukebox_player_reload_at'


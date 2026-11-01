// Shared by lib/pageviews.ts (browser) and /api/track/pv (server) so a token
// can never reach the page_views table even from a hand-rolled request.

// Any segment that looks like a token or id becomes ':id' — manage, check-in,
// pay and mini links carry secrets in the path. Same rule runs on the server.
// Hex/uuid ids (16+ chars) and mixed-case base64url tokens. Slugs are lowercase
// words, so 'winter-is-coming-2026' is never masked.
export function isToken(s: string): boolean {
  return /^[0-9a-f-]{16,}$/i.test(s) || (s.length >= 16 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s))
}

export function maskPath(p: string): string {
  return ('/' + p.split('?')[0].split('#')[0].split('/').filter(Boolean)
    .map(s => (isToken(s) ? ':id' : s))
    .join('/')).slice(0, 120)
}

// GET /api/version — what build is actually deployed right now.
//
// ⚠️ Exists because the admin PWA silently ran code from four weeks earlier.
// An installed home-screen app keeps its page alive across backgrounding, so
// the JavaScript in memory can be however old the last full launch was. Nothing
// looks wrong — the app just quietly lacks every feature shipped since.
//
// On 2026-08-13 that meant the short-notice banner showed no price, no card and
// no charge button, so every approval would have silently taken the no-charge
// path. A stale UI that still works is more dangerous than one that breaks.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  return NextResponse.json({
    // Vercel sets this per deployment. Locally there is no sha, so fall back to
    // a constant — which correctly means "never stale" in dev.
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'dev',
  })
}

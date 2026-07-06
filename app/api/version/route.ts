import { NextResponse } from 'next/server'

// Tiny build-identity endpoint the kiosk polls to detect a new deploy.
// Vercel sets VERCEL_GIT_COMMIT_SHA on every deployment, so this value changes
// each time we ship. The kiosk compares it to the version it loaded with and
// reloads itself when they differ (see app/kiosk/page.tsx self-update effect).
export const dynamic = 'force-dynamic'
export const revalidate = 0

export function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    'dev'
  return NextResponse.json(
    { version },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  )
}

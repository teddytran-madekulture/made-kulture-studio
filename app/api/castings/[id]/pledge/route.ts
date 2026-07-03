import { NextResponse } from 'next/server'

// Voluntary-pledge feature was removed. Endpoint kept as a no-op so any stale
// client call fails gracefully instead of 404-crashing. Safe to delete this
// folder entirely.
export const dynamic = 'force-dynamic'

export async function POST() {
  return NextResponse.json({ error: 'This feature is no longer available.' }, { status: 410 })
}

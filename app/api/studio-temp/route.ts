import { NextResponse } from 'next/server'

// Proxies the Cloudflare Worker that reads the studio's Nest thermostat, so the
// browser calls our own origin (no CORS surprises) and we can fail gracefully.
const WORKER_URL = 'https://madekulture-studio-temp.tl2ance03.workers.dev/'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(WORKER_URL, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'unavailable' }, { status: 502 })
    const data = await res.json()
    return NextResponse.json({
      indoorTemp:  data.indoorTemp  ?? null,
      humidity:    data.humidity    ?? null,
      outdoorTemp: data.outdoorTemp ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }
}

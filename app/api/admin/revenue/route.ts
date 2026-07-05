import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'

// Paging through a year+ of Square payments can take a few seconds on a cold
// (uncached) load, so give the function headroom and never let Next cache it.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET /api/admin/revenue
// True collected revenue straight from Square — the money that actually hit the
// account, net of refunds. This is the source of truth for the admin revenue
// view (and matches the seller's Square dashboard), unlike the bookings table
// which reflects booked intent, not collected cash.
//
// Returns monthly buckets keyed "YYYY-MM" from Jan 1 of last year through now:
//   { months: { "2025-01": { gross, net, count }, ... }, generatedAt }
// gross = sum of payment total; net = gross minus refunds on those payments.

type Bucket = { gross: number; net: number; count: number }

// Warm-lambda cache so we don't re-page Square on every dashboard load.
let cache: { at: number; data: unknown } | null = null
const TTL_MS = 10 * 60 * 1000

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.data)
  }

  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) return NextResponse.json({ error: 'Square not configured' }, { status: 500 })
  const base = process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  // From Jan 1 of last year, so the view always has a full prior-year baseline for YoY.
  const beginYear = new Date().getUTCFullYear() - 1
  const beginTime = new Date(Date.UTC(beginYear, 0, 1)).toISOString()

  const months: Record<string, Bucket> = {}
  let cursor: string | undefined
  let pages = 0

  try {
    do {
      const url = new URL(`${base}/v2/payments`)
      url.searchParams.set('begin_time', beginTime)
      url.searchParams.set('sort_order', 'ASC')
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Square-Version': '2025-01-23',
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return NextResponse.json({ error: `Square ${res.status}`, detail: body.slice(0, 300) }, { status: 502 })
      }
      const json: any = await res.json()
      for (const p of json.payments ?? []) {
        if (p.status !== 'COMPLETED') continue
        if (!p.created_at) continue
        const month = String(p.created_at).slice(0, 7) // YYYY-MM (UTC)
        const total = Number(p.total_money?.amount ?? p.amount_money?.amount ?? 0) / 100
        const refunded = Number(p.refunded_money?.amount ?? 0) / 100
        const b = (months[month] ||= { gross: 0, net: 0, count: 0 })
        b.gross += total
        b.net += total - refunded
        b.count += 1
      }
      cursor = json.cursor
      pages++
    } while (cursor && pages < 80)
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to reach Square', detail: String(e?.message || e) }, { status: 502 })
  }

  // Round to cents to avoid float noise.
  for (const k of Object.keys(months)) {
    months[k].gross = Math.round(months[k].gross * 100) / 100
    months[k].net = Math.round(months[k].net * 100) / 100
  }

  const data = { months, generatedAt: new Date().toISOString() }
  cache = { at: Date.now(), data }
  return NextResponse.json(data)
}

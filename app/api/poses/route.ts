// GET /api/poses                 → categories with counts + cover
// GET /api/poses?category=couples → the live poses in that category
// Public on purpose: only APPROVED poses are ever returned (status 'live').
import { NextRequest, NextResponse } from 'next/server'
import { livePoses, poseCategorySummary } from '@/lib/poses'
import { POSE_CATEGORY_KEYS } from '@/lib/pose-categories'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  const cat = req.nextUrl.searchParams.get('category')
  try {
    if (cat) {
      if (!POSE_CATEGORY_KEYS.has(cat)) return NextResponse.json({ error: 'Unknown category' }, { status: 404 })
      return NextResponse.json({ poses: await livePoses(cat) })
    }
    return NextResponse.json({ categories: await poseCategorySummary() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load poses.' }, { status: 500 })
  }
}

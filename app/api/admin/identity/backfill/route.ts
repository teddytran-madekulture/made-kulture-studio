// GET /api/admin/identity/backfill?scope=suspended|all&offset=0 — admin only.
// One-time pass: pull the fingerprint of every card already saved on customers'
// Square profiles into customer_card_fingerprints (migration 113), so card
// matching works for people who booked before fingerprints were recorded.
// 'all' runs 100 customers per call (Square is one request per customer) and
// returns nextOffset — open the URL again with it until nextOffset is null.
import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { loadSuspendedProfiles, rememberCard } from '@/lib/identity-match'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 120

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})
const BATCH = 100

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const scope = req.nextUrl.searchParams.get('scope') === 'all' ? 'all' : 'suspended'
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0)

  let custs: any[] = []
  if (scope === 'suspended') {
    const ids = (await loadSuspendedProfiles(db)).map(p => p.id)
    if (ids.length) {
      const { data, error } = await db.from('customers').select('id, square_customer_id').in('id', ids).not('square_customer_id', 'is', null)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      custs = data ?? []
    }
  } else {
    const { data, error } = await db.from('customers').select('id, square_customer_id')
      .not('square_customer_id', 'is', null).order('id').range(offset, offset + BATCH - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    custs = data ?? []
  }

  let cards = 0, failed = 0
  for (const c of custs) {
    try {
      const { result } = await square.cardsApi.listCards(undefined, c.square_customer_id, true)
      for (const card of result.cards ?? []) { await rememberCard(db, c.id, card); cards++ }
    } catch (e) { failed++; console.error('[identity backfill] listCards failed', c.id, e) }
  }
  const nextOffset = scope === 'all' && custs.length === BATCH ? offset + BATCH : null
  return NextResponse.json({ scope, customers: custs.length, cardsRecorded: cards, failed, nextOffset,
    note: nextOffset != null ? `Open again with &offset=${nextOffset}` : 'Done.' })
}

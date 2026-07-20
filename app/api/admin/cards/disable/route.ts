import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'

// POST /api/admin/cards/disable  { cardId }
// Permanently disable a dead / unusable saved card (e.g. a legacy card that
// returns PAN_FAILURE). Square's disableCard is irreversible — the card can't
// be re-enabled, only re-added fresh — which is exactly what we want for a bad
// record. We also clear any stored references so the app stops offering it.

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { cardId } = await req.json()
    if (!cardId) return NextResponse.json({ error: 'Card id is required.' }, { status: 400 })

    await square.cardsApi.disableCard(cardId)

    // Stop offering this card anywhere in the app (best-effort).
    await supabase.from('customers').update({ square_card_id: null }).eq('square_card_id', cardId)
    await supabase.from('bookings').update({ square_card_on_file_id: null }).eq('square_card_on_file_id', cardId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[cards/disable] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Could not remove the card.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

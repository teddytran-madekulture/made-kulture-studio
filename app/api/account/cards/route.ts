import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'

function getSquare() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  })
}

async function ensureSquareCustomer(userId: string, email: string, name: string | null, supabase: ReturnType<typeof createClient>) {
  // Check if we already have a square_customer_id
  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('square_customer_id')
    .eq('id', userId)
    .single()

  if (profile?.square_customer_id) return profile.square_customer_id

  // Create Square customer
  const square = getSquare()
  const nameParts = (name ?? '').trim().split(' ')
  const res = await square.customersApi.createCustomer({
    emailAddress: email,
    givenName: nameParts[0] || undefined,
    familyName: nameParts.slice(1).join(' ') || undefined,
    idempotencyKey: `customer-${userId}`,
  })
  const customerId = res.result.customer?.id
  if (!customerId) throw new Error('Failed to create Square customer')

  // Save to Supabase
  await supabase.from('customer_profiles').update({ square_customer_id: customerId }).eq('id', userId)
  return customerId
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('square_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.square_customer_id) return NextResponse.json({ cards: [] })

  const square = getSquare()
  const res = await square.cardsApi.listCards(undefined, profile.square_customer_id)
  const cards = (res.result.cards ?? [])
    .filter(c => c.enabled)
    .map(c => ({
      id: c.id,
      last_4: c.last4,
      card_brand: c.cardBrand,
      exp_month: c.expMonth != null ? Number(c.expMonth) : null,
      exp_year: c.expYear != null ? Number(c.expYear) : null,
    }))

  return NextResponse.json({ cards })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { source_id } = await req.json()
    if (!source_id) return NextResponse.json({ error: 'Missing card token.' }, { status: 400 })

    const { data: profile } = await supabase
      .from('customer_profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const squareCustomerId = await ensureSquareCustomer(user.id, user.email!, profile?.full_name ?? null, supabase)

    const square = getSquare()
    const res = await square.cardsApi.createCard({
      idempotencyKey: randomUUID(), // Square caps idempotencyKey at 45 chars
      sourceId: source_id,
      card: { customerId: squareCustomerId },
    })

    const card = res.result.card
    // Square returns expMonth/expYear as BigInt — convert before JSON serialization.
    return NextResponse.json({
      card: {
        id: card?.id,
        last_4: card?.last4,
        card_brand: card?.cardBrand,
        exp_month: card?.expMonth != null ? Number(card.expMonth) : null,
        exp_year: card?.expYear != null ? Number(card.expYear) : null,
      }
    })
  } catch (err: any) {
    const detail = err?.errors?.[0]?.detail || err?.message || 'Could not save card.'
    console.error('[account/cards] POST error:', err)
    return NextResponse.json({ error: detail }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { card_id } = await req.json()

  // Verify the card belongs to this user's Square customer
  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('square_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.square_customer_id) return NextResponse.json({ error: 'No customer found' }, { status: 400 })

  const square = getSquare()
  const cardRes = await square.cardsApi.retrieveCard(card_id)
  if (cardRes.result.card?.customerId !== profile.square_customer_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Don't allow removing a card that's attached to an upcoming or recent booking
  // — it's the card a guest-overage would be charged to. 7-day grace after the
  // session end gives the studio time to settle any overage first.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: activeBookings } = await admin
    .from('bookings')
    .select('id')
    .eq('square_card_on_file_id', card_id)
    .neq('status', 'cancelled')
    .gte('end_time', cutoff)
    .limit(1)

  if (activeBookings && activeBookings.length > 0) {
    return NextResponse.json(
      { error: 'This card is linked to an upcoming or recent booking and can’t be removed yet. You can remove it once that session is complete.' },
      { status: 400 }
    )
  }

  await square.cardsApi.disableCard(card_id)
  return NextResponse.json({ success: true })
}

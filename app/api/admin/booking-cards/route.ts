import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'

// GET /api/admin/booking-cards?bookingId=XXX
// Resolves the saved cards available to charge for a booking's customer —
// ROBUSTLY. A single email often has several duplicate Square customer profiles
// (from merges / Acuity / third-party imports), and the card saved at checkout
// can live on a DIFFERENT profile than the one linked in our DB. So we gather
// every candidate Square profile (the booking's linked customer + every profile
// matching the email), list each one's cards, and dedupe by fingerprint. Each
// returned card carries its OWNING squareCustomerId so the charge can pair them
// (Square rejects a card id charged under the wrong customer id).

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bookingId = req.nextUrl.searchParams.get('bookingId')
  if (!bookingId) return NextResponse.json({ cards: [] })

  try {
    // Booking → customer email + square_customer_id + the card stored on the booking.
    const { data: b } = await supabase
      .from('bookings')
      .select('square_card_on_file_id, customers ( email, square_customer_id )')
      .eq('id', bookingId)
      .maybeSingle()

    const customer = (b?.customers as any) || null
    const email = customer?.email as string | undefined
    const bookingCardId = (b?.square_card_on_file_id as string | null) || null

    // Candidate Square profiles: the linked one + every profile sharing the email.
    const candidateIds = new Set<string>()
    if (customer?.square_customer_id) candidateIds.add(customer.square_customer_id)
    if (email) {
      try {
        const { result } = await square.customersApi.searchCustomers({
          query: { filter: { emailAddress: { exact: email } } },
        })
        for (const c of result.customers ?? []) if (c.id) candidateIds.add(c.id)
      } catch (e) {
        console.error('[booking-cards] customer search failed', e)
      }
    }

    // List enabled cards on each candidate; dedupe the same physical card
    // (same fingerprint saved onto multiple duplicate profiles) to one entry.
    const byFingerprint = new Map<string, any>()
    for (const cid of candidateIds) {
      try {
        const { result } = await square.cardsApi.listCards(undefined, cid)
        for (const c of result.cards ?? []) {
          if (c.enabled === false || !c.id) continue
          const fp = c.fingerprint || c.id
          const isBookingCard = !!bookingCardId && c.id === bookingCardId
          const existing = byFingerprint.get(fp)
          // Keep one per fingerprint; prefer the exact card saved on the booking.
          if (existing && !isBookingCard) continue
          byFingerprint.set(fp, {
            id:               c.id,
            brand:            c.cardBrand,
            last4:            c.last4,
            expMonth:         c.expMonth != null ? Number(c.expMonth) : null,
            expYear:          c.expYear != null ? Number(c.expYear) : null,
            squareCustomerId: cid,
            isBookingCard,
            prepaidType:      c.prepaidType ?? null,   // 'PREPAID' | 'NOT_PREPAID' | 'UNKNOWN'
            cardType:         c.cardType ?? null,       // 'CREDIT' | 'DEBIT' | ...
          })
        }
      } catch (e) {
        console.error('[booking-cards] listCards failed for', cid, e)
      }
    }

    // Booking's own card first, then the rest.
    const cards = [...byFingerprint.values()]
      .sort((a, b) => (b.isBookingCard ? 1 : 0) - (a.isBookingCard ? 1 : 0))

    return NextResponse.json({ cards })
  } catch (err: any) {
    console.error('[booking-cards] error:', err)
    return NextResponse.json({ cards: [], error: err?.message || 'Failed to load cards' }, { status: 200 })
  }
}

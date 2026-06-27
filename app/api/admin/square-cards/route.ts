import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox,
})

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// GET /api/admin/square-cards?customerId=CXXXXXXX
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = req.nextUrl.searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ cards: [] })

  try {
    const { result } = await square.cardsApi.listCards(
      undefined, // cursor
      customerId,
    )

    const cards = (result.cards || [])
      .filter(c => !c.enabled === false) // only active cards
      .map(c => ({
        id:       c.id,
        brand:    c.cardBrand,
        last4:    c.last4,
        expMonth: c.expMonth,
        expYear:  c.expYear,
      }))

    return NextResponse.json({ cards })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch cards' }, { status: 500 })
  }
}

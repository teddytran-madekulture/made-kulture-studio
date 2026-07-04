import { NextRequest, NextResponse } from 'next/server'
import { validatePromo } from '@/lib/promo'

export const dynamic = 'force-dynamic'

// POST /api/promo/validate  { code, subtotalCents, email }
// Live preview at checkout. The booking route re-validates authoritatively before
// charging — this is just so the customer sees the discount before submitting.
export async function POST(req: NextRequest) {
  let body: { code?: string; subtotalCents?: number; email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 }) }

  const subtotalCents = Math.max(0, Math.round(Number(body.subtotalCents) || 0))
  const r = await validatePromo(body.code ?? '', { subtotalCents, email: body.email })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error })
  return NextResponse.json({ ok: true, code: r.code, discountCents: r.discountCents, label: r.label })
}

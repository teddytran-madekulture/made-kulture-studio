import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staff-auth'
import { getActiveDevice, createTerminalCheckout } from '@/lib/square-terminal'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// POST /api/desk/terminal/charge  { amountCents, note? }
// Pushes a charge to the paired Register. Customer taps + pays there. The desk
// then polls /charge/[id] for the result.
export async function POST(req: NextRequest) {
  const g = requireStaff(req, 'payment.terminal')
  if (g instanceof NextResponse) return g

  let body: { amountCents?: number; note?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const amountCents = Math.round(Number(body.amountCents) || 0)
  if (amountCents < 100) return NextResponse.json({ error: 'Enter an amount of at least $1.00.' }, { status: 400 })
  if (amountCents > 5_000_00) return NextResponse.json({ error: 'Amount looks too large — double-check it.' }, { status: 400 })

  const device = await getActiveDevice()
  if (!device) return NextResponse.json({ error: 'No Register is paired yet. An owner can pair it in the staff console.' }, { status: 400 })

  try {
    const checkout = await createTerminalCheckout({
      amountCents,
      deviceId: device.device_id,
      referenceId: `desk-${Date.now()}`,
      note: body.note?.slice(0, 200),
    })
    await audit(g, 'terminal.charge_started', {
      entityType: 'checkout', entityId: (checkout as any)?.id, amountCents,
      details: { note: body.note ?? null },
    })
    return NextResponse.json({ checkoutId: (checkout as any)?.id, status: (checkout as any)?.status })
  } catch (e: any) {
    console.error('[terminal charge] createTerminalCheckout failed', e)
    const detail = e?.errors?.[0]?.detail || 'Could not start the charge. Is the Register online?'
    return NextResponse.json({ error: detail }, { status: 502 })
  }
}

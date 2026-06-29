import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staff-auth'
import { getTerminalCheckout, cancelTerminalCheckout } from '@/lib/square-terminal'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// GET /api/desk/terminal/charge/[id] → current checkout status.
// Square statuses: PENDING → IN_PROGRESS → COMPLETED | CANCELED | CANCEL_REQUESTED.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'payment.terminal')
  if (g instanceof NextResponse) return g
  try {
    const c = await getTerminalCheckout(params.id) as any
    return NextResponse.json({
      status: c?.status,
      paymentIds: c?.paymentIds ?? null,
      amountCents: c?.amountMoney?.amount ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Could not read the charge status.' }, { status: 502 })
  }
}

// DELETE /api/desk/terminal/charge/[id] → cancel a pending checkout (customer walked off).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'payment.terminal')
  if (g instanceof NextResponse) return g
  try {
    const c = await cancelTerminalCheckout(params.id) as any
    await audit(g, 'terminal.charge_canceled', { entityType: 'checkout', entityId: params.id })
    return NextResponse.json({ status: c?.status })
  } catch (e) {
    return NextResponse.json({ error: 'Could not cancel the charge.' }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isoPlusMonths(months: number): string {
  const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString()
}

// POST /api/admin/customers/[id]/plus — manage a customer's Plus membership.
// Body: { action: 'grant' | 'revoke' | 'autorenew', months?, autoRenew? }
// 'grant' here is a COMP/manual grant (no charge); the self-serve checkout is
// what charges. Membership state lives on customers.pricing_overrides.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  const { data: cust } = await supabase
    .from('customers').select('id, email, pricing_overrides').eq('id', params.id).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const po: any = { ...(cust.pricing_overrides || {}) }

  if (action === 'grant') {
    const months = Number(body.months) > 0 ? Number(body.months) : 12
    po.plus = true
    po.plus_started_at = new Date().toISOString()
    po.plus_expires_at = isoPlusMonths(months)
    po.plus_auto_renew = body.autoRenew === true   // comp grants default to NO auto-charge
    po.plus_comp = true
  } else if (action === 'revoke') {
    po.plus = false
    delete po.plus_started_at; delete po.plus_expires_at; delete po.plus_auto_renew; delete po.plus_comp
  } else if (action === 'autorenew') {
    if (!po.plus) return NextResponse.json({ error: 'Not a Plus member' }, { status: 400 })
    po.plus_auto_renew = body.autoRenew === true
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.from('customers').update({ pricing_overrides: po }).eq('id', cust.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action === 'grant') {
    await supabase.from('plus_payments').insert({
      customer_id: cust.id, customer_email: cust.email, amount_cents: 0, kind: 'comp',
      period_start: po.plus_started_at, period_end: po.plus_expires_at,
    })
  }

  return NextResponse.json({ ok: true, pricingOverrides: po })
}

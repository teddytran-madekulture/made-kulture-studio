// GET /api/admin/plus — every Plus member (active and lapsed) for the Plus Members page.
// Plus state lives in customers.pricing_overrides; money lives in plus_payments.
// Linked from BOTH admin sidebars.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { plusActive } from '@/lib/short-notice'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()

  const { data: rows, error } = await db
    .from('customers')
    .select('id, name, email, phone, pricing_overrides')
    .eq('pricing_overrides->>plus', 'true')
  // A failed read must never render as "no members".
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (rows ?? []).map(r => r.id)
  const { data: pays, error: payErr } = ids.length
    ? await db.from('plus_payments').select('customer_id, amount_cents, kind, created_at').in('customer_id', ids).order('created_at', { ascending: false })
    : { data: [] as any[], error: null }
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  const byCust = new Map<string, { paidCents: number; count: number; last: string | null; lastKind: string | null }>()
  for (const p of pays ?? []) {
    const m = byCust.get(p.customer_id) ?? { paidCents: 0, count: 0, last: null, lastKind: null }
    m.paidCents += Number(p.amount_cents) || 0
    m.count += 1
    if (!m.last) { m.last = p.created_at; m.lastKind = p.kind }
    byCust.set(p.customer_id, m)
  }

  const members = (rows ?? []).map(r => {
    const po: any = r.pricing_overrides || {}
    const pay = byCust.get(r.id)
    return {
      id: r.id, name: r.name, email: r.email, phone: r.phone,
      active: plusActive(po),
      comp: !!po.plus_comp,
      startedAt: po.plus_started_at ?? null,
      expiresAt: po.plus_expires_at ?? null,
      autoRenew: !!po.plus_auto_renew,
      renewalSuspended: !!po.plus_renewal_suspended,
      paidCents: pay?.paidCents ?? 0,
      payments: pay?.count ?? 0,
      lastPaymentAt: pay?.last ?? null,
      lastPaymentKind: pay?.lastKind ?? null,
    }
  }).sort((a, b) => Number(b.active) - Number(a.active) || String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')))

  const active = members.filter(m => m.active)
  return NextResponse.json({
    members,
    totals: {
      active: active.length,
      paying: active.filter(m => !m.comp).length,
      comped: active.filter(m => m.comp).length,
      collectedCents: members.reduce((s, m) => s + m.paidCents, 0),
    },
  })
}

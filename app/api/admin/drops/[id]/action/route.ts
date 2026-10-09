// Admin — Set Drop lifecycle actions. Everything that moves money lives in
// lib/set-drops-server.ts and CLAIMS each pledge before touching it.
//   { action: 'open' }                         draft → taking deposits
//   { action: 'go' }                           build it: deposits → credit, set on, room blocked
//   { action: 'cancel', resolution }           refund | credit | choice
//   { action: 'archive' }                      switch the set off after the run
//   { action: 'process_remaining' }            finish any deposit still unsettled after GO/CANCEL
//   { action: 'retry_refund', pledgeId }       a refund that failed
//   { action: 'resolve', pledgeId, choice }    settle one customer's choice for them

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { goDrop, cancelDrop, archiveDrop, refundPledge, creditPledge, getDrop, processRemaining } from '@/lib/set-drops-server'
import type { DropPledge } from '@/lib/set-drops'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  try {
    if (action === 'open') {
      const d = await getDrop(db, params.id)
      if (!d) return NextResponse.json({ error: 'Drop not found.' }, { status: 404 })
      const missing: string[] = []
      if (!d.pre_reserve_ends_at) missing.push('a reservation deadline')
      else if (Date.parse(d.pre_reserve_ends_at) <= Date.now()) missing.push('a deadline in the future')
      if (!d.run_starts || !d.run_ends) missing.push('run dates')
      if (!(Number(d.goal_value) > 0)) missing.push('a goal')
      if (!(Number(d.rate_per_hour) > 0)) missing.push('an hourly rate')
      if (missing.length) return NextResponse.json({ error: `Before opening reservations, add ${missing.join(', ')}.` }, { status: 400 })
      const { data, error } = await db.from('set_drops').update({ status: 'pre_reserve', updated_at: new Date().toISOString() })
        .eq('id', d.id).eq('status', 'draft').select('id')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) return NextResponse.json({ error: 'Only a draft can be opened.' }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'go') return NextResponse.json(await goDrop(db, params.id))
    if (action === 'process_remaining') return NextResponse.json(await processRemaining(db, params.id))

    if (action === 'cancel') {
      const r = String(body.resolution || '')
      if (!['refund', 'credit', 'choice'].includes(r)) return NextResponse.json({ error: 'Pick refund, credit or customer’s choice.' }, { status: 400 })
      return NextResponse.json(await cancelDrop(db, params.id, r as any))
    }

    if (action === 'archive') {
      const r = await archiveDrop(db, params.id)
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    if (action === 'retry_refund' || action === 'resolve') {
      const drop = await getDrop(db, params.id)
      if (!drop) return NextResponse.json({ error: 'Drop not found.' }, { status: 404 })
      const { data: p } = await db.from('set_drop_pledges').select('*').eq('id', String(body.pledgeId || '')).eq('drop_id', drop.id).maybeSingle()
      if (!p) return NextResponse.json({ error: 'Deposit not found.' }, { status: 404 })
      const pledge = p as DropPledge
      if (action === 'retry_refund') {
        if (pledge.status !== 'refund_failed') return NextResponse.json({ error: 'That refund isn’t in a failed state.' }, { status: 400 })
        const r = await refundPledge(db, drop, pledge, 'refund_failed')
        return NextResponse.json(r, { status: r.ok ? 200 : 400 })
      }
      if (pledge.status !== 'pending_choice') return NextResponse.json({ error: 'That deposit isn’t waiting on a choice.' }, { status: 400 })
      const r = body.choice === 'credit' ? await creditPledge(db, drop, pledge, 'pending_choice') : await refundPledge(db, drop, pledge, 'pending_choice')
      return NextResponse.json(r, { status: r.ok ? 200 : 400 })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e: any) {
    console.error('[admin/drops/action]', action, e)
    return NextResponse.json({ error: e?.message || 'Something went wrong.' }, { status: 500 })
  }
}

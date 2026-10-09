// Public — a customer picks refund or studio credit after a Set Drop is
// cancelled with "their choice". The token in the emailed link IS the
// authorisation (one pledge, one token); it can only ever resolve that pledge.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getDrop, refundPledge, creditPledge } from '@/lib/set-drops-server'
import { dollars, fmtInstant, type DropPledge } from '@/lib/set-drops'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const isToken = (t: string) => /^[0-9a-f-]{36}$/i.test(t)

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isToken(params.token)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const db = supabaseAdmin()
  const { data: p } = await db.from('set_drop_pledges').select('*').eq('choice_token', params.token).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const drop = await getDrop(db, p.drop_id)
  return NextResponse.json({
    dropName: drop?.name ?? 'Set Drop', status: p.status, deposit: dollars(p.deposit_cents),
    deadline: p.choice_deadline ? fmtInstant(p.choice_deadline) : null,
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!isToken(params.token)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json().catch(() => ({} as any))
  const choice = body.choice === 'credit' ? 'credit' : body.choice === 'refund' ? 'refund' : null
  if (!choice) return NextResponse.json({ error: 'Pick refund or credit.' }, { status: 400 })
  const db = supabaseAdmin()
  const { data: p } = await db.from('set_drop_pledges').select('*').eq('choice_token', params.token).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (p.status !== 'pending_choice') return NextResponse.json({ error: 'This deposit has already been settled.', status: p.status }, { status: 409 })
  const drop = await getDrop(db, p.drop_id)
  if (!drop) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const r = choice === 'credit'
    ? await creditPledge(db, drop, p as DropPledge, 'pending_choice')
    : await refundPledge(db, drop, p as DropPledge, 'pending_choice')
  if (!r.ok) return NextResponse.json({ error: r.error === 'Already handled.' ? 'This deposit has already been settled.' : 'Something went wrong — text (832) 408-1631 and we’ll sort it out.' }, { status: 400 })
  return NextResponse.json({ ok: true, choice })
}

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/funding — list all opportunities (by sort, then newest).
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabaseAdmin()
    .from('funding_opportunities')
    .select('id, name, type, amount, fit, status, deadline, next_action, url, notes, sort, created_at')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: false })
  return NextResponse.json({ funding: data ?? [] })
}

// POST /api/admin/funding — add a new opportunity.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const name = (b.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Enter a name.' }, { status: 400 })

  const { error } = await supabaseAdmin().from('funding_opportunities').insert({
    name,
    type:        b.type || null,
    amount:      b.amount || null,
    fit:         b.fit != null && b.fit !== '' ? Math.max(1, Math.min(5, Math.round(Number(b.fit)))) : 3,
    status:      b.status || 'not_started',
    deadline:    b.deadline || null,
    next_action: b.next_action || null,
    url:         b.url || null,
    notes:       b.notes || null,
    sort:        b.sort != null && b.sort !== '' ? Math.round(Number(b.sort)) : 100,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

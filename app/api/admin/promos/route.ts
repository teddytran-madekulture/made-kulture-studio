import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { normalizeCode } from '@/lib/promo'

export const dynamic = 'force-dynamic'

// GET /api/admin/promos — list all codes (newest first).
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabaseAdmin()
    .from('promo_codes')
    .select('id, code, kind, value, min_cents, max_uses, uses, per_customer_limit, starts_at, expires_at, active, label, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ promos: data ?? [] })
}

// POST /api/admin/promos — create a code.
// value is already in DB units: percent kind → whole percent (20); fixed → cents.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const code = normalizeCode(b.code)
  const kind = b.kind === 'fixed' ? 'fixed' : 'percent'
  const value = Math.round(Number(b.value) || 0)
  if (!code) return NextResponse.json({ error: 'Enter a code.' }, { status: 400 })
  if (value <= 0) return NextResponse.json({ error: 'Enter a discount amount.' }, { status: 400 })
  if (kind === 'percent' && value > 100) return NextResponse.json({ error: 'Percent can’t exceed 100.' }, { status: 400 })

  const { error } = await supabaseAdmin().from('promo_codes').insert({
    code, kind, value,
    min_cents:          b.min_cents != null ? Math.round(Number(b.min_cents)) : null,
    max_uses:           b.max_uses != null && b.max_uses !== '' ? Math.round(Number(b.max_uses)) : null,
    per_customer_limit: b.per_customer_limit != null && b.per_customer_limit !== '' ? Math.round(Number(b.per_customer_limit)) : null,
    starts_at:          b.starts_at || null,
    expires_at:         b.expires_at || null,
    label:              b.label || null,
    active:             true,
  })
  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
    return NextResponse.json({ error: dup ? 'That code already exists.' : error.message }, { status: dup ? 409 : 500 })
  }
  return NextResponse.json({ success: true })
}

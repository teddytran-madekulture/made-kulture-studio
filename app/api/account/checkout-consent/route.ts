// POST /api/account/checkout-consent { sms?: boolean, phone?: string, agreement?: boolean }
// Records what a signed-in member agreed to at checkout so the next booking can
// skip the text-consent box and fold the agreements into one (migration 181).
// Identity is the SESSION, never the body. Service role + .select() so a write
// that matches nothing is reported, not silently "saved".
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { AGREEMENT_VERSION, digitsOnly } from '@/lib/checkout-consent'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch {}
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {}
  const phone = digitsOnly(b?.phone)
  if (b?.sms === true && phone.length === 10) { patch.sms_consent_at = now; patch.sms_consent_phone = phone }
  if (b?.agreement === true) { patch.agreement_version = AGREEMENT_VERSION; patch.agreement_at = now }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, saved: false })
  const { data, error } = await supabaseAdmin().from('customer_profiles').update(patch).eq('id', user.id).select('id')
  if (error) { console.error('[checkout-consent] write failed', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ ok: true, saved: (data ?? []).length === 1 })
}

// GET  /api/listings/agreement  → { accepted, acceptedAt, version, current }
// POST /api/listings/agreement { name }  → records acceptance of the CURRENT
// Vendor Agreement (lib/vendor-agreement.ts) on the signed-in member's profile.
// Written with the service role and .select()-verified: an acceptance that
// silently didn't save would leave a vendor locked out with no explanation.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { VENDOR_AGREEMENT_VERSION } from '@/lib/vendor-agreement'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await service.from('customer_profiles')
    .select('vendor_terms_accepted_at, vendor_terms_version, phone, notify_sms').eq('id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    accepted: !!data?.vendor_terms_accepted_at,
    acceptedAt: data?.vendor_terms_accepted_at ?? null,
    version: data?.vendor_terms_version ?? null,
    current: VENDOR_AGREEMENT_VERSION,
    phone: data?.phone ?? '',
    notifySms: data?.notify_sms === true,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const name = String(b.name || '').trim().slice(0, 120)
  if (name.length < 2) return NextResponse.json({ error: 'Type your full name to sign.' }, { status: 400 })
  if (b.agree !== true) return NextResponse.json({ error: 'Tick the box to agree.' }, { status: 400 })

  // Optional: "text me when someone requests a listing" — turns on the
  // existing notify_sms preference and saves the number if one was typed.
  const patch: Record<string, unknown> = { vendor_terms_accepted_at: new Date().toISOString(), vendor_terms_version: VENDOR_AGREEMENT_VERSION, vendor_terms_name: name }
  if (b.textMe === true) {
    const digits = String(b.phone || '').replace(/[^\d]/g, '')
    if (digits.length < 10) return NextResponse.json({ error: 'Add a mobile number for request texts, or untick that box.' }, { status: 400 })
    patch.phone = digits.slice(-10)
    patch.notify_sms = true
  }
  const { data, error } = await service.from('customer_profiles')
    .update(patch)
    .eq('id', user.id).select('vendor_terms_accepted_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Your profile was not found — finish Edit profile first.' }, { status: 404 })
  return NextResponse.json({ ok: true, acceptedAt: data[0].vendor_terms_accepted_at, version: VENDOR_AGREEMENT_VERSION })
}

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// The invite link for someone credited on a photo who isn't on the directory
// yet (migration 133).
//   GET  ?token=  → public preview: who credited them, as what, and the photo
//   POST {token}  → signed-in: attach the credit to this account
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null
  const { data } = await service.from('portfolio_credits')
    .select('id, image_id, owner_id, member_id, name, instagram, role, removed_at')
    .eq('invite_token', token).maybeSingle()
  return data
}

export async function GET(req: NextRequest) {
  const c = await load(req.nextUrl.searchParams.get('token') || '')
  if (!c || c.removed_at) return NextResponse.json({ error: 'This invite link isn’t valid anymore.' }, { status: 404 })
  const [{ data: img }, { data: owner }] = await Promise.all([
    service.from('portfolio_images').select('url, is_mature, hidden').eq('id', c.image_id).maybeSingle(),
    service.from('customer_profiles').select('full_name').eq('id', c.owner_id).maybeSingle(),
  ])
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return NextResponse.json({
    role: c.role,
    name: c.name || (c.instagram ? `@${c.instagram}` : null),
    by: owner?.full_name || 'A member',
    // Never preview an 18+ or archived photo on a public page.
    photo: img && !img.is_mature && !img.hidden ? img.url : null,
    claimed: !!c.member_id,
    claimedByMe: !!user && c.member_id === user.id,
    signedIn: !!user,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const c = await load(String(body.token || ''))
  if (!c || c.removed_at) return NextResponse.json({ error: 'This invite link isn’t valid anymore.' }, { status: 404 })
  if (c.member_id === user.id) return NextResponse.json({ ok: true, already: true })
  if (c.member_id) return NextResponse.json({ error: 'This credit has already been claimed.' }, { status: 409 })
  if (c.owner_id === user.id) return NextResponse.json({ error: 'That’s your own photo.' }, { status: 400 })

  // Already credited on this photo under the account? Then this is a duplicate.
  const { data: dup } = await service.from('portfolio_credits')
    .select('id').eq('image_id', c.image_id).eq('member_id', user.id).maybeSingle()
  if (dup) {
    await service.from('portfolio_credits').delete().eq('id', c.id)
    return NextResponse.json({ ok: true, already: true })
  }

  // Claim only if still unclaimed — a concurrent claim must not be overwritten.
  const { data: done, error } = await service.from('portfolio_credits')
    .update({ member_id: user.id, claimed_at: new Date().toISOString() })
    .eq('id', c.id).is('member_id', null).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!done?.length) return NextResponse.json({ error: 'This credit has already been claimed.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

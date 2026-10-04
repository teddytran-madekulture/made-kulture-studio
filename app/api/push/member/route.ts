// /api/push/member — the signed-in member's push devices.
//   GET    ?endpoint=…        → { configured, enabled (this device), devices }
//   POST   { subscription }   → save this device (re-assigns it if the browser
//                               was previously signed in as someone else)
//   DELETE { endpoint }       → turn this device off
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { memberPushConfigured } from '@/lib/member-push'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function me() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

export async function GET(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  const { data, error } = await service.from('member_push_subscriptions').select('endpoint').eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    configured: memberPushConfigured(),
    devices: data?.length ?? 0,
    enabled: !!endpoint && (data ?? []).some(d => d.endpoint === endpoint),
  })
}

export async function POST(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const sub = b.subscription
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
  if (!/^https:\/\//.test(endpoint) || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 })
  }
  const { data, error } = await service.from('member_push_subscriptions')
    .upsert({ user_id: user.id, endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null }, { onConflict: 'endpoint' })
    .select('id')
  if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Could not save this device.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const endpoint = String(b.endpoint || '')
  const { error } = await service.from('member_push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

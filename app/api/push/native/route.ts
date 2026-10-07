// /api/push/native — the signed-in member's phone in the App Store app (2026-10-07).
//   GET    ?token=…              → { configured, enabled (this phone) }
//   POST   { token, platform }   → save this phone (re-assigns it if the app was
//                                  previously signed in as someone else)
//   DELETE { token }             → turn this phone off
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { apnsConfigured } from '@/lib/apns'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function me() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

function validToken(platform: string, token: string) {
  if (platform === 'ios') return /^[0-9a-f]{64,200}$/i.test(token)
  if (platform === 'android') return /^[\w:\-.]{20,4096}$/.test(token)
  return false
}

export async function GET(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = req.nextUrl.searchParams.get('token') || ''
  let enabled = false
  if (token) {
    const { data, error } = await service.from('native_push_tokens').select('id').eq('user_id', user.id).eq('token', token).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    enabled = !!data
  }
  return NextResponse.json({ configured: apnsConfigured(), enabled })
}

export async function POST(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const platform = String(b.platform || '')
  const token = String(b.token || '').trim()
  if (!validToken(platform, token)) return NextResponse.json({ error: 'Invalid device token.' }, { status: 400 })
  const { data, error } = await service.from('native_push_tokens')
    .upsert({ user_id: user.id, platform, token, updated_at: new Date().toISOString() }, { onConflict: 'token' })
    .select('id')
  if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Could not save this phone.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const token = String(b.token || '')
  const { error } = await service.from('native_push_tokens').delete().eq('user_id', user.id).eq('token', token)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

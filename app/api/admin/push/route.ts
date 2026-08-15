// Admin — register/unregister this device for Web Push (admin PWA).

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/admin/push { subscription: { endpoint, keys }, userAgent? }
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { subscription, userAgent } = await req.json()
  if (!subscription?.endpoint || !subscription?.keys) {
    return NextResponse.json({ error: 'subscription required' }, { status: 400 })
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null,
    },
    { onConflict: 'endpoint' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// GET /api/admin/push?endpoint=...
// Is THIS browser's subscription actually on file? The browser having a
// subscription and the server knowing about it are two different facts, and the
// gap between them is silent — which is exactly how the enable button ended up
// claiming notifications were on when nothing was being delivered.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  const { data, error } = await supabase
    .from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle()
  if (error) {
    // Read the error — a failed lookup reported as "not known" would send Teddy
    // re-subscribing forever.
    console.error('[admin push] lookup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ known: !!data })
}

// DELETE /api/admin/push { endpoint }
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { endpoint } = await req.json()
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return NextResponse.json({ success: true })
}

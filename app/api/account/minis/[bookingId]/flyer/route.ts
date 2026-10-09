// GET /api/account/minis/[bookingId]/flyer?size=story|portrait|square[&download=1]
// The photographer's shareable flyer: cover photo, title, date, price and a QR
// code to their sign-up page, branded Made Kulture. Owner only.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadForOwner, flyerInfoFor } from '@/lib/mini-sessions-server'
import { flyerImage, type FlyerSize } from '@/lib/mini-flyer'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = supabaseAdmin()
  const r = await loadForOwner(db, user, params.bookingId)
  if (!r.ok) return NextResponse.json({ error: (r as any).error }, { status: (r as any).status })
  if (!r.mini) return NextResponse.json({ error: 'Set up Mini Sessions first.' }, { status: 400 })
  const info = await flyerInfoFor(db, r.mini)
  if (!info) return NextResponse.json({ error: 'This day isn’t available.' }, { status: 404 })
  const q = req.nextUrl.searchParams.get('size')
  const size: FlyerSize = q === 'square' || q === 'portrait' ? q : 'story'
  const img = await flyerImage(info, size, req.nextUrl.origin)
  const headers = new Headers(img.headers)
  headers.set('Cache-Control', 'private, no-store')
  if (req.nextUrl.searchParams.get('download')) {
    const slug = (info.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mini-sessions').slice(0, 40)
    headers.set('Content-Disposition', `attachment; filename="${slug}-${size}.png"`)
  }
  return new Response(img.body, { status: 200, headers })
}

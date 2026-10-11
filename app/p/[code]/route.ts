// GET /p/<code> — a partner's link (migration 166). Remembers the partner for
// 30 days in the `mk_ref` cookie, counts the click, and lands on the home page.
// An unknown or switched-off code still lands on the home page, just untagged,
// so a stale link on someone's site never shows an error.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { activePartner, PARTNER_COOKIE, PARTNER_COOKIE_DAYS } from '@/lib/partners'

export const dynamic = 'force-dynamic'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const dest = new URL('/', req.url)
  const res = NextResponse.redirect(dest, 307)
  const partner = await activePartner(db, params.code)
  if (!partner) return res

  res.cookies.set(PARTNER_COOKIE, partner.code, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * PARTNER_COOKIE_DAYS, path: '/',
  })
  // Click count is a rough number (not atomic under simultaneous clicks) and
  // must never block the redirect.
  const { error } = await db.from('partners').update({ clicks: partner.clicks + 1 }).eq('id', partner.id)
  if (error) console.error('[partners] click count failed:', error.message)
  return res
}

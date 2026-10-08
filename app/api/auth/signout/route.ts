import { createClient } from '@/lib/supabase/server'
import { authCookieNames } from '@/lib/supabase/safe-cookies'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  await supabase.auth.signOut().catch(() => {})
  const origin = new URL(req.url).origin
  const res = NextResponse.redirect(new URL('/', origin), { status: 303 })
  // 2026-10-08: signOut() only clears the chunks it currently knows about, and
  // nothing at all when the session cookie is unreadable -- which left people
  // in the app unable to sign out. Delete every Supabase auth cookie outright.
  authCookieNames(req.cookies.getAll()).forEach((n) => res.cookies.delete(n))
  return res
}

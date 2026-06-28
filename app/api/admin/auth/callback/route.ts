import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { setAdminCookie } from '@/lib/admin-auth'

const ADMIN_EMAIL = 'teddytran@madekulture.com'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${origin}/admin?error=${encodeURIComponent('Google sign-in was cancelled.')}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/admin?error=${encodeURIComponent('Invalid sign-in link.')}`
    )
  }

  // We create a temporary response to collect any Supabase session cookies,
  // but we'll discard them — we only want to verify the identity.
  const tempRes = NextResponse.redirect(`${origin}/admin/dashboard`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()          { return req.cookies.getAll() },
        setAll(cookies)   { cookies.forEach(({ name, value, options }) => tempRes.cookies.set(name, value, options)) },
      },
    }
  )

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.user) {
    return NextResponse.redirect(
      `${origin}/admin?error=${encodeURIComponent('Google sign-in failed. Please try again.')}`
    )
  }

  if (data.user.email !== ADMIN_EMAIL) {
    // Sign the Google session back out — wrong account
    await supabase.auth.signOut()
    return NextResponse.redirect(
      `${origin}/admin?error=${encodeURIComponent('Access denied. Only the studio owner can access admin.')}`
    )
  }

  // Email matches — issue our own admin session cookie
  return setAdminCookie(tempRes)
}

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeAuthCookies } from '@/lib/supabase/safe-cookies'

export async function middleware(request: NextRequest) {
  // A corrupted session cookie used to crash this middleware on every request
  // (2026-10-08, see lib/supabase/safe-cookies.ts). Drop it, and delete it from
  // the browser below so the person can simply sign in again.
  const { bad } = safeAuthCookies(request.cookies.getAll())
  bad.forEach((n) => request.cookies.delete(n))

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))

  // Protect /account/* and /work/* routes — redirect to login if not authenticated
  const p = request.nextUrl.pathname
  if ((p.startsWith('/account') || p.startsWith('/work')) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Keep the query in `next` (2026-09-27): /account/bookings?save=<id> is how
    // the "save this booking with Plus" offer survives a sign-in. Clear the
    // original params first so they don't ride along beside `next`.
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    const res = NextResponse.redirect(url)
    bad.forEach((n) => res.cookies.delete(n))
    return res
  }

  bad.forEach((n) => supabaseResponse.cookies.delete(n))
  return supabaseResponse
}

export const config = {
  matcher: ['/account/:path*', '/work/:path*'],
}

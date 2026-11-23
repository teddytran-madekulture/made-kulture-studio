import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeAuthCookies } from '@/lib/supabase/safe-cookies'

// ── REAL LOGOUT (migration 190, 2026-11-23) ───────────────────────────────────
// Admin and staff cookies are signed tokens; before this, the server had no way
// to cancel one, so a copied cookie outlived a logout. Every request carrying
// one is now checked here against the database, and a cancelled cookie is
// STRIPPED from the request before any page or API route runs — so the sync
// isAdminAuthed / requireStaff guards everywhere simply see nobody signed in.
//
// ⚠️ This only ever REMOVES access. The signature and expiry are still verified
//    downstream (lib/admin-auth, lib/staff-auth); nothing here grants anything.
// ⚠️ FAILS OPEN, LOUDLY: if the lookup errors or times out, the request goes
//    through exactly as it did before this existed, and the error is logged.
//    A database hiccup must never lock the owner out of the admin.
// ⚠️ An admin session with no row is VALID (login never writes here).
// ⚠️ The matcher below runs this ONLY for requests that carry one of these
//    cookies — public visitors and kiosk tablets never invoke it.
const ADMIN_COOKIE = 'admin_auth'
const STAFF_COOKIES = ['mk_staff', 'mk_staff_locked']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OK_FOR_MS = 10_000                       // a cancel takes effect within ~10s
const okUntil = new Map<string, number>()

async function rest(path: string): Promise<any[]> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) throw new Error('Supabase env missing in middleware')
  const r = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(2500),
  })
  if (!r.ok) throw new Error(`session lookup ${r.status}`)
  return r.json()
}
function remember(k: string) { if (okUntil.size > 500) okUntil.clear(); okUntil.set(k, Date.now() + OK_FOR_MS) }

async function adminCancelled(token: string): Promise<boolean> {
  const [id, iat36] = token.split('.')
  if (!id || !UUID.test(id)) return false      // malformed: verifyAdminToken refuses it anyway
  if ((okUntil.get(`a:${id}`) ?? 0) > Date.now()) return false
  try {
    const iat = parseInt(iat36 ?? '', 36)
    const rows = await rest(`admin_session_revocations?select=id,revoked_at&id=in.(${id},__all__)`)
    for (const r of rows) {
      if (r.id === id) return true
      if (r.id === '__all__' && Number.isFinite(iat) && iat <= Date.parse(r.revoked_at)) return true
    }
    remember(`a:${id}`)
    return false
  } catch (e) {
    console.error('[middleware] ADMIN session check failed — letting the request through:', e)
    return false
  }
}

async function staffCancelled(token: string): Promise<boolean> {
  let p: { sid?: string; role?: string; iat?: number }
  try {
    const body = token.slice(0, token.indexOf('.')).replace(/-/g, '+').replace(/_/g, '/')
    p = JSON.parse(atob(body + '='.repeat((4 - (body.length % 4)) % 4)))
  } catch { return false }                     // unreadable: verifySession refuses it anyway
  if (!p?.sid || !UUID.test(p.sid)) return false
  const k = `s:${p.sid}:${p.iat}:${p.role}`
  if ((okUntil.get(k) ?? 0) > Date.now()) return false
  try {
    const rows = await rest(`staff_users?select=is_active,role,sessions_valid_after&id=eq.${p.sid}`)
    const u = rows[0]
    if (!u || u.is_active !== true) return true                        // deleted or deactivated
    if (u.role !== p.role) return true                                 // role changed: sign in again
    if (u.sessions_valid_after && typeof p.iat === 'number' && p.iat < Math.floor(Date.parse(u.sessions_valid_after) / 1000)) return true
    remember(k)
    return false
  } catch (e) {
    console.error('[middleware] STAFF session check failed — letting the request through:', e)
    return false
  }
}

/** Names of admin/staff cookies on this request whose session has been cancelled. */
async function cancelledCookies(request: NextRequest): Promise<string[]> {
  const out: string[] = []
  const admin = request.cookies.get(ADMIN_COOKIE)?.value
  if (admin && await adminCancelled(admin)) out.push(ADMIN_COOKIE)
  for (const n of STAFF_COOKIES) {
    const v = request.cookies.get(n)?.value
    if (v && await staffCancelled(v)) out.push(n)
  }
  return out
}

export async function middleware(request: NextRequest) {
  const cancelled = await cancelledCookies(request)
  cancelled.forEach((n) => request.cookies.delete(n))
  const path = request.nextUrl.pathname
  if (!path.startsWith('/account') && !path.startsWith('/work')) {
    // Here only because of an admin/staff cookie: pass through (minus any
    // cancelled cookie) and tell the browser to drop it.
    const res = NextResponse.next({ request })
    cancelled.forEach((n) => res.cookies.delete(n))
    return res
  }

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
    cancelled.forEach((n) => res.cookies.delete(n))
    return res
  }

  bad.forEach((n) => supabaseResponse.cookies.delete(n))
  cancelled.forEach((n) => supabaseResponse.cookies.delete(n))
  return supabaseResponse
}

export const config = {
  matcher: [
    '/account/:path*', '/work/:path*',
    // Session-cancel check: ONLY requests that carry an admin or staff cookie.
    { source: '/((?!_next/static|_next/image|favicon.ico).*)', has: [{ type: 'cookie', key: 'admin_auth' }] },
    { source: '/((?!_next/static|_next/image|favicon.ico).*)', has: [{ type: 'cookie', key: 'mk_staff' }] },
    { source: '/((?!_next/static|_next/image|favicon.ico).*)', has: [{ type: 'cookie', key: 'mk_staff_locked' }] },
  ],
}

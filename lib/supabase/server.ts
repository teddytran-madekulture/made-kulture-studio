import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { safeAuthCookies } from '@/lib/supabase/safe-cookies'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return safeAuthCookies(cookieStore.getAll()).cookies },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

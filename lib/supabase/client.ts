import { createBrowserClient } from '@supabase/ssr'
import { cleanBrowserAuthCookies } from '@/lib/supabase/safe-cookies'

export function createClient() {
  // 2026-10-08: clear a corrupted/leftover session cookie before the library
  // reads it (see lib/supabase/safe-cookies.ts).
  cleanBrowserAuthCookies()
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

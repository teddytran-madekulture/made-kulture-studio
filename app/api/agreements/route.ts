import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AGREEMENT_KEYS } from '@/lib/agreements'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// GET /api/agreements — public. Returns any admin-saved overrides for the rental
// agreements (Markdown). null means "use the built-in default".
export async function GET() {
  const { data } = await supabase
    .from('studio_settings')
    .select('key, value')
    .in('key', [AGREEMENT_KEYS.set, AGREEMENT_KEYS.studio])

  const map: Record<string, string> = {}
  for (const row of data ?? []) if (row.value) map[row.key] = row.value

  return NextResponse.json({
    set:    map[AGREEMENT_KEYS.set]    ?? null,
    studio: map[AGREEMENT_KEYS.studio] ?? null,
  })
}

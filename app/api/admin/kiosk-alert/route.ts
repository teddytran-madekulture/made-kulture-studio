import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

// GET /api/admin/kiosk-alert
// Returns the timestamp of the most recent kiosk "Get the team" ring so the
// admin app can raise a loud in-app alarm. Polled every few seconds by the
// KioskAlarm component; cheap single-row read.

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase
    .from('studio_settings')
    .select('value')
    .eq('key', 'kiosk_summon_at')
    .maybeSingle()
  return NextResponse.json({ at: data?.value ?? null })
}

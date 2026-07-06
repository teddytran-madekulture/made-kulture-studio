import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

// POST /api/admin/kiosk-ack
// Marks the current kiosk ring as seen. Called by KioskAck whenever the admin
// app is open/visible, which stops the escalating push loop — the whole point
// is to keep buzzing Teddy only while he ISN'T looking at the admin.

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const nowIso = new Date().toISOString()
  await supabase
    .from('studio_settings')
    .upsert({ key: 'kiosk_summon_ack_at', value: nowIso, updated_at: nowIso }, { onConflict: 'key' })
    .then(undefined, e => console.error('[kiosk ack] error:', e))
  return NextResponse.json({ ok: true })
}

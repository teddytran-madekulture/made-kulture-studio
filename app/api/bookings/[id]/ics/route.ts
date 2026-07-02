import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { icsContent, STUDIO_ADDRESS, type CalEvent } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/bookings/[id]/ics?token=<check_in_token> — downloadable calendar file.
// Gated by the booking's check_in_token (same unguessable token as the check-in
// link), so booking details / door code aren't exposed by guessing the id.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.nextUrl.searchParams.get('token') || ''
  const { data: b } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, door_code, check_in_token, sets(name)')
    .eq('id', params.id)
    .maybeSingle()

  if (!b || !token || b.check_in_token !== token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const setName = (b as any).sets?.name || 'Full Studio Takeover'
  const details = [
    `Your Made Kulture session: ${setName}.`,
    (b as any).door_code ? `Front-door code: ${(b as any).door_code} (works during your booked time).` : '',
    'Manage your booking at https://made-kulture-studio.vercel.app/account',
  ].filter(Boolean).join('\n')

  const ev: CalEvent = {
    title: `Made Kulture — ${setName}`,
    startISO: b.start_time,
    endISO: b.end_time,
    location: STUDIO_ADDRESS,
    details,
  }

  return new NextResponse(icsContent(ev, `booking-${b.id}@madekulture`), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="made-kulture-${setName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics"`,
    },
  })
}

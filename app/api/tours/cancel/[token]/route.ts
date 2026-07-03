// Tour cancellation — works for the customer (cancel link in their SMS) and
// the studio (CANCEL button in the admin TOURS tab).
// GET  → tour details for the cancel page
// POST { by?: 'customer' | 'studio' } → cancel + clean up calendar + notify

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { deleteCalendarEvent } from '@/lib/gcal'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function centralLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

async function findByCancelToken(token: string) {
  const { data } = await supabase
    .from('tour_requests')
    .select('id, name, phone, start_time, end_time, status, gcal_event_id')
    .eq('cancel_token', token)
    .single()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await findByCancelToken(params.token)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({
    tour: { name: r.name, status: r.status, whenLabel: centralLabel(r.start_time) },
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let by: 'customer' | 'studio' = 'customer'
  try {
    const body = await req.json()
    if (body?.by === 'studio') by = 'studio'
  } catch {}

  const r = await findByCancelToken(params.token)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (r.status === 'cancelled') return NextResponse.json({ success: true, already: true })
  if (r.status === 'declined') return NextResponse.json({ error: 'This tour was already declined.' }, { status: 409 })

  await supabase.from('tour_requests').update({ status: 'cancelled' }).eq('id', r.id)

  if (r.gcal_event_id) {
    try { await deleteCalendarEvent(r.gcal_event_id) }
    catch (e) { console.error('[tour cancel] gcal delete error (non-fatal):', e) }
  }

  const when = centralLabel(r.start_time)
  if (by === 'customer') {
    await sendOwnerPush({
      title: '🚶 Tour cancelled by visitor',
      body: `${r.name} cancelled their ${when} tour.`,
      url: '/admin/inbox',
    }).catch(() => {})
  } else {
    await sendSMS(
      r.phone,
      `Hey ${r.name} — we're sorry, we had to cancel your Made Kulture tour (${when}). Text (832) 408-1631 and we'll find a new time, or grab another slot: ${(process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app')}/tour`
    ).catch(e => console.error('[tour cancel] SMS error (non-fatal):', e))
  }

  return NextResponse.json({ success: true })
}

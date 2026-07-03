// Teddy's one-tap tour decision (token = auth, same pattern as short-notice).
// GET  → request details for the /tour-admin page
// POST { action: 'approve' | 'decline' } → updates status, texts the requester,
//        and (on approve) drops the tour onto the Google Calendar.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { createCalendarEvent } from '@/lib/gcal'
import { STUDIO_ADDRESS } from '@/lib/calendar'

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

async function findRequest(token: string) {
  const { data } = await supabase
    .from('tour_requests')
    .select('id, name, phone, email, purpose, start_time, end_time, status, is_custom, gcal_event_id')
    .eq('decision_token', token)
    .single()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await findRequest(params.token)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ request: { ...r, whenLabel: centralLabel(r.start_time) } })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { action } = await req.json()
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: 'bad action' }, { status: 400 })
  }

  const r = await findRequest(params.token)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (r.status !== 'pending') {
    return NextResponse.json({ error: `Already ${r.status}.`, status: r.status }, { status: 409 })
  }

  const when = centralLabel(r.start_time)

  if (action === 'approve') {
    // Calendar event (env-gated, non-fatal).
    let gcalId: string | null = null
    try {
      gcalId = await createCalendarEvent({
        summary: `Tour — ${r.name}`,
        description: [`Studio tour (30 min)`, `${r.name} · ${r.phone}${r.email ? ` · ${r.email}` : ''}`, ...(r.purpose ? [`Planning: ${r.purpose}`] : []), ...(r.is_custom ? ['CUSTOM time — studio not otherwise open'] : [])].join('\n'),
        location: STUDIO_ADDRESS,
        startISO: r.start_time,
        endISO: r.end_time,
      })
    } catch (e) {
      console.error('[tour approve] gcal error (non-fatal):', e)
    }

    await supabase.from('tour_requests')
      .update({ status: 'approved', gcal_event_id: gcalId })
      .eq('id', r.id)

    await sendSMS(
      r.phone,
      `✅ Your Made Kulture tour is confirmed!\n\n📅 ${when}\n📍 4825 Gulf Freeway, Houston TX 77023 (street parking in the rear)\n\nSee you then! Questions? Text (832) 408-1631.`
    ).catch(e => console.error('[tour approve] SMS error (non-fatal):', e))

    return NextResponse.json({ success: true, status: 'approved' })
  }

  await supabase.from('tour_requests').update({ status: 'declined' }).eq('id', r.id)
  await sendSMS(
    r.phone,
    `Hey ${r.name} — that tour time (${when}) doesn't work on our end, sorry! Text us at (832) 408-1631 and we'll find one that does, or grab another slot at ${(process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app')}/tour.`
  ).catch(e => console.error('[tour decline] SMS error (non-fatal):', e))

  return NextResponse.json({ success: true, status: 'declined' })
}

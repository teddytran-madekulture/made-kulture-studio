// POST /api/tours/request { name, phone, email?, purpose?, startISO }
// Creates a pending tour request and pings Teddy (push + SMS) with a one-tap
// approve/decline link. Slot is re-validated server-side against the same
// rules as /api/tours/slots.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { toE164 } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
const TOUR_MS = 30 * 60 * 1000
const LEAD_TIME_MS = 2 * 60 * 60 * 1000

// Simple per-IP rate limit (3 requests / hour)
const hits = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter(t => now - t < 3600_000)
  if (arr.length >= 3) { hits.set(ip, arr); return true }
  arr.push(now); hits.set(ip, arr)
  return false
}

function centralLabel(ms: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(ms))
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.json({ error: 'Too many requests — text us instead: (832) 408-1631' }, { status: 429 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const name = String(body?.name ?? '').trim().slice(0, 80)
  const phone = toE164(String(body?.phone ?? ''))
  const email = String(body?.email ?? '').trim().slice(0, 120) || null
  const purpose = String(body?.purpose ?? '').trim().slice(0, 300) || null
  const start = Date.parse(String(body?.startISO ?? ''))

  if (!name || !phone) return NextResponse.json({ error: 'Name and a valid phone number are required.' }, { status: 400 })
  if (!Number.isFinite(start)) return NextResponse.json({ error: 'Pick a time slot.' }, { status: 400 })
  if (start < Date.now() + LEAD_TIME_MS) return NextResponse.json({ error: 'That time is too soon — pick a later slot.' }, { status: 400 })

  const end = start + TOUR_MS

  // Business hours guard (Houston time): tours start 9:00am–9:30pm.
  const hourParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(start))
  const startHour = Number(hourParts.find(p => p.type === 'hour')?.value ?? 0) +
    (Number(hourParts.find(p => p.type === 'minute')?.value ?? 0) >= 30 ? 0.5 : 0)
  if (startHour < 9 || startHour > 21.5) {
    return NextResponse.json({ error: 'Tours run between 9am and 10pm Houston time.' }, { status: 400 })
  }

  // Classify: inside a confirmed set booking = standard; otherwise a CUSTOM
  // request (Teddy has to open the studio — he decides). Buyouts always block.
  const { data: bookings } = await supabase
    .from('bookings')
    .select('start_time, end_time, set_id')
    .eq('status', 'confirmed')
    .lt('start_time', new Date(end).toISOString())
    .gt('end_time', new Date(start).toISOString())
  const rows = bookings ?? []
  const insideSet = rows.some(b => b.set_id !== null && Date.parse(b.start_time) <= start && Date.parse(b.end_time) >= end)
  const inBuyout = rows.some(b => b.set_id === null)
  if (inBuyout) {
    return NextResponse.json({ error: 'The studio is privately booked at that time — pick a different slot.' }, { status: 409 })
  }
  const isCustom = !insideSet

  const token = randomUUID() + randomUUID().slice(0, 8)
  const { data: created, error } = await supabase
    .from('tour_requests')
    .insert({
      name, phone, email, purpose,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      decision_token: token,
      is_custom: isCustom,
    })
    .select('id').single()
  if (error || !created) return NextResponse.json({ error: 'Could not save your request — text us at (832) 408-1631.' }, { status: 500 })

  const when = centralLabel(start)
  const decideUrl = `${APP_URL}/tour-admin/${token}`

  // Notify Teddy — push only (owner SMS dropped 2026-07-03; push is free).
  void decideUrl
  await sendOwnerPush({
    title: isCustom ? '🚶 CUSTOM tour request' : '🚶 Tour request',
    body: `${when} — ${name}${purpose ? ` · ${purpose}` : ''}`,
    url: `/tour-admin/${token}`,
    tag: `tour-${created.id}`,
  }).catch(e => console.error('[tours] owner push error (non-fatal):', e))

  return NextResponse.json({
    success: true,
    isCustom,
    message: isCustom
      ? `Request sent! Custom times depend on our schedule — we'll text you at ${phone} either way.`
      : `Request received! We'll text you at ${phone} once it's confirmed.`,
  })
}

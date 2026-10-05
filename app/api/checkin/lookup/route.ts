import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { checkInUrl } from '@/lib/igloohome'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// POST /api/checkin/lookup { phone }
//
// 2026-10-04 SECURITY: this used to RETURN the booking's check-in token to
// whoever typed a phone number. The check-in page reveals the door code, and
// its location check is skipped when no location is sent, so knowing a guest's
// phone number was enough to get the front-door code to the building.
// Now the link is TEXTED to the number on the booking, so only the person
// holding that phone gets in. The response is IDENTICAL whether or not a
// booking matched, so this endpoint can no longer be used to learn who is
// booked today either.
//
// The set/door tablets do NOT use this route — /kiosk checks in through
// /api/kiosk/checkin (KIOSK_KEY, no door code). Don't add a "return the token
// if kiosk=1" shortcut here: ?kiosk=1 is just a URL anyone can type.
//
// Limits are per serverless instance (in-memory), a coarse backstop. The real
// protection is that nothing useful comes back in the response.

const last10 = (s: string) => (s || '').replace(/\D/g, '').slice(-10)

const ipHits = new Map<string, number[]>()
const phoneLast = new Map<string, number>()
const IP_MAX = 5, IP_WINDOW_MS = 10 * 60 * 1000
const PHONE_GAP_MS = 2 * 60 * 1000

function ipLimited(ip: string): boolean {
  const now = Date.now()
  const arr = (ipHits.get(ip) ?? []).filter(t => now - t < IP_WINDOW_MS)
  if (arr.length >= IP_MAX) { ipHits.set(ip, arr); return true }
  arr.push(now); ipHits.set(ip, arr); return false
}

const SENT_MESSAGE = 'If that number is on a booking today, we just texted it your check-in link. Nothing after a minute? Text (832) 408-1631.'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (ipLimited(ip)) {
      return NextResponse.json({ error: 'Too many tries. Text (832) 408-1631 for help.' }, { status: 429 })
    }

    const { phone } = await req.json()
    const digits = last10(phone)
    if (digits.length !== 10) return NextResponse.json({ error: 'Enter the 10-digit phone number on your booking.' }, { status: 400 })

    // One text per number per 2 minutes, so this can't be used to spam someone.
    // Still answers "sent" so a repeat tap looks the same as the first.
    const prev = phoneLast.get(digits)
    if (prev && Date.now() - prev < PHONE_GAP_MS) return NextResponse.json({ sent: true, message: SENT_MESSAGE })

    const now = Date.now()
    const fromISO = new Date(now - 3 * 60 * 60 * 1000).toISOString()  // started up to 3h ago
    const toISO   = new Date(now + 16 * 60 * 60 * 1000).toISOString() // through later today

    const { data: rows, error } = await supabase
      .from('bookings')
      .select('check_in_token, start_time, status, sets ( name ), customers ( name, phone )')
      .neq('status', 'cancelled')
      .gte('start_time', fromISO)
      .lte('start_time', toISO)
      .order('start_time', { ascending: true })
    if (error) {
      console.error('[checkin/lookup] read failed:', error.message)
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
    }

    const match = (rows ?? []).find(r => last10((r.customers as any)?.phone ?? '') === digits)
    if (match?.check_in_token) {
      phoneLast.set(digits, Date.now())
      const setName = (match.sets as any)?.name || 'your session'
      // Plain GSM-7 only: no emoji, no em dash (lib/sms.ts gsmSafe, see sms-gsm7-segments).
      const r = await sendSMSResult(digits, `Made Kulture: your check-in link for ${setName}. Tap it when you arrive to check in and get your door code: ${checkInUrl(match.check_in_token)}`)
      if (!r.ok) console.error('[checkin/lookup] text failed:', r.error)
    }

    return NextResponse.json({ sent: true, message: SENT_MESSAGE })
  } catch (err) {
    console.error('[checkin/lookup] error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

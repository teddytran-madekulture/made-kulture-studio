// POST /api/floor/mark  { code, action: 'clear' | 'flag', pin?, key? }
//
// Two ways in, one code path:
//   • FROM THE DESK  — a live staff session is enough.
//   • FROM A SET'S OWN TABLET — whoever just cleaned Set C is standing in Set C,
//     so the kiosk takes the same staff PIN they already use to unlock the desk.
//     That also records WHO cleared it, which is turnover accountability that
//     did not exist before.
//
// ⚠️ THE KIOSK CANNOT CHECK A PIN THE WAY THE DESK DOES. /api/staff/unlock knows
// WHO you are from the locked cookie and verifies one hash. A wall tablet has no
// cookie, so it must test every active staff member — which makes a 4-digit PIN
// brute-forceable over a public route. Hence the lockout below, and hence it is
// counted in the DATABASE: module-level state on Vercel is per-serverless-
// instance, which is precisely how the kiosk summon managed to both double-push
// and silently throttle.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getStaffFromRequest, verifySecret } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

const LOCKOUT_WINDOW_MS = 10 * 60 * 1000
const LOCKOUT_AFTER     = 6

function kioskKeyOk(key: string | null): boolean {
  const required = process.env.KIOSK_KEY
  if (!required) return true
  return key === required
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { /* handled below */ }

  const code   = typeof body?.code === 'string' ? body.code : ''
  const action = body?.action === 'flag' ? 'flag' : 'clear'
  if (!code) return NextResponse.json({ error: 'Which room?' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: area, error: areaErr } = await db
    .from('floor_areas').select('code, label, kind').eq('code', code).maybeSingle()
  if (areaErr) return NextResponse.json({ error: areaErr.message }, { status: 500 })
  if (!area)   return NextResponse.json({ error: 'No such room.' }, { status: 404 })

  // ⚠️ Only a FACILITY can be flagged dirty by hand. A set's dirty state is
  // derived from its bookings, so a manual flag there would be written and then
  // ignored on the very next read — a control that looks like it worked and did
  // nothing.
  if (action === 'flag' && area.kind !== 'facility') {
    return NextResponse.json(
      { error: 'A set is marked for cleaning automatically when its session ends.' },
      { status: 400 },
    )
  }

  // ── Who is asking ──────────────────────────────────────────────────────────
  let staffId: string | null = null
  let staffName = ''

  const session = getStaffFromRequest(req)
  if (session) {
    staffId = session.staffId
    staffName = session.name
  } else {
    // Kiosk path: the tablet key gets you to the door, the PIN opens it.
    if (!kioskKeyOk(body?.key ?? null)) {
      return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })
    }
    const pin = String(body?.pin ?? '').trim()
    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'Enter your 4-6 digit staff PIN.' }, { status: 400 })
    }

    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString()
    const { count } = await db
      .from('floor_area_events')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'bad_pin')
      .gte('at', since)
    if ((count ?? 0) >= LOCKOUT_AFTER) {
      return NextResponse.json(
        { error: 'Too many wrong PINs. Try again in a few minutes or mark it at the front desk.' },
        { status: 429 },
      )
    }

    const { data: staff } = await db
      .from('staff_users').select('id, name, pin_hash').eq('is_active', true).not('pin_hash', 'is', null)
    const match = (staff ?? []).find((s: any) => verifySecret(pin, s.pin_hash))
    if (!match) {
      await db.from('floor_area_events').insert({ code, action: 'bad_pin', source: 'kiosk' })
      return NextResponse.json({ error: 'That PIN was not recognised.' }, { status: 401 })
    }
    staffId = match.id
    staffName = match.name
  }

  // ── Write it ───────────────────────────────────────────────────────────────
  const nowISO = new Date().toISOString()
  const patch = action === 'clear'
    ? { cleared_at: nowISO, cleared_by: staffName, cleared_by_id: staffId }
    : { flagged_at: nowISO, flagged_by: staffName }

  // ⚠️ .select() so a row that did not change cannot report success — an
  // RLS-blocked update returns error null and matches nothing.
  const { data: updated, error: upErr } = await db
    .from('floor_areas').update(patch).eq('code', code).select('code')
  if (upErr)              return NextResponse.json({ error: upErr.message }, { status: 500 })
  if (!updated?.length)   return NextResponse.json({ error: 'Nothing was updated — tell Teddy.' }, { status: 500 })

  await db.from('floor_area_events').insert({
    code, action, staff_id: staffId, staff_name: staffName,
    source: session ? 'desk' : 'kiosk',
  })

  return NextResponse.json({ ok: true, code, action, by: staffName, at: nowISO, label: area.label })
}

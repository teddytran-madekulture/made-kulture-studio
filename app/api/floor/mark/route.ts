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
import { isAdminAuthed } from '@/lib/admin-auth'

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

  const action = body?.action === 'flag' ? 'flag' : 'clear'
  // One room, or a batch. A full-studio buyout dirties every set at once, so
  // clearing them one at a time is ten taps for a single event.
  const codes: string[] = Array.isArray(body?.codes)
    ? body.codes.filter((c: unknown) => typeof c === 'string').slice(0, 40)
    : typeof body?.code === 'string' && body.code ? [body.code] : []
  if (!codes.length) return NextResponse.json({ error: 'Which room?' }, { status: 400 })
  const code = codes[0]

  const db = supabaseAdmin()
  const { data: areaRows, error: areaErr } = await db
    .from('floor_areas').select('code, label, kind').in('code', codes)
  if (areaErr) return NextResponse.json({ error: areaErr.message }, { status: 500 })
  const areas = areaRows ?? []
  if (areas.length !== codes.length) {
    return NextResponse.json({ error: 'One of those rooms does not exist.' }, { status: 404 })
  }
  const area = areas[0]

  // Any area can be flagged by hand. readFloor() ORs a manual flag with "a
  // session ended here", and a clear beats both — so the manual control and the
  // automatic rule cannot contradict each other.

  // ── Who is asking ──────────────────────────────────────────────────────────
  let staffId: string | null = null
  let staffName = ''

  const session = getStaffFromRequest(req)
  // ⚠️ ADMIN COUNTS TOO. /api/floor/board accepts an admin session, so signing in
  // with the admin password showed a full board whose buttons ALWAYS failed —
  // read and write disagreed about who counts. An admin-password login carries no
  // staff identity (see the three-credential model), so the log records 'Admin'.
  const admin = !session && isAdminAuthed(req)
  if (session || admin) {
    staffId = session?.staffId ?? null
    staffName = session?.name ?? 'Admin'
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
    .from('floor_areas').update(patch).in('code', codes).select('code')
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  // ⚠️ Assert the whole batch landed. A partial update reporting success is how
  // rooms silently stay dirty while the board says the floor is clear.
  if ((updated?.length ?? 0) !== codes.length) {
    return NextResponse.json(
      { error: `Only ${updated?.length ?? 0} of ${codes.length} rooms updated — tell Teddy.` },
      { status: 500 },
    )
  }

  // One row per room, so the log still answers "who cleared Set C".
  await db.from('floor_area_events').insert(codes.map(c => ({
    code: c, action, staff_id: staffId, staff_name: staffName,
    source: session || admin ? 'desk' : 'kiosk',
  })))

  return NextResponse.json({
    ok: true, code, codes, count: codes.length, action,
    by: staffName, at: nowISO, label: area.label,
  })
}

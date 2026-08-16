// GET /api/floor/board — the floor status board's data.
//
// Readable by a staff session, an ADMIN session, or a LOCKED staff session.
// That last one is the point: the board IS the desk lock screen, so it has to
// render while the session is suspended. The locked cookie is identity-only and
// authorises nothing else — every action still demands the PIN.
//
// ⚠️ NO GUEST NAMES ARE RETURNED. A front desk sits where anyone can see it.
// The board says a room is occupied and when it frees up; who is in it is a
// question for someone who has unlocked the tablet.

import { NextRequest, NextResponse } from 'next/server'
import { getStaffFromRequest, getLockedStaff } from '@/lib/staff-auth'
import { isAdminAuthed } from '@/lib/admin-auth'
import { readFloor, readAgenda } from '@/lib/floor-status'

export const dynamic = 'force-dynamic'
// Supabase reads in a polled route go stale with force-dynamic alone.
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  const fullSession = getStaffFromRequest(req)
  const locked = getLockedStaff(req)
  const admin = isAdminAuthed(req)
  if (!fullSession && !locked && !admin) {
    return NextResponse.json({ error: 'Sign in at the front desk.' }, { status: 401 })
  }

  // ⚠️ THE BOUNDARY THAT MATTERS. A LOCKED session may see colours and room
  // names — that is the whole point of the board on the lock screen. It may NOT
  // see who is in the room, because that screen sits where anyone can read it.
  // Unlock (which costs a PIN) and the names appear.
  const withGuest = !!fullSession || admin
  // ⚠️ ONLY THE AGENDA TRAVELS. `areas` is always NOW — a past date must never
  // make rooms look occupied, or the map starts lying about the building.
  const date = req.nextUrl.searchParams.get('date') ?? undefined
  const [areas, agenda] = await Promise.all([
    readFloor({ withGuest }),
    readAgenda({ withGuest, date }),
  ])
  return NextResponse.json({
    areas,
    agenda,
    // Who is holding this session, so ATLAS can say whose PIN is in.
    viewer: fullSession ? { name: fullSession.name } : admin ? { name: 'Admin' } : null,
    // Stamped so a tablet can tell a live answer from a stale cached one.
    at: new Date().toISOString(),
  })
}

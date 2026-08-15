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
import { readFloor } from '@/lib/floor-status'

export const dynamic = 'force-dynamic'
// Supabase reads in a polled route go stale with force-dynamic alone.
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  const viewer = getStaffFromRequest(req) ?? getLockedStaff(req)
  if (!viewer && !isAdminAuthed(req)) {
    return NextResponse.json({ error: 'Sign in at the front desk.' }, { status: 401 })
  }

  const areas = await readFloor()
  return NextResponse.json({
    areas,
    // Stamped so a tablet can tell a live answer from a stale cached one.
    at: new Date().toISOString(),
  })
}

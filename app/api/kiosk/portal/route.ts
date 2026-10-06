// GET /api/kiosk/portal?set=set-c&key=XXXX — the set tablet's PORTAL.
// Returns the phone link for the QR and the board's images for the wall.
//
// ⚠️ The tablet sends only its SET. The server re-derives who is on it, exactly
// like /api/kiosk/context, so a tablet can only ever open its own session.
// ⚠️ Polled ONLY while the PORTAL screen or the board is open (see app/kiosk).
import { NextRequest, NextResponse } from 'next/server'
import { findActiveBookingBySet } from '@/lib/extensions'
import { getOrCreatePortal, listItems } from '@/lib/portal'
import { poseById } from '@/lib/poses'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function keyOk(key: string | null): boolean {
  const required = process.env.KIOSK_KEY
  // 2026-10-06: fail CLOSED — an unset key used to make this route public.
  if (!required) { console.error('[auth] key env var is not set — refusing'); return false }
  return key === required
}

export async function GET(req: NextRequest) {
  if (!keyOk(req.nextUrl.searchParams.get('key'))) return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })
  const setSlug = req.nextUrl.searchParams.get('set')
  if (!setSlug) return NextResponse.json({ live: false })

  const occ: any = await findActiveBookingBySet(setSlug)
  const now = Date.now()
  // Only a session that has STARTED gets a portal — the board belongs to the
  // people in the room, not to whoever is booked next.
  if (!occ?.bookingId || Date.parse(occ.startISO) > now || Date.parse(occ.endISO) <= now) {
    return NextResponse.json({ live: false })
  }
  const portal = await getOrCreatePortal(occ.bookingId, setSlug)
  if (!portal) return NextResponse.json({ error: 'Could not open the portal.' }, { status: 500 })
  try {
    const items = await listItems(portal.id)
    // A pose the guest sent to the wall from their phone (Pose Guide).
    const { data: w } = await supabaseAdmin().from('portal_sessions').select('wall_pose_id, wall_at').eq('id', portal.id).maybeSingle()
    const wallPose = (w as any)?.wall_pose_id ? await poseById((w as any).wall_pose_id) : null
    return NextResponse.json({
      live: true,
      // The ORIGIN the tablet loaded from, so the domain move needs no change here.
      url: `${req.nextUrl.origin}/portal/${portal.token}`,
      endISO: occ.endISO,
      items,
      wall: wallPose ? { at: (w as any).wall_at, pose: wallPose } : null,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load the board.' }, { status: 500 })
  }
}

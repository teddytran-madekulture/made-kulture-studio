// POST /api/account/nomad/checkout-photo — one check-out photo for the member's
// own stay (2026-10-26). The page shrinks each photo to ≤1600px JPEG first, so
// every upload stays far under Vercel's 4.5 MB request ceiling. Returns the
// storage path; the 'checkout' action on /api/account/nomad saves the list.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { membershipForUser, getHouse, localToday, addDays } from '@/lib/nomad'
import { CHECKOUT_BUCKET } from '@/lib/nomad-checkout'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return bad('Unauthorized', 401)
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const stayId = String(form?.get('stayId') || '')
  if (!file || typeof file === 'string') return bad('No photo received.')
  const ext = TYPES[(file as File).type]
  if (!ext) return bad('Photos only (JPG, PNG or WebP).')
  if ((file as File).size > 4 * 1024 * 1024) return bad('That photo is too large.')

  const db = supabaseAdmin()
  const m = await membershipForUser(db, user.id)
  if (!m) return bad('You’re not a Nomad member.', 403)
  const { data: stay } = await db.from('nomad_stays').select('id, house_id, check_in, check_out, status, checked_out_at').eq('id', stayId).eq('membership_id', m.id).maybeSingle()
  if (!stay || stay.status !== 'confirmed') return bad('Stay not found.', 404)
  if (stay.checked_out_at) return bad('You’ve already checked out of this stay.', 409)
  const house = await getHouse(db, stay.house_id)
  const t = localToday(house?.timezone)
  // During the stay, plus one grace day after check-out.
  if (t < stay.check_in || t > addDays(stay.check_out, 1)) return bad('Check-out photos open during your stay.')

  const path = `${stay.id}/${randomUUID()}.${ext}`
  const { error } = await db.storage.from(CHECKOUT_BUCKET).upload(path, Buffer.from(await (file as File).arrayBuffer()), { contentType: (file as File).type, upsert: false })
  if (error) return bad(`Upload failed: ${error.message}`, 500)
  return NextResponse.json({ ok: true, path })
}

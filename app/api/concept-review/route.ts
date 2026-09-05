// POST /api/concept-review — a guest submits a messy-concept request for review.
//
// Public but UNLISTED: /concept-review is not in site nav, and June only gives
// out the link if a guest presses after being told no. A submission therefore
// means somebody asked twice and was willing to write a plan.
//
// Nothing here approves anything. It records the request and pushes Teddy.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

const MAX_PHOTOS = 6
const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

// Same shape as the agent chat limiter: in-memory, per-instance, good enough for
// a form nobody can find. Not a security boundary.
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < 60 * 60 * 1000)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > 5
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many submissions. Please text the studio instead.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Bad submission' }, { status: 400 })
  }

  const s = (k: string) => String(form.get(k) ?? '').trim()

  const name = s('name').slice(0, 120)
  const email = s('email').slice(0, 200)
  const phone = s('phone').slice(0, 40)
  const concept = s('concept').slice(0, 4000)
  const materials = s('materials').slice(0, 2000)
  const locationPlan = s('location_plan').slice(0, 2000)
  const prepPlan = s('prep_plan').slice(0, 2000)
  const cleanupPlan = s('cleanup_plan').slice(0, 2000)

  // Every one of these is load-bearing. A submission missing the plans is the
  // thing the form exists to refuse.
  const missing = Object.entries({ name, email, phone, concept, materials, location_plan: locationPlan, prep_plan: prepPlan, cleanup_plan: cleanupPlan })
    .filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) {
    return NextResponse.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 })
  }

  if (s('acknowledged') !== 'true') {
    return NextResponse.json({ error: 'The acknowledgements must be accepted.' }, { status: 400 })
  }

  const hasBooking = s('has_booking') === 'true'
  const bookingDate = s('booking_date') || null
  const setNames = s('set_names').slice(0, 200) || null
  const headcount = Number(s('headcount')) || null
  const cleanupMinutes = Number(s('cleanup_minutes')) || null

  // Photos → private bucket. Upload BEFORE the insert so a storage failure never
  // leaves a row claiming references that do not exist.
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_PHOTOS)
  const photoPaths: string[] = []
  const submissionId = randomUUID()
  for (const f of files) {
    if (!OK_TYPES.has(f.type)) {
      return NextResponse.json({ error: `Unsupported image type: ${f.type || 'unknown'}` }, { status: 400 })
    }
    if (f.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: `"${f.name}" is over 8MB.` }, { status: 400 })
    }
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
    const path = `${submissionId}/${randomBytes(6).toString('hex')}.${ext}`
    const buf = Buffer.from(await f.arrayBuffer())
    const { error: upErr } = await supabase.storage.from('concept-media').upload(path, buf, { contentType: f.type, upsert: false })
    if (upErr) {
      console.error('[concept-review] photo upload failed:', upErr)
      return NextResponse.json({ error: 'A reference photo failed to upload. Please try again.' }, { status: 500 })
    }
    photoPaths.push(path)
  }

  const decisionToken = randomBytes(24).toString('hex')

  const { data: row, error } = await supabase.from('concept_reviews').insert({
    id: submissionId,
    name, email, phone,
    has_booking: hasBooking,
    booking_date: hasBooking ? bookingDate : null,
    set_names: setNames,
    concept, materials,
    location_plan: locationPlan,
    headcount,
    prep_plan: prepPlan,
    cleanup_plan: cleanupPlan,
    cleanup_minutes: cleanupMinutes,
    photo_paths: photoPaths,
    acknowledged_at: new Date().toISOString(),
    decision_token: decisionToken,
  }).select('id').single()

  // supabase-js never throws on a Postgres error — check it or this silently
  // reports success while nothing was saved.
  if (error) {
    console.error('[concept-review] insert failed:', error)
    await supabase.storage.from('concept-media').remove(photoPaths).catch(() => {})
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 })
  }

  await sendOwnerPush({
    title: 'Concept review submitted',
    body: `${name} — ${concept.slice(0, 90)}${concept.length > 90 ? '…' : ''}`,
    url: '/admin/inbox?tab=concepts',
    tag: `concept-${row!.id}`,
    requireInteraction: true,
    meta: { kind: 'concept_review', id: row!.id },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}

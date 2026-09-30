// POST /api/portal/[token]/pose — a guest contributes a pose from their session.
// FormData: file, category, credit, rights ('1'), people ('1').
// ⚠️ Lands as 'pending'. It is NOT shown anywhere until the owner approves it in
// /admin/poses — the consent boxes are the guest's word, review is the check.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { loadPortalByToken, isLive } from '@/lib/portal'
import { POSE_BUCKET } from '@/lib/poses'
import { POSE_CATEGORY_KEYS, poseCategoryLabel } from '@/lib/pose-categories'
import { sendOwnerPush } from '@/lib/push'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const p = await loadPortalByToken(params.token)
  if (!p) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  if (!isLive(p.booking)) return NextResponse.json({ error: 'This session has ended.' }, { status: 410 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const category = String(form?.get('category') || '')
  const credit = String(form?.get('credit') || '').trim().slice(0, 60)
  if (form?.get('rights') !== '1' || form?.get('people') !== '1') {
    return NextResponse.json({ error: 'Please tick both boxes to share a pose.' }, { status: 400 })
  }
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No photo received.' }, { status: 400 })
  if (!POSE_CATEGORY_KEYS.has(category)) return NextResponse.json({ error: 'Pick a category.' }, { status: 400 })
  if (!/^image\/(jpeg|png|webp)$/.test((file as File).type)) return NextResponse.json({ error: 'Photos only.' }, { status: 400 })
  if ((file as File).size > 4 * 1024 * 1024) return NextResponse.json({ error: 'That photo is too large.' }, { status: 400 })

  const db = supabaseAdmin()
  // Cap submissions per session so a stuck finger can't flood the queue.
  const { count } = await db.from('poses').select('id', { count: 'exact', head: true }).eq('booking_id', p.portal.booking_id)
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'That’s plenty for one session — thank you!' }, { status: 400 })

  const { data: b } = await db.from('bookings').select('auth_user_id').eq('id', p.portal.booking_id).maybeSingle()
  const path = `guest/${randomUUID()}.jpg`
  const { error: upErr } = await db.storage.from(POSE_BUCKET).upload(path, Buffer.from(await (file as File).arrayBuffer()), { contentType: (file as File).type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const now = new Date().toISOString()
  const { data, error } = await db.from('poses').insert({
    category, source: 'guest', status: 'pending', storage_path: path,
    set_slug: p.portal.set_slug, booking_id: p.portal.booking_id,
    contributor_user_id: (b as any)?.auth_user_id ?? null,
    credit_name: credit || null, consent_rights: true, consent_people: true, consented_at: now,
  }).select('id')
  if (error || !data?.length) {
    await db.storage.from(POSE_BUCKET).remove([path])
    return NextResponse.json({ error: error?.message || 'Could not save.' }, { status: 500 })
  }
  sendOwnerPush({
    title: '📸 New pose to review',
    body: `${credit || 'A guest'} · ${poseCategoryLabel(category)} · ${p.setName}`,
    url: '/admin/poses',
    tag: 'pose-review',
  }).catch(() => {})
  return NextResponse.json({ ok: true })
}

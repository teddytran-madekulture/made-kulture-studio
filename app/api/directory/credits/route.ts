import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { cleanIg, creditsForImages, escHtml, MAX_CREDITS_PER_PHOTO } from '@/lib/photo-credits'
import { sendSimpleEmail } from '@/lib/email'

// Photo credits on portfolio images (migration 133).
//   GET    ?imageId=   → credits on one of MY photos (+ invite links for pending ones)
//   GET    ?q=         → directory members to tag (name / Instagram search)
//   POST   { imageId, role, memberId } | { imageId, role, name, instagram }
//   DELETE ?id=        → photo owner deletes a credit, OR the tagged member removes themselves
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
const inviteUrl = (t: string) => `${APP_URL}/join/credit/${t}`

async function me() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function ownImage(userId: string, imageId: string) {
  const { data } = await service.from('portfolio_images').select('id, user_id, url').eq('id', imageId).maybeSingle()
  return data && data.user_id === userId ? data : null
}

export async function GET(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const sp = req.nextUrl.searchParams

  const q = (sp.get('q') || '').trim().replace(/[%,()*]/g, '').slice(0, 40)
  if (q) {
    const ig = cleanIg(q)
    let query = service.from('customer_profiles')
      .select('id, full_name, avatar_url, roles, instagram')
      .eq('directory_opt_in', true).neq('id', user.id).limit(8)
    query = ig ? query.or(`full_name.ilike.%${q}%,instagram.ilike.%${ig}%`) : query.ilike('full_name', `%${q}%`)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      members: (data ?? []).filter(m => m.full_name).map(m => ({
        id: m.id, name: m.full_name, avatar_url: m.avatar_url ?? null,
        roles: m.roles ?? [], instagram: cleanIg(m.instagram),
      })),
    })
  }

  const imageId = sp.get('imageId') || ''
  if (!imageId || !(await ownImage(user.id, imageId))) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
  const credits = (await creditsForImages(service, [imageId])).get(imageId) ?? []
  const { data: tokens } = await service.from('portfolio_credits').select('id, invite_token').eq('image_id', imageId)
  const tok = new Map((tokens ?? []).map(t => [t.id, t.invite_token]))
  return NextResponse.json({
    credits: credits.map(c => ({ ...c, inviteUrl: c.pending && tok.get(c.id) ? inviteUrl(tok.get(c.id)!) : null })),
  })
}

export async function POST(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const imageId = String(body.imageId || '')
  const role = String(body.role || '').trim().slice(0, 40)
  const img = imageId ? await ownImage(user.id, imageId) : null
  if (!img) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
  if (!role) return NextResponse.json({ error: 'Pick their role on the shoot.' }, { status: 400 })

  const { count } = await service.from('portfolio_credits')
    .select('id', { count: 'exact', head: true }).eq('image_id', imageId).is('removed_at', null)
  if ((count ?? 0) >= MAX_CREDITS_PER_PHOTO) {
    return NextResponse.json({ error: `A photo can have up to ${MAX_CREDITS_PER_PHOTO} credits.` }, { status: 400 })
  }

  const { data: myProf } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
  const myName = myProf?.full_name || 'A member'

  // ── Tag a directory member ────────────────────────────────────────────────
  const memberId = typeof body.memberId === 'string' ? body.memberId : ''
  if (memberId) {
    if (memberId === user.id) return NextResponse.json({ error: 'Your own photos already show as yours.' }, { status: 400 })
    const { data: target } = await service.from('customer_profiles')
      .select('id, full_name, directory_opt_in').eq('id', memberId).maybeSingle()
    if (!target?.directory_opt_in) return NextResponse.json({ error: 'That member isn’t in the directory.' }, { status: 404 })

    // Re-tagging someone who removed themselves would undo their choice.
    const { data: prior } = await service.from('portfolio_credits')
      .select('id, removed_at').eq('image_id', imageId).eq('member_id', memberId).maybeSingle()
    if (prior?.removed_at) return NextResponse.json({ error: `${target.full_name || 'They'} removed themselves from this photo.` }, { status: 409 })
    if (prior) return NextResponse.json({ error: 'They’re already credited on this photo.' }, { status: 409 })

    const { data: row, error } = await service.from('portfolio_credits')
      .insert({ image_id: imageId, owner_id: user.id, member_id: memberId, role })
      .select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Tell them — non-fatal. They can remove the tag from their profile.
    try {
      const { data: au } = await service.auth.admin.getUserById(memberId)
      const to = au?.user?.email
      if (to) {
        await sendSimpleEmail({
          to,
          subject: `${myName} credited you on a photo`,
          heading: 'You were credited on a photo',
          paragraphs: [
            `<strong style="color:#fff;">${escHtml(myName)}</strong> credited you as <strong style="color:#fff;">${escHtml(role)}</strong> on a photo in their Made Kulture portfolio. It now shows on the Tagged tab of your directory profile.`,
            `Not you, or don’t want it there? Open the photo on your profile and tap “Remove me”.`,
          ],
          ctaText: 'See it on your profile', ctaUrl: `${APP_URL}/account/directory/${memberId}?tab=tagged`,
          label: 'photo_credit',
        })
        await service.from('portfolio_credits').update({ notified_at: new Date().toISOString() }).eq('id', row.id)
      }
    } catch (e) { console.error('[photo-credits] notify failed (non-fatal):', e) }

    return NextResponse.json({ ok: true, id: row.id })
  }

  // ── Credit someone not on the directory ───────────────────────────────────
  const name = String(body.name || '').trim().slice(0, 60)
  const instagram = cleanIg(body.instagram)
  if (!name && !instagram) return NextResponse.json({ error: 'Add their name or Instagram.' }, { status: 400 })
  const token = randomBytes(12).toString('base64url')
  const { data: row, error } = await service.from('portfolio_credits')
    .insert({ image_id: imageId, owner_id: user.id, name: name || null, instagram, role, invite_token: token })
    .select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: row.id, inviteUrl: inviteUrl(token) })
}

export async function DELETE(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  const { data: c } = await service.from('portfolio_credits')
    .select('id, owner_id, member_id, instagram, removed_at').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Credit not found.' }, { status: 404 })

  // The photo's owner: delete outright.
  if (c.owner_id === user.id) {
    const { error } = await service.from('portfolio_credits').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }

  // The tagged member: mark removed (kept, so the owner can't silently re-add it).
  let mine = c.member_id === user.id
  if (!mine && !c.member_id && c.instagram) {
    const { data: p } = await service.from('customer_profiles').select('instagram').eq('id', user.id).maybeSingle()
    mine = cleanIg(p?.instagram) === c.instagram
  }
  if (!mine) return NextResponse.json({ error: 'Not your credit.' }, { status: 403 })
  const { error } = await service.from('portfolio_credits')
    .update({ removed_at: new Date().toISOString(), member_id: user.id }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, removed: true })
}

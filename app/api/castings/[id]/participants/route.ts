import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendCastingConfirmedEmail } from '@/lib/email'
import { sendCastingConfirmedSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// When a participant is newly confirmed, let them know: email/SMS per their prefs
// plus a DM from the author. Best-effort — must be awaited so Vercel doesn't
// freeze the sends after the response returns.
async function notifyConfirmed(castingId: string, userId: string, authorId: string, title: string, role: string | null) {
  const { data: prof } = await service
    .from('customer_profiles').select('notify_email, notify_sms, phone').eq('id', userId).maybeSingle()

  if (prof?.notify_email !== false) {
    const { data: authUser } = await service.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (email) await sendCastingConfirmedEmail({ to: email, castingTitle: title, castingId, role })
  }
  if (prof?.notify_sms === true && prof?.phone) {
    await sendCastingConfirmedSMS(prof.phone, title, role, castingId)
  }

  // Drop a DM from the author into their thread (create it if needed).
  const [a, b] = [authorId, userId].sort()
  let convId: string | null = null
  const { data: existing } = await service.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
  if (existing) convId = existing.id
  else {
    const { data: created } = await service.from('conversations').insert({ user_a: a, user_b: b }).select('id').single()
    convId = created?.id ?? null
  }
  if (convId) {
    const asRole = role ? ` as ${role}` : ''
    await service.from('messages').insert({
      conversation_id: convId, sender_id: authorId,
      body: `You're confirmed${asRole} for "${title}" — looking forward to working with you!`,
    })
  }
}

// PATCH /api/castings/<id>/participants { userId, action, role } — author confirms
// (optionally assigning a role), unconfirms, or removes a collaborator.
// action: confirm | unconfirm | remove.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: c } = await service.from('castings').select('author_id, title').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (c.author_id !== user.id) return NextResponse.json({ error: 'Only the author can manage collaborators.' }, { status: 403 })

  const { userId, action, role } = await req.json().catch(() => ({}))
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  if (action === 'remove') {
    const { error } = await service.from('casting_participants').delete()
      .eq('casting_id', params.id).eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'confirm' || action === 'unconfirm') {
    const isConfirm = action === 'confirm'
    const cleanRole = isConfirm && typeof role === 'string' && role.trim() ? role.trim().slice(0, 80) : null

    const { data: existing } = await service.from('casting_participants')
      .select('status').eq('casting_id', params.id).eq('user_id', userId).maybeSingle()
    const wasConfirmed = existing?.status === 'confirmed'

    const { error } = await service.from('casting_participants')
      .update({ status: isConfirm ? 'confirmed' : 'interested', role: cleanRole })
      .eq('casting_id', params.id).eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify only on a fresh confirmation, so re-assigning a role doesn't re-spam.
    if (isConfirm && !wasConfirmed) {
      await notifyConfirmed(params.id, userId, c.author_id, c.title, cleanRole).catch(() => {})
    }
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

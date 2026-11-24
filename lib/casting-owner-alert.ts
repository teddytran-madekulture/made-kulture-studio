// 2026-11-23 — tell the owner when a casting goes LIVE (posted straight to open,
// or a draft published). Castings have no approval step, so before this the only
// way Teddy saw a new one was by opening Admin -> Community. Saving a draft does
// not call this. Never throws: a failed alert must not fail the member's post.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'

export async function notifyOwnerNewCasting(service: SupabaseClient, castingId: string): Promise<void> {
  try {
    const { data: c, error } = await service.from('castings')
      .select('title, author_id, compensation_type, roles_needed').eq('id', castingId).maybeSingle()
    if (error || !c) { console.error('[casting-alert] lookup failed', castingId, error?.message); return }
    const { data: p } = await service.from('customer_profiles').select('full_name').eq('id', c.author_id).maybeSingle()
    const roles = Array.isArray(c.roles_needed) ? c.roles_needed.slice(0, 3).join(', ') : ''
    const parts = [p?.full_name || 'A member', c.compensation_type, roles].filter(Boolean)
    await sendOwnerPush({
      title: `New casting: ${String(c.title).slice(0, 80)}`,
      body: parts.join(' - '),
      url: `/account/castings/${castingId}`,
      tag: `casting-new-${castingId}`,
    })
  } catch (e) {
    console.error('[casting-alert] failed', castingId, e)
  }
}

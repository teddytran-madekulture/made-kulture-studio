// 2026-11-23 — CASTING ALERTS. A casting used to alert NOBODY when posted; it
// only sat on the board. Now, when one goes live (new post or a published
// draft), listed directory members whose roles overlap roles_needed get an app
// notification. PUSH ONLY by Teddy's call: no email, no text.
//
// Runs once per casting because its two callers each fire once: the POST that
// creates an open casting, and the PATCH that CLAIMS a draft (draft -> open).
// Renewing or reopening never alerts. Never throws: a failed alert must not
// fail the member's post. Skips anyone who turned notify_castings off
// (migration 191) and anyone in a block with the author, either direction.
import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAll } from '@/lib/select-all'
import { profileBlockers } from '@/lib/directory-listing'
import { sendMemberPush } from '@/lib/member-push'
import { blockedIds } from '@/lib/blocks'

export async function sendCastingAlerts(service: SupabaseClient, castingId: string): Promise<{ recipients: number; pushed: number; error?: string }> {
  const out = { recipients: 0, pushed: 0 } as { recipients: number; pushed: number; error?: string }
  try {
    const { data: c, error: cErr } = await service.from('castings')
      .select('id, title, author_id, status, compensation_type, roles_needed, mature').eq('id', castingId).maybeSingle()
    if (cErr) return { ...out, error: cErr.message }
    if (!c || c.status !== 'open') return out
    const wanted = new Set((Array.isArray(c.roles_needed) ? c.roles_needed : []).map((r: string) => String(r).toLowerCase()))
    if (!wanted.size) return out

    const { data: profs, error: pErr } = await selectAll(() => service.from('customer_profiles')
      .select('id, full_name, roles, bio, instagram, links, account_type, directory_opt_in, vendor_terms_accepted_at, notify_castings')
      .eq('directory_opt_in', true).order('id'))
    if (pErr) return { ...out, error: pErr.message }

    // Blocks, both directions. blockedIds THROWS on a failed lookup, which stops
    // the alert rather than notifying someone who blocked the author.
    const blocked = await blockedIds(service, c.author_id)

    const matches = (profs ?? []).filter((p: any) =>
      p.id !== c.author_id && p.notify_castings !== false && !blocked.has(p.id) &&
      (p.roles ?? []).some((r: string) => wanted.has(String(r).toLowerCase())))
    if (!matches.length) return out

    const { data: pics, error: picErr } = await selectAll(() => service.from('portfolio_images').select('user_id').order('id'))
    if (picErr) return { ...out, error: picErr.message }
    const withPhoto = new Set((pics ?? []).map((r: any) => r.user_id))
    const listed = matches.filter((p: any) => profileBlockers(p, withPhoto.has(p.id)).length === 0)
    out.recipients = listed.length

    const author = (profs ?? []).find((p: any) => p.id === c.author_id) as any
    // An 18+ casting keeps its title off the lock screen.
    const title = c.mature ? 'New casting for your role' : `New casting: ${String(c.title).slice(0, 80)}`
    const roles = (c.roles_needed as string[]).slice(0, 3).join(', ')
    const body = [author?.full_name, c.compensation_type, c.mature ? '18+' : roles].filter(Boolean).join(' - ').slice(0, 160)
    for (let i = 0; i < listed.length; i += 10) {
      const chunk = listed.slice(i, i + 10)
      const n = await Promise.all(chunk.map((p: any) =>
        sendMemberPush(p.id, { title, body, url: `/account/castings/${c.id}`, tag: `casting-${c.id}` }).catch(() => 0)))
      out.pushed += n.filter(x => x > 0).length
    }
    return out
  } catch (e: any) {
    console.error('[castings] alerts failed:', castingId, e)
    return { ...out, error: e?.message || 'alerts failed' }
  }
}

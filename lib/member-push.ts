// Web push to MEMBERS (customers / directory members) — the installable
// Made Kulture app (2026-10-03). Owner alerts stay in lib/push.ts.
// Non-fatal by design: email remains the guaranteed channel, push is the
// faster one on top. Dead endpoints (404/410) are pruned.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export function memberPushConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY
}

/** Push to every device a member enabled. Returns how many were ACCEPTED by
 *  the push service — accepted, not delivered (see the notification-history
 *  lesson: a 201 is not a seen notification). Never throws. */
export async function sendMemberPush(userId: string, opts: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
  if (!memberPushConfigured()) return 0
  try {
    const { data: subs, error } = await supabase.from('member_push_subscriptions').select('id, endpoint, keys').eq('user_id', userId)
    if (error) { console.error('[member-push] lookup failed:', error.message); return 0 }
    if (!subs?.length) return 0
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails('mailto:teddytran@madekulture.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
    const payload = JSON.stringify({ title: opts.title, body: opts.body, url: opts.url ?? '/account/messages', tag: opts.tag })
    let accepted = 0
    await Promise.allSettled(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload)
        accepted++
        await supabase.from('member_push_subscriptions').update({ last_sent_at: new Date().toISOString() }).eq('id', s.id)
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('member_push_subscriptions').delete().eq('id', s.id)
          console.warn('[member-push] pruned dead subscription for', userId)
        } else {
          console.error('[member-push] send error:', err?.statusCode ?? err)
        }
      }
    }))
    return accepted
  } catch (e) {
    console.error('[member-push] error:', e)
    return 0
  }
}

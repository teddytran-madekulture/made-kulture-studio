// Web Push to Teddy's devices (admin PWA). Fan-out to every saved subscription;
// dead endpoints (410/404) are pruned automatically. Non-fatal by design — all
// callers fire-and-forget.
//
// Env (Vercel):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY   (also used by the browser to subscribe)
//   VAPID_PRIVATE_KEY
// Dormant unless both are set.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export function pushConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY
}

export async function sendOwnerPush(opts: {
  title: string
  body: string
  url?: string     // deep link, defaults to June's inbox
  tag?: string     // same tag replaces older notification
}): Promise<void> {
  if (!pushConfigured()) return
  try {
    // Dynamic import keeps web-push out of edge/client bundles.
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails(
      'mailto:teddytran@madekulture.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const { data: subs } = await supabase
      .from('push_subscriptions').select('id, endpoint, keys')
    if (!subs?.length) return

    // App-icon badge = everything currently waiting on Teddy.
    let badge = 0
    try {
      const [convos, drafts, tours] = await Promise.all([
        supabase.from('agent_conversations').select('id', { count: 'exact', head: true }).eq('status', 'needs_teddy').eq('human_takeover', false),
        supabase.from('agent_messages').select('id', { count: 'exact', head: true }).eq('role', 'draft'),
        supabase.from('tour_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      badge = (convos.count ?? 0) + (drafts.count ?? 0) + (tours.count ?? 0)
    } catch {}

    const payload = JSON.stringify({
      title: opts.title,
      body: opts.body,
      url: opts.url ?? '/admin/inbox',
      tag: opts.tag,
      badge,
    })

    await Promise.allSettled(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload)
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        } else {
          console.error('[push] send error (non-fatal):', err?.statusCode ?? err)
        }
      }
    }))
  } catch (e) {
    console.error('[push] error (non-fatal):', e)
  }
}

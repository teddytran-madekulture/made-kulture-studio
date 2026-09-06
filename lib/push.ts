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

// Per-device outcome. `sendOwnerPush` throws this away (every caller is
// fire-and-forget); /api/admin/push/test is the one caller that needs it, so it
// can say WHICH device accepted and which was pruned. Endpoints are truncated
// deliberately -- a push endpoint is a bearer credential, and this is rendered
// in a browser.
export type PushSendResult = {
  configured: boolean
  subscriptions: number
  accepted: number
  results: {
    host: string
    tail: string
    userAgent: string | null
    ok: boolean
    statusCode?: number
    pruned?: boolean
    error?: string
  }[]
}

// Write the notification to history. Called at EVERY exit of
// sendOwnerPushDetailed -- including "push is dormant" and "zero subscriptions",
// which are precisely the cases where the notification would otherwise vanish
// without trace. See migration 105.
//
// Non-fatal on purpose: history is a safety net, and a safety net that can break
// the thing it protects is worse than none. A failed insert is logged, never
// thrown -- the push itself has already gone out by this point.
async function record(
  opts: { title: string; body: string; url?: string; tag?: string; meta?: Record<string, unknown> },
  out: PushSendResult,
): Promise<PushSendResult> {
  try {
    const { error } = await supabase.from('notifications').insert({
      title: opts.title,
      body:  opts.body,
      url:   opts.url ?? null,
      tag:   opts.tag ?? null,
      meta:  opts.meta ?? null,
      subscriptions: out.subscriptions,
      accepted:      out.accepted,
      send_results:  out.results,
    })
    // supabase-js NEVER throws on a Postgres error. Unread, this silently
    // becomes "history is empty" and nobody finds out for a month.
    if (error) console.error('[push] history insert failed:', error)
  } catch (e) {
    console.error('[push] history insert threw:', e)
  }
  return out
}

export async function sendOwnerPush(opts: Parameters<typeof sendOwnerPushDetailed>[0]): Promise<void> {
  await sendOwnerPushDetailed(opts)
}

export async function sendOwnerPushDetailed(opts: {
  title: string
  body: string
  url?: string     // deep link, defaults to June's inbox
  tag?: string     // same tag replaces older notification
  renotify?: boolean          // re-alert even when replacing a same-tag notification
  requireInteraction?: boolean // keep on screen until acted on (desktop/Android)
  meta?: Record<string, unknown> // structured payload for sw.js to forward to open tabs
}): Promise<PushSendResult> {
  const out: PushSendResult = { configured: pushConfigured(), subscriptions: 0, accepted: 0, results: [] }
  if (!out.configured) return record(opts, out)
  try {
    // Dynamic import keeps web-push out of edge/client bundles.
    const webpush = (await import('web-push')).default
    webpush.setVapidDetails(
      'mailto:teddytran@madekulture.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const { data: subs } = await supabase
      .from('push_subscriptions').select('id, endpoint, keys, user_agent')
    out.subscriptions = subs?.length ?? 0
    if (!subs?.length) return record(opts, out)

    // App-icon badge = everything currently waiting on Teddy.
    let badge = 0
    try {
      const [convos, drafts, tours, jukebox] = await Promise.all([
        supabase.from('agent_conversations').select('id', { count: 'exact', head: true }).eq('status', 'needs_teddy').eq('human_takeover', false),
        supabase.from('agent_messages').select('id', { count: 'exact', head: true }).eq('role', 'draft'),
        supabase.from('tour_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('jukebox_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ])
      badge = (convos.count ?? 0) + (drafts.count ?? 0) + (tours.count ?? 0) + (jukebox.count ?? 0)
    } catch {}

    const payload = JSON.stringify({
      title: opts.title,
      body: opts.body,
      url: opts.url ?? '/admin/inbox',
      tag: opts.tag,
      renotify: opts.renotify ?? false,
      requireInteraction: opts.requireInteraction ?? false,
      meta: opts.meta ?? null,
      badge,
    })

    await Promise.allSettled(subs.map(async (s: any) => {
      let host = 'unparseable'
      try { host = new URL(s.endpoint).host } catch {}
      const tail = String(s.endpoint ?? '').slice(-8)
      const userAgent = s.user_agent ?? null
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload)
        out.accepted++
        out.results.push({ host, tail, userAgent, ok: true })
      } catch (err: any) {
        // 410/404 = the browser threw the subscription away. Pruning is correct,
        // but it must be VISIBLE -- a silently pruned row is how "push is dead"
        // became a two-week mystery.
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
          console.warn('[push] pruned dead subscription:', host, tail)
          out.results.push({ host, tail, userAgent, ok: false, statusCode: err.statusCode, pruned: true })
        } else {
          console.error('[push] send error (non-fatal):', err?.statusCode ?? err)
          out.results.push({
            host, tail, userAgent, ok: false,
            statusCode: err?.statusCode,
            error: String(err?.message ?? err).slice(0, 200),
          })
        }
      }
    }))
  } catch (e) {
    console.error('[push] error (non-fatal):', e)
    out.results.push({ host: '-', tail: '-', userAgent: null, ok: false, error: String(e).slice(0, 200) })
  }
  return record(opts, out)
}

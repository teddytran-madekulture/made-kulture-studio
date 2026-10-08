// Web push to MEMBERS (customers / directory members) — the installable
// Made Kulture app (2026-10-03). Owner alerts stay in lib/push.ts.
// Non-fatal by design: email remains the guaranteed channel, push is the
// faster one on top. Dead endpoints (404/410) are pruned.
import { createClient } from '@supabase/supabase-js'
import { sendApns } from '@/lib/apns'
import { sendFcm } from '@/lib/fcm'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export function memberPushConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY
}

type PushMsg = { title: string; body: string; url?: string; tag?: string }

/** Push to every device a member enabled — the App Store app (native tokens)
 *  AND the website/home-screen app (web push). Returns how many were ACCEPTED
 *  by Apple / the push services — accepted, not delivered (see the
 *  notification-history lesson: a 201 is not a seen notification). Never throws. */
export async function sendMemberPush(userId: string, opts: PushMsg): Promise<number> {
  const [native, web] = await Promise.all([sendNativePush(userId, opts), sendWebPush(userId, opts)])
  return native + web
}

// 2026-10-07 — the store apps. iPhone tokens go straight to Apple (APNs);
// Android tokens go through Google's Firebase Cloud Messaging (lib/fcm.ts).
async function sendNativePush(userId: string, opts: PushMsg): Promise<number> {
  try {
    const { data: rows, error } = await supabase.from('native_push_tokens').select('id, token, platform').eq('user_id', userId)
    if (error) { console.error('[member-push] native lookup failed:', error.message); return 0 }
    if (!rows?.length) return 0
    const ios = rows.filter((r: any) => r.platform === 'ios').map((r: any) => r.token)
    const android = rows.filter((r: any) => r.platform === 'android').map((r: any) => r.token)
    const [a, g] = await Promise.all([
      ios.length ? sendApns(ios, opts) : Promise.resolve([]),
      android.length ? sendFcm(android, opts) : Promise.resolve([]),
    ])
    const results = [...a, ...g]
    const ok = results.filter(r => r.ok).map(r => r.token)
    const dead = results.filter(r => r.dead).map(r => r.token)
    if (ok.length) await supabase.from('native_push_tokens').update({ last_sent_at: new Date().toISOString() }).in('token', ok)
    if (dead.length) {
      await supabase.from('native_push_tokens').delete().in('token', dead)
      console.warn('[member-push] pruned', dead.length, 'dead app token(s) for', userId)
    }
    return ok.length
  } catch (e) {
    console.error('[member-push] native error:', e)
    return 0
  }
}

async function sendWebPush(userId: string, opts: PushMsg): Promise<number> {
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

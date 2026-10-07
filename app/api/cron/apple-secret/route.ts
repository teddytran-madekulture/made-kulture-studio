// Daily check: is the Sign in with Apple secret about to expire?
// Pushes the owner at 30/14/7/3/1 days left and every day once expired.
// See lib/apple-secret.ts. Added 2026-10-07.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAppleSecretStatus, shouldNotify } from '@/lib/apple-secret'
import { sendOwnerPush } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let s
  try {
    s = await getAppleSecretStatus(db)
  } catch (e: any) {
    // A failed lookup is itself worth a ping -- silence here would look like "fine".
    await sendOwnerPush({ title: 'Apple sign-in check failed', body: 'Could not read the Apple secret date. Check the admin.', url: '/admin/dashboard', tag: 'apple-secret' })
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 })
  }
  if (shouldNotify(s.daysLeft)) {
    const body = s.daysLeft > 0
      ? `Sign in with Apple stops working in ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} (${s.expiresOn}). Generate a new secret - 2 minutes.`
      : `Sign in with Apple has EXPIRED (${s.expiresOn}). Customers can't use Continue with Apple until you renew it.`
    await sendOwnerPush({ title: 'Renew Apple sign-in', body, url: '/admin/dashboard', tag: 'apple-secret', renotify: true, requireInteraction: s.daysLeft <= 1 })
  }
  return NextResponse.json({ ok: true, ...s, notified: shouldNotify(s.daysLeft) })
}

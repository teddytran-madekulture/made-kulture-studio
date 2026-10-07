// Sign in with Apple -- the OAuth secret EXPIRES. Added 2026-10-07.
//
// Supabase's Apple provider needs a "client secret" (a JWT signed with the
// .p8 key "Made Kulture Sign in with Apple", Key ID UYB6SVW3GW). Apple caps it
// at 6 months. When it lapses, "Continue with Apple" fails on the website AND
// in the app (the app uses the same web OAuth flow in its sign-in sheet).
//
// We don't auto-renew (that would mean storing the .p8 plus a Supabase access
// token in Vercel). Instead the site remembers when the secret was made and
// nags: owner push at 30/14/7/3/1 days and daily once it's expired, plus a red
// banner across the admin until someone clicks "I renewed it".
//
// To renew: supabase.com/docs/guides/auth/social-login/auth-apple -> secret
// generator (Account ID 3WWCP2ML95, Service ID com.madekulture.signin,
// Key ID UYB6SVW3GW, the .p8 from Bitwarden) -> paste into Supabase ->
// Auth -> Sign In / Providers -> Apple -> Secret Key -> Save. Then press
// "I renewed it" on the admin banner.

import type { SupabaseClient } from '@supabase/supabase-js'

export const APPLE_SECRET_KEY = 'apple_signin_secret_generated_on' // studio_settings key, value YYYY-MM-DD (Central)
export const APPLE_SECRET_FIRST = '2026-10-07' // generated the day Sign in with Apple went live
// Apple's hard ceiling is ~182 days; warn against 180 so the last day is never a surprise.
export const APPLE_SECRET_LIFETIME_DAYS = 180
export const APPLE_SECRET_WARN_DAYS = 30

export type AppleSecretStatus = {
  generatedOn: string
  expiresOn: string
  daysLeft: number      // negative once expired
  warn: boolean         // inside the 30-day window (or expired)
}

export function centralToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

export function statusFrom(generatedOn: string, today = centralToday()): AppleSecretStatus {
  const expiresOn = addDays(generatedOn, APPLE_SECRET_LIFETIME_DAYS)
  const daysLeft = daysBetween(today, expiresOn)
  return { generatedOn, expiresOn, daysLeft, warn: daysLeft <= APPLE_SECRET_WARN_DAYS }
}

/** Reads the stored date. A read ERROR throws -- a failed lookup must never look like "fine". */
export async function getAppleSecretStatus(db: SupabaseClient): Promise<AppleSecretStatus> {
  const { data, error } = await db.from('studio_settings').select('value').eq('key', APPLE_SECRET_KEY).maybeSingle()
  if (error) throw new Error(`apple secret lookup failed: ${error.message}`)
  const v = typeof data?.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.value) ? data.value : APPLE_SECRET_FIRST
  return statusFrom(v)
}

export async function markAppleSecretRenewed(db: SupabaseClient, on = centralToday()): Promise<void> {
  const { data: ex, error: rErr } = await db.from('studio_settings').select('key').eq('key', APPLE_SECRET_KEY).maybeSingle()
  if (rErr) throw new Error(rErr.message)
  const { data, error } = ex
    ? await db.from('studio_settings').update({ value: on }).eq('key', APPLE_SECRET_KEY).select('key')
    : await db.from('studio_settings').insert({ key: APPLE_SECRET_KEY, value: on }).select('key')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('renewal date was not saved')
}

/** Days on which the daily cron pushes. Expired => every day. */
export function shouldNotify(daysLeft: number): boolean {
  return daysLeft <= 0 || [30, 14, 7, 3, 1].includes(daysLeft)
}

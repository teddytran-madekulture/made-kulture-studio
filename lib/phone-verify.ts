// Phone-number change verification (2026-10-07).
//
// A member changing an existing phone number must prove they hold the new one:
// a 6-digit code is texted to it and has to come back with the save. Door-code
// texts, reminders and check-in links follow the profile phone at checkout, so
// an unverified number is how someone else would end up with them.
//
// Codes are stored hashed (sha256 of user:phone:code), expire in 10 minutes,
// allow 5 wrong tries, and only the newest code for a user counts.
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { rateLimit } from '@/lib/rate-limit'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TTL_MS = 10 * 60_000
const MAX_TRIES = 5

/** US 10-digit form, or null. Accepts (832) 555-0100, 18325550100, +1 832… */
export function phone10(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.length === 10 ? d : null
}

const hash = (userId: string, phone: string, code: string) =>
  crypto.createHash('sha256').update(`${userId}:${phone}:${code}`).digest('hex')

export async function sendPhoneCode(userId: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const rl = await rateLimit(`phonecode:${userId}`, 5, 60 * 60_000, {
    message: 'Too many codes requested. Please wait a bit and try again.',
  })
  if (!rl.allowed) return { ok: false, error: rl.message }

  const code = String(crypto.randomInt(100000, 1000000))
  await db.from('phone_verifications').delete().eq('user_id', userId)
  const { error } = await db.from('phone_verifications').insert({
    user_id: userId, phone, code_hash: hash(userId, phone, code),
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  })
  if (error) { console.error('[phone-verify] insert failed:', error.message); return { ok: false, error: 'Could not send a code. Please try again.' } }

  // Plain ASCII — one emoji or curly quote doubles the SMS cost (lib/sms.ts).
  const sms = await sendSMSResult(`+1${phone}`, `Made Kulture: your verification code is ${code}. It expires in 10 minutes. If you didn't ask for this, you can ignore this text.`)
  if (!sms.ok) {
    await db.from('phone_verifications').delete().eq('user_id', userId)
    return { ok: false, error: 'We couldn’t text that number. Check it and try again.' }
  }
  return { ok: true }
}

export async function checkPhoneCode(userId: string, phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const { data: row, error } = await db.from('phone_verifications')
    .select('id, phone, code_hash, attempts, expires_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return { ok: false, error: 'Could not check the code. Please try again.' }
  if (!row || row.phone !== phone || Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, error: 'That code has expired. Tap SEND A NEW CODE.' }
  }
  if (row.attempts >= MAX_TRIES) return { ok: false, error: 'Too many wrong tries. Tap SEND A NEW CODE.' }

  const given = Buffer.from(hash(userId, phone, String(code).replace(/\D/g, '')))
  const want = Buffer.from(row.code_hash)
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    await db.from('phone_verifications').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    return { ok: false, error: 'That code isn’t right. Check the text and try again.' }
  }
  await db.from('phone_verifications').delete().eq('user_id', userId)
  return { ok: true }
}

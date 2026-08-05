import twilio from 'twilio'

// Lazily create the Twilio client so a missing credential doesn't crash import.
let _client: ReturnType<typeof twilio> | null = null
function client() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  return _client
}

export const OWNER_PHONE = '+18324081631'

export type SmsResult = { ok: boolean; error?: string }

// Send an SMS and REPORT what happened. Use this where the outcome is shown to
// a human — several admin screens surface an `smsError` next to the charge they
// just made, and that feedback is worth keeping. Everything else should use
// sendSMS below, which is the same call with the result discarded.
//
// This is the ONE place that talks to Twilio. Before 2026-08-05 there were 19
// others scattered across 14 files, each with its own copy of a phone
// normaliser; the copies had already drifted from toE164 and that drift is what
// let a bad number through. One door in, one normaliser, one place to fix.
export async function sendSMSResult(to: string, body: string): Promise<SmsResult> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    console.error('[sms] NOT sent — Twilio env not configured')
    return { ok: false, error: 'Texting is not configured.' }
  }
  // Normalise here, not at every call site. Phones are stored as bare 10-digit
  // strings ("8322476374"); Twilio needs E.164 ("+18322476374") and rejects
  // anything else. Because this function deliberately swallows errors, a caller
  // that forgot to normalise got total silence — no text, no complaint. That
  // cost the cancellation SMS its first outing. Numbers already in E.164 pass
  // through toE164 unchanged, so this is safe for every existing caller.
  const num = toE164(to)
  if (!num) {
    console.error('[sms] NOT sent — unusable phone number:', JSON.stringify(to))
    return { ok: false, error: 'That phone number is not usable.' }
  }
  try {
    await client().messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to: num })
    return { ok: true }
  } catch (e: any) {
    console.error('[sms] send failed:', e)
    return { ok: false, error: e?.message || 'SMS failed to send' }
  }
}

// Fire-and-forget. Never throws and never reports — a failed text must not
// break the booking/charge/cancel that triggered it. Failures are logged above.
export async function sendSMS(to: string, body: string): Promise<void> {
  await sendSMSResult(to, body)
}

export async function sendOwnerSMS(body: string): Promise<void> {
  return sendSMS(OWNER_PHONE, body)
}

// ─── Community notification texts (opt-in) ────────────────────────────────────
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

// Profile phones are stored as raw digits; Twilio needs E.164 (+1XXXXXXXXXX).
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = String(raw).replace(/[^\d]/g, '')
  if (String(raw).trim().startsWith('+') && d.length >= 11) return '+' + d
  if (d.length === 10) return '+1' + d
  if (d.length === 11 && d.startsWith('1')) return '+' + d
  return null
}

export async function sendMessageSMS(to: string, fromName: string, conversationId: string): Promise<void> {
  const num = toE164(to)
  if (!num) return
  return sendSMS(num, `${fromName} messaged you on Made Kulture: ${APP_URL}/account/messages/${conversationId} (reply STOP to opt out)`)
}

export async function sendCastingInterestSMS(to: string, interestedName: string, castingTitle: string, castingId: string): Promise<void> {
  const num = toE164(to)
  if (!num) return
  const title = castingTitle.length > 40 ? castingTitle.slice(0, 40) + '…' : castingTitle
  return sendSMS(num, `${interestedName} is interested in your casting "${title}": ${APP_URL}/account/castings/${castingId} (reply STOP to opt out)`)
}

export async function sendCastingConfirmedSMS(to: string, castingTitle: string, role: string | null, castingId: string): Promise<void> {
  const num = toE164(to)
  if (!num) return
  const title = castingTitle.length > 40 ? castingTitle.slice(0, 40) + '…' : castingTitle
  const asRole = role ? ` as ${role}` : ''
  return sendSMS(num, `You're confirmed${asRole} for "${title}" on Made Kulture: ${APP_URL}/account/castings/${castingId} (reply STOP to opt out)`)
}

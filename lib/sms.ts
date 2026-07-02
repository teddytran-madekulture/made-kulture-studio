import twilio from 'twilio'

// Lazily create the Twilio client so a missing credential doesn't crash import.
let _client: ReturnType<typeof twilio> | null = null
function client() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  return _client
}

export const OWNER_PHONE = '+18324081631'

// Send an SMS. Non-fatal: logs and swallows errors (e.g. while the toll-free
// number is still in Twilio review) so callers never break on a failed text.
export async function sendSMS(to: string, body: string): Promise<void> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    console.error('[sms] NOT sent — Twilio env not configured')
    return
  }
  try {
    await client().messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to })
  } catch (e) {
    console.error('[sms] send failed:', e)
  }
}

export async function sendOwnerSMS(body: string): Promise<void> {
  return sendSMS(OWNER_PHONE, body)
}

// ─── Community notification texts (opt-in) ────────────────────────────────────
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export async function sendMessageSMS(to: string, fromName: string, conversationId: string): Promise<void> {
  return sendSMS(to, `${fromName} messaged you on Made Kulture: ${APP_URL}/account/messages/${conversationId} (reply STOP to opt out)`)
}

export async function sendCastingInterestSMS(to: string, interestedName: string, castingTitle: string, castingId: string): Promise<void> {
  const title = castingTitle.length > 40 ? castingTitle.slice(0, 40) + '…' : castingTitle
  return sendSMS(to, `${interestedName} is interested in your casting "${title}": ${APP_URL}/account/castings/${castingId} (reply STOP to opt out)`)
}

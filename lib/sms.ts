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
// --- GSM-7 sanitiser ---------------------------------------------------------
// Twilio bills per SEGMENT. A segment is 153 characters -- UNLESS the body
// holds ONE character outside the GSM-7 alphabet, at which point the entire
// message switches to UCS-2 and a segment becomes 67. So a single emoji costs
// 2.3x on the WHOLE text, not on the emoji. It is all-or-nothing per message:
// keeping "just the checkmark" saves nothing.
//
// 2026-08-21: every outbound text opened with an emoji. August averaged 6.48
// segments per message on ~6 messages a day -- normal volume, doubled bill.
// The 15-minute wrap-up was billed as TEN texts at $0.083; the same words in
// GSM-7 are four. Measured across 50 real messages: 47-57% fewer segments.
//
// This runs INSIDE sendSMSResult, not at the call sites, because there are ~35
// of them and a rule a template has to remember is a rule that drifts.
const GSM_MAP: Record<string, string> = {
  '—': '-', '–': '-', '−': '-', '‐': '-', '‑': '-',
  '’': "'", '‘': "'", '‚': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '…': '...', '•': '-', '·': '-', '‣': '-', '▪': '-',
  '→': '->', '←': '<-', '⇒': '=>', '×': 'x', '÷': '/',
  '°': ' deg', '½': '1/2', '¼': '1/4', '¾': '3/4',
  '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ', '\u200b': '', '\ufe0f': '',
}
const GSM_CHARS = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ' +
  ' !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§' +
  '¿abcdefghijklmnopqrstuvwxyzäöñüà' +
  '\f^{}\\[~]|€'
)

// Exported for tests only. Call sites must never need to reach for it.
export function gsmSafe(input: string): string {
  let s = input
  for (const [from, to] of Object.entries(GSM_MAP)) s = s.split(from).join(to)

  const lines = s.split('\n').map((line) => {
    const out: string[] = []
    for (const ch of line) {
      if (GSM_CHARS.has(ch)) { out.push(ch); continue }
      // "Zoe" with a diaeresis loses the accent, not the letter -- a customer
      // should never get a mangled version of their own name. The accented
      // letters GSM-7 does carry are in GSM_CHARS and never reach this branch.
      const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (folded && [...folded].every((c) => GSM_CHARS.has(c))) out.push(folded)
      // anything still here (emoji, CJK, box drawing) is dropped
    }
    // Dropping a leading emoji leaves behind the space that followed it.
    return { had: line.trim().length > 0, text: out.join('').replace(/[ \t]+/g, ' ').trim() }
  })

  // A line that HAD content and lost all of it was an emoji-only line: drop it
  // rather than leave a blank. A line that was already blank is a paragraph
  // break and survives -- after stripping, the two are indistinguishable, so
  // the decision has to be made here while we still know which was which.
  return lines
    .filter((l) => !(l.had && l.text === ''))
    .map((l) => l.text)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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
    // gsmSafe, not body: see the note above. This is the only send in the app.
    await client().messages.create({ body: gsmSafe(body), from: process.env.TWILIO_PHONE_NUMBER, to: num })
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

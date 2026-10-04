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

// ── Daily text limit ─────────────────────────────────────────────────────────
// ⚠️ Fails OPEN: if the counter can't be read, the text goes out. A door code
// that never arrives is worse than an uncounted text. The one alert when the
// limit is crossed goes by PUSH, since texting is exactly what just stopped.
const DEFAULT_DAILY_LIMIT = 150
async function underDailyCap(): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return true
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(url, key, { auth: { persistSession: false } })
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
    const [{ data: n, error }, { data: setting }] = await Promise.all([
      db.rpc('sms_bump', { p_day: day }),
      db.from('studio_settings').select('value').eq('key', 'sms_daily_limit').maybeSingle(),
    ])
    if (error || typeof n !== 'number') { if (error) console.error('[sms] daily counter failed — sending anyway', error); return true }
    const limit = Number(setting?.value) > 0 ? Number(setting!.value) : DEFAULT_DAILY_LIMIT
    if (n <= limit) return true
    console.error(`[sms] DAILY LIMIT ${limit} reached (${n}) — text NOT sent`)
    if (n === limit + 1) {
      const { sendOwnerPush } = await import('@/lib/push')
      await sendOwnerPush({
        title: 'Texting paused for today',
        body: `${limit} texts already sent today (normal is ~10–20), so the app stopped sending to protect the Twilio bill. Something may be looping — check the logs. Resumes at midnight, or raise sms_daily_limit.`,
        url: '/admin/notifications',
      }).catch(() => {})
    }
    return false
  } catch (e) {
    console.error('[sms] daily cap check error — sending anyway', e)
    return true
  }
}

// Every text to a CUSTOMER is also written to sms_messages (migration 115) so the
// /admin/texts thread shows what they're replying to. Owner alerts are skipped.
// ⚠️ Logging never blocks or fails a send: the text has already gone out.
async function logOutbound(to: string, body: string, sid: string | null, sentBy: 'system' | 'admin'): Promise<void> {
  if (to === OWNER_PHONE) return
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await db.from('sms_messages').insert({ phone: to, direction: 'out', body, sent_by: sentBy, twilio_sid: sid })
    if (error) console.error('[sms] outbound log failed (text WAS sent)', error)
  } catch (e) { console.error('[sms] outbound log error (text WAS sent)', e) }
}

export async function sendSMSResult(to: string, body: string, opts?: { sentBy?: 'admin' }): Promise<SmsResult> {
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
  // Daily ceiling (migration 114). Counted BEFORE sending, so a runaway loop
  // stops at the limit instead of at the bill.
  if (!(await underDailyCap())) {
    return { ok: false, error: 'Daily text limit reached — sending is paused until tomorrow.' }
  }
  try {
    // gsmSafe, not body: see the note above. This is the only send in the app.
    const text = gsmSafe(body)
    const m = await client().messages.create({ body: text, from: process.env.TWILIO_PHONE_NUMBER, to: num })
    await logOutbound(num, text, m?.sid ?? null, opts?.sentBy ?? 'system')
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

// A Production Services REQUEST (2026-10-03). Sent EVERY time (unlike the 3h-
// throttled message text) to vendors who opted in — a request is a lead.
// Plain ASCII only: one curly quote or dash re-encodes the whole text to UCS-2.
export async function sendListingRequestSMS(to: string, fromName: string, listingTitle: string, dateLabel: string, conversationId: string): Promise<void> {
  const num = toE164(to)
  if (!num) return
  const title = listingTitle.length > 40 ? listingTitle.slice(0, 40) + '...' : listingTitle
  return sendSMS(num, `Made Kulture: new request for ${title} on ${dateLabel} from ${fromName}. Reply here: ${APP_URL}/account/messages/${conversationId} (reply STOP to opt out)`)
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

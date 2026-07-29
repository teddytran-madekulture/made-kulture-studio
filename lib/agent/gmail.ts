// Gmail client for June's email channel — service-account JWT with domain-wide
// delegation, impersonating june@madekulture.com. Reuses the same key pair as
// lib/gcal.ts (GCAL_SERVICE_ACCOUNT_EMAIL / GCAL_PRIVATE_KEY); the delegation
// grant in Google Admin adds the Gmail scopes (see June_Email_Setup.md).
//
// Env:
//   GCAL_SERVICE_ACCOUNT_EMAIL / GCAL_PRIVATE_KEY   (already set for calendar)
//   JUNE_EMAIL_ADDRESS   e.g. june@madekulture.com  (mailbox to impersonate + send from)
// Dormant (helpers return null / no-op) unless all three are present.

import { createSign, randomUUID } from 'crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = 'https://www.googleapis.com/auth/gmail.modify'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const PROCESSED_LABEL = 'June-Processed'

function creds() {
  const email = process.env.GCAL_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GCAL_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const mailbox = process.env.JUNE_EMAIL_ADDRESS
  if (!email || !key || !mailbox) return null
  return { email, key, mailbox }
}

export function juneEmailConfigured(): boolean {
  return creds() !== null
}

export function juneEmailAddress(): string | null {
  return process.env.JUNE_EMAIL_ADDRESS ?? null
}

// ── Delegated token (sub = june@) ──────────────────────────────────────────────
let cachedToken: { value: string; expiresAt: number } | null = null

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

async function getToken(): Promise<string> {
  const c = creds()
  if (!c) throw new Error('June email not configured')
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: c.email, sub: c.mailbox, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const assertion = `${header}.${claims}.${signer.sign(c.key).toString('base64url')}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  if (!res.ok) throw new Error(`gmail auth failed: ${res.status} ${await res.text()}`)
  const json: any = await res.json()
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 }
  return cachedToken.value
}

async function gmail(path: string, init?: RequestInit): Promise<any> {
  const token = await getToken()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`gmail ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

// ── Processed label ────────────────────────────────────────────────────────────
let labelId: string | null = null

async function getProcessedLabelId(): Promise<string> {
  if (labelId) return labelId
  const { labels } = await gmail('/labels')
  const found = (labels ?? []).find((l: any) => l.name === PROCESSED_LABEL)
  if (found) { labelId = found.id; return found.id }
  const created = await gmail('/labels', {
    method: 'POST',
    body: JSON.stringify({ name: PROCESSED_LABEL, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
  })
  labelId = created.id
  return created.id
}

// ── Inbound ────────────────────────────────────────────────────────────────────

// Below this, an inline image is almost certainly a signature logo or a tracking
// pixel rather than something the sender meant us to see. Phone photos and
// screenshots are comfortably above it.
const INLINE_IMAGE_MIN_BYTES = 20 * 1024

export interface InboundAttachment {
  gmailAttachmentId: string
  filename: string
  mimeType: string
  sizeBytes: number
  inline: boolean       // embedded in the body rather than attached as a file
}

export interface InboundEmail {
  gmailMsgId: string
  threadId: string
  fromEmail: string
  fromName: string
  subject: string
  text: string
  attachments: InboundAttachment[]
}

function header(payload: any, name: string): string {
  return payload?.headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodePart(data?: string): string {
  if (!data) return ''
  return Buffer.from(data, 'base64url').toString('utf8')
}

// Walk MIME parts, prefer text/plain, fall back to stripped text/html.
function extractText(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodePart(payload.body.data)
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodePart(payload.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  }
  for (const part of payload.parts ?? []) {
    const t = extractText(part)
    if (t) return t
  }
  return ''
}

// Walk MIME parts for real attachments.
//
// We keep only the POINTER — Gmail stores the bytes in the june@ mailbox and
// serves them on demand, so there's nothing to copy. Inline parts (signature
// logos, tracking pixels, embedded images referenced by a cid: URL in the HTML
// body) carry a Content-ID and a Content-Disposition of "inline"; those are
// noise, not something a customer meant to send, so they're skipped.
function extractAttachments(payload: any, out: InboundAttachment[] = []): InboundAttachment[] {
  if (!payload) return out

  const filename: string = payload.filename ?? ''
  const attachmentId: string | undefined = payload.body?.attachmentId

  if (filename && attachmentId) {
    const disposition = header(payload, 'Content-Disposition').toLowerCase()
    const contentId = header(payload, 'Content-ID')
    const isInline = disposition.includes('inline') && !!contentId
    const size = Number(payload.body?.size) || 0

    // An inline part is EITHER noise (signature logo, tracking pixel) OR a photo
    // the sender dropped into the message body — Gmail marks both the same way.
    // Size is what separates them: logos and pixels are a few KB, a real photo or
    // screenshot is hundreds. We bias towards keeping it, because a missed photo
    // means June replies "can you describe it?" to someone who already showed us
    // (which is exactly what happened on the first live test), whereas a stray
    // logo chip is just mild clutter.
    const keep = !isInline || size >= INLINE_IMAGE_MIN_BYTES

    if (keep) {
      out.push({
        gmailAttachmentId: attachmentId,
        filename: filename.slice(0, 300),
        mimeType: payload.mimeType || 'application/octet-stream',
        sizeBytes: size,
        inline: isInline,
      })
    }
  }

  for (const part of payload.parts ?? []) extractAttachments(part, out)
  return out
}

// Bytes for one inbound attachment, straight from Gmail. Nothing is cached on
// our side — if the source message is deleted from the mailbox this 404s, which
// is the correct behaviour for a pointer into someone else's store.
export async function fetchAttachment(gmailMsgId: string, gmailAttachmentId: string): Promise<Buffer | null> {
  const c = creds()
  if (!c) return null
  try {
    const res = await gmail(`/messages/${gmailMsgId}/attachments/${gmailAttachmentId}`)
    if (!res?.data) return null
    return Buffer.from(res.data, 'base64url')
  } catch (e: any) {
    console.error('[gmail] attachment fetch failed', gmailMsgId, e?.message)
    return null
  }
}

// Crude quoted-history trim so June sees the new content, not the whole chain.
function trimQuoted(text: string): string {
  const lines = text.split('\n')
  const cut = lines.findIndex(l =>
    /^On .{5,80} wrote:\s*$/.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim())
  )
  const kept = (cut > 0 ? lines.slice(0, cut) : lines).filter(l => !l.trim().startsWith('>'))
  return kept.join('\n').trim().slice(0, 4000)
}

// New (unprocessed, non-June) messages in the inbox.
export async function fetchNewEmails(max = 10): Promise<InboundEmail[]> {
  const c = creds()
  if (!c) return []
  const q = encodeURIComponent(`in:inbox -label:${PROCESSED_LABEL} -from:me`)
  const list = await gmail(`/messages?q=${q}&maxResults=${max}`)
  const out: InboundEmail[] = []
  for (const m of list.messages ?? []) {
    const full = await gmail(`/messages/${m.id}?format=full`)
    const from = header(full.payload, 'From')
    const match = from.match(/^(.*?)\s*<(.+?)>\s*$/)
    const fromEmail = (match ? match[2] : from).trim().toLowerCase()
    const fromName = (match ? match[1].replace(/^"|"$/g, '') : '').trim()
    // Skip automated senders.
    if (/no-?reply|mailer-daemon|postmaster|notifications?@|noreply/i.test(fromEmail)) {
      await markProcessed(m.id)
      continue
    }
    // Skip bulk / promotional / newsletter mail so June never drafts a reply to an
    // ad or a newsletter (and it stays out of the admin inbox). A List-Unsubscribe
    // header is the reliable "this is bulk mail" signal — real 1:1 inquiries don't
    // carry it — backed up by Precedence: bulk and Gmail's Promotions category.
    const listUnsub  = header(full.payload, 'List-Unsubscribe')
    const precedence = header(full.payload, 'Precedence').toLowerCase()
    const gmailLabels: string[] = full.labelIds ?? []
    if (listUnsub || /bulk|list/.test(precedence) || gmailLabels.includes('CATEGORY_PROMOTIONS')) {
      await markProcessed(m.id)
      continue
    }
    out.push({
      gmailMsgId: m.id,
      threadId: full.threadId,
      fromEmail,
      fromName: fromName || fromEmail.split('@')[0],
      subject: header(full.payload, 'Subject') || '(no subject)',
      text: trimQuoted(extractText(full.payload)) || '(empty message)',
      attachments: extractAttachments(full.payload),
    })
  }
  return out
}

export async function markProcessed(gmailMsgId: string): Promise<void> {
  const id = await getProcessedLabelId()
  await gmail(`/messages/${gmailMsgId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: [id], removeLabelIds: ['UNREAD'] }),
  })
}

// ── Outbound (threaded reply) ──────────────────────────────────────────────────

export interface OutboundAttachment {
  filename: string
  mimeType: string
  content: Buffer
}

// Gmail's own ceiling is 25MB per message, and base64 inflates by ~4/3, so the
// encoded payload has to stay under it. We cap the raw total a bit below that.
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

// RFC 2047 encoded-word, so a filename or subject with non-ASCII characters
// doesn't corrupt the header. ASCII-only strings are left alone.
function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(value)) return value
  return `=?utf-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

// Strip CR/LF from anything interpolated into a header — otherwise a filename or
// subject containing a newline could inject arbitrary headers into the message.
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function splitBase64(b64: string): string {
  return b64.replace(/(.{76})/g, '$1\r\n')
}

export async function sendReply(opts: {
  threadId?: string
  to: string
  subject: string
  body: string
  cc?: string[]
  bcc?: string[]
  attachments?: OutboundAttachment[]
  inReplyToMsgId?: string    // Gmail message id we're replying to (for headers)
}): Promise<string | null> {
  const c = creds()
  if (!c) return null

  // Fetch RFC822 Message-ID of the original for proper threading headers.
  let refHeader = ''
  if (opts.inReplyToMsgId) {
    try {
      const orig = await gmail(`/messages/${opts.inReplyToMsgId}?format=metadata&metadataHeaders=Message-ID`)
      const mid = header(orig.payload, 'Message-ID')
      if (mid) refHeader = `In-Reply-To: ${mid}\r\nReferences: ${mid}\r\n`
    } catch {}
  }

  const rawSubject = headerSafe(opts.subject)
  const subject = rawSubject.startsWith('Re:') ? rawSubject : `Re: ${rawSubject}`
  const cc = (opts.cc ?? []).map(headerSafe).filter(Boolean)
  const bcc = (opts.bcc ?? []).map(headerSafe).filter(Boolean)
  const files = opts.attachments ?? []

  const total = files.reduce((n, f) => n + f.content.length, 0)
  if (total > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachments total ${(total / 1048576).toFixed(1)}MB — over the ${MAX_ATTACHMENT_BYTES / 1048576}MB limit`)
  }

  const headers = [
    `From: June at Made Kulture <${c.mailbox}>`,
    `To: ${headerSafe(opts.to)}`,
    cc.length ? `Cc: ${cc.join(', ')}` : '',
    bcc.length ? `Bcc: ${bcc.join(', ')}` : '',
    `Subject: ${encodeHeaderWord(subject)}`,
    refHeader.trimEnd(),
  ].filter(Boolean)

  let raw: string
  if (!files.length) {
    raw = [...headers, 'Content-Type: text/plain; charset=utf-8', '', opts.body].join('\r\n')
  } else {
    // multipart/mixed: the text body as the first part, then one part per file.
    // The boundary must not appear anywhere in the content; a random-free
    // constant plus the thread id would risk a collision, so use a UUID.
    const boundary = `mk_${randomUUID().replace(/-/g, '')}`
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      opts.body,
    ]
    for (const f of files) {
      const name = encodeHeaderWord(headerSafe(f.filename) || 'attachment')
      parts.push(
        `--${boundary}`,
        `Content-Type: ${headerSafe(f.mimeType) || 'application/octet-stream'}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        splitBase64(f.content.toString('base64')),
      )
    }
    parts.push(`--${boundary}--`, '')
    raw = [
      ...headers,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      ...parts,
    ].join('\r\n')
  }

  const sent = await gmail('/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      raw: Buffer.from(raw, 'utf8').toString('base64url'),
      ...(opts.threadId ? { threadId: opts.threadId } : {}),
    }),
  })
  return sent.id ?? null
}

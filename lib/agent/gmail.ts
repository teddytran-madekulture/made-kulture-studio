// Gmail client for June's email channel — service-account JWT with domain-wide
// delegation, impersonating june@madekulture.com. Reuses the same key pair as
// lib/gcal.ts (GCAL_SERVICE_ACCOUNT_EMAIL / GCAL_PRIVATE_KEY); the delegation
// grant in Google Admin adds the Gmail scopes (see June_Email_Setup.md).
//
// Env:
//   GCAL_SERVICE_ACCOUNT_EMAIL / GCAL_PRIVATE_KEY   (already set for calendar)
//   JUNE_EMAIL_ADDRESS   e.g. june@madekulture.com  (mailbox to impersonate + send from)
// Dormant (helpers return null / no-op) unless all three are present.

import { createSign } from 'crypto'

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

export interface InboundEmail {
  gmailMsgId: string
  threadId: string
  fromEmail: string
  fromName: string
  subject: string
  text: string
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

export async function sendReply(opts: {
  threadId: string
  to: string
  subject: string
  body: string
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

  const subject = opts.subject.startsWith('Re:') ? opts.subject : `Re: ${opts.subject}`
  const raw = [
    `From: June at Made Kulture <${c.mailbox}>`,
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    refHeader.trimEnd(),
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.body,
  ].filter(l => l !== '').join('\r\n')

  const sent = await gmail('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url'), threadId: opts.threadId }),
  })
  return sent.id ?? null
}

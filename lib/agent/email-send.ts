// Shared outbound-email path for the admin inbox.
//
// Both send routes — approving one of June's drafts, and writing your own reply —
// need exactly the same tail end: collect the staged attachments, pull their
// bytes out of the staging bucket, hand everything to Gmail, then link the
// attachment rows to the sent message and drop the staged objects (Gmail's Sent
// copy is the record from that point on). That lives here once.

import { createClient } from '@supabase/supabase-js'
import { sendReply, type OutboundAttachment } from '@/lib/agent/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'email-media'

export const SIGNATURE =
  '\n\n— June\nMade Kulture · 4825 Gulf Freeway, Houston TX\nmadekulture.com · (832) 408-1631 (text)'

// Every reply after the first. Nobody re-sends their street address mid-
// conversation, and repeating it makes each message read like it came from
// someone who forgot the last one — same reason June greets once per thread.
export const SIGNATURE_SHORT = '\n\n— June'

// Which of the two an outgoing message should carry. First email out on a
// thread gets the full block; every reply after it gets the short one.
//
// "Already sent" means a row that actually reached Gmail (external_id set)
// from our side. The placeholder row a send inserts before it succeeds has no
// external_id yet, so a message can never count itself, and a failed send
// doesn't quietly downgrade the signature on the retry.
export async function signatureFor(conversationId: string): Promise<string> {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .in('role', ['agent', 'teddy'])
    .not('external_id', 'is', null)
    .limit(1)

  // On a read failure, fall back to the full signature. Too much contact info
  // is cosmetic; too little on a first contact is a real problem.
  if (error) {
    console.error('[signatureFor] lookup failed:', error.message)
    return SIGNATURE
  }
  return (data ?? []).length ? SIGNATURE_SHORT : SIGNATURE
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app')
  .replace(/\/$/, '')

// Mail clients render no markdown, so a link written as [our props](/props) —
// which is exactly what the chat widget wants, and what June's prompt asks for
// everywhere except here — reaches the customer as those literal characters
// pointing at nothing. June's email-mode prompt now tells her not to, but a
// prompt is an instruction, not a guarantee: she can drift back, and this also
// catches markdown typed by hand into a reply. So the send path fixes it too.
//
// [label](/props)                → "label: https://APP_URL/props"
// [label](https://x.com/y)       → "label: https://x.com/y"
// [https://x.com](https://x.com) → "https://x.com"  (no pointless doubling)
// ![alt](url)                    → "alt", since an inline image reference
//                                  cannot render in a plain-text body.
export function demarkdownLinks(body: string): string {
  return String(body ?? '')
    // Images first — the ![...] form would otherwise match the link rule below
    // and leave a stray "!" glued to the front of the label.
    .replace(/!\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g, (_m, alt: string) => alt.trim())
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label: string, href: string) => {
      const text = label.trim()
      let url = href.trim()
      // Root-relative paths are the common case and the whole reason for this.
      if (url.startsWith('/')) url = `${APP_URL}${url}`
      // An address or phone number reads better bare — "email us: june@..." not
      // "email us: mailto:june@...". A bare "madekulture.com" with no scheme at
      // all we leave exactly as written rather than guessing https onto it.
      const m = /^(mailto|tel):(.+)$/i.exec(url)
      if (m) {
        url = m[2]
        // "Text (832) 408-1631: +18324081631" is the same number twice. If the
        // label already spells it out, the label alone is the whole message.
        const digits = (s: string) => s.replace(/\D/g, '')
        if (m[1].toLowerCase() === 'tel' && digits(text) && digits(url).endsWith(digits(text))) {
          return text
        }
      }
      if (!text || text.toLowerCase() === url.toLowerCase()) return url
      return `${text}: ${url}`
    })
}

// Accepts "a@b.com, c@d.com" or an array; returns deduped, lightly validated
// addresses. Anything that isn't plausibly an address is dropped rather than
// failing the whole send — a stray comma shouldn't lose a written reply.
export function parseAddresses(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[,;]/)
  const seen = new Set<string>()
  for (const item of raw) {
    const addr = String(item ?? '').trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) seen.add(addr.toLowerCase())
  }
  return [...seen].slice(0, 20)
}

export interface StagedAttachment {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  storage_path: string | null
}

export async function getStagedAttachments(conversationId: string): Promise<StagedAttachment[]> {
  const { data } = await supabase
    .from('email_attachments')
    .select('id, filename, mime_type, size_bytes, storage_path')
    .eq('conversation_id', conversationId).eq('direction', 'out').is('message_id', null)
    .order('created_at', { ascending: true })
  return (data ?? []) as StagedAttachment[]
}

async function downloadStaged(staged: StagedAttachment[]): Promise<OutboundAttachment[]> {
  const out: OutboundAttachment[] = []
  for (const a of staged) {
    if (!a.storage_path) continue
    const { data, error } = await supabase.storage.from(BUCKET).download(a.storage_path)
    if (error || !data) {
      // A staged row whose object is missing means the browser upload never
      // finished. Failing loudly beats silently sending an email that the
      // customer is told has an attachment it doesn't have.
      throw new Error(`"${a.filename}" didn't finish uploading — remove it and try again.`)
    }
    out.push({
      filename: a.filename,
      mimeType: a.mime_type || 'application/octet-stream',
      content: Buffer.from(await data.arrayBuffer()),
    })
  }
  return out
}

export interface SendEmailResult {
  sentId: string | null
  attachmentCount: number
  // What actually went out, after demarkdownLinks(). Callers store THIS in the
  // transcript, not what they passed in — otherwise the admin inbox renders a
  // tidy markdown link while the customer received something else entirely,
  // which is how a broken link survived unnoticed until someone opened June's
  // own mailbox to check.
  sentBody: string
}

// Sends, then links + cleans up. `messageId` is the agent_messages row that
// represents this outgoing email (already inserted or updated by the caller).
export async function sendConversationEmail(opts: {
  conversationId: string
  messageId: string
  threadId: string
  to: string
  subject: string
  body: string
  cc?: string[]
  bcc?: string[]
  inReplyToMsgId?: string
}): Promise<SendEmailResult> {
  const staged = await getStagedAttachments(opts.conversationId)
  const files = await downloadStaged(staged)

  const sentBody = demarkdownLinks(opts.body)

  const sentId = await sendReply({
    threadId: opts.threadId,
    to: opts.to,
    subject: opts.subject,
    body: sentBody,
    cc: opts.cc,
    bcc: opts.bcc,
    attachments: files,
    inReplyToMsgId: opts.inReplyToMsgId,
  })

  // Only past this point is the mail actually gone. Link the rows to the message
  // and clear storage_path so the transcript still lists what was sent while the
  // download route knows the bytes now live in Gmail rather than our bucket.
  if (staged.length) {
    await supabase.from('email_attachments')
      .update({ message_id: opts.messageId, storage_path: null })
      .in('id', staged.map(a => a.id))

    const paths = staged.map(a => a.storage_path).filter((p): p is string => !!p)
    // Best-effort: a failed cleanup leaves an orphan object, which is harmless
    // and must never turn a delivered email into an error.
    if (paths.length) {
      try { await supabase.storage.from(BUCKET).remove(paths) } catch { /* ignore */ }
    }
  }

  return { sentId, attachmentCount: staged.length, sentBody }
}

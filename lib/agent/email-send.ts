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

  const sentId = await sendReply({
    threadId: opts.threadId,
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
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

  return { sentId, attachmentCount: staged.length }
}

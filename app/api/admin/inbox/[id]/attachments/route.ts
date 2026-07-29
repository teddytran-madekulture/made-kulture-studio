// Admin — stage / unstage file attachments for an outgoing email reply.
//
// POST   /api/admin/inbox/[id]/attachments  { filename, mimeType, sizeBytes }
//        → { attachmentId, uploadUrl, path }
//        Mints a short-lived signed upload URL and records the pending row. The
//        BROWSER then PUTs the file straight to Supabase storage — it never goes
//        through this server, which is the whole point: Vercel caps request
//        bodies at 4.5MB and a couple of set photos blow straight past that.
//
// DELETE /api/admin/inbox/[id]/attachments?attachmentId=…
//        → drops a staged file before it's sent (removes object + row).
//
// Staged objects are deleted by the send path once Gmail has the bytes, so this
// bucket is a staging area and not an archive.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { MAX_ATTACHMENT_BYTES } from '@/lib/agent/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'email-media'

// Keep the object key predictable and safe — the original filename is preserved
// on the row (and in the MIME headers at send time), not in the storage path.
function safeKey(conversationId: string, filename: string): string {
  const ext = (filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '').toLowerCase()
  return `${conversationId}/${randomUUID()}${ext}`
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const filename = String(body?.filename ?? '').trim().slice(0, 300)
  const mimeType = String(body?.mimeType ?? '').trim().slice(0, 150) || 'application/octet-stream'
  const sizeBytes = Number(body?.sizeBytes) || 0

  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `${filename} is ${(sizeBytes / 1048576).toFixed(1)}MB — the limit is ${MAX_ATTACHMENT_BYTES / 1048576}MB per email.` },
      { status: 400 }
    )
  }

  // Reject up front if this file would push the thread's staged total over the
  // wire limit, rather than letting the send fail after the upload finished.
  const { data: staged } = await supabase
    .from('email_attachments')
    .select('size_bytes')
    .eq('conversation_id', params.id).eq('direction', 'out').is('message_id', null)
  const already = (staged ?? []).reduce((n, a) => n + (Number(a.size_bytes) || 0), 0)
  if (already + sizeBytes > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `That would put this email over ${MAX_ATTACHMENT_BYTES / 1048576}MB. Remove something first.` },
      { status: 400 }
    )
  }

  const path = safeKey(params.id, filename)
  const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (signErr || !signed) {
    return NextResponse.json({ error: signErr?.message ?? 'Could not start the upload' }, { status: 500 })
  }

  const { data: row, error } = await supabase.from('email_attachments').insert({
    conversation_id: params.id,
    direction: 'out',
    filename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    storage_path: path,
  }).select('id').single()
  if (error) {
    // Don't leave a signed slot pointing at an object no row will ever claim.
    try { await supabase.storage.from(BUCKET).remove([path]) } catch { /* ignore */ }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ attachmentId: row.id, uploadUrl: signed.signedUrl, path })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const attachmentId = req.nextUrl.searchParams.get('attachmentId')
  if (!attachmentId) return NextResponse.json({ error: 'attachmentId required' }, { status: 400 })

  const { data: att } = await supabase
    .from('email_attachments')
    .select('id, storage_path, message_id, direction, conversation_id')
    .eq('id', attachmentId).eq('conversation_id', params.id).maybeSingle()
  if (!att) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // Once it's attached to a sent message it's part of the record — Gmail already
  // delivered it and un-sending is not a thing.
  if (att.message_id) return NextResponse.json({ error: 'Already sent — can\'t unattach it.' }, { status: 409 })

  if (att.storage_path) await supabase.storage.from(BUCKET).remove([att.storage_path])
  await supabase.from('email_attachments').delete().eq('id', att.id)
  return NextResponse.json({ success: true })
}

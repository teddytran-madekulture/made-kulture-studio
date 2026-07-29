// Admin — download one email attachment.
//
// GET /api/admin/attachments/[id]
//
// Two very different sources behind one URL:
//   inbound  → the bytes live in the june@ mailbox. We stream them from Gmail on
//              request; nothing is stored on our side. If the source message was
//              deleted from the mailbox, this 404s — correct for a pointer.
//   outbound → still staged (not yet sent): redirect to a short-lived signed URL
//              on the bucket. Already sent: the staged object was deleted once
//              Gmail took it, so we 410 and point at the Sent folder.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { fetchAttachment } from '@/lib/agent/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'email-media'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: att } = await supabase
    .from('email_attachments')
    .select('id, direction, filename, mime_type, storage_path, gmail_msg_id, gmail_attachment_id, message_id')
    .eq('id', params.id).maybeSingle()
  if (!att) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (att.direction === 'in') {
    if (!att.gmail_msg_id || !att.gmail_attachment_id) {
      return NextResponse.json({ error: 'Attachment pointer is incomplete' }, { status: 404 })
    }
    const bytes = await fetchAttachment(att.gmail_msg_id, att.gmail_attachment_id)
    if (!bytes) {
      return NextResponse.json(
        { error: 'Gmail no longer has this file — the original message may have been deleted.' },
        { status: 404 }
      )
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': att.mime_type || 'application/octet-stream',
        // encodeURIComponent keeps non-ASCII filenames intact via RFC 5987.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'private, no-store',
      },
    })
  }

  if (!att.storage_path) {
    return NextResponse.json(
      { error: 'This file was already sent — open it from the Sent folder in the june@ mailbox.' },
      { status: 410 }
    )
  }

  const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.storage_path, 120)
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Could not open that file' }, { status: 500 })
  }
  return NextResponse.redirect(signed.signedUrl)
}

// Admin — concept reviews. List pending/recent, then approve or decline.
//
// Approving attaches a REFUNDABLE CLEANING DEPOSIT. It does not charge anything:
// a submitter may not have a booking yet, so there is often no card on file, and
// silently charging a card from a review screen is exactly the class of thing
// that has bitten this app before. The deposit is recorded and stated in the
// decision; collection happens through the normal checkout / add-charge paths.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, toE164 } from '@/lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

// GET /api/admin/concept-reviews → pending first, with short-lived signed photo URLs
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('concept_reviews')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) {
    console.error('[concept-reviews] list failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Private bucket — never hand back a public URL for someone's concept photos.
  const entries = await Promise.all((data ?? []).map(async (r: any) => {
    const paths: string[] = Array.isArray(r.photo_paths) ? r.photo_paths : []
    const photos: string[] = []
    for (const p of paths) {
      const { data: signed } = await supabase.storage.from('concept-media').createSignedUrl(p, 600)
      if (signed?.signedUrl) photos.push(signed.signedUrl)
    }
    return { ...r, photos }
  }))

  return NextResponse.json({ entries })
}

// PATCH /api/admin/concept-reviews { id, decision: 'approved'|'declined', deposit?, note? }
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, decision, deposit, note } = await req.json()
  if (!id || (decision !== 'approved' && decision !== 'declined')) {
    return NextResponse.json({ error: 'id and a valid decision are required' }, { status: 400 })
  }

  const depositAmount = decision === 'approved' && deposit != null && deposit !== ''
    ? Number(deposit) : null
  if (depositAmount != null && (!Number.isFinite(depositAmount) || depositAmount < 0)) {
    return NextResponse.json({ error: 'Deposit must be a number' }, { status: 400 })
  }

  // Claim the pending row. `.eq('status','pending')` + `.select()` means a double
  // tap, or Teddy deciding on two devices, cannot send two contradictory texts.
  const { data: claimed, error } = await supabase
    .from('concept_reviews')
    .update({
      status: decision,
      deposit_amount: depositAmount,
      decision_note: typeof note === 'string' ? note.slice(0, 1000) : null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, name, phone, status, deposit_amount, decision_note')

  if (error) {
    console.error('[concept-reviews] decide failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!claimed?.length) {
    return NextResponse.json({ error: 'Already decided' }, { status: 409 })
  }

  const row = claimed[0]
  const to = toE164(row.phone)
  if (to) {
    const body = decision === 'approved'
      ? `Made Kulture: your concept review has been APPROVED.` +
        (row.deposit_amount ? ` A refundable cleaning deposit of $${Number(row.deposit_amount).toFixed(0)} applies and comes back if the studio is returned fully clean.` : '') +
        ` Cleanup has to happen inside your booked time.` +
        (row.decision_note ? ` Note: ${row.decision_note}` : '')
      : `Made Kulture: thanks for the detail, but we can't approve this concept.` +
        (row.decision_note ? ` ${row.decision_note}` : '')
    // sendSMS swallows its own errors by design; the decision is already recorded.
    await sendSMS(to, body)
  } else {
    console.error(`[concept-reviews] ${row.id} decided but phone "${row.phone}" is not valid E.164 — NOBODY WAS TOLD`)
  }

  return NextResponse.json({ success: true, notified: !!to })
}

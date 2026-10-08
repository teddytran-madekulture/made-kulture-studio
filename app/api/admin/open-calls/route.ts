// Admin — Open Calls (migration 149).
//   GET   → every call, with its entries (signed image URLs) and, per entry,
//           whether the submitter has a booking on the call's set since it opened
//   POST  → create a call (the next temp set: Christmas, etc.)
//   PATCH → { submissionId, status?, admin_note? }  review an entry
//           { callId, ...fields }                   edit a call
//
// "Shot in The Patient" can't be proven from the images. The booking check is
// a vetting aid, not a gate: the photographer is often not the person who booked.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { OPEN_CALL_BUCKET, openCallPhase } from '@/lib/open-calls'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const CALL_COLS = 'id, slug, title, tagline, set_slug, set_name, prize, cover_url, opens_at, closes_at, voting_opens_at, voting_closes_at, max_images, status, rolling, created_at'
const SUB_STATUSES = new Set(['pending', 'shortlisted', 'declined', 'winner'])
const CALL_STATUSES = new Set(['draft', 'announced', 'open', 'closed', 'voting', 'decided'])
const CALL_FIELDS = ['slug', 'title', 'tagline', 'set_slug', 'set_name', 'prize', 'cover_url', 'opens_at', 'closes_at', 'voting_opens_at', 'voting_closes_at', 'max_images', 'status', 'rolling'] as const

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = supabaseAdmin()

  const { data: calls, error } = await sb.from('open_calls').select(CALL_COLS).order('closes_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const out = []
  for (const c of calls ?? []) {
    const { data: subs, error: sErr } = await sb.from('open_call_submissions')
      .select('id, auth_user_id, email, title, photographer, photographer_ig, credits, shoot_date, note, image_paths, mature, status, admin_note, created_at')
      .eq('call_id', c.id).neq('status', 'withdrawn').order('created_at', { ascending: true })
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

    // Booking check — one query for the whole call.
    // No set (a rolling call): has the submitter booked ANY session, ever.
    let booked = new Set<string>()
    if (!c.set_slug && subs?.length) {
      const { data: bk } = await sb.from('bookings').select('auth_user_id')
        .in('auth_user_id', subs.map(s => s.auth_user_id)).neq('status', 'cancelled')
      booked = new Set((bk ?? []).map(b => b.auth_user_id as string))
    }
    if (c.set_slug && subs?.length) {
      const { data: set } = await sb.from('sets').select('id').eq('slug', c.set_slug).maybeSingle()
      if (set) {
        const { data: bk } = await sb.from('bookings').select('auth_user_id')
          .in('auth_user_id', subs.map(s => s.auth_user_id))
          .or(`set_id.eq.${set.id},set_id.is.null`)   // a buyout includes the set
          .neq('status', 'cancelled')
          .gte('start_time', c.opens_at)
        booked = new Set((bk ?? []).map(b => b.auth_user_id as string))
      }
    }

    // Votes (migration 151), split by whether the voter's account existed
    // before voting opened. A missing table (migration not run) reads as no votes.
    const tally: Record<string, { total: number; existing: number; fresh: number }> = {}
    if (subs?.length) {
      const { data: votes, error: vErr } = await sb.from('open_call_votes').select('submission_id, voter_new').eq('call_id', c.id)
      if (vErr && (vErr as any).code !== '42P01') return NextResponse.json({ error: vErr.message }, { status: 500 })
      for (const v of votes ?? []) {
        const t = (tally[v.submission_id] ??= { total: 0, existing: 0, fresh: 0 })
        t.total++; if (v.voter_new) t.fresh++; else t.existing++
      }
    }

    const entries = []
    for (const s of subs ?? []) {
      const { data: signed } = await sb.storage.from(OPEN_CALL_BUCKET).createSignedUrls(s.image_paths ?? [], 60 * 60)
      entries.push({ ...s, images: (signed ?? []).map(x => x.signedUrl).filter(Boolean), hasBooking: booked.has(s.auth_user_id), votes: tally[s.id] ?? { total: 0, existing: 0, fresh: 0 } })
    }
    out.push({ ...c, phase: openCallPhase(c), entries })
  }
  return NextResponse.json({ calls: out })
}

function pickCallFields(b: any) {
  const row: Record<string, unknown> = {}
  for (const k of CALL_FIELDS) {
    if (!(k in b)) continue
    let v = b[k]
    if (typeof v === 'string') v = v.trim()
    if (v === '') v = null
    row[k] = v
  }
  if (typeof row.slug === 'string') row.slug = (row.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  if (row.max_images != null) row.max_images = Math.max(3, Math.min(12, Number(row.max_images) || 8))
  return row
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const row = pickCallFields(b)
  row.rolling = b.rolling === true
  if (!row.slug || !row.title) return NextResponse.json({ error: 'Slug and title are required.' }, { status: 400 })
  if (!row.rolling && !row.closes_at && row.status !== 'announced' && row.status !== 'draft' && row.status != null) return NextResponse.json({ error: 'A close date is required unless the call is always open or TBA.' }, { status: 400 })
  if (row.status && !CALL_STATUSES.has(String(row.status))) return NextResponse.json({ error: 'Bad status' }, { status: 400 })
  const { data, error } = await supabaseAdmin().from('open_calls').insert({ status: 'draft', ...row }).select('id').single()
  if (error) return NextResponse.json({ error: (error as any).code === '23505' ? 'That slug is taken.' : error.message }, { status: 400 })
  return NextResponse.json({ id: data!.id })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const sb = supabaseAdmin()

  if (b.submissionId) {
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (b.status !== undefined) {
      if (!SUB_STATUSES.has(b.status)) return NextResponse.json({ error: 'Bad status' }, { status: 400 })
      upd.status = b.status
      upd.reviewed_at = new Date().toISOString()
    }
    if (b.admin_note !== undefined) upd.admin_note = String(b.admin_note || '').slice(0, 1000) || null
    // .select() back: an update that matches nothing is not an error in supabase-js.
    const { data, error } = await sb.from('open_call_submissions').update(upd).eq('id', b.submissionId).neq('status', 'withdrawn').select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'Entry not found (or withdrawn).' }, { status: 404 })
    return NextResponse.json({ success: true })
  }

  if (b.callId) {
    const row = pickCallFields(b)
    if ('rolling' in row) row.rolling = row.rolling === true
    if (row.rolling === false && 'closes_at' in row && !row.closes_at && !['announced', 'draft'].includes(String(row.status))) return NextResponse.json({ error: 'A close date is required unless the call is always open.' }, { status: 400 })
    if (row.status && !CALL_STATUSES.has(String(row.status))) return NextResponse.json({ error: 'Bad status' }, { status: 400 })
    const { data, error } = await sb.from('open_calls').update(row).eq('id', b.callId).select('id')
    if (error) return NextResponse.json({ error: (error as any).code === '23505' ? 'That slug is taken.' : error.message }, { status: 400 })
    if (!data?.length) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}

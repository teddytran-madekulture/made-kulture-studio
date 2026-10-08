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
import { OPEN_CALL_BUCKET, openCallPhase, matchingImages, cleanHandle, centralDate } from '@/lib/open-calls'
import { selectAll } from '@/lib/select-all'

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
      .select('id, auth_user_id, email, title, photographer, photographer_ig, credits, shoot_date, note, image_paths, image_hashes, mature_paths, mature, status, admin_note, created_at')
      .eq('call_id', c.id).neq('status', 'withdrawn').order('created_at', { ascending: true })
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

    // Booking check — a vetting aid, never a gate (see the header). Rolling
    // call: has the submitter booked ANY session, ever. Set call: lib below.
    let booked = new Set<string>()
    let setChecks: Record<string, BookingCheck> = {}
    if (!c.set_slug && subs?.length) {
      const { data: bk, error: bErr } = await sb.from('bookings').select('auth_user_id')
        .in('auth_user_id', subs.map(s => s.auth_user_id)).neq('status', 'cancelled')
      if (bErr) return NextResponse.json({ error: `Booking check failed: ${bErr.message}` }, { status: 500 })
      booked = new Set((bk ?? []).map(b => b.auth_user_id as string))
    }
    if (c.set_slug && subs?.length) {
      const r = await checkSetBookings(sb, c, subs)
      if ('error' in r) return NextResponse.json({ error: `Booking check failed: ${r.error}` }, { status: 500 })
      setChecks = r.checks
      booked = new Set(subs.filter(s => setChecks[s.id]?.status !== 'none').map(s => s.auth_user_id))
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
      entries.push({ ...s, images: (signed ?? []).map(x => x.signedUrl).filter(Boolean),
        matureIdx: (s.image_paths ?? []).map((p: string, i: number) => (s.mature_paths ?? []).includes(p) ? i : -1).filter((i: number) => i >= 0), hasBooking: booked.has(s.auth_user_id), bookingCheck: setChecks[s.id] ?? null,
        // Possible duplicate: shares at least one image with another entry here.
        duplicates: (subs ?? []).filter(o => o.id !== s.id && matchingImages(s.image_hashes ?? [], o.image_hashes ?? []) >= 1)
          .map(o => ({ title: o.title, photographer: o.photographer, earlier: o.created_at < s.created_at })),
        votes: tally[s.id] ?? { total: 0, existing: 0, fresh: 0 } })
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

// ── Set-call booking check (Teddy, 2026-10-08) ─────────────────────────────
// Entries must come from a session BOOKED on the call's set, but editorials are
// team work: the model may have booked while the photographer submits. So we
// look for a booking on the set (or a buyout, which includes it) inside the
// call's window under ANYONE on the entry — the submitter's account or email,
// or a credited person matched by Instagram handle (via their profile) or by
// exact name. A booking on the stated shoot date is the strong signal.
// Nothing is refused here; Teddy decides.
type BookingCheck = {
  status: 'shoot_day' | 'other_day' | 'none'
  who?: string          // "Submitter" | "Model: Jane Doe"
  via?: string          // account | email | instagram | name
  date?: string         // "Oct 22"
  bookedBy?: string     // the customer name on the booking
}

const normName = (s: string) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso))

async function checkSetBookings(sb: any, call: any, subs: any[]): Promise<{ checks: Record<string, BookingCheck> } | { error: string }> {
  const { data: set, error: setErr } = await sb.from('sets').select('id').eq('slug', call.set_slug).maybeSingle()
  if (setErr) return { error: setErr.message }
  if (!set) return { error: `No set with slug "${call.set_slug}"` }

  // Every live booking on the set (or a buyout) inside the call's window.
  const { data: bookings, error: bErr } = await selectAll(() => {
    let q = sb.from('bookings').select('auth_user_id, start_time, customers(name, email, alt_emails)')
      .or(`set_id.eq.${set.id},set_id.is.null`).neq('status', 'cancelled')
      .gte('start_time', call.opens_at)
    if (call.closes_at) q = q.lte('start_time', call.closes_at)
    return q.order('start_time', { ascending: true })
  })
  if (bErr) return { error: bErr.message }

  // Profiles: submitters' (for their name/IG) and anyone whose IG is credited.
  const handles = new Set<string>()
  for (const s of subs) {
    if (s.photographer_ig) handles.add(cleanHandle(s.photographer_ig).toLowerCase())
    for (const cr of s.credits ?? []) if (cr?.handle) handles.add(cleanHandle(cr.handle).toLowerCase())
  }
  handles.delete('')
  const { data: profiles, error: pErr } = await sb.from('customer_profiles').select('id, full_name, instagram')
    .in('id', subs.map(s => s.auth_user_id))
  if (pErr) return { error: pErr.message }
  const { data: igRows, error: igErr } = await selectAll(() => sb.from('customer_profiles').select('id, instagram').not('instagram', 'is', null))
  if (igErr) return { error: igErr.message }
  const idByHandle = new Map<string, string>()
  for (const r of igRows ?? []) {
    const h = cleanHandle(r.instagram || '').toLowerCase()
    if (h && handles.has(h)) idByHandle.set(h, r.id)
  }
  const profileById = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]))

  const checks: Record<string, BookingCheck> = {}
  for (const s of subs) {
    // People on this entry, strongest identity first.
    type Person = { who: string; ids: Set<string>; emails: Set<string>; names: Set<string> }
    const people: Person[] = []
    const prof = profileById.get(s.auth_user_id)
    people.push({ who: 'Submitter', ids: new Set([s.auth_user_id]), emails: new Set([String(s.email || '').toLowerCase()]),
      names: new Set([normName(prof?.full_name || '')].filter(Boolean)) })
    const credited = [{ role: 'Photographer', name: s.photographer, handle: s.photographer_ig || '' }, ...(s.credits ?? [])]
    for (const cr of credited) {
      const h = cleanHandle(cr.handle || '').toLowerCase()
      const id = h ? idByHandle.get(h) : undefined
      people.push({ who: `${cr.role}: ${cr.name || '@' + h}`, ids: new Set(id ? [id] : []), emails: new Set(), names: new Set([normName(cr.name || '')].filter(n => n.includes(' '))) })
    }

    const shootDay = s.shoot_date || ''
    let best: BookingCheck = { status: 'none' }
    for (const b of bookings ?? []) {
      const cust = Array.isArray(b.customers) ? b.customers[0] : b.customers
      const bEmails = [cust?.email, ...(cust?.alt_emails ?? [])].map((e: any) => String(e || '').toLowerCase()).filter(Boolean)
      const bName = normName(cust?.name || '')
      for (const p of people) {
        const via = b.auth_user_id && p.ids.has(b.auth_user_id) ? 'account'
          : bEmails.some(e => p.emails.has(e)) ? 'email'
          : bName && p.names.has(bName) ? 'name' : null
        if (!via) continue
        const onDay = dayOf(b.start_time) === shootDay
        if (onDay || best.status === 'none') {
          best = { status: onDay ? 'shoot_day' : 'other_day', who: p.who, via: via === 'account' && p.who !== 'Submitter' ? 'instagram' : via,
            date: centralDate(b.start_time, { month: 'short', day: 'numeric' }), bookedBy: cust?.name || undefined }
        }
        if (onDay) break
      }
      if (best.status === 'shoot_day') break
    }
    checks[s.id] = best
  }
  return { checks }
}

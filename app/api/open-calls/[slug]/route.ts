// Open Call (migration 149) — the public side.
//   GET     → the call + its phase, and (if signed in) my entry
//   POST    → submit my entry (images already uploaded via ./upload)
//   DELETE  → withdraw my entry while the call is still open
//
// Submitting requires an account on purpose: the account is how people book
// and how they'll vote, so the Open Call is also the sign-up.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendOwnerPush } from '@/lib/push'
import { sendSimpleEmail } from '@/lib/email'
import { rateLimit } from '@/lib/rate-limit'
import {
  OPEN_CALL_BUCKET, OPEN_CALL_MIN_IMAGES, matchingImages, cleanCredits, cleanHandle, centralDate, openCallPhase, type OpenCall,
} from '@/lib/open-calls'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const CALL_COLS = 'id, slug, title, tagline, set_slug, set_name, prize, cover_url, opens_at, closes_at, voting_opens_at, voting_closes_at, max_images, status, rolling'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://madekulture.com').replace(/\/$/, '')

async function me() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

async function getCall(slug: string): Promise<OpenCall | null> {
  const { data } = await supabaseAdmin().from('open_calls').select(CALL_COLS).eq('slug', slug).maybeSingle()
  return (data as OpenCall) ?? null
}

// Contest call: my one entry (whatever its status). Rolling call: my entry that
// is still under review — once it's decided they can send another.
async function myEntry(call: OpenCall, userId: string) {
  const sb = supabaseAdmin()
  let q = sb.from('open_call_submissions')
    .select('id, title, photographer, image_paths, status, created_at')
    .eq('call_id', call.id).eq('auth_user_id', userId)
  q = call.rolling ? q.eq('status', 'pending') : q.neq('status', 'withdrawn')
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  const { data: signed } = await sb.storage.from(OPEN_CALL_BUCKET).createSignedUrls(data.image_paths ?? [], 60 * 30)
  return {
    id: data.id, title: data.title, photographer: data.photographer, status: data.status,
    created_at: data.created_at, images: (signed ?? []).map(s => s.signedUrl).filter(Boolean),
  }
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const call = await getCall(params.slug)
  if (!call || call.status === 'draft') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const user = await me()
  return NextResponse.json({
    call, phase: openCallPhase(call),
    signedIn: !!user,
    mine: user ? await myEntry(call, user.id) : null,
  })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in to submit.' }, { status: 401 })
  const call = await getCall(params.slug)
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (openCallPhase(call) !== 'open') return NextResponse.json({ error: 'Submissions are closed for this open call.' }, { status: 409 })

  const rl = await rateLimit(`opencall:submit:${user.id}`, 10, 60 * 60_000, { failOpen: true })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const title = String(b.title ?? '').trim().slice(0, 120)
  const photographer = String(b.photographer ?? '').trim().slice(0, 80)
  const photographerIg = cleanHandle(b.photographer_ig ?? '') || null
  const note = String(b.note ?? '').trim().slice(0, 1500) || null
  const shootDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.shoot_date ?? '')) ? String(b.shoot_date) : null
  const credits = cleanCredits(b.credits)
  const mature = b.mature === true

  const missing = [!title && 'series title', !photographer && 'photographer', !shootDate && 'shoot date'].filter(Boolean)
  if (missing.length) return NextResponse.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 })

  // NEW WORK ONLY (Teddy, 2026-10-08): nothing from a previous year's run of a
  // set. An open call takes shoots dated inside its own window; the always-open
  // call takes the last 12 months. Dates compared as Central calendar days.
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(iso))
  const today = day(new Date().toISOString())
  const earliest = call.rolling || !call.closes_at
    ? day(new Date(Date.now() - 365 * 864e5).toISOString())
    : day(call.opens_at)
  const latest = call.rolling || !call.closes_at ? today : (day(call.closes_at) < today ? day(call.closes_at) : today)
  if (shootDate! < earliest || shootDate! > latest) {
    return NextResponse.json({ error: call.rolling
      ? 'Featured Editorial takes new work: the shoot date must be within the last 12 months.'
      : `This open call takes new work only: the shoot date must be between ${centralDate(call.opens_at)} and today.` }, { status: 400 })
  }

  // Every consent is load-bearing: featuring work without them is the thing
  // Teddy's "vet it first" rule exists to prevent.
  const c = b.consents ?? {}
  if (!(c.shotHere && c.rights && c.adults && c.feature)) {
    return NextResponse.json({ error: 'Please tick all four confirmations.' }, { status: 400 })
  }

  // Images were uploaded straight to storage (no 4.5 MB function ceiling). Only
  // accept paths inside MY folder for THIS call, and only ones that exist.
  const prefix = `${call.id}/${user.id}/`
  const paths: string[] = Array.from(new Set<string>((Array.isArray(b.images) ? b.images : []).map((p: any) => String(p))))
    .filter(p => p.startsWith(prefix) && /^[a-f0-9-]+\/[a-f0-9-]+\/[a-z0-9]+\.jpg$/.test(p))
    .slice(0, call.max_images)
  if (paths.length < OPEN_CALL_MIN_IMAGES) {
    return NextResponse.json({ error: `Add at least ${OPEN_CALL_MIN_IMAGES} images.` }, { status: 400 })
  }
  const sb = supabaseAdmin()
  if (await myEntry(call, user.id)) {
    return NextResponse.json({ error: call.rolling
      ? 'You already have a series under review. You can send another once we have looked at it.'
      : 'You already have an entry in this open call. Withdraw it first to send a new one.' }, { status: 409 })
  }
  const { data: listed, error: listErr } = await sb.storage.from(OPEN_CALL_BUCKET).list(`${call.id}/${user.id}`, { limit: 200 })
  if (listErr) {
    console.error('[open-call] storage list failed:', listErr)
    return NextResponse.json({ error: 'Could not check your images. Please try again.' }, { status: 500 })
  }
  const present = new Set((listed ?? []).map(o => `${prefix}${o.name}`))
  const absent = paths.filter(p => !present.has(p))
  if (absent.length) return NextResponse.json({ error: `${absent.length} image(s) didn't finish uploading. Please re-add them.` }, { status: 400 })

  // ONE SERIES = ONE ENTRY (migration 152). Hashes are aligned with `images`;
  // a hash is only trusted if it looks like one. Two or more images matching
  // another member's live entry in this call ⇒ it's the same series, refused.
  const rawHashes: unknown[] = Array.isArray(b.hashes) ? b.hashes : []
  const hashes = paths.map(p => {
    const i = (Array.isArray(b.images) ? b.images : []).indexOf(p)
    const h = String(rawHashes[i] ?? '')
    return /^[0-9a-f]{16}$/.test(h) ? h : ''
  }).filter(Boolean)
  if (hashes.length) {
    const { data: others } = await sb.from('open_call_submissions')
      .select('title, photographer, image_hashes').eq('call_id', call.id)
      .neq('auth_user_id', user.id).neq('status', 'withdrawn')
    const dup = (others ?? []).find(o => matchingImages(hashes, o.image_hashes ?? []) >= 2)
    if (dup) {
      return NextResponse.json({ error: `These images match "${dup.title}", already submitted by ${dup.photographer}. A series can only be entered once, so if you worked on it together, the team shares that entry.` }, { status: 409 })
    }
  }

  const { data: row, error } = await sb.from('open_call_submissions').insert({
    call_id: call.id, auth_user_id: user.id, email: (user.email || '').toLowerCase(),
    title, photographer, photographer_ig: photographerIg, credits, shoot_date: shootDate, note,
    image_paths: paths, image_hashes: hashes, mature, consents_at: new Date().toISOString(),
  }).select('id').single()

  if (error) {
    // 23505 = the one-live-entry-per-member index.
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'You already have an entry in this open call. Withdraw it first to send a new one.' }, { status: 409 })
    }
    console.error('[open-call] insert failed:', error)
    return NextResponse.json({ error: 'Could not save your entry. Please try again.' }, { status: 500 })
  }

  // Tidy up anything they uploaded and then removed from the form.
  const stray = Array.from(present).filter(p => !paths.includes(p))
  if (stray.length) await sb.storage.from(OPEN_CALL_BUCKET).remove(stray).catch(() => {})

  await sendOwnerPush({
    title: `Open Call: ${call.title}`,
    body: `${photographer} submitted "${title}" (${paths.length} images)`,
    url: '/admin/open-calls',
    tag: `opencall-${row!.id}`,
    meta: { kind: 'open_call_submission', id: row!.id },
  }).catch(() => {})

  if (user.email) {
    await sendSimpleEmail({
      to: user.email,
      subject: `You're in: ${call.title} Open Call`,
      heading: 'Submission received',
      paragraphs: [
        `Thanks for submitting <b>${esc(title)}</b> to the ${esc(call.title)} Open Call.`,
        call.rolling || !call.closes_at
          ? `We review every series by hand, and the best become the featured editorial on madekulture.com and the studio kiosks. We'll let you know if yours is picked.`
          : `We review every entry by hand after submissions close on ${centralDate(call.closes_at)}. ` +
            (call.voting_opens_at ? `Shortlisted series go to a vote by directory members starting ${centralDate(call.voting_opens_at)}.` : ''),
        `Make sure your directory profile is finished so you can vote, and so people who see your work can find you.`,
      ],
      ctaText: 'View your entry',
      ctaUrl: `${APP_URL}/submissions#${call.slug}`,
      label: 'Open Call',
    }).catch(e => console.error('[open-call] confirmation email failed:', e))
  }

  return NextResponse.json({ success: true, id: row!.id })
}

export async function DELETE(_req: NextRequest, { params }: { params: { slug: string } }) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const call = await getCall(params.slug)
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (openCallPhase(call) !== 'open') return NextResponse.json({ error: 'Entries can only be withdrawn while the call is open.' }, { status: 409 })

  const sb = supabaseAdmin()
  // A CLAIM: only a pending entry of mine flips, and we check a row came back
  // (supabase-js does not error on an update that matched nothing).
  const { data, error } = await sb.from('open_call_submissions')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('call_id', call.id).eq('auth_user_id', user.id).eq('status', 'pending')
    .select('id, image_paths')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'No pending entry to withdraw.' }, { status: 404 })
  const paths = data.flatMap(r => r.image_paths ?? [])
  if (paths.length) await sb.storage.from(OPEN_CALL_BUCKET).remove(paths).catch(() => {})
  return NextResponse.json({ success: true })
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

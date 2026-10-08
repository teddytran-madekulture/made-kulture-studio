// POST /api/open-calls/<slug>/upload { count } → signed upload URLs.
//
// Images go STRAIGHT to Supabase storage from the browser. Every route here
// runs in a Vercel function capped at a 4.5 MB request body, and an editorial
// is several photos — so the function hands out permission, not bytes.
// Paths are <callId>/<userId>/<random>.jpg: the submit route only accepts paths
// under the caller's own folder.

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'
import { OPEN_CALL_BUCKET, openCallPhase, type OpenCall } from '@/lib/open-calls'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to submit.' }, { status: 401 })

  const sb = supabaseAdmin()
  const { data } = await sb.from('open_calls').select('id, status, opens_at, closes_at, voting_opens_at, voting_closes_at, max_images').eq('slug', params.slug).maybeSingle()
  const call = data as (Pick<OpenCall, 'id' | 'status' | 'opens_at' | 'closes_at' | 'voting_opens_at' | 'voting_closes_at' | 'max_images'>) | null
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (openCallPhase(call) !== 'open') return NextResponse.json({ error: 'Submissions are closed.' }, { status: 409 })

  // Generous enough to re-pick photos a few times, tight enough that nobody
  // turns the bucket into free hosting.
  const rl = await rateLimit(`opencall:upload:${user.id}`, 60, 60 * 60_000, { failOpen: true })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  let count = 1
  try { count = Math.floor(Number((await req.json())?.count ?? 1)) } catch {}
  count = Math.max(1, Math.min(call.max_images, count || 1))

  const uploads: { path: string; token: string }[] = []
  for (let i = 0; i < count; i++) {
    const path = `${call.id}/${user.id}/${randomBytes(8).toString('hex')}.jpg`
    const { data: s, error } = await sb.storage.from(OPEN_CALL_BUCKET).createSignedUploadUrl(path)
    if (error || !s) {
      console.error('[open-call] signed upload url failed:', error)
      return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
    }
    uploads.push({ path, token: s.token })
  }
  return NextResponse.json({ uploads })
}

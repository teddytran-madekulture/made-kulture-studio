// /api/admin/rosters — company rosters (migration 165), admin only.
//   GET                 → every roster with its owner and status
//   GET ?id=<roster>    → that roster's talent, for the admin preview
//   POST {action:'create', email, url, label?, include_tag?} → create + first sync
//   POST {action:'sync', id}                                  → sync now
//   PATCH {id, status?, label?, include_tag?, source_url?, only_cities?}
//   DELETE {id}         → roster and its talent rows (nothing on the company site is touched)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { findAuthUserIdByEmail } from '@/lib/auth-user'
import { memberAccess } from '@/lib/directory-access'
import { cleanCityList, siteOrigin } from '@/lib/roster'
import { syncRoster, rosterTalent } from '@/lib/roster-sync'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const STATUSES = ['draft', 'live', 'hidden'] as const

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    // The preview shows what members see, so it honours the city limit too.
    const { data: r, error: rErr } = await db.from('company_rosters').select('only_cities').eq('id', id).maybeSingle()
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
    try { return NextResponse.json({ talent: await rosterTalent(db, id, r?.only_cities ?? []) }) }
    catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  }

  const { data: rosters, error } = await db.from('company_rosters')
    .select('id, owner_id, label, source_url, include_tag, only_cities, status, last_synced_at, last_sync_count, last_error, created_at')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Per owner: name, email, and whether their profile is actually LISTED —
  // a live roster on an unlisted profile is unreachable, and the page says so.
  const owners: Record<string, { name: string; email: string | null; listed: boolean; blockers: string[] }> = {}
  try {
    await Promise.all((rosters ?? []).map(async r => {
      const [{ data: prof }, { data: au }, access] = await Promise.all([
        db.from('customer_profiles').select('full_name').eq('id', r.owner_id).maybeSingle(),
        db.auth.admin.getUserById(r.owner_id),
        memberAccess(db, r.owner_id),
      ])
      const blockers: string[] = access.optedIn ? [...access.blockers] : ['not in directory', ...access.blockers]
      owners[r.owner_id] = { name: (prof?.full_name ?? '').trim(), email: au?.user?.email ?? null, listed: access.listed, blockers }
    }))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

  return NextResponse.json({
    rosters: (rosters ?? []).map(r => ({
      ...r,
      owner_name: owners[r.owner_id]?.name ?? '',
      owner_email: owners[r.owner_id]?.email ?? null,
      owner_listed: owners[r.owner_id]?.listed ?? false,
      owner_blockers: owners[r.owner_id]?.blockers ?? [],
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  if (body.action === 'sync') {
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const result = await syncRoster(db, String(body.id))
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  }

  if (body.action === 'create') {
    let origin: string
    try { origin = siteOrigin(String(body.url ?? '')) }
    catch { return NextResponse.json({ error: 'Enter the company website, e.g. neiljouagency.com' }, { status: 400 }) }

    let ownerId: string | null
    try { ownerId = await findAuthUserIdByEmail(db, body.email) }
    catch (e: any) { return NextResponse.json({ error: `Could not look up that login: ${e.message}` }, { status: 500 }) }
    if (!ownerId) return NextResponse.json({ error: 'No website account uses that email. They need to sign up first.' }, { status: 404 })

    const { data: created, error } = await db.from('company_rosters').insert({
      owner_id: ownerId,
      source_url: origin,
      label: String(body.label ?? '').trim().slice(0, 40) || 'Roster',
      include_tag: String(body.include_tag ?? '').trim().slice(0, 60),
      status: 'draft',   // ALWAYS starts hidden from members — see migration 165
    }).select('id').single()
    if (error) {
      const dup = /duplicate|unique/i.test(error.message)
      return NextResponse.json({ error: dup ? 'That account already has a roster.' : error.message }, { status: dup ? 409 : 500 })
    }
    const result = await syncRoster(db, created.id)
    return NextResponse.json({ id: created.id, ...result })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Bad status.' }, { status: 400 })
    patch.status = body.status
  }
  if (body.label !== undefined) patch.label = String(body.label).trim().slice(0, 40) || 'Roster'
  if (body.include_tag !== undefined) patch.include_tag = String(body.include_tag).trim().slice(0, 60)
  if (body.only_cities !== undefined) patch.only_cities = cleanCityList(body.only_cities)
  if (body.source_url !== undefined) {
    try { patch.source_url = siteOrigin(String(body.source_url)) }
    catch { return NextResponse.json({ error: 'That website address is not valid.' }, { status: 400 }) }
  }

  // .select() so a PATCH that matched nothing is a 404, not a silent success.
  const { data, error } = await db.from('company_rosters').update(patch).eq('id', body.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Roster not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { data, error } = await db.from('company_rosters').delete().eq('id', body.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Roster not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

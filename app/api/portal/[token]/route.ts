// /api/portal/[token] — the guest's phone side of PORTAL.
//   GET                                   → session + board
//   POST { action: 'pinterest', url }     → add a PUBLIC Pinterest board's images
//   POST { action: 'delete', id }         → remove one picture
//   POST { action: 'clear' }              → empty the board
// Possession of the token is the authorization, and it only works while the
// booking is live (lib/portal isLive).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadPortalByToken, isLive, listItems, deleteItems, countItems, pinterestBoardImages, PORTAL_MAX_ITEMS } from '@/lib/portal'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const p = await loadPortalByToken(params.token)
  if (!p) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const live = isLive(p.booking)
  return NextResponse.json({
    live,
    setName: p.setName,
    endISO: p.booking?.end_time ?? null,
    items: live ? await listItems(p.portal.id) : [],
    maxItems: PORTAL_MAX_ITEMS,
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const p = await loadPortalByToken(params.token)
  if (!p) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  if (!isLive(p.booking)) return NextResponse.json({ error: 'This session has ended.' }, { status: 410 })
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  if (action === 'pinterest') {
    const res = await pinterestBoardImages(String(body.url || ''))
    if (!res.ok) return NextResponse.json({ error: (res as any).error }, { status: 400 })
    const db = supabaseAdmin()
    const { data: have } = await db.from('portal_items').select('url').eq('portal_id', p.portal.id)
    const seen = new Set(((have ?? []) as any[]).map(r => r.url))
    const room = PORTAL_MAX_ITEMS - (have?.length ?? 0)
    const fresh = (res as any).images.filter((u: string) => !seen.has(u)).slice(0, Math.max(0, room))
    if (!fresh.length) {
      return NextResponse.json({ error: room <= 0 ? `The board is full (${PORTAL_MAX_ITEMS} pictures). Remove some first.` : 'Those pictures are already on the board.' }, { status: 400 })
    }
    const { error } = await db.from('portal_items').insert(fresh.map((url: string) => ({ portal_id: p.portal.id, kind: 'pin', url })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, added: fresh.length, items: await listItems(p.portal.id) })
  }

  if (action === 'delete') {
    const id = String(body.id || '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown picture.' }, { status: 400 })
    await deleteItems(p.portal.id, [id])
    return NextResponse.json({ ok: true, items: await listItems(p.portal.id) })
  }

  if (action === 'clear') {
    await deleteItems(p.portal.id)
    return NextResponse.json({ ok: true, items: [] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

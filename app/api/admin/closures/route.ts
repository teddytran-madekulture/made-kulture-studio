// /api/admin/closures — time off / blocked time (migration 143).
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD    → { occurrences, sets }  every closure + holiday in range, expanded
//                                           (what the dashboard calendar draws)
//   GET                                   → { closures, holidays, sets }  upcoming one-offs + holiday toggles,
//                                           each with the active bookings it overlaps (admin only, so names are fine)
//   POST  { startDate, endDate?, allDay, startHour?, endHour?, setIds?, note?, publicLabel? }
//                                         → create; returns the bookings it lands on (never touches them)
//   DELETE { id }                         → remove a one-off closure
//   PATCH  { key, enabled }               → turn a yearly holiday on/off
//   PATCH  { key, skipDate, skip }        → open (skip=true) or re-close one year of a holiday
// Writes are .select()-verified: an update that matched nothing is not success.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { centralOffset } from '@/lib/booking-times'
import { HOLIDAYS, fullDayWindow, nextDate, activeClosures } from '@/lib/closures'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ACTIVE = ['pending', 'confirmed', 'pending_payment']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const todayCentral = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())

async function bookingsIn(startISO: string, endISO: string, setIds: string[] | null) {
  let q = db.from('bookings')
    .select('id, start_time, end_time, set_id, status, sets(name), customers(name)')
    .in('status', ACTIVE).lt('start_time', endISO).gt('end_time', startISO)
    .order('start_time')
  // Set-specific closure: that set's bookings plus any buyout (which uses every set).
  if (setIds) q = q.or(`set_id.in.(${setIds.join(',')}),set_id.is.null`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((b: any) => ({
    id: b.id, start: b.start_time, end: b.end_time,
    set: b.sets?.name ?? 'Full studio', customer: b.customers?.name ?? 'Guest', status: b.status,
  }))
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const from = req.nextUrl.searchParams.get('from'), to = req.nextUrl.searchParams.get('to')
  if (from || to) {
    if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '') || to! < from!) return NextResponse.json({ error: 'from/to must be YYYY-MM-DD' }, { status: 400 })
    try {
      const [occ, { data: sets, error: sErr }] = await Promise.all([
        activeClosures(db, fullDayWindow(from!).startISO, fullDayWindow(to!).endISO),
        db.from('sets').select('id, name').eq('is_active', true).order('name'),
      ])
      if (sErr) throw new Error(sErr.message)
      const name = new Map((sets ?? []).map((x: any) => [x.id, x.name]))
      return NextResponse.json({
        occurrences: occ.map(c => ({ ...c, setNames: c.setIds ? c.setIds.map(id => name.get(id) ?? 'Unknown set') : null })),
        sets: sets ?? [],
      })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }
  const today = todayCentral()
  const fromISO = fullDayWindow(today).startISO
  const [{ data: rows, error: cErr }, { data: hols, error: hErr }, { data: sets, error: sErr }] = await Promise.all([
    db.from('studio_closures').select('*').gt('ends_at', fromISO).order('starts_at'),
    db.from('studio_holiday_closures').select('key, enabled, skip_dates'),
    db.from('sets').select('id, name').eq('is_active', true).order('name'),
  ])
  // Never render a failed read as "nothing blocked".
  if (cErr || hErr || sErr) return NextResponse.json({ error: (cErr || hErr || sErr)!.message, hint: 'Has migration 143 been run?' }, { status: 500 })

  try {
    const closures = await Promise.all((rows ?? []).map(async (r: any) => ({
      ...r, conflicts: await bookingsIn(r.starts_at, r.ends_at, r.set_ids?.length ? r.set_ids : null),
    })))
    const y = Number(today.slice(0, 4))
    const byKey = new Map((hols ?? []).map((h: any) => [h.key, h]))
    const holidays = await Promise.all(HOLIDAYS.map(async h => {
      const row: any = byKey.get(h.key) ?? { enabled: false, skip_dates: [] }
      const skips: string[] = (row.skip_dates ?? []).map(String)
      // The next two occurrences from today, so New Year's Eve shows this year and next.
      const dates = [h.dateFor(y), h.dateFor(y + 1), h.dateFor(y + 2)].filter(d => d >= today).slice(0, 2)
      const upcoming = await Promise.all(dates.map(async date => {
        const w = fullDayWindow(date)
        return { date, skipped: skips.includes(date), conflicts: row.enabled && !skips.includes(date) ? await bookingsIn(w.startISO, w.endISO, null) : [] }
      }))
      return { key: h.key, label: h.label, enabled: !!row.enabled, upcoming }
    }))
    return NextResponse.json({ closures, holidays, sets: sets ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const startDate: string = b.startDate
  const endDate: string = b.endDate || b.startDate
  if (!DATE_RE.test(startDate ?? '') || !DATE_RE.test(endDate ?? '') || endDate < startDate) {
    return NextResponse.json({ error: 'Pick a valid start and end date.' }, { status: 400 })
  }
  let startISO: string, endISO: string
  if (b.allDay !== false) {
    startISO = fullDayWindow(startDate).startISO
    endISO = fullDayWindow(endDate).endISO
  } else {
    const sh = Number(b.startHour), eh = Number(b.endHour)
    const ok = (h: number) => Number.isFinite(h) && h >= 0 && h <= 24 && (h * 2) % 1 === 0
    if (!ok(sh) || !ok(eh)) return NextResponse.json({ error: 'Times must be on the hour or half hour.' }, { status: 400 })
    const at = (date: string, h: number) => {
      if (h === 24) { const n = nextDate(date); return new Date(`${n}T00:00:00${centralOffset(n, 0)}`).toISOString() }
      const hh = String(Math.floor(h)).padStart(2, '0'), mm = h % 1 ? '30' : '00'
      return new Date(`${date}T${hh}:${mm}:00${centralOffset(date, h)}`).toISOString()
    }
    startISO = at(startDate, sh); endISO = at(endDate, eh)
    if (Date.parse(endISO) <= Date.parse(startISO)) return NextResponse.json({ error: 'The end has to be after the start.' }, { status: 400 })
  }
  const setIds: string[] | null = Array.isArray(b.setIds) && b.setIds.length
    ? b.setIds.filter((x: any) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : null
  if (Array.isArray(b.setIds) && b.setIds.length && !setIds?.length) return NextResponse.json({ error: 'Bad set list.' }, { status: 400 })

  const { data, error } = await db.from('studio_closures').insert({
    starts_at: startISO, ends_at: endISO, set_ids: setIds,
    note: (b.note ?? '').toString().slice(0, 500) || null,
    public_label: (b.publicLabel ?? '').toString().slice(0, 80) || null,
  }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not save.' }, { status: 500 })
  let conflicts: any[] = []
  try { conflicts = await bookingsIn(startISO, endISO, setIds) } catch {}
  return NextResponse.json({ ok: true, id: data.id, conflicts })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json().catch(() => ({} as any))
  if (!id) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { data, error } = await db.from('studio_closures').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Closure not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  if (!HOLIDAYS.some(h => h.key === b.key)) return NextResponse.json({ error: 'Unknown holiday.' }, { status: 400 })
  const { data: cur, error: rErr } = await db.from('studio_holiday_closures').select('enabled, skip_dates').eq('key', b.key).maybeSingle()
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  const patch: any = { key: b.key, updated_at: new Date().toISOString(), enabled: cur?.enabled ?? false, skip_dates: (cur?.skip_dates ?? []).map(String) }
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled
  else if (DATE_RE.test(b.skipDate ?? '') && typeof b.skip === 'boolean') {
    const set = new Set<string>(patch.skip_dates)
    if (b.skip) set.add(b.skipDate); else set.delete(b.skipDate)
    // Drop past skips so the list never grows forever.
    const today = todayCentral()
    patch.skip_dates = Array.from(set).filter(d => d >= today).sort()
  } else return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { data, error } = await db.from('studio_holiday_closures').upsert(patch, { onConflict: 'key' }).select('key')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not saved.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

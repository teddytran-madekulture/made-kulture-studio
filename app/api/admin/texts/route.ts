// /api/admin/texts — two-way texting on the toll-free number (migration 115).
//   GET                → threads: one per phone, newest first, unread counts
//   GET ?phone=+1...   → that thread's messages (oldest first) + who it is; marks it read
//   POST { phone, body } → text the customer from the studio number (counts toward
//                          the daily limit like every other text)
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendSMSResult, toE164 } from '@/lib/sms'
import { customersForPhone, customerNamesByPhone, nearestBookingLine, last10 } from '@/lib/sms-inbox'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const phoneParam = req.nextUrl.searchParams.get('phone')

  if (phoneParam) {
    const phone = toE164(phoneParam) || phoneParam
    const { data: msgs, error } = await db.from('sms_messages')
      .select('id, direction, body, media_count, sent_by, read_at, created_at')
      .eq('phone', phone).order('created_at', { ascending: false }).limit(300)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { error: e2 } = await db.from('sms_messages').update({ read_at: new Date().toISOString() })
      .eq('phone', phone).eq('direction', 'in').is('read_at', null)
    if (e2) console.error('[admin/texts] mark read failed', e2)
    const custs = await customersForPhone(db, phone)
    const booking = await nearestBookingLine(db, custs.map(c => c.id))
    return NextResponse.json({ phone, customers: custs, booking, messages: (msgs ?? []).reverse() })
  }

  // Thread list from the last 180 days of messages.
  const since = new Date(Date.now() - 180 * 864e5).toISOString()
  const rows: any[] = []
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await db.from('sms_messages').select('phone, direction, body, read_at, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const threads = new Map<string, any>()
  for (const r of rows) {
    let t = threads.get(r.phone)
    if (!t) { t = { phone: r.phone, last: r.body, lastDirection: r.direction, lastAt: r.created_at, unread: 0, hasInbound: false }; threads.set(r.phone, t) }
    if (r.direction === 'in') { t.hasInbound = true; if (!r.read_at) t.unread++ }
  }
  const names = await customerNamesByPhone(db)
  const list = Array.from(threads.values()).map(t => ({ ...t, name: names.get(last10(t.phone)) ?? null }))
  return NextResponse.json({ threads: list })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const phone = toE164(String(b?.phone || ''))
  const body = String(b?.body || '').trim()
  if (!phone) return NextResponse.json({ error: 'That phone number is not usable.' }, { status: 400 })
  if (!body) return NextResponse.json({ error: 'Type a message first.' }, { status: 400 })
  if (body.length > 640) return NextResponse.json({ error: 'Keep it under 640 characters (about 4 texts).' }, { status: 400 })
  const r = await sendSMSResult(phone, body, { sentBy: 'admin' })
  if (!r.ok) return NextResponse.json({ error: r.error || 'Not sent.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}

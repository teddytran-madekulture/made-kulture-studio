// Admin — what the site's AI costs (migration 193, written by lib/ai-usage.ts).
// Feeds the cost strip at the top of the June Inbox. Months and "today" are
// Houston dates, the same way Square's sales report counts them.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { selectAll } from '@/lib/select-all'
import { chiTodayStr } from '@/lib/short-notice'
import { bookingHourToISO, centralDateStr } from '@/lib/booking-times'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Service role: ai_usage has RLS on with zero policies.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CHAT_FEATURES = new Set(['june_web', 'june_kiosk', 'june_email'])

type Bucket = { cost: number; calls: number; chats: number; unpriced: number }

function summarize(rows: any[]): Bucket {
  const convos = new Set<string>()
  let cost = 0, unpriced = 0
  for (const r of rows) {
    if (r.cost_usd == null) unpriced++
    else cost += Number(r.cost_usd)
    if (CHAT_FEATURES.has(r.feature) && r.conversation_id) convos.add(r.conversation_id)
  }
  return { cost: Math.round(cost * 100) / 100, calls: rows.length, chats: convos.size, unpriced }
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = chiTodayStr()
  const thisMonth = today.slice(0, 7)
  const [y, m] = thisMonth.split('-').map(Number)
  const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  const since = bookingHourToISO(`${lastMonth}-01`, 0)

  const { data, error } = await selectAll(() =>
    supabase.from('ai_usage')
      .select('created_at, feature, conversation_id, cost_usd')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
  )
  // A failed read must never show $0.00 — that reads as "free", not "broken".
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r: any) => ({ ...r, day: centralDateStr(r.created_at) }))
  const inMonth = (mm: string) => rows.filter(r => r.day.startsWith(mm))
  const month = inMonth(thisMonth)

  const byFeature: Record<string, { cost: number; calls: number }> = {}
  for (const r of month) {
    const f = (byFeature[r.feature] ||= { cost: 0, calls: 0 })
    f.cost += Number(r.cost_usd || 0); f.calls++
  }

  const monthSum = summarize(month)
  const chatCost = month.filter(r => CHAT_FEATURES.has(r.feature)).reduce((s, r) => s + Number(r.cost_usd || 0), 0)

  return NextResponse.json({
    today: summarize(rows.filter(r => r.day === today)),
    thisMonth: monthSum,
    lastMonth: summarize(inMonth(lastMonth)),
    perChat: monthSum.chats ? Math.round((chatCost / monthSum.chats) * 1000) / 1000 : null,
    byFeature: Object.entries(byFeature)
      .map(([feature, v]) => ({ feature, cost: Math.round(v.cost * 100) / 100, calls: v.calls }))
      .sort((a, b) => b.cost - a.cost),
  })
}

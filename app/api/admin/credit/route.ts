// GET /api/admin/credit — Studio Credit page (admin only).
//   ?q=        search name / email
//   ?kind=     filter the activity feed (reward | issued | redeemed | adjustment | expired | reward_reversed)
//   ?from=&to= YYYY-MM-DD (Central) — activity window
//   ?format=csv  download the activity in that window for bookkeeping
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { loadLedger, authUsers, customersByEmail, summarise, rewardExpiry, csvEscape, KIND_LABEL } from '@/lib/credit-admin'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

// Central midnight for a YYYY-MM-DD, as ISO. CDT/CST handled by the offset probe.
function centralStartISO(ymd: string): string {
  const probe = new Date(`${ymd}T12:00:00Z`)
  const offH = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'shortOffset' })
    .formatToParts(probe).find(p => p.type === 'timeZoneName')?.value.replace('GMT', '') || '-6')
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - offH * 3600000).toISOString()
}
const fmtCentral = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim().toLowerCase()
  const kind = sp.get('kind') || ''
  const fromYmd = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('from') || '') ? sp.get('from')! : ''
  const toYmd = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('to') || '') ? sp.get('to')! : ''

  try {
    const [all, users] = await Promise.all([loadLedger(db), authUsers(db)])
    const custs = await customersByEmail(db, Array.from(new Set(all.map(r => users.emailById.get(r.auth_user_id) || ''))))
    const who = (uid: string) => {
      const email = users.emailById.get(uid) ?? null
      const c = email ? custs.get(email) : undefined
      return { email, name: c?.name ?? null, customerId: c?.id ?? null }
    }
    const matchesQ = (uid: string) => {
      if (!q) return true
      const w = who(uid)
      return (w.email ?? '').includes(q) || (w.name ?? '').toLowerCase().includes(q)
    }

    // Activity window (inclusive of the `to` day).
    const fromIso = fromYmd ? centralStartISO(fromYmd) : ''
    const toIso = toYmd ? new Date(Date.parse(centralStartISO(toYmd)) + 86400000).toISOString() : ''
    const activity = all
      .filter(r => (!kind || r.kind === kind) && (!fromIso || r.created_at >= fromIso) && (!toIso || r.created_at < toIso) && matchesQ(r.auth_user_id))
      .reverse()

    if (sp.get('format') === 'csv') {
      const head = ['Date (Central)', 'Customer', 'Email', 'Type', 'Amount', 'Reason', 'Booking', 'By']
      const lines = activity.map(r => { const w = who(r.auth_user_id); return [
        fmtCentral(r.created_at), w.name ?? '', w.email ?? '', KIND_LABEL[r.kind] ?? r.kind,
        (Number(r.amount_cents) / 100).toFixed(2), r.reason ?? '', r.booking_id ?? '', r.created_by ?? '',
      ].map(csvEscape).join(',') })
      const name = `studio-credit-${fromYmd || 'start'}-to-${toYmd || 'now'}.csv`
      return new NextResponse([head.join(','), ...lines].join('\r\n'), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
      })
    }

    const sums = summarise(all)
    const accounts: any[] = []
    sums.forEach((s, uid) => { if (matchesQ(uid)) accounts.push({ authUserId: uid, ...who(uid), ...s }) })
    accounts.sort((a, b) => b.balanceCents - a.balanceCents)

    let outstandingCents = 0, rewardOutstandingCents = 0
    sums.forEach(s => { outstandingCents += Math.max(0, s.balanceCents); rewardOutstandingCents += s.rewardCents })

    // Reward credit expiring in the next 30 days (only accounts holding rewards).
    let expiringSoonCents = 0
    const soon = Date.now() + 30 * 86400000
    for (const a of accounts.filter(a => a.rewardCents > 0)) {
      const exp = await rewardExpiry(db, a.authUserId, all.filter(r => r.auth_user_id === a.authUserId))
      a.rewardExpiresAt = exp
      if (exp && Date.parse(exp) <= soon) expiringSoonCents += a.rewardCents
    }

    return NextResponse.json({
      totals: { outstandingCents, rewardOutstandingCents, expiringSoonCents, accountsWithCredit: accounts.filter(a => a.balanceCents > 0).length },
      accounts,
      activity: activity.slice(0, 300).map(r => ({ ...r, ...who(r.auth_user_id), label: KIND_LABEL[r.kind] ?? r.kind })),
      activityTotal: activity.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Read failed, nothing shown: ${e?.message}` }, { status: 500 })
  }
}

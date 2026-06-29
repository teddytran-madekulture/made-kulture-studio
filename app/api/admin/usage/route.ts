import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/usage — current usage vs free-tier limits across services.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Start of the current month (UTC) for "this month" counts.
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  // DB + storage bytes via the RPC.
  const { data: stats } = await supabase.rpc('admin_usage_stats')
  const dbBytes      = Number(stats?.db_bytes ?? 0)
  const storageBytes = Number(stats?.storage_bytes ?? 0)

  // Counts.
  const headCount = async (table: string, build?: (q: any) => any) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true })
    if (build) q = build(q)
    const { count } = await q
    return count ?? 0
  }

  const accounts        = await headCount('customer_profiles')
  const customers       = await headCount('customers')
  const bookingsMonth   = await headCount('bookings', (q) => q.gte('created_at', monthStart))

  // Estimated outbound messages this month: each website booking fires a
  // customer + owner email and a customer + owner SMS (≈2 each).
  const estEmailsMonth = bookingsMonth * 2
  const estSmsMonth    = bookingsMonth * 2

  const MB = 1024 * 1024
  const GB = 1024 * MB

  return NextResponse.json({
    generatedAt: now.toISOString(),
    metrics: [
      { key: 'db',        label: 'Database size',          service: 'Supabase', value: dbBytes,        limit: 500 * MB, unit: 'bytes', note: 'Free tier: 500 MB. Pro ($25/mo): 8 GB.' },
      { key: 'storage',   label: 'File storage (photos)',  service: 'Supabase', value: storageBytes,   limit: 1 * GB,   unit: 'bytes', note: 'Free tier: 1 GB of uploaded files (avatars).' },
      { key: 'accounts',  label: 'Customer accounts',      service: 'Supabase', value: accounts,       limit: 50000,    unit: 'count', note: 'Free tier: 50,000 monthly active logins.' },
      { key: 'emails',    label: 'Emails this month (est.)', service: 'Resend', value: estEmailsMonth, limit: 3000,     unit: 'count', note: 'Free tier: 3,000/mo and 100/day. Estimated from bookings.' },
      { key: 'sms',       label: 'Texts this month (est.)',  service: 'Twilio', value: estSmsMonth,    limit: null,     unit: 'count', note: 'Pay-per-use (~1–1.5¢ each). No free tier — just a volume gauge.' },
      { key: 'bookings',  label: 'Bookings this month',    service: '—',        value: bookingsMonth,  limit: null,     unit: 'count', note: 'Total customers: ' + customers + '.' },
    ],
  })
}

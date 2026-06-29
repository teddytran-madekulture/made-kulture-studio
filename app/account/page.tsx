import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Link from 'next/link'

export default async function AccountDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('full_name')
    .eq('id', user!.id)
    .single()

  // Upcoming bookings count — match by auth user id OR the user's customer
  // record(s) (customers is service-role only, so use a service client).
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: custRows } = await service
    .from('customers')
    .select('id')
    .eq('email', (user!.email ?? '').toLowerCase())
  const custIds = (custRows ?? []).map(c => c.id)
  const orFilter = [`auth_user_id.eq.${user!.id}`]
  if (custIds.length) orFilter.push(`customer_id.in.(${custIds.join(',')})`)

  const { data: upcoming } = await service
    .from('bookings')
    .select('id')
    .or(orFilter.join(','))
    .gte('start_time', new Date().toISOString())
    .neq('status', 'cancelled')

  const firstName = profile?.full_name?.split(' ')[0] ?? user!.email?.split('@')[0]

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.02em', margin: '0 0 4px' }}>
        HEY {firstName?.toUpperCase()}
      </h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 40px' }}>
        {user!.email}
      </p>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 40 }}>
        <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, lineHeight: 1 }}>{upcoming?.length ?? 0}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Upcoming bookings</div>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { href: '/availability', label: 'Book a set →', desc: 'Check availability and reserve your next session' },
          { href: '/account/bookings', label: 'View all bookings →', desc: 'See upcoming and past sessions' },
          { href: '/account/profile', label: 'Edit profile →', desc: 'Update your name, phone, and Instagram' },
        ].map(({ href, label, desc }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

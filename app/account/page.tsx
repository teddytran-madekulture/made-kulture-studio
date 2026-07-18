import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { shortNoticeViewActive } from '@/lib/short-notice'
import ShortNoticeRequest from '@/components/ShortNoticeRequest'
import PlusCard from '@/components/PlusCard'
import { getCreditBalance } from '@/lib/credits'

export default async function AccountDashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('customer_profiles')
    .select('full_name, account_type, directory_opt_in')
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
    .select('id, pricing_overrides')
    .eq('email', (user!.email ?? '').toLowerCase())
  const custIds = (custRows ?? []).map(c => c.id)
  const canRequestShortNotice = shortNoticeViewActive((custRows ?? [])[0]?.pricing_overrides ?? null)
  const orFilter = [`auth_user_id.eq.${user!.id}`]
  if (custIds.length) orFilter.push(`customer_id.in.(${custIds.join(',')})`)

  const { data: upcoming } = await service
    .from('bookings')
    .select('id')
    .or(orFilter.join(','))
    .gte('start_time', new Date().toISOString())
    .neq('status', 'cancelled')

  const creditCents = await getCreditBalance(user!.id)

  const firstName = profile?.full_name?.split(' ')[0] ?? user!.email?.split('@')[0]
  const acctType = (profile as any)?.account_type ?? 'customer'
  const inDirectory = !!(profile as any)?.directory_opt_in

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.02em', margin: '0 0 4px' }}>
        HEY {firstName?.toUpperCase()}
      </h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: '0 0 24px' }}>
        {user!.email}
      </p>

      {/* Nudge people to complete their profile + join the creator directory. */}
      {!inDirectory && (
        <Link href="/account/profile" style={{ textDecoration: 'none' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(230,192,122,0.14), rgba(230,192,122,0.03))', border: '1px solid rgba(230,192,122,0.35)', borderRadius: 8, padding: '16px 20px', marginBottom: 36 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#e6c07a', marginBottom: 4 }}>
              {acctType === 'customer' ? 'Join the Made Kulture creator directory →' : 'You’re not in the creator directory yet →'}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
              {acctType === 'customer'
                ? 'Switch your account to Creative or Brand and complete your profile so brands and other creatives can find you.'
                : 'Complete your profile and switch on your listing so other members can find you by role.'}
            </div>
          </div>
        </Link>
      )}

      {/* Plus membership */}
      <PlusCard />

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 40 }}>
        <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, lineHeight: 1 }}>{upcoming?.length ?? 0}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Upcoming bookings</div>
        </div>
        <div style={{ background: creditCents > 0 ? 'linear-gradient(135deg, rgba(201,178,126,0.14), rgba(201,178,126,0.03))' : '#141414', border: `1px solid ${creditCents > 0 ? 'rgba(201,178,126,0.35)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, lineHeight: 1, color: creditCents > 0 ? '#c9b27e' : '#fff' }}>${(creditCents / 100).toFixed(2)}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Studio credit{creditCents > 0 ? ' · applies automatically at checkout' : ''}</div>
        </div>
      </div>

      {/* Short-notice booking request — only for customers granted view access */}
      {canRequestShortNotice && <ShortNoticeRequest />}

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

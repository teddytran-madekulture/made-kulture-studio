import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { shortNoticeViewActive } from '@/lib/short-notice'
import ShortNoticeRequest from '@/components/ShortNoticeRequest'
import PlusCard from '@/components/PlusCard'
import { getCreditBalance } from '@/lib/credits'
import { rewardPotForUser } from '@/lib/rewards'
import { standingForCustomerId, LEVEL_LABEL, LEVEL_MEANING, LEVEL_COLOR } from '@/lib/standing'

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
  // Rewards share of that balance + account standing (migration 109).
  const [{ rewardCents }, standing] = await Promise.all([
    rewardPotForUser(service, user!.id),
    standingForCustomerId(service, custIds[0] ?? null),
  ])

  const firstName = profile?.full_name?.split(' ')[0] ?? user!.email?.split('@')[0]
  const acctType = (profile as any)?.account_type ?? 'customer'
  const inDirectory = !!(profile as any)?.directory_opt_in

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.02em', margin: '0 0 4px' }}>
        HEY {firstName?.toUpperCase()}
      </h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), 0.4)', margin: '0 0 24px' }}>
        {user!.email}
      </p>

      {/* Nudge people to complete their profile + join the creator directory. */}
      {!inDirectory && (
        <Link href="/account/profile" style={{ textDecoration: 'none' }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(var(--t-gold-rgb), 0.14), rgba(var(--t-gold-rgb), 0.03))', border: '1px solid rgba(var(--t-gold-rgb), 0.35)', borderRadius: 8, padding: '16px 20px', marginBottom: 36 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'var(--t-gold)', marginBottom: 4 }}>
              {acctType === 'customer' ? 'Join the Made Kulture creator directory →' : 'You’re not in the creator directory yet →'}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), 0.6)', lineHeight: 1.5 }}>
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
        <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), 0.08)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, lineHeight: 1 }}>{upcoming?.length ?? 0}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), 0.4)', marginTop: 4 }}>Upcoming bookings</div>
        </div>
        <div style={{ background: creditCents > 0 ? 'linear-gradient(135deg, rgba(var(--t-gold-rgb), 0.14), rgba(var(--t-gold-rgb), 0.03))' : 'var(--t-surface)', border: `1px solid ${creditCents > 0 ? 'rgba(var(--t-gold-rgb), 0.35)' : 'rgba(var(--t-fg-rgb), 0.08)'}`, borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, lineHeight: 1, color: creditCents > 0 ? 'var(--t-gold)' : 'var(--t-fg)' }}>${(creditCents / 100).toFixed(2)}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), 0.4)', marginTop: 4 }}>Studio credit{creditCents > 0 ? ' · applies automatically at checkout' : ''}</div>
          {rewardCents > 0 && (
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), 0.4)', marginTop: 6, lineHeight: 1.5 }}>
              Includes ${(rewardCents / 100).toFixed(2)} from rewards, which stay active as long as you book once a year.
            </div>
          )}
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), 0.08)', borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, color: LEVEL_COLOR[standing.level] }}>{LEVEL_LABEL[standing.level]}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), 0.4)', marginTop: 4, lineHeight: 1.5 }}>
            Account standing{standing.level !== 'good' ? ` · ${LEVEL_MEANING[standing.level]}` : ''}
            {standing.level !== 'good' && standing.nextDropOff ? ` Improves as points drop off; the next on ${standing.nextDropOff}.` : ''}
            {standing.level !== 'good' ? ' Questions? Text (832) 408-1631.' : ''}
          </div>
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
            <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), 0.08)', borderRadius: 8, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'var(--t-fg)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), 0.35)' }}>{desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

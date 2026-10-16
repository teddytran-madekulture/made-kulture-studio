import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import AccountRail from '@/components/AccountRail'
import SettingsShell from '@/components/SettingsShell'
import VendorTermsGate from '@/components/VendorTermsGate'

// Runs before first paint so a light-mode user never sees a dark flash:
// saved choice first, otherwise LIGHT. 2026-10-02 (Teddy): the account area is
// the directory's world, and light keeps it fresh and visibly separate from the
// dark studio site. It used to follow the device's light/dark setting.
const THEME_BOOT = `try{var t=localStorage.getItem('mk-acct-theme');if(t!=='light'&&t!=='dark')t='light';document.documentElement.dataset.acctTheme=t}catch(e){}`

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account')

  // First-login profile step: users who skipped the signup form (e.g. Google
  // OAuth) land un-onboarded — send them to complete their profile first.
  const { data: prof } = await supabase
    .from('customer_profiles').select('onboarded').eq('id', user.id).maybeSingle()
  if (prof && prof.onboarded === false) redirect('/welcome')
  // 2026-10-16 — birth date is required (migration 171). A member without one
  // gets the one-field version of /welcome. Its OWN query on purpose: if the
  // column is ever missing the select errors, and folding it into the query
  // above would silently switch off the onboarding redirect too. An error here
  // just logs and lets them through.
  if (prof) {
    const { data: bdRow, error: bdErr } = await supabase
      .from('customer_profiles').select('birth_date, underage_blocked_at').eq('id', user.id).maybeSingle()
    if (bdErr) console.error('[account layout] birth_date lookup:', bdErr.message)
    // Missing date -> the one-field screen; under 18 -> the blocked screen.
    // Both live on /welcome, which reads the profile and picks the view.
    else if (bdRow && (!bdRow.birth_date || bdRow.underage_blocked_at)) redirect('/welcome')
  }
  // 2026-10-12 — a Vendor must sign the Vendor Agreement before using the
  // account area (components/VendorTermsGate.tsx).
  // Separate service-role read so it can never disturb the onboarding check
  // above; a failed lookup logs and lets them through (the listing INSERT
  // policy still refuses listings from anyone who hasn't signed).
  const { data: vend, error: vendErr } = await createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .from('customer_profiles').select('account_type, full_name, vendor_terms_accepted_at').eq('id', user.id).maybeSingle()
  if (vendErr) console.error('[account layout] vendor terms lookup:', vendErr.message)
  const needsVendorTerms = vend?.account_type === 'vendor' && !vend?.vendor_terms_accepted_at

  return (
    <div className="acct-theme" style={{ background: 'var(--t-bg)', minHeight: '100vh', color: 'var(--t-fg)' }}>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      {/* Icon rail (desktop, slides out on hover) / top + bottom bars (phones) */}
      {needsVendorTerms && <VendorTermsGate businessName={(vend?.full_name ?? '').trim()} />}
      <AccountRail />
      <div className="acct-main">
        <SettingsShell>
          <div className="acct-content">
            {children}
          </div>
        </SettingsShell>
      </div>
    </div>
  )
}

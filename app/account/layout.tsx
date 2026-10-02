import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountRail from '@/components/AccountRail'
import SettingsShell from '@/components/SettingsShell'

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

  return (
    <div className="acct-theme" style={{ background: 'var(--t-bg)', minHeight: '100vh', color: 'var(--t-fg)' }}>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      {/* Icon rail (desktop, slides out on hover) / top + bottom bars (phones) */}
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

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AccountRail from '@/components/AccountRail'

// Runs before first paint so a light-mode user never sees a dark flash:
// saved choice first, otherwise the device's light/dark setting.
const THEME_BOOT = `try{var t=localStorage.getItem('mk-acct-theme');if(t!=='light'&&t!=='dark')t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.acctTheme=t}catch(e){}`

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
        <div className="acct-content">
          {children}
        </div>
      </div>
    </div>
  )
}

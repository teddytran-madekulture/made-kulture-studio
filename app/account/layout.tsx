import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AccountNav from '@/components/AccountNav'
import AccountMenu from '@/components/AccountMenu'
import ThemeToggle from '@/components/ThemeToggle'

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
      {/* Top nav */}
      <div className="acct-bar" style={{ borderBottom: '1px solid rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', padding: '0 24px' }}>
        <div style={{ maxWidth: 1800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.05em', color: 'var(--t-fg)' }}>
              MADE KULTURE
            </span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle />
            <AccountMenu />
          </div>
        </div>
      </div>

      {/* Sidebar + content */}
      <div className="acct-shell" style={{ maxWidth: 1800, margin: '0 auto', padding: '40px 24px' }}>
        <AccountNav />
        <div style={{ flex: 1, minWidth: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

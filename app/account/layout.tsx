import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AccountNav from '@/components/AccountNav'
import AccountMenu from '@/components/AccountMenu'

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
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      {/* Top nav */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff' }}>
              MADE KULTURE
            </span>
          </Link>
          <AccountMenu />
        </div>
      </div>

      {/* Sidebar + content */}
      <div className="acct-shell" style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <AccountNav />
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

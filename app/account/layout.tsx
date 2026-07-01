import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AccountNav from '@/components/AccountNav'
import AccountMenu from '@/components/AccountMenu'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account')

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <form action="/api/auth/signout" method="POST" className="acct-hide-mobile">
              <button type="submit" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '8px 16px', fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                SIGN OUT
              </button>
            </form>
            <AccountMenu />
          </div>
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

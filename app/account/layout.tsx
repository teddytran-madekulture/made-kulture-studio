import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

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
          <form action="/api/auth/signout" method="POST">
            <button type="submit" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '8px 16px', fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              SIGN OUT
            </button>
          </form>
        </div>
      </div>

      {/* Sidebar + content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px', display: 'flex', gap: 48 }}>
        <nav style={{ width: 180, flexShrink: 0 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>ACCOUNT</div>
          {[
            { href: '/account', label: 'Dashboard' },
            { href: '/account/bookings', label: 'My Bookings' },
            { href: '/account/directory', label: 'Directory' },
            { href: '/account/profile', label: 'Profile' },
            { href: '/account/payment', label: 'Payment Methods' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{
              display: 'block', fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)',
              textDecoration: 'none', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              {label}
            </Link>
          ))}
        </nav>
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

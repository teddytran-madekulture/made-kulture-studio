import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

// Worker area shell. Requires a signed-in member (middleware also guards /work/*).
export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/work/onboarding')

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff' }}>
              MADE KULTURE
            </span>
          </Link>
          <span style={{ fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }}>WORK</span>
        </div>
      </div>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px' }}>{children}</div>
    </div>
  )
}

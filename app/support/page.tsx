'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import SupportCenter from '@/components/SupportCenter'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'

// 2026-10-07 — public Help Center. This is the "Support URL" for the App Store
// and Google Play listings, so it must work signed out. Signed-in members get
// the same thing at /account/support (Help & Support in the account menu).

const btn: React.CSSProperties = { fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 24px', textDecoration: 'none' }

export default function SupportPage() {
  const isMobile = useIsMobile()
  const [me, setMe] = useState<{ signedIn: boolean; email: string | null }>({ signedIn: false, email: null })
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setMe({ signedIn: !!data.user, email: data.user?.email ?? null })).catch(() => {})
  }, [])

  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav active="support" />
      <section style={{ padding: isMobile ? '104px 20px 80px' : '150px 40px 110px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>
          <Suspense fallback={null}>
            <SupportCenter signedIn={me.signedIn} email={me.email} />
          </Suspense>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', paddingTop: 48 }}>
            <Link href="/privacy-policy" style={btn}>PRIVACY POLICY</Link>
            <Link href="/terms" style={btn}>TERMS &amp; CONDITIONS</Link>
            <Link href="/studio-rules" style={btn}>STUDIO RULES</Link>
          </div>
          <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 24, textAlign: 'center' }}>Made Kulture · 4825 Gulf Freeway, Houston TX 77023 · info@madekulture.com</p>
        </div>
      </section>
    </main>
  )
}

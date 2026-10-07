'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import SupportCenter from '@/components/SupportCenter'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'
import { SUPPORT_EMAIL, SUPPORT_TEXT, SUPPORT_TEXT_HREF } from '@/lib/support-faq'

// 2026-10-07 — public Support Center. This is the "Support URL" for the App
// Store and Google Play listings, so it must work signed out. Signed-in members
// get the same thing at /account/support inside the account area.

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

      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 32 : 48, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>HELP</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(52px, 9vw, 96px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: '0 0 20px' }}>SUPPORT</h1>
          <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7, margin: 0, maxWidth: 580 }}>
            Questions about a booking, your account or the Made Kulture app? Search below, or reach us at <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#c9b27e', textDecoration: 'none' }}>{SUPPORT_EMAIL}</a> or text <a href={SUPPORT_TEXT_HREF} style={{ color: '#c9b27e', textDecoration: 'none' }}>{SUPPORT_TEXT}</a>. Made Kulture, 4825 Gulf Freeway, Houston TX 77023.
          </p>
        </div>
      </section>

      <section style={{ padding: isMobile ? '32px 20px 80px' : '48px 40px 110px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <SupportCenter signedIn={me.signedIn} email={me.email} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 40 }}>
            <Link href="/privacy-policy" style={btn}>PRIVACY POLICY</Link>
            <Link href="/terms" style={btn}>TERMS &amp; CONDITIONS</Link>
            <Link href="/studio-rules" style={btn}>STUDIO RULES</Link>
          </div>
        </div>
      </section>
    </main>
  )
}

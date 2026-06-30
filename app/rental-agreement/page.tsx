'use client'
import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'
import AgreementMarkdown from '@/components/AgreementMarkdown'
import { DEFAULT_SET_AGREEMENT, DEFAULT_STUDIO_AGREEMENT } from '@/lib/agreements'

function AgreementView() {
  const params = useSearchParams()
  const isMobile = useIsMobile()
  const initial = params.get('type') === 'studio' ? 'studio' : 'set'
  const [active, setActive] = useState<'set' | 'studio'>(initial)
  const [override, setOverride] = useState<{ set: string | null; studio: string | null }>({ set: null, studio: null })

  useEffect(() => { setActive(params.get('type') === 'studio' ? 'studio' : 'set') }, [params])

  useEffect(() => {
    fetch('/api/agreements')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOverride({ set: d.set ?? null, studio: d.studio ?? null }) })
      .catch(() => {})
  }, [])

  const md = active === 'studio'
    ? (override.studio ?? DEFAULT_STUDIO_AGREEMENT)
    : (override.set ?? DEFAULT_SET_AGREEMENT)

  const tab = (key: 'set' | 'studio', label: string) => (
    <button onClick={() => setActive(key)} style={{
      background: active === key ? '#fff' : 'transparent',
      color: active === key ? '#080808' : 'rgba(255,255,255,0.55)',
      border: '1px solid rgba(255,255,255,0.18)', padding: '10px 18px', cursor: 'pointer',
      fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.12em',
    }}>{label}</button>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '104px 20px 80px' : '128px 40px 100px' }}>
      <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>RENTAL AGREEMENT</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {tab('set', 'INDIVIDUAL SET')}
        {tab('studio', 'FULL WAREHOUSE')}
      </div>

      <AgreementMarkdown markdown={md} isMobile={isMobile} />

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 48, paddingTop: 20, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
        Made Kulture LLC · 4825 Gulf Freeway, Houston, TX 77023 · (832) 408-1631 (text) · madekulture.com
      </div>
    </div>
  )
}

export default function RentalAgreementPage() {
  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="" />
      <Suspense fallback={<div style={{ padding: 140, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}>
        <AgreementView />
      </Suspense>
    </div>
  )
}

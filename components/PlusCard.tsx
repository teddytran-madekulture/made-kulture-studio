'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Status { active: boolean; expiresAt: number | null; autoRenew: boolean; comp: boolean; priceCents: number; standardCents?: number; isIntro?: boolean }

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PlusCard() {
  const [s, setS] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = () => fetch('/api/account/plus').then(r => r.ok ? r.json() : null).then(d => { setS(d); setLoading(false) }).catch(() => setLoading(false))
  useEffect(() => { load() }, [])

  const toggleRenew = async () => {
    if (!s) return
    setBusy(true)
    await fetch('/api/account/plus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'autorenew', autoRenew: !s.autoRenew }),
    }).catch(() => {})
    await load()
    setBusy(false)
  }

  if (loading || !s) return null

  const price = `$${(s.priceCents / 100).toFixed(0)}`

  // Not a member → Go Plus CTA.
  if (!s.active) {
    return (
      <Link href="/account/plus" style={{ textDecoration: 'none' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.16), rgba(212,168,67,0.03))', border: '1px solid rgba(212,168,67,0.4)', borderRadius: 8, padding: '16px 20px', marginBottom: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 700, color: '#e6c07a', marginBottom: 3 }}>Go Plus — book on short notice →</div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
              See the calendar inside 48 hours, request short-notice bookings, and get your money back as studio credit if you cancel. {price}/year{s.isIntro && s.standardCents ? ` \u2014 intro rate, going up to $${(s.standardCents / 100).toFixed(0)} soon` : ''}.
            </div>
          </div>
          <span style={{ flexShrink: 0, background: '#d4a843', color: '#080808', padding: '10px 18px', borderRadius: 4, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>GO PLUS</span>
        </div>
      </Link>
    )
  }

  // Active member card.
  return (
    <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.35)', borderRadius: 8, padding: '16px 20px', marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 700, color: '#e6c07a' }}>
          ✓ Made Kulture Plus{s.comp ? ' · complimentary' : ''}
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {s.expiresAt ? `${s.comp || !s.autoRenew ? 'Through' : 'Renews'} ${fmtDate(s.expiresAt)}` : 'Active'}
        </div>
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginTop: 6 }}>
        You can view the 48-hour window, request short-notice bookings, and cancellations come back as studio credit.
      </div>
      {!s.comp && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Auto-renew {s.autoRenew ? 'on' : 'off'}</span>
            <button onClick={toggleRenew} disabled={busy} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.06em', padding: '5px 12px', borderRadius: 4, cursor: busy ? 'default' : 'pointer' }}>
              {s.autoRenew ? 'Turn off auto-renew' : 'Turn on auto-renew'}
            </button>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, marginTop: 8 }}>
            Turning off auto-renew keeps your benefits through your renewal date — no further charge. Membership fees aren&apos;t refundable.
          </div>
        </>
      )}
    </div>
  )
}

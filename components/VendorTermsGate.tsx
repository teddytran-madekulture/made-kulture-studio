'use client'
// 2026-10-12 — a Vendor account must sign the Vendor Agreement before using
// the account area. Rendered by app/account/layout.tsx ONLY for a vendor whose
// profile has no vendor_terms_accepted_at, so everyone else never loads it.
//
// Before this the agreement only gated CREATING a listing (ListingsManager +
// the service_listings INSERT policy). An account converted to Vendor by the
// studio (first case: Neil Jou Agency, whose roster is a service but not a
// listing) could otherwise sit in the directory without ever agreeing.
//
// It covers the page rather than redirecting so the URL they came for is still
// there once they sign; the only other way out is signing out.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VENDOR_AGREEMENT_SECTIONS, VENDOR_AGREEMENT_TITLE, VENDOR_AGREEMENT_VERSION } from '@/lib/vendor-agreement'

const muted = 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))'
const line = '1px solid rgba(var(--t-fg-rgb), calc(0.14 * var(--t-a)))'

export default function VendorTermsGate({ businessName }: { businessName: string }) {
  const router = useRouter()
  const [tick, setTick] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const sign = async () => {
    if (!tick) { setErr('Tick the box to agree.'); return }
    if (name.trim().length < 2) { setErr('Type your full name to sign.'); return }
    setBusy(true); setErr('')
    const r = await fetch('/api/listings/agreement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), agree: true }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.ok) { setBusy(false); setErr(d.error || 'That did not save. Try again.'); return }
    router.refresh()
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="vtg-title"
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'var(--t-bg)', overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 620, fontFamily: 'Inter', color: 'var(--t-fg)' }}>
        <div style={{ fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--t-gold)', fontWeight: 700 }}>ONE STEP BEFORE YOU CONTINUE</div>
        <h1 id="vtg-title" style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, letterSpacing: '0.02em', margin: '8px 0 6px' }}>{VENDOR_AGREEMENT_TITLE.toUpperCase()}</h1>
        <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.6, margin: '0 0 18px' }}>
          {businessName ? <><b style={{ color: 'var(--t-fg)' }}>{businessName}</b> is set up as a Vendor in the Made Kulture directory.</> : 'Your account is set up as a Vendor in the Made Kulture directory.'}
          {' '}Vendors offer their services to members directly. Please read and sign the agreement below to continue. You can change your name, email and profile any time after.
        </p>
        <div style={{ border: line, borderRadius: 8, padding: '14px 16px', background: 'var(--t-surface)', maxHeight: '46vh', overflowY: 'auto' }}>
          {VENDOR_AGREEMENT_SECTIONS.map((s, i) => (
            <div key={s.heading} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{i + 1}. {s.heading}</div>
              <div style={{ fontSize: 12.5, color: muted, lineHeight: 1.55 }}>{s.body}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: muted }}>Version {VENDOR_AGREEMENT_VERSION}</div>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 13, cursor: 'pointer', lineHeight: 1.5 }}>
          <input type="checkbox" checked={tick} onChange={e => { setTick(e.target.checked); setErr('') }} style={{ marginTop: 3 }} />
          I have read and agree to the {VENDOR_AGREEMENT_TITLE}. I understand Made Kulture is not a party to my bookings and does not handle payment, logistics, insurance or disputes.
        </label>
        <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.08em', color: muted, margin: '16px 0 7px' }}>TYPE YOUR FULL NAME TO SIGN</label>
        <input value={name} onChange={e => { setName(e.target.value); setErr('') }} maxLength={120} placeholder="Full name" autoComplete="name"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--t-surface)', border: line, borderRadius: 4, padding: '12px 14px', fontFamily: 'Inter', fontSize: 16, color: 'var(--t-fg)', outline: 'none' }} />
        {err && <div style={{ fontSize: 13, color: 'var(--t-err)', marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={sign} disabled={busy}
            style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4, padding: '13px 30px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'SAVING…' : 'I AGREE'}
          </button>
          <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
            <button type="submit" style={{ background: 'transparent', border: 'none', color: muted, fontFamily: 'Inter', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>Sign out</button>
          </form>
        </div>
      </div>
    </div>
  )
}

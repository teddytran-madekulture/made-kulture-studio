'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// Invite landing for someone credited on a portfolio photo who isn't on the
// Creative Directory yet (migration 133). Sign up / sign in here, then claim.
type Info = { role: string; name: string | null; by: string; photo: string | null; claimed: boolean; claimedByMe: boolean; signedIn: boolean }

export default function CreditInvitePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const here = `/join/credit/${token}`

  useEffect(() => {
    fetch(`/api/directory/credits/claim?token=${encodeURIComponent(String(token))}`, { cache: 'no-store' })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) setErr(d.error || 'This invite link isn’t valid.'); else setInfo(d) })
      .catch(() => setErr('Could not load this invite.'))
  }, [token])

  const claim = async () => {
    setBusy(true); setErr('')
    const r = await fetch('/api/directory/credits/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not claim this credit.'); return }
    setDone(true)
  }

  const btn = (solid: boolean): React.CSSProperties => ({
    display: 'inline-block', textAlign: 'center', textDecoration: 'none', cursor: 'pointer',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
    padding: '14px 22px', border: solid ? 'none' : '1px solid rgba(255,255,255,0.3)',
    background: solid ? '#c9b27e' : 'transparent', color: solid ? '#080808' : '#fff',
  })

  return (
    <div style={{ minHeight: '70vh', background: '#080808', color: '#fff', display: 'flex', justifyContent: 'center', padding: '56px 16px' }}>
      <div style={{ width: '100%', maxWidth: 440, fontFamily: 'Inter' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#c9b27e', marginBottom: 12 }}>MADE KULTURE · CREATIVE DIRECTORY</div>
        {err && !info && <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{err}</div>}
        {!info && !err && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}
        {info && (
          <>
            <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 38, lineHeight: 1, letterSpacing: '0.01em', margin: '0 0 14px' }}>
              {done || info.claimedByMe ? 'CREDIT CLAIMED' : 'YOU WERE CREDITED'}
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 22px' }}>
              <b style={{ color: '#fff' }}>{info.by}</b> credited {info.name ? <b style={{ color: '#fff' }}>{info.name}</b> : 'you'} as <b style={{ color: '#fff' }}>{info.role}</b> on a photo in their portfolio on Made Kulture&rsquo;s Creative Directory, Houston&rsquo;s local network of creatives, brands and production pros.
            </p>
            {info.photo && (
              <img src={info.photo} alt="" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block', marginBottom: 24, border: '1px solid rgba(255,255,255,0.1)' }} />
            )}
            {done || info.claimedByMe ? (
              <>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: '0 0 18px' }}>
                  It&rsquo;s linked to your account. Finish your directory profile so it shows on your Tagged tab and people can find you.
                </p>
                <button type="button" onClick={() => router.push('/account/profile')} style={btn(true)}>FINISH MY PROFILE →</button>
              </>
            ) : info.claimed ? (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>This credit has already been claimed by another account.</p>
            ) : info.signedIn ? (
              <>
                {err && <div style={{ fontSize: 13, color: '#ff8080', marginBottom: 12 }}>{err}</div>}
                <button type="button" disabled={busy} onClick={claim} style={btn(true)}>{busy ? 'CLAIMING…' : 'CLAIM THIS CREDIT'}</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: '0 0 18px' }}>
                  Create a free account to claim it. It&rsquo;ll link to your profile, and you can show your own work and get found for your next shoot.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link href={`/signup?next=${encodeURIComponent(here)}`} style={btn(true)}>JOIN FREE →</Link>
                  <Link href={`/login?next=${encodeURIComponent(here)}`} style={btn(false)}>SIGN IN</Link>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

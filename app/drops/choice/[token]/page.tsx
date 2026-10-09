'use client'
// Refund or studio credit, after a Set Drop was cancelled with "your choice".
// Reached from the emailed/texted link; the token is the authorisation.
import { useEffect, useState } from 'react'
import SiteNav from '@/components/SiteNav'

const anton = 'Anton, "Bebas Neue", sans-serif'
const inter = 'Inter, sans-serif'
const GOLD = '#c9b27e'

export default function DropChoicePage({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<{ dropName: string; status: string; deposit: string; deadline: string | null } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'refund' | 'credit' | null>(null)

  useEffect(() => {
    fetch(`/api/drops/choice/${params.token}`, { cache: 'no-store' })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Link not found.'); setInfo(d) })
      .catch(e => setErr(e.message))
  }, [params.token])

  const choose = async (choice: 'refund' | 'credit') => {
    setBusy(true); setErr('')
    const r = await fetch(`/api/drops/choice/${params.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'That didn’t work.'); return }
    setDone(choice)
  }

  const b: React.CSSProperties = { fontFamily: inter, fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', padding: '15px 24px', cursor: 'pointer', border: 'none' }
  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '150px 20px 80px' }}>
        {err && <p style={{ fontFamily: inter, color: '#ff8a80' }}>{err}</p>}
        {info && (
          <>
            <h1 style={{ fontFamily: anton, fontSize: 'clamp(40px, 8vw, 72px)', lineHeight: 0.95, margin: 0 }}>{info.dropName.toUpperCase()}</h1>
            {done || info.status !== 'pending_choice' ? (
              <p style={{ fontFamily: inter, fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, marginTop: 20 }}>
                {done === 'credit' || (!done && info.status === 'credited')
                  ? `Done — your ${info.deposit} is now studio credit on your account, good on any set.`
                  : `Done — your ${info.deposit} deposit has been refunded to your card. It usually shows within 5–10 business days.`}
              </p>
            ) : (
              <>
                <p style={{ fontFamily: inter, fontSize: 16, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, marginTop: 20 }}>
                  This one isn&rsquo;t happening. What should we do with your {info.deposit} deposit?
                  {info.deadline ? ` If you don’t choose by ${info.deadline}, it’s refunded to your card.` : ''}
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
                  <button disabled={busy} onClick={() => choose('refund')} style={{ ...b, background: '#fff', color: '#080808' }}>REFUND TO MY CARD</button>
                  <button disabled={busy} onClick={() => choose('credit')} style={{ ...b, background: 'transparent', color: GOLD, border: `1px solid ${GOLD}` }}>KEEP AS STUDIO CREDIT</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

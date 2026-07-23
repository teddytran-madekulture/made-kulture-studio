'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', good: '#5bd08a', warn: '#e0b64a' }

type Mod = { slug: string; title: string; version: number; questions: number; status: 'not_started' | 'passed' | 'needs_recert' }

export default function WorkOnboardingHub() {
  const [state, setState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/work/onboarding')
    if (r.status === 401) { window.location.href = '/login?next=/work/onboarding'; return }
    setState(await r.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const apply = async () => {
    if (!pick) { setErr('Pick a role first.'); return }
    setErr(''); setBusy(true)
    const r = await fetch('/api/work/onboarding/enroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_class: pick }),
    })
    setBusy(false)
    if (!r.ok) { const d = await r.json(); setErr(d.error || 'Could not apply.'); return }
    load()
  }

  if (loading) return <div style={{ color: C.dim }}>Loading…</div>

  // Not yet a worker → apply screen.
  if (state && !state.enrolled) {
    return (
      <div>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '0 0 8px' }}>WORK AT MADE KULTURE</h1>
        <p style={{ color: C.dim, marginTop: 0 }}>Pick the role you're interested in to start orientation. The studio reviews every applicant before you're cleared to take shifts.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          {(state.classes || []).map((c: any) => (
            <button key={c.key} onClick={() => setPick(c.key)} style={{
              textAlign: 'left', background: pick === c.key ? 'rgba(201,178,126,0.14)' : C.card,
              border: `1px solid ${pick === c.key ? C.accent : C.line}`, color: C.text,
              borderRadius: 10, padding: '14px 18px', cursor: 'pointer', fontSize: 15,
            }}>{c.label}</button>
          ))}
        </div>
        {err && <div style={{ color: '#ff6b6b', marginTop: 12 }}>{err}</div>}
        <button onClick={apply} disabled={busy} style={{
          marginTop: 18, background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6,
          padding: '12px 24px', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer',
        }}>{busy ? 'APPLYING…' : 'START ORIENTATION →'}</button>
      </div>
    )
  }

  const mods: Mod[] = state?.modules || []
  const done = mods.filter(m => m.status === 'passed').length
  const badge = (s: string) =>
    s === 'passed' ? { t: '✓ Passed', c: C.good }
      : s === 'needs_recert' ? { t: 'Update needed', c: C.warn }
        : { t: 'Start', c: C.dim }

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '0 0 6px' }}>ORIENTATION</h1>
      <p style={{ color: C.dim, marginTop: 0 }}>
        Role: <span style={{ color: C.text }}>{state?.worker?.label}</span> · {done}/{mods.length} complete
      </p>
      <div style={{
        background: state?.certified ? 'rgba(91,208,138,0.12)' : C.card,
        border: `1px solid ${state?.certified ? 'rgba(91,208,138,0.4)' : C.line}`,
        borderRadius: 10, padding: '12px 16px', margin: '14px 0 24px',
        color: state?.certified ? C.good : C.dim,
      }}>
        {state?.certified ? '✓ You’re certified — orientation complete.' : 'Complete every module below to finish orientation.'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mods.map(m => {
          const b = badge(m.status)
          return (
            <Link key={m.slug} href={`/work/onboarding/${m.slug}`} style={{ textDecoration: 'none' }}>
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>{m.title}</div>
                  <div style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{m.questions} question{m.questions === 1 ? '' : 's'}</div>
                </div>
                <span style={{ color: b.c, fontSize: 13, whiteSpace: 'nowrap' }}>{b.t} →</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

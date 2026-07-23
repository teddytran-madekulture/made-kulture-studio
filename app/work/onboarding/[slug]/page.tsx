'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', good: '#5bd08a', bad: '#ff6b6b' }

// Minimal, safe markdown-ish render: paragraphs + **bold** (content is admin-authored).
function renderBody(body: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return body.split(/\n\n+/).map((para, i) => (
    <p key={i} style={{ color: 'rgba(255,255,255,0.82)', lineHeight: 1.65, fontSize: 15 }}
      dangerouslySetInnerHTML={{ __html: esc(para).replace(/\*\*(.+?)\*\*/g, '<strong style="color:#fff">$1</strong>').replace(/\n/g, '<br/>') }} />
  ))
}

export default function ModulePage() {
  const params = useParams()
  const slug = String((params as any)?.slug || '')
  const [mod, setMod] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [phase, setPhase] = useState<'read' | 'quiz'>('read')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/work/onboarding/${slug}`)
      if (r.status === 401) { window.location.href = '/login?next=/work/onboarding'; return }
      if (!r.ok) { const d = await r.json(); setErr(d.error || 'Not found.'); setLoading(false); return }
      setMod(await r.json())
      setLoading(false)
    })()
  }, [slug])

  const submit = async () => {
    setBusy(true); setErr('')
    const payload: Record<string, number[]> = {}
    for (const q of (mod.quiz?.questions ?? [])) {
      if (answers[q.id] != null) payload[q.id] = [answers[q.id]]
    }
    const r = await fetch(`/api/work/onboarding/${slug}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: payload }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not submit.'); return }
    setResult(d)
  }

  if (loading) return <div style={{ color: C.dim }}>Loading…</div>
  if (err && !mod) return (
    <div>
      <Link href="/work/onboarding" style={{ color: C.accent, textDecoration: 'none' }}>← Orientation</Link>
      <p style={{ color: C.bad }}>{err}</p>
    </div>
  )

  const qs = mod.quiz?.questions ?? []
  const allAnswered = qs.every((q: any) => answers[q.id] != null)

  if (result) {
    return (
      <div>
        <Link href="/work/onboarding" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Orientation</Link>
        <div style={{ background: C.card, border: `1px solid ${result.passed ? 'rgba(91,208,138,0.4)' : C.line}`, borderRadius: 12, padding: 24, marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>{result.passed ? '✅' : '↩️'}</div>
          <h2 style={{ margin: '8px 0', color: result.passed ? C.good : C.text }}>{result.passed ? 'Passed' : 'Not quite'}</h2>
          <p style={{ color: C.dim }}>You scored {result.scorePct}%.</p>
          {result.passed ? (
            <Link href="/work/onboarding" style={{ display: 'inline-block', marginTop: 10, background: C.accent, color: '#0b0b0d', borderRadius: 6, padding: '11px 22px', textDecoration: 'none', fontWeight: 700 }}>BACK TO ORIENTATION →</Link>
          ) : (
            <button onClick={() => { setResult(null); setAnswers({}); setPhase('read') }} style={{ marginTop: 10, background: 'transparent', color: C.text, border: `1px solid ${C.line}`, borderRadius: 6, padding: '11px 22px', cursor: 'pointer' }}>REVIEW & RETAKE</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link href="/work/onboarding" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Orientation</Link>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, margin: '10px 0 18px' }}>{mod.title}</h1>

      {phase === 'read' ? (
        <>
          <div>{renderBody(mod.body || '')}</div>
          <button onClick={() => setPhase('quiz')} style={{ marginTop: 24, background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '12px 24px', fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>
            {qs.length ? 'START QUIZ →' : 'DONE'}
          </button>
        </>
      ) : (
        <>
          {qs.map((q: any, qi: number) => (
            <div key={q.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 15, marginBottom: 10 }}>{qi + 1}. {q.prompt}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.options.map((opt: string, oi: number) => (
                  <label key={oi} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: answers[q.id] === oi ? C.text : C.dim }}>
                    <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => setAnswers(a => ({ ...a, [q.id]: oi }))} />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {err && <div style={{ color: C.bad, marginBottom: 10 }}>{err}</div>}
          <button onClick={submit} disabled={busy || !allAnswered} style={{ background: allAnswered ? C.accent : 'rgba(255,255,255,0.1)', color: allAnswered ? '#0b0b0d' : C.dim, border: 'none', borderRadius: 6, padding: '12px 24px', fontWeight: 700, letterSpacing: '0.08em', cursor: allAnswered ? 'pointer' : 'default' }}>
            {busy ? 'SUBMITTING…' : 'SUBMIT'}
          </button>
        </>
      )}
    </div>
  )
}

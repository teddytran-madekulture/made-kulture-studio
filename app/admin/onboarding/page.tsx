'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type WClass = 'attendant' | 'sanitation' | 'intern' | 'freelancer'
const CLASSES: { key: WClass; label: string }[] = [
  { key: 'attendant', label: 'Attendant' },
  { key: 'sanitation', label: 'Sanitation' },
  { key: 'intern', label: 'Intern' },
  { key: 'freelancer', label: 'Freelancer' },
]

interface Module {
  id: string
  slug: string
  title: string
  body: string
  version: number
  required_for: WClass[]
  quiz: any
  sort_order: number
  active: boolean
  created_at: string
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

const EMPTY_QUIZ = { pass_pct: 80, retake_on_miss: false, questions: [] as any[] }

export default function OnboardingAdminPage() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [f, setF] = useState({
    slug: '', title: '', sort_order: '', required_for: [] as WClass[],
    body: '', quizText: JSON.stringify(EMPTY_QUIZ, null, 2),
  })

  const load = async () => {
    const r = await fetch('/api/admin/onboarding')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json(); setModules(d.modules ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const resetForm = () => {
    setEditingId(null)
    setF({ slug: '', title: '', sort_order: '', required_for: [], body: '', quizText: JSON.stringify(EMPTY_QUIZ, null, 2) })
    setErr('')
  }

  const startEdit = (m: Module) => {
    setEditingId(m.id)
    setF({
      slug: m.slug, title: m.title, sort_order: String(m.sort_order),
      required_for: m.required_for ?? [], body: m.body ?? '',
      quizText: JSON.stringify(m.quiz ?? EMPTY_QUIZ, null, 2),
    })
    setErr('')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleClass = (c: WClass) =>
    setF(prev => ({ ...prev, required_for: prev.required_for.includes(c) ? prev.required_for.filter(x => x !== c) : [...prev.required_for, c] }))

  const buildBody = () => {
    let quiz: any
    try { quiz = JSON.parse(f.quizText) } catch { throw new Error('Quiz JSON is not valid — check the syntax.') }
    return {
      slug: f.slug, title: f.title, body: f.body,
      required_for: f.required_for, quiz,
      sort_order: f.sort_order ? Number(f.sort_order) : 0,
    }
  }

  // POST — new module or new version of an existing slug.
  const saveNewVersion = async () => {
    setErr(''); setBusy(true)
    let body: any
    try { body = buildBody() } catch (e: any) { setErr(e.message); setBusy(false); return }
    const r = await fetch('/api/admin/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not save.'); return }
    resetForm(); load()
  }

  // PATCH — edit the selected version in place (typo/fix, no re-cert).
  const saveInPlace = async () => {
    if (!editingId) return
    setErr(''); setBusy(true)
    let body: any
    try { body = buildBody() } catch (e: any) { setErr(e.message); setBusy(false); return }
    const r = await fetch(`/api/admin/onboarding/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not save.'); return }
    resetForm(); load()
  }

  const toggleActive = async (m: Module) => {
    await fetch(`/api/admin/onboarding/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !m.active }) })
    load()
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }
  const mono: React.CSSProperties = { ...inp, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, minHeight: 120, resize: 'vertical' }

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>ONBOARDING</h1>
          <Link href="/admin/dashboard" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 28 }}>
          Orientation modules workers must pass before they can take shifts. Change a rule → save a <b>new version</b> to force a re-cert on that module only.
        </p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            {/* Editor */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em' }}>{editingId ? `Editing: ${f.slug}` : 'New module'}</div>
                {editingId && <button onClick={resetForm} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer' }}>+ New instead</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                <div><span style={lbl}>Title</span><input style={inp} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="House Rules & Enforcement" /></div>
                <div><span style={lbl}>Slug</span><input style={inp} value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} placeholder="house-rules" /></div>
                <div><span style={lbl}>Sort order</span><input style={inp} value={f.sort_order} onChange={e => setF({ ...f, sort_order: e.target.value })} inputMode="numeric" placeholder="3" /></div>
              </div>

              <div style={{ marginTop: 14 }}>
                <span style={lbl}>Required for</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CLASSES.map(c => (
                    <button key={c.key} onClick={() => toggleClass(c.key)} style={{
                      border: `1px solid ${f.required_for.includes(c.key) ? C.accent : C.line}`,
                      background: f.required_for.includes(c.key) ? 'rgba(201,178,126,0.14)' : 'transparent',
                      color: f.required_for.includes(c.key) ? C.accent : C.dim,
                      borderRadius: 20, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                    }}>{c.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <span style={lbl}>Body (markdown)</span>
                <textarea style={{ ...inp, minHeight: 140, resize: 'vertical', fontFamily: 'Inter, sans-serif' }} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
              </div>

              <div style={{ marginTop: 14 }}>
                <span style={lbl}>Quiz (JSON — pass_pct, retake_on_miss, questions[])</span>
                <textarea style={mono} value={f.quizText} onChange={e => setF({ ...f, quizText: e.target.value })} spellCheck={false} />
                <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Each question: {'{ id, prompt, type: "single"|"boolean", options: [], answer: [correctIndex] }'}</div>
              </div>

              {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 12 }}>{err}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button onClick={saveNewVersion} disabled={busy} style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                  {busy ? 'SAVING…' : editingId ? '↑ SAVE AS NEW VERSION' : '+ CREATE MODULE'}
                </button>
                {editingId && (
                  <button onClick={saveInPlace} disabled={busy} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, borderRadius: 6, padding: '11px 18px', fontSize: 12, letterSpacing: '0.08em', cursor: 'pointer' }}>
                    SAVE FIX (IN PLACE)
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : modules.length === 0 ? (
              <div style={{ color: C.dim }}>No modules yet. Run the seed migration or create one above.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {modules.map(m => (
                  <div key={m.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, opacity: m.active ? 1 : 0.5 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{m.title} <span style={{ color: C.dim, fontSize: 12, fontWeight: 400 }}>v{m.version}</span></div>
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{m.slug}</span>
                        {` · #${m.sort_order}`}
                        {` · ${(m.required_for ?? []).join(', ') || 'no classes'}`}
                        {` · ${(m.quiz?.questions?.length ?? 0)} Q`}
                        {m.quiz?.retake_on_miss ? ' · retake-on-miss' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => startEdit(m)} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.text, borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer' }}>EDIT</button>
                      <button onClick={() => toggleActive(m)} style={{ background: 'none', border: `1px solid ${m.active ? 'rgba(255,80,80,0.4)' : C.line}`, color: m.active ? '#ff6b6b' : C.dim, borderRadius: 6, padding: '7px 14px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {m.active ? 'ARCHIVE' : 'RESTORE'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

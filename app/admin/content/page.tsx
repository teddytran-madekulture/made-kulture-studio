'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CONTENT_PAGES, getContentPage, type ContentField } from '@/lib/site-content'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

type Status = 'idle' | 'saving' | 'saved'

export default function ContentEditor() {
  const [pageSlug, setPageSlug] = useState(CONTENT_PAGES[0]?.slug ?? 'home')
  const page = useMemo(() => getContentPage(pageSlug), [pageSlug])

  const [values, setValues] = useState<Record<string, string>>({})
  const [overridden, setOverridden] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<Record<string, Status>>({})
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const load = async () => {
    if (!page) return
    setLoading(true)
    const base: Record<string, string> = {}
    for (const f of page.fields) base[f.key] = f.default
    try {
      const r = await fetch(`/api/admin/site-content?page=${encodeURIComponent(page.slug)}`, { credentials: 'include' })
      if (r.status === 401) { setUnauth(true); setLoading(false); return }
      const d = await r.json()
      const ov: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(d.overrides ?? {})) { base[k] = String(v); ov[k] = true }
      setOverridden(ov)
    } catch {}
    setValues(base)
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pageSlug])

  const save = (key: string, value: string) => {
    if (!page) return
    setStatus(s => ({ ...s, [key]: 'saving' }))
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(async () => {
      try {
        const r = await fetch('/api/admin/site-content', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: page.slug, key, value }),
        })
        if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Save failed.'); setStatus(s => ({ ...s, [key]: 'idle' })); return }
        setOverridden(o => ({ ...o, [key]: true }))
        setStatus(s => ({ ...s, [key]: 'saved' }))
      } catch { setStatus(s => ({ ...s, [key]: 'idle' })) }
    }, 450)
  }

  const onChange = (key: string, value: string) => {
    setValues(v => ({ ...v, [key]: value }))
    setErr('')
    save(key, value)
  }

  const reset = async (field: ContentField) => {
    if (!page) return
    setStatus(s => ({ ...s, [field.key]: 'saving' }))
    try {
      const r = await fetch(`/api/admin/site-content?page=${encodeURIComponent(page.slug)}&key=${encodeURIComponent(field.key)}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not reset.'); return }
      setValues(v => ({ ...v, [field.key]: field.default }))
      setOverridden(o => { const n = { ...o }; delete n[field.key]; return n })
      setStatus(s => ({ ...s, [field.key]: 'idle' }))
    } catch { setErr('Could not reset.') }
  }

  if (loading) return <main style={{ background: C.bg, minHeight: '100vh', color: C.dim, padding: 40, fontFamily: 'Inter, sans-serif' }}>Loading…</main>
  if (unauth) return <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: 40, fontFamily: 'Inter, sans-serif' }}>Please <a href="/admin" style={{ color: C.accent }}>log in</a> to edit site content.</main>
  if (!page) return <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: 40, fontFamily: 'Inter, sans-serif' }}>No page selected.</main>

  const groups = Array.from(new Set(page.fields.map(f => f.group)))

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px 80px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40, letterSpacing: '0.03em', margin: 0 }}>SITE CONTENT</h1>
          <a href="/" target="_blank" rel="noreferrer" style={{ fontSize: 12, letterSpacing: '0.1em', color: C.accent, textDecoration: 'none' }}>VIEW LIVE SITE ↗</a>
        </div>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.6, marginTop: 6, marginBottom: 24, maxWidth: 620 }}>
          Edit the words on your site. Changes save automatically and go live immediately — no publishing step.
          Reset returns a field to its original text. Photos are edited on the <a href="/admin/homepage" style={{ color: C.accent }}>Home Page</a> screen.
        </p>

        {CONTENT_PAGES.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {CONTENT_PAGES.map(p => (
              <button key={p.slug} onClick={() => setPageSlug(p.slug)}
                style={{ background: p.slug === pageSlug ? '#fff' : 'transparent', color: p.slug === pageSlug ? '#080808' : C.text, border: `1px solid ${C.line}`, padding: '8px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {err && <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', color: '#f2b8b8', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>{err}</div>}

        {groups.map(group => (
          <section key={group} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', marginBottom: 14 }}>{group}</div>
            <div style={{ display: 'grid', gap: 16 }}>
              {page.fields.filter(f => f.group === group).map(field => {
                const st = status[field.key]
                const isOverridden = overridden[field.key]
                const common = {
                  value: values[field.key] ?? '',
                  onChange: (e: any) => onChange(field.key, e.target.value),
                  style: { width: '100%', background: '#0e0e10', color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' as const },
                }
                return (
                  <div key={field.key} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>{field.label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, color: st === 'saved' ? C.accent : C.dim, minWidth: 44 }}>
                          {st === 'saving' ? 'Saving…' : st === 'saved' ? 'Saved ✓' : ''}
                        </span>
                        {isOverridden && (
                          <button onClick={() => reset(field)} style={{ background: 'transparent', color: C.dim, border: `1px solid ${C.line}`, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Reset</button>
                        )}
                      </div>
                    </div>
                    {field.type === 'multiline'
                      ? <textarea {...common} rows={Math.max(2, (values[field.key] ?? '').split('\n').length)} style={{ ...common.style, resize: 'vertical', lineHeight: 1.5 }} />
                      : <input type="text" {...common} />}
                    {field.hint && <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: 6 }}>{field.hint}</div>}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

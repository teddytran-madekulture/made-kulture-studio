'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TEMPLATES, renderTemplateEmail } from '@/lib/email-templates'

type FormState = { name: string; segment_key: string; subject: string; template_id: string; values: Record<string, string>; promo_id: string }
const blankForm = (): FormState => ({ name: '', segment_key: 'all', subject: '', template_id: TEMPLATES[0].id, values: { ...TEMPLATES[0].defaults }, promo_id: '' })

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

interface Campaign {
  id: string; name: string; segment_key: string; subject: string; status: string
  recipient_count: number; sent_at: string | null; code: string | null; redemptions: number
  opened: number; clicked: number; unsubscribed: number; bounced: number
}
interface Promo { id: string; code: string; active: boolean }
interface Suppression { email: string; reason: string; created_at: string; campaign: string | null }

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ minWidth: 56 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? '#c9b27e' : '#f4f4f5' }}>{value}</div>
      <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
        {label}{sub ? ` · ${sub}` : ''}
      </div>
    </div>
  )
}

const SEGMENTS: { key: string; label: string }[] = [
  { key: 'all', label: 'All customers' },
  { key: 'members', label: 'Members (have an account)' },
  { key: 'guests', label: 'Guests (no account)' },
  { key: 'recent', label: 'Recent (booked ≤30 days)' },
  { key: 'lapsed', label: 'Lapsed (no booking 90+ days)' },
]

export default function MarketingPage() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [promos, setPromos] = useState<Promo[]>([])
  const [unauth, setUnauth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState<FormState>(blankForm())
  const [supps, setSupps] = useState<Suppression[] | null>(null)

  const template = TEMPLATES.find(t => t.id === f.template_id) ?? TEMPLATES[0]
  const promoCode = promos.find(p => p.id === f.promo_id)?.code
  // Switching template resets its fields to that template's starter copy.
  const pickTemplate = (id: string) => {
    const t = TEMPLATES.find(x => x.id === id) ?? TEMPLATES[0]
    setF({ ...f, template_id: id, values: { ...t.defaults, ...f.values } })
  }
  const setVal = (key: string, val: string) => setF({ ...f, values: { ...f.values, [key]: val } })
  const payload = () => ({ name: f.name, segment_key: f.segment_key, subject: f.subject, template_id: f.template_id, template_data: f.values, promo_id: f.promo_id })

  const loadSupps = async () => {
    if (supps) { setSupps(null); return } // toggle closed
    const r = await fetch('/api/admin/marketing?suppressions=1')
    const d = await r.json()
    setSupps(d.suppressions ?? [])
  }

  const load = async () => {
    const r = await fetch('/api/admin/marketing')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json()
    setCampaigns(d.campaigns ?? [])
    fetch('/api/admin/marketing?segments=1').then(x => x.json()).then(x => setCounts(x.counts ?? {})).catch(() => {})
    fetch('/api/admin/promos').then(x => x.json()).then(x => setPromos((x.promos ?? []).filter((p: Promo) => p.active))).catch(() => {})
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    setErr(''); setBusy(true)
    const r = await fetch('/api/admin/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not create.'); return }
    setF(blankForm())
    load()
  }

  const sendTest = async (id: string) => {
    const to = prompt('Send a test email to which address?')
    if (!to) return
    const r = await fetch(`/api/admin/marketing/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, testEmail: to }) })
    const d = await r.json()
    alert(r.ok ? `Test sent to ${to}. Check it before sending for real.` : `Test failed: ${d.error}`)
  }
  const sendReal = async (c: Campaign) => {
    const n = counts[c.segment_key] ?? 0
    if (!confirm(`Send "${c.name}" to ${n} recipient(s) in "${c.segment_key}"?\n\nThis emails real customers. Make sure you sent yourself a test first.`)) return
    const r = await fetch(`/api/admin/marketing/${c.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const d = await r.json()
    alert(r.ok ? `Sent to ${d.sent} recipient(s).${d.partialError ? ' (some failed: ' + d.partialError + ')' : ''}` : `Send failed: ${d.error}`)
    load()
  }

  // Save the current draft and immediately fire a test to an address you enter — one step, no need to hunt for a button.
  const saveAndTest = async () => {
    if (!f.name || !f.subject) { setErr('Add a campaign name and subject first.'); return }
    const to = prompt('Send a test to which email address?')
    if (!to) return
    setErr(''); setBusy(true)
    const r = await fetch('/api/admin/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
    const d = await r.json()
    if (!r.ok) { setBusy(false); setErr(d.error || 'Could not save draft.'); return }
    const t = await fetch(`/api/admin/marketing/${d.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, testEmail: to }) })
    const td = await t.json(); setBusy(false)
    alert(t.ok ? `Draft saved and test sent to ${to}. Check it, then hit SEND → on the draft below.` : `Draft saved, but the test failed: ${td.error}`)
    setF(blankForm())
    load()
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box', colorScheme: 'dark' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>MARKETING</h1>
          <Link href="/admin/dashboard" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 28 }}>Email campaigns to your customers. Every email includes an unsubscribe link + studio address. Always send yourself a test first.</p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            {/* Compose */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 28 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div><span style={lbl}>Campaign name (internal)</span><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Holiday sale 2026" /></div>
                <div><span style={lbl}>Audience</span>
                  <select style={inp} value={f.segment_key} onChange={e => setF({ ...f, segment_key: e.target.value })}>
                    {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}{counts[s.key] != null ? ` (${counts[s.key]})` : ''}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}><span style={lbl}>Subject</span><input style={inp} value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} placeholder="20% off your next shoot 🎬" /></div>

              {/* Template picker */}
              <div style={{ marginBottom: 16 }}>
                <span style={lbl}>Template</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {TEMPLATES.map(t => {
                    const active = t.id === f.template_id
                    return (
                      <button key={t.id} onClick={() => pickTemplate(t.id)} style={{ textAlign: 'left', cursor: 'pointer', background: active ? 'rgba(201,178,126,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? C.accent : C.line}`, borderRadius: 8, padding: '11px 13px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? C.accent : C.text }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>{t.blurb}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Layout: fields + live preview */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 14 }}>
                <div>
                  {template.fields.map(fld => (
                    <div key={fld.key} style={{ marginBottom: 12 }}>
                      <span style={lbl}>{fld.label}</span>
                      {fld.type === 'textarea'
                        ? <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={f.values[fld.key] ?? ''} onChange={e => setVal(fld.key, e.target.value)} placeholder={fld.placeholder} />
                        : <input style={inp} value={f.values[fld.key] ?? ''} onChange={e => setVal(fld.key, e.target.value)} placeholder={fld.placeholder} />}
                    </div>
                  ))}
                  <div style={{ marginBottom: 4 }}><span style={lbl}>Attach promo code (optional)</span>
                    <select style={inp} value={f.promo_id} onChange={e => setF({ ...f, promo_id: e.target.value })}>
                      <option value="">None</option>
                      {promos.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <span style={lbl}>Live preview</span>
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden', background: '#0a0a0b' }}>
                    <iframe title="preview" style={{ width: '100%', height: 640, border: 'none', display: 'block' }} srcDoc={renderTemplateEmail(f.template_id, f.values, promoCode)} />
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 6 }}>Header, address & unsubscribe are added to every send automatically.</div>
                </div>
              </div>
              {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={create} disabled={busy} style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                  {busy ? 'SAVING…' : '+ SAVE DRAFT'}
                </button>
                <button onClick={saveAndTest} disabled={busy} style={{ background: 'none', color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                  SAVE &amp; SEND TEST TO ME
                </button>
              </div>
            </div>

            {/* List */}
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : campaigns.length === 0 ? (
              <div style={{ color: C.dim }}>No campaigns yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                          {c.subject} · {c.segment_key}{c.code ? ` · code ${c.code}` : ''}
                          {c.status === 'sent' ? ` · sent to ${c.recipient_count}` : ` · draft`}
                        </div>
                      </div>
                      {c.status === 'sent'
                        ? <span style={{ fontSize: 11, color: '#6bffaa', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>SENT</span>
                        : (
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button onClick={() => sendTest(c.id)} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>TEST</button>
                            <button onClick={() => sendReal(c)} style={{ background: C.accent, border: 'none', color: '#0b0b0d', borderRadius: 6, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>SEND →</button>
                          </div>
                        )}
                    </div>
                    {c.status === 'sent' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
                        <Stat label="Opened" value={`${pct(c.opened, c.recipient_count)}%`} sub={`${c.opened}`} />
                        <Stat label="Clicked" value={`${pct(c.clicked, c.recipient_count)}%`} sub={`${c.clicked}`} />
                        {c.code && <Stat label="Redeemed" value={`${c.redemptions}`} accent />}
                        <Stat label="Unsub" value={`${c.unsubscribed}`} />
                        <Stat label="Bounced" value={`${c.bounced}`} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Do-not-email list */}
            <div style={{ marginTop: 28 }}>
              <button onClick={loadSupps} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '9px 16px', fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer' }}>
                {supps ? 'HIDE UNSUBSCRIBES ▲' : 'WHO UNSUBSCRIBED ▾'}
              </button>
              {supps && (
                <div style={{ marginTop: 12, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                  {supps.length === 0 ? (
                    <div style={{ padding: 18, color: C.dim, fontSize: 13 }}>Nobody has unsubscribed or bounced yet.</div>
                  ) : supps.map((s, i) => (
                    <div key={s.email} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 16px', borderTop: i ? `1px solid ${C.line}` : 'none', fontSize: 13 }}>
                      <span>{s.email}</span>
                      <span style={{ color: C.dim, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {s.reason}{s.campaign ? ` · ${s.campaign}` : ''} · {new Date(s.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

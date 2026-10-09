'use client'
// Admin — SET DROPS (migration 155). Set up a temporary set, take deposits,
// then press GO (build it) or CANCEL. Spec: MK_Set_Drops_Spec_2026-10-09_v2.docx.
//
// Every money step (GO, CANCEL, refunds) runs on the server and reports back
// how many deposits it handled and which ones FAILED — this page shows that
// report instead of quietly refreshing, because a refund that didn't happen
// must never look like one that did.

import { useEffect, useMemo, useState } from 'react'
import { shrinkImage } from '@/lib/shrink-image'
import {
  dropTerms, depositFor, depositorRate, dollars, runLabel, fmtInstant, type SetDrop, type DropPledge, type DropProgress,
} from '@/lib/set-drops'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', green: '#7bd88f', red: '#ff8a80', amber: '#f0b44c' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '9px 11px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.5 }
const lbl: React.CSSProperties = { ...small, display: 'block', marginBottom: 5, letterSpacing: '0.04em' }
const btn: React.CSSProperties = { ...small, background: 'transparent', border: `1px solid ${C.line}`, color: C.text, padding: '8px 12px', cursor: 'pointer' }
const solid = (bg: string, fg = '#0b0b0d'): React.CSSProperties => ({ ...btn, background: bg, color: fg, border: 'none', fontWeight: 700, letterSpacing: '0.08em', padding: '10px 16px' })
const h2: React.CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.03em', margin: '0 0 12px' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, padding: 18, marginBottom: 16 }
const opt: React.CSSProperties = { background: '#111', color: C.text }

type Drop = SetDrop & { phase: string; progress: DropProgress; pledges: (DropPledge & { square_payment_id?: string | null; refund_id?: string | null; choice_deadline?: string | null; agreed_terms?: string })[] }
interface SetRow { id: string; slug: string; name: string; is_active: boolean }
interface Report { ok: boolean; done: number; failed: { pledgeId: string; email: string; error: string }[]; notes: string[] }

const PHASE: Record<string, { label: string; color: string }> = {
  draft: { label: 'DRAFT', color: C.dim },
  pre_reserve: { label: 'TAKING DEPOSITS', color: C.accent },
  deciding: { label: 'DEADLINE PASSED — DECIDE', color: C.amber },
  early_access: { label: 'FUNDED · EARLY ACCESS', color: C.green },
  open: { label: 'FUNDED · OPEN', color: C.green },
  ended: { label: 'RUN ENDED', color: C.dim },
  cancelled: { label: 'CANCELLED', color: C.red },
  archived: { label: 'ARCHIVED', color: C.dim },
}
const PLEDGE: Record<string, { label: string; color: string }> = {
  active: { label: 'HELD', color: C.accent },
  credited: { label: 'CREDITED', color: C.green },
  refunded: { label: 'REFUNDED', color: C.dim },
  pending_choice: { label: 'WAITING ON CHOICE', color: C.amber },
  refund_failed: { label: 'REFUND FAILED', color: C.red },
}

// Central wall-clock <-> instant, for the deadline field.
function centralOffsetFor(day: string): string {
  const noon = new Date(`${day}T12:00:00Z`)
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'shortOffset' }).formatToParts(noon).find(p => p.type === 'timeZoneName')?.value || 'GMT-6'
  const h = Number(off.replace('GMT', '')) || -6
  return `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`
}
const toCentralLocal = (iso: string | null) => {
  if (!iso) return ''
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}
const fromCentralLocal = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00${centralOffsetFor(v.slice(0, 10))}` : null)

export default function SetDropsAdmin() {
  const [drops, setDrops] = useState<Drop[]>([])
  const [sets, setSets] = useState<SetRow[]>([])
  const [calls, setCalls] = useState<{ id: string; slug: string; title: string }[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [draft, setDraft] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [confirm, setConfirm] = useState<null | 'go' | 'cancel' | 'archive' | 'open'>(null)
  const [cancelAs, setCancelAs] = useState<'refund' | 'credit' | 'choice'>('refund')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [uploadingPast, setUploadingPast] = useState('')

  const load = async () => {
    const r = await fetch('/api/admin/drops', { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(d.error || 'Could not load Set Drops. Has migration 155 been run?'); setLoading(false); return }
    setDrops(d.drops ?? []); setSets(d.sets ?? []); setCalls(d.openCalls ?? [])
    setSel(s => s ?? d.drops?.[0]?.id ?? null)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const drop = drops.find(d => d.id === sel) ?? null
  useEffect(() => { setDraft({}); setReport(null); setConfirm(null) }, [sel])

  // The form shows the saved drop with any unsaved edits on top.
  const v = useMemo(() => ({ ...(drop ?? {}), ...draft }) as Drop, [drop, draft])
  const set = (k: string, val: any) => setDraft(d => ({ ...d, [k]: val }))
  const dirty = Object.keys(draft).length > 0
  const locked = !!drop && drop.pledges.some(p => p.status !== 'refunded')

  const create = async () => {
    if (!newName.trim()) return
    const r = await fetch('/api/admin/drops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(d.error || 'Could not create.'); return }
    setNewName(''); setMsg(null); setSel(d.drop.id); await load()
  }

  const save = async () => {
    if (!drop || !dirty) return
    setSaving(true)
    const r = await fetch(`/api/admin/drops/${drop.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
    const d = await r.json().catch(() => ({}))
    setSaving(false)
    if (!r.ok) { setMsg(d.error || 'Not saved.'); return }
    setMsg(d.warning ?? null); setDraft({}); await load()
  }

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!drop) return
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/admin/drops/${drop.id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false); setConfirm(null)
    if ('done' in d || 'failed' in d) setReport(d as Report)
    else if (!r.ok || d.ok === false) setMsg(d.error || 'That didn’t work.')
    await load()
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of Array.from(files).slice(0, 8)) {
        const blob = f.type.startsWith('image/') ? await shrinkImage(f, 2000, 0.86) : f
        fd.append('files', blob, f.name)
      }
      const r = await fetch('/api/admin/sets/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Upload failed')
      const urls: string[] = d.urls ?? []
      if (!v.hero_url && urls[0]) set('hero_url', urls[0])
      set('gallery', [...(v.gallery ?? []), ...urls].slice(0, 12))
    } catch (e: any) { setMsg(e.message) }
    setUploading(false)
  }

  // A video NEVER goes in the gallery (that renders <img>) — it has its own field.
  // ⚠️ 4.5 MB is the ceiling for any upload through a Vercel function; bigger
  // files fail with no useful error, so refuse them here with one.
  const uploadVideo = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    if (f.size > 4.4 * 1024 * 1024) { setMsg(`That video is ${(f.size / 1048576).toFixed(1)} MB — uploads top out around 4.4 MB. Export a shorter or smaller H.264 MP4 (about 810×1440 is plenty for a phone).`); return }
    setUploadingVideo(true)
    try {
      const fd = new FormData()
      fd.append('files', f, f.name)
      const r = await fetch('/api/admin/sets/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.urls?.[0]) throw new Error(d.error || 'Upload failed')
      set('video_url', d.urls[0]); setMsg(null)
    } catch (e: any) { setMsg(e.message) }
    setUploadingVideo(false)
  }

  // "Shot here" photos from past years: one request per photo, resized first,
  // so a big batch never hits the 4.5 MB per-request upload ceiling.
  const uploadPast = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).slice(0, 40)
    const added: { url: string; credit: string | null }[] = []
    try {
      for (let i = 0; i < list.length; i++) {
        setUploadingPast(`UPLOADING ${i + 1}/${list.length}…`)
        const fd = new FormData()
        fd.append('files', await shrinkImage(list[i], 2000, 0.86), list[i].name)
        const r = await fetch('/api/admin/sets/upload', { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d.urls?.[0]) throw new Error(d.error || `Upload failed on ${list[i].name}`)
        added.push({ url: d.urls[0], credit: null })
      }
    } catch (e: any) { setMsg(e.message) }
    if (added.length) set('past_gallery', [...(v.past_gallery ?? []), ...added])
    setUploadingPast('')
  }
  const setPast = (i: number, patch: Partial<{ url: string; credit: string | null }>) =>
    set('past_gallery', (v.past_gallery ?? []).map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const movePast = (i: number, dir: -1 | 1) => {
    const arr = [...(v.past_gallery ?? [])]
    const j = i + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    set('past_gallery', arr)
  }

  if (unauth) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Admin sign-in required.</main>
  if (loading) return <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: 40 }}>Loading…</main>

  const ph = drop ? PHASE[drop.phase] ?? PHASE.draft : null
  const terms = drop ? dropTerms(v, 1) : null
  const dr = drop ? depositorRate(v) : null
  const pendingChoice = drop?.pledges.filter(p => p.status === 'pending_choice').length ?? 0

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px clamp(16px, 3vw, 40px) 80px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.03em', margin: 0 }}>SET DROPS</h1>
        <span style={small}>Pre-reserve a temporary set before you build it.</span>
      </div>

      {msg && <div style={{ ...small, color: C.red, border: `1px solid ${C.red}55`, padding: '10px 12px', margin: '12px 0' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 22px' }}>
        {drops.map(d => (
          <button key={d.id} onClick={() => setSel(d.id)} style={{ ...btn, borderColor: d.id === sel ? C.accent : C.line, color: d.id === sel ? C.accent : C.text }}>
            {d.name} <span style={{ color: (PHASE[d.phase] ?? PHASE.draft).color, marginLeft: 6, fontSize: 10 }}>● {(PHASE[d.phase] ?? PHASE.draft).label}</span>
          </button>
        ))}
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="New drop name, e.g. Winter Is Coming" style={{ ...inp, width: 260 }} />
          <button onClick={create} style={solid(C.accent)}>+ NEW DROP</button>
        </span>
      </div>

      {!drop && <div style={small}>No drops yet. Name one above to start.</div>}

      {drop && ph && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0, maxWidth: 1100 }}>
          {/* ── Status + numbers ─────────────────────────────────── */}
          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <div style={{ ...small, color: ph.color, fontWeight: 700, letterSpacing: '0.12em' }}>● {ph.label}</div>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28, marginTop: 4 }}>{drop.name}</div>
                <div style={small}>{runLabel(drop)}{drop.pre_reserve_ends_at ? ` · reservations close ${fmtInstant(drop.pre_reserve_ends_at)}` : ''}</div>
              </div>
              <a href={`/drops/${drop.slug}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>{drop.status === 'draft' ? 'PREVIEW PAGE ↗' : 'VIEW PUBLIC PAGE ↗'}</a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 18 }}>
              {[
                ['RESERVATIONS', String(drop.progress.people)],
                ['HOURS PLEDGED', String(drop.progress.hours)],
                ['PROJECTED', `$${drop.progress.dollars.toLocaleString()}`],
                ['DEPOSITS HELD', dollars(drop.progress.depositsCents)],
              ].map(([k, val]) => (
                <div key={k} style={{ border: `1px solid ${C.line}`, padding: '10px 12px' }}>
                  <div style={{ ...small, fontSize: 10, letterSpacing: '0.12em' }}>{k}</div>
                  <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 26 }}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ ...small, marginBottom: 6 }}>GOAL ({drop.goal_type}) — {drop.progress.label}{drop.show_goal ? '' : ' · hidden from customers'}</div>
              <div style={{ height: 8, background: '#222' }}><div style={{ height: 8, width: `${drop.progress.pct}%`, background: C.accent }} /></div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              {drop.status === 'draft' && <button disabled={busy || dirty} onClick={() => setConfirm('open')} style={solid(C.accent)}>OPEN RESERVATIONS</button>}
              {drop.status === 'pre_reserve' && <>
                <button disabled={busy || dirty} onClick={() => setConfirm('go')} style={solid(C.green)}>GO — BUILD IT</button>
                <button disabled={busy || dirty} onClick={() => { setCancelAs(drop.cancel_policy === 'decide_later' ? 'refund' : drop.cancel_policy as any); setConfirm('cancel') }} style={solid(C.red)}>CANCEL DROP</button>
              </>}
              {(drop.status === 'funded' || drop.status === 'cancelled') && drop.pledges.some(p => p.status === 'active') && <button disabled={busy} onClick={() => act('process_remaining')} style={solid(C.amber)}>FINISH {drop.pledges.filter(p => p.status === 'active').length} UNSETTLED DEPOSIT{drop.pledges.filter(p => p.status === 'active').length === 1 ? '' : 'S'}</button>}
              {(drop.status === 'funded' || drop.status === 'cancelled') && <button disabled={busy} onClick={() => setConfirm('archive')} style={btn}>ARCHIVE (switch the set off)</button>}
              {dirty && <span style={{ ...small, color: C.amber, alignSelf: 'center' }}>Save your changes first.</span>}
            </div>

            {confirm && (
              <div style={{ marginTop: 14, border: `1px solid ${C.amber}66`, padding: 14 }}>
                {confirm === 'open' && <p style={{ ...small, color: C.text, margin: 0 }}>Opens <b>/drops/{drop.slug}</b> to the public and starts taking deposits. Customers will be shown the promise below — after the first deposit it can only change in their favour.</p>}
                {confirm === 'go' && <p style={{ ...small, color: C.text, margin: 0 }}>Builds it: {drop.progress.people} deposit{drop.progress.people === 1 ? '' : 's'} become studio credit{drop.bonus_credit_cents ? ` (+${dollars(drop.bonus_credit_cents)} bonus each)` : ''}, everyone is emailed and texted, the set switches on{drop.perk_early_access ? ` with ${drop.early_access_hours}h early access for depositors` : ''}{drop.replaces_set_id ? `, and ${sets.find(s => s.id === drop.replaces_set_id)?.name ?? 'the replaced room'} is blocked for the run` : ''}.</p>}
                {confirm === 'archive' && <p style={{ ...small, color: C.text, margin: 0 }}>Switches the set off. Bookings and history stay. Do this after the run.</p>}
                {confirm === 'cancel' && <div>
                  <p style={{ ...small, color: C.text, margin: '0 0 10px' }}>Cancels the drop and handles every deposit. Customers were promised: <i>{dropTerms(drop, 1).ifCancelled}</i></p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(drop.cancel_policy === 'decide_later' ? ['refund', 'credit', 'choice'] : [drop.cancel_policy]).map(o => (
                      <button key={o} onClick={() => setCancelAs(o as any)} style={{ ...btn, borderColor: cancelAs === o ? C.accent : C.line, color: cancelAs === o ? C.accent : C.text }}>
                        {o === 'refund' ? 'REFUND EVERYONE' : o === 'credit' ? 'STUDIO CREDIT' : 'LET EACH PERSON CHOOSE'}
                      </button>
                    ))}
                  </div>
                </div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button disabled={busy} onClick={() => act(confirm, confirm === 'cancel' ? { resolution: cancelAs } : {})} style={solid(confirm === 'cancel' ? C.red : C.green)}>{busy ? 'WORKING…' : 'CONFIRM'}</button>
                  <button disabled={busy} onClick={() => setConfirm(null)} style={btn}>NEVER MIND</button>
                </div>
              </div>
            )}

            {report && (
              <div style={{ marginTop: 14, border: `1px solid ${(report.failed?.length ? C.red : C.green)}66`, padding: 14 }}>
                <div style={{ ...small, color: report.failed?.length ? C.red : C.green, fontWeight: 700 }}>
                  {report.done} deposit{report.done === 1 ? '' : 's'} handled{report.failed?.length ? ` · ${report.failed.length} FAILED` : ''}
                </div>
                {report.notes?.map((n, i) => <div key={i} style={{ ...small, color: C.text, marginTop: 6 }}>{n}</div>)}
                {report.failed?.map(f => <div key={f.pledgeId} style={{ ...small, color: C.red, marginTop: 6 }}>{f.email}: {f.error}</div>)}
              </div>
            )}
          </section>

          {/* ── Depositors ────────────────────────────────────────── */}
          <section style={card}>
            <div style={h2}>DEPOSITS ({drop.pledges.length})</div>
            {drop.pledges.some((p: any) => p.plans_minis && p.status !== 'refunded') && <div style={{ ...small, color: C.accent, marginBottom: 8 }}>{drop.pledges.filter((p: any) => p.plans_minis && p.status !== 'refunded').length} planning mini sessions — usually a multi-hour booking each.</div>}
            {pendingChoice > 0 && <div style={{ ...small, color: C.amber, marginBottom: 8 }}>{pendingChoice} waiting on a refund-or-credit choice. Anyone who hasn’t chosen after 7 days is refunded automatically each morning.</div>}
            {drop.pledges.length === 0 ? <div style={small}>No deposits yet.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', ...small }}>
                  <thead><tr style={{ textAlign: 'left' }}>{['WHO', 'HOURS', 'WHEN', 'DEPOSIT', 'STATUS', 'PAID', ''].map(h => <th key={h} style={{ padding: '6px 8px', borderBottom: `1px solid ${C.line}`, fontWeight: 600, fontSize: 10, letterSpacing: '0.1em' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {drop.pledges.map(p => {
                      const st = PLEDGE[p.status] ?? PLEDGE.active
                      return (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                          <td style={{ padding: '8px', color: C.text }}>{p.customer_name || '—'}{p.plans_minis && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: C.accent, border: `1px solid ${C.accent}`, padding: '1px 5px' }}>MINIS</span>}<div style={{ fontSize: 11 }}>{p.customer_email}{p.phone ? ` · ${p.phone}` : ''}</div></td>
                          <td style={{ padding: '8px' }}>{p.hours_wanted ?? '—'}</td>
                          <td style={{ padding: '8px', maxWidth: 220 }}>{p.timing_note || '—'}</td>
                          <td style={{ padding: '8px', color: C.text }}>{dollars(p.deposit_cents)}{p.credit_cents_issued > p.deposit_cents ? <div style={{ fontSize: 11 }}>→ {dollars(p.credit_cents_issued)} credit</div> : null}</td>
                          <td style={{ padding: '8px', color: st.color, fontWeight: 600 }}>{st.label}</td>
                          <td style={{ padding: '8px' }}>{new Date(p.created_at).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                            {p.status === 'refund_failed' && <button disabled={busy} onClick={() => act('retry_refund', { pledgeId: p.id })} style={btn}>RETRY REFUND</button>}
                            {p.status === 'pending_choice' && <>
                              <button disabled={busy} onClick={() => act('resolve', { pledgeId: p.id, choice: 'refund' })} style={btn}>REFUND</button>{' '}
                              <button disabled={busy} onClick={() => act('resolve', { pledgeId: p.id, choice: 'credit' })} style={btn}>CREDIT</button>
                            </>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Settings ──────────────────────────────────────────── */}
          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <div style={h2}>SETTINGS</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {dirty && <button onClick={() => setDraft({})} style={btn}>DISCARD</button>}
                <button disabled={!dirty || saving} onClick={save} style={{ ...solid(C.accent), opacity: dirty ? 1 : 0.4 }}>{saving ? 'SAVING…' : 'SAVE'}</button>
              </div>
            </div>
            {locked && <div style={{ ...small, color: C.amber, marginBottom: 12 }}>People have paid deposits, so the deposit is locked and the promise can only change in their favour (refund over credit, better perks).</div>}

            <Group title="Basics">
              <Field label="Name"><input value={v.name ?? ''} onChange={e => set('name', e.target.value)} style={inp} /></Field>
              <Field label={`Link — /drops/${v.slug ?? ''}`}><input value={v.slug ?? ''} disabled={drop.status !== 'draft'} onChange={e => set('slug', e.target.value)} style={inp} /></Field>
              <Field label="Tagline (one line)" wide><input value={v.tagline ?? ''} onChange={e => set('tagline', e.target.value)} style={inp} /></Field>
              <Field label="Description" wide><textarea rows={4} value={v.description ?? ''} onChange={e => set('description', e.target.value)} style={{ ...inp, resize: 'vertical' }} /></Field>
              <Field label="Images (first = cover)" wide>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[v.hero_url, ...(v.gallery ?? []).filter(u => u !== v.hero_url)].filter(Boolean).map((u, i) => (
                    <div key={u as string} style={{ position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u as string} alt="" style={{ width: 90, height: 90, objectFit: 'cover', border: i === 0 ? `2px solid ${C.accent}` : `1px solid ${C.line}` }} />
                      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                        {i > 0 && <button onClick={() => set('hero_url', u)} style={{ ...btn, padding: '2px 5px', fontSize: 10 }}>COVER</button>}
                        <button onClick={() => { if (u === v.hero_url) set('hero_url', (v.gallery ?? []).find(g => g !== u) ?? null); set('gallery', (v.gallery ?? []).filter(g => g !== u)) }} style={{ ...btn, padding: '2px 5px', fontSize: 10 }}>✕</button>
                      </div>
                    </div>
                  ))}
                  <label style={{ ...btn, display: 'inline-block' }}>{uploading ? 'UPLOADING…' : '+ ADD IMAGES'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => upload(e.target.files)} /></label>
                </div>
                <div style={{ ...small, marginTop: 6 }}>Mood board, render or sketch — whatever sells the idea. Images are resized before upload.</div>
              </Field>
              <Field label="Video (optional)" wide>
                {v.video_url ? (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <video src={v.video_url} muted playsInline controls preload="metadata" style={{ width: 120, height: 160, objectFit: 'cover', background: '#000' }} />
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Toggle on={!!v.video_hero} onChange={b => set('video_hero', b)} />
                        <span style={small}>{v.video_hero ? 'Plays behind the title at the top of the page (cover image shows while it loads).' : 'Shows as its own block under the description.'}</span>
                      </div>
                      <button onClick={() => { set('video_url', null); set('video_hero', false) }} style={{ ...btn, color: C.red, justifySelf: 'start' }}>REMOVE VIDEO</button>
                    </div>
                  </div>
                ) : (
                  <label style={{ ...btn, display: 'inline-block' }}>{uploadingVideo ? 'UPLOADING…' : '+ ADD VIDEO'}<input type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={e => { uploadVideo(e.target.files); e.target.value = '' }} /></label>
                )}
                <div style={{ ...small, marginTop: 6 }}>H.264 MP4 under 4.4 MB. It plays muted with a sound button. ⚠️ Other video formats can look fine in Chrome and show nothing on iPhones.</div>
              </Field>
            </Group>

            <Group title="Shot here — past years">
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ ...small, marginBottom: 10 }}>Photos customers made on this set before, shown as their own gallery with a credit under each. ⚠️ Only work you have permission to post — the photographer is the main credit.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
                  {(v.past_gallery ?? []).map((p, i) => (
                    <div key={p.url} style={{ border: `1px solid ${C.line}`, padding: 6 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', display: 'block' }} />
                      <input value={p.credit ?? ''} onChange={e => setPast(i, { credit: e.target.value || null })} placeholder="Photo: Name @handle" style={{ ...inp, marginTop: 6, padding: '6px 8px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button onClick={() => movePast(i, -1)} style={{ ...btn, padding: '2px 7px', fontSize: 11 }}>←</button>
                        <button onClick={() => movePast(i, 1)} style={{ ...btn, padding: '2px 7px', fontSize: 11 }}>→</button>
                        <button onClick={() => set('past_gallery', (v.past_gallery ?? []).filter((_, k) => k !== i))} style={{ ...btn, padding: '2px 7px', fontSize: 11, color: C.red, marginLeft: 'auto' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <label style={{ ...btn, display: 'inline-block', marginTop: 10 }}>{uploadingPast || '+ ADD PHOTOS'}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { uploadPast(e.target.files); e.target.value = '' }} /></label>
                <span style={{ ...small, marginLeft: 10 }}>Up to 40 at a time, resized before upload. Press SAVE when done.</span>
              </div>
            </Group>

            <Group title="Dates (Central)">
              <Field label="Reservations close"><input type="datetime-local" value={toCentralLocal(v.pre_reserve_ends_at)} onChange={e => set('pre_reserve_ends_at', fromCentralLocal(e.target.value))} style={inp} /></Field>
              <Field label="Run starts"><input type="date" value={v.run_starts ?? ''} onChange={e => set('run_starts', e.target.value || null)} style={inp} /></Field>
              <Field label="Run ends (last bookable day)"><input type="date" value={v.run_ends ?? ''} onChange={e => set('run_ends', e.target.value || null)} style={inp} /></Field>
            </Group>

            <Group title="Room">
              <Field label="Replaces an existing room for the run? (optional)" wide>
                <select value={v.replaces_set_id ?? ''} onChange={e => set('replaces_set_id', e.target.value || null)} style={inp}>
                  <option value="" style={opt}>No — it’s its own space</option>
                  {sets.filter(s => s.id !== drop.set_id && s.is_active).map(s => <option key={s.id} value={s.id} style={opt}>{s.name}</option>)}
                </select>
                <div style={{ ...small, marginTop: 6 }}>On GO, that room is blocked for the run dates (Holidays & Closures), so it can’t be double-booked. Existing bookings are flagged, never cancelled.</div>
              </Field>
            </Group>

            <Group title="Rates — the drop’s own set">
              <Field label="Member rate ($/hr)"><input type="number" min={0} step={1} value={v.rate_per_hour ?? ''} onChange={e => set('rate_per_hour', Number(e.target.value))} style={inp} /></Field>
              <Field label="Minimum hours"><input type="number" min={1} step={0.5} value={v.min_hours ?? ''} onChange={e => set('min_hours', Number(e.target.value))} style={inp} /></Field>
              <Field label="Capacity (people)"><input type="number" min={1} step={1} value={v.capacity ?? ''} onChange={e => set('capacity', Number(e.target.value))} style={inp} /></Field>
              <div style={{ ...small, gridColumn: '1 / -1' }}>Guests who aren’t signed in pay the usual guest surcharge on top, same as every set.</div>
            </Group>

            <Group title="Deposit">
              <Field label="Type">
                <select disabled={locked} value={v.deposit_mode} onChange={e => set('deposit_mode', e.target.value)} style={inp}>
                  <option value="flat" style={opt}>Flat — one amount per person</option>
                  <option value="per_hour" style={opt}>Per hour they pledge</option>
                </select>
              </Field>
              <Field label={v.deposit_mode === 'per_hour' ? 'Deposit per hour ($)' : 'Deposit ($)'}><input disabled={locked} type="number" min={0} step={1} value={(Number(v.deposit_cents) || 0) / 100} onChange={e => set('deposit_cents', Math.round(Number(e.target.value) * 100))} style={inp} /></Field>
              <Field label="Max hours per pledge"><input type="number" min={1} step={0.5} value={v.max_hours_per_pledge ?? ''} onChange={e => set('max_hours_per_pledge', Number(e.target.value))} style={inp} /></Field>
            </Group>

            <Group title="Goal">
              <Field label="Count">
                <select value={v.goal_type} onChange={e => set('goal_type', e.target.value)} style={inp}>
                  <option value="people" style={opt}>Bookings (one per reservation)</option>
                  <option value="hours" style={opt}>Hours</option>
                  <option value="dollars" style={opt}>Dollars (hours × rate)</option>
                </select>
              </Field>
              <Field label={v.goal_type === 'dollars' ? 'Goal ($)' : v.goal_type === 'hours' ? 'Goal (hours)' : 'Goal (bookings)'}><input type="number" min={1} step={1} value={v.goal_value ?? ''} onChange={e => set('goal_value', Number(e.target.value))} style={inp} /></Field>
              <Field label="Show the goal to customers"><Toggle on={!!v.show_goal} onChange={b => set('show_goal', b)} /></Field>
              {v.goal_type !== 'people' && v.deposit_mode === 'flat' && <div style={{ ...small, color: C.amber, gridColumn: '1 / -1' }}>With a flat deposit, an hours or dollars goal is easy to inflate — the max-hours cap above is what keeps it honest.</div>}
            </Group>

            <Group title="Perks for people who reserve">
              <Field label="Early access"><Toggle on={!!v.perk_early_access} onChange={b => set('perk_early_access', b)} /></Field>
              {v.perk_early_access && <Field label="Early access length (hours)"><input type="number" min={1} step={1} value={v.early_access_hours ?? ''} onChange={e => set('early_access_hours', Number(e.target.value))} style={inp} /></Field>}
              <div />
              <Field label="Depositor rate"><Toggle on={!!v.perk_discount} onChange={b => set('perk_discount', b)} /></Field>
              {v.perk_discount && <>
                <Field label="Kind">
                  <select value={v.discount_kind} onChange={e => set('discount_kind', e.target.value)} style={inp}>
                    <option value="percent" style={opt}>% off the member rate</option>
                    <option value="fixed_rate" style={opt}>A fixed lower hourly rate</option>
                  </select>
                </Field>
                <Field label={v.discount_kind === 'percent' ? '% off' : 'Their rate ($/hr)'}><input type="number" min={0} step={1} value={v.discount_value ?? ''} onChange={e => set('discount_value', Number(e.target.value))} style={inp} /></Field>
                <Field label="Covers">
                  <select value={v.discount_scope} onChange={e => set('discount_scope', e.target.value)} style={inp}>
                    <option value="all" style={opt}>All their bookings during the run</option>
                    <option value="pledged_hours" style={opt}>Up to the hours they pledged</option>
                  </select>
                </Field>
                <div style={{ ...small, gridColumn: '1 / -1', color: dr == null ? C.red : C.dim }}>{dr == null ? 'That discount doesn’t lower the rate — check the numbers.' : `Depositors pay $${dr}/hr instead of $${v.rate_per_hour}.`}</div>
              </>}
              <Field label="Bonus credit on GO ($, 0 = off)"><input type="number" min={0} step={1} value={(Number(v.bonus_credit_cents) || 0) / 100} onChange={e => set('bonus_credit_cents', Math.round(Number(e.target.value) * 100))} style={inp} /></Field>
            </Group>

            <Group title="If it doesn’t happen">
              <Field label="Deposits become" wide>
                <select value={v.cancel_policy} onChange={e => set('cancel_policy', e.target.value)} style={inp}>
                  <option value="refund" style={opt}>A refund to their card</option>
                  <option value="choice" style={opt}>Their choice: refund or studio credit</option>
                  <option value="decide_later" style={opt}>Refund or credit — I’ll decide when I cancel</option>
                  <option value="credit" style={opt}>Studio credit only</option>
                </select>
              </Field>
            </Group>

            <Group title="Open call">
              <Field label="Linked open call (optional)" wide>
                <select value={v.open_call_id ?? ''} onChange={e => set('open_call_id', e.target.value || null)} style={inp}>
                  <option value="" style={opt}>None</option>
                  {calls.map(c => <option key={c.id} value={c.id} style={opt}>{c.title}</option>)}
                </select>
                <div style={{ ...small, marginTop: 6 }}>Create the call in Open Calls first; its page and this drop’s page will link to each other.</div>
              </Field>
            </Group>

            {terms && (
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14, marginTop: 8 }}>
                <div style={{ ...small, letterSpacing: '0.12em', fontSize: 10, marginBottom: 8 }}>WHAT CUSTOMERS AGREE TO (generated from these settings — 1-hour pledge shown, deposit {dollars(depositFor(v, 1))})</div>
                {[terms.ifFunded, terms.ifCancelled, terms.balance].map((t, i) => <p key={i} style={{ ...small, color: C.text, margin: '0 0 6px' }}>{t}</p>)}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...small, color: C.accent, letterSpacing: '0.12em', fontSize: 11, fontWeight: 600, marginBottom: 10 }}>{title.toUpperCase()}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>{children}</div>
    </div>
  )
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label style={{ display: 'block', gridColumn: wide ? '1 / -1' : undefined }}><span style={lbl}>{label}</span>{children}</label>
}
function Toggle({ on, onChange }: { on: boolean; onChange: (b: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} style={{ ...btn, borderColor: on ? C.green : C.line, color: on ? C.green : C.dim, minWidth: 70 }}>
      {on ? 'ON' : 'OFF'}
    </button>
  )
}

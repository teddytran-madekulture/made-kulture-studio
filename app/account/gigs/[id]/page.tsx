'use client'
// /account/gigs/<id> — one gig.
//   Members: details, APPLY (a short note; their profile goes with it), REPORT,
//            and for studio-posted gigs, the private thread with the company.
//   Poster:  status, applicants (each opens the DM), mark filled / close, edit
//            while pending or declined.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { gigDateLabel, GIG_STATUS_LABEL, GIG_SAFETY_LINE, GIG_REPORT_LABEL, GIG_REPORT_REASONS, type GigStatus } from '@/lib/gigs'

type Gig = {
  id: string; posted_by: 'member' | 'studio'; company_name: string; title: string; description: string | null
  roles_needed: string[]; pay: string; gig_date: string | null; date_note: string | null; location: string | null
  at_studio: boolean; apply_by: string | null; status: GigStatus; expires_at: string | null; decline_reason?: string | null
}
type Applicant = { id: string; applicant_id: string; note: string | null; conversation_id: string | null; created_at: string; isNew: boolean; name: string; avatar_url: string | null; roles: string[] }
type Msg = { sender: 'company' | 'member'; body: string; created_at: string }

const muted = (a: number) => `rgba(var(--t-fg-rgb), calc(${a} * var(--t-a)))`
const card: React.CSSProperties = { background: 'var(--t-surface)', border: `1px solid ${muted(0.08)}`, borderRadius: 8, padding: '18px 20px' }
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function GigDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [gig, setGig] = useState<Gig | null>(null)
  const [poster, setPoster] = useState<{ id: string; name: string; avatar_url: string | null } | null>(null)
  const [isPoster, setIsPoster] = useState(false)
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [application, setApplication] = useState<{ id: string; note: string; conversation_id: string | null; created_at: string } | null>(null)
  const [thread, setThread] = useState<Msg[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [justPosted, setJustPosted] = useState(false)
  const [reported, setReported] = useState(false)

  const load = () => fetch(`/api/gigs/${id}`, { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error || 'Could not load this gig.'); setLoading(false); return }
    setError(''); setGig(d.gig); setPoster(d.poster); setIsPoster(!!d.isPoster)
    setApplicants(d.applicants ?? []); setApplication(d.application ?? null); setThread(d.thread ?? [])
    setLoading(false)
  }).catch(() => { setError('Could not load this gig.'); setLoading(false) })

  useEffect(() => {
    load()
    try { setJustPosted(new URLSearchParams(window.location.search).get('posted') === '1') } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const post = async (url: string, body: any, method = 'POST') => {
    setBusy(true); setMsg('')
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(d.error || 'That did not work.'); return null }
    return d
  }

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.4) }}>Loading…</div>
  if (error || !gig) return (
    <div>
      <Link href="/account/gigs" style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.5), textDecoration: 'none' }}>← Gigs</Link>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.6), marginTop: 16 }}>{error || 'This gig is no longer up.'}</p>
    </div>
  )

  const when = [gigDateLabel(gig.gig_date), gig.date_note].filter(Boolean).join(' · ')
  const live = gig.status === 'live' && (!gig.expires_at || new Date(gig.expires_at) > new Date())
  const input: React.CSSProperties = { width: '100%', background: 'var(--t-bg, transparent)', border: `1px solid ${muted(0.15)}`, borderRadius: 6, padding: '12px 14px', fontFamily: 'Inter', fontSize: 16, color: 'var(--t-fg)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }
  const btn = (primary = true): React.CSSProperties => ({ background: primary ? 'var(--t-fg)' : 'transparent', color: primary ? 'var(--t-on-fg)' : muted(0.7), border: primary ? 'none' : `1px solid ${muted(0.2)}`, borderRadius: 6, padding: '11px 18px', fontFamily: 'Inter', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 })
  const row = (k: string, v: string) => v ? (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${muted(0.06)}` }}>
      <div style={{ width: 92, flexShrink: 0, fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: muted(0.4), paddingTop: 2 }}>{k}</div>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)' }}>{v}</div>
    </div>
  ) : null

  return (
    <div style={{ maxWidth: 680 }}>
      <Link href={isPoster ? '/account/gigs?mine=1' : '/account/gigs'} style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.5), textDecoration: 'none' }}>← Gigs</Link>

      {isPoster && (justPosted && gig.status === 'pending' ? (
        <div style={{ ...card, marginTop: 14, borderColor: 'rgba(var(--t-gold-rgb), 0.35)' }}>
          <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-gold)', fontWeight: 600 }}>Sent for approval</div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.6), marginTop: 4 }}>We’ll take a look and let you know when it’s live. Members are alerted the moment it’s approved.</div>
        </div>
      ) : gig.status !== 'live' && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: gig.status === 'declined' || gig.status === 'pulled' ? 'var(--t-err)' : muted(0.7), fontWeight: 600 }}>{GIG_STATUS_LABEL[gig.status]}</div>
          {gig.decline_reason && <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.6), marginTop: 4 }}>Reason: {gig.decline_reason}</div>}
        </div>
      ))}

      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '16px 0 6px', lineHeight: 1.1 }}>{gig.title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {poster ? (
          <Link href={`/account/directory/${poster.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', display: 'inline-block' }}>
              {poster.avatar_url && <img src={poster.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </span>
            <span style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.75) }}>{gig.company_name}</span>
          </Link>
        ) : (
          <span style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.75) }}>{gig.company_name} <span style={{ color: muted(0.4) }}>· posted by Made Kulture</span></span>
        )}
      </div>

      <div style={card}>
        {row('PAY', gig.pay)}
        {row('WHEN', when)}
        {row('WHERE', [gig.location, gig.at_studio ? 'at Made Kulture' : ''].filter(Boolean).join(' · '))}
        {row('HIRING', gig.roles_needed.join(', '))}
        {row('APPLY BY', gigDateLabel(gig.apply_by))}
        {gig.description && <p style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.8), lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '14px 0 0' }}>{gig.description}</p>}
      </div>
      <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--t-gold)', margin: '12px 0 0', lineHeight: 1.5 }}>{GIG_SAFETY_LINE}</p>

      {msg && <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginTop: 14 }}>{msg}</div>}

      {/* ── Poster view ─────────────────────────────────────────── */}
      {isPoster && (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            {(gig.status === 'pending' || gig.status === 'declined') && <Link href={`/account/gigs/new?edit=${gig.id}`} style={{ ...btn(false), textDecoration: 'none' }}>Edit</Link>}
            {['pending', 'live', 'pulled'].includes(gig.status) && <>
              {gig.status === 'live' && <button type="button" disabled={busy} style={btn()} onClick={async () => { if (await post(`/api/gigs/${gig.id}`, { action: 'filled' }, 'PATCH')) load() }}>Mark filled</button>}
              <button type="button" disabled={busy} style={btn(false)} onClick={async () => { if (confirm('Close this gig? It comes off the board.') && await post(`/api/gigs/${gig.id}`, { action: 'close' }, 'PATCH')) load() }}>Close</button>
            </>}
          </div>
          <h2 id="applicants" style={{ fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.1em', color: muted(0.45), margin: '30px 0 10px' }}>APPLICANTS ({applicants.length})</h2>
          {applicants.length === 0 ? (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.45) }}>{gig.status === 'live' ? 'No applicants yet.' : 'Applicants show up here once the gig is live.'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {applicants.map(a => (
                <div key={a.id} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <Link href={`/account/directory/${a.applicant_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', display: 'inline-block', flexShrink: 0 }}>
                        {a.avatar_url && <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </span>
                      <span>
                        <span style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'var(--t-fg)' }}>{a.name}</span>
                        {a.isNew && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--t-gold)' }}>NEW</span>}
                        <span style={{ display: 'block', fontFamily: 'Inter', fontSize: 12, color: muted(0.5) }}>{a.roles.join(' · ')}</span>
                      </span>
                    </Link>
                    {a.conversation_id && <Link href={`/account/messages/${a.conversation_id}`} style={{ ...btn(false), textDecoration: 'none', padding: '8px 14px' }}>Message</Link>}
                  </div>
                  {a.note && <p style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.75), lineHeight: 1.55, whiteSpace: 'pre-wrap', margin: '12px 0 0' }}>{a.note}</p>}
                  <div style={{ fontFamily: 'Inter', fontSize: 11, color: muted(0.35), marginTop: 8 }}>Applied {fmtTime(a.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Member view ─────────────────────────────────────────── */}
      {!isPoster && (
        <>
          {application ? (
            <div style={{ ...card, marginTop: 18, borderColor: 'rgba(var(--t-gold-rgb), 0.3)' }}>
              <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'var(--t-gold)' }}>You applied · {fmtTime(application.created_at)}</div>
              {application.conversation_id ? (
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.65), marginTop: 6 }}>
                  Your note went to {gig.company_name} in your <Link href={`/account/messages/${application.conversation_id}`} style={{ color: 'var(--t-gold)' }}>messages</Link>. Replies show up there.
                </div>
              ) : (
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted(0.65), marginTop: 6 }}>{gig.company_name} sees your profile and note. Replies show up below, and we’ll let you know. Your email stays private.</div>
              )}
            </div>
          ) : live ? (
            <div style={{ ...card, marginTop: 18 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: muted(0.45), marginBottom: 8 }}>APPLY</div>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} maxLength={1500} placeholder="A few lines on why you’re a fit — relevant work, availability, your rate if it differs." style={input} />
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.45), margin: '8px 0 12px', lineHeight: 1.5 }}>Your profile, portfolio, Instagram and website go with your note. Your email and phone are not shared.</div>
              <button type="button" disabled={busy} style={btn()} onClick={async () => {
                if (note.trim().length < 10) { setMsg('Add a short note about why you’re a fit.'); return }
                if (await post(`/api/gigs/${gig.id}/apply`, { note })) load()
              }}>{busy ? 'Sending…' : 'Apply'}</button>
            </div>
          ) : (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted(0.5), marginTop: 18 }}>This gig is no longer taking applications.</div>
          )}

          {application && gig.posted_by === 'studio' && (
            <div id="thread" style={{ marginTop: 22 }}>
              <h2 style={{ fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.1em', color: muted(0.45), margin: '0 0 10px' }}>CONVERSATION WITH {gig.company_name.toUpperCase()}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {thread.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.sender === 'member' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.sender === 'member' ? 'rgba(var(--t-gold-rgb), 0.12)' : 'var(--t-surface)', border: `1px solid ${muted(0.08)}`, borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</div>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, color: muted(0.4), marginTop: 4 }}>{m.sender === 'member' ? 'You' : gig.company_name} · {fmtTime(m.created_at)}</div>
                  </div>
                ))}
              </div>
              <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} maxLength={2000} placeholder={`Reply to ${gig.company_name}…`} style={{ ...input, marginTop: 12 }} />
              <button type="button" disabled={busy || !reply.trim()} style={{ ...btn(), marginTop: 8 }} onClick={async () => {
                if (await post(`/api/gigs/${gig.id}/thread`, { body: reply })) { setReply(''); load() }
              }}>Send</button>
            </div>
          )}

          <div style={{ marginTop: 34 }}>
            {reported ? (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: muted(0.55) }}>Thanks for flagging it. We’ll take a look.</div>
            ) : !reportOpen ? (
              <button type="button" onClick={() => setReportOpen(true)} style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'Inter', fontSize: 12, color: muted(0.45), cursor: 'pointer', textDecoration: 'underline' }}>Report this gig</button>
            ) : (
              <div style={card}>
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-fg)', marginBottom: 10 }}>What’s wrong with it? Reports are anonymous.</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {GIG_REPORT_REASONS.map(r => (
                    <button key={r} type="button" onClick={() => setReportReason(r)} style={{ background: reportReason === r ? 'var(--t-fg)' : 'transparent', color: reportReason === r ? 'var(--t-on-fg)' : muted(0.7), border: `1px solid ${muted(0.2)}`, borderRadius: 16, padding: '6px 12px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>{GIG_REPORT_LABEL[r]}</button>
                  ))}
                </div>
                <textarea value={reportNote} onChange={e => setReportNote(e.target.value)} rows={2} maxLength={300} placeholder="Anything else? (optional)" style={input} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" disabled={busy || !reportReason} style={btn()} onClick={async () => {
                    if (await post(`/api/gigs/${gig.id}/report`, { reason: reportReason, note: reportNote })) { setReportOpen(false); setMsg(''); setReported(true) }
                  }}>Send report</button>
                  <button type="button" style={btn(false)} onClick={() => setReportOpen(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

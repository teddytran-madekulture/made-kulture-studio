'use client'
import { useState, useEffect } from 'react'

// Time options 9:00AM–9:30PM in 30-min steps (studio hours; last start 9:30PM).
const TIME_OPTS = Array.from({ length: 26 }, (_, i) => 9 + i * 0.5)
function fmt12(h: number) {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  const ampm = hr >= 12 ? 'PM' : 'AM', h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}:${mn} ${ampm}`
}

// Turn an ms-epoch expiry into a short "43m 12s" / "58s" countdown label.
function fmtRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60), s = total % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const card: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '20px 24px', marginBottom: 40 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14 }
const label: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }

interface SetOpt { slug: string; name: string }

export default function ShortNoticeRequest() {
  const [status, setStatus]   = useState<'loading' | 'idle' | 'pending' | 'approved'>('loading')
  const [open, setOpen]       = useState(false)
  const [sets, setSets]       = useState<SetOpt[]>([])
  const [setSlug, setSetSlug] = useState('')
  const [date, setDate]       = useState('')
  const [time, setTime]       = useState('')
  const [note, setNote]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [now, setNow]         = useState(() => 0) // driven by the countdown tick

  useEffect(() => {
    fetch('/api/account/short-notice-request')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setStatus('idle'); return }
        setExpiresAt(typeof d.expiresAt === 'number' ? d.expiresAt : null)
        if (d.canBook) setStatus('approved')
        else if (d.latest?.status === 'pending') setStatus('pending')
        else setStatus('idle')
      })
      .catch(() => setStatus('idle'))
  }, [])

  // Load the set list for the dropdown.
  useEffect(() => {
    fetch('/api/sets')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.sets) setSets(d.sets.map((s: any) => ({ slug: s.slug, name: s.name }))) })
      .catch(() => {})
  }, [])

  // Tick once a second while a timed window is open; flip back to idle at zero.
  useEffect(() => {
    if (status !== 'approved' || !expiresAt) return
    const id = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= expiresAt) { setStatus('idle'); setExpiresAt(null) }
    }, 1000)
    setNow(Date.now())
    return () => clearInterval(id)
  }, [status, expiresAt])

  const canSubmit = !!setSlug && !!date && time !== ''

  const submit = async () => {
    if (!canSubmit) { setErr('Please choose a set, date, and time.'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/account/short-notice-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desiredSet: setSlug, desiredDate: date, desiredStart: Number(time), note: note || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) { setStatus('pending'); setOpen(false) }
      else setErr(d.error || 'Could not send request.')
    } catch { setErr('Could not send request.') }
    finally { setSaving(false) }
  }

  if (status === 'loading') return null

  if (status === 'approved') {
    const remaining = expiresAt ? expiresAt - (now || Date.now()) : null
    return (
      <div style={{ ...card, borderColor: 'rgba(93,202,143,0.3)' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#5dca8f', marginBottom: 4 }}>✓ Short-notice booking is open</div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {remaining != null && remaining > 0
            ? <>You can book inside the 48-hour window right now — but only for the next <strong style={{ color: '#fff' }}>{fmtRemaining(remaining)}</strong>. Head to availability and grab your time before it expires.</>
            : <>You can book inside the 48-hour window right now. Head to availability to grab your time.</>}
        </div>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div style={{ ...card, borderColor: 'rgba(212,168,67,0.3)' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#e6c07a', marginBottom: 4 }}>⏳ Request sent</div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Your short-notice booking request is pending. We&apos;ll text and email you once we&apos;ve reviewed it — if approved, you&apos;ll have a short window to book. An open slot isn&apos;t guaranteed until then.</div>
      </div>
    )
  }

  return (
    <div style={card}>
      {!open ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 2 }}>Need to book inside 48 hours?</div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Tell us the set, date, and time you want. Every request is reviewed by the studio — an open calendar slot isn&apos;t a guarantee until we approve it.</div>
          </div>
          <button onClick={() => setOpen(true)} style={{ flexShrink: 0, background: '#fff', color: '#080808', border: 'none', padding: '11px 18px', cursor: 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}>REQUEST ACCESS</button>
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 16 }}>Request short-notice booking</div>
          <div style={{ marginBottom: 12 }}>
            <span style={label}>SET YOU WANT</span>
            <select value={setSlug} onChange={e => setSetSlug(e.target.value)} style={input}>
              <option value="" style={{ color: '#000' }}>— choose a set —</option>
              {sets.map(s => <option key={s.slug} value={s.slug} style={{ color: '#000' }}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <span style={label}>DATE YOU WANT</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
            </div>
            <div>
              <span style={label}>TIME YOU WANT</span>
              <select value={time} onChange={e => setTime(e.target.value)} style={input}>
                <option value="" style={{ color: '#000' }}>— choose a time —</option>
                {TIME_OPTS.map(t => <option key={t} value={t} style={{ color: '#000' }}>{fmt12(t)}</option>)}
              </select>
            </div>
          </div>
          <span style={label}>NOTE (OPTIONAL)</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the studio should know…" rows={2} style={{ ...input, resize: 'vertical', marginBottom: 14 }} />
          {err && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submit} disabled={saving || !canSubmit} style={{ background: '#d4a843', color: '#080808', border: 'none', padding: '10px 18px', cursor: (saving || !canSubmit) ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', opacity: (saving || !canSubmit) ? 0.5 : 1 }}>{saving ? 'SENDING…' : 'SEND REQUEST'}</button>
            <button onClick={() => setOpen(false)} disabled={saving} style={{ background: 'transparent', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)', padding: '10px 16px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em' }}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  )
}

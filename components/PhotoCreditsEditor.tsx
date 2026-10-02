'use client'
import { useEffect, useRef, useState } from 'react'
import { ROLE_CATEGORIES } from '@/lib/roles'

// Credit the people on one portfolio photo (migration 133). Tag directory
// members (they see it on their profile and can remove themselves), or credit
// someone by name / Instagram and share them an invite link to join.
type Credit = {
  id: string; role: string
  member: { id: string; name: string; avatar_url: string | null } | null
  name: string | null; instagram: string | null; pending: boolean
  inviteUrl: string | null
}
type Found = { id: string; name: string; avatar_url: string | null; roles: string[]; instagram: string | null }

const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--t-surface)', color: 'var(--t-fg)', colorScheme: 'dark',
  border: '1px solid rgba(var(--t-fg-rgb), calc(0.15 * var(--t-a)))', borderRadius: 6, padding: '10px 11px', fontFamily: 'Inter', fontSize: 13, outline: 'none',
}
const small: React.CSSProperties = { fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))' }
const pill = (on = false): React.CSSProperties => ({
  fontFamily: 'Inter', fontSize: 12, borderRadius: 16, padding: '6px 12px', cursor: 'pointer',
  background: on ? 'var(--t-gold)' : 'transparent', color: on ? '#080808' : 'var(--t-fg)',
  border: `1px solid ${on ? 'var(--t-gold)' : 'rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))'}`,
})

export default function PhotoCreditsEditor({ imageId, imageUrl, onClose, onCount }: {
  imageId: string; imageUrl: string; onClose: () => void; onCount?: (n: number) => void
}) {
  const [credits, setCredits] = useState<Credit[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [searching, setSearching] = useState(false)
  const [outside, setOutside] = useState(false)
  const [name, setName] = useState('')
  const [ig, setIg] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null) // the invite link just created
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    const r = await fetch(`/api/directory/credits?imageId=${imageId}`, { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setErr(d.error || 'Could not load credits.')
    else { setCredits(d.credits ?? []); onCount?.((d.credits ?? []).length) }
    setLoading(false)
  }
  useEffect(() => { load() }, [imageId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced directory search.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (term.length < 2) { setFound([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const r = await fetch(`/api/directory/credits?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      setFound(r.ok ? (d.members ?? []) : [])
      setSearching(false)
    }, 250)
  }, [q])

  const add = async (payload: Record<string, unknown>) => {
    if (!role) { setErr('Pick their role on the shoot first.'); return }
    setBusy(true); setErr(''); setFresh(null)
    const r = await fetch('/api/directory/credits', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, role, ...payload }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not add that credit.'); return }
    setQ(''); setFound([]); setName(''); setIg('')
    if (d.inviteUrl) setFresh(d.inviteUrl)
    else setOutside(false)
    await load()
  }

  const remove = async (id: string) => {
    const r = await fetch(`/api/directory/credits?id=${id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not remove that.'); return }
    await load()
  }

  const share = async (url: string, who: string | null, r: string) => {
    const text = `I credited you${who ? ` (${who})` : ''} as ${r} on a photo in my Made Kulture portfolio. Join the Creative Directory to claim it:`
    try {
      if (navigator.share) { await navigator.share({ title: 'Made Kulture credit', text, url }); return }
    } catch { /* fall through to copy */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(url); setTimeout(() => setCopied(null), 2000) } catch {}
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, maxHeight: 'calc(88 * var(--svh, 1vh))', overflowY: 'auto', background: 'var(--t-surface-lo, #111)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', borderRadius: 12, padding: 18, fontFamily: 'Inter', color: 'var(--t-fg)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <img src={imageUrl} alt="" style={{ width: 48, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.03em' }}>CREDITS</div>
            <div style={small}>Who worked on or appears in this photo.</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Existing credits */}
        {loading ? <div style={small}>Loading…</div> : credits.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {credits.map(c => (
              <div key={c.id} style={{ border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', borderRadius: 8, padding: '9px 11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                    <span style={{ color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' }}>{c.role}</span>{' · '}
                    <b>{c.member ? c.member.name : (c.name || (c.instagram ? `@${c.instagram}` : 'Someone'))}</b>
                    {c.pending && <div style={{ ...small, marginTop: 2 }}>Not on the directory yet</div>}
                  </div>
                  <button type="button" onClick={() => remove(c.id)} title="Remove credit"
                    style={{ background: 'transparent', border: 'none', color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))', cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
                {c.pending && c.inviteUrl && (
                  <button type="button" onClick={() => share(c.inviteUrl!, c.name, c.role)}
                    style={{ ...pill(), marginTop: 8, fontSize: 11 }}>
                    {copied === c.inviteUrl ? 'Copied ✓' : 'Send them the invite link'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {fresh && (
          <div style={{ border: '1px solid rgba(var(--t-gold-rgb, 230,192,122), 0.5)', background: 'rgba(230,192,122,0.06)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12.5, lineHeight: 1.55 }}>
            Credit added. Send them this link so they can join the directory and claim it — it&rsquo;ll link to their profile once they do.
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input readOnly value={fresh} onFocus={e => e.currentTarget.select()} style={{ ...field, fontSize: 11.5, padding: '8px 9px' }} />
              <button type="button" onClick={() => share(fresh, null, role || 'a collaborator')} style={{ ...pill(true), whiteSpace: 'nowrap' }}>
                {copied === fresh ? 'Copied ✓' : 'Share'}
              </button>
            </div>
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: 'var(--t-err, #ff8080)', marginBottom: 10 }}>{err}</div>}

        {/* Add a credit */}
        <div style={{ ...small, fontWeight: 700, letterSpacing: '0.14em', marginBottom: 6 }}>ADD A CREDIT</div>
        <select value={role} onChange={e => setRole(e.target.value)} style={{ ...field, marginBottom: 10 }}>
          <option value="" style={{ background: '#0d0d0d', color: '#fff' }}>Their role on the shoot…</option>
          {ROLE_CATEGORIES.map(cat => (
            <optgroup key={cat.label} label={cat.label} style={{ background: '#0d0d0d', color: '#aaa' }}>
              {cat.roles.map(r => <option key={r} value={r} style={{ background: '#0d0d0d', color: '#fff' }}>{r}</option>)}
            </optgroup>
          ))}
          <option value="Brand" style={{ background: '#0d0d0d', color: '#fff' }}>Brand</option>
          <option value="Other" style={{ background: '#0d0d0d', color: '#fff' }}>Other</option>
        </select>

        {!outside ? (
          <>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the directory by name or @instagram" style={field} />
            {searching && <div style={{ ...small, marginTop: 6 }}>Searching…</div>}
            {found.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6, border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', borderRadius: 8, overflow: 'hidden' }}>
                {found.map(m => (
                  <button key={m.id} type="button" disabled={busy} onClick={() => add({ memberId: m.id })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(var(--t-fg-rgb), calc(0.06 * var(--t-a)))', padding: '8px 10px', cursor: 'pointer', color: 'var(--t-fg)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi, #222)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                      {m.avatar_url ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                      <div style={{ ...small, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[m.instagram ? `@${m.instagram}` : '', m.roles.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {q.trim().length >= 2 && !searching && found.length === 0 && (
              <div style={{ ...small, marginTop: 6 }}>No one in the directory matches that.</div>
            )}
            <button type="button" onClick={() => { setOutside(true); setErr(''); if (q.trim()) { if (q.trim().startsWith('@')) setIg(q.trim()); else setName(q.trim()) } }}
              style={{ ...pill(), marginTop: 12 }}>
              Not on the directory? Credit them anyway
            </button>
          </>
        ) : (
          <>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Their name" maxLength={60} style={{ ...field, marginBottom: 8 }} />
            <input value={ig} onChange={e => setIg(e.target.value)} placeholder="@instagram (optional)" maxLength={40} style={field} />
            <div style={{ ...small, marginTop: 6, lineHeight: 1.5 }}>
              You&rsquo;ll get an invite link to send them. If they join with this Instagram handle, the credit links to their profile.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => { setOutside(false); setFresh(null) }} style={pill()}>Back to search</button>
              <button type="button" disabled={busy || (!name.trim() && !ig.trim())} onClick={() => add({ name, instagram: ig })}
                style={{ ...pill(true), opacity: busy || (!name.trim() && !ig.trim()) ? 0.5 : 1 }}>
                {busy ? 'Adding…' : 'Add credit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

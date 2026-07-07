'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CREATIVE_ROLES } from '@/lib/roles'

interface Member {
  id: string
  full_name: string
  roles: string[]
  instagram: string | null
  avatar_url: string | null
  account_type?: string
}

export default function DirectoryPage() {
  const [members, setMembers]     = useState<Member[]>([])
  const [loading, setLoading]     = useState(true)
  const [optedOut, setOptedOut]   = useState(false)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])

  const [selected, setSelected]   = useState<string[]>([])
  const [open, setOpen]           = useState(false)
  const [roleQuery, setRoleQuery] = useState('')
  const [sortMode, setSortMode]   = useState<'common' | 'az'>('common')
  const [peopleQuery, setPeople]  = useState('')

  useEffect(() => {
    fetch('/api/roles').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
  }, [])

  // Fetch the whole directory once; filtering happens client-side so multi-select
  // + search are instant.
  useEffect(() => {
    setLoading(true)
    fetch('/api/directory')
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (r.status === 403 && d.optedOut) { setOptedOut(true); setMembers([]) }
        else { setOptedOut(false); setMembers(d.members ?? []) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // How many listed creatives hold each role (drives the "most common" sort + counts).
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of members) for (const r of m.roles) c[r] = (c[r] || 0) + 1
    return c
  }, [members])

  const displayRoles = useMemo(() => {
    const q = roleQuery.trim().toLowerCase()
    const list = roleOptions.filter(r => !q || r.toLowerCase().includes(q))
    return [...list].sort((a, b) =>
      sortMode === 'az'
        ? a.localeCompare(b)
        : (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b)
    )
  }, [roleOptions, roleQuery, sortMode, counts])

  const filtered = useMemo(() => {
    const pq = peopleQuery.trim().toLowerCase()
    return members.filter(m => {
      const roleMatch = selected.length === 0 || m.roles.some(r => selected.includes(r))
      const peopleMatch = !pq
        || (m.full_name || '').toLowerCase().includes(pq)
        || (m.instagram || '').toLowerCase().includes(pq)
      return roleMatch && peopleMatch
    })
  }, [members, selected, peopleQuery])

  const toggleRole = (r: string) =>
    setSelected(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r])

  const input: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff',
    fontFamily: 'Inter', fontSize: 14, padding: '10px 13px', borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 8px' }}>CREATIVE DIRECTORY</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 24 }}>
        Find collaborators in the Made Kulture community. Want to be listed? Turn on the directory toggle in your{' '}
        <a href="/account/profile" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>profile</a>.
      </p>

      {optedOut ? (
        <div style={{ background: '#141414', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 8, padding: '28px 24px', maxWidth: 520 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 600, color: '#e6c07a', marginBottom: 8 }}>You&apos;re not in the directory</div>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 18px' }}>
            The creative directory is members-only both ways — to browse other creatives, you need to be listed yourself.
            Turn on directory visibility in your profile to join and unlock browsing. Only your name, roles, and Instagram are ever shown.
          </p>
          <a href="/account/profile" style={{ display: 'inline-block', background: '#fff', color: '#080808', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textDecoration: 'none', padding: '11px 20px', borderRadius: 4 }}>
            JOIN THE DIRECTORY →
          </a>
        </div>
      ) : (<>
      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <input value={peopleQuery} onChange={e => setPeople(e.target.value)} placeholder="Search by name or @handle" style={input} />
        </div>
        <button onClick={() => setOpen(o => !o)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: selected.length ? '#fff' : 'rgba(255,255,255,0.05)', color: selected.length ? '#080808' : 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '10px 16px', fontFamily: 'Inter', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {selected.length ? `Roles · ${selected.length}` : 'Filter by role'}
          <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
        </button>
        {(selected.length > 0 || peopleQuery) && (
          <button onClick={() => { setSelected([]); setPeople('') }}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)', fontFamily: 'Inter', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
            Clear
          </button>
        )}
      </div>

      {/* Selected role chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {selected.map(r => (
            <button key={r} onClick={() => toggleRole(r)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', color: '#080808', border: 'none', borderRadius: 20, padding: '6px 8px 6px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
              {r}<span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
            </button>
          ))}
        </div>
      )}

      {/* Role dropdown */}
      {open && (
        <div style={{ background: '#121212', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: 12, marginBottom: 20, maxWidth: 460 }}>
          <input value={roleQuery} onChange={e => setRoleQuery(e.target.value)} placeholder="Search roles…" style={{ ...input, marginBottom: 10 }} autoFocus />
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {([['common', 'Most common'], ['az', 'A–Z']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSortMode(v)}
                style={{ background: sortMode === v ? 'rgba(255,255,255,0.14)' : 'transparent', color: sortMode === v ? '#fff' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 12px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', margin: '0 -4px' }}>
            {displayRoles.length === 0 ? (
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', padding: '10px 4px' }}>No roles match.</div>
            ) : displayRoles.map(r => {
              const on = selected.includes(r)
              return (
                <button key={r} onClick={() => toggleRole(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: on ? 'rgba(255,255,255,0.07)' : 'transparent', border: 'none', borderRadius: 6, padding: '9px 10px', cursor: 'pointer' }}>
                  <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 4, border: `1.5px solid ${on ? '#fff' : 'rgba(255,255,255,0.3)'}`, background: on ? '#fff' : 'transparent', color: '#080808', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{on ? '✓' : ''}</span>
                  <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 14, color: '#fff' }}>{r}</span>
                  {counts[r] ? <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{counts[r]}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : (
        <>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
            {filtered.length} {filtered.length === 1 ? 'creative' : 'creatives'}
          </div>
          {filtered.length === 0 ? (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.35)', paddingTop: 6 }}>
              {members.length === 0 ? 'No one has joined the directory yet.' : 'No matches — try clearing a filter.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {filtered.map(m => (
                <Link key={m.id} href={`/account/directory/${m.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>{(m.full_name || '?').charAt(0).toUpperCase()}</span>}
                    </div>
                    <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {m.full_name}
                      {m.account_type === 'brand' && <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#8ab4f8', border: '1px solid rgba(138,180,248,0.4)', borderRadius: 4, padding: '2px 6px' }}>BRAND</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: m.instagram ? 12 : 0 }}>
                    {m.roles.map(r => (
                      <span key={r} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '3px 8px' }}>
                        {r}
                      </span>
                    ))}
                  </div>
                  {m.instagram && (
                    <span style={{ fontFamily: 'Inter', fontSize: 13, color: '#e8c878' }}>
                      @{m.instagram.replace('@', '')}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      </>)}
    </div>
  )
}

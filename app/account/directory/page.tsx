'use client'
import { useEffect, useState } from 'react'
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
  const [role, setRole]       = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [optedOut, setOptedOut] = useState(false)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])

  useEffect(() => {
    fetch('/api/roles').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch('/api/directory' + (role ? `?role=${encodeURIComponent(role)}` : ''))
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (r.status === 403 && d.optedOut) { setOptedOut(true); setMembers([]) }
        else { setOptedOut(false); setMembers(d.members ?? []) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [role])

  const chip = (label: string, value: string) => {
    const on = role === value
    return (
      <button key={value || 'all'} onClick={() => setRole(value)}
        style={{
          background: on ? '#fff' : 'transparent',
          color: on ? '#080808' : 'rgba(255,255,255,0.7)',
          border: on ? '1px solid #fff' : '1px solid rgba(255,255,255,0.15)',
          borderRadius: 20, padding: '7px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
        {label}
      </button>
    )
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
      {/* Role filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
        {chip('All', '')}
        {roleOptions.map(r => chip(r, r))}
      </div>

      {loading ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
      ) : members.length === 0 ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.35)', paddingTop: 20 }}>
          {role ? `No ${role.toLowerCase()}s in the directory yet.` : 'No one has joined the directory yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {members.map(m => (
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
      </>)}
    </div>
  )
}

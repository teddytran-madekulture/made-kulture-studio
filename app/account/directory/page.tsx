'use client'
import { useEffect, useState } from 'react'
import { CREATIVE_ROLES } from '@/lib/roles'

interface Member {
  id: string
  full_name: string
  roles: string[]
  instagram: string | null
  avatar_url: string | null
}

export default function DirectoryPage() {
  const [role, setRole]       = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/directory' + (role ? `?role=${encodeURIComponent(role)}` : ''))
      .then(r => r.json())
      .then(d => { setMembers(d.members ?? []); setLoading(false) })
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

      {/* Role filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
        {chip('All', '')}
        {CREATIVE_ROLES.map(r => chip(r, r))}
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
            <div key={m.id} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {m.avatar_url
                    ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>{(m.full_name || '?').charAt(0).toUpperCase()}</span>}
                </div>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.02em' }}>
                  {m.full_name}
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
                <a href={`https://instagram.com/${m.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'Inter', fontSize: 13, color: '#e8c878', textDecoration: 'none' }}>
                  @{m.instagram.replace('@', '')}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

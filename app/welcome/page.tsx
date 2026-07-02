'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CREATIVE_ROLES } from '@/lib/roles'

export default function WelcomePage() {
  const router = useRouter()
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [roles, setRoles]         = useState<string[]>([])
  const [instagram, setInstagram] = useState('')
  const [directoryOptIn, setDirectoryOptIn] = useState(true)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])
  const [otherRole, setOtherRole] = useState('')
  const [showOther, setShowOther] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    fetch('/api/account/profile').then(async r => {
      if (r.status === 401) { router.replace('/login?next=/welcome'); return }
      const d = await r.json().catch(() => ({}))
      if (d.profile) {
        setName(d.profile.full_name || '')
        setEmail(d.profile.email || '')
        setRoles(d.profile.roles ?? [])
        setInstagram((d.profile.instagram || '').replace(/^@/, ''))
        setDirectoryOptIn(d.profile.directory_opt_in !== false)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    fetch('/api/roles').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
  }, [])

  const toggleRole = (role: string) =>
    setRoles(rs => rs.includes(role) ? rs.filter(r => r !== role) : [...rs, role])
  const addOther = () => {
    const r = otherRole.trim()
    if (r && !roles.some(x => x.toLowerCase() === r.toLowerCase())) setRoles(rs => [...rs, r])
    setOtherRole(''); setShowOther(false)
  }

  const finish = async () => {
    setSaving(true)
    await fetch('/api/account/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name, instagram: instagram.trim().replace(/^@/, '') || null,
        roles, directory_opt_in: directoryOptIn, onboarded: true,
      }),
    })
    const customRoles = roles.filter(r => !roleOptions.includes(r))
    await Promise.allSettled(customRoles.map(role =>
      fetch('/api/roles/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, email }),
      })))
    router.replace('/account')
  }

  const input: React.CSSProperties = {
    width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }
  const chip = (on: boolean): React.CSSProperties => ({
    background: on ? '#fff' : 'transparent', color: on ? '#080808' : 'rgba(255,255,255,0.7)',
    border: on ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)',
    borderRadius: 20, padding: '7px 13px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer',
  })

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 20px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.03em', margin: '0 0 6px' }}>
          {name ? `WELCOME, ${name.split(' ')[0].toUpperCase()}` : 'WELCOME'}
        </div>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 32, lineHeight: 1.5 }}>
          One quick step — tell the community what you do so creatives can find you. You can change any of this later in your profile.
        </p>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>What do you do? <span style={{ color: 'rgba(255,255,255,0.25)' }}>(pick any that apply)</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {roleOptions.map(role => (
                  <button type="button" key={role} onClick={() => toggleRole(role)} style={chip(roles.includes(role))}>{role}</button>
                ))}
                {roles.filter(r => !roleOptions.includes(r)).map(role => (
                  <button type="button" key={role} onClick={() => toggleRole(role)} style={chip(true)} title="Remove">{role} ✕</button>
                ))}
                {!showOther && <button type="button" onClick={() => setShowOther(true)} style={chip(false)}>+ Other</button>}
              </div>
              {showOther && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={otherRole} onChange={e => setOtherRole(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOther() } }}
                    placeholder="Your role (e.g. Photo Assistant)" maxLength={40} autoFocus style={{ ...input, flex: 1, padding: '10px 12px' }} />
                  <button type="button" onClick={addOther} style={{ background: 'rgba(255,255,255,0.9)', color: '#080808', border: 'none', borderRadius: 4, padding: '0 16px', fontFamily: 'Inter', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Instagram <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></div>
              <input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="yourusername" style={input} />
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
              <input type="checkbox" checked={directoryOptIn} onChange={e => setDirectoryOptIn(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span>Show me in the member directory so other creatives can find me. Only your name, roles, and Instagram are shown — never your email or phone. <strong style={{ color: 'rgba(255,255,255,0.85)' }}>If you opt out, you also won&apos;t be able to browse the directory.</strong></span>
            </label>

            <button onClick={finish} disabled={saving} style={{ width: '100%', background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'SAVING…' : 'SAVE & CONTINUE'}
            </button>
            <button onClick={finish} disabled={saving} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
              Skip for now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

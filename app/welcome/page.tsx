'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CREATIVE_ROLES } from '@/lib/roles'
import { cleanIgHandle } from '@/lib/directory-listing'
import RolePicker from '@/components/RolePicker'

export default function WelcomePage() {
  const router = useRouter()
  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [error, setError]         = useState('')
  const [roles, setRoles]         = useState<string[]>([])
  const [instagram, setInstagram] = useState('')
  const [directoryOptIn, setDirectoryOptIn] = useState(true)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    fetch('/api/account/profile').then(async r => {
      if (r.status === 401) { router.replace('/login?next=/welcome'); return }
      const d = await r.json().catch(() => ({}))
      if (d.profile) {
        setName(d.profile.full_name || '')
        setEmail(d.profile.email || '')
        setPhone(d.profile.phone || '')
        setRoles(d.profile.roles ?? [])
        setInstagram((d.profile.instagram || '').replace(/^@/, ''))
        setDirectoryOptIn(d.profile.directory_opt_in !== false)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
    fetch('/api/roles').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
  }, [])

  // Google sign-ups land here with whatever name is on the Google account
  // (sometimes a business name) and NO phone — Google doesn't share one. Name
  // and phone are required even on "Skip": the rest of the site (Plus checkout,
  // the client list, texts) assumes every account has both.
  const phoneDigits = phone.replace(/[^\d]/g, '')
  const phoneOk = phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits.startsWith('1'))
  const finish = async () => {
    if (!name.trim()) { setError('Please add your name.'); return }
    if (!phoneOk)     { setError('Please add a 10-digit phone number.'); return }
    setError('')
    setSaving(true)
    const res = await fetch('/api/account/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name.trim(), phone: phoneDigits, instagram: cleanIgHandle(instagram) || null,
        roles, directory_opt_in: directoryOptIn, onboarded: true,
      }),
    }).catch(() => null)
    if (!res || !res.ok) { setSaving(false); setError('Something went wrong saving. Please try again.'); return }
    router.replace('/account')
  }

  const input: React.CSSProperties = {
    width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }
  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 20px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.03em', margin: '0 0 6px' }}>
          {name ? `WELCOME, ${name.split(' ')[0].toUpperCase()}` : 'WELCOME'}
        </div>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 32, lineHeight: 1.5 }}>
          One quick step — confirm your name and number, and tell the community what you do. You can change any of this later in your profile.
        </p>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Your name</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" autoComplete="name" style={input} />
            </div>

            <div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Mobile number <span style={{ color: 'rgba(255,255,255,0.25)' }}>(for booking confirmations and studio access — never shown publicly)</span></div>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(832) 000-0000" type="tel" inputMode="tel" autoComplete="tel" style={input} />
            </div>

            <RolePicker value={roles} onChange={setRoles} options={roleOptions} />

            <div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Instagram <span style={{ color: 'rgba(255,255,255,0.25)' }}>(optional)</span></div>
              <input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="yourusername" style={input} />
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
              <input type="checkbox" checked={directoryOptIn} onChange={e => setDirectoryOptIn(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span>Show me in the member directory so other creatives can find me. Only your name, roles, and Instagram are shown — never your email or phone. <strong style={{ color: 'rgba(255,255,255,0.85)' }}>If you opt out, you also won&apos;t be able to browse the directory.</strong></span>
            </label>

            {error && (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#f87171' }}>{error}</div>
            )}

            <button onClick={finish} disabled={saving} style={{ width: '100%', background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'SAVING…' : 'SAVE & CONTINUE'}
            </button>
            <button onClick={finish} disabled={saving} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
              Skip roles for now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

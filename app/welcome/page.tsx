'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CREATIVE_ROLES } from '@/lib/roles'
import { cleanIgHandle } from '@/lib/directory-listing'
import RolePicker from '@/components/RolePicker'
import { cleanBirthDate, todayIso, UNDERAGE_MESSAGE } from '@/lib/birth-date'

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
  // Birth date (migration 171, 2026-10-16). Required for everyone. `hasBirthDate`
  // hides the field once it's on file (it's set-once). `birthdayOnly` is an
  // existing, already-onboarded member sent here by app/account/layout.tsx just
  // because the date is missing — they get the one field, not the whole form.
  const [birthDate, setBirthDate] = useState('')
  const [hasBirthDate, setHasBirthDate] = useState(false)
  const [birthdayOnly, setBirthdayOnly] = useState(false)
  const [blocked, setBlocked] = useState(false)   // under 18 — see lib/birth-date.ts

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
        setHasBirthDate(!!d.profile.birth_date)
        setBlocked(!!d.profile.underage_blocked_at)
        setBirthdayOnly(d.profile.onboarded === true && !d.profile.birth_date)
        // Already onboarded, date on file, not blocked: nothing to do here.
        // (2026-10-17 — Teddy saved his birthday, got bounced back here by a
        // stale cached redirect, and was shown the full first-time form.)
        if (d.profile.onboarded === true && d.profile.birth_date && !d.profile.underage_blocked_at) {
          window.location.replace('/account'); return
        }
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
    const bd = hasBirthDate ? null : cleanBirthDate(birthDate)
    if (!hasBirthDate && !bd) { setError('Please add your birth date.'); return }
    if (birthdayOnly) {
      setError(''); setSaving(true)
      const r = await fetch('/api/account/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birth_date: bd }),
      }).catch(() => null)
      if (r && r.status === 403) { setSaving(false); setBlocked(true); return }
      if (!r || !r.ok) { setSaving(false); setError('Something went wrong saving. Please try again.'); return }
      window.location.replace('/account')   // hard nav — see note above
      return
    }
    if (!name.trim()) { setError('Please add your name.'); return }
    if (!phoneOk)     { setError('Please add a 10-digit phone number.'); return }
    setError('')
    setSaving(true)
    const res = await fetch('/api/account/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: name.trim(), phone: phoneDigits, instagram: cleanIgHandle(instagram) || null,
        roles, directory_opt_in: directoryOptIn, onboarded: true,
        ...(bd ? { birth_date: bd } : {}),
      }),
    }).catch(() => null)
    if (res && res.status === 403) { setSaving(false); setBlocked(true); return }
    if (!res || !res.ok) { setSaving(false); setError('Something went wrong saving. Please try again.'); return }
    window.location.replace('/account')
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
          {blocked ? 'SORRY' : birthdayOnly ? 'ONE QUICK THING' : name ? `WELCOME, ${name.split(' ')[0].toUpperCase()}` : 'WELCOME'}
        </div>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 32, lineHeight: 1.5 }}>
          {blocked ? '' : birthdayOnly
            ? 'Add your birth date to finish setting up your account. It stays private.'
            : 'One quick step — confirm your name and number, and tell the community what you do. You can change any of this later in your profile.'}
        </p>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
        ) : blocked ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: 0 }}>{UNDERAGE_MESSAGE}</p>
            <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
              <button type="submit" style={{ width: '100%', background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer' }}>
                SIGN OUT
              </button>
            </form>
          </div>
        ) : birthdayOnly ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Your birth date <span style={{ color: 'rgba(255,255,255,0.25)' }}>(private, never shown on your profile)</span></div>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} min="1900-01-01" max={todayIso()} style={{ ...input, colorScheme: 'dark' }} />
            </div>
            {error && (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#f87171' }}>{error}</div>
            )}
            <button onClick={finish} disabled={saving} style={{ width: '100%', background: '#fff', color: '#000', border: 'none', borderRadius: 4, padding: '14px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'SAVING…' : 'SAVE & CONTINUE'}
            </button>
          </div>
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

            {!hasBirthDate && (
              <div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Your birth date <span style={{ color: 'rgba(255,255,255,0.25)' }}>(private, never shown on your profile)</span></div>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} min="1900-01-01" max={todayIso()} style={{ ...input, colorScheme: 'dark' }} />
              </div>
            )}

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

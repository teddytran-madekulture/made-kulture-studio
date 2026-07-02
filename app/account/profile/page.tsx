'use client'
import { useEffect, useState } from 'react'
import { CREATIVE_ROLES } from '@/lib/roles'
import { createClient } from '@/lib/supabase/client'
import RolePicker from '@/components/RolePicker'
import PortfolioManager from '@/components/PortfolioManager'

type ProfileLink = { label: string; url: string }

interface Profile {
  id: string
  account_type: 'creative' | 'brand'
  full_name: string
  email: string
  phone: string
  instagram: string
  sms_opt_in: boolean
  roles: string[]
  directory_opt_in: boolean
  avatar_url: string | null
  bio: string
  links: ProfileLink[]
  video_url: string
  show_email: boolean
  show_phone: boolean
}

// Defined at module scope (NOT inside the page component) so its identity is
// stable across renders — otherwise each keystroke remounts the input and the
// cursor/focus is lost.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

export default function ProfilePage() {
  const [form, setForm]     = useState<Profile>({ id: '', account_type: 'creative', full_name: '', email: '', phone: '', instagram: '', sms_opt_in: false, roles: [], directory_opt_in: false, avatar_url: null, bio: '', links: [], video_url: '', show_email: false, show_phone: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const [roleOptions, setRoleOptions] = useState<string[]>([...CREATIVE_ROLES])
  const [portfolioCount, setPortfolioCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    fetch('/api/account/profile')
      .then(r => r.json())
      .then(d => {
        if (d.profile) setForm({
          ...d.profile,
          account_type: d.profile.account_type === 'brand' ? 'brand' : 'creative',
          roles: d.profile.roles ?? [],
          directory_opt_in: !!d.profile.directory_opt_in,
          avatar_url: d.profile.avatar_url ?? null,
          bio: d.profile.bio ?? '',
          links: Array.isArray(d.profile.links) ? d.profile.links : [],
          video_url: d.profile.video_url ?? '',
          show_email: !!d.profile.show_email,
          show_phone: !!d.profile.show_phone,
        })
        setLoading(false)
      })
    fetch('/api/roles').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
  }, [])

  // Minimum profile to be listed/browsable in the directory.
  const isBrand = form.account_type === 'brand'
  const missing: string[] = []
  if (!form.full_name.trim()) missing.push(isBrand ? 'your company name' : 'your name')
  if (!isBrand && form.roles.length === 0) missing.push('at least one role')
  if (!form.bio.trim()) missing.push(isBrand ? 'a short about' : 'a short bio')
  if (portfolioCount === 0 && form.links.length === 0 && !form.instagram.trim())
    missing.push('a portfolio photo, a link, or Instagram')

  // Downscale + compress in the browser before upload. Avatars only ever show
  // at ~44–72px, so capping the longest side at 512px and re-encoding as JPEG
  // keeps each file ~30–80 KB instead of multi-MB — saving storage and speeding
  // up the directory. Returns a JPEG Blob.
  const resizeImage = (file: File, max = 512, quality = 0.85): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('no canvas')); return }
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          b => b ? resolve(b) : reject(new Error('encode failed')),
          'image/jpeg',
          quality
        )
      }
      img.onerror = () => reject(new Error('load failed'))
      img.src = URL.createObjectURL(file)
    })

  const uploadAvatar = async (file: File) => {
    setError(''); setUploading(true)
    try {
      // Guard against absurdly large originals before we even decode them.
      if (file.size > 25 * 1024 * 1024) { setError('That image is too large (max 25 MB).'); setUploading(false); return }
      if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); setUploading(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in again.'); setUploading(false); return }

      let upload: Blob = file
      try { upload = await resizeImage(file) } catch { /* fall back to original if resize fails */ }

      const path = `${user.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, upload, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) { setError(upErr.message); setUploading(false); return }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // cache-bust so the new image shows immediately
      setForm(f => ({ ...f, avatar_url: `${data.publicUrl}?t=${Date.now()}` }))
    } catch {
      setError('Could not upload photo.')
    }
    setUploading(false)
  }

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/account/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: form.full_name, phone: form.phone, instagram: form.instagram, sms_opt_in: form.sms_opt_in, roles: form.roles, directory_opt_in: form.directory_opt_in, avatar_url: form.avatar_url, bio: form.bio, links: form.links.filter(l => l.url.trim()), video_url: form.video_url, show_email: form.show_email, show_phone: form.show_phone, account_type: form.account_type }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Save failed'); setSaving(false) }
    else {
      // Queue any custom ("Other") roles for owner review — best-effort.
      const customRoles = form.roles.filter(r => !roleOptions.includes(r))
      await Promise.allSettled(customRoles.map(role =>
        fetch('/api/roles/suggest', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, email: form.email }),
        })))
      setSaved(true); setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: '#fff',
    outline: 'none', boxSizing: 'border-box',
  }

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingTop: 40 }}>Loading...</div>

  return (
    <div>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, margin: '0 0 8px' }}>PROFILE</h1>
      {form.id && form.directory_opt_in
        ? (
          <a href={`/account/directory/${form.id}`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', fontFamily: 'Inter', fontSize: 13, color: '#e6c07a', textDecoration: 'none', marginBottom: 28 }}>
            View public profile →
          </a>
        ) : (
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 28 }}>
            Turn on the directory listing below to get a public profile.
          </div>
        )}
      <form onSubmit={save} style={{ maxWidth: 480 }}>
        {error && (
          <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b', marginBottom: 20 }}>
            {error}
          </div>
        )}
        {saved && (
          <div style={{ background: 'rgba(60,255,120,0.1)', border: '1px solid rgba(60,255,120,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#6bffaa', marginBottom: 20 }}>
            Profile saved successfully.
          </div>
        )}

        {form.directory_opt_in && missing.length > 0 && (
          <div style={{ background: 'rgba(230,192,122,0.08)', border: '1px solid rgba(230,192,122,0.3)', borderRadius: 8, padding: '14px 16px', fontFamily: 'Inter', fontSize: 13, color: '#e6c07a', lineHeight: 1.55, marginBottom: 24 }}>
            <strong>Finish your profile to appear in the directory.</strong> Still needed: {missing.join(', ')}.
          </div>
        )}

        <Field label="ACCOUNT TYPE">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['creative', 'brand'] as const).map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, account_type: t }))} style={{
                flex: 1, padding: '10px', borderRadius: 4, fontFamily: 'Inter', fontSize: 13, cursor: 'pointer',
                background: form.account_type === t ? '#fff' : 'transparent',
                color: form.account_type === t ? '#080808' : 'rgba(255,255,255,0.6)',
                border: form.account_type === t ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)',
              }}>{t === 'creative' ? 'Creative' : 'Brand / Business'}</button>
            ))}
          </div>
        </Field>

        <Field label={isBrand ? 'LOGO' : 'PROFILE PHOTO'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {form.avatar_url
                ? <img src={form.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>No photo</span>}
            </div>
            <label style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '10px 16px', fontFamily: 'Inter', fontSize: 12, color: '#fff', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'UPLOADING…' : (form.avatar_url ? 'CHANGE PHOTO' : 'UPLOAD PHOTO')}
              <input type="file" accept="image/*" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
            Shown on your directory listing. Click <strong>Save Changes</strong> below to keep it.
          </div>
        </Field>

        <Field label={isBrand ? 'COMPANY NAME' : 'FULL NAME'}>
          <input value={form.full_name} onChange={set('full_name')} placeholder={isBrand ? 'Your company name' : 'Your full name'} style={inputStyle} />
        </Field>
        <Field label="EMAIL">
          <input value={form.email} disabled style={{ ...inputStyle, opacity: 0.4 }} />
        </Field>
        <Field label="PHONE">
          <input value={form.phone} onChange={set('phone')} placeholder="(832) 000-0000" style={inputStyle} />
        </Field>
        <Field label="INSTAGRAM">
          <div style={{ display: 'flex', alignItems: 'center', background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.3)', padding: '14px 0 14px 16px' }}>@</span>
            <input value={form.instagram?.replace('@', '') ?? ''} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="yourusername" style={{ ...inputStyle, border: 'none', paddingLeft: 4 }} />
          </div>
        </Field>

        {!isBrand && (
          <Field label="WHAT YOU DO">
            <RolePicker
              value={form.roles}
              onChange={roles => setForm(f => ({ ...f, roles }))}
              options={roleOptions}
            />
          </Field>
        )}

        <Field label={isBrand ? 'ABOUT / WHAT YOU’RE LOOKING FOR' : 'BIO'}>
          <textarea
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder={isBrand ? 'Who you are as a brand and the kind of creatives or work you’re looking for.' : 'A sentence or two about you and your work.'}
            maxLength={600}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6, textAlign: 'right' }}>{form.bio.length}/600</div>
        </Field>

        <Field label="PORTFOLIO">
          <PortfolioManager onCountChange={setPortfolioCount} />
        </Field>

        <Field label="LINKS">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.links.map((link, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={link.label}
                  onChange={e => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, label: e.target.value } : l) }))}
                  placeholder="Label (e.g. Website)" maxLength={40}
                  style={{ ...inputStyle, flex: '0 0 34%', padding: '10px 12px' }}
                />
                <input
                  value={link.url}
                  onChange={e => setForm(f => ({ ...f, links: f.links.map((l, j) => j === i ? { ...l, url: e.target.value } : l) }))}
                  placeholder="https://…" maxLength={300}
                  style={{ ...inputStyle, flex: 1, padding: '10px 12px' }}
                />
                <button type="button" onClick={() => setForm(f => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
                  title="Remove link"
                  style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', borderRadius: 4, width: 40, cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ))}
            {form.links.length < 8 && (
              <button type="button" onClick={() => setForm(f => ({ ...f, links: [...f.links, { label: '', url: '' }] }))}
                style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', borderRadius: 4, padding: '9px 14px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
                + Add link
              </button>
            )}
          </div>
        </Field>

        <Field label="VIDEO / REEL LINK">
          <input
            value={form.video_url}
            onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))}
            placeholder="YouTube or Vimeo link (optional)" maxLength={300}
            style={inputStyle}
          />
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
            We don&apos;t host video — paste a link and it&apos;ll embed on your profile.
          </div>
        </Field>

        {/* Public contact display */}
        <Field label="CONTACT SHOWN ON YOUR PROFILE">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              <input type="checkbox" checked={form.show_email} onChange={e => setForm(f => ({ ...f, show_email: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              Show my email to other members
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
              <input type="checkbox" checked={form.show_phone} onChange={e => setForm(f => ({ ...f, show_phone: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              Show my phone to other members
            </label>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              Off by default. These only ever show on your profile to signed-in members.
            </div>
          </div>
        </Field>

        {/* Directory opt-in */}
        <div
          onClick={() => setForm(f => ({ ...f, directory_opt_in: !f.directory_opt_in }))}
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '16px 18px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        >
          <div style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, border: `1px solid ${form.directory_opt_in ? '#fff' : 'rgba(255,255,255,0.3)'}`, background: form.directory_opt_in ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {form.directory_opt_in && <span style={{ color: '#080808', fontSize: 11, lineHeight: 1 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff', marginBottom: 2 }}>List me in the creative directory</div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
              Let other Made Kulture members find you by role for collaborations. Only your name, roles, and Instagram are shown — never your email or phone. It works both ways: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>if you turn this off, you also won&apos;t be able to browse the directory.</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <input type="checkbox" id="sms_opt_in" checked={!!form.sms_opt_in} onChange={set('sms_opt_in')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="sms_opt_in" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            Send me SMS reminders before my bookings
          </label>
        </div>

        <button type="submit" disabled={saving} style={{
          background: '#fff', color: '#000', border: 'none', borderRadius: 4,
          padding: '14px 32px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600,
          letterSpacing: '0.1em', cursor: 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>
      </form>
    </div>
  )
}

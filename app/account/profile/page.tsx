'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PROFILE_SECTIONS } from '@/lib/settings-sections'
import { CREATIVE_ROLES, SERVICE_ROLES } from '@/lib/roles'
import { createClient } from '@/lib/supabase/client'
import RolePicker from '@/components/RolePicker'
import PortfolioManager from '@/components/PortfolioManager'
import ListingsManager from '@/components/ListingsManager'
import ImageCropper from '@/components/ImageCropper'
import { stampCopyright } from '@/lib/jpeg-copyright'
import { HexCrest } from '@/components/FoundingBadge'
import { PROFILE_COLORS } from '@/lib/profile-colors'
import { CREDIT_TYPES, MAX_CREDITS, type Credit } from '@/lib/profile-credits'

type ProfileLink = { label: string; url: string }

interface Profile {
  id: string
  account_type: 'customer' | 'creative' | 'vendor' | 'brand'
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
  notify_email: boolean
  notify_sms: boolean
  profile_color: string | null
  cover_url: string | null
  credits: Credit[]
  cv_url: string | null
}

// Defined at module scope (NOT inside the page component) so its identity is
// stable across renders — otherwise each keystroke remounts the input and the
// cursor/focus is lost.
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', marginBottom: 8 }}>
        {label}
        {hint && <span style={{ marginLeft: 8, color: 'var(--t-gold)', fontSize: 10, letterSpacing: '0.04em' }}>· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

// Settings sections (Instagram-style): one section per screen, picked by ?s=
// from the settings menu (components/SettingsShell). One form underneath, so
// SAVE CHANGES always saves everything.
type Sec = keyof typeof PROFILE_SECTIONS

export default function ProfilePage() {
  return <Suspense fallback={null}><ProfileSettings /></Suspense>
}

function ProfileSettings() {
  const sp = useSearchParams()
  const sParam = sp?.get('s') ?? 'edit'
  const sec: Sec = (sParam in PROFILE_SECTIONS ? sParam : 'edit') as Sec
  const [form, setForm]     = useState<Profile>({ id: '', account_type: 'creative', full_name: '', email: '', phone: '', instagram: '', sms_opt_in: false, roles: [], directory_opt_in: false, avatar_url: null, bio: '', links: [], video_url: '', show_email: false, show_phone: false, notify_email: true, notify_sms: false , profile_color: null, cover_url: null, credits: [], cv_url: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  // Founding Creatives (first 100 complete listed profiles): badge + 15 photos.
  const [founding, setFounding] = useState<{ cap: number; left: number; mine: number | null } | null>(null)
  const loadFounding = () => fetch('/api/founding', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
    .then(d => { if (d && typeof d.cap === 'number') setFounding({ cap: d.cap, left: d.left, mine: d.mine ?? null }) }).catch(() => {})
  useEffect(() => { loadFounding() }, [])
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
          account_type: ['customer', 'creative', 'vendor', 'brand'].includes(d.profile.account_type) ? d.profile.account_type : 'customer',
          full_name: d.profile.full_name ?? '',
          phone: d.profile.phone ?? '',
          instagram: d.profile.instagram ?? '',
          roles: d.profile.roles ?? [],
          directory_opt_in: !!d.profile.directory_opt_in,
          avatar_url: d.profile.avatar_url ?? null,
          bio: d.profile.bio ?? '',
          links: Array.isArray(d.profile.links) ? d.profile.links : [],
          video_url: d.profile.video_url ?? '',
          show_email: !!d.profile.show_email,
          show_phone: !!d.profile.show_phone,
          notify_email: d.profile.notify_email !== false,
          notify_sms: !!d.profile.notify_sms,
          profile_color: d.profile.profile_color ?? null,
          cover_url: d.profile.cover_url ?? null,
          credits: Array.isArray(d.profile.credits) ? d.profile.credits : [],
          cv_url: d.profile.cv_url ?? null,
        })
        setLoading(false)
      })
    fetch('/api/roles').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.roles?.length) setRoleOptions(d.roles) }).catch(() => {})
  }, [])

  // Minimum profile to be listed/browsable in the directory.
  const isBrand = form.account_type === 'brand'
  const isCustomer = form.account_type === 'customer'
  const missing: string[] = []
  if (!(form.full_name ?? '').trim()) missing.push(isBrand ? 'your company name' : 'your name')
  if (!isBrand && (form.roles?.length ?? 0) === 0) missing.push('at least one role')
  if (!(form.bio ?? '').trim()) missing.push(isBrand ? 'a short about' : 'a short bio')
  if (portfolioCount === 0 && (form.links?.length ?? 0) === 0 && !(form.instagram ?? '').trim())
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

  // ── CV / résumé PDF (migration 123) ──────────────────────────────────────
  const [cvBusy, setCvBusy] = useState(false)
  const uploadCv = async (file: File) => {
    if (file.type !== 'application/pdf') { setError('Please choose a PDF file.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('That PDF is over 10 MB.'); return }
    setError(''); setCvBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in again.'); return }
      const path = `${user.id}/cv.pdf`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (upErr) { setError(upErr.message); return }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setForm(f => ({ ...f, cv_url: `${data.publicUrl}?t=${Date.now()}` }))
    } catch { setError('Could not upload the PDF.') }
    finally { setCvBusy(false) }
  }
  const setCredit = (i: number, patch: Partial<Credit>) =>
    setForm(f => ({ ...f, credits: f.credits.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  // ── Cover photo (Founding Creatives) ──────────────────────────────────────
  const [coverSrc, setCoverSrc] = useState<string | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const pickCover = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return }
    if (file.size > 40 * 1024 * 1024) { setError('That image is too large (max 40 MB).'); return }
    setError(''); setCoverSrc(URL.createObjectURL(file))
  }
  const closeCover = () => { if (coverSrc) URL.revokeObjectURL(coverSrc); setCoverSrc(null) }
  const onCoverCropped = async (blob: Blob) => {
    closeCover(); setCoverBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in again.'); return }
      const path = `${user.id}/cover.jpg`
      const stamped = await stampCopyright(blob, form.full_name)
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, stamped, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) { setError(upErr.message); return }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setForm(f => ({ ...f, cover_url: `${data.publicUrl}?t=${Date.now()}` }))
    } catch { setError('Could not upload the cover photo.') }
    finally { setCoverBusy(false) }
  }

  const uploadAvatar = async (file: File) => {
    setError(''); setUploading(true)
    try {
      // Guard against absurdly large originals before we even decode them.
      if (file.size > 25 * 1024 * 1024) { setError('That image is too large (max 25 MB).'); setUploading(false); return }
      if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); setUploading(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Please sign in again.'); setUploading(false); return }

      // Never fall back to the original file: it would carry its hidden data
      // (GPS etc.). The resize re-encodes, which strips it.
      let upload: Blob
      try { upload = await stampCopyright(await resizeImage(file), form.full_name) }
      catch { setError('Could not process that photo. Try a JPG or PNG.'); setUploading(false); return }

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

  // 2026-10-07: changing an existing phone number needs a texted code — the
  // server replies 409 { needsPhoneCode } and texts the new number.
  const [phoneSentTo, setPhoneSentTo] = useState<string | null>(null)
  const [phoneCode, setPhoneCode] = useState('')

  const save = async (e?: React.FormEvent, code?: string) => {
    e?.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/account/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(code ? { phone_code: code } : {}), full_name: form.full_name, phone: form.phone, instagram: form.instagram, sms_opt_in: form.sms_opt_in, roles: form.roles, directory_opt_in: form.directory_opt_in, avatar_url: form.avatar_url, bio: form.bio, links: form.links.filter(l => l.url.trim()), video_url: form.video_url, show_email: form.show_email, show_phone: form.show_phone, account_type: form.account_type, notify_email: form.notify_email, notify_sms: form.notify_sms, profile_color: form.profile_color ?? '', cover_url: form.cover_url ?? '', credits: form.credits.filter(c => c.title.trim()), cv_url: form.cv_url ?? '' }),
    })
    const data = await res.json()
    if (res.status === 409 && data.needsPhoneCode) {
      setPhoneSentTo(data.sentTo || ''); setPhoneCode(''); setSaving(false)
      return
    }
    if (!res.ok) { setError(data.error ?? 'Save failed'); setSaving(false) }
    else {
      setPhoneSentTo(null); setPhoneCode('')
      setSaved(true); setSaving(false)
      loadFounding() // saving may have just completed the profile → claims a Founding spot
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))',
    borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)',
    outline: 'none', boxSizing: 'border-box',
  }

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', paddingTop: 40 }}>Loading...</div>

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '0 0 6px' }}>{PROFILE_SECTIONS[sec]}</h1>
      {form.id && form.directory_opt_in && !isCustomer
        ? (
          <Link href={`/account/directory/${form.id}`}
            style={{ display: 'inline-block', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', textDecoration: 'none', marginBottom: 28 }}>
            View your profile →
          </Link>
        ) : <div style={{ marginBottom: 24 }} />}
      <form onSubmit={save}>
        {error && (
          <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginBottom: 20 }}>
            {error}
          </div>
        )}
        {saved && (
          <div style={{ background: 'rgba(60,255,120,0.1)', border: '1px solid rgba(60,255,120,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-ok)', marginBottom: 20 }}>
            Profile saved successfully.
          </div>
        )}

        {/* Directory guidance so people know what to do (Edit profile only). */}
        {sec !== 'edit' ? null : isCustomer ? (
          <div style={{ background: 'rgba(var(--t-gold-rgb), 0.08)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 8, padding: '14px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', lineHeight: 1.55, marginBottom: 24 }}>
            <strong>Want to join the Made Kulture creator directory?</strong> Your account is set to <strong>Customer</strong> (booking only). Switch it to <strong>Creative</strong> or <strong>Brand</strong> below, then fill out the fields marked <span style={{ whiteSpace: 'nowrap' }}>“· for directory”</span> so brands and other creatives can find you.
          </div>
        ) : (form.directory_opt_in && missing.length === 0) ? (
          <div style={{ background: 'rgba(60,255,120,0.08)', border: '1px solid rgba(60,255,120,0.25)', borderRadius: 8, padding: '14px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-ok)', lineHeight: 1.55, marginBottom: 24 }}>
            ✓ You&apos;re listed in the creator directory. Other members can find you by role.
          </div>
        ) : (
          <div style={{ background: 'rgba(var(--t-gold-rgb), 0.08)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 8, padding: '16px 18px', marginBottom: 24 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', fontWeight: 600, marginBottom: 12 }}>To appear in the creator directory:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { done: !!(form.full_name ?? '').trim(), label: isBrand ? 'Add your company name' : 'Add your name' },
                ...(!isBrand ? [{ done: (form.roles?.length ?? 0) > 0, label: 'Pick at least one role' }] : []),
                { done: !!(form.bio ?? '').trim(), label: isBrand ? 'Write a short about' : 'Write a short bio' },
                { done: portfolioCount > 0 || (form.links?.length ?? 0) > 0 || !!(form.instagram ?? '').trim(), label: 'Add a portfolio photo, a link, or Instagram' },
                { done: form.directory_opt_in, label: 'Turn on the directory listing (Directory & notifications)' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Inter', fontSize: 13, color: s.done ? 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))' : 'var(--t-fg)' }}>
                  <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: '50%', border: `1px solid ${s.done ? 'var(--t-ok)' : 'rgba(var(--t-gold-rgb), 0.5)'}`, color: 'var(--t-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{s.done ? '✓' : ''}</span>
                  <span style={{ textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Founding Creatives status */}
        {founding && !isCustomer && (sec === 'edit' || sec === 'look') && (founding.mine ? (
          <div style={{ background: 'rgba(var(--t-gold-rgb), 0.1)', border: '1px solid rgba(var(--t-gold-rgb), 0.45)', borderRadius: 8, padding: '14px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', marginBottom: 24, lineHeight: 1.5 }}>
            <HexCrest size={18} /> <strong>You&apos;re No. {String(founding.mine).padStart(2, '0')} of the First 100.</strong> <span style={{ color: 'rgba(var(--t-fg-rgb), calc(0.65 * var(--t-a)))' }}>Your perks, for good: the First 100 badge on the directory, a cover photo on your profile, and 15 portfolio photos instead of 12. You&apos;ll also sometimes get to try new features before everyone else.</span>
          </div>
        ) : founding.left > 0 ? (
          <div style={{ background: 'rgba(var(--t-gold-rgb), 0.06)', border: '1px dashed rgba(var(--t-gold-rgb), 0.45)', borderRadius: 8, padding: '14px 16px', fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))', marginBottom: 24, lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--t-gold)' }}>{founding.left} of {founding.cap} First 100 spots left.</strong> Complete your profile and turn on the directory listing to claim one: a permanent First 100 badge, a cover photo, and 15 portfolio photos instead of 12.
          </div>
        ) : null)}

        {isCustomer && (sec === 'look' || sec === 'portfolio' || sec === 'listings' || sec === 'credits') && (
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', border: '1px dashed rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 8, padding: '16px 18px', lineHeight: 1.55 }}>
            This is for directory profiles. Switch your account type to <strong>Creative</strong> or <strong>Brand</strong> in <Link href="/account/profile" style={{ color: 'var(--t-gold)' }}>Edit profile</Link> to use it.
          </div>
        )}

        <div style={{ maxWidth: 640 }}>
        {sec === 'edit' && (<>
        <Field label="ACCOUNT TYPE">
          <div style={{ display: 'flex', gap: 8 }}>
            {([['customer', 'Customer'], ['creative', 'Creative'], ['vendor', 'Vendor'], ['brand', 'Brand']] as const).map(([t, lbl]) => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, account_type: t }))} style={{
                flex: 1, padding: '10px 6px', borderRadius: 4, fontFamily: 'Inter', fontSize: 12, cursor: 'pointer',
                background: form.account_type === t ? 'var(--t-fg)' : 'transparent',
                color: form.account_type === t ? 'var(--t-on-fg)' : 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))',
                border: form.account_type === t ? '1px solid var(--t-fg)' : '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))',
              }}>{lbl}</button>
            ))}
          </div>
          {isCustomer && (
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', lineHeight: 1.5, marginTop: 8 }}>
              A customer account is just for booking and managing your sessions. Switch to <strong style={{ color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' }}>Creative</strong>, <strong style={{ color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' }}>Vendor</strong> or <strong style={{ color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' }}>Brand</strong> to join the directory. Vendors list what they rent or provide.
            </div>
          )}
        </Field>

        <Field label={isBrand ? 'LOGO' : 'PROFILE PHOTO'} hint="for directory">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'var(--t-surface-hi)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {form.avatar_url
                ? <img src={form.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))' }}>No photo</span>}
            </div>
            <label style={{ border: '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 4, padding: '10px 16px', fontFamily: 'Inter', fontSize: 12, color: 'var(--t-fg)', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'UPLOADING…' : (form.avatar_url ? 'CHANGE PHOTO' : 'UPLOAD PHOTO')}
              <input type="file" accept="image/*" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 8 }}>
            Shown on your directory listing. Click <strong>Save Changes</strong> below to keep it.
          </div>
        </Field>

        </>)}
        {sec === 'look' && (<>
        {!isCustomer && (
          <Field label="BANNER COLOR" hint="for directory">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" onClick={() => setForm(f => ({ ...f, profile_color: null }))} title="None"
                style={{ width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', background: 'transparent', border: `2px ${form.profile_color ? 'dashed' : 'solid'} ${form.profile_color ? 'rgba(var(--t-fg-rgb), calc(0.25 * var(--t-a)))' : 'var(--t-fg)'}`, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', fontSize: 14 }}>⌀</button>
              {PROFILE_COLORS.map(c => {
                const on = form.profile_color === c.key
                return (
                  <button key={c.key} type="button" title={c.label} onClick={() => setForm(f => ({ ...f, profile_color: c.key }))}
                    className="pc-fill" style={{ ['--pc-d' as string]: c.dark, ['--pc-l' as string]: c.light, width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', border: on ? '2px solid var(--t-fg)' : '2px solid transparent', boxShadow: on ? '0 0 0 2px var(--t-bg) inset' : 'none' } as React.CSSProperties} />
                )
              })}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 8 }}>
              A color banner across the top of your profile and a stripe on your directory card.
            </div>
          </Field>
        )}

        {!isCustomer && (
          <Field label="COVER PHOTO" hint="First 100 perk">
            {founding?.mine ? (
              <>
                <div style={{ height: 110, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', background: 'var(--t-surface-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  {form.cover_url
                    ? <img src={form.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))' }}>No cover photo. Your banner color shows instead.</span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ border: '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 4, padding: '10px 16px', fontFamily: 'Inter', fontSize: 12, color: 'var(--t-fg)', cursor: coverBusy ? 'default' : 'pointer', opacity: coverBusy ? 0.6 : 1 }}>
                    {coverBusy ? 'UPLOADING…' : form.cover_url ? 'CHANGE COVER' : 'ADD COVER PHOTO'}
                    <input type="file" accept="image/*" disabled={coverBusy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickCover(f) }} style={{ display: 'none' }} />
                  </label>
                  {form.cover_url && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, cover_url: null }))}
                      style={{ background: 'transparent', border: '1px solid rgba(var(--t-fg-rgb), calc(0.15 * var(--t-a)))', borderRadius: 4, padding: '10px 14px', fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', cursor: 'pointer' }}>REMOVE</button>
                  )}
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 8 }}>
                  Wide shots work best (3:1). Click <strong>Save Changes</strong> below to keep it.
                </div>
              </>
            ) : (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))', border: '1px dashed rgba(var(--t-gold-rgb), 0.4)', borderRadius: 8, padding: '12px 14px', lineHeight: 1.5 }}>
                Cover photos are a <strong style={{ color: 'var(--t-gold)' }}>First 100</strong> perk{founding && founding.left > 0 ? ` (${founding.left} spots left)` : ''}. Complete your profile and list yourself in the directory to claim one.
              </div>
            )}
          </Field>
        )}

        </>)}
        {sec === 'edit' && (<>
        <Field label={isBrand ? 'COMPANY NAME' : 'FULL NAME'} hint="for directory">
          <input value={form.full_name} onChange={set('full_name')} placeholder={isBrand ? 'Your company name' : 'Your full name'} style={inputStyle} />
        </Field>
        <Field label="EMAIL">
          <input value={form.email} disabled style={{ ...inputStyle, opacity: 0.4 }} />
        </Field>
        <Field label="PHONE">
          <input value={form.phone} onChange={e => { set('phone')(e); setPhoneSentTo(null) }} placeholder="(832) 000-0000" style={inputStyle} />
          {phoneSentTo !== null && (
            <div style={{ marginTop: 10, border: '1px solid rgba(var(--t-gold-rgb), 0.45)', background: 'rgba(var(--t-gold-rgb), 0.07)', borderRadius: 8, padding: '12px 14px', fontFamily: 'Inter' }}>
              <div style={{ fontSize: 13, color: 'var(--t-fg)', marginBottom: 10, lineHeight: 1.5 }}>
                We texted a 6-digit code to the number ending in <strong>{phoneSentTo}</strong>. Enter it to confirm your new number.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={phoneCode} onChange={e => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="123456" style={{ ...inputStyle, width: 140, letterSpacing: '0.2em' }} />
                <button type="button" disabled={saving || phoneCode.length !== 6} onClick={() => save(undefined, phoneCode)}
                  style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4, padding: '0 18px', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', opacity: saving || phoneCode.length !== 6 ? 0.5 : 1 }}>
                  VERIFY &amp; SAVE
                </button>
                <button type="button" disabled={saving} onClick={() => save()}
                  style={{ background: 'transparent', color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', border: '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 4, padding: '0 14px', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', cursor: 'pointer' }}>
                  SEND A NEW CODE
                </button>
              </div>
            </div>
          )}
        </Field>
        {!isCustomer && (<>
        <Field label="INSTAGRAM">
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', padding: '14px 0 14px 16px' }}>@</span>
            <input value={form.instagram?.replace('@', '') ?? ''} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="yourusername" style={{ ...inputStyle, border: 'none', paddingLeft: 4 }} />
          </div>
        </Field>

        {!isBrand && (
          <Field label={form.account_type === 'vendor' ? 'WHAT YOU OFFER' : 'WHAT YOU DO'} hint="for directory">
            <RolePicker
              value={form.roles}
              onChange={roles => setForm(f => ({ ...f, roles }))}
              options={form.account_type === 'vendor' ? SERVICE_ROLES : roleOptions}
            />
          </Field>
        )}

        <Field label={isBrand ? 'ABOUT / WHAT YOU’RE LOOKING FOR' : 'BIO'} hint="for directory">
          <textarea
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder={isBrand ? 'Who you are as a brand and the kind of creatives or work you’re looking for.' : 'A sentence or two about you and your work.'}
            maxLength={600}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 6, textAlign: 'right' }}>{form.bio.length}/600</div>
        </Field>

        </>)}
        </>)}

        {/* Always mounted (hidden elsewhere) so the photo count feeds the
            directory checklist on Edit profile. */}
        {!isCustomer && (
          <div style={{ display: sec === 'portfolio' ? 'block' : 'none' }}>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))', marginBottom: 14, lineHeight: 1.5 }}>
              Photos save as soon as they upload.
            </div>
            <PortfolioManager onCountChange={setPortfolioCount} ownerName={form.full_name} />
          </div>
        )}

        {/* Production Services listings (migration 135). Saves per listing. */}
        {!isCustomer && sec === 'listings' && <ListingsManager roles={form.roles} />}

        {!isCustomer && (<>
        {sec === 'edit' && (
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
                  style={{ background: 'transparent', border: '1px solid rgba(var(--t-fg-rgb), calc(0.15 * var(--t-a)))', color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', borderRadius: 4, width: 40, cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ))}
            {form.links.length < 8 && (
              <button type="button" onClick={() => setForm(f => ({ ...f, links: [...f.links, { label: '', url: '' }] }))}
                style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', borderRadius: 4, padding: '9px 14px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
                + Add link
              </button>
            )}
          </div>
        </Field>

        )}

        {sec === 'credits' && (<>
        <Field label="CREDITS" hint="your résumé">
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', marginBottom: 10, lineHeight: 1.5 }}>
            Publications, campaigns, music videos, shows, awards, schooling. They appear under the CREDITS tab on your profile, grouped by type, newest first.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {form.credits.map((c, i) => (
              <div key={i} style={{ border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', borderRadius: 8, padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: 'rgba(var(--t-fg-rgb), calc(0.02 * var(--t-a)))' }}>
                <select value={c.type} onChange={e => setCredit(i, { type: e.target.value as Credit['type'] })}
                  style={{ ...inputStyle, padding: '10px 12px', colorScheme: 'var(--t-scheme)' as any }}>
                  {CREDIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={c.year ?? ''} inputMode="numeric" placeholder="Year" maxLength={4}
                  onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setCredit(i, { year: v ? Number(v) : null }) }}
                  style={{ ...inputStyle, padding: '10px 12px' }} />
                <input value={c.title} onChange={e => setCredit(i, { title: e.target.value })} placeholder="Title / client (e.g. Vogue Mexico)" maxLength={120}
                  style={{ ...inputStyle, padding: '10px 12px', gridColumn: '1 / -1' }} />
                <input value={c.role} onChange={e => setCredit(i, { role: e.target.value })} placeholder="Your role (e.g. Photographer)" maxLength={80}
                  style={{ ...inputStyle, padding: '10px 12px' }} />
                <input value={c.url} onChange={e => setCredit(i, { url: e.target.value })} placeholder="Link (optional)" maxLength={300}
                  style={{ ...inputStyle, padding: '10px 12px' }} />
                <button type="button" onClick={() => setForm(f => ({ ...f, credits: f.credits.filter((_, j) => j !== i) }))}
                  style={{ gridColumn: '1 / -1', justifySelf: 'end', background: 'transparent', border: 'none', color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>Remove</button>
              </div>
            ))}
            {form.credits.length < MAX_CREDITS && (
              <button type="button" onClick={() => setForm(f => ({ ...f, credits: [...f.credits, { type: 'Publication', title: '', role: '', year: new Date().getFullYear(), url: '' }] }))}
                style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px dashed rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', borderRadius: 4, padding: '8px 14px', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>
                + Add credit
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <label style={{ border: '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))', borderRadius: 4, padding: '9px 14px', fontFamily: 'Inter', fontSize: 12, color: 'var(--t-fg)', cursor: cvBusy ? 'default' : 'pointer', opacity: cvBusy ? 0.6 : 1 }}>
              {cvBusy ? 'UPLOADING…' : form.cv_url ? 'REPLACE CV (PDF)' : 'UPLOAD CV (PDF)'}
              <input type="file" accept="application/pdf" disabled={cvBusy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadCv(f) }} style={{ display: 'none' }} />
            </label>
            {form.cv_url && (
              <>
                <a href={form.cv_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--t-gold)' }}>View</a>
                <button type="button" onClick={() => setForm(f => ({ ...f, cv_url: null }))} style={{ background: 'transparent', border: 'none', color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>Remove</button>
              </>
            )}
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 6 }}>
            Optional. Members get a &ldquo;Download CV&rdquo; button on your profile. Click <strong>Save Changes</strong> to keep changes.
          </div>
        </Field>

        <Field label="VIDEO / REEL LINK">
          <input
            value={form.video_url}
            onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))}
            placeholder="YouTube or Vimeo link (optional)" maxLength={300}
            style={inputStyle}
          />
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 6 }}>
            We don&apos;t host video — paste a link and it&apos;ll embed on your profile.
          </div>
        </Field>

        </>)}

        {sec === 'privacy' && (<>
        {/* Public contact display */}
        <Field label="CONTACT SHOWN ON YOUR PROFILE">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' }}>
              <input type="checkbox" checked={form.show_email} onChange={e => setForm(f => ({ ...f, show_email: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              Show my email to other members
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))' }}>
              <input type="checkbox" checked={form.show_phone} onChange={e => setForm(f => ({ ...f, show_phone: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              Show my phone to other members
            </label>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))' }}>
              Off by default. These only ever show on your profile to signed-in members.
            </div>
          </div>
        </Field>

        {/* Directory opt-in */}
        <div
          onClick={() => setForm(f => ({ ...f, directory_opt_in: !f.directory_opt_in }))}
          style={{ background: 'rgba(var(--t-fg-rgb), calc(0.03 * var(--t-a)))', border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', borderRadius: 8, padding: '16px 18px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        >
          <div style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2, border: `1px solid ${form.directory_opt_in ? 'var(--t-fg)' : 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))'}`, background: form.directory_opt_in ? 'var(--t-fg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {form.directory_opt_in && <span style={{ color: 'var(--t-on-fg)', fontSize: 11, lineHeight: 1 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-fg)', marginBottom: 2 }}>List me in the creative directory</div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))', lineHeight: 1.5 }}>
              Let other Made Kulture members find you by role for collaborations. Only your name, roles, and Instagram are shown — never your email or phone. It works both ways: <strong style={{ color: 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))' }}>if you turn this off, you also won&apos;t be able to browse the directory.</strong>
            </div>
          </div>
        </div>
        </>)}
        </>)}

        {sec === 'privacy' && (<>
        {!isCustomer && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input type="checkbox" id="notify_email" checked={!!form.notify_email} onChange={e => setForm(f => ({ ...f, notify_email: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="notify_email" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', cursor: 'pointer' }}>
              Email me about new messages and casting interest
            </label>
          </div>
        )}

        {!isCustomer && (
          <label htmlFor="notify_sms" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 16 }}>
            <input type="checkbox" id="notify_sms" checked={!!form.notify_sms} onChange={e => setForm(f => ({ ...f, notify_sms: e.target.checked }))} style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, cursor: 'pointer' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', lineHeight: 1.55 }}>
              Text me about new messages and casting interest. By checking this you agree to receive recurring automated text messages from <strong style={{ color: 'rgba(var(--t-fg-rgb), calc(0.7 * var(--t-a)))' }}>Made Kulture</strong>. Message frequency varies. Message &amp; data rates may apply. Reply STOP to opt out, HELP for help. See our{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t-gold)' }} onClick={e => e.stopPropagation()}>Terms</a> and{' '}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t-gold)' }} onClick={e => e.stopPropagation()}>Privacy Policy</a>.
            </span>
          </label>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <input type="checkbox" id="sms_opt_in" checked={!!form.sms_opt_in} onChange={set('sms_opt_in')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
          <label htmlFor="sms_opt_in" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', cursor: 'pointer' }}>
            Send me SMS reminders before my bookings
          </label>
        </div>

        </>)}

        {sec !== 'portfolio' && sec !== 'listings' && !(isCustomer && (sec === 'look' || sec === 'credits')) && (
        <button type="submit" disabled={saving} style={{
          background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4,
          padding: '14px 32px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600,
          letterSpacing: '0.1em', cursor: 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>
        )}
        </div>
      </form>
      {coverSrc && <ImageCropper src={coverSrc} aspect={3} outWidth={1800} onCancel={closeCover} onCropped={onCoverCropped} />}
    </div>
  )
}

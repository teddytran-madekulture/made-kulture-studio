'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTurnstile } from '@/components/Turnstile'
import BlockedMembers from '@/components/BlockedMembers'

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))',
  borderRadius: 4, padding: '14px 16px', fontFamily: 'Inter', fontSize: 14, color: 'var(--t-fg)',
  outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em',
  color: 'rgba(var(--t-fg-rgb), calc(0.35 * var(--t-a)))', marginBottom: 8,
}
const btnStyle = (busy: boolean): React.CSSProperties => ({
  background: 'var(--t-fg)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4, padding: '13px 28px',
  fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, marginTop: 4, alignSelf: 'flex-start',
})
const okBox: React.CSSProperties = { background: 'rgba(60,255,120,0.1)', border: '1px solid rgba(60,255,120,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-ok)' }
const errBox: React.CSSProperties = { background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)' }

export default function SecurityPage() {
  const supabase = createClient()
  // The current-password check is a signInWithPassword, so it needs a bot token too.
  const bot = useTurnstile('auto')
  const [currentEmail, setCurrentEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentEmail(data.user?.email ?? ''))
  }, [supabase])

  // Password
  const [curPw, setCurPw] = useState(''); const [pw, setPw] = useState(''); const [pwc, setPwc] = useState('')
  const [pwSaving, setPwSaving] = useState(false); const [pwMsg, setPwMsg] = useState(''); const [pwErr, setPwErr] = useState('')
  const changePw = async (e: React.FormEvent) => {
    e.preventDefault(); setPwMsg(''); setPwErr('')
    if (pw !== pwc) { setPwErr('Passwords do not match.'); return }
    setPwSaving(true)
    // Safeguard: verify the current password before allowing a change.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email: currentEmail, password: curPw, options: { captchaToken: bot.token } })
    bot.reset()
    if (reauthErr) { setPwErr('Current password is incorrect.'); setPwSaving(false); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setPwErr(error.message)
    else { setPwMsg('Password updated.'); setCurPw(''); setPw(''); setPwc('') }
    setPwSaving(false)
  }

  // Email
  const [email, setEmail] = useState(''); const [emSaving, setEmSaving] = useState(false); const [emMsg, setEmMsg] = useState(''); const [emErr, setEmErr] = useState('')
  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setEmMsg(''); setEmErr('')
    if (!email.trim()) { setEmErr('Enter a new email.'); return }
    setEmSaving(true)
    // Goes through the server so the customer record (Plus, saved card,
    // history) follows the login once the link is clicked — lib/email-change.ts.
    const r = await fetch('/api/account/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })
    const d = await r.json().catch(() => ({}))
    const error = r.ok ? null : { message: d.error || 'Could not change your email.' }
    if (error) setEmErr(error.message)
    else { setEmMsg(`We sent a confirmation link to ${email.trim()}. Click it to finish switching your email — it won't change until you confirm.`); setEmail('') }
    setEmSaving(false)
  }

  // Delete account (2026-10-07 — required by Apple for the App Store app)
  const [delOpen, setDelOpen] = useState(false); const [delText, setDelText] = useState('')
  const [delBusy, setDelBusy] = useState(false); const [delErr, setDelErr] = useState('')
  const [delInfo, setDelInfo] = useState<{ creditCents: number; plus: { active: boolean; expiresAt: string | null } } | null>(null)
  const openDelete = async () => {
    setDelOpen(true); setDelErr(''); setDelInfo(null)
    const r = await fetch('/api/account/delete', { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setDelInfo(await r.json().catch(() => null))
  }
  const fmtMoney = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setDelErr('')
    if (delText.trim().toUpperCase() !== 'DELETE') { setDelErr('Type DELETE to confirm.'); return }
    setDelBusy(true)
    const r = await fetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: delText.trim() }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setDelErr(d.error || 'Could not delete your account.'); setDelBusy(false); return }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    window.location.href = '/?account=deleted'
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 32px' }}>LOGIN &amp; SECURITY</h1>

      <div className="sec-grid">
      {/* Change password */}
      <div style={{ background: 'var(--t-surface-lo)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', borderRadius: 8, padding: '24px', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Change password</div>
        <form onSubmit={changePw} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pwErr && <div style={errBox}>{pwErr}</div>}
          {pwMsg && <div style={okBox}>{pwMsg}</div>}
          <div>
            <label style={labelStyle}>CURRENT PASSWORD</label>
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} required placeholder="Your current password" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>NEW PASSWORD</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} placeholder="Min 6 characters" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>CONFIRM NEW PASSWORD</label>
            <input type="password" value={pwc} onChange={e => setPwc(e.target.value)} required minLength={6} style={inputStyle} />
          </div>
          {bot.widget}
          <button type="submit" disabled={pwSaving || bot.waiting} style={btnStyle(pwSaving)}>{pwSaving ? 'UPDATING…' : 'UPDATE PASSWORD'}</button>
        </form>
      </div>

      {/* Change email */}
      <div style={{ background: 'var(--t-surface-lo)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', borderRadius: 8, padding: '24px', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Change email</div>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', marginBottom: 16 }}>
          Current: {currentEmail || '—'}
        </div>
        <form onSubmit={changeEmail} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {emErr && <div style={errBox}>{emErr}</div>}
          {emMsg && <div style={okBox}>{emMsg}</div>}
          <div>
            <label style={labelStyle}>NEW EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={inputStyle} />
          </div>
          <button type="submit" disabled={emSaving} style={btnStyle(emSaving)}>{emSaving ? 'SENDING…' : 'UPDATE EMAIL'}</button>
        </form>
      </div>
      </div>

      <BlockedMembers />

      {/* Delete account */}
      <div style={{ marginTop: 32, background: 'var(--t-surface-lo)', border: '1px solid rgba(255,60,60,0.25)', borderRadius: 8, padding: '24px', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Delete account</div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, lineHeight: 1.55, color: 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))', marginBottom: 16 }}>
          Permanently deletes your login, profile, directory listing, portfolio, messages, saved cards and any studio credit. Plus stops renewing and isn’t refunded. Past booking receipts are kept for our records. This can’t be undone.
        </div>
        {!delOpen ? (
          <button type="button" onClick={openDelete}
            style={{ ...btnStyle(false), background: 'transparent', color: 'var(--t-err)', border: '1px solid var(--t-err)' }}>
            DELETE MY ACCOUNT
          </button>
        ) : (
          <form onSubmit={deleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {delErr && <div style={errBox}>{delErr}</div>}
            {delInfo && (delInfo.creditCents > 0 || delInfo.plus.active) && (
              <div style={{ ...errBox, lineHeight: 1.55 }}>
                {delInfo.creditCents > 0 && <div>You have <b>{fmtMoney(delInfo.creditCents)}</b> in studio credit. Deleting your account forfeits it.</div>}
                {delInfo.plus.active && (
                  <div style={{ marginTop: delInfo.creditCents > 0 ? 8 : 0 }}>
                    Your Plus membership {delInfo.plus.expiresAt ? <>is paid through <b>{fmtDate(delInfo.plus.expiresAt)}</b></> : 'is active'}. It won’t renew and isn’t refunded. If you come back with this email before then, it’ll still be there.
                  </div>
                )}
              </div>
            )}
            <div>
              <label style={labelStyle}>TYPE DELETE TO CONFIRM</label>
              <input value={delText} onChange={e => setDelText(e.target.value)} autoCapitalize="characters" autoComplete="off" placeholder="DELETE" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" disabled={delBusy}
                style={{ ...btnStyle(delBusy), background: 'var(--t-err)', color: '#fff' }}>
                {delBusy ? 'DELETING…' : 'PERMANENTLY DELETE'}
              </button>
              <button type="button" disabled={delBusy} onClick={() => { setDelOpen(false); setDelText(''); setDelErr('') }}
                style={{ ...btnStyle(false), background: 'transparent', color: 'var(--t-fg)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.2 * var(--t-a)))' }}>
                CANCEL
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

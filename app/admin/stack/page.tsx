'use client'

// Admin — Services & Stack reference. Every external service, what it does,
// where it lives, and roughly what it costs. NO secrets here — credentials
// live in Bitwarden; this page just tells you which Bitwarden entry to open.

import { useEffect, useState } from 'react'

const GOLD = '#d4a843'

interface Svc {
  name: string
  role: string
  url: string
  cost: string
  creds?: string
  group: string
}

const SERVICES: Svc[] = [
  // ── Core platform ──────────────────────────────────────────────────────
  { group: 'Core platform', name: 'Vercel', role: 'Hosts the booking website + all APIs. Deploys automatically on every git push. Environment variables (API keys the site uses) are stored here.', url: 'https://vercel.com/made-kulture/made-kulture-studio', cost: 'Free (Hobby plan)', creds: 'Login via GitHub account' },
  { group: 'Core platform', name: 'GitHub', role: 'Code repository for made-kulture-studio + runs the nightly automated database backup (Actions).', url: 'https://github.com', cost: 'Free', creds: 'Bitwarden: GitHub (2FA on)' },
  { group: 'Core platform', name: 'Supabase', role: 'The database (bookings, customers, props, June conversations & knowledge, tours), user logins, photo storage, realtime chat, and the 5-minute cron jobs (session reminders, June email polling).', url: 'https://supabase.com/dashboard/project/vvaftjcjydxdlkojnrfm', cost: 'Free plan', creds: 'Bitwarden: Supabase (DB password + 2FA)' },
  { group: 'Core platform', name: 'Squarespace', role: 'The original madekulture.com marketing site (layout, rules, terms pages) + the domain.', url: 'https://squarespace.com', cost: 'Subscription (existing)', creds: 'Bitwarden: Squarespace' },
  { group: 'Core platform', name: 'Acuity Scheduling', role: 'Legacy booking calendar — the site two-way syncs blocks with it so old-channel bookings and website bookings never collide.', url: 'https://acuityscheduling.com', cost: 'Via Squarespace subscription', creds: 'Bitwarden: Acuity' },

  // ── Money & messages ───────────────────────────────────────────────────
  { group: 'Money & messages', name: 'Square', role: 'All card payments — website checkout, cards on file, admin charges. Register hardware for the front desk (Phase 3, shelved).', url: 'https://squareup.com', cost: 'Per-transaction fees', creds: 'Bitwarden: Square (2FA on)' },
  { group: 'Money & messages', name: 'Twilio', role: 'Customer SMS: booking confirmations, session reminders, tour confirmations/cancellations. Toll-free number +1 (866) 329-7069.', url: 'https://console.twilio.com', cost: 'Pay per message (~1¢) + number fee', creds: 'Bitwarden: Twilio (2FA on)' },
  { group: 'Money & messages', name: 'Resend', role: 'Sends the transactional emails — booking confirmations, reminders, casting notifications.', url: 'https://resend.com', cost: 'Free tier', creds: 'API key in Vercel env' },
  { group: 'Money & messages', name: 'Google Voice', role: 'The public (832) 408-1631 text line (forwards to you).', url: 'https://voice.google.com', cost: 'Free', creds: 'Google account' },

  // ── Google ─────────────────────────────────────────────────────────────
  { group: 'Google', name: 'Google Workspace', role: 'teddytran@ and june@ mailboxes, the madekulture Google Calendar (bookings + tours sync there), and the Admin console (security settings, delegation).', url: 'https://admin.google.com', cost: 'Per user / month (2 users)', creds: 'Bitwarden: Google (2FA on)' },
  { group: 'Google', name: 'Google Cloud (project: Made Kulture)', role: 'Powers the calendar sync + June reading/sending email — Calendar API + Gmail API via the mk-calendar service account.', url: 'https://console.cloud.google.com', cost: 'Free at current usage', creds: 'Bitwarden: Google Calendar service account – Made Kulture' },

  // ── AI ─────────────────────────────────────────────────────────────────
  { group: 'AI', name: 'Anthropic (Claude API)', role: "June's brain — website chat, kiosk chat, email drafts. Model: Claude Sonnet.", url: 'https://platform.claude.com', cost: 'Pay per use (prepaid credits, pennies/convo)', creds: 'Bitwarden: Anthropic API – Made Kulture (June)' },
  { group: 'AI', name: 'OpenAI API', role: 'Props tooling — AI photo cleanup (background removal via ChatGPT edits) and auto-generated prop names/descriptions/tags in the admin.', url: 'https://platform.openai.com', cost: 'Pay per use (prepaid credits)', creds: 'Bitwarden: OpenAI (2FA on); key in Vercel env' },

  // ── Studio hardware & tools ────────────────────────────────────────────
  { group: 'Studio hardware & tools', name: 'igloohome (iglooaccess API)', role: 'Front + back-door smart locks — generate the per-booking door codes in confirmation texts/emails. Both locks live.', url: 'https://access.igloocompany.co', cost: '$2/lock/month × 2 locks (trial until Aug 1, 2026)', creds: 'Bitwarden: igloohome API – Made Kulture' },
  { group: 'Studio hardware & tools', name: 'Fully Kiosk Browser', role: 'Locks the Fire HD 10 tablet to the /kiosk page at the front desk.', url: 'https://www.fully-kiosk.com', cost: '~$8 one-time (Plus license)', creds: 'Kiosk exit PIN → Bitwarden' },
  { group: 'Studio hardware & tools', name: 'Cloudflare Workers', role: 'The studio temperature/humidity endpoint (Nest readings as JSON).', url: 'https://dash.cloudflare.com', cost: 'Free', creds: 'Bitwarden: Cloudflare' },
  { group: 'Studio hardware & tools', name: 'Bitwarden', role: 'THE password manager — every credential, API key, and passphrase for everything on this page lives here.', url: 'https://vault.bitwarden.com', cost: 'Free', creds: 'Master password (memorized)' },

  // ── Marketing & community ──────────────────────────────────────────────
  { group: 'Marketing & community', name: 'Instagram', role: '@madekulture — main marketing channel. (Future June channel: DMs.)', url: 'https://www.instagram.com/madekulture/', cost: 'Free', creds: 'Bitwarden: Instagram' },
  { group: 'Marketing & community', name: 'Sharegrid', role: 'Off-site equipment rental listings (in-studio gear rents through the site instead).', url: 'https://www.sharegrid.com/p/teddy_tran2', cost: 'Free listing', creds: 'Bitwarden: Sharegrid' },
]

export default function AdminStackPage() {
  const [unauth, setUnauth] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    fetch('/api/admin/badge').then(r => {
      if (r.status === 401) setUnauth(true)
      setChecked(true)
    }).catch(() => setChecked(true))
  }, [])

  if (!checked) return <div style={{ background: '#080808', minHeight: '100vh' }} />
  if (unauth) return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div>Not authorized — <a href="/admin" style={{ color: GOLD }}>log in</a></div>
    </div>
  )

  const groups = Array.from(new Set(SERVICES.map(s => s.group)))

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <a href="/admin/dashboard" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 13 }}>← Dashboard</a>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', margin: 0 }}>SERVICES & STACK</h1>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 28 }}>
          Everything Made Kulture runs on. No passwords here — every credential lives in Bitwarden; this page tells you which entry to look for.
        </p>

        {groups.map(g => (
          <div key={g} style={{ marginBottom: 30 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: GOLD, marginBottom: 12 }}>{g.toUpperCase()}</div>
            {SERVICES.filter(s => s.group === g).map(s => (
              <div key={s.name} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                    {s.name} <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>↗</span>
                  </a>
                  <span style={{ fontSize: 12, color: '#4ade80' }}>{s.cost}</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55, marginTop: 6 }}>{s.role}</div>
                {s.creds && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>🔑 {s.creds}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

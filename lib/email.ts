import { Resend } from 'resend'
import { googleCalUrl, STUDIO_ADDRESS } from '@/lib/calendar'
import { createClient } from '@supabase/supabase-js'

// Lazy-initialize so the build doesn't fail when env var isn't available at compile time
function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Check if a template is enabled and return its custom subject (or null for default)
async function getTemplateSettings(key: string): Promise<{ enabled: boolean; subject: string | null }> {
  try {
    const { data } = await supabase
      .from('email_templates')
      .select('enabled, subject')
      .eq('key', key)
      .single()
    return { enabled: data?.enabled ?? true, subject: data?.subject ?? null }
  } catch {
    return { enabled: true, subject: null }
  }
}

// Replace {var} tokens in a subject template
function fillSubject(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? k)
}

// Send via Resend and surface failures. The Resend SDK returns { data, error }
// instead of throwing, so without this an unverified-domain rejection looks
// like success. We log clearly and throw so callers' .catch records it.
async function sendEmail(label: string, opts: Parameters<ReturnType<typeof getResend>['emails']['send']>[0]) {
  if (!process.env.RESEND_API_KEY) {
    console.error(`[email] ${label} NOT sent — RESEND_API_KEY is not set`)
    return null
  }
  const { data, error } = await getResend().emails.send(opts as any)
  if (error) {
    console.error(`[email] ${label} send FAILED:`, JSON.stringify(error))
    throw new Error(`Resend (${label}): ${(error as any)?.message || 'send failed'}`)
  }
  console.log(`[email] ${label} sent`, (data as any)?.id ? `id=${(data as any).id}` : '')
  return data
}

// Sender address. Override with EMAIL_FROM env (e.g. while the domain is being
// verified, set it to "Made Kulture <onboarding@resend.dev>").
const FROM_EMAIL  = process.env.EMAIL_FROM || 'Made Kulture <bookings@madekulture.com>'
const REPLY_TO    = 'Teddy @ Made Kulture <teddytran@madekulture.com>'
const OWNER_EMAIL = 'teddytran@madekulture.com'
const BRAND_COLOR = '#1a1a1a'
const ACCENT_COLOR = '#d4a843'

// Base URL of the booking app (where customers manage/rebook). Matches the rest
// of the app; falls back to the live Vercel URL. NOTE: bookings live in THIS app,
// not the old Squarespace madekulture.com site — links must point here.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

// ─── HTML base layout ─────────────────────────────────────────────────────────
function layout(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Made Kulture</title>
</head>
<body style="margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#000;padding:24px 32px;text-align:center;border-bottom:2px solid ${ACCENT_COLOR};">
              <span style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em;text-transform:uppercase;">MADE KULTURE</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#111;padding:20px 32px;text-align:center;border-top:1px solid #333;">
              <p style="margin:0;font-size:12px;color:#666;">4825 Gulf Freeway, Houston TX 77023 &nbsp;·&nbsp; (832) 408-1631 &nbsp;·&nbsp; <a href="https://madekulture.com" style="color:#666;text-decoration:none;">madekulture.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Booking confirmation (to customer) ───────────────────────────────────────
interface BookingConfirmationData {
  customerName: string
  customerEmail: string
  setName: string
  date: string        // e.g. "Sat, Jul 12"
  startTime: string   // e.g. "2pm"
  endTime: string     // e.g. "5pm"
  totalAmount: number
  bookingId: string
  notes?: string
  scheduleLines?: string[] // multi-set orders: one line per set, e.g. "Set A — Sat Jul 12, 2pm–5pm"
  guestCount?: number      // declared party size (the booked limit)
  doorCode?: string        // per-booking front-door code (igloohome algoPIN)
  startISO?: string        // primary window start/end (raw ISO) for calendar links
  endISO?: string
  checkInToken?: string    // gates the downloadable .ics link
}

export async function sendBookingConfirmation(data: BookingConfirmationData) {
  const { enabled, subject: customSubject } = await getTemplateSettings('booking_confirmation')
  if (!enabled) return null

  const { customerName, customerEmail, setName, date, startTime, endTime, totalAmount, bookingId, notes, scheduleLines, guestCount, doorCode, startISO, endISO, checkInToken } = data
  const isBuyout = /full studio takeover/i.test(setName) // buyouts are private — skip the shared-studio note

  const calDetails = [`Your Made Kulture session: ${setName}.`, doorCode ? `Front-door code: ${doorCode}.` : '', `Manage: ${APP_URL}/account`].filter(Boolean).join(' ')
  const gCalLink = (startISO && endISO)
    ? googleCalUrl({ title: `Made Kulture — ${setName}`, startISO, endISO, location: STUDIO_ADDRESS, details: calDetails })
    : null
  const icsLink = (checkInToken) ? `${APP_URL}/api/bookings/${bookingId}/ics?token=${checkInToken}` : null

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;letter-spacing:0.05em;">Booking Confirmed</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#999;">You're all set, ${customerName}. Here are your details:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      ${scheduleLines && scheduleLines.length ? `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Your Sessions</span><br/>
          ${scheduleLines.map(l => `<span style="font-size:15px;color:#fff;font-weight:600;display:block;margin-top:6px;">${l}</span>`).join('')}
        </td>
      </tr>` : `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Studio Set</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">${setName}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">${date}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Time</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">${startTime} – ${endTime}</span>
        </td>
      </tr>`}
      ${guestCount ? `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Party Size</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">${guestCount} ${guestCount === 1 ? 'person' : 'people'} — your booked limit</span>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Total Paid</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">$${totalAmount.toFixed(2)}</span>
        </td>
      </tr>
      ${notes ? `
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Notes</span><br/>
          <span style="font-size:14px;color:#ccc;">${notes}</span>
        </td>
      </tr>` : ''}
    </table>

    ${!isBuyout ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(201,178,126,0.08);border:1px solid rgba(201,178,126,0.25);border-radius:6px;margin-bottom:28px;">
      <tr><td style="padding:14px 20px;"><p style="margin:0;font-size:13px;color:#e6c07a;line-height:1.6;"><strong>Open studio, shared energy.</strong> You've got your set — and you'll be creating alongside other creatives shooting in the same open warehouse. That shared energy is part of the Made Kulture experience.</p></td></tr>
    </table>` : ''}

    <!-- Manage Booking CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <a href="${APP_URL}/account" style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 32px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;margin-right:8px;">Change / Cancel Booking</a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:10px;">
          <p style="margin:0;font-size:12px;color:#666;">Log in with your email to manage your booking</p>
        </td>
      </tr>
    </table>

    ${doorCode ? `
    <!-- Door Code -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid ${ACCENT_COLOR};border-radius:6px;padding:20px 24px;margin-bottom:16px;">
      <tr>
        <td align="center">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">Your Front-Door Code</p>
          <p style="margin:0 0 6px;font-size:34px;font-weight:700;color:#fff;letter-spacing:0.18em;font-family:monospace;">${doorCode.replace(/(\d{3})(?=\d)/g, '$1 ')}</p>
          <p style="margin:0;font-size:12px;color:#999;">Enter this on the <strong style="color:#ccc;">front-door</strong> keypad, then press the unlock key. It only works during your booked time. Don't share it.</p>
        </td>
      </tr>
    </table>` : ''}

    ${gCalLink ? `
    <!-- Add to Calendar -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td align="center">
          <p style="margin:0 0 10px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Add to your calendar</p>
          <a href="${gCalLink}" style="display:inline-block;background:#111;border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:12px;text-decoration:none;padding:11px 20px;border-radius:4px;margin:0 4px 8px;">Google Calendar</a>
          ${icsLink ? `<a href="${icsLink}" style="display:inline-block;background:#111;border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:12px;text-decoration:none;padding:11px 20px;border-radius:4px;margin:0 4px 8px;">Apple / Outlook</a>` : ''}
        </td>
      </tr>
    </table>` : ''}

    <!-- When You Arrive -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:16px;">
      <tr>
        <td>
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">When You Arrive</p>
          <ul style="margin:0;padding:0 0 0 16px;color:#bbb;font-size:13px;line-height:1.8;">
            <li style="margin-bottom:6px;">Drive to the <strong style="color:#ddd;">back of the building</strong> for entrance and street parking. If no spots are available, continue around the block to the front. Do not block neighbors' driveways.</li>
            <li style="margin-bottom:6px;">The building looks old and dilapidated — that's intentional. Use the <strong style="color:#ddd;">small doorway entrances</strong> to enter. If you have large items and the garage is closed, DM us on Instagram <a href="https://instagram.com/madekulture" style="color:${ACCENT_COLOR};text-decoration:none;">@madekulture</a>.</li>
            <li>If you know your set, go straight to it and get started. If you need help, check in and someone will show you to your spot.</li>
          </ul>
        </td>
      </tr>
    </table>

    <!-- Before You Leave -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:16px;">
      <tr>
        <td>
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">Before You Leave</p>
          <ul style="margin:0;padding:0 0 0 16px;color:#bbb;font-size:13px;line-height:1.8;">
            <li style="margin-bottom:6px;">Return all props to approximately where you found them.</li>
            <li style="margin-bottom:6px;">Leave your set in the same condition you arrived. <strong style="color:#ddd;">Excessive mess or trash may result in a cleaning fee.</strong></li>
            <li>Setup and breakdown must happen within your booked time — overages past 15 min are charged an additional hour.</li>
          </ul>
        </td>
      </tr>
    </table>

    <!-- Cancellation Policy -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      <tr>
        <td>
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">Cancellation Policy</p>
          <ul style="margin:0;padding:0 0 0 16px;color:#bbb;font-size:13px;line-height:1.8;">
            <li style="margin-bottom:6px;"><strong style="color:#ddd;">48+ hours before:</strong> Full refund.</li>
            <li><strong style="color:#ddd;">Less than 48 hours:</strong> No refund.</li>
          </ul>
          <p style="margin:10px 0 0;font-size:12px;color:#666;">To cancel or reschedule, use the button above or text us at (832) 408-1631.</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#888;">📍 <a href="https://maps.google.com/?q=4825+Gulf+Freeway+Houston+TX+77023" style="color:${ACCENT_COLOR};text-decoration:none;">4825 Gulf Freeway, Houston TX 77023</a></p>
    <p style="margin:0 0 24px;font-size:13px;color:#888;">Questions? Text us at <a href="sms:+18324081631" style="color:${ACCENT_COLOR};text-decoration:none;">(832) 408-1631</a></p>

    <p style="margin:0;font-size:11px;color:#555;">Booking reference: #${bookingId.slice(0, 8).toUpperCase()}</p>
  `

  const defaultSubject = `Booking Confirmed — ${setName} on ${date}`
  const subject = customSubject
    ? fillSubject(customSubject, { set: setName, date, customer: customerName })
    : defaultSubject

  return sendEmail('booking_confirmation', {
    from: FROM_EMAIL,
    reply_to: REPLY_TO,
    to: customerEmail,
    subject,
    html: layout(body),
  })
}

// ─── New booking alert (to owner) ─────────────────────────────────────────────
interface NewBookingAlertData {
  customerName: string
  customerEmail: string
  customerPhone?: string
  setName: string
  date: string
  startTime: string
  endTime: string
  totalAmount: number
  bookingId: string
  source: string
  notes?: string
  scheduleLines?: string[]
}

export async function sendNewBookingAlert(data: NewBookingAlertData) {
  const { enabled, subject: customSubject } = await getTemplateSettings('new_booking_alert')
  if (!enabled) return null

  const { customerName, customerEmail, customerPhone, setName, date, startTime, endTime, totalAmount, bookingId, source, notes, scheduleLines } = data

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">New Booking</h1>
    <p style="margin:0 0 24px;font-size:13px;color:#888;">Source: <strong style="color:#bbb;">${source}</strong></p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:24px;">
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Customer</span><br/>
        <span style="font-size:15px;color:#fff;">${customerName}</span>
        <span style="font-size:13px;color:#888;"> — ${customerEmail}${customerPhone ? ' — ' + customerPhone : ''}</span>
      </td></tr>
      ${scheduleLines && scheduleLines.length ? `
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Sessions</span><br/>
        ${scheduleLines.map(l => `<span style="font-size:15px;color:#fff;display:block;margin-top:4px;">${l}</span>`).join('')}
      </td></tr>` : `
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Set</span><br/>
        <span style="font-size:15px;color:#fff;">${setName}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date &amp; Time</span><br/>
        <span style="font-size:15px;color:#fff;">${date} &nbsp; ${startTime} – ${endTime}</span>
      </td></tr>`}
      <tr><td style="padding:6px 0;${notes ? 'border-bottom:1px solid #2a2a2a;' : ''}">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Amount</span><br/>
        <span style="font-size:18px;font-weight:700;color:${ACCENT_COLOR};">$${totalAmount.toFixed(2)}</span>
      </td></tr>
      ${notes ? `<tr><td style="padding:6px 0;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Notes</span><br/>
        <span style="font-size:14px;color:#ccc;">${notes}</span>
      </td></tr>` : ''}
    </table>

    <a href="${APP_URL}/admin/dashboard" style="display:inline-block;background:${ACCENT_COLOR};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:12px 24px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">View in Dashboard</a>

    <p style="margin:20px 0 0;font-size:11px;color:#555;">Booking ID: ${bookingId}</p>
  `

  const defaultSubject = `New Booking — ${customerName} · ${setName} · ${date}`
  const subject = customSubject
    ? fillSubject(customSubject, { set: setName, date, customer: customerName })
    : defaultSubject

  return sendEmail('new_booking_alert', {
    from: FROM_EMAIL,
    to: OWNER_EMAIL,
    subject,
    html: layout(body),
  })
}

// ─── Cancellation email (to customer) ─────────────────────────────────────────
interface CancellationData {
  customerName: string
  customerEmail: string
  setName: string
  date: string
  startTime: string
  endTime: string
  refundAmount?: number
}

export async function sendCancellationEmail(data: CancellationData) {
  const { enabled, subject: customSubject } = await getTemplateSettings('cancellation')
  if (!enabled) return null

  const { customerName, customerEmail, setName, date, startTime, endTime, refundAmount } = data

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;">Booking Cancelled</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#999;">Hi ${customerName}, your booking has been cancelled.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Set</span><br/>
        <span style="font-size:15px;color:#fff;">${setName}</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/>
        <span style="font-size:15px;color:#fff;">${date}</span>
      </td></tr>
      <tr><td style="padding:8px 0;${refundAmount !== undefined ? 'border-bottom:1px solid #2a2a2a;' : ''}">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Time</span><br/>
        <span style="font-size:15px;color:#fff;">${startTime} – ${endTime}</span>
      </td></tr>
      ${refundAmount !== undefined ? `<tr><td style="padding:8px 0;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Refund</span><br/>
        <span style="font-size:15px;color:#4ade80;">${refundAmount > 0 ? '$' + refundAmount.toFixed(2) + ' will be refunded within 5–10 business days' : 'No refund — cancelled within 48 hours'}</span>
      </td></tr>` : ''}
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#888;">Want to rebook? Visit <a href="${APP_URL}/book" style="color:${ACCENT_COLOR};text-decoration:none;">our booking page</a></p>
    <p style="margin:0;font-size:13px;color:#888;">Questions? Text <a href="sms:+18324081631" style="color:${ACCENT_COLOR};text-decoration:none;">(832) 408-1631</a></p>
  `

  const defaultSubject = `Booking Cancelled — ${setName} on ${date}`
  const subject = customSubject
    ? fillSubject(customSubject, { set: setName, date, customer: customerName })
    : defaultSubject

  return sendEmail('cancellation', {
    from: FROM_EMAIL,
    reply_to: REPLY_TO,
    to: customerEmail,
    subject,
    html: layout(body),
  })
}

// ─── 24-hour reminder (to customer) ──────────────────────────────────────────
interface BookingReminderData {
  customerName: string
  customerEmail: string
  setName: string
  date: string        // e.g. "Sat, Jul 12"
  startTime: string   // e.g. "2pm"
  endTime: string     // e.g. "5pm"
  totalAmount: number
  bookingId: string
}

export async function sendBookingReminder(data: BookingReminderData) {
  const { enabled, subject: customSubject } = await getTemplateSettings('booking_reminder')
  if (!enabled) return null

  const { customerName, customerEmail, setName, date, startTime, endTime, totalAmount, bookingId } = data

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;letter-spacing:0.05em;">Your Shoot is Tomorrow</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#999;">Hey ${customerName} — just a quick reminder about your session at Made Kulture.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Studio Set</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">${setName}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">${date}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Time</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">${startTime} – ${endTime}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;">
          <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Total Charged</span><br/>
          <span style="font-size:15px;color:#fff;font-weight:600;">$${totalAmount.toFixed(2)}</span>
        </td>
      </tr>
    </table>

    <!-- Directions CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <a href="https://maps.google.com/?q=4825+Gulf+Freeway+Houston+TX+77023" style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 32px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">Get Directions</a>
        </td>
      </tr>
    </table>

    <!-- Arrival tips -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:16px;">
      <tr>
        <td>
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">A Few Things to Know</p>
          <ul style="margin:0;padding:0 0 0 16px;color:#bbb;font-size:13px;line-height:1.8;">
            <li style="margin-bottom:6px;">Your set unlocks at your <strong style="color:#ddd;">booked start time</strong> — you will not be able to get in early, so plan to arrive a few minutes ahead and be ready to start on time. Setup and breakdown happen within your booked time.</li>
            <li style="margin-bottom:6px;">Drive to the <strong style="color:#ddd;">back of the building</strong> for entrance and street parking.</li>
            <li style="margin-bottom:6px;">Return all props to their original spots before you leave.</li>
            <li>Questions before you arrive? Text us at <a href="sms:+18324081631" style="color:${ACCENT_COLOR};text-decoration:none;">(832) 408-1631</a>.</li>
          </ul>
        </td>
      </tr>
    </table>

    <!-- Manage booking -->
    <p style="margin:16px 0 4px;font-size:13px;color:#666;">Need to cancel? Cancellations within 48 hours are non-refundable.</p>
    <p style="margin:0 0 24px;font-size:13px;color:#666;">To manage your booking, visit <a href="${APP_URL}/account" style="color:${ACCENT_COLOR};text-decoration:none;">your account page</a>.</p>

    <p style="margin:0;font-size:11px;color:#555;">Booking reference: #${bookingId.slice(0, 8).toUpperCase()}</p>
  `

  const defaultSubject = `See you tomorrow — ${setName} at ${startTime}`
  const subject = customSubject
    ? fillSubject(customSubject, { set: setName, date, customer: customerName })
    : defaultSubject

  return sendEmail('reminder', {
    from: FROM_EMAIL,
    reply_to: REPLY_TO,
    to: customerEmail,
    subject,
    html: layout(body),
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatTimeLabel(hour: number): string {
  const h = Math.floor(hour)
  const m = hour % 1 >= 0.5 ? 30 : 0
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

export function formatDateLabel(isoDate: string): string {
  // isoDate: YYYY-MM-DD
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

// ─── Community notifications ──────────────────────────────────────────────────

const NOTIF_FOOTER = (link: string) =>
  `<p style="margin:0;font-size:12px;color:#666;">You can turn these emails off in your <a href="${link}" style="color:${ACCENT_COLOR};text-decoration:none;">profile settings</a>.</p>`

const NOTIF_BUTTON = (href: string, label: string) =>
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td align="center"><a href="${href}" style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 32px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">${label}</a></td></tr></table>`

export async function sendNewMessageEmail(opts: { to: string; fromName: string; conversationId: string }) {
  const link = `${APP_URL}/account/messages/${opts.conversationId}`
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">New message</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#999;"><strong style="color:#fff;">${esc(opts.fromName)}</strong> sent you a message on Made Kulture.</p>
    ${NOTIF_BUTTON(link, 'Read &amp; reply')}
    ${NOTIF_FOOTER(`${APP_URL}/account/profile`)}
  `
  return sendEmail('new_message', { from: FROM_EMAIL, reply_to: REPLY_TO, to: opts.to, subject: `${opts.fromName} messaged you on Made Kulture`, html: layout(body) })
}

export async function sendCastingInterestEmail(opts: { to: string; interestedName: string; castingTitle: string; castingId: string }) {
  const link = `${APP_URL}/account/castings/${opts.castingId}`
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Someone&rsquo;s interested</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#999;"><strong style="color:#fff;">${esc(opts.interestedName)}</strong> is interested in your casting: <strong style="color:#fff;">${esc(opts.castingTitle)}</strong>.</p>
    ${NOTIF_BUTTON(link, 'View casting')}
    ${NOTIF_FOOTER(`${APP_URL}/account/profile`)}
  `
  return sendEmail('casting_interest', { from: FROM_EMAIL, reply_to: REPLY_TO, to: opts.to, subject: `${opts.interestedName} is interested in "${opts.castingTitle}"`, html: layout(body) })
}

export async function sendCastingConfirmedEmail(opts: { to: string; castingTitle: string; castingId: string; role?: string | null }) {
  const link = `${APP_URL}/account/castings/${opts.castingId}`
  const roleLine = opts.role ? ` as <strong style="color:#fff;">${esc(opts.role)}</strong>` : ''
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">You&rsquo;re confirmed</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#999;">You&rsquo;ve been added to the team${roleLine} for <strong style="color:#fff;">${esc(opts.castingTitle)}</strong>. See the crew and details on the casting.</p>
    ${NOTIF_BUTTON(link, 'View casting')}
    ${NOTIF_FOOTER(`${APP_URL}/account/profile`)}
  `
  return sendEmail('casting_confirmed', { from: FROM_EMAIL, reply_to: REPLY_TO, to: opts.to, subject: `You're confirmed for "${opts.castingTitle}"`, html: layout(body) })
}

// Owner alert when a booking is cancelled (not template-gated — you always want to know).
export async function sendCancellationOwnerAlert(opts: {
  customerName: string; customerEmail?: string; customerPhone?: string; setName: string; date: string; startTime: string; endTime: string; within48: boolean
}) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Booking Cancelled</h1>
    <p style="margin:0 0 24px;font-size:13px;color:#888;">A customer cancelled a booking.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:20px;">
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Customer</span><br/>
        <span style="font-size:15px;color:#fff;">${esc(opts.customerName)}</span>
        <span style="font-size:13px;color:#888;">${opts.customerEmail ? ' — ' + esc(opts.customerEmail) : ''}${opts.customerPhone ? ' — ' + esc(opts.customerPhone) : ''}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Session</span><br/>
        <span style="font-size:15px;color:#fff;">${esc(opts.setName)} — ${opts.date}, ${opts.startTime}–${opts.endTime}</span>
      </td></tr>
      <tr><td style="padding:6px 0;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Timing</span><br/>
        <span style="font-size:15px;color:${opts.within48 ? '#ff8080' : '#4ade80'};">${opts.within48 ? 'Within 48 hours — no refund' : '48+ hours out — refund applies'}</span>
      </td></tr>
    </table>
  `
  return sendEmail('cancellation_owner_alert', { from: FROM_EMAIL, to: OWNER_EMAIL, subject: `Cancelled — ${opts.setName} on ${opts.date}`, html: layout(body) })
}

// ─── Short-notice booking request (to owner) ──────────────────────────────────
export async function sendShortNoticeRequestAlert(data: {
  customerName: string; customerEmail: string; desiredSetName?: string | null; desiredDate?: string | null; desiredStart?: number | null; note?: string | null; approveUrl: string
}) {
  const when = data.desiredDate
    ? `${formatDateLabel(data.desiredDate)}${data.desiredStart != null ? ' · ' + formatTimeLabel(Math.floor(data.desiredStart)) : ''}`
    : 'Not specified'
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;font-size:11px;letter-spacing:0.12em;color:#888;">${k}</td><td style="padding:6px 0;font-size:14px;color:#fff;text-align:right;">${v}</td></tr>`
  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#fff;">Short-notice booking request</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#aaa;line-height:1.6;"><strong style="color:#fff;">${esc(data.customerName)}</strong> (${esc(data.customerEmail)}) is asking to book inside the 48-hour window.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #333;border-bottom:1px solid #333;margin-bottom:24px;">
      ${data.desiredSetName ? row('SET', esc(data.desiredSetName)) : ''}
      ${row('REQUESTED', when)}
      ${data.note ? row('NOTE', esc(data.note)) : ''}
    </table>
    <a href="${data.approveUrl}" style="display:inline-block;background:${ACCENT_COLOR};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">Review &amp; approve</a>
    <p style="margin:20px 0 0;font-size:12px;color:#666;line-height:1.6;">Or open your admin dashboard — pending requests show at the top with Allow buttons.</p>
  `
  return sendEmail('short_notice_request', {
    from: FROM_EMAIL,
    reply_to: REPLY_TO,
    to: OWNER_EMAIL,
    subject: `Short-notice request — ${data.customerName}`,
    html: layout(body),
  })
}

// ─── Short-notice approved (to customer) ──────────────────────────────────────
export async function sendShortNoticeApprovedEmail(data: {
  customerName: string; customerEmail: string; grantedUntil?: string | null; timedLabel?: string | null
}) {
  const first = (data.customerName || '').split(' ')[0] || 'there'
  const windowText = data.timedLabel
    ? `<strong style="color:#fff;">${esc(data.timedLabel)}</strong>`
    : `through <strong style="color:#fff;">${formatDateLabel(data.grantedUntil || '')}</strong>`
  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#fff;">You're cleared to book short-notice</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#aaa;line-height:1.6;">Hi ${esc(first)} — you can now book inside the 48-hour window ${windowText}. Head to availability and grab your time.</p>
    <a href="${APP_URL}/availability" style="display:inline-block;background:${ACCENT_COLOR};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">Book now</a>
  `
  return sendEmail('short_notice_approved', {
    from: FROM_EMAIL,
    reply_to: REPLY_TO,
    to: data.customerEmail,
    subject: 'You can now book short-notice at Made Kulture',
    html: layout(body),
  })
}

// ─── Plus membership receipt (to customer) ───────────────────────────────────
export async function sendPlusReceiptEmail(data: {
  customerName: string; customerEmail: string; amountCents: number; expiresAt: string
}) {
  const first = (data.customerName || '').split(' ')[0] || 'there'
  const amount = `$${(data.amountCents / 100).toFixed(2)}`
  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#fff;">Welcome to Made Kulture Plus</h1>
    <p style="margin:0 0 16px;font-size:14px;color:#aaa;line-height:1.6;">Hi ${esc(first)} — your Plus membership is active. You can now see near-term availability and request short-notice bookings.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #333;border-bottom:1px solid #333;margin-bottom:20px;">
      <tr><td style="padding:6px 0;font-size:11px;letter-spacing:0.12em;color:#888;">PAID</td><td style="padding:6px 0;font-size:14px;color:#fff;text-align:right;">${amount}</td></tr>
      <tr><td style="padding:6px 0;font-size:11px;letter-spacing:0.12em;color:#888;">RENEWS</td><td style="padding:6px 0;font-size:14px;color:#fff;text-align:right;">${formatDateLabel(data.expiresAt.split('T')[0])}</td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:12px;color:#888;line-height:1.6;">Your membership renews automatically each year at the then-current price. Cancel auto-renew anytime from your account — your benefits run through the end of your paid year. Membership fees are non-refundable.</p>
    <a href="${APP_URL}/availability" style="display:inline-block;background:${ACCENT_COLOR};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">See availability</a>
  `
  return sendEmail('plus_receipt', {
    from: FROM_EMAIL, reply_to: REPLY_TO, to: data.customerEmail,
    subject: 'Your Made Kulture Plus membership', html: layout(body),
  })
}

// ─── Generic branded notice (used by the delegated-payment flow) ─────────────
export async function sendSimpleEmail(opts: {
  to: string
  subject: string
  heading: string
  paragraphs: string[]
  ctaText?: string
  ctaUrl?: string
  label?: string
}) {
  const paras = opts.paragraphs
    .map(p => `<p style="margin:0 0 16px;font-size:14px;color:#aaa;line-height:1.6;">${p}</p>`)
    .join('')
  const cta = opts.ctaText && opts.ctaUrl
    ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:${ACCENT_COLOR};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 28px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">${esc(opts.ctaText)}</a>`
    : ''
  const body = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#fff;">${esc(opts.heading)}</h1>
    ${paras}
    ${cta}
  `
  return sendEmail(opts.label ?? 'simple_notice', {
    from: FROM_EMAIL,
    reply_to: REPLY_TO,
    to: opts.to,
    subject: opts.subject,
    html: layout(body),
  })
}
// ─── Google review request (to customer, after their session) ─────────────────
// Sent by /api/cron/review-requests 2-3 hours after a session ends. The link
// goes through /review/[bookingId] so clicks are recorded before redirecting to
// the Google review page (URL configured in Admin -> Settings -> Emails).

export async function sendReviewRequestEmail(opts: { to: string; customerName: string; bookingId: string }) {
  const firstName = opts.customerName?.split(' ')[0] || 'there'
  const link = `${APP_URL}/review/${opts.bookingId}`
  const html = layout(`
    <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">How was your session, ${firstName}?</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#bbb;">
      Thanks for shooting at Made Kulture today. If you had a good experience, a quick
      Google review makes a huge difference for a small studio &mdash; it takes about
      30 seconds and helps other creators find the space.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${ACCENT_COLOR};border-radius:4px;">
      <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#080808;text-decoration:none;">LEAVE A REVIEW</a>
    </td></tr></table>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#777;">
      Something not right about your visit? Just reply to this email or text us at (832) 408-1631 &mdash; we read everything.
    </p>
  `)
  return sendEmail('review-request', { from: FROM_EMAIL, to: opts.to, subject: 'How was your session at Made Kulture?', html })
}

export async function sendReviewFollowupEmail(opts: { to: string; customerName: string; bookingId: string }) {
  const firstName = opts.customerName?.split(' ')[0] || 'there'
  const link = `${APP_URL}/review/${opts.bookingId}`
  const html = layout(`
    <h2 style="margin:0 0 16px;font-size:20px;color:#fff;">One quick favor, ${firstName}?</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#bbb;">
      Hope your shots from Made Kulture came out great. If you have 30 seconds, a Google
      review from you would mean a lot &mdash; reviews are how most creators find us.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:${ACCENT_COLOR};border-radius:4px;">
      <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:13px;font-weight:700;letter-spacing:0.08em;color:#080808;text-decoration:none;">LEAVE A REVIEW</a>
    </td></tr></table>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#777;">
      This is the only reminder we&rsquo;ll send. Questions or feedback? Text (832) 408-1631.
    </p>
  `)
  return sendEmail('review-followup', { from: FROM_EMAIL, to: opts.to, subject: 'One quick favor?', html })
}

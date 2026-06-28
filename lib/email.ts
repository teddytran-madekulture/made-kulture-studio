import { Resend } from 'resend'
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

const FROM_EMAIL  = 'Made Kulture <bookings@madekulture.com>'
const REPLY_TO    = 'Teddy @ Made Kulture <teddytran@madekulture.com>'
const OWNER_EMAIL = 'teddytran@madekulture.com'
const BRAND_COLOR = '#1a1a1a'
const ACCENT_COLOR = '#d4a843'

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
}

export async function sendBookingConfirmation(data: BookingConfirmationData) {
  const { enabled, subject: customSubject } = await getTemplateSettings('booking_confirmation')
  if (!enabled) return null

  const { customerName, customerEmail, setName, date, startTime, endTime, totalAmount, bookingId, notes } = data

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;letter-spacing:0.05em;">Booking Confirmed</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#999;">You're all set, ${customerName}. Here are your details:</p>

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

    <!-- Manage Booking CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <a href="https://madekulture.com/account" style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 32px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;margin-right:8px;">Change / Cancel Booking</a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:10px;">
          <p style="margin:0;font-size:12px;color:#666;">Log in with your email to manage your booking</p>
        </td>
      </tr>
    </table>

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
            <li style="margin-bottom:6px;"><strong style="color:#ddd;">24–48 hours before:</strong> 50% refund (excluding fees).</li>
            <li><strong style="color:#ddd;">Less than 24 hours:</strong> No refund.</li>
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

  return getResend().emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
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
}

export async function sendNewBookingAlert(data: NewBookingAlertData) {
  const { enabled, subject: customSubject } = await getTemplateSettings('new_booking_alert')
  if (!enabled) return null

  const { customerName, customerEmail, customerPhone, setName, date, startTime, endTime, totalAmount, bookingId, source, notes } = data

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">New Booking</h1>
    <p style="margin:0 0 24px;font-size:13px;color:#888;">Source: <strong style="color:#bbb;">${source}</strong></p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:24px;">
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Customer</span><br/>
        <span style="font-size:15px;color:#fff;">${customerName}</span>
        <span style="font-size:13px;color:#888;"> — ${customerEmail}${customerPhone ? ' — ' + customerPhone : ''}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Set</span><br/>
        <span style="font-size:15px;color:#fff;">${setName}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date &amp; Time</span><br/>
        <span style="font-size:15px;color:#fff;">${date} &nbsp; ${startTime} – ${endTime}</span>
      </td></tr>
      <tr><td style="padding:6px 0;${notes ? 'border-bottom:1px solid #2a2a2a;' : ''}">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Amount</span><br/>
        <span style="font-size:18px;font-weight:700;color:${ACCENT_COLOR};">$${totalAmount.toFixed(2)}</span>
      </td></tr>
      ${notes ? `<tr><td style="padding:6px 0;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Notes</span><br/>
        <span style="font-size:14px;color:#ccc;">${notes}</span>
      </td></tr>` : ''}
    </table>

    <a href="https://made-kulture-studio.vercel.app/admin/dashboard" style="display:inline-block;background:${ACCENT_COLOR};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:12px 24px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">View in Dashboard</a>

    <p style="margin:20px 0 0;font-size:11px;color:#555;">Booking ID: ${bookingId}</p>
  `

  const defaultSubject = `New Booking — ${customerName} · ${setName} · ${date}`
  const subject = customSubject
    ? fillSubject(customSubject, { set: setName, date, customer: customerName })
    : defaultSubject

  return getResend().emails.send({
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

    <p style="margin:0 0 6px;font-size:13px;color:#888;">Want to rebook? Visit <a href="https://madekulture.com/book" style="color:${ACCENT_COLOR};text-decoration:none;">madekulture.com/book</a></p>
    <p style="margin:0;font-size:13px;color:#888;">Questions? Text <a href="sms:+18324081631" style="color:${ACCENT_COLOR};text-decoration:none;">(832) 408-1631</a></p>
  `

  const defaultSubject = `Booking Cancelled — ${setName} on ${date}`
  const subject = customSubject
    ? fillSubject(customSubject, { set: setName, date, customer: customerName })
    : defaultSubject

  return getResend().emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    to: customerEmail,
    subject,
    html: layout(body),
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function formatTimeLabel(hour: number): string {
  if (hour === 12) return '12pm'
  if (hour === 0) return '12am'
  return hour > 12 ? `${hour - 12}pm` : `${hour}am`
}

export function formatDateLabel(isoDate: string): string {
  // isoDate: YYYY-MM-DD
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
}

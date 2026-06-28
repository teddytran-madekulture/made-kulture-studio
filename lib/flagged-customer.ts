import { SupabaseClient } from '@supabase/supabase-js'
import twilio from 'twilio'

// Shared helper — call after any booking is created.
// Looks up the customer's flag status and fires SMS + email alerts to the studio owner
// if they're banned, have a warning status, or have ban/warning notes on file.

const OWNER_PHONE = '+18324081631'
const OWNER_EMAIL = 'teddytran@madekulture.com'

interface BookingContext {
  customerName:  string
  customerEmail: string
  setName:       string
  date:          string   // human-readable, e.g. "Sat, Jul 12"
  startTime:     string   // e.g. "2pm"
  endTime:       string   // e.g. "5pm"
}

export async function checkAndAlertFlaggedCustomer(
  supabase: SupabaseClient,
  customerId: string,
  booking: BookingContext
): Promise<void> {
  // Fetch customer + their most severe note tags
  const { data: customer } = await supabase
    .from('customers')
    .select(`
      id, name, status, banned,
      customer_notes ( tag )
    `)
    .eq('id', customerId)
    .single()

  if (!customer) return

  const noteTags: string[] = ((customer.customer_notes as any[]) ?? []).map((n: any) => n.tag)
  const hasBanNote     = noteTags.includes('ban')
  const hasWarningNote = noteTags.includes('warning')

  const isBanned  = customer.banned === true
  const isWarning = customer.status === 'warning'
  const isVip     = customer.status === 'vip'

  const flagged = isBanned || isWarning || hasBanNote || hasWarningNote

  if (!flagged) return

  // Build flag summary
  const flags: string[] = []
  if (isBanned)      flags.push('🚫 BANNED')
  if (isWarning)     flags.push('⚠️ Warning status')
  if (hasBanNote)    flags.push('📝 Has ban note')
  if (hasWarningNote) flags.push('📝 Has warning note')
  if (isVip)         flags.push('⭐ VIP')

  const flagLine = flags.join(' · ')

  // ── SMS alert ─────────────────────────────────────────────────────────────
  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )

    const smsBody = [
      `⚠️ FLAGGED CUSTOMER BOOKED`,
      ``,
      `${booking.customerName} (${booking.customerEmail})`,
      `${flagLine}`,
      ``,
      `📍 ${booking.setName}`,
      `📅 ${booking.date} · ${booking.startTime}–${booking.endTime}`,
      ``,
      `Review at made-kulture-studio.vercel.app/admin`,
    ].join('\n')

    await twilioClient.messages.create({
      body: smsBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   OWNER_PHONE,
    })
  } catch (err) {
    console.error('Flagged customer SMS error:', err)
  }

  // ── Email alert ───────────────────────────────────────────────────────────
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    const bgColor = isBanned ? '#7f1d1d' : '#78350f'
    const accentColor = isBanned ? '#ef4444' : '#f97316'
    const label = isBanned ? '🚫 BANNED CUSTOMER' : '⚠️ FLAGGED CUSTOMER'

    await resend.emails.send({
      from:    'Made Kulture <bookings@madekulture.com>',
      replyTo: OWNER_EMAIL,
      to:      OWNER_EMAIL,
      subject: `${label}: ${booking.customerName} just booked ${booking.setName}`,
      html: `
        <div style="font-family:Inter,sans-serif;background:#0a0a0a;color:#fff;padding:32px;max-width:600px;margin:0 auto;">
          <div style="background:${bgColor};border:1px solid ${accentColor};padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:18px;font-weight:700;color:${accentColor};margin-bottom:4px;">${label}</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.8);">${flagLine}</div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
            <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.45);font-size:12px;letter-spacing:0.1em;width:120px;">CUSTOMER</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;">${booking.customerName}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.45);font-size:12px;letter-spacing:0.1em;">EMAIL</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;">${booking.customerEmail}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.45);font-size:12px;letter-spacing:0.1em;">SET</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;">${booking.setName}</td></tr>
            <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.45);font-size:12px;letter-spacing:0.1em;">DATE</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;">${booking.date}</td></tr>
            <tr><td style="padding:10px 0;color:rgba(255,255,255,0.45);font-size:12px;letter-spacing:0.1em;">TIME</td>
                <td style="padding:10px 0;font-size:14px;">${booking.startTime} – ${booking.endTime}</td></tr>
          </table>

          <a href="https://made-kulture-studio.vercel.app/admin"
             style="display:inline-block;background:${accentColor};color:#000;padding:12px 28px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.1em;">
            VIEW IN ADMIN →
          </a>
        </div>
      `,
    })
  } catch (err) {
    console.error('Flagged customer email error:', err)
  }
}

import { NextRequest, NextResponse } from 'next/server'

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

const ACCENT_COLOR = '#d4a843'

function layout(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Made Kulture — Email Preview</title>
</head>
<body style="margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
          <tr>
            <td style="background:#000;padding:24px 32px;text-align:center;border-bottom:2px solid ${ACCENT_COLOR};">
              <span style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.15em;text-transform:uppercase;">MADE KULTURE</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
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

function previewConfirmation() {
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;letter-spacing:0.05em;">Booking Confirmed</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#999;">You're all set, Alex. Here are your details:</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Studio Set</span><br/>
        <span style="font-size:15px;color:#fff;font-weight:600;">Set A</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/>
        <span style="font-size:15px;color:#fff;font-weight:600;">Sat, Jul 19</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Time</span><br/>
        <span style="font-size:15px;color:#fff;font-weight:600;">1pm – 4pm</span>
      </td></tr>
      <tr><td style="padding:8px 0;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Total Paid</span><br/>
        <span style="font-size:15px;color:#fff;font-weight:600;">$120.00</span>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <a href="#" style="display:inline-block;background:#fff;color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 32px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">Change / Cancel Booking</a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:10px;">
          <p style="margin:0;font-size:12px;color:#666;">Log in with your email to manage your booking</p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:16px;">
      <tr><td>
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">When You Arrive</p>
        <ul style="margin:0;padding:0 0 0 16px;color:#bbb;font-size:13px;line-height:1.8;">
          <li style="margin-bottom:6px;">Drive to the <strong style="color:#ddd;">back of the building</strong> for entrance and street parking. If no spots are available, continue around the block to the front. Do not block neighbors' driveways.</li>
          <li style="margin-bottom:6px;">The building looks old and dilapidated — that's intentional. Use the <strong style="color:#ddd;">small doorway entrances</strong> to enter. If you have large items and the garage is closed, DM us on Instagram <a href="https://instagram.com/madekulture" style="color:${ACCENT_COLOR};text-decoration:none;">@madekulture</a>.</li>
          <li>If you know your set, go straight to it and get started. If you need help, check in and someone will show you to your spot.</li>
        </ul>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:16px;">
      <tr><td>
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">Before You Leave</p>
        <ul style="margin:0;padding:0 0 0 16px;color:#bbb;font-size:13px;line-height:1.8;">
          <li style="margin-bottom:6px;">Return all props to approximately where you found them.</li>
          <li style="margin-bottom:6px;">Leave your set in the same condition you arrived. <strong style="color:#ddd;">Excessive mess or trash may result in a cleaning fee.</strong></li>
          <li>Setup and breakdown must happen within your booked time — overages past 15 min are charged an additional hour.</li>
        </ul>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      <tr><td>
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:${ACCENT_COLOR};text-transform:uppercase;letter-spacing:0.1em;">Cancellation Policy</p>
        <ul style="margin:0;padding:0 0 0 16px;color:#bbb;font-size:13px;line-height:1.8;">
          <li style="margin-bottom:6px;"><strong style="color:#ddd;">48+ hours before:</strong> Full refund.</li>
          <li style="margin-bottom:6px;"><strong style="color:#ddd;">24–48 hours before:</strong> 50% refund (excluding fees).</li>
          <li><strong style="color:#ddd;">Less than 24 hours:</strong> No refund.</li>
        </ul>
        <p style="margin:10px 0 0;font-size:12px;color:#666;">To cancel or reschedule, use the button above or text us at (832) 408-1631.</p>
      </td></tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#888;">📍 <a href="https://maps.google.com/?q=4825+Gulf+Freeway+Houston+TX+77023" style="color:${ACCENT_COLOR};text-decoration:none;">4825 Gulf Freeway, Houston TX 77023</a></p>
    <p style="margin:0 0 24px;font-size:13px;color:#888;">Questions? Text us at <a href="sms:+18324081631" style="color:${ACCENT_COLOR};text-decoration:none;">(832) 408-1631</a></p>
    <p style="margin:0;font-size:11px;color:#555;">Booking reference: #A1B2C3D4</p>
  `
  return layout(body)
}

function previewAlert() {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">New Booking</h1>
    <p style="margin:0 0 24px;font-size:13px;color:#888;">Source: <strong style="color:#bbb;">website</strong></p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:24px;">
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Customer</span><br/>
        <span style="font-size:15px;color:#fff;">Alex Johnson</span>
        <span style="font-size:13px;color:#888;"> — alex@example.com — (713) 555-0100</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Set</span><br/>
        <span style="font-size:15px;color:#fff;">Set A</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date &amp; Time</span><br/>
        <span style="font-size:15px;color:#fff;">Sat, Jul 19 &nbsp; 1pm – 4pm</span>
      </td></tr>
      <tr><td style="padding:6px 0;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Amount</span><br/>
        <span style="font-size:18px;font-weight:700;color:${ACCENT_COLOR};">$120.00</span>
      </td></tr>
    </table>

    <a href="#" style="display:inline-block;background:${ACCENT_COLOR};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:12px 24px;border-radius:4px;letter-spacing:0.05em;text-transform:uppercase;">View in Dashboard</a>

    <p style="margin:20px 0 0;font-size:11px;color:#555;">Booking ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890</p>
  `
  return layout(body)
}

function previewCancellation() {
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#fff;">Booking Cancelled</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#999;">Hi Alex, your booking has been cancelled.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:6px;padding:20px 24px;margin-bottom:28px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Set</span><br/>
        <span style="font-size:15px;color:#fff;">Set A</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/>
        <span style="font-size:15px;color:#fff;">Sat, Jul 19</span>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Time</span><br/>
        <span style="font-size:15px;color:#fff;">1pm – 4pm</span>
      </td></tr>
      <tr><td style="padding:8px 0;">
        <span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;">Refund</span><br/>
        <span style="font-size:15px;color:#4ade80;">$120.00 will be refunded within 5–10 business days</span>
      </td></tr>
    </table>

    <p style="margin:0 0 6px;font-size:13px;color:#888;">Want to rebook? Visit <a href="https://madekulture.com/book" style="color:${ACCENT_COLOR};text-decoration:none;">madekulture.com/book</a></p>
    <p style="margin:0;font-size:13px;color:#888;">Questions? Text <a href="sms:+18324081631" style="color:${ACCENT_COLOR};text-decoration:none;">(832) 408-1631</a></p>
  `
  return layout(body)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { key: string } }
) {
  if (!isAuthed(req)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { key } = params
  let html: string

  if (key === 'booking_confirmation') html = previewConfirmation()
  else if (key === 'new_booking_alert') html = previewAlert()
  else if (key === 'cancellation') html = previewCancellation()
  else return new NextResponse('Unknown template key', { status: 404 })

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

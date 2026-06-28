import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { generateMagicToken, consumeMagicToken, setAdminCookie } from '@/lib/admin-auth'

const ADMIN_EMAIL = 'teddytran@madekulture.com'
const ACCENT      = '#d4a843'

// POST /api/admin/auth/magic — generate and email a magic sign-in link
export async function POST(req: NextRequest) {
  const { origin } = new URL(req.url)
  const token    = generateMagicToken()
  const magicUrl = `${origin}/api/admin/auth/magic?token=${token}`

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#111;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
        <tr><td style="background:#000;padding:20px 32px;text-align:center;border-bottom:2px solid ${ACCENT};">
          <span style="font-family:'Courier New',monospace;font-size:20px;font-weight:700;color:#fff;letter-spacing:0.15em;text-transform:uppercase;">MADE KULTURE</span>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">Admin Sign-In Link</p>
          <p style="margin:0 0 28px;font-size:14px;color:#999;">Click the button below to sign in to the admin dashboard. This link expires in <strong style="color:#ddd;">30 minutes</strong> and can only be used once.</p>
          <a href="${magicUrl}" style="display:inline-block;background:${ACCENT};color:#000;font-weight:700;font-size:13px;text-decoration:none;padding:14px 32px;border-radius:4px;letter-spacing:0.08em;text-transform:uppercase;">Sign In to Dashboard ↗</a>
          <p style="margin:28px 0 0;font-size:12px;color:#555;">If you didn't request this, you can safely ignore this email. Your account remains secure.</p>
        </td></tr>
        <tr><td style="background:#111;padding:16px 32px;text-align:center;border-top:1px solid #333;">
          <p style="margin:0;font-size:11px;color:#555;">Made Kulture — Admin Access</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    'Made Kulture <bookings@madekulture.com>',
      to:      ADMIN_EMAIL,
      subject: 'Your Admin Sign-In Link — Made Kulture',
      html,
    })
  } catch (err) {
    console.error('Magic link email error:', err)
    return NextResponse.json({ error: 'Failed to send email.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// GET /api/admin/auth/magic?token=xxx — validate and log in
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const token = searchParams.get('token') ?? ''

  if (!consumeMagicToken(token)) {
    return NextResponse.redirect(
      `${origin}/admin?error=${encodeURIComponent('This link has expired or already been used.')}`
    )
  }

  return setAdminCookie(NextResponse.redirect(`${origin}/admin/dashboard`))
}

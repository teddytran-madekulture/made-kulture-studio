import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { findActiveStaffByEmail } from '@/lib/staff-auth'
import { sendSimpleEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// POST /api/staff/auth/forgot  { email }
// Emails a one-time, 30-minute sign-in link to the staff member IF the email
// matches an active account. Always returns success (no email enumeration).
export async function POST(req: NextRequest) {
  const { origin } = new URL(req.url)
  let email = ''
  try { email = (await req.json())?.email ?? '' } catch { /* ignore */ }
  email = String(email).trim().toLowerCase()

  if (email) {
    try {
      const staff = await findActiveStaffByEmail(email)
      if (staff?.id && staff.email) {
        const raw = randomBytes(32).toString('hex')
        await supabaseAdmin().from('staff_password_resets').insert({
          staff_id: staff.id,
          token_hash: sha256(raw),
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        })
        const link = `${origin}/api/staff/auth/magic?token=${raw}`
        await sendSimpleEmail({
          to: staff.email,
          subject: 'Staff sign-in link — Made Kulture',
          heading: 'Staff sign-in link',
          paragraphs: [
            `Use the button below to sign in to the Made Kulture staff console. This link expires in <strong style="color:#fff;">30 minutes</strong> and can be used once.`,
            `Once you're in, open your own row in Staff and hit <strong style="color:#fff;">Reset PW</strong> to set a new password.`,
            `If you didn't request this, you can safely ignore this email — your account stays secure.`,
          ],
          ctaText: 'Sign in to staff console', ctaUrl: link, label: 'staff_reset',
        })
      }
    } catch (e) {
      console.error('[staff forgot] error (non-fatal):', e)
    }
  }

  return NextResponse.json({ success: true })
}

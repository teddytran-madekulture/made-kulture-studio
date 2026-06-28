import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, clearRateLimit, setAdminCookie } from '@/lib/admin-auth'

// POST /api/admin/auth — password login
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const { allowed, remaining, retryAfterMs } = checkRateLimit(ip)
  if (!allowed) {
    const mins = Math.ceil(retryAfterMs / 60_000)
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` },
      { status: 429 }
    )
  }

  const { password } = await req.json()
  if (password !== process.env.ADMIN_PASSWORD) {
    const msg = remaining > 0
      ? `Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
      : 'Incorrect password.'
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  clearRateLimit(ip)
  return setAdminCookie(NextResponse.json({ success: true }))
}

// DELETE /api/admin/auth — sign out
export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.delete('admin_auth')
  return res
}

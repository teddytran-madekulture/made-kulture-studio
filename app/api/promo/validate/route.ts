import { NextRequest, NextResponse } from 'next/server'
import { validatePromo } from '@/lib/promo'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// POST /api/promo/validate  { code, subtotalCents, email }
// Live preview at checkout. The booking route re-validates authoritatively before
// charging — this is just so the customer sees the discount before submitting.
export async function POST(req: NextRequest) {
  let body: { code?: string; subtotalCents?: number; email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 }) }

  // 2026-10-06: no limit here = a code-guessing oracle. Generous for a real
  // customer retyping a code, hopeless for a loop.
  const rl = await rateLimit(`promo:${clientIp(req)}`, 30, 10 * 60_000, { failOpen: true })
  if (!rl.allowed) return NextResponse.json({ ok: false, error: rl.message }, { status: 429 })

  const subtotalCents = Math.max(0, Math.round(Number(body.subtotalCents) || 0))
  // Invite-only codes check the SIGNED-IN account, never the typed email.
  const { data: { user } } = await createClient().auth.getUser()
  const r = await validatePromo(body.code ?? '', { subtotalCents, email: body.email, sessionEmail: user?.email ?? null })
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error })
  return NextResponse.json({ ok: true, code: r.code, discountCents: r.discountCents, label: r.label })
}

// POST /api/nomad/interest — someone raises their hand for Nomad.
//
// Public but UNLISTED: /nomad is not in nav or the sitemap. Nothing here takes
// money or reserves a place. It records the interest and pushes Teddy.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendOwnerPush } from '@/lib/push'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { normEmail } from '@/lib/customer-email'

export const dynamic = 'force-dynamic'

const ROLES = new Set(['Photographer', 'Model', 'Makeup artist', 'Hair stylist', 'Wardrobe stylist', 'Videographer', 'Other'])
const TRIPS = new Set(['1–2 a year', '3–4 a year', '5+ a year', 'Not sure yet'])

export async function POST(req: NextRequest) {
  // A public form: fail OPEN so a DB hiccup in the limiter never takes it down.
  const rl = await rateLimit(`nomad:${clientIp(req)}`, 5, 60 * 60_000, {
    failOpen: true,
    message: 'Too many submissions. Please try again later.',
  })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad submission' }, { status: 400 })
  }
  const s = (k: string, max: number) => String(body[k] ?? '').trim().slice(0, max)

  // Honeypot: a hidden field real people never fill.
  if (s('website', 50)) return NextResponse.json({ success: true })

  const name = s('name', 120)
  const email = normEmail(s('email', 200))
  const role = s('role', 40)
  if (!name || !email || !role) {
    return NextResponse.json({ error: 'Name, email and what you do are required.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400 })
  }
  if (!ROLES.has(role)) return NextResponse.json({ error: 'Pick what you do from the list.' }, { status: 400 })
  const trips = s('trips_per_year', 30)

  const row = {
    name,
    email,
    role,
    phone: s('phone', 40) || null,
    instagram: s('instagram', 80).replace(/^@/, '') || null,
    based_in: s('based_in', 120) || null,
    portfolio_url: s('portfolio_url', 300) || null,
    trips_per_year: TRIPS.has(trips) ? trips : null,
    notes: s('notes', 2000) || null,
  }

  const { data, error } = await supabaseAdmin().from('nomad_interest').insert(row).select('id').single()
  // supabase-js never throws on a Postgres error — check it or this reports
  // success while nothing was saved.
  if (error || !data) {
    console.error('[nomad] insert failed:', error)
    return NextResponse.json({ error: 'Could not save that. Please try again.' }, { status: 500 })
  }

  await sendOwnerPush({
    title: 'Nomad interest',
    body: `${name} · ${role}${row.based_in ? ` · ${row.based_in}` : ''}${row.instagram ? ` · @${row.instagram}` : ''}`,
    url: '/admin/notifications',
    tag: `nomad-${data.id}`,
    meta: { kind: 'nomad_interest', id: data.id },
  }).catch(() => {})

  return NextResponse.json({ success: true })
}

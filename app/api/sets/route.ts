import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public, read-only catalog of active sets for the customer /sets and /book
// pages. No auth — only active sets and display-safe fields are exposed.
// Force no-store on every Supabase request so Next.js never serves a cached
// row — the buyout rate and set edits must always reflect the live DB.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } }
)

const PUBLIC_COLUMNS =
  'id, slug, name, description, rate_per_hour, min_hours, capacity, features, photo_url, dimensions, category, accent_gradient, sort_order'

export const dynamic = 'force-dynamic'

// GET /api/sets — active sets only, ordered for display, plus the
// admin-editable full-warehouse buyout flat rate.
export async function GET() {
  const { data, error } = await supabase
    .from('sets')
    .select(PUBLIC_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pull the buyout rate + guest pricing knobs in one shot (key/value settings).
  const { data: settingRows } = await supabase
    .from('studio_settings')
    .select('key, value')
    .in('key', [
      'buyout_rate',
      'guest_capacity_per_set',
      'per_person_fee',
      'max_guests_per_set',
      'max_sets_before_buyout',
      'guest_penalty_per_head',
      'guest_surcharge_per_hour',
    ])
  const settings: Record<string, string> = {}
  for (const r of settingRows ?? []) settings[r.key] = r.value

  const buyoutRate = Number(settings['buyout_rate']) || 400
  const guestPricing = {
    capacityPerSet:     Number(settings['guest_capacity_per_set']) || 5,
    perPersonFee:       Number(settings['per_person_fee'])         || 10,
    maxGuestsPerSet:    Number(settings['max_guests_per_set'])     || 7,
    maxSetsBeforeBuyout:Number(settings['max_sets_before_buyout']) || 3,
    penaltyPerHead:     Number(settings['guest_penalty_per_head']) || 50,
  }

  const guestSurchargePerHour = settings['guest_surcharge_per_hour'] != null
    ? Number(settings['guest_surcharge_per_hour']) : 10

  return NextResponse.json({ sets: data ?? [], buyoutRate, guestPricing, guestSurchargePerHour })
}

import { NextRequest, NextResponse } from 'next/server'
import { bookingHourToISO } from '@/lib/booking-times'
import { createClient } from '@supabase/supabase-js'
import { getReservedQuantities } from '@/lib/equipment-availability'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/equipment
//   (no params)                     → catalog of available gear (total quantities)
//   ?date=YYYY-MM-DD&start=H&end=H  → same, but with units actually free for that window
//
// Public endpoint (customer gear page). Only returns available items.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date  = searchParams.get('date')
  const start = searchParams.get('start')
  const end   = searchParams.get('end')

  const { data, error } = await supabase
    .from('equipment')
    .select('id, name, rate, category, quantity, description, image_url, gallery, sort_order, allow_offsite')
    .eq('is_available', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let reserved: Record<string, number> = {}
  // If a concrete window was provided, compute true availability for it.
  if (date && start && end) {
    const toISO = (h: string) => bookingHourToISO(date, Number(h))
    try {
      reserved = await getReservedQuantities(supabase, toISO(start), toISO(end))
    } catch { /* fall back to total quantities */ }
  }

  const equipment = (data ?? []).map(e => ({
    ...e,
    available: date && start && end
      ? Math.max(0, (e.quantity ?? 0) - (reserved[e.id] ?? 0))
      : (e.quantity ?? 0),
  }))

  return NextResponse.json({ equipment })
}

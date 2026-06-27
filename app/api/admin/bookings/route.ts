import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// ─── GET /api/admin/bookings ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, start_time, end_time, status, total_amount, notes, source, created_at,
      square_payment_id,
      sets ( name ),
      customers ( name, email, phone )
    `)
    .order('start_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookings: data })
}

// ─── POST /api/admin/bookings — manual booking ────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { setSlug, date, startHour, endHour, name, email, phone, notes, totalAmount } = body

  const SLUG_TO_NAME: Record<string, string> = {
    'set-a': 'Set A', 'set-b': 'Set B', 'set-c': 'Set C', 'set-d': 'Set D',
    'concrete': 'Concrete', 'vintage': 'Vintage', 'cottage': 'Cottage',
    'watering-hole': 'The Watering Hole', 'studio-one': 'Studio One',
    'studio': 'Full Studio Takeover',
  }

  // Upsert customer
  const { data: customerData } = await supabase
    .from('customers')
    .upsert({ email, name, phone }, { onConflict: 'email' })
    .select('id')
    .single()

  // Get set ID
  let setId: string | null = null
  if (setSlug && setSlug !== 'studio') {
    const setName = SLUG_TO_NAME[setSlug]
    const { data: setData } = await supabase
      .from('sets')
      .select('id')
      .eq('name', setName)
      .single()
    setId = setData?.id ?? null
  }

  const startISO = `${date}T${String(startHour).padStart(2, '0')}:00:00-05:00`
  const endISO   = `${date}T${String(endHour).padStart(2, '0')}:00:00-05:00`

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      set_id:       setId,
      customer_id:  customerData?.id,
      start_time:   startISO,
      end_time:     endISO,
      status:       'confirmed',
      total_amount: totalAmount,
      base_amount:  totalAmount,
      source:       'manual',
      notes,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, bookingId: booking?.id })
}

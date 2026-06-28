import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


// Default settings — returned if the DB row doesn't exist yet
const DEFAULTS: Record<string, { label: string; description: string; defaultSubject: string }> = {
  booking_confirmation: {
    label:         'Booking Confirmation',
    description:   'Sent to the customer right after they complete a booking.',
    defaultSubject: 'Booking Confirmed — {set} on {date}',
  },
  new_booking_alert: {
    label:         'New Booking Alert',
    description:   'Sent to you (the owner) whenever a new booking is created.',
    defaultSubject: 'New Booking — {customer} · {set} · {date}',
  },
  cancellation: {
    label:         'Booking Cancellation',
    description:   'Sent to the customer when their booking is cancelled.',
    defaultSubject: 'Booking Cancelled — {set} on {date}',
  },
}

// GET /api/admin/email-settings
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('email_templates')
    .select('key, enabled, subject')

  if (error && error.code !== '42P01') { // 42P01 = table doesn't exist yet
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Merge DB values with defaults
  const rows = data || []
  const settings = Object.entries(DEFAULTS).map(([key, meta]) => {
    const row = rows.find(r => r.key === key)
    return {
      key,
      label:          meta.label,
      description:    meta.description,
      defaultSubject: meta.defaultSubject,
      enabled:        row ? row.enabled : true,
      subject:        row?.subject ?? null,   // null = use default
    }
  })

  return NextResponse.json({ settings })
}

// PATCH /api/admin/email-settings
// Body: { key: string, enabled?: boolean, subject?: string | null }
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key, enabled, subject } = await req.json()

  if (!DEFAULTS[key]) {
    return NextResponse.json({ error: 'Unknown template key' }, { status: 400 })
  }

  const { error } = await supabase
    .from('email_templates')
    .upsert({ key, enabled, subject, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) {
    // Table might not exist — return friendly message
    if (error.code === '42P01') {
      return NextResponse.json({ error: 'Run the email_templates migration first (see schema.sql)' }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
